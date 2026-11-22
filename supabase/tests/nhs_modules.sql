-- NHS-0: modules, sector packs, governance roles and governance-role approval steps
-- (supabase/migrations/20261122150000_nhs_0_modules.sql, docs/sql/nhs-0-modules.sql). Needs only
-- the migrations (no seed): creates its own organisation, runs inside a transaction and rolls
-- everything back. Each check raises on failure; the last line prints the count passed.
-- Cross-tenant cases are in cross_tenant.sql.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/nhs_modules.sql
\set ON_ERROR_STOP 1
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;
create temp table snap (k text primary key, v text);
grant all on snap to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9000000-0000-4000-8000-000000000001', 'nhs0.admin@example.com', now(), '{}'),
  ('e9000000-0000-4000-8000-000000000002', 'nhs0.pmo@example.com', now(), '{}'),
  ('e9000000-0000-4000-8000-000000000003', 'nhs0.contrib@example.com', now(), '{}'),
  ('e9000000-0000-4000-8000-000000000004', 'nhs0.viewer@example.com', now(), '{}'),
  ('e9000000-0000-4000-8000-000000000005', 'nhs0.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9000000-0000-4000-8000-000000000001', 'nhs0.admin@example.com', 'NHS0 Admin'),
  ('e9000000-0000-4000-8000-000000000002', 'nhs0.pmo@example.com', 'NHS0 PMO'),
  ('e9000000-0000-4000-8000-000000000003', 'nhs0.contrib@example.com', 'NHS0 Contributor'),
  ('e9000000-0000-4000-8000-000000000004', 'nhs0.viewer@example.com', 'NHS0 Viewer'),
  ('e9000000-0000-4000-8000-000000000005', 'nhs0.outsider@example.com', 'NHS0 Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9000000-0000-4000-8000-000000000001'),
  ('pmo', 'e9000000-0000-4000-8000-000000000002'), ('contrib', 'e9000000-0000-4000-8000-000000000003'),
  ('viewer', 'e9000000-0000-4000-8000-000000000004'), ('outsider', 'e9000000-0000-4000-8000-000000000005');

create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'anon', true), set_config('role', 'anon', true); $$;
create function pg_temp.as_owner() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true); $$;
create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update passed set n = n + 1;
end $$;
create function pg_temp.raises(name text, sql text, state text, hint text default null) returns void language plpgsql as $$
declare v_state text; v_hint text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    perform pg_temp.ok(name || ' [' || v_state || coalesce(' ' || v_hint, '') || ']',
                       v_state = state and (hint is null or v_hint = hint));
    return;
  end;
  raise exception 'FAIL: % (no error)', name;
end $$;
create function pg_temp.c(k text) returns uuid language sql stable as $$ select v from ctx where ctx.k = c.k $$;
grant execute on function pg_temp.c(text) to authenticated, anon;
create function pg_temp.settings() returns jsonb language sql stable security definer as $$
  select settings from public.organisations where id = pg_temp.c('org') $$;
create function pg_temp.roles() returns bigint language sql stable security definer as $$
  select count(*) from public.lookup_values where organisation_id = pg_temp.c('org') and list_key = 'governance_role' $$;
create function pg_temp.events() returns bigint language sql stable security definer as $$
  select count(*) from public.audit_log where organisation_id = pg_temp.c('org') and entity_table = 'organisations'
    and detail ->> 'event' = 'modules.changed' $$;
-- A fingerprint of the organisation's existing records: a pack must never change them.
create function pg_temp.records() returns text language sql stable security definer as $$
  select md5(concat_ws('|',
    (select string_agg(to_jsonb(r)::text, ',' order by r.id) from public.risks r where r.organisation_id = pg_temp.c('org')),
    (select string_agg(to_jsonb(p)::text, ',' order by p.id) from public.projects p where p.organisation_id = pg_temp.c('org')),
    (select string_agg(to_jsonb(b)::text, ',' order by b.id) from public.benefits b where b.organisation_id = pg_temp.c('org')),
    (select string_agg(to_jsonb(f)::text, ',' order by f.id) from public.financial_values f where f.organisation_id = pg_temp.c('org')),
    (select string_agg(l.list_key || ':' || l.value || ':' || l.label, ',' order by l.list_key, l.value)
       from public.lookup_values l where l.organisation_id = pg_temp.c('org') and l.list_key not in ('governance_role', 'risk_appetite')),
    (select settings -> 'regional' from public.organisations where id = pg_temp.c('org')))) $$;

