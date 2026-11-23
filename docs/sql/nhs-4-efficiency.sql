-- Copy of supabase/migrations/20261123190000_nhs_4_efficiency.sql for review (NHS-4 part 1).
-- Apply the migration file, not this copy. Nothing in it is destructive.
-- NHS-4 part 1: efficiency / savings programme (CIP) schema, RLS, stage rules and the link to impact
-- assessments (docs/nhs-module-plan.md § NHS-4, docs/sql/nhs-4-efficiency.sql). Written by an
-- unattended run on 23/11/2026: tested on the local Postgres only, NOT applied to production.
-- Apply after 20261123160000_nhs_3b_assessment_notifications_blocks. Nothing here is destructive:
-- three new tables, two views, a new nullable column on impact_assessments, new functions and
-- triggers. Replaced (create or replace, same signatures): private.impact_assessments_target,
-- private.impact_assessments_finish (NHS-3, lane A only), the view public.v_impact_assessments (same
-- columns, target_name also names a scheme, one column added at the end) and
-- private.seed_module_defaults (NHS-2 body plus one 'efficiency' branch; lane B also replaces this
-- function, so NHS-8 reconciles it).
--
-- Design
-- - efficiency_schemes: workspace records (organisation_id, workspace_id), like projects, so a
--   scheme can link to a delivering project / programme / benefit in its workspace with composite
--   foreign keys, and carry an impact assessment (which needs a workspace). Organisational unit is
--   a value of the organisation's existing 'business_unit' list (shown with the pack's orgUnit
--   term: Directorate for NHS); category a value of the new 'efficiency_category' list (seeded by
--   the module). Refs EFF-1, EFF-2 … per organisation.
-- - Stages: idea → opportunity → plan_in_progress → fully_developed → in_delivery → delivered, plus
--   on_hold and rejected. Labels come from terminology; the keys are fixed. Rules, checked by
--   trigger on every insert and stage change (so no client write, import or RPC can skip them),
--   only when a scheme moves into a stage from outside it: fully_developed or later needs a delivery
--   plan and at least one non-zero planned value; in_delivery or delivered also needs finance
--   validation (settings.efficiency.requireFinanceValidation, default on) and, while the
--   impact_assessment module is on, an approved impact assessment of the scheme
--   (settings.efficiency.requireAssessment, default on). Sample schemes are exempt.
-- - Planning confidence: four keys (NHS efficiency planning categories) with editable weights in
--   settings.efficiency.confidenceWeights; risk-adjusted value = planned value × weight.
-- - efficiency_values: one row per scheme, month (first of month) and kind (plan / forecast /
--   actual) with recurrent and non-recurrent amounts. The financial year isn't stored: views work
--   it out from settings.regional.financialYearStartMonth, so changing the year start regroups the
--   months without rewriting rows. Actuals are validated by the scheme's finance lead (or workspace
--   PMO / admin) through validate_efficiency_actuals; changing a validated actual clears it.
-- - efficiency_targets: per workspace, financial year and (optionally) organisational unit.
-- - Writes need the module on. Schemes: workspace managers and above. Values: managers and above,
--   and the scheme's lead or finance lead (as workspace contributors). Targets: workspace PMO /
--   admin. No deletes of schemes (rejected or on hold instead); values and targets can be removed.
-- - Impact assessments gain efficiency_scheme_id: a scheme's assessment is edited by workspace
--   managers and above (the NHS-3 rule for non-project targets).

-- ---------------------------------------------------------------------------------------------
-- 1. Defaults (mirror src/data/efficiency.ts; change both together)
-- ---------------------------------------------------------------------------------------------

