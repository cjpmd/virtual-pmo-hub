-- Project tier changes: only PMO / admin change a tier, always through change_project_tier with a
-- reason; the reason lands in the audit log and project_tier_history shows it to project members.
-- Needs supabase/seed/reports_demo.sql. Rolled back.
--   supabase/tests/local/run.sh migrate && run.sh seed &&
--   psql -v ON_ERROR_STOP=1 -At -d vpmo -f supabase/tests/project_tier.sql
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
-- Runs a statement and returns the error's hint, else its SQLSTATE; null when it succeeds.
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
declare
  v_hint text;
  v_state text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate;
  return coalesce(nullif(v_hint, ''), v_state);
end $$;

do $$
declare
  org constant uuid := 'd0000000-0000-4000-8000-000000000100';
  ws constant uuid := 'd0000000-0000-4000-8000-000000000101';
  u_pmo constant uuid := 'd0000000-0000-4000-8000-000000000001';    -- organisation PMO
  u_admin constant uuid := 'd0000000-0000-4000-8000-000000000002';  -- organisation admin
  u_ws_pmo constant uuid := 'd0000000-0000-4000-8000-000000000003'; -- contributor, made workspace PMO below
  u_mgr constant uuid := 'd0000000-0000-4000-8000-000000000004';    -- contributor, made workspace manager below
  u_viewer constant uuid := 'd0000000-0000-4000-8000-000000000005';
  u_out constant uuid := 'd0000000-0000-4000-8000-000000000006';
  p1 constant uuid := 'd0000000-0000-4000-8000-000000001001';
  p2 constant uuid := 'd0000000-0000-4000-8000-000000001002';
  seen timestamptz;
  newer timestamptz;
  n int;
  r record;
  checks int := 0;
