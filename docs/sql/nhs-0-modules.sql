-- Copy of supabase/migrations/20261122150000_nhs_0_modules.sql for review. Apply the migration
-- file (not this copy) to production after review; nothing in it is destructive.

-- NHS-0 Modules and sector packs foundation (docs/nhs-module-plan.md § NHS-0,
-- docs/sql/nhs-0-modules.sql). Written by an unattended run on 22/11/2026: tested on the local
-- Postgres only, NOT applied to production. Nothing here is destructive (no drop, delete or
-- truncate); one function is replaced (decide_approval_step) and one extended
-- (read_only_write_allowed), each with its previous body kept and one rule added.
--
-- Design
-- - organisations.settings.modules: { <module key>: true|false }. Unknown keys are ignored and a
--   missing key is off. Changed through set_organisation_module / apply_sector_pack (admins), or
--   the normal settings save (admins, organisations_role_scope). Every change is audited by a
--   trigger, whichever route wrote it.
-- - organisations.settings.pack: 'general' | 'nhs'. A sector pack is a bundle of modules plus
--   terminology and seeded defaults. It sits beside the GL-8 sector (university | public_sector
--   | general), which is unchanged: an NHS organisation is sector public_sector (April financial
--   year, neutral public-sector lists) with pack nhs. See "Decisions for Chris" in
--   docs/nhs-run-log.md for why NHS isn't a fourth sector value.
-- - Terminology for module concepts lives in the existing settings.terminology.terms map under
--   dotted keys (efficiency.scheme, impactAssessment.name, orgUnit …). Applying a pack only adds
--   keys the organisation doesn't have; it never overwrites one.
-- - private.seed_module_defaults(org, module, pack, apply) is the idempotent per-module seeder
--   later packages extend. NHS-0 seeds the 'core' defaults: the governance roles list.
-- - Governance roles: lookup_values list 'governance_role' (editable like any list) and
--   governance_role_holders (organisation, role key, member, deputy flag). approval_steps gains an
--   optional governance_role: decide_approval_step then only accepts a holder (or deputy) of that
--   role. Steps without one behave exactly as before.
-- - Decisions on approval steps can no longer be written by a direct client update; they go
--   through decide_approval_step as the UI already does.
-- - The financial year is never changed by a pack (plan NHS-0 rule 1): the preview reports it.

-- ---------------------------------------------------------------------------------------------
-- 1. Settings shape (additive check constraints)
-- ---------------------------------------------------------------------------------------------

alter table public.organisations
  add constraint organisations_settings_modules_check
  check (settings -> 'modules' is null or jsonb_typeof(settings -> 'modules') = 'object')
  not valid;
alter table public.organisations validate constraint organisations_settings_modules_check;

alter table public.organisations
  add constraint organisations_settings_pack_check
  check (settings -> 'pack' is null or settings ->> 'pack' in ('general', 'nhs'))
  not valid;
alter table public.organisations validate constraint organisations_settings_pack_check;

-- ---------------------------------------------------------------------------------------------
-- 2. Module registry (mirrors src/lib/modules.ts; change both together)
-- ---------------------------------------------------------------------------------------------

create function private.module_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['assurance', 'benefit_categories_nhs', 'impact_assessment', 'efficiency',
               'five_case', 'clinical_safety', 'cross_org'];
$$;
revoke execute on function private.module_keys() from public, anon;
grant execute on function private.module_keys() to authenticated, service_role;

create function private.pack_modules(p_pack text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_pack when 'nhs' then private.module_keys() else array[]::text[] end;
$$;
revoke execute on function private.pack_modules(text) from public, anon;

-- True when the module is switched on for the organisation. Used by later packages' RPCs and
-- RLS, so signed-in users can run it (it only reads the one flag).
create function private.module_enabled(p_org uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select o.settings -> 'modules' -> p_key = 'true'::jsonb from public.organisations o where o.id = p_org),
    false);
$$;
revoke execute on function private.module_enabled(uuid, text) from public, anon;
grant execute on function private.module_enabled(uuid, text) to authenticated, service_role;