create function private.efficiency_stage_rank(p_stage text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_stage when 'idea' then 1 when 'opportunity' then 2 when 'plan_in_progress' then 3
                      when 'fully_developed' then 4 when 'in_delivery' then 5 when 'delivered' then 6
                      else 0 end;
$$;
revoke execute on function private.efficiency_stage_rank(text) from public, anon;
grant execute on function private.efficiency_stage_rank(text) to authenticated;

-- The organisation's efficiency settings with defaults filled in.
create function private.efficiency_settings(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'requireAssessment', true,
           'requireFinanceValidation', true,
           'confidenceWeights', jsonb_build_object('fully_developed_in_delivery', 1,
                                                   'fully_developed_not_started', 0.8,
                                                   'plans_in_progress', 0.5,
                                                   'opportunity', 0.2))
         || coalesce((select case when jsonb_typeof(o.settings -> 'efficiency') = 'object'
                                  then (o.settings -> 'efficiency') - 'confidenceWeights' end
                      from public.organisations o where o.id = p_org), '{}'::jsonb)
         || jsonb_build_object('confidenceWeights',
              jsonb_build_object('fully_developed_in_delivery', 1, 'fully_developed_not_started', 0.8,
                                 'plans_in_progress', 0.5, 'opportunity', 0.2)
              || coalesce((select case when jsonb_typeof(o.settings -> 'efficiency' -> 'confidenceWeights') = 'object'
                                       then o.settings -> 'efficiency' -> 'confidenceWeights' end
                           from public.organisations o where o.id = p_org), '{}'::jsonb));
$$;
revoke execute on function private.efficiency_settings(uuid) from public, anon;
grant execute on function private.efficiency_settings(uuid) to authenticated, service_role;

-- The financial year (its starting calendar year) a month falls in.
create function private.financial_year_of(p_month date, p_start_month integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when extract(month from p_month)::int >= coalesce(p_start_month, 4)
              then extract(year from p_month)::int else extract(year from p_month)::int - 1 end;
$$;
revoke execute on function private.financial_year_of(date, integer) from public, anon;
grant execute on function private.financial_year_of(date, integer) to authenticated;

create function private.org_financial_year_start(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select case when o.settings -> 'regional' ->> 'financialYearStartMonth' ~ '^([1-9]|1[0-2])$'
                               then (o.settings -> 'regional' ->> 'financialYearStartMonth')::int end
                   from public.organisations o where o.id = p_org), 8);
$$;
revoke execute on function private.org_financial_year_start(uuid) from public, anon;
grant execute on function private.org_financial_year_start(uuid) to authenticated;

-- Default categories: NHS pack (CIP categories) or neutral.
create function private.efficiency_default_categories(p_pack text)
returns table (value text, label text, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('workforce', 'Workforce and pay', 1),
    ('agency_bank', 'Agency and bank', 2),
    ('medicines', 'Medicines', 3),
    ('procurement', 'Procurement and non-pay', 4),
    ('estates', 'Estates and facilities', 5),
    ('clinical_productivity', 'Clinical productivity', 6),
    ('corporate', 'Corporate services', 7),
    ('income', 'Income', 8)) v(value, label, sort_order)
  where p_pack = 'nhs'
  union all
  select * from (values
    ('staffing', 'Staffing', 1),
    ('procurement', 'Procurement', 2),
    ('estates', 'Estates', 3),
    ('process_improvement', 'Process improvement', 4),
    ('income', 'Income', 5)) v(value, label, sort_order)
  where p_pack is distinct from 'nhs';
$$;
revoke execute on function private.efficiency_default_categories(text) from public, anon;

-- Seeding for the 'efficiency' module: the category list. Only inserts what's missing.
create function private.seed_efficiency_defaults(p_org uuid, p_pack text, p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('list', 'efficiency_category', 'value', c.value, 'label', c.label)
                            order by c.sort_order), '[]'::jsonb)
    into v_items
  from private.efficiency_default_categories(p_pack) c
  where not exists (select 1 from public.lookup_values l
                    where l.organisation_id = p_org and l.list_key = 'efficiency_category' and l.value = c.value);
  if p_apply then
    insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
    select p_org, 'efficiency_category', c.value, c.label,
           c.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                    where l.organisation_id = p_org and l.list_key = 'efficiency_category'), 0)
    from private.efficiency_default_categories(p_pack) c
    on conflict (organisation_id, list_key, value) do nothing;
  end if;
  return v_items;
end;
$$;
revoke execute on function private.seed_efficiency_defaults(uuid, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------------------------

create table public.efficiency_schemes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  ref text not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text check (description is null or length(description) <= 10000),
  -- Values of the organisation's 'business_unit' and 'efficiency_category' lists.
  business_unit text check (business_unit is null or length(business_unit) <= 200),
  category text check (category is null or length(category) <= 200),
  savings_type text not null default 'non_pay' check (savings_type in ('pay', 'non_pay', 'income')),
  recurrence text not null default 'recurrent' check (recurrence in ('recurrent', 'non_recurrent', 'mixed')),
  executive_lead_id uuid,
  scheme_lead_id uuid,
  finance_lead_id uuid,
  start_month date check (start_month is null or extract(day from start_month) = 1),
  project_id uuid,
  programme_id uuid,
  benefit_id uuid,
  stage text not null default 'idea'
    check (stage in ('idea', 'opportunity', 'plan_in_progress', 'fully_developed', 'in_delivery',
                     'delivered', 'on_hold', 'rejected')),
  confidence text check (confidence is null or confidence in ('fully_developed_in_delivery',
                         'fully_developed_not_started', 'plans_in_progress', 'opportunity')),
  -- The delivery plan (required from fully_developed).
  delivery_plan text check (delivery_plan is null or length(delivery_plan) <= 10000),
  -- Annualised recurrent value once fully implemented (efficiency_run_rate_fye suggests one).
  full_year_effect numeric(14, 2) check (full_year_effect is null or full_year_effect >= 0),
  stage_changed_at timestamptz not null default now(),
  finance_validated_at timestamptz,
  finance_validated_by uuid references public.profiles (id) on delete set null,
  finance_comment text check (finance_comment is null or length(finance_comment) <= 4000),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (id, workspace_id),
  unique (organisation_id, ref),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (executive_lead_id, organisation_id) references public.resources (id, organisation_id)
    on delete set null (executive_lead_id),
  foreign key (scheme_lead_id, organisation_id) references public.resources (id, organisation_id)
    on delete set null (scheme_lead_id),
  foreign key (finance_lead_id, organisation_id) references public.resources (id, organisation_id)
    on delete set null (finance_lead_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete set null (project_id),
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete set null (programme_id),
  foreign key (benefit_id, workspace_id) references public.benefits (id, workspace_id) on delete set null (benefit_id)
);
create index efficiency_schemes_ws_idx on public.efficiency_schemes (workspace_id, organisation_id);
create index efficiency_schemes_exec_idx on public.efficiency_schemes (executive_lead_id, organisation_id);
create index efficiency_schemes_lead_idx on public.efficiency_schemes (scheme_lead_id, organisation_id);
create index efficiency_schemes_finance_idx on public.efficiency_schemes (finance_lead_id, organisation_id);
create index efficiency_schemes_project_idx on public.efficiency_schemes (project_id, workspace_id);
create index efficiency_schemes_programme_idx on public.efficiency_schemes (programme_id, workspace_id);
create index efficiency_schemes_benefit_idx on public.efficiency_schemes (benefit_id, workspace_id);
create index efficiency_schemes_validated_by_idx on public.efficiency_schemes (finance_validated_by);
create index efficiency_schemes_created_by_idx on public.efficiency_schemes (created_by);

comment on table public.efficiency_schemes is
  'NHS-4: efficiency / savings schemes (CIP). Do not enter patient-identifiable information.';

create table public.efficiency_values (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  scheme_id uuid not null,
  month date not null check (extract(day from month) = 1),
  kind text not null check (kind in ('plan', 'forecast', 'actual')),
  recurrent numeric(14, 2) not null default 0,
  non_recurrent numeric(14, 2) not null default 0,
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scheme_id, month, kind),
  check (kind = 'actual' or (validated_at is null and validated_by is null)),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (scheme_id, workspace_id) references public.efficiency_schemes (id, workspace_id) on delete cascade
);
create index efficiency_values_ws_idx on public.efficiency_values (workspace_id, organisation_id);
create index efficiency_values_scheme_ws_idx on public.efficiency_values (scheme_id, workspace_id);
create index efficiency_values_validated_by_idx on public.efficiency_values (validated_by);

