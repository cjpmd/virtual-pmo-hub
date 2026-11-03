-- Report builder Phase 3 tests: lifecycle permissions, publish snapshots, immutability, a
-- published pack never changes, changes since the previous pack, decisions recorded in the
-- meeting reach the next pack, distribution idempotency, viewer and partner access, print
-- tokens. Needs supabase/seed/reports_demo.sql (which publishes one previous pack).
begin;

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_role(p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  execute format('set local role %I', p_role);
end $$;
create or replace function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function pg_temp.pid(n int) returns uuid language sql immutable as $$
  select ('d0000000-0000-4000-8000-0000000010' || lpad(n::text, 2, '0'))::uuid $$;

create temp table t (k text primary key, v uuid);
grant all on t to authenticated, anon, service_role;

do $$
declare
  u_pmo uuid := 'd0000000-0000-4000-8000-000000000001';
  u_chair uuid := 'd0000000-0000-4000-8000-000000000003';
  u_pm uuid := 'd0000000-0000-4000-8000-000000000004';
  u_viewer uuid := 'd0000000-0000-4000-8000-000000000005';
  f_prog uuid := 'd0000000-0000-4000-8000-000000000501';
  prev uuid := (select id from public.reports where status = 'published' and forum_id = 'd0000000-0000-4000-8000-000000000501');
  rep uuid;
  snap_before jsonb;
  snap_after jsonb;
  ch jsonb;
  d public.decisions;
begin
  assert prev is not null, 'seed published a previous pack';
  -- The meeting is today, its papers deadline last week.
  update public.meetings set meeting_date = current_date, papers_deadline = current_date - 7 where id = 'd0000000-0000-4000-8000-000000000602';

  perform pg_temp.as_user(u_pmo);
  rep := public.create_report(jsonb_build_object('forum_id', f_prog, 'meeting_id', 'd0000000-0000-4000-8000-000000000602'));
  insert into t values ('rep', rep);
  assert (select previous_report_id from public.reports where id = rep) = prev, 'linked to the previous published pack';
  insert into public.report_narratives (report_id, block_instance_id, body) values (rep, 'exec', '{"format":"markdown","text":"Exec summary"}');

  -- Changes since last: RD04's slip grew from 5 to 40 days; RD02 got worse.
  ch := public.report_block_data(jsonb_build_object('report_id', rep), '{"id":"since","blockKey":"changes_since_last"}');
  assert ch -> 'previous' ->> 'id' = prev::text, 'changes compare with the previous pack';
  assert exists (select 1 from jsonb_array_elements(ch -> 'projects') x where x ->> 'code' = 'RD04'
    and (x -> 'prev' ->> 'max_milestone_slip_days')::int = 5 and (x -> 'curr' ->> 'max_milestone_slip_days')::int = 40), 'RD04 slip moved 5 → 40';
  assert exists (select 1 from jsonb_array_elements(ch -> 'projects') x where x ->> 'code' = 'RD02'
    and x -> 'prev' ->> 'evidenced_rating' = 'green' and x -> 'curr' ->> 'evidenced_rating' = 'amber'), 'RD02 green → amber';
  assert (public.report_block_data(jsonb_build_object('report_id', rep), '{"id":"rm","blockKey":"raid_movement"}') -> 'rescored' -> 0 ->> 'to')::int = 12,
    'RD02 risk re-scored 4 → 12';

  -- Lifecycle permissions.
  begin
    perform public.approve_report(rep);
    assert false, 'PMO does not approve when the forum has a chair (RB-19)';
  exception when insufficient_privilege then null;
  end;
  perform public.submit_report(rep);
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_pm);
  begin
    perform public.approve_report(rep);
    assert false, 'a contributor cannot approve';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_viewer);
  assert (select count(*) from public.reports where id = rep) = 0, 'viewer cannot see a pack in review';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_chair);
  perform public.return_report(rep, 'Add the forward look');
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_pmo);
  perform public.submit_report(rep);
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_chair);
  perform public.approve_report(rep);
  begin
    perform public.publish_report(rep);
    assert false, 'the chair does not publish';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_pmo);
  perform public.publish_report(rep);
  assert (select status from public.reports where id = rep) = 'published', 'published';
  assert (select count(*) from public.report_events where report_id = rep and event in ('created', 'submitted', 'returned', 'approved', 'published')) = 6,
    'every transition is audited';
  assert (select count(*) from public.report_snapshots where report_id = rep and entity_id is not null) > 0, 'deep-dive snapshots';
  assert (select count(*) from public.report_metric_snapshots where report_id = rep and entity_type = 'project') = 7, 'metrics for every project in scope';
  begin
    perform public.publish_report(rep);
    assert false, 'publishing twice must fail';
  exception when invalid_parameter_value then null;
  end;

  -- Editing project data after publish doesn't change the published pack.
  select jsonb_agg(data order by block_instance_id, entity_id) into snap_before from public.report_snapshots where report_id = rep;
  perform pg_temp.as_postgres();
  update public.milestones set forecast_date = current_date + 200 where project_id = pg_temp.pid(4);
  update public.risks set probability = 5, impact = 5 where project_id = pg_temp.pid(9);
  perform private.refresh_health_current('d0000000-0000-4000-8000-000000000100');
  select jsonb_agg(data order by block_instance_id, entity_id) into snap_after from public.report_snapshots where report_id = rep;
  assert snap_before = snap_after, 'published snapshot unchanged by later edits';
  -- Snapshots and published content are immutable.
  begin
    update public.report_snapshots set data = '{}' where report_id = rep;
    assert false, 'snapshot update must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.report_snapshots where report_id = rep;
    assert false, 'snapshot delete must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.report_metric_snapshots where report_id = rep;
    assert false, 'metric snapshot delete must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.reports set blocks = '[]' where id = rep;
    assert false, 'published blocks must not change';
  exception when insufficient_privilege then null;
  end;

  -- The viewer (forum member, free seat) reads the published pack and its snapshots.
  perform pg_temp.as_user(u_viewer);
  assert (select count(*) from public.reports where id = rep) = 1, 'viewer reads the published pack';
  assert (select count(*) from public.report_snapshots where report_id = rep) > 0, 'viewer reads its snapshots';
  begin
    update public.reports set title = 'x' where id = rep;
  end;
  assert (select title from public.reports where id = rep) <> 'x', 'viewer cannot edit';
  perform pg_temp.as_postgres();

  -- Presentation mode: the chair records RD06's decision and an action.
  perform pg_temp.as_user(u_chair);
  d := public.record_meeting_decision(rep, 'd0000000-0000-4000-8000-000000000701',
    (select id from public.decision_options where decision_id = 'd0000000-0000-4000-8000-000000000701' and title like 'Supplier B%'),
    'Integration outweighs the licence cost.');
  assert d.status = 'made' and d.report_id = rep and d.decided_meeting_id = 'd0000000-0000-4000-8000-000000000602', 'decision linked to meeting and pack';
  perform public.add_meeting_action(rep, 'Negotiate supplier B licence terms', (select id from public.resources where profile_id = u_pm), current_date + 14, pg_temp.pid(6));
  assert (select count(*) from public.forum_actions where report_id = rep) = 1, 'action recorded';
  assert snap_before = (select jsonb_agg(data order by block_instance_id, entity_id) from public.report_snapshots where report_id = rep), 'recording does not change the snapshot';
  perform pg_temp.as_postgres();

  -- The next pack shows the decision taken and the change.
  perform pg_temp.as_user(u_pmo);
  rep := public.create_report(jsonb_build_object('forum_id', f_prog, 'meeting_id', 'd0000000-0000-4000-8000-000000000603', 'override_cutoff', true));
  assert (select previous_report_id from public.reports where id = rep) = (select v from t where k = 'rep'), 'second pack follows the first';
  assert exists (select 1 from jsonb_array_elements(public.report_block_data(jsonb_build_object('report_id', rep), '{"id":"dt","blockKey":"decisions_taken"}') -> 'rows') x
    where x ->> 'id' = 'd0000000-0000-4000-8000-000000000701'), 'next pack lists the decision taken';
  ch := public.report_block_data(jsonb_build_object('report_id', rep), '{"id":"since","blockKey":"changes_since_last"}');
  assert (ch ->> 'decisions_made')::int >= 1, 'changes since last count the decision';
  assert exists (select 1 from jsonb_array_elements(ch -> 'projects') x where x ->> 'code' = 'RD04'
    and (x -> 'curr' ->> 'max_milestone_slip_days')::int > (x -> 'prev' ->> 'max_milestone_slip_days')::int), 'second pack shows RD04 slipping further';
  perform pg_temp.as_postgres();
