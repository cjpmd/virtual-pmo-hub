-- RB-54 regression tests: create_report with null / wrong-typed blocks and
-- selection_rules.  Needs supabase/seed/reports_demo.sql.
-- Runs in one transaction that is rolled back.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reports_bugfix.sql
begin;

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Look up seed IDs dynamically so the test works against both the local Postgres
-- (reports_demo.sql IDs) and the shared test project (rb-test-reset.sql IDs).
do $$
declare
  v_pmo uuid;
  v_project uuid;
  v_id uuid;
  v_msg text;
begin
  select id into v_pmo from auth.users where email = 'pmo@reports-demo.test' limit 1;
  assert v_pmo is not null, 'seed pmo user not found';
  -- Any project the pmo user can see (they are org-level PMO in the demo seed).
  select p.id into v_project from public.projects p
    join public.organisations o on o.id = p.organisation_id
    join public.organisation_members om on om.organisation_id = o.id
    where om.profile_id = v_pmo limit 1;
  assert v_project is not null, 'no project found for pmo user';
  perform pg_temp.as_user(v_pmo);

  -- ----------------------------------------------------------------
  -- 1. blocks: null — must succeed (treated as absent, DB uses '[]').
  -- ----------------------------------------------------------------
  v_id := public.create_report(jsonb_build_object(
    'scope_type',   'project',
    'scope_entity_id', v_project,
    'ad_hoc',       true,
    'blocks',       null::jsonb
  ));
  assert v_id is not null, 'create_report with blocks:null should succeed';
  assert (select jsonb_typeof(blocks) from public.reports where id = v_id) = 'array',
    'blocks defaults to [] when null sent';

  -- ----------------------------------------------------------------
  -- 2. selection_rules: null — must succeed (treated as absent, DB uses '{}').
  -- ----------------------------------------------------------------
  v_id := public.create_report(jsonb_build_object(
    'scope_type',       'project',
    'scope_entity_id',  v_project,
    'ad_hoc',           true,
    'selection_rules',  null::jsonb
  ));
  assert v_id is not null, 'create_report with selection_rules:null should succeed';
  assert (select jsonb_typeof(selection_rules) from public.reports where id = v_id) = 'object',
    'selection_rules defaults to {} when null sent';

  -- ----------------------------------------------------------------
  -- 3. blocks: "not an array" — must raise 22023 with a human message.
  -- ----------------------------------------------------------------
  begin
    v_id := public.create_report(jsonb_build_object(
      'scope_type',      'project',
      'scope_entity_id', v_project,
      'ad_hoc',          true,
      'blocks',          '"not an array"'::jsonb
    ));
    assert false, 'should have raised for non-array blocks';
  exception when invalid_parameter_value then -- 22023
    get stacked diagnostics v_msg = message_text;
    assert v_msg = 'blocks must be a JSON array',
      'wrong error message: ' || v_msg;
  end;

  -- ----------------------------------------------------------------
  -- 4. selection_rules: [] (array, not object) — must raise 22023.
  -- ----------------------------------------------------------------
  begin
    v_id := public.create_report(jsonb_build_object(
      'scope_type',       'project',
      'scope_entity_id',  v_project,
      'ad_hoc',           true,
      'selection_rules',  '[]'::jsonb
    ));
    assert false, 'should have raised for non-object selection_rules';
  exception when invalid_parameter_value then -- 22023
    get stacked diagnostics v_msg = message_text;
    assert v_msg = 'selection_rules must be a JSON object',
      'wrong error message: ' || v_msg;
  end;

  -- ----------------------------------------------------------------
  -- 5. Neither blocks nor selection_rules in payload — must succeed.
  -- ----------------------------------------------------------------
  v_id := public.create_report(jsonb_build_object(
    'scope_type',      'project',
    'scope_entity_id', v_project,
    'ad_hoc',          true
  ));
  assert v_id is not null, 'create_report with no blocks/rules should succeed';
  assert (select jsonb_typeof(blocks) from public.reports where id = v_id) = 'array',
    'blocks is array when omitted';
  assert (select jsonb_typeof(selection_rules) from public.reports where id = v_id) = 'object',
    'selection_rules is object when omitted';
  -- No explicit DELETE: the whole test runs in a transaction that is rolled back.

  perform pg_temp.as_postgres();
  raise notice 'RB-54 regression tests passed.';
end $$;

rollback;