create table public.efficiency_targets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  -- The calendar year the financial year starts in (2026 = 2026/27 with an April start).
  financial_year integer not null check (financial_year between 2000 and 2100),
  -- Null = the whole workspace; else a value of the 'business_unit' list.
  business_unit text check (business_unit is null or length(business_unit) <= 200),
  amount numeric(14, 2) not null check (amount >= 0),
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
create unique index efficiency_targets_unique_idx
  on public.efficiency_targets (workspace_id, financial_year, coalesce(business_unit, ''));
create index efficiency_targets_org_idx on public.efficiency_targets (workspace_id, organisation_id);
create index efficiency_targets_created_by_idx on public.efficiency_targets (created_by);

-- ---------------------------------------------------------------------------------------------
-- 3. Helpers for permissions
-- ---------------------------------------------------------------------------------------------

-- The caller is the scheme's lead or finance lead (through their resource) and at least a
-- contributor in its workspace.
create function private.is_efficiency_scheme_lead(p_scheme uuid, p_finance_only boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.efficiency_schemes s
    join public.resources r on r.organisation_id = s.organisation_id
     and r.id in (s.finance_lead_id, case when not p_finance_only then s.scheme_lead_id end)
    where s.id = p_scheme and r.profile_id = (select auth.uid())
      and s.workspace_id = any (private.my_workspace_ids('contributor')));
