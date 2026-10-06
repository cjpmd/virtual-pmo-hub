-- Stage 4b write path, as the browser sends it. Creates three throwaway users in the demo
-- organisation's workspace (viewer, contributor, manager), then runs the same statements as
-- src/services/project-records.ts under the `authenticated` role with JWT claims, and checks
-- what RLS allows. Everything happens in one transaction that ends with an exception, so
-- nothing is kept (the final message carries the results).
--   psql "$DB_URL" -f supabase/tests/project_writes.sql
do $$
declare
  demo_org uuid := (select id from public.organisations where slug = 'demo-university');
  project uuid := (select id from public.projects where organisation_id = demo_org and code = 'EBB');
  ws uuid := (select workspace_id from public.projects where id = project);
  a_risk uuid := (select id from public.risks where project_id = project order by ref limit 1);
  a_milestone uuid := (select id from public.milestones where project_id = project order by ref limit 1);
  viewer uuid := gen_random_uuid();
  contributor uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  new_risk uuid;
  new_ref text;
  new_org uuid;
  n integer;
  history_before integer;
  perms record;
  results text[] := '{}';
  failures integer := 0;

  procedure_ok boolean;
begin
  if project is null then raise exception 'Seed the demo organisation first'; end if;

  insert into auth.users (id, email, raw_user_meta_data) values
    (viewer, 'e2e-viewer-' || viewer || '@example.invalid', '{"full_name":"E2E Viewer"}'),
    (contributor, 'e2e-contributor-' || contributor || '@example.invalid', '{"full_name":"E2E Contributor"}'),
    (manager, 'e2e-manager-' || manager || '@example.invalid', '{"full_name":"E2E Manager"}');
  insert into public.organisation_members (organisation_id, profile_id, role) values
    (demo_org, viewer, 'viewer'), (demo_org, contributor, 'viewer'), (demo_org, manager, 'viewer');
  insert into public.workspace_members (workspace_id, profile_id, organisation_id, role) values
    (ws, viewer, demo_org, 'viewer'), (ws, contributor, demo_org, 'contributor'), (ws, manager, demo_org, 'manager');

  -- ---- Viewer: can read, cannot write ----
  perform set_config('request.jwt.claim.sub', viewer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.risks where project_id = project;
  if n > 0 then results := array_append(results, 'viewer reads risks: ok'); else failures := failures + 1; results := array_append(results, 'viewer reads risks: FAIL'); end if;
  select * into perms from public.project_permissions(project);
  results := array_append(results, format('viewer permissions: %s/%s/%s', perms.can_edit, perms.can_delete_records, perms.can_manage_project));
  if perms.can_edit then failures := failures + 1; end if;
  with u as (update public.risks set title = title || ' (viewer)' where id = a_risk returning id) select count(*) into n from u;
  if n = 0 then results := array_append(results, 'viewer update filtered by RLS (0 rows -> forbidden in UI): ok'); else failures := failures + 1; results := array_append(results, 'viewer update: FAIL'); end if;
  procedure_ok := false;
  begin
    insert into public.risks (project_id, title, probability, impact) values (project, 'Viewer risk', 2, 2);
  exception when insufficient_privilege then procedure_ok := true;
  end;
  if procedure_ok then results := array_append(results, 'viewer insert rejected (42501): ok'); else failures := failures + 1; results := array_append(results, 'viewer insert: FAIL'); end if;
  reset role;

  -- ---- Contributor: edits, cannot delete ----
  perform set_config('request.jwt.claim.sub', contributor::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', contributor, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into perms from public.project_permissions(project);
  results := array_append(results, format('contributor permissions: %s/%s/%s', perms.can_edit, perms.can_delete_records, perms.can_manage_project));
  if not perms.can_edit or perms.can_delete_records then failures := failures + 1; end if;
  with u as (update public.risks set impact = least(impact + 1, 5), status = 'open' where id = a_risk returning id) select count(*) into n from u;
  if n = 1 then results := array_append(results, 'contributor update: ok'); else failures := failures + 1; results := array_append(results, 'contributor update: FAIL'); end if;
  -- organisation_id is spoofed on purpose: the tenant guard must overwrite it.
  insert into public.risks (project_id, title, probability, impact, organisation_id, workspace_id)
  values (project, 'E2E risk', 4, 3, gen_random_uuid(), gen_random_uuid())
  returning id, ref, organisation_id into new_risk, new_ref, new_org;
  if new_ref like 'RSK-%' and new_org = demo_org then results := array_append(results, format('contributor insert: ok (%s, tenant filled from project)', new_ref));
  else failures := failures + 1; results := array_append(results, format('contributor insert: FAIL (%s, %s)', new_ref, new_org)); end if;
  with d as (delete from public.risks where id = new_risk returning id) select count(*) into n from d;
  if n = 0 then results := array_append(results, 'contributor delete filtered by RLS: ok'); else failures := failures + 1; results := array_append(results, 'contributor delete: FAIL'); end if;
  with u as (update public.milestones set forecast_date = forecast_date + 7 where id = a_milestone returning id) select count(*) into n from u;
  -- One history row per milestone per day: today's row now carries the new forecast.
  select count(*) into history_before from public.milestone_forecast_history h join public.milestones m on m.id = h.milestone_id
  where h.milestone_id = a_milestone and h.reporting_date = private.org_today(m.organisation_id) and h.forecast_date = m.forecast_date;
  if n = 1 and history_before = 1 then results := array_append(results, 'contributor milestone forecast update: ok (recorded in forecast history)');
  else failures := failures + 1; results := array_append(results, format('contributor milestone update: FAIL (%s, %s)', n, history_before)); end if;
  reset role;

  -- ---- Manager: may delete register rows ----
  perform set_config('request.jwt.claim.sub', manager::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into perms from public.project_permissions(project);
  results := array_append(results, format('manager permissions: %s/%s/%s', perms.can_edit, perms.can_delete_records, perms.can_manage_project));
  with d as (delete from public.risks where id = new_risk returning id) select count(*) into n from d;
  if n = 1 then results := array_append(results, 'manager delete: ok'); else failures := failures + 1; results := array_append(results, 'manager delete: FAIL'); end if;
  reset role;

  raise exception 'PROJECT_WRITES_RESULT: % failure(s) | %', failures, array_to_string(results, ' | ');
end $$;