begin
  update public.workspace_members set role = 'pmo' where workspace_id = ws and profile_id = u_ws_pmo;
  update public.workspace_members set role = 'manager' where workspace_id = ws and profile_id = u_mgr;
  assert private.organisation_is_writable(org), 'SETUP organisation writable';
  assert (select tier from public.projects where id = p1) = 'large', 'SETUP RD01 is large';

  -- 1. A plain update of tier is refused for everyone, a manager's other edits still work.
  perform pg_temp.as_user(u_mgr);
  assert pg_temp.err(format($s$update public.projects set tier = 'small' where id = %L$s$, p1)) = 'tier_via_rpc',
    'manager: plain tier update refused';
  update public.projects set priority = 'high' where id = p1;
  get diagnostics n = row_count;
  assert n = 1, 'manager: other fields still editable';
  perform pg_temp.as_user(u_admin);
  assert pg_temp.err(format($s$update public.projects set tier = 'small' where id = %L$s$, p1)) = 'tier_via_rpc',
    'admin: plain tier update refused too';
  checks := checks + 3;

  -- 2. Who may change it through the RPC.
  perform pg_temp.as_user(u_mgr);
  assert pg_temp.err(format($s$select public.change_project_tier(%L, 'small', 'Scope cut')$s$, p1)) = '42501',
    'manager refused';
  perform pg_temp.as_user(u_viewer);
  assert pg_temp.err(format($s$select public.change_project_tier(%L, 'small', 'Scope cut')$s$, p1)) = '42501',
    'viewer refused';
  perform pg_temp.as_user(u_out);
  assert pg_temp.err(format($s$select public.change_project_tier(%L, 'small', 'Scope cut')$s$, p1)) = 'P0002',
    'outsider: not found';
  checks := checks + 3;

  -- 3. Validation.
  perform pg_temp.as_user(u_ws_pmo);
  assert pg_temp.err(format($s$select public.change_project_tier(%L, 'large', 'Same')$s$, p1)) = '22023',
    'unchanged tier refused';
  assert pg_temp.err(format($s$select public.change_project_tier(%L, 'small', '  a ')$s$, p1)) = '22023',
    'short reason refused';
  assert pg_temp.err(format($s$select public.change_project_tier(%L, 'small', %L)$s$, p1, repeat('x', 501))) = '22023',
    'long reason refused';
  assert pg_temp.err(format($s$select public.change_project_tier(%L, 'small', 'Scope cut', '2000-01-01')$s$, p1)) = '40001',
    'stale last_seen refused';
  checks := checks + 4;

  -- 4. Workspace PMO changes it; the reason is in the audit log.
  select updated_at into seen from public.projects where id = p1;
  newer := public.change_project_tier(p1, 'small', '  Scope cut to one team  ', seen);
  assert (select tier from public.projects where id = p1) = 'small', 'workspace PMO changed the tier';
  assert newer = (select updated_at from public.projects where id = p1), 'returns the new updated_at';
  perform pg_temp.as_postgres();
  select count(*) into n from public.audit_log
   where entity_table = 'projects' and entity_id = p1 and detail ? 'tier';
  assert n = 1, 'one audit row for the change';
  assert (select detail from public.audit_log where entity_table = 'projects' and entity_id = p1 and detail ? 'tier')
    = jsonb_build_object('tier', jsonb_build_object('from', 'large', 'to', 'small'),
                         'reason', 'Scope cut to one team', 'event', 'project.tier_changed'),
    'audit row carries from, to, trimmed reason and event';
  assert (select actor_id from public.audit_log where entity_table = 'projects' and entity_id = p1 and detail ? 'tier') = u_ws_pmo,
    'audit row names the actor';
  checks := checks + 5;

  -- 5. Organisation admin and organisation PMO may change it too.
  perform pg_temp.as_user(u_admin);
  perform public.change_project_tier(p2, 'large', 'Now spans three directorates');
  perform pg_temp.as_postgres();  -- one transaction here; real calls are separate, so give it an earlier time
  update public.audit_log set created_at = now() - interval '1 minute'
   where entity_table = 'projects' and entity_id = p2 and detail ? 'tier';
  perform pg_temp.as_user(u_pmo);
  perform public.change_project_tier(p2, 'medium', 'Directorates merged');
  assert (select tier from public.projects where id = p2) = 'medium', 'admin and PMO changed it';
  checks := checks + 1;

  -- 6. History: members (viewer included) see it, newest first; outsiders see nothing.
  perform pg_temp.as_user(u_viewer);
  select count(*) into n from public.project_tier_history(p2);
  assert n = 2, 'viewer sees both changes';
  select * into r from public.project_tier_history(p2) limit 1;
  assert r.from_tier = 'large' and r.to_tier = 'medium' and r.reason = 'Directorates merged' and r.changed_by is not null,
    'newest first, with reason and name';
  perform pg_temp.as_user(u_out);
  assert (select count(*) from public.project_tier_history(p2)) = 0, 'outsider sees no history';
  checks := checks + 3;

  -- 7. Older changes without a reason still show.
  perform pg_temp.as_postgres();
  insert into public.audit_log (organisation_id, workspace_id, actor_id, action, entity_table, entity_id, detail, created_at)
  values (org, ws, u_admin, 'update', 'projects', p2,
          jsonb_build_object('tier', jsonb_build_object('from', 'small', 'to', 'large')), now() - interval '1 year');
  perform pg_temp.as_user(u_viewer);
  assert (select count(*) from public.project_tier_history(p2) where reason is null and from_tier = 'small') = 1,
    'older change without a reason listed';
  checks := checks + 1;

  -- 8. Archived project refused.
  perform pg_temp.as_postgres();
  update public.projects set archived_at = now() where id = p2;
  perform pg_temp.as_user(u_admin);
  assert pg_temp.err(format($s$select public.change_project_tier(%L, 'small', 'Too late')$s$, p2)) = '22023',
    'archived project refused';
  checks := checks + 1;

  -- 9. Read-only organisation refused.
  perform pg_temp.as_postgres();
  update public.organisation_subscriptions set plan = 'trial', status = null, trial_ends_at = now() - interval '1 day'
  where organisation_id = org;
  assert not private.organisation_is_writable(org), 'SETUP organisation read-only';
  perform pg_temp.as_user(u_admin);
  assert pg_temp.err(format($s$select public.change_project_tier(%L, 'medium', 'Read only')$s$, p1)) = 'org_read_only',
    'read-only organisation refused';
  checks := checks + 1;

  -- 10. Grants.
  perform pg_temp.as_postgres();
  assert not has_function_privilege('anon', 'public.change_project_tier(uuid, public.project_tier, text, timestamptz)', 'execute'),
    'anon cannot change tiers';
  assert not has_function_privilege('anon', 'public.project_tier_history(uuid)', 'execute'), 'anon cannot read history';
  checks := checks + 2;

  raise notice 'project_tier: % checks passed', checks;
end $$;

rollback;
