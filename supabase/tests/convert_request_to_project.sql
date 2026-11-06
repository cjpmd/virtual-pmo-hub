-- convert_request_to_project tests.
-- Creates throwaway users, a request and benefit drafts in the demo organisation,
-- then verifies the happy path, double-conversion guard, rejected-request guard and
-- RLS denial. Everything rolls back at the end.
--   psql "$DB_URL" -f supabase/tests/convert_request_to_project.sql
do $$
declare
  demo_org      uuid := (select id from public.organisations where slug = 'demo-university');
  demo_ws       uuid := (select id from public.workspaces
                          where organisation_id = demo_org
                          order by created_at limit 1);
  demo_port     uuid := (select id from public.portfolios
                          where organisation_id = demo_org
                          order by created_at limit 1);
  ben_cat       uuid := (select id from public.lookup_values
                          where organisation_id = demo_org and list_key = 'benefit_category'
                          order by sort_order limit 1);
  manager_uid   uuid := gen_random_uuid();
  viewer_uid    uuid := gen_random_uuid();

  req_id        uuid;
  req2_id       uuid;   -- for double-conversion test
  req_rejected  uuid;   -- for rejected-request test
  draft_id      uuid;
  project_id    uuid;
  project_code  text;
  project_id2   uuid;   -- should fail (double conversion)
  n             integer;
  results       text[] := '{}';
  failures      integer := 0;
  ok            boolean;