-- An existing public-sector organisation with sample data (projects, risks, benefits).
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS0 Org', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('org'));
select pg_temp.as_owner();
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('org'), pg_temp.c('pmo'), 'pmo'), (pg_temp.c('org'), pg_temp.c('contrib'), 'contributor'),
  (pg_temp.c('org'), pg_temp.c('viewer'), 'viewer');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('contrib'), 'contributor')
on conflict do nothing;
-- The admin had already renamed the organisation unit (a pack must keep it) and left one term blank
-- (a pack fills it).
update public.organisations set settings = jsonb_set(settings, '{terminology}',
  coalesce(settings -> 'terminology', '{}') || jsonb_build_object('terms',
    coalesce(settings -> 'terminology' -> 'terms', '{}') || '{"orgUnit": "Department", "efficiency.scheme": " "}'))
where id = pg_temp.c('org');
insert into snap values ('records', pg_temp.records());

-- 1. Defaults: every module off.
select pg_temp.ok('modules off by default',
  not exists (select 1 from unnest(private.module_keys()) k where private.module_enabled(pg_temp.c('org'), k)));
select pg_temp.raises('assert_module_enabled refuses an off module',
  $$select private.assert_module_enabled(pg_temp.c('org'), 'efficiency')$$, 'P0001', 'module_off');
select pg_temp.ok('an unknown key reads as off', not private.module_enabled(pg_temp.c('org'), 'not_a_module'));

-- 2. Who can switch modules.
select pg_temp.as_anon();
select pg_temp.raises('anon can''t switch a module',
  $$select public.set_organisation_module(pg_temp.c('org'), 'efficiency', true)$$, '42501');
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.raises('PMO can''t switch a module',
  $$select public.set_organisation_module(pg_temp.c('org'), 'efficiency', true)$$, '42501');
select pg_temp.raises('PMO can''t preview a pack', $$select public.preview_sector_pack(pg_temp.c('org'), 'nhs')$$, '42501');
select pg_temp.raises('PMO can''t write modules through the settings document',
  $$update public.organisations set settings = jsonb_set(settings, '{modules}', '{"efficiency": true}') where id = pg_temp.c('org')$$,
  '42501');
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.raises('an outsider can''t apply a pack', $$select public.apply_sector_pack(pg_temp.c('org'), 'nhs')$$, '42501');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('unknown module', $$select public.set_organisation_module(pg_temp.c('org'), 'teleport', true)$$, '22023');
select pg_temp.raises('unknown pack', $$select public.apply_sector_pack(pg_temp.c('org'), 'nasa')$$, '22023');
select pg_temp.raises('unknown module in a pack subset',
  $$select public.apply_sector_pack(pg_temp.c('org'), 'nhs', array['efficiency', 'teleport'])$$, '22023');

-- 3. Switching one module on seeds the core defaults (general roles) once, and is audited.
select pg_temp.ok('switch on', (public.set_organisation_module(pg_temp.c('org'), 'efficiency', true) ->> 'efficiency')::boolean);
select pg_temp.ok('module enabled', private.module_enabled(pg_temp.c('org'), 'efficiency'));
select pg_temp.ok('general governance roles seeded', pg_temp.roles() = 4);
select pg_temp.ok('switch audited', pg_temp.events() = 1);
select public.set_organisation_module(pg_temp.c('org'), 'efficiency', true);
select pg_temp.ok('seeding is idempotent', pg_temp.roles() = 4);
select pg_temp.ok('no change, no audit row', pg_temp.events() = 1);
select pg_temp.as_owner();
update public.lookup_values set label = 'Our PMO lead' where organisation_id = pg_temp.c('org')
  and list_key = 'governance_role' and value = 'head_of_pmo';
select pg_temp.as_user(pg_temp.c('admin'));

-- 4. Preview changes nothing.
insert into snap select 'settings', pg_temp.settings()::text;
insert into snap select 'preview', public.preview_sector_pack(pg_temp.c('org'), 'nhs')::text;
select pg_temp.ok('preview leaves settings', pg_temp.settings()::text = (select v from snap where k = 'settings'));
select pg_temp.ok('preview seeds nothing', pg_temp.roles() = 4);
select pg_temp.ok('preview lists six modules to switch on',
  jsonb_array_length((select v::jsonb from snap where k = 'preview') -> 'modules_on') = 6
  and (select v::jsonb from snap where k = 'preview') -> 'modules_already_on' = '["efficiency"]');
