-- Copy of supabase/migrations/20261123084500_nhs_5_five_case.sql for review. Apply the migration
-- file (not this copy) to production after review; nothing in it is destructive.

-- NHS-5 Five Case Model business cases, part 1: schema, rules and approval routes
-- (docs/nhs-module-plan.md § NHS-5, docs/sql/nhs-5-five-case.sql). Written by an unattended lane B
-- run on 23/11/2026: tested on the local Postgres only, NOT applied to production. Nothing here is
-- destructive (no drop, delete or truncate) and no shared function is replaced: only
-- public.start_business_case_version (business cases only) is replaced, with its previous body
-- kept and the new copies added.
--
-- Design
-- - Module five_case. Organisations with it off see no change: every new column has a default that
--   behaves as before (template set 'standard', stage 'single', options short-listed) and the new
--   tables can only be written while the module is on.
-- - Template sets: business_case_templates gains set_key (default 'standard') and case_group
--   (strategic | economic | commercial | financial | management). Switching the module on seeds the
--   'five_case' set (keys fc_*, so the existing (organisation, key) uniqueness is untouched); set
--   names are shown from the app (Standard, Five Case Model). A case picks its set when it is created
--   (business_cases.template_set); the first version takes its sections from that set.
-- - Stages: business_case_versions.stage single | soc | obc | fbc. A new stage starts as a new
--   version that carries the content forward (start_business_case_stage). Once a stage is approved
--   the case can't go back to an earlier one, and can move at most one stage beyond the highest
--   approved stage.
-- - Strategic case: business_case_objectives (spending objectives and critical success factors).
-- - Economic case: options gain list_stage (long | short), a short-list note and an optimism bias %;
--   business_case_option_years holds capital, revenue, cash and non-cash benefit by year for the
--   appraisal aid (NPV / NPSV / BCR are worked out on screen from these, see services). Versions
--   gain discount_rate (default 3.5 %), appraisal_years and price_base_year. The preferred option
--   must be short-listed.
-- - Approval routes by stage: organisations.settings.fiveCase.approvalRoutes
--   {stage: [{name, governanceRole, minValue}]}, edited through set_business_case_approval_routes
--   (admins), seeded per pack when the module is switched on. Submitting a version of an
--   organisation with the module on opens an approval gate (approval_gates gate_type
--   'business_case', entity business_case_version) with one step per route step whose minValue
--   the version's whole-life cost reaches. Each step names a governance role, so only its holder
--   (or deputy) can decide it through decide_approval_step (NHS-0). When the gate is approved or
--   rejected the version follows, and an approval supersedes earlier approved versions of the same
--   stage. Business case gates and their steps can't be created, edited or deleted by a direct
--   client write.

-- ---------------------------------------------------------------------------------------------
-- 1. Template sets
-- ---------------------------------------------------------------------------------------------

alter table public.business_case_templates
  add column set_key text not null default 'standard' check (set_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  add column case_group text check (case_group in ('strategic', 'economic', 'commercial', 'financial', 'management'));
create index business_case_templates_set_idx on public.business_case_templates (organisation_id, set_key, sort_order);

comment on column public.business_case_templates.set_key is
  'NHS-5: the template set this section belongs to (standard, five_case, …).';
comment on column public.business_case_templates.case_group is
  'NHS-5: which of the five cases the section sits under (Five Case Model sets only).';

alter table public.business_cases
  add column template_set text not null default 'standard' check (template_set ~ '^[a-z][a-z0-9_]{1,40}$');

comment on column public.business_cases.template_set is
  'NHS-5: the template set the first version''s sections come from. Chosen before the first version starts.';

create function private.business_case_template_set_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.in_purge() then return new; end if;
  if tg_op = 'UPDATE' and new.template_set is not distinct from old.template_set then
    return new;
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.business_case_versions v where v.business_case_id = new.id) then
    raise exception 'The template set is chosen before the first version starts.' using errcode = '22023';
  end if;
  if new.template_set <> 'standard' then
    perform private.assert_module_enabled(new.organisation_id, 'five_case');
    if not exists (select 1 from public.business_case_templates t
                   where t.organisation_id = new.organisation_id and t.set_key = new.template_set and t.is_active) then
      raise exception 'Template set % has no sections.', new.template_set using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.business_case_template_set_check() from public, anon, authenticated;