begin
  if demo_org is null then raise exception 'Seed the demo organisation first'; end if;

  -- ── Create test users ────────────────────────────────────────────────────────
  insert into auth.users (id, email, raw_user_meta_data) values
    (manager_uid, 'e2e-cvt-mgr-' || manager_uid || '@example.invalid', '{"full_name":"CVT Manager"}'),
    (viewer_uid,  'e2e-cvt-vwr-' || viewer_uid  || '@example.invalid', '{"full_name":"CVT Viewer"}');
  insert into public.organisation_members (organisation_id, profile_id, role) values
    (demo_org, manager_uid, 'viewer'),
    (demo_org, viewer_uid,  'viewer');
  insert into public.workspace_members (workspace_id, profile_id, organisation_id, role) values
    (demo_ws, manager_uid, demo_org, 'manager'),
    (demo_ws, viewer_uid,  demo_org, 'viewer');

  -- ── Create test requests (as service_role to bypass RLS) ────────────────────
  set local role service_role;

  insert into public.project_requests
    (id, organisation_id, workspace_id, portfolio_id, title, status, estimated_cost, estimated_benefit)
  values
    (gen_random_uuid(), demo_org, demo_ws, demo_port, 'CVT Happy Path Request',    'approved', 50000, 100000),
    (gen_random_uuid(), demo_org, demo_ws, demo_port, 'CVT Double Convert Request','approved', 10000,  20000),
    (gen_random_uuid(), demo_org, demo_ws, demo_port, 'CVT Rejected Request',      'rejected',  5000,  10000)
  returning id into req_id;  -- captures only the last row; use separate statements below

  -- Re-fetch by title to get stable IDs.
  select id into req_id       from public.project_requests where organisation_id = demo_org and title = 'CVT Happy Path Request';
  select id into req2_id      from public.project_requests where organisation_id = demo_org and title = 'CVT Double Convert Request';
  select id into req_rejected from public.project_requests where organisation_id = demo_org and title = 'CVT Rejected Request';

  -- Add a benefit draft to the happy-path request.
  insert into public.request_benefit_drafts
    (id, organisation_id, workspace_id, request_id, title, classification, annual_value, years_counted, sort_order, category_id)
  values
    (gen_random_uuid(), demo_org, demo_ws, req_id, 'CVT Efficiency Draft', 'cashable', 10000, 5, 0, ben_cat)
  returning id into draft_id;

  reset role;

  -- ── Test 1: viewer cannot convert ───────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', viewer_uid::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', viewer_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  ok := false;
  begin
    select public.convert_request_to_project(req_id, '{}') into project_id;
  exception
    when sqlstate '42501' then ok := true;   -- permission denied
    when others then ok := false;
  end;
  if ok then
    results := array_append(results, 'viewer denied (42501): ok');
  else
    failures := failures + 1;
    results := array_append(results, 'viewer denied: FAIL — should have raised 42501');
  end if;
  reset role;

  -- ── Test 2: happy path — manager converts an approved request ───────────────
  perform set_config('request.jwt.claim.sub', manager_uid::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', manager_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select public.convert_request_to_project(req_id,
    jsonb_build_object('name', 'CVT Test Project', 'tier', 'small'))
  into project_id;

  if project_id is not null then
    results := array_append(results, 'happy path returns project id: ok');
  else
    failures := failures + 1;
    results := array_append(results, 'happy path returns project id: FAIL');
  end if;

  -- Verify the project row.
  select code into project_code from public.projects where id = project_id;
  if project_code is not null and project_code <> '' then
    results := array_append(results, format('project code assigned (%s): ok', project_code));
  else
    failures := failures + 1;
    results := array_append(results, 'project code assigned: FAIL');
  end if;

  -- Verify converted_from_request_id.
  select count(*) into n from public.projects
  where id = project_id and converted_from_request_id = req_id;
  if n = 1 then
    results := array_append(results, 'converted_from_request_id set: ok');
  else
    failures := failures + 1;
    results := array_append(results, 'converted_from_request_id set: FAIL');
  end if;

  -- Verify the request is now approved.
  select count(*) into n from public.project_requests
  where id = req_id and status = 'approved';
  if n = 1 then
    results := array_append(results, 'request status = approved: ok');
  else
    failures := failures + 1;
    results := array_append(results, 'request status approved: FAIL');
  end if;

  -- Verify the benefit draft was converted to a benefit.
  select count(*) into n from public.benefits
  where portfolio_id = demo_port and title = 'CVT Efficiency Draft';
  if n = 1 then
    results := array_append(results, 'benefit draft converted: ok');
  else
    failures := failures + 1;
    results := array_append(results, 'benefit draft converted: FAIL');
  end if;

  -- Verify benefit_projects link.
  select count(*) into n from public.benefit_projects bp
  join public.benefits b on b.id = bp.benefit_id
  where bp.project_id = project_id and b.title = 'CVT Efficiency Draft';
  if n = 1 then
    results := array_append(results, 'benefit linked to project: ok');
  else
    failures := failures + 1;
    results := array_append(results, 'benefit linked to project: FAIL');
  end if;

  -- Verify audit log entry.
  select count(*) into n from public.audit_log
  where action = 'request.converted' and entity_id = req_id;
  if n = 1 then
    results := array_append(results, 'audit log entry written: ok');
  else
    failures := failures + 1;
    results := array_append(results, 'audit log entry written: FAIL');
  end if;

  -- ── Test 3: double conversion raises 23505 ───────────────────────────────────
  -- First conversion.
  select public.convert_request_to_project(req2_id, '{}') into project_id2;

  ok := false;
  begin
    -- Second conversion of the same request.
    select public.convert_request_to_project(req2_id, '{}') into project_id2;
  exception
    when sqlstate '23505' then ok := true;
    when others then ok := false;
  end;
  if ok then
    results := array_append(results, 'double conversion raises 23505: ok');
  else
    failures := failures + 1;
    results := array_append(results, 'double conversion raises 23505: FAIL');
  end if;

  -- ── Test 4: rejected request raises 22023 ───────────────────────────────────
  ok := false;
  begin
    select public.convert_request_to_project(req_rejected, '{}') into project_id2;
  exception
    when sqlstate '22023' then ok := true;
    when others then ok := false;
  end;
  if ok then
    results := array_append(results, 'rejected request raises 22023: ok');
  else
    failures := failures + 1;
    results := array_append(results, 'rejected request raises 22023: FAIL');
  end if;

  reset role;

  -- ── Summary ──────────────────────────────────────────────────────────────────
  raise notice '--- convert_request_to_project results ---';
  for n in 1..array_length(results, 1) loop
    raise notice '%', results[n];
  end loop;
  raise notice 'Failures: %', failures;

  if failures > 0 then
    raise exception 'convert_request_to_project: % test(s) failed', failures;
  end if;

  -- Rolls back all test data.
  raise exception 'TEST_ROLLBACK: all % checks passed', array_length(results, 1);
end;
$$ language plpgsql;