$$;
revoke execute on function private.is_efficiency_scheme_lead(uuid, boolean) from public, anon;
grant execute on function private.is_efficiency_scheme_lead(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Triggers on efficiency_schemes
-- ---------------------------------------------------------------------------------------------

-- What a scheme still needs before it can enter p_stage (labels). Empty = allowed.
create function private.efficiency_stage_missing(s public.efficiency_schemes, p_stage text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings jsonb := private.efficiency_settings(s.organisation_id);
  v_missing text[] := '{}';
begin
  if private.efficiency_stage_rank(p_stage) >= 4 then
    if coalesce(btrim(s.delivery_plan), '') = '' then
      v_missing := v_missing || 'a delivery plan'::text;
    end if;
    if not exists (select 1 from public.efficiency_values v
                   where v.scheme_id = s.id and v.kind = 'plan' and (v.recurrent <> 0 or v.non_recurrent <> 0)) then
      v_missing := v_missing || 'planned monthly values'::text;
    end if;
  end if;
  if private.efficiency_stage_rank(p_stage) >= 5 then
    if coalesce((v_settings ->> 'requireFinanceValidation')::boolean, true) and s.finance_validated_at is null then
      v_missing := v_missing || 'finance validation'::text;
    end if;
    if coalesce((v_settings ->> 'requireAssessment')::boolean, true)
       and private.module_enabled(s.organisation_id, 'impact_assessment')
       and not private.impact_assessment_approved('efficiency_scheme', s.id) then
      v_missing := v_missing || 'an approved impact assessment'::text;
    end if;
  end if;
  return v_missing;
end;
$$;
revoke execute on function private.efficiency_stage_missing(public.efficiency_schemes, text) from public, anon;
grant execute on function private.efficiency_stage_missing(public.efficiency_schemes, text) to authenticated;

-- Client writes (current_user = 'authenticated') can't set finance validation; new schemes start
-- unvalidated. Owner writes (RPCs, imports, seeds) pass.
create function private.efficiency_schemes_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.finance_validated_at := null; new.finance_validated_by := null; new.finance_comment := null;
    new.stage_changed_at := now();
    return new;
  end if;
  if (new.finance_validated_at, new.finance_validated_by, new.finance_comment, new.is_sample, new.ref)
     is distinct from (old.finance_validated_at, old.finance_validated_by, old.finance_comment, old.is_sample, old.ref) then
    raise exception 'Finance validation is recorded with the Validate button.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.efficiency_schemes_client_guard() from public, anon, authenticated;

-- Stage rules, for everyone (clients, RPCs, imports). Checked only when the scheme enters a stage
-- from outside it: moving between stages already past a rule, back, on hold or rejected is free.
create function private.efficiency_schemes_stage_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old integer := 0;
  v_new integer := private.efficiency_stage_rank(new.stage);
  v_missing text[];
begin
  if tg_op = 'UPDATE' then
    if new.stage is not distinct from old.stage then
      return new;
    end if;
    v_old := private.efficiency_stage_rank(old.stage);
    new.stage_changed_at := now();
  end if;
  if new.is_sample or private.in_purge() or v_new < 4 then
    return new;
  end if;
  v_missing := private.efficiency_stage_missing(new, new.stage);
  -- Only the rules this move newly crosses: from fully_developed or later, the plan rules were met.
  if v_old >= 4 then
    v_missing := array(select m from unnest(v_missing) m where m not in ('a delivery plan', 'planned monthly values'));
  end if;
  if v_old >= 5 then
    v_missing := '{}';
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'This scheme needs % before it can move to this stage.', array_to_string(v_missing, ', ')
      using errcode = 'P0001', hint = 'efficiency_stage_blocked';
  end if;
  return new;
end;
$$;
revoke execute on function private.efficiency_schemes_stage_rules() from public, anon, authenticated;

-- No archived links on insert or relink.
create function private.efficiency_schemes_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is not null and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id)
     and exists (select 1 from public.projects p where p.id = new.project_id and p.archived_at is not null) then
    raise exception 'That project is archived.' using errcode = '22023';
  end if;
  if new.programme_id is not null and (tg_op = 'INSERT' or new.programme_id is distinct from old.programme_id)
     and exists (select 1 from public.programmes p where p.id = new.programme_id and p.archived_at is not null) then
    raise exception 'That programme is archived.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function private.efficiency_schemes_links() from public, anon, authenticated;

create trigger efficiency_schemes_ref before insert on public.efficiency_schemes
  for each row execute function private.assign_ref('EFF', 'organisation');
create trigger efficiency_schemes_00_tenant_guard before insert or update on public.efficiency_schemes
  for each row execute function private.tenant_guard('workspace_id', 'workspaces');
create trigger efficiency_schemes_03_client_guard before insert or update on public.efficiency_schemes
  for each row execute function private.efficiency_schemes_client_guard();
create trigger efficiency_schemes_05_links before insert or update on public.efficiency_schemes
  for each row execute function private.efficiency_schemes_links();
create trigger efficiency_schemes_10_stage_rules before insert or update on public.efficiency_schemes
  for each row execute function private.efficiency_schemes_stage_rules();
create trigger efficiency_schemes_updated_at before update on public.efficiency_schemes
  for each row execute function private.set_updated_at();
create trigger efficiency_schemes_audit after insert or update or delete on public.efficiency_schemes
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.efficiency_schemes
  for each row execute function private.enforce_org_writable();

-- ---------------------------------------------------------------------------------------------
-- 5. Triggers on efficiency_values and efficiency_targets
-- ---------------------------------------------------------------------------------------------

-- Clients can't validate directly; changing a validated actual's amounts clears its validation.
create function private.efficiency_values_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.scheme_id, new.month, new.kind) is distinct from (old.scheme_id, old.month, old.kind) then
    raise exception 'Change the amounts, not the month or kind.' using errcode = '42501';
  end if;
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      new.validated_at := null; new.validated_by := null;
    elsif (new.validated_at, new.validated_by) is distinct from (old.validated_at, old.validated_by) then
      raise exception 'Actuals are validated with the Validate button.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.validated_at is not null
     and (new.recurrent, new.non_recurrent) is distinct from (old.recurrent, old.non_recurrent) then
    new.validated_at := null; new.validated_by := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.efficiency_values_guard() from public, anon, authenticated;

create trigger efficiency_values_00_tenant_guard before insert or update on public.efficiency_values
  for each row execute function private.tenant_guard('scheme_id', 'efficiency_schemes');
create trigger efficiency_values_03_guard before insert or update on public.efficiency_values
  for each row execute function private.efficiency_values_guard();
create trigger efficiency_values_updated_at before update on public.efficiency_values
  for each row execute function private.set_updated_at();
create trigger efficiency_values_audit after insert or update or delete on public.efficiency_values
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.efficiency_values
  for each row execute function private.enforce_org_writable();

create trigger efficiency_targets_00_tenant_guard before insert or update on public.efficiency_targets
  for each row execute function private.tenant_guard('workspace_id', 'workspaces');
create trigger efficiency_targets_updated_at before update on public.efficiency_targets
  for each row execute function private.set_updated_at();
create trigger efficiency_targets_audit after insert or update or delete on public.efficiency_targets
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.efficiency_targets
  for each row execute function private.enforce_org_writable();

-- ---------------------------------------------------------------------------------------------
-- 6. RLS. Reads: workspace members, module on or off. Writes need the module on.
-- ---------------------------------------------------------------------------------------------

alter table public.efficiency_schemes enable row level security;
alter table public.efficiency_values enable row level security;
alter table public.efficiency_targets enable row level security;
revoke all on public.efficiency_schemes, public.efficiency_values, public.efficiency_targets from anon, authenticated;
-- No delete of schemes: they are rejected or put on hold (the organisation purge removes them).
grant select, insert, update on public.efficiency_schemes to authenticated;
grant select, insert, update, delete on public.efficiency_values, public.efficiency_targets to authenticated;

create policy efficiency_schemes_select on public.efficiency_schemes for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy efficiency_schemes_insert on public.efficiency_schemes for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
              and private.module_enabled(organisation_id, 'efficiency'));
create policy efficiency_schemes_update on public.efficiency_schemes for update to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[]))
  with check (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
              and private.module_enabled(organisation_id, 'efficiency'));