create trigger business_cases_05_template_set before insert or update of template_set on public.business_cases
  for each row execute function private.business_case_template_set_check();

-- Five Case Model sections, written for ORMO (not copied from HM Treasury guidance). Editable
-- per organisation in Settings like the standard set; never overwritten once seeded.
create function private.five_case_templates()
returns table (key text, case_group text, title text, guidance text, is_required boolean, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('fc_strategic_context', 'strategic', 'Strategic context',
     'Who the organisation is, what it is responsible for, and the strategies, plans and policies this proposal supports.', true, 101),
    ('fc_case_for_change', 'strategic', 'Case for change',
     'How things work today, what needs to change and why now. List the spending objectives and critical success factors in the structured lists below.', true, 102),
    ('fc_scope_constraints', 'strategic', 'Scope, benefits, risks, constraints and dependencies',
     'What is in and out of scope, the main benefits and risks, and anything outside the project it depends on.', false, 103),
    ('fc_options_framework', 'economic', 'Long list of options',
     'The range of ways the objectives could be met (scope, solution, delivery, implementation and funding) and why options were discounted or carried forward.', true, 201),
    ('fc_shortlist_appraisal', 'economic', 'Short list and appraisal',
     'The short-listed options, including business as usual or do minimum, with their costs, benefits, risks and the appraisal results.', false, 202),
    ('fc_preferred_option', 'economic', 'Preferred option and value for money',
     'Which option offers best value for money and why, including the sensitivity of the result to the main assumptions.', false, 203),
    ('fc_procurement', 'commercial', 'Procurement route',
     'How the goods or services will be bought, the route to market and the timetable.', true, 301),
    ('fc_contract_risk', 'commercial', 'Contract, payment and risk allocation',
     'The contract type, payment mechanism and how risks are shared with suppliers.', false, 302),
    ('fc_affordability', 'financial', 'Affordability and funding',
     'Capital and revenue requirements by year, where the money comes from and any funding gap.', true, 401),
    ('fc_financial_impact', 'financial', 'Impact on the financial position',
     'The effect on income and expenditure, the balance sheet and prices or charges.', false, 402),
    ('fc_delivery_arrangements', 'management', 'Delivery and governance arrangements',
     'The project or programme structure, roles, governance, plan and key milestones.', true, 501),
    ('fc_benefits_realisation', 'management', 'Benefits realisation',
     'How benefits will be tracked and who owns them.', false, 502),
    ('fc_risk_management', 'management', 'Risk management',
     'How risks and issues will be managed and escalated.', false, 503),
    ('fc_post_evaluation', 'management', 'Post-project evaluation',
     'When and how the project and its benefits will be reviewed after delivery.', false, 504)
  ) as t(key, case_group, title, guidance, is_required, sort_order);
$$;
revoke execute on function private.five_case_templates() from public, anon;