end $$;

-- Distribution list and idempotency (service role).
do $$
declare
  rep uuid := (select v from t where k = 'rep');
  dist jsonb;
begin
  perform pg_temp.as_role('service_role');
  dist := public.report_distribution(rep);
  assert dist -> 'recipients' @> '[{"email":"viewer@reports-demo.test"}]', 'member gets the pack';
  assert dist -> 'recipients' @> '[{"email":"chair@reports-demo.test"}]', 'chair gets the pack';
  assert dist -> 'recipients' @> '[{"email":"pmo@reports-demo.test"}]', 'secretary gets the pack';
  assert not dist -> 'recipients' @> '[{"email":"pm@reports-demo.test"}]', 'contributors do not';
  assert not (dist ->> 'already_distributed')::boolean, 'not sent yet';
  assert dist ->> 'summary' = 'Exec summary', 'summary from the executive summary';
  perform public.record_report_event(rep, 'distributed', jsonb_build_object('sent', 3));
  assert (public.report_distribution(rep) ->> 'already_distributed')::boolean, 'a second run sees it was sent';
  perform pg_temp.as_postgres();
end $$;

-- Print tokens (server PDF).
do $$
declare
  rep uuid := (select v from t where k = 'rep');
  tok text;
begin
  perform pg_temp.as_role('service_role');
  tok := public.issue_report_print_token(rep);
  perform pg_temp.as_postgres();
  perform pg_temp.as_role('anon');
  assert jsonb_array_length(public.report_snapshot_by_token(rep, tok) -> 'snapshots') > 0, 'token reads the snapshot';
  assert public.report_snapshot_by_token(rep, 'wrong') is null, 'a wrong token reads nothing';
  begin
    perform count(*) from public.reports;
    assert false, 'anon must not read reports directly';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000001');
  begin
    perform public.issue_report_print_token(rep);
    assert false, 'users cannot issue print tokens';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_postgres();
end $$;

-- Partners read the shared programme's published pack without partner-unsafe or hidden blocks.
do $$
declare
  rep uuid := (select v from t where k = 'rep');
begin
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000007');
  assert (select count(*) from public.reports where id = rep) = 1, 'partner reads the shared programme pack';
  assert (select count(*) from public.report_snapshots where report_id = rep) > 0, 'partner reads safe snapshots';
  assert (select count(*) from public.report_snapshots where report_id = rep and block_key in ('resource_summary', 'data_quality', 'budget_movers')) = 0,
    'partner-unsafe and share-hidden blocks are withheld';
  assert (select count(*) from public.report_metric_snapshots where report_id = rep) = 0, 'partners get no raw metrics';
  perform pg_temp.as_postgres();
end $$;

rollback;
select 'reports_phase3 ok';