select pg_temp.ok('preview keeps a customised term',
  (select v::jsonb from snap where k = 'preview') -> 'terms_kept' = '["orgUnit"]'
  and not ((select v::jsonb from snap where k = 'preview') -> 'terms_added' ? 'orgUnit')
  and (select v::jsonb from snap where k = 'preview') -> 'terms_added' ->> 'efficiency.scheme' = 'CIP scheme');
select pg_temp.ok('preview lists the seven NHS roles still missing',
  jsonb_array_length(jsonb_path_query_array((select v::jsonb from snap where k = 'preview') -> 'seeded',
    '$[*] ? (@.list == "governance_role")')) = 7);
select pg_temp.ok('preview reports the financial year and the April suggestion',
  ((select v::jsonb from snap where k = 'preview') ->> 'financial_year_start_month')::int = 4
  and ((select v::jsonb from snap where k = 'preview') ->> 'suggested_financial_year_start_month')::int = 4);

-- 5. Apply the NHS pack.
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.ok('pack stored', pg_temp.settings() ->> 'pack' = 'nhs');
select pg_temp.ok('all seven modules on',
  (select bool_and(private.module_enabled(pg_temp.c('org'), k)) from unnest(private.module_keys()) k));
select pg_temp.ok('NHS roles added beside the general ones', pg_temp.roles() = 11);
select pg_temp.ok('an edited role label is kept', exists (select 1 from public.lookup_values where organisation_id = pg_temp.c('org')
  and list_key = 'governance_role' and value = 'head_of_pmo' and label = 'Our PMO lead'));
select pg_temp.ok('customised term kept', pg_temp.settings() -> 'terminology' -> 'terms' ->> 'orgUnit' = 'Department');
select pg_temp.ok('a blank term is filled', pg_temp.settings() -> 'terminology' -> 'terms' ->> 'efficiency.scheme' = 'CIP scheme');
select pg_temp.ok('missing terms filled', pg_temp.settings() -> 'terminology' -> 'terms' ->> 'impactAssessment.name' = 'QIA / EqIA');
select pg_temp.ok('existing records, lists and financial year unchanged', pg_temp.records() = (select v from snap where k = 'records'));
select pg_temp.ok('pack audited', pg_temp.events() = 2);
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.ok('applying twice changes nothing', pg_temp.roles() = 11 and pg_temp.events() = 2);

-- 6. Switching off hides the module and keeps its data.
select public.set_organisation_module(pg_temp.c('org'), 'clinical_safety', false);
select pg_temp.ok('switched off', not private.module_enabled(pg_temp.c('org'), 'clinical_safety'));
select pg_temp.ok('data kept when switched off', pg_temp.roles() = 11);
select pg_temp.ok('switch-off audited', pg_temp.events() = 3);
select pg_temp.as_owner();
select pg_temp.raises('pack must be general or nhs',
  $$update public.organisations set settings = settings || '{"pack": "nasa"}' where id = pg_temp.c('org')$$, '23514');
select pg_temp.raises('modules must be an object',
  $$update public.organisations set settings = settings || '{"modules": []}' where id = pg_temp.c('org')$$, '23514');

-- 7. Governance role holders.
select pg_temp.as_user(pg_temp.c('pmo'));
insert into public.governance_role_holders (organisation_id, role_key, profile_id)
values (pg_temp.c('org'), 'medical_director', pg_temp.c('admin'));
select pg_temp.ok('PMO assigns a role', private.holds_governance_role(pg_temp.c('org'), 'medical_director', pg_temp.c('admin')));
select pg_temp.raises('a role must be on the list',
  $$insert into public.governance_role_holders (organisation_id, role_key, profile_id) values (pg_temp.c('org'), 'astronaut', pg_temp.c('admin'))$$,
  '23503');