-- Default approval route per stage and pack. Step names describe the body or person approving;
-- governanceRole is who records the decision (NHS-0 governance roles); minValue applies the step
-- only when the version's whole-life cost reaches it (delegated limits). Seeded once, editable.
create function private.five_case_default_routes(p_pack text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_pack = 'nhs' then jsonb_build_object(
    'soc', jsonb_build_array(
      jsonb_build_object('name', 'Director of Finance', 'governanceRole', 'director_of_finance', 'minValue', null),
      jsonb_build_object('name', 'Executive Management Team (recorded by Head of PMO)', 'governanceRole', 'head_of_pmo', 'minValue', null)),
    'obc', jsonb_build_array(
      jsonb_build_object('name', 'Director of Finance', 'governanceRole', 'director_of_finance', 'minValue', null),
      jsonb_build_object('name', 'Trust Board (recorded by Head of PMO)', 'governanceRole', 'head_of_pmo', 'minValue', null),
      jsonb_build_object('name', 'ICB (recorded by Head of PMO)', 'governanceRole', 'head_of_pmo', 'minValue', 15000000)),
    'fbc', jsonb_build_array(
      jsonb_build_object('name', 'Director of Finance', 'governanceRole', 'director_of_finance', 'minValue', null),
      jsonb_build_object('name', 'Trust Board (recorded by Head of PMO)', 'governanceRole', 'head_of_pmo', 'minValue', null),
      jsonb_build_object('name', 'ICB (recorded by Head of PMO)', 'governanceRole', 'head_of_pmo', 'minValue', 15000000),
      jsonb_build_object('name', 'NHS England (recorded by Head of PMO)', 'governanceRole', 'head_of_pmo', 'minValue', 50000000)),
    'single', jsonb_build_array(
      jsonb_build_object('name', 'Director of Finance', 'governanceRole', 'director_of_finance', 'minValue', null),
      jsonb_build_object('name', 'Trust Board (recorded by Head of PMO)', 'governanceRole', 'head_of_pmo', 'minValue', 1000000)))
  else jsonb_build_object(
    'soc', jsonb_build_array(
      jsonb_build_object('name', 'Executive sponsor', 'governanceRole', 'executive_sponsor', 'minValue', null)),
    'obc', jsonb_build_array(
      jsonb_build_object('name', 'Finance lead', 'governanceRole', 'finance_lead', 'minValue', null),
      jsonb_build_object('name', 'Investment board (recorded by Head of PMO)', 'governanceRole', 'head_of_pmo', 'minValue', null)),
    'fbc', jsonb_build_array(
      jsonb_build_object('name', 'Finance lead', 'governanceRole', 'finance_lead', 'minValue', null),
      jsonb_build_object('name', 'Investment board (recorded by Head of PMO)', 'governanceRole', 'head_of_pmo', 'minValue', null)),
    'single', jsonb_build_array(
      jsonb_build_object('name', 'Executive sponsor', 'governanceRole', 'executive_sponsor', 'minValue', null),
      jsonb_build_object('name', 'Finance lead', 'governanceRole', 'finance_lead', 'minValue', null)))
  end;
$$;
revoke execute on function private.five_case_default_routes(text) from public, anon;

-- Seeds the five_case set and (when none is stored) the approval routes. Runs as
-- a BEFORE UPDATE trigger on organisations when the module turns on, whichever route switched it
-- (set_organisation_module, apply_sector_pack, the settings document), so it needs no change to
-- the shared private.seed_module_defaults. Only inserts what is missing; never overwrites.
create function private.organisations_seed_five_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack text := coalesce(new.settings ->> 'pack', 'general');
begin
  if private.in_purge() then return new; end if;
  if coalesce(new.settings -> 'modules' -> 'five_case' = 'true'::jsonb, false)
     and not coalesce(old.settings -> 'modules' -> 'five_case' = 'true'::jsonb, false) then
    insert into public.business_case_templates (organisation_id, key, title, guidance, is_required, sort_order, set_key, case_group)
    select new.id, t.key, t.title, t.guidance, t.is_required, t.sort_order, 'five_case', t.case_group
    from private.five_case_templates() t
    on conflict (organisation_id, key) do nothing;

    if new.settings -> 'fiveCase' -> 'approvalRoutes' is null then
      new.settings := jsonb_set(new.settings, '{fiveCase}',
        coalesce(new.settings -> 'fiveCase', '{}'::jsonb)
          || jsonb_build_object('approvalRoutes', private.five_case_default_routes(v_pack)));
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.organisations_seed_five_case() from public, anon, authenticated;
create trigger organisations_15_seed_five_case before update of settings on public.organisations
  for each row
  when ((old.settings -> 'modules' -> 'five_case') is distinct from (new.settings -> 'modules' -> 'five_case'))
  execute function private.organisations_seed_five_case();

-- ---------------------------------------------------------------------------------------------
-- 2. Stages and appraisal settings on versions; long and short lists on options
-- ---------------------------------------------------------------------------------------------

alter table public.business_case_versions
  add column stage text not null default 'single' check (stage in ('single', 'soc', 'obc', 'fbc')),
  add column discount_rate numeric(5,2) not null default 3.5 check (discount_rate >= 0 and discount_rate <= 20),
  add column appraisal_years smallint not null default 10 check (appraisal_years between 1 and 60),
  add column price_base_year smallint check (price_base_year between 1990 and 2100);

comment on column public.business_case_versions.stage is
  'NHS-5: single (one-stage case) or soc / obc / fbc (Strategic Outline, Outline, Full Business Case).';

alter table public.business_case_options
  add column list_stage text not null default 'short' check (list_stage in ('long', 'short')),
  add column shortlist_note text check (length(shortlist_note) <= 4000),
  add column optimism_bias_pct numeric(5,2) check (optimism_bias_pct >= 0 and optimism_bias_pct <= 200),
  add constraint business_case_options_preferred_shortlisted check (not (is_preferred and list_stage = 'long'));

create function private.business_case_stage_rank(p_stage text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_stage when 'soc' then 1 when 'obc' then 2 when 'fbc' then 3 else 0 end;
$$;
revoke execute on function private.business_case_stage_rank(text) from public, anon;

create function private.business_case_stage_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_single boolean;
  v_label text := case new.stage when 'soc' then 'Strategic Outline Case' when 'obc' then 'Outline Business Case'
                                 when 'fbc' then 'Full Business Case' else 'single-stage case' end;
begin
  if private.in_purge() then return new; end if;
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then
    return new;
  end if;
  -- A new version carrying the previous version's stage forward needs no check (and works with
  -- the module switched off, so a staged case can still be revised).
  if tg_op = 'INSERT' and new.stage = coalesce((select v.stage from public.business_case_versions v
                                                where v.business_case_id = new.business_case_id
                                                order by v.version desc limit 1), 'single') then
    return new;
  end if;
  if new.stage <> 'single' then
    perform private.assert_module_enabled(new.organisation_id, 'five_case');
  end if;
  select max(private.business_case_stage_rank(v.stage)) filter (where v.stage <> 'single'),
         bool_or(v.stage = 'single')
    into v_max, v_single
  from public.business_case_versions v
  where v.business_case_id = new.business_case_id and v.id <> new.id and v.status in ('approved', 'superseded');
  if new.stage = 'single' and v_max is not null then
    raise exception 'This case is following the SOC, OBC and FBC stages, so a version can''t be a single-stage case.'
      using errcode = '22023', hint = 'business_case_stage';
  end if;
  if new.stage <> 'single' and coalesce(v_single, false) then
    raise exception 'This case was approved as a single-stage case.' using errcode = '22023', hint = 'business_case_stage';
  end if;
  if new.stage <> 'single' and v_max is not null then
    if private.business_case_stage_rank(new.stage) < v_max then
      raise exception 'A later stage is already approved, so this version can''t be a %.', v_label
        using errcode = '22023', hint = 'business_case_stage';
    end if;
    if private.business_case_stage_rank(new.stage) > v_max + 1 then
      raise exception 'Get the previous stage approved before starting a %.', v_label
        using errcode = '22023', hint = 'business_case_stage';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.business_case_stage_check() from public, anon, authenticated;
create trigger business_case_versions_12_stage before insert or update of stage on public.business_case_versions
  for each row execute function private.business_case_stage_check();

-- ---------------------------------------------------------------------------------------------
-- 3. New version children: objectives and appraisal years
-- ---------------------------------------------------------------------------------------------

create table public.business_case_objectives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  version_id uuid not null,
  kind text not null check (kind in ('spending_objective', 'critical_success_factor')),
  title text not null check (length(btrim(title)) between 1 and 300),
  description text check (length(description) <= 4000),
  measure text check (length(measure) <= 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (version_id, workspace_id) references public.business_case_versions (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index business_case_objectives_version_idx on public.business_case_objectives (version_id, workspace_id);
create index business_case_objectives_workspace_idx on public.business_case_objectives (workspace_id, organisation_id);
create index business_case_objectives_organisation_idx on public.business_case_objectives (organisation_id);
create index business_case_objectives_created_by_idx on public.business_case_objectives (created_by);

create table public.business_case_option_years (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  version_id uuid not null,
  option_id uuid not null,
  year_index smallint not null check (year_index between 0 and 60),
  capital_cost numeric(14,2) not null default 0,
  revenue_cost numeric(14,2) not null default 0,
  cash_benefit numeric(14,2) not null default 0,
  non_cash_benefit numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (option_id, year_index),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (version_id, workspace_id) references public.business_case_versions (id, workspace_id) on delete cascade,
  foreign key (option_id, version_id) references public.business_case_options (id, version_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index business_case_option_years_version_idx on public.business_case_option_years (version_id, workspace_id);
create index business_case_option_years_option_idx on public.business_case_option_years (option_id, version_id);
create index business_case_option_years_workspace_idx on public.business_case_option_years (workspace_id, organisation_id);
create index business_case_option_years_organisation_idx on public.business_case_option_years (organisation_id);
create index business_case_option_years_created_by_idx on public.business_case_option_years (created_by);

create trigger business_case_objectives_00_tenant_guard before insert or update on public.business_case_objectives
  for each row execute function private.tenant_guard('version_id', 'business_case_versions');
create trigger business_case_option_years_00_tenant_guard before insert or update on public.business_case_option_years
  for each row execute function private.tenant_guard('version_id', 'business_case_versions');
create trigger business_case_objectives_10_frozen before insert or update or delete on public.business_case_objectives
  for each row execute function private.business_case_child_frozen();
create trigger business_case_option_years_10_frozen before insert or update or delete on public.business_case_option_years
  for each row execute function private.business_case_child_frozen();
create trigger business_case_objectives_updated_at before update on public.business_case_objectives
  for each row execute function private.set_updated_at();
create trigger business_case_option_years_updated_at before update on public.business_case_option_years
  for each row execute function private.set_updated_at();
create trigger business_case_objectives_audit after insert or update or delete on public.business_case_objectives
  for each row execute function private.audit_row_change();
create trigger business_case_option_years_audit after insert or update or delete on public.business_case_option_years
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.business_case_objectives
  for each row execute function private.enforce_org_writable();
create trigger zz_org_read_only before insert or update or delete on public.business_case_option_years
  for each row execute function private.enforce_org_writable();

revoke all on public.business_case_objectives, public.business_case_option_years from anon, authenticated;
grant select, insert, update, delete on public.business_case_objectives, public.business_case_option_years to authenticated;
grant all on public.business_case_objectives, public.business_case_option_years to service_role;
alter table public.business_case_objectives enable row level security;
alter table public.business_case_option_years enable row level security;

create policy business_case_objectives_select on public.business_case_objectives for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy business_case_objectives_insert on public.business_case_objectives for insert to authenticated
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[])
              and private.module_enabled(organisation_id, 'five_case'));
create policy business_case_objectives_update on public.business_case_objectives for update to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[])
         and private.module_enabled(organisation_id, 'five_case'))
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[])
              and private.module_enabled(organisation_id, 'five_case'));