create function private.assert_module_enabled(p_org uuid, p_key text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.module_enabled(p_org, p_key) then
    raise exception 'This module is switched off for your organisation. An admin can switch it on in Settings › Modules.'
      using errcode = 'P0001', hint = 'module_off';
  end if;
end;
$$;
revoke execute on function private.assert_module_enabled(uuid, text) from public, anon;
grant execute on function private.assert_module_enabled(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Pack defaults: terminology and governance roles (mirrors src/data/sector-packs.ts)
-- ---------------------------------------------------------------------------------------------

-- Terms a pack fills in when the organisation hasn't set them. The general pack adds none: the
-- neutral wording is the app's fallback.
create function private.pack_terminology(p_pack text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_pack
    when 'nhs' then jsonb_build_object(
      'orgUnit', 'Directorate',
      'orgUnitPlural', 'Directorates',
      'assurance.name', 'Board Assurance Framework',
      'assurance.strategicRisk', 'BAF risk',
      'impactAssessment.name', 'QIA / EqIA',
      'impactAssessment.short', 'QIA',
      'efficiency.programme', 'CIP',
      'efficiency.scheme', 'CIP scheme',
      'efficiency.schemePlural', 'CIP schemes',
      'fiveCase.name', 'Five Case Model business case',
      'clinicalSafety.name', 'Clinical safety',
      'crossOrg.programme', 'ICS programme',
      'crossOrg.partner', 'Partner organisation')
    else '{}'::jsonb end;
$$;
revoke execute on function private.pack_terminology(text) from public, anon;

create function private.pack_governance_roles(p_pack text)
returns table (value text, label text, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select v.value, v.label, v.sort_order
  from (values
    ('nhs', 'medical_director', 'Medical Director', 1),
    ('nhs', 'chief_nurse', 'Chief Nurse / Director of Nursing', 2),
    ('nhs', 'director_of_finance', 'Director of Finance', 3),
    ('nhs', 'chief_operating_officer', 'Chief Operating Officer', 4),
    ('nhs', 'clinical_safety_officer', 'Clinical Safety Officer', 5),
    ('nhs', 'caldicott_guardian', 'Caldicott Guardian', 6),
    ('nhs', 'siro', 'Senior Information Risk Owner (SIRO)', 7),
    ('nhs', 'head_of_pmo', 'Head of PMO', 8),
    ('general', 'executive_sponsor', 'Executive sponsor', 1),
    ('general', 'finance_lead', 'Finance lead', 2),
    ('general', 'head_of_pmo', 'Head of PMO', 3),
    ('general', 'quality_lead', 'Quality lead', 4)
  ) as v(pack, value, label, sort_order)
  where v.pack = case when p_pack = 'nhs' then 'nhs' else 'general' end;
$$;
revoke execute on function private.pack_governance_roles(text) from public, anon;

-- ---------------------------------------------------------------------------------------------
-- 4. Idempotent per-module seeding. Only inserts what is missing (by value); never renames,
--    reactivates or overwrites anything the organisation has. Returns what it added (or, with
--    p_apply false, what it would add). Later packages add their module's branch here.
-- ---------------------------------------------------------------------------------------------

create function private.seed_module_defaults(p_org uuid, p_module text, p_pack text default 'general',
                                             p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb := '[]'::jsonb;
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

  return v_items;
end;
$$;
revoke execute on function private.seed_module_defaults(uuid, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Applying a pack, with a preview from the same code path
-- ---------------------------------------------------------------------------------------------

create function private.sector_pack_plan(p_org uuid, p_pack text, p_modules text[], p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_modules text[];
  v_on text[] := array[]::text[];
  v_already text[] := array[]::text[];
  v_terms jsonb;
  v_pack_terms jsonb := private.pack_terminology(p_pack);
  v_add_terms jsonb := '{}'::jsonb;
  v_kept text[] := array[]::text[];
  v_seeded jsonb := '[]'::jsonb;
  v_fy integer;
  k text;
begin
  if p_pack is null or p_pack not in ('general', 'nhs') then
    raise exception 'Choose the General or NHS pack' using errcode = '22023';
  end if;
  v_modules := coalesce(p_modules, private.pack_modules(p_pack));
  if exists (select 1 from unnest(v_modules) m where not (m = any (private.module_keys()))) then
    raise exception 'Unknown module in %', v_modules using errcode = '22023';
  end if;

  select o.settings into v_settings from public.organisations o where o.id = p_org for update;
  if v_settings is null then
    raise exception 'Organisation not found' using errcode = '42501';
  end if;

  foreach k in array v_modules loop
    if v_settings -> 'modules' -> k = 'true'::jsonb then v_already := v_already || k;
    else v_on := v_on || k; end if;
  end loop;

  v_terms := coalesce(v_settings -> 'terminology' -> 'terms', '{}'::jsonb);
  for k in select jsonb_object_keys(v_pack_terms) loop
    if v_terms ? k then v_kept := v_kept || k;
    else v_add_terms := v_add_terms || jsonb_build_object(k, v_pack_terms -> k); end if;
  end loop;

  v_seeded := private.seed_module_defaults(p_org, 'core', p_pack, p_apply);
  foreach k in array v_modules loop
    v_seeded := v_seeded || private.seed_module_defaults(p_org, k, p_pack, p_apply);
  end loop;

  v_fy := coalesce((v_settings -> 'regional' ->> 'financialYearStartMonth')::integer, 1);

  if p_apply then
    update public.organisations o set settings =
      jsonb_set(
        jsonb_set(o.settings || jsonb_build_object('pack', p_pack),
                  '{modules}',
                  coalesce(o.settings -> 'modules', '{}'::jsonb)
                    || coalesce((select jsonb_object_agg(m, true) from unnest(v_modules) m), '{}'::jsonb)),
        '{terminology}',
        coalesce(o.settings -> 'terminology', '{}'::jsonb)
          || jsonb_build_object('terms', v_terms || v_add_terms))
    where o.id = p_org;
  end if;

  return jsonb_build_object(
    'pack', p_pack,
    'previous_pack', coalesce(v_settings ->> 'pack', 'general'),
    'modules_on', to_jsonb(v_on),
    'modules_already_on', to_jsonb(v_already),
    'terms_added', v_add_terms,
    'terms_kept', to_jsonb(v_kept),
    'seeded', v_seeded,
    'financial_year_start_month', v_fy,
    'suggested_financial_year_start_month', case p_pack when 'nhs' then 4 else null end,
    'applied', p_apply);
end;
$$;
revoke execute on function private.sector_pack_plan(uuid, text, text[], boolean) from public, anon, authenticated;

-- What applying the pack would do; changes nothing.
create function public.preview_sector_pack(p_org uuid, p_pack text, p_modules text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_org_admin(p_org);
  return private.sector_pack_plan(p_org, p_pack, p_modules, false);
end;
$$;
revoke execute on function public.preview_sector_pack(uuid, text, text[]) from public, anon;
grant execute on function public.preview_sector_pack(uuid, text, text[]) to authenticated;

-- Switch on the pack's modules (or the chosen subset), fill missing terms and seed the defaults.
-- Never switches anything off, never changes the financial year or existing records.
create function public.apply_sector_pack(p_org uuid, p_pack text, p_modules text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_org_admin(p_org);
  return private.sector_pack_plan(p_org, p_pack, p_modules, true);
end;
$$;
revoke execute on function public.apply_sector_pack(uuid, text, text[]) from public, anon;
grant execute on function public.apply_sector_pack(uuid, text, text[]) to authenticated;

-- Switch one module on or off. Switching off hides it and keeps its data; switching on seeds the
-- module's (and the core) defaults for the organisation's pack, idempotently.
create function public.set_organisation_module(p_org uuid, p_key text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack text;
  v_modules jsonb;
begin
  perform private.assert_org_admin(p_org);
  if p_key is null or not (p_key = any (private.module_keys())) then
    raise exception 'Unknown module %', p_key using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'Choose on or off' using errcode = '22023';
  end if;
  select coalesce(o.settings ->> 'pack', 'general') into v_pack from public.organisations o where o.id = p_org for update;
  if p_enabled then
    perform private.seed_module_defaults(p_org, 'core', v_pack, true);
    perform private.seed_module_defaults(p_org, p_key, v_pack, true);
  end if;
  update public.organisations o
     set settings = jsonb_set(o.settings, '{modules}',
                              coalesce(o.settings -> 'modules', '{}'::jsonb) || jsonb_build_object(p_key, p_enabled))
   where o.id = p_org
  returning o.settings -> 'modules' into v_modules;
  return v_modules;
end;
$$;
revoke execute on function public.set_organisation_module(uuid, text, boolean) from public, anon;
grant execute on function public.set_organisation_module(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Audit module and pack changes, whichever route wrote them. Action 'update' with
--    detail.event (as GL-11b), so audit_log_action_check is untouched.
-- ---------------------------------------------------------------------------------------------

create function private.audit_organisation_modules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  if private.in_purge() then return null; end if;
  select coalesce(jsonb_object_agg(k, jsonb_build_object(
           'from', coalesce(old.settings -> 'modules' -> k = 'true'::jsonb, false),
           'to', coalesce(new.settings -> 'modules' -> k = 'true'::jsonb, false))), '{}'::jsonb)
    into v_changes
  from (select jsonb_object_keys(coalesce(old.settings -> 'modules', '{}'::jsonb)) k
        union select jsonb_object_keys(coalesce(new.settings -> 'modules', '{}'::jsonb))) keys
  where coalesce(old.settings -> 'modules' -> k = 'true'::jsonb, false)
        is distinct from coalesce(new.settings -> 'modules' -> k = 'true'::jsonb, false);
  if v_changes <> '{}'::jsonb or (old.settings -> 'pack') is distinct from (new.settings -> 'pack') then
    perform private.write_audit(new.id, 'update', 'organisations', new.id,
      jsonb_build_object('event', 'modules.changed', 'modules', v_changes,
                         'pack', jsonb_build_object('from', old.settings -> 'pack', 'to', new.settings -> 'pack')));
  end if;
  return null;
end;
$$;
revoke execute on function private.audit_organisation_modules() from public, anon, authenticated;

create trigger organisations_20_module_audit after update of settings on public.organisations
  for each row
  when ((old.settings -> 'modules') is distinct from (new.settings -> 'modules')
        or (old.settings -> 'pack') is distinct from (new.settings -> 'pack'))
  execute function private.audit_organisation_modules();

-- ---------------------------------------------------------------------------------------------
-- 7. Governance role holders. Organisation-scoped (organisation_id only), like
--    organisation_members: a Medical Director holds the role across every workspace. Added to the
--    AGENTS.md organisation-scoped list (pending Chris's approval, see the run log).
-- ---------------------------------------------------------------------------------------------

create table public.governance_role_holders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  role_key text not null check (role_key ~ '^[a-z][a-z0-9_]{1,59}$'),
  profile_id uuid not null,
  is_deputy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (organisation_id, role_key, profile_id),
  -- Removing the member (or closing their account) removes their governance roles.
  foreign key (organisation_id, profile_id) references public.organisation_members (organisation_id, profile_id)
    on delete cascade
);
create index governance_role_holders_member_idx on public.governance_role_holders (organisation_id, profile_id);
create index governance_role_holders_profile_idx on public.governance_role_holders (profile_id);
create index governance_role_holders_created_by_idx on public.governance_role_holders (created_by);

-- The role must be on the organisation's governance roles list.
create function private.governance_role_holder_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.lookup_values l
                 where l.organisation_id = new.organisation_id and l.list_key = 'governance_role'
                   and l.value = new.role_key) then
    raise exception 'Unknown governance role %. Add it to the Governance roles list first.', new.role_key
      using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke execute on function private.governance_role_holder_check() from public, anon, authenticated;

-- A constraint trigger (after the statement's rows), so a list value and a holder inserted in one
-- statement work.
create constraint trigger governance_role_holders_role_check after insert or update of role_key, organisation_id
  on public.governance_role_holders for each row execute function private.governance_role_holder_check();
create trigger governance_role_holders_updated_at before update on public.governance_role_holders
  for each row execute function private.set_updated_at();
create trigger governance_role_holders_audit after insert or update or delete on public.governance_role_holders
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.governance_role_holders
  for each row execute function private.enforce_org_writable();

alter table public.governance_role_holders enable row level security;
revoke all on public.governance_role_holders from anon, authenticated;
grant select, insert, update, delete on public.governance_role_holders to authenticated;
create policy governance_role_holders_select on public.governance_role_holders for select to authenticated
  using (organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy governance_role_holders_insert on public.governance_role_holders for insert to authenticated
  with check (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[]));
create policy governance_role_holders_update on public.governance_role_holders for update to authenticated
  using (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[]))
  with check (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[]));
create policy governance_role_holders_delete on public.governance_role_holders for delete to authenticated
  using (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[]));

create function private.holds_governance_role(p_org uuid, p_key text, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.governance_role_holders h
                 where h.organisation_id = p_org and h.role_key = p_key and h.profile_id = p_profile);
$$;
revoke execute on function private.holds_governance_role(uuid, text, uuid) from public, anon;
grant execute on function private.holds_governance_role(uuid, text, uuid) to authenticated, service_role;

-- Removing a governance role while the organisation is read-only is allowed (it happens when a
-- member is removed, which GL-4 allows). Previous body unchanged; one branch added (NHS-0).
create or replace function private.read_only_write_allowed(p_table text, p_op text, p_old jsonb, p_new jsonb)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select case
    -- Members: leave, step down to viewer, or join as viewer.
    when p_table in ('organisation_members', 'workspace_members') then
      case p_op
        when 'DELETE' then true
        when 'INSERT' then p_new ->> 'role' = 'viewer'
        when 'UPDATE' then p_new ->> 'role' = 'viewer'
          and (p_old - 'role' - 'updated_at') = (p_new - 'role' - 'updated_at')
        else false
      end

    -- NHS-0: governance roles go with the member.
    when p_table = 'governance_role_holders' then p_op = 'DELETE'

    -- Invites: revoke any pending invite; create and work with viewer invites.
    when p_table = 'organisation_invites' then
      case p_op
        when 'INSERT' then p_new ->> 'role' = 'viewer'
        when 'UPDATE' then
          (p_old ->> 'role' = 'viewer' and p_new ->> 'role' = 'viewer')
          or (p_old -> 'revoked_at' = 'null'::jsonb and p_new -> 'revoked_at' <> 'null'::jsonb
              and (p_old - 'revoked_at' - 'revoked_by' - 'updated_at')
                = (p_new - 'revoked_at' - 'revoked_by' - 'updated_at'))
        else false
      end
    when p_table = 'organisation_invite_workspaces' and p_op = 'INSERT' then
      exists (select 1 from public.organisation_invites i
              where i.id = (p_new ->> 'invite_id')::uuid and i.role = 'viewer')

    -- Resources: unlink a removed member; link or create the resource for a new viewer member
    -- (private.link_profile_to_resource). team_list is a generated column, NULL in NEW inside a
    -- BEFORE trigger, so it's left out of the comparison.
    when p_table = 'resources' and p_op = 'UPDATE' then
      (p_old - 'profile_id' - 'updated_at' - 'team_list') = (p_new - 'profile_id' - 'updated_at' - 'team_list')
      and (p_new -> 'profile_id' = 'null'::jsonb
           or (p_old -> 'profile_id' = 'null'::jsonb
               and exists (select 1 from public.organisation_members m
                           where m.organisation_id = (p_new ->> 'organisation_id')::uuid
                             and m.profile_id = (p_new ->> 'profile_id')::uuid
                             and m.role = 'viewer')))
    when p_table = 'resources' and p_op = 'INSERT' then
      (p_new ->> 'is_bookable')::boolean is false
      and exists (select 1 from public.organisation_members m
                  where m.organisation_id = (p_new ->> 'organisation_id')::uuid
                    and m.profile_id = (p_new ->> 'profile_id')::uuid
                    and m.role = 'viewer')

    -- Join requests: decline, approve as viewer, or withdraw (by the requester, or by
    -- accepting an invite).
    when p_table = 'organisation_join_requests' and p_op = 'UPDATE' then
      p_old ->> 'status' = 'pending'
      and (p_new ->> 'status' in ('declined', 'withdrawn')
           or (p_new ->> 'status' = 'approved' and p_new ->> 'decided_role' = 'viewer'))
      and (p_old - 'status' - 'decided_role' - 'decided_by' - 'decided_at' - 'updated_at')
        = (p_new - 'status' - 'decided_role' - 'decided_by' - 'decided_at' - 'updated_at')

    else false
  end;
$$;
revoke execute on function private.read_only_write_allowed(text, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 8. Approval steps that need a governance role
-- ---------------------------------------------------------------------------------------------

alter table public.approval_steps
  add column governance_role text check (governance_role is null or governance_role ~ '^[a-z][a-z0-9_]{1,59}$');

comment on column public.approval_steps.governance_role is
  'NHS-0: when set, only a holder (or deputy) of this governance role (governance_role_holders) can decide the step.';

-- Decisions are recorded only through decide_approval_step (SECURITY DEFINER, so current_user is
-- the owner there). A direct client insert or update can't set or change them, nor change a
-- decided step's role.
create function private.approval_steps_decision_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.decision is not null or new.decided_at is not null or new.approver_id is not null then
      raise exception 'Record approval decisions through the approval panel.' using errcode = '42501';
    end if;
  elsif (new.decision, new.decided_at, new.approver_id, new.comment)
        is distinct from (old.decision, old.decided_at, old.approver_id, old.comment)
     or (old.decision is not null and (new.governance_role, new.required_role, new.step_order)
                                      is distinct from (old.governance_role, old.required_role, old.step_order)) then
    raise exception 'Record approval decisions through the approval panel.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.approval_steps_decision_guard() from public, anon, authenticated;

create trigger approval_steps_10_decision_guard before insert or update on public.approval_steps
  for each row execute function private.approval_steps_decision_guard();

-- Previous body (rb1_report_builder_foundations) unchanged apart from the governance role check.
create or replace function public.decide_approval_step(p_step_id uuid, p_decision text, p_comment text default null)
returns public.approval_steps
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.approval_steps;
  v_label text;
begin
  select * into s from public.approval_steps where id = p_step_id for update;
  if s.id is null or not (s.workspace_id = any (private.my_workspace_ids('contributor'))) then
    raise exception 'You can''t decide this approval step.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approve or reject.' using errcode = '22023';
  end if;
  if s.decision is not null then
    raise exception 'This step is already decided.' using errcode = '22023';
  end if;
  -- NHS-0: a step that names a governance role is decided only by someone who holds it.
  if s.governance_role is not null
     and not private.holds_governance_role(s.organisation_id, s.governance_role, (select auth.uid())) then
    select l.label into v_label from public.lookup_values l
     where l.organisation_id = s.organisation_id and l.list_key = 'governance_role' and l.value = s.governance_role;
    raise exception 'Only the % (or their deputy) can decide this step.', coalesce(v_label, s.governance_role)
      using errcode = '42501', hint = 'governance_role_required';
  end if;
  update public.approval_steps set decision = p_decision, decided_at = now(), approver_id = (select auth.uid()),
    comment = nullif(btrim(coalesce(p_comment, '')), '')
  where id = s.id returning * into s;
  update public.approval_gates g set
    status = case when exists (select 1 from public.approval_steps x where x.gate_id = g.id and x.decision = 'rejected') then 'rejected'
                  when not exists (select 1 from public.approval_steps x where x.gate_id = g.id and x.decision is distinct from 'approved') then 'approved'
                  else 'pending' end,
    decided_at = case when exists (select 1 from public.approval_steps x where x.gate_id = g.id and x.decision is null)
                        and not exists (select 1 from public.approval_steps x where x.gate_id = g.id and x.decision = 'rejected')
                      then null else now() end
  where g.id = s.gate_id;
  return s;
end;
$$;
revoke all on function public.decide_approval_step(uuid, text, text) from public, anon;
grant execute on function public.decide_approval_step(uuid, text, text) to authenticated;