create policy efficiency_values_select on public.efficiency_values for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy efficiency_values_insert on public.efficiency_values for insert to authenticated
  with check (private.module_enabled(organisation_id, 'efficiency')
              and (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
                   or private.is_efficiency_scheme_lead(scheme_id)));
create policy efficiency_values_update on public.efficiency_values for update to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
         or private.is_efficiency_scheme_lead(scheme_id))
  with check (private.module_enabled(organisation_id, 'efficiency')
              and (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
                   or private.is_efficiency_scheme_lead(scheme_id)));
create policy efficiency_values_delete on public.efficiency_values for delete to authenticated
  using (private.module_enabled(organisation_id, 'efficiency')
         and (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
              or private.is_efficiency_scheme_lead(scheme_id)));

create policy efficiency_targets_select on public.efficiency_targets for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy efficiency_targets_insert on public.efficiency_targets for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[])
              and private.module_enabled(organisation_id, 'efficiency'));
create policy efficiency_targets_update on public.efficiency_targets for update to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]))
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[])
              and private.module_enabled(organisation_id, 'efficiency'));
create policy efficiency_targets_delete on public.efficiency_targets for delete to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[])
         and private.module_enabled(organisation_id, 'efficiency'));

-- ---------------------------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------------------------

-- Finance validation of the scheme's plan: its finance lead, or workspace PMO / admin, while the
-- module is on. p_validate false withdraws it (it doesn't move the scheme back a stage).
create function public.validate_efficiency_scheme(p_id uuid, p_validate boolean default true,
                                                  p_comment text default null, p_updated_at timestamptz default null)
returns public.efficiency_schemes
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.efficiency_schemes;
begin
  select * into s from public.efficiency_schemes where id = p_id for update;
  if s.id is null or not (s.workspace_id = any (private.my_workspace_ids()))
     or not private.module_enabled(s.organisation_id, 'efficiency')
     or not (s.workspace_id = any (private.my_workspace_ids('pmo')) or private.is_efficiency_scheme_lead(s.id, true)) then
    raise exception 'Only the scheme''s finance lead or the PMO can validate it.' using errcode = '42501';
  end if;
  if p_updated_at is not null and s.updated_at <> p_updated_at then
    raise exception 'Someone else changed this scheme. Reload it and try again.' using errcode = '40001';
  end if;
  if p_validate and not exists (select 1 from public.efficiency_values v where v.scheme_id = s.id and v.kind = 'plan'
                                  and (v.recurrent <> 0 or v.non_recurrent <> 0)) then
    raise exception 'Add planned monthly values before validating.' using errcode = '22023';
  end if;
  update public.efficiency_schemes
     set finance_validated_at = case when p_validate then now() end,
         finance_validated_by = case when p_validate then (select auth.uid()) end,
         finance_comment = nullif(btrim(coalesce(p_comment, '')), '')
   where id = s.id returning * into s;
  return s;
end;
$$;
revoke execute on function public.validate_efficiency_scheme(uuid, boolean, text, timestamptz) from public, anon;
grant execute on function public.validate_efficiency_scheme(uuid, boolean, text, timestamptz) to authenticated;

-- Validates a scheme's actuals (all unvalidated months, or the months given). Returns how many.
create function public.validate_efficiency_actuals(p_scheme uuid, p_months date[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.efficiency_schemes;
  n integer;
begin
  select * into s from public.efficiency_schemes where id = p_scheme;
  if s.id is null or not (s.workspace_id = any (private.my_workspace_ids()))
     or not private.module_enabled(s.organisation_id, 'efficiency')
     or not (s.workspace_id = any (private.my_workspace_ids('pmo')) or private.is_efficiency_scheme_lead(s.id, true)) then
    raise exception 'Only the scheme''s finance lead or the PMO can validate actuals.' using errcode = '42501';
  end if;
  update public.efficiency_values v
     set validated_at = now(), validated_by = (select auth.uid())
   where v.scheme_id = s.id and v.kind = 'actual' and v.validated_at is null
     and (p_months is null or v.month = any (p_months));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.validate_efficiency_actuals(uuid, date[]) from public, anon;
grant execute on function public.validate_efficiency_actuals(uuid, date[]) to authenticated;

-- Moves a scheme to a stage, returning what's missing instead of failing when the rules refuse
-- (for the board's "can't move" message). Moving still goes through the trigger.
create function public.efficiency_stage_check(p_id uuid, p_stage text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.efficiency_schemes;
  v_missing text[];
begin
  select * into s from public.efficiency_schemes where id = p_id;
  if s.id is null or not (s.workspace_id = any (private.my_workspace_ids())) then
    return null;
  end if;
  if s.is_sample or private.efficiency_stage_rank(p_stage) < 4 then
    return '{}';
  end if;
  v_missing := private.efficiency_stage_missing(s, p_stage);
  if private.efficiency_stage_rank(s.stage) >= 4 then
    v_missing := array(select m from unnest(v_missing) m where m not in ('a delivery plan', 'planned monthly values'));
  end if;
  if private.efficiency_stage_rank(s.stage) >= 5 then
    v_missing := '{}';
  end if;
  return v_missing;
end;
$$;
revoke execute on function public.efficiency_stage_check(uuid, text) from public, anon;
grant execute on function public.efficiency_stage_check(uuid, text) to authenticated;

-- Members read their organisation's efficiency settings (defaults filled in).
create function public.efficiency_settings(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_org) then
    return null;
  end if;
  return private.efficiency_settings(p_org);
end;
$$;
revoke execute on function public.efficiency_settings(uuid) from public, anon;
grant execute on function public.efficiency_settings(uuid) to authenticated;

-- Admins set the rules and confidence weights (validated; only known keys kept).
create function public.set_efficiency_settings(p_org uuid, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  k text;
begin
  if not (p_org = any (private.my_org_ids('admin'))) then
    raise exception 'Only an organisation admin can change these settings.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_settings) <> 'object'
     or jsonb_typeof(coalesce(p_settings -> 'requireAssessment', 'true')) <> 'boolean'
     or jsonb_typeof(coalesce(p_settings -> 'requireFinanceValidation', 'true')) <> 'boolean'
     or jsonb_typeof(coalesce(p_settings -> 'confidenceWeights', '{}')) <> 'object' then
    raise exception 'Settings need true / false rules and a weights object.' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(coalesce(p_settings -> 'confidenceWeights', '{}')) loop
    if k not in ('fully_developed_in_delivery', 'fully_developed_not_started', 'plans_in_progress', 'opportunity')
       or jsonb_typeof(p_settings -> 'confidenceWeights' -> k) <> 'number'
       or (p_settings -> 'confidenceWeights' ->> k)::numeric not between 0 and 1 then
      raise exception 'Each confidence weight must be a number from 0 to 1.' using errcode = '22023';
    end if;
  end loop;
  v := jsonb_strip_nulls(jsonb_build_object(
         'requireAssessment', p_settings -> 'requireAssessment',
         'requireFinanceValidation', p_settings -> 'requireFinanceValidation',
         'confidenceWeights', p_settings -> 'confidenceWeights'));
  update public.organisations o
     set settings = jsonb_set(o.settings, '{efficiency}',
                              case when jsonb_typeof(o.settings -> 'efficiency') = 'object'
                                   then o.settings -> 'efficiency' else '{}'::jsonb end || v)
   where o.id = p_org;
  return private.efficiency_settings(p_org);
end;
$$;
revoke execute on function public.set_efficiency_settings(uuid, jsonb) from public, anon;
grant execute on function public.set_efficiency_settings(uuid, jsonb) to authenticated;

-- Suggested full-year effect from the run rate: the average recurrent value of the last three
-- planned months × 12. Runs as the caller (RLS), so it returns null for a scheme they can't see.
create function public.efficiency_run_rate_fye(p_scheme uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(avg(v.recurrent) * 12, 2)
  from (select v.recurrent from public.efficiency_values v
        where v.scheme_id = p_scheme and v.kind = 'plan'
        order by v.month desc limit 3) v;
$$;
revoke execute on function public.efficiency_run_rate_fye(uuid) from public, anon;
grant execute on function public.efficiency_run_rate_fye(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 8. Views (security invoker)
-- ---------------------------------------------------------------------------------------------

-- Each value with its financial year and the scheme's grouping fields.
create view public.v_efficiency_values with (security_invoker = true) as
select v.id, v.organisation_id, v.workspace_id, v.scheme_id, v.month, v.kind, v.recurrent, v.non_recurrent,
  v.recurrent + v.non_recurrent as total, v.validated_at, v.validated_by, v.updated_at,
  private.financial_year_of(v.month, private.org_financial_year_start(v.organisation_id)) as financial_year,
  s.stage, s.business_unit, s.category, s.savings_type, s.confidence, s.is_sample
from public.efficiency_values v
join public.efficiency_schemes s on s.id = v.scheme_id;

revoke all on public.v_efficiency_values from anon, authenticated;
grant select on public.v_efficiency_values to authenticated;

-- Each scheme with this financial year's totals, its risk-adjusted plan and the assessment status.
create view public.v_efficiency_schemes with (security_invoker = true) as
with fy as (
  select s.id as scheme_id,
         private.financial_year_of(current_date, private.org_financial_year_start(s.organisation_id)) as year,
         private.org_financial_year_start(s.organisation_id) as start_month
  from public.efficiency_schemes s
)
select s.id, s.organisation_id, s.workspace_id, s.ref, s.title, s.description, s.business_unit, s.category,
  s.savings_type, s.recurrence, s.executive_lead_id, s.scheme_lead_id, s.finance_lead_id, s.start_month,
  s.project_id, s.programme_id, s.benefit_id, s.stage, s.confidence, s.delivery_plan, s.full_year_effect,
  s.stage_changed_at, s.finance_validated_at, s.finance_validated_by, s.finance_comment, s.is_sample,
  s.created_at, s.updated_at,
  fy.year as financial_year,
  coalesce(t.plan, 0) as plan_in_year,
  coalesce(t.plan_recurrent, 0) as plan_recurrent_in_year,
  coalesce(t.forecast, 0) as forecast_in_year,
  coalesce(t.actual, 0) as actual_in_year,
  round(coalesce(t.plan, 0) * coalesce((private.efficiency_settings(s.organisation_id) -> 'confidenceWeights'
                                        ->> s.confidence)::numeric, 0), 2) as risk_adjusted_in_year,
  a.id as assessment_id, a.status as assessment_status,
  ex.name as executive_lead_name, sl.name as scheme_lead_name, fl.name as finance_lead_name,
  p.code as project_code, p.name as project_name, g.name as programme_name
from public.efficiency_schemes s
join fy on fy.scheme_id = s.id
left join lateral (
  select sum(v.recurrent + v.non_recurrent) filter (where v.kind = 'plan') as plan,
         sum(v.recurrent) filter (where v.kind = 'plan') as plan_recurrent,
         sum(v.recurrent + v.non_recurrent) filter (where v.kind = 'forecast') as forecast,
         sum(v.recurrent + v.non_recurrent) filter (where v.kind = 'actual') as actual
  from public.efficiency_values v
  where v.scheme_id = s.id and private.financial_year_of(v.month, fy.start_month) = fy.year) t on true
left join public.impact_assessments a on a.entity_type = 'efficiency_scheme' and a.entity_id = s.id
left join public.resources ex on ex.id = s.executive_lead_id
left join public.resources sl on sl.id = s.scheme_lead_id
left join public.resources fl on fl.id = s.finance_lead_id
left join public.projects p on p.id = s.project_id
left join public.programmes g on g.id = s.programme_id;

revoke all on public.v_efficiency_schemes from anon, authenticated;
grant select on public.v_efficiency_schemes to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 9. Impact assessments of schemes (NHS-3)
-- ---------------------------------------------------------------------------------------------

alter table public.impact_assessments add column efficiency_scheme_id uuid;
alter table public.impact_assessments add constraint impact_assessments_scheme_fkey
  foreign key (efficiency_scheme_id, workspace_id) references public.efficiency_schemes (id, workspace_id) on delete cascade;
create index impact_assessments_scheme_idx on public.impact_assessments (efficiency_scheme_id, workspace_id);

-- Target types: project, programme and (NHS-4) efficiency scheme. A scheme has no tenant-guard
-- column on this table, so its organisation and workspace are taken here, under the caller's RLS.
create or replace function private.impact_assessments_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_ws uuid;
begin
  if tg_op = 'INSERT' then
    if new.entity_type = 'project' then
      new.project_id := new.entity_id; new.programme_id := null; new.efficiency_scheme_id := null;
    elsif new.entity_type = 'programme' then
      new.programme_id := new.entity_id; new.project_id := null; new.efficiency_scheme_id := null;
    elsif new.entity_type = 'efficiency_scheme' then
      select s.organisation_id, s.workspace_id into v_org, v_ws
      from public.efficiency_schemes s where s.id = new.entity_id;
      if v_org is null then
        raise exception 'efficiency_schemes % not found or not visible', new.entity_id using errcode = '23503';
      end if;
      new.efficiency_scheme_id := new.entity_id; new.project_id := null; new.programme_id := null;
      new.organisation_id := v_org; new.workspace_id := v_ws;
    else
      raise exception 'An impact assessment can be made for a project, a programme or a scheme.' using errcode = '22023';
    end if;
  elsif (new.entity_type, new.entity_id, new.project_id, new.programme_id, new.efficiency_scheme_id)
        is distinct from (old.entity_type, old.entity_id, old.project_id, old.programme_id, old.efficiency_scheme_id) then
    raise exception 'An impact assessment can''t be moved to another record.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.impact_assessments_finish()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_scores record;
  v_name text;
  v_archived timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.project_id is not null then
      select p.name, p.archived_at into v_name, v_archived from public.projects p where p.id = new.project_id;
    elsif new.programme_id is not null then
      select p.name, p.archived_at into v_name, v_archived from public.programmes p where p.id = new.programme_id;
    else
      select s.ref || ' ' || s.title into v_name from public.efficiency_schemes s where s.id = new.efficiency_scheme_id;
    end if;
    if v_archived is not null then
      raise exception 'This % is archived, so it can''t be assessed.', new.entity_type using errcode = '42501';
    end if;
    if btrim(new.title) = '' then
      new.title := 'Impact assessment: ' || coalesce(v_name, new.entity_type);
    end if;
  end if;
  select * into v_scores from private.impact_assessment_scores(new.template, new.screening, new.equality);
  new.screening_max_score := v_scores.max_score;
  new.full_required := v_scores.full_required;
  return new;
end;
$$;

create or replace view public.v_impact_assessments with (security_invoker = true) as
select a.id, a.organisation_id, a.workspace_id, a.entity_type, a.entity_id, a.project_id, a.programme_id,
  coalesce(p.name, g.name, e.ref || ' ' || e.title) as target_name, p.code as project_code,
  a.title, a.status, a.version, a.full_required, a.screening_max_score, a.template_version,
  a.review_date, (a.status = 'approved' and a.review_date < current_date) as review_overdue,
  a.submitted_at, a.approved_at, a.material_change_at, a.is_sample, a.updated_at,
  (select count(*) from jsonb_array_elements(a.template -> 'domains') d
    where coalesce(a.quality, '{}') -> (d ->> 'key') ->> 'impact' = 'negative'
       or a.screening -> (d ->> 'key') ->> 'impact' = 'negative')::integer as negative_domains,
  (select count(*) from jsonb_array_elements(a.template -> 'equality') d
    where a.equality -> (d ->> 'key') ->> 'impact' = 'negative')::integer as negative_equality,
  (select count(*) from public.approval_steps s where s.gate_id = a.gate_id)::integer as steps_total,
  (select count(*) from public.approval_steps s where s.gate_id = a.gate_id and s.decision = 'approved')::integer as steps_approved,
  (select coalesce(jsonb_agg(jsonb_build_object('step_id', s.id, 'order', s.step_order, 'role', s.governance_role,
                                                'role_label', s.required_role, 'decision', s.decision,
                                                'decided_at', s.decided_at) order by s.step_order), '[]'::jsonb)
     from public.approval_steps s where s.gate_id = a.gate_id) as steps,
  exists (select 1 from public.impact_assessment_decisions d
          where d.assessment_id = a.id and d.version = a.version and d.decision = 'approved_with_conditions') as has_conditions,
  a.efficiency_scheme_id
from public.impact_assessments a
left join public.projects p on p.id = a.project_id
left join public.programmes g on g.id = a.programme_id
left join public.efficiency_schemes e on e.id = a.efficiency_scheme_id;

-- ---------------------------------------------------------------------------------------------
-- 10. Module seeding: the NHS-2 body of private.seed_module_defaults plus an 'efficiency' branch.
--     Lane B (NHS-5) also replaces this function; NHS-8 reconciles the two.
-- ---------------------------------------------------------------------------------------------

create or replace function private.seed_module_defaults(p_org uuid, p_module text, p_pack text default 'general',
                                                        p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_more jsonb;
  v_map jsonb;
begin
  if p_module <> 'core' and not (p_module = any (private.module_keys())) then
    raise exception 'Unknown module %', p_module using errcode = '22023';
  end if;

  if p_module = 'core' then
    select coalesce(jsonb_agg(jsonb_build_object('list', 'governance_role', 'value', r.value, 'label', r.label)
                              order by r.sort_order), '[]'::jsonb)
      into v_items
    from private.pack_governance_roles(p_pack) r
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'governance_role' and l.value = r.value);
    if p_apply then
      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'governance_role', r.value, r.label,
             r.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'governance_role'), 0)
      from private.pack_governance_roles(p_pack) r
      on conflict (organisation_id, list_key, value) do nothing;
    end if;
  end if;

  -- NHS-1: board assurance.
  if p_module = 'assurance' then
    select coalesce(jsonb_agg(jsonb_build_object('list', 'risk_appetite', 'value', r.value, 'label', r.label)
                              order by r.sort_order), '[]'::jsonb)
      into v_more
    from private.risk_appetite_levels() r
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'risk_appetite' and l.value = r.value);
    v_items := v_items || v_more;
    if p_apply then
      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'risk_appetite', r.value, r.label,
             r.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'risk_appetite'), 0)
      from private.risk_appetite_levels() r
      on conflict (organisation_id, list_key, value) do nothing;
    end if;

    if p_pack = 'nhs' and not exists (select 1 from public.organisations o
                                      where o.id = p_org and coalesce(o.settings -> 'assurance' ->> 'matrixKey', '') <> '') then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'setting', 'assurance.matrixKey', 'value', 'nhs_5x5', 'label', 'NHS 5×5 matrix for new strategic risks'));
      if p_apply then
        update public.organisations o
           set settings = jsonb_set(o.settings, '{assurance}',
                                    coalesce(o.settings -> 'assurance', '{}'::jsonb) || '{"matrixKey":"nhs_5x5"}'::jsonb)
         where o.id = p_org;
      end if;
    end if;
  end if;

  -- NHS-2: NHS benefit categories, measure unit presets and default classifications. NHS-only by
  -- nature, so the same whichever pack the organisation has.
  if p_module = 'benefit_categories_nhs' then
    select coalesce(jsonb_agg(jsonb_build_object('list', 'benefit_category', 'value', c.value, 'label', c.label)
                              order by c.sort_order), '[]'::jsonb)
      into v_more
    from private.nhs_benefit_categories() c
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'benefit_category' and l.value = c.value);
    v_items := v_items || v_more;

    select coalesce(jsonb_agg(jsonb_build_object('list', 'measure_unit', 'value', u.value, 'label', u.label)
                              order by u.sort_order), '[]'::jsonb)
      into v_more
    from private.measure_unit_presets() u
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'measure_unit' and l.value = u.value);
    v_items := v_items || v_more;

    -- Default classification for each NHS category the organisation hasn't mapped yet.
    select coalesce(jsonb_object_agg(c.value, c.classification::text), '{}'::jsonb)
      into v_map
    from private.nhs_benefit_categories() c, public.organisations o
    where o.id = p_org
      and not coalesce(o.settings -> 'benefits' -> 'categoryClassification' ? c.value, false);
    if v_map <> '{}'::jsonb then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'setting', 'benefits.categoryClassification', 'value', v_map,
        'label', 'Default cash-releasing / non-cash classification for the NHS benefit categories'));
    end if;

    if p_apply then
      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'benefit_category', c.value, c.label,
             c.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'benefit_category'), 0)
      from private.nhs_benefit_categories() c
      on conflict (organisation_id, list_key, value) do nothing;

      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'measure_unit', u.value, u.label,
             u.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'measure_unit'), 0)
      from private.measure_unit_presets() u
      on conflict (organisation_id, list_key, value) do nothing;

      if v_map <> '{}'::jsonb then
        update public.organisations o
           set settings = jsonb_set(
                 case when jsonb_typeof(o.settings -> 'benefits') = 'object' then o.settings
                      else o.settings || jsonb_build_object('benefits', '{}'::jsonb) end,
                 '{benefits,categoryClassification}',
                 v_map || coalesce(case when jsonb_typeof(o.settings -> 'benefits' -> 'categoryClassification') = 'object'
                                        then o.settings -> 'benefits' -> 'categoryClassification' end, '{}'::jsonb))
         where o.id = p_org;
      end if;
    end if;
  end if;

  -- NHS-4: efficiency categories (private.seed_efficiency_defaults).
  if p_module = 'efficiency' then
    v_items := v_items || private.seed_efficiency_defaults(p_org, p_pack, p_apply);
  end if;

  return v_items;
end;
$$;