create policy business_case_objectives_delete on public.business_case_objectives for delete to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[])
         and private.module_enabled(organisation_id, 'five_case'));

create policy business_case_option_years_select on public.business_case_option_years for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy business_case_option_years_insert on public.business_case_option_years for insert to authenticated
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[])
              and private.module_enabled(organisation_id, 'five_case'));
create policy business_case_option_years_update on public.business_case_option_years for update to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[])
         and private.module_enabled(organisation_id, 'five_case'))
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[])
              and private.module_enabled(organisation_id, 'five_case'));
create policy business_case_option_years_delete on public.business_case_option_years for delete to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[])
         and private.module_enabled(organisation_id, 'five_case'));

-- ---------------------------------------------------------------------------------------------
-- 4. Versions and stages
-- ---------------------------------------------------------------------------------------------

-- Previous body (f4_business_cases_documents) with: the first version's sections from the case's
-- template set; the stage and appraisal settings carried forward; options' list fields carried
-- forward; objectives and appraisal years copied while the module is on (with it off they stay on
-- the earlier version, hidden, rather than being refused by RLS).
create or replace function public.start_business_case_version(p_business_case_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_case public.business_cases;
  v_prev public.business_case_versions;
  v_new uuid;
  v_option public.business_case_options;
  v_new_option uuid;
  v_five_case boolean;
begin
  select * into v_case from public.business_cases where id = p_business_case_id;
  if v_case.id is null then
    raise exception 'Business case not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.business_case_versions where business_case_id = v_case.id and status = 'draft') then
    raise exception 'This business case already has a draft' using errcode = '23505';
  end if;
  if exists (select 1 from public.business_case_versions where business_case_id = v_case.id and status = 'submitted') then
    raise exception 'A version is awaiting a decision' using errcode = '22023';
  end if;
  v_five_case := private.module_enabled(v_case.organisation_id, 'five_case');
  select * into v_prev from public.business_case_versions
  where business_case_id = v_case.id order by version desc limit 1;

  insert into public.business_case_versions (business_case_id, whole_life_cost, funding_requested,
    stage, discount_rate, appraisal_years, price_base_year)
  values (v_case.id, v_prev.whole_life_cost, v_prev.funding_requested,
    coalesce(v_prev.stage, 'single'),
    coalesce(v_prev.discount_rate, 3.5), coalesce(v_prev.appraisal_years, 10), v_prev.price_base_year)
  returning id into v_new;

  if v_prev.id is null then
    insert into public.business_case_sections (version_id, template_id, key, title, is_required, sort_order)
    select v_new, t.id, t.key, t.title, t.is_required, t.sort_order
    from public.business_case_templates t
    where t.organisation_id = v_case.organisation_id and t.is_active and t.set_key = v_case.template_set;
    if v_case.request_id is not null then
      insert into public.business_case_benefits (version_id, title, classification, measure, baseline, target,
        annual_value, years_counted, sort_order, owner_id, strategic_objective_id, category_id)
      select v_new, d.title, d.classification, d.measure, d.baseline, d.target,
        d.annual_value, d.years_counted, d.sort_order, d.owner_id, d.strategic_objective_id, d.category_id
      from public.request_benefit_drafts d where d.request_id = v_case.request_id;
    end if;
  else
    insert into public.business_case_sections (version_id, template_id, key, title, is_required, content, sort_order)
    select v_new, s.template_id, s.key, s.title, s.is_required, s.content, s.sort_order
    from public.business_case_sections s where s.version_id = v_prev.id;
    for v_option in select * from public.business_case_options o where o.version_id = v_prev.id order by o.sort_order, o.created_at loop
      insert into public.business_case_options (version_id, name, description, whole_life_cost, delivery_cost,
        benefits_summary, risk_summary, is_preferred, sort_order, list_stage, shortlist_note, optimism_bias_pct)
      values (v_new, v_option.name, v_option.description, v_option.whole_life_cost, v_option.delivery_cost,
        v_option.benefits_summary, v_option.risk_summary, v_option.is_preferred, v_option.sort_order,
        v_option.list_stage, v_option.shortlist_note, v_option.optimism_bias_pct)
      returning id into v_new_option;
      if v_five_case then
        insert into public.business_case_option_years (version_id, option_id, year_index, capital_cost, revenue_cost,
          cash_benefit, non_cash_benefit)
        select v_new, v_new_option, y.year_index, y.capital_cost, y.revenue_cost, y.cash_benefit, y.non_cash_benefit
        from public.business_case_option_years y where y.option_id = v_option.id;
      end if;
    end loop;
    insert into public.business_case_benefits (version_id, title, classification, measure, baseline, target,
      annual_value, years_counted, sort_order, owner_id, strategic_objective_id, category_id)
    select v_new, b.title, b.classification, b.measure, b.baseline, b.target,
      b.annual_value, b.years_counted, b.sort_order, b.owner_id, b.strategic_objective_id, b.category_id
    from public.business_case_benefits b where b.version_id = v_prev.id;
    if v_five_case then
      insert into public.business_case_objectives (version_id, kind, title, description, measure, sort_order)
      select v_new, o.kind, o.title, o.description, o.measure, o.sort_order
      from public.business_case_objectives o where o.version_id = v_prev.id;
    end if;
  end if;
  return v_new;
end;
$$;
revoke all on function public.start_business_case_version(uuid) from public, anon;
grant execute on function public.start_business_case_version(uuid) to authenticated;

-- Starts the next stage (or the first staged version) as a new draft carrying the content forward.
-- Runs as the caller: RLS and the stage rules decide.
create function public.start_business_case_stage(p_business_case_id uuid, p_stage text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_new uuid;
begin
  if p_stage is null or p_stage not in ('single', 'soc', 'obc', 'fbc') then
    raise exception 'Choose single, SOC, OBC or FBC' using errcode = '22023';
  end if;
  select organisation_id into v_org from public.business_cases where id = p_business_case_id;
  if v_org is null then
    raise exception 'Business case not found' using errcode = 'P0002';
  end if;
  perform private.assert_module_enabled(v_org, 'five_case');
  v_new := public.start_business_case_version(p_business_case_id);
  update public.business_case_versions set stage = p_stage where id = v_new and stage is distinct from p_stage;
  return v_new;
end;
$$;
revoke all on function public.start_business_case_stage(uuid, text) from public, anon;
grant execute on function public.start_business_case_stage(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Approval routes
-- ---------------------------------------------------------------------------------------------

-- The route steps that apply to a version, in order: {name, governanceRole, minValue}.
create function private.business_case_route_steps(p_org uuid, p_stage text, p_value numeric)
returns table (step_order integer, name text, governance_role text)
language sql
stable
security definer
set search_path = ''
as $$
  select (row_number() over (order by s.ord))::integer, btrim(s.step ->> 'name'), s.step ->> 'governanceRole'
  from public.organisations o,
       jsonb_array_elements(coalesce(o.settings -> 'fiveCase' -> 'approvalRoutes' -> p_stage, '[]'::jsonb))
         with ordinality as s(step, ord)
  where o.id = p_org
    and jsonb_typeof(s.step) = 'object'
    and coalesce(btrim(s.step ->> 'name'), '') <> ''
    and coalesce(s.step ->> 'governanceRole', '') ~ '^[a-z][a-z0-9_]{1,59}$'
    and (jsonb_typeof(s.step -> 'minValue') is distinct from 'number'
         or coalesce(p_value, 0) >= (s.step ->> 'minValue')::numeric);
$$;
revoke execute on function private.business_case_route_steps(uuid, text, numeric) from public, anon, authenticated;

create function public.set_business_case_approval_routes(p_org uuid, p_routes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage text;
  v_step jsonb;
begin
  perform private.assert_org_admin(p_org);
  perform private.assert_module_enabled(p_org, 'five_case');
  if p_routes is null or jsonb_typeof(p_routes) <> 'object' then
    raise exception 'Routes must be an object of stages' using errcode = '22023';
  end if;
  for v_stage in select jsonb_object_keys(p_routes) loop
    if v_stage not in ('single', 'soc', 'obc', 'fbc') then
      raise exception 'Unknown stage %', v_stage using errcode = '22023';
    end if;
    if jsonb_typeof(p_routes -> v_stage) <> 'array' or jsonb_array_length(p_routes -> v_stage) > 10 then
      raise exception 'Each stage has a list of at most 10 steps' using errcode = '22023';
    end if;
    for v_step in select jsonb_array_elements(p_routes -> v_stage) loop
      if jsonb_typeof(v_step) <> 'object' or length(btrim(coalesce(v_step ->> 'name', ''))) not between 1 and 120 then
        raise exception 'Every step needs a name (up to 120 characters)' using errcode = '22023';
      end if;
      if not exists (select 1 from public.lookup_values l where l.organisation_id = p_org
                     and l.list_key = 'governance_role' and l.value = v_step ->> 'governanceRole') then
        raise exception 'Step "%" needs a governance role from Settings › Lists', btrim(v_step ->> 'name')
          using errcode = '22023';
      end if;
      if v_step ? 'minValue' and jsonb_typeof(v_step -> 'minValue') not in ('null', 'number') then
        raise exception 'The threshold for "%" must be a number', btrim(v_step ->> 'name') using errcode = '22023';
      end if;
      if jsonb_typeof(v_step -> 'minValue') = 'number' and (v_step ->> 'minValue')::numeric < 0 then
        raise exception 'The threshold for "%" can''t be negative', btrim(v_step ->> 'name') using errcode = '22023';
      end if;
    end loop;
  end loop;
  update public.organisations o
     set settings = jsonb_set(o.settings, '{fiveCase}',
                              coalesce(o.settings -> 'fiveCase', '{}'::jsonb)
                                || jsonb_build_object('approvalRoutes',
                                     (select coalesce(jsonb_object_agg(k, (select coalesce(jsonb_agg(jsonb_build_object(
                                                'name', btrim(s ->> 'name'),
                                                'governanceRole', s ->> 'governanceRole',
                                                'minValue', case when jsonb_typeof(s -> 'minValue') = 'number' then s -> 'minValue' else 'null'::jsonb end)
                                              order by ord), '[]'::jsonb)
                                            from jsonb_array_elements(p_routes -> k) with ordinality as e(s, ord))), '{}'::jsonb)
                                      from jsonb_object_keys(p_routes) k)))
   where o.id = p_org;
  return (select o.settings -> 'fiveCase' -> 'approvalRoutes' from public.organisations o where o.id = p_org);
end;
$$;
revoke all on function public.set_business_case_approval_routes(uuid, jsonb) from public, anon;
grant execute on function public.set_business_case_approval_routes(uuid, jsonb) to authenticated;

-- On submit (draft → submitted) with the module on: open the approval gate for the stage's route.
create function private.business_case_open_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.business_cases;
  v_gate uuid;
  v_label text := case new.stage when 'soc' then 'SOC' when 'obc' then 'OBC' when 'fbc' then 'FBC' else 'Business case' end;
begin
  if private.in_purge() then return null; end if;
  if not private.module_enabled(new.organisation_id, 'five_case') then return null; end if;
  if not exists (select 1 from private.business_case_route_steps(new.organisation_id, new.stage,
                   coalesce(new.whole_life_cost, new.funding_requested))) then
    return null;
  end if;
  select * into v_case from public.business_cases where id = new.business_case_id;
  insert into public.approval_gates (organisation_id, workspace_id, project_id, entity_type, entity_id, gate_type, name)
  values (new.organisation_id, new.workspace_id, v_case.project_id, 'business_case_version', new.id, 'business_case',
          left(v_label || ' approval: ' || v_case.title || ' v' || new.version, 200))
  returning id into v_gate;
  insert into public.approval_steps (organisation_id, workspace_id, gate_id, step_order, required_role, governance_role)
  select new.organisation_id, new.workspace_id, v_gate, s.step_order, s.name, s.governance_role
  from private.business_case_route_steps(new.organisation_id, new.stage, coalesce(new.whole_life_cost, new.funding_requested)) s;
  return null;
end;
$$;
revoke execute on function private.business_case_open_gate() from public, anon, authenticated;
create trigger business_case_versions_30_open_gate after update of status on public.business_case_versions
  for each row when (old.status = 'draft' and new.status = 'submitted')
  execute function private.business_case_open_gate();

-- When a business case gate is decided, the version follows. An approval supersedes the earlier
-- approved versions of the same stage (an approved SOC stays approved when the OBC is approved).
create function private.business_case_gate_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.business_case_versions;
begin
  if private.in_purge() then return null; end if;
  select * into v from public.business_case_versions where id = new.entity_id for update;
  if v.id is null or v.status <> 'submitted' then return null; end if;
  if new.status = 'approved' then
    update public.business_case_versions set status = 'superseded'
     where business_case_id = v.business_case_id and id <> v.id and status = 'approved' and stage = v.stage;
  end if;
  update public.business_case_versions
     set status = new.status::public.business_case_status, decided_at = coalesce(new.decided_at, now()),
         recorded_by = (select auth.uid())
   where id = v.id;
  return null;
end;
$$;
revoke execute on function private.business_case_gate_decided() from public, anon, authenticated;
create trigger approval_gates_30_business_case_decided after update of status on public.approval_gates
  for each row when (new.gate_type = 'business_case' and new.entity_type = 'business_case_version'
                     and old.status = 'pending' and new.status in ('approved', 'rejected'))
  execute function private.business_case_gate_decided();

-- Business case gates and steps come only from the route: a direct client write can't create,
-- change or delete them (decisions go through decide_approval_step, which runs as its owner).
create function private.business_case_gate_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.in_purge() or current_user <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if (tg_op <> 'INSERT' and (old.gate_type = 'business_case' or old.entity_type = 'business_case_version'))
     or (tg_op <> 'DELETE' and (new.gate_type = 'business_case' or new.entity_type = 'business_case_version')) then
    raise exception 'Business case approvals follow the approval route. Decide each step in the approval panel.'
      using errcode = '42501', hint = 'business_case_gate';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function private.business_case_gate_guard() from public, anon, authenticated;
create trigger approval_gates_05_business_case_guard before insert or update or delete on public.approval_gates
  for each row execute function private.business_case_gate_guard();

create function private.business_case_step_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.in_purge() or current_user <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.approval_gates g
             where g.id in (case when tg_op <> 'INSERT' then old.gate_id end, case when tg_op <> 'DELETE' then new.gate_id end)
               and (g.gate_type = 'business_case' or g.entity_type = 'business_case_version')) then
    raise exception 'Business case approvals follow the approval route. Decide each step in the approval panel.'
      using errcode = '42501', hint = 'business_case_gate';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function private.business_case_step_guard() from public, anon, authenticated;
create trigger approval_steps_05_business_case_guard before insert or update or delete on public.approval_steps
  for each row execute function private.business_case_step_guard();