select pg_temp.raises('the holder must be a member',
  $$insert into public.governance_role_holders (organisation_id, role_key, profile_id) values (pg_temp.c('org'), 'chief_nurse', pg_temp.c('outsider'))$$,
  '23503');
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.ok('members see who holds roles', (select count(*) from public.governance_role_holders) = 1);
select pg_temp.raises('a contributor can''t assign roles',
  $$insert into public.governance_role_holders (organisation_id, role_key, profile_id) values (pg_temp.c('org'), 'chief_nurse', pg_temp.c('contrib'))$$,
  '42501');
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('outsiders see none', (select count(*) from public.governance_role_holders) = 0);
select pg_temp.as_owner();
select pg_temp.ok('assignment audited', exists (select 1 from public.audit_log where entity_table = 'governance_role_holders'
  and organisation_id = pg_temp.c('org') and action = 'insert'));

-- 8. Approval steps that need a governance role.
insert into ctx select 'project', id from public.projects where organisation_id = pg_temp.c('org') order by created_at limit 1;
with g as (
  insert into public.approval_gates (organisation_id, workspace_id, project_id, entity_type, entity_id, gate_type, name)
  select organisation_id, workspace_id, id, 'project', id, 'nhs0', 'NHS0 gate' from public.projects where id = pg_temp.c('project')
  returning id)
insert into ctx select 'gate', id from g;
with s as (
  insert into public.approval_steps (organisation_id, workspace_id, gate_id, step_order, required_role)
  select organisation_id, workspace_id, id, 1, 'Sponsor' from public.approval_gates where id = pg_temp.c('gate') returning id)
insert into ctx select 'plain', id from s;
with s as (
  insert into public.approval_steps (organisation_id, workspace_id, gate_id, step_order, required_role, governance_role)
  select organisation_id, workspace_id, id, 2, 'Chief Nurse', 'chief_nurse' from public.approval_gates where id = pg_temp.c('gate') returning id)
insert into ctx select 'md', id from s;
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.raises('a direct update can''t record a decision',
  $$update public.approval_steps set decision = 'approved' where id = pg_temp.c('plain')$$, '42501');
select pg_temp.raises('a direct insert can''t carry a decision',
  $$insert into public.approval_steps (organisation_id, workspace_id, gate_id, step_order, required_role, decision)
    select organisation_id, workspace_id, id, 3, 'X', 'approved' from public.approval_gates where id = pg_temp.c('gate')$$, '42501');
select public.decide_approval_step(pg_temp.c('plain'), 'approved');
select pg_temp.ok('a step without a governance role works as before',
  (select decision from public.approval_steps where id = pg_temp.c('plain')) = 'approved');
select pg_temp.raises('a non-holder can''t decide a governance step',
  $$select public.decide_approval_step(pg_temp.c('md'), 'approved')$$, '42501', 'governance_role_required');
select pg_temp.as_user(pg_temp.c('pmo'));
insert into public.governance_role_holders (organisation_id, role_key, profile_id, is_deputy)
values (pg_temp.c('org'), 'chief_nurse', pg_temp.c('contrib'), true);
select pg_temp.as_user(pg_temp.c('contrib'));
select public.decide_approval_step(pg_temp.c('md'), 'approved', 'Deputising');
select pg_temp.ok('a deputy decides the step', (select decision from public.approval_steps where id = pg_temp.c('md')) = 'approved');
select pg_temp.ok('the gate follows its steps', (select status from public.approval_gates where id = pg_temp.c('gate')) = 'approved');
select pg_temp.raises('a decided step''s role can''t be changed directly',
  $$update public.approval_steps set governance_role = null where id = pg_temp.c('md')$$, '42501');

-- 9. Read-only: module changes refused, removing a member (and their roles) still allowed.
select pg_temp.as_owner();
update public.organisation_subscriptions set plan = 'trial', status = null, trial_ends_at = now() - interval '1 day'
 where organisation_id = pg_temp.c('org');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('read-only: no module change',
  $$select public.set_organisation_module(pg_temp.c('org'), 'clinical_safety', true)$$, 'P0001', 'org_read_only');
select pg_temp.raises('read-only: no new role holder',
  $$insert into public.governance_role_holders (organisation_id, role_key, profile_id) values (pg_temp.c('org'), 'siro', pg_temp.c('admin'))$$,
  'P0001', 'org_read_only');
select public.remove_member(pg_temp.c('org'), pg_temp.c('contrib'));
select pg_temp.ok('read-only: removing a member removes their governance roles',
  not private.holds_governance_role(pg_temp.c('org'), 'chief_nurse', pg_temp.c('contrib')));

select pg_temp.as_owner();
select 'nhs_modules: ' || n || ' checks passed' from passed;
rollback;
