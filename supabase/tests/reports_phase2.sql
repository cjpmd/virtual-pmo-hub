-- Report builder Phase 2 tests: selection engine parity with the TS mirror (shared cases),
-- programme pack inclusions and reasons, tolerance changes on refresh, pin / exclude, capping,
-- rating scheme relabelling, escalations, partner access. Needs supabase/seed/reports_demo.sql.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -v cases="$(cat src/features/reports/engine/selection-cases.json)" -f supabase/tests/reports_phase2.sql
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
create or replace function pg_temp.pid(n int) returns uuid language sql immutable as $$
  select ('d0000000-0000-4000-8000-0000000010' || lpad(n::text, 2, '0'))::uuid $$;
create or replace function pg_temp.codes(p_report uuid, p_modes text[] default array['rule', 'pinned']) returns text language sql as $$
  select string_agg(p.code, ',' order by p.code) from public.report_inclusions i join public.projects p on p.id = i.entity_id
  where i.report_id = p_report and i.mode = any (p_modes) $$;

-- ---------------------------------------------------------- parity with selection-cases.json
create temp table cases (body jsonb);
insert into cases values (:'cases'::jsonb);
do $$
declare
  c jsonb;
  actual jsonb;
begin
  for c in select jsonb_array_elements(body) from cases loop
    select coalesce(jsonb_object_agg(project_id::text, (select jsonb_agg(r ->> 'rule_id') from jsonb_array_elements(reasons) r)), '{}')
      into actual
    from private.evaluate_selection(c -> 'ruleSet',
      (select jsonb_agg(jsonb_build_object('project_id', p ->> 'projectId', 'name', p ->> 'name', 'metrics', p -> 'metrics'))
       from jsonb_array_elements(c -> 'projects') p), c -> 'tolerances');
    assert actual = c -> 'expected', format('case %s: got %s, expected %s', c ->> 'name', actual, c -> 'expected');
  end loop;
end $$;

-- ---------------------------------------------------------- programme pack
do $$
declare
  u_pmo uuid := 'd0000000-0000-4000-8000-000000000001';
  f_prog uuid := 'd0000000-0000-4000-8000-000000000501';
  rep uuid;
  r jsonb;
begin
  perform pg_temp.as_user(u_pmo);
  rep := public.create_report(jsonb_build_object('forum_id', f_prog, 'meeting_id', 'd0000000-0000-4000-8000-000000000602'));
  -- Defaults include exactly the breaching projects (RD09 is clean).
  assert pg_temp.codes(rep) = 'RD01,RD02,RD03,RD04,RD05,RD06', 'programme inclusions: ' || coalesce(pg_temp.codes(rep), 'none');
  -- Reason chips carry values vs thresholds.
  select i.reasons into r from public.report_inclusions i where i.report_id = rep and i.entity_id = pg_temp.pid(4);
  assert exists (select 1 from jsonb_array_elements(r) x where x ->> 'rule_id' = 'slip' and (x ->> 'value')::int = 40 and (x ->> 'threshold')::int = 14),
    'RD04 slip reason 40 vs 14: ' || r::text;
  select i.reasons into r from public.report_inclusions i where i.report_id = rep and i.entity_id = pg_temp.pid(6);
  assert r -> 0 ->> 'rule_id' = 'decision' and jsonb_array_length(r) = 1, 'RD06 decision reason';
  select i.reasons into r from public.report_inclusions i where i.report_id = rep and i.entity_id = pg_temp.pid(3);
  assert exists (select 1 from jsonb_array_elements(r) x where x ->> 'rule_id' = 'divergence' and (x ->> 'value')::int > 14), 'RD03 divergence reason';
  -- Ordering: severity 3 first.
  assert (select p.code from public.report_inclusions i join public.projects p on p.id = i.entity_id
          where i.report_id = rep order by i.sort_order limit 1) in ('RD01', 'RD03', 'RD04'), 'red first';

  -- Only the budget rule, from the forum's tolerance: 5% → RD01 (25%) and RD05 (8%).
  update public.reports set selection_rules = '{"mode":"any","rules":[{"id":"budget","label":"Budget","metric":"budget_variance_pct","op":">","value":5,"useForumTolerance":true,"severity":2,"enabled":true}]}'
  where id = rep;
  perform public.refresh_report_selection(rep);
  assert pg_temp.codes(rep) = 'RD01,RD05', 'budget 5%: ' || coalesce(pg_temp.codes(rep), 'none');
  -- Changing the forum tolerance changes inclusion on refresh.
  update public.forums set tolerances = tolerances || '{"budget_variance_pct":{"op":">","value":10}}' where id = f_prog;
  perform public.refresh_report_selection(rep);
  assert pg_temp.codes(rep) = 'RD01', 'budget 10%: ' || coalesce(pg_temp.codes(rep), 'none');

  -- Pin and exclude persist across refreshes; excluded keeps would-be reasons.
  perform public.set_report_inclusion(rep, pg_temp.pid(9), 'pinned');
  perform public.set_report_inclusion(rep, pg_temp.pid(1), 'excluded');
  perform public.refresh_report_selection(rep);
  assert pg_temp.codes(rep) = 'RD09', 'pinned only: ' || coalesce(pg_temp.codes(rep), 'none');
  assert pg_temp.codes(rep, array['excluded']) = 'RD01', 'RD01 excluded';
  assert (select jsonb_array_length(reasons) from public.report_inclusions where report_id = rep and entity_id = pg_temp.pid(1)) = 1,
    'excluded keeps reasons';
  perform public.set_report_inclusion(rep, pg_temp.pid(1), null);
  assert pg_temp.codes(rep) = 'RD01,RD09', 'clearing restores the rule inclusion';
  begin
    perform public.set_report_inclusion(rep, pg_temp.pid(7), 'pinned');
    assert false, 'pinning outside scope must fail';
  exception when invalid_parameter_value then null;
  end;

  -- Capping by severity.
  update public.reports set selection_rules = (select selection_rules from public.report_templates where is_system and name = 'Programme Board')
    || '{"maxAutoIncluded":3}' where id = rep;
  perform public.set_report_inclusion(rep, pg_temp.pid(9), null);
  perform public.refresh_report_selection(rep);
  assert (select count(*) from public.report_inclusions where report_id = rep and mode = 'rule') = 3, 'capped at 3';
  assert pg_temp.codes(rep) = 'RD01,RD03,RD04', 'cap keeps the red ones: ' || coalesce(pg_temp.codes(rep), 'none');

  -- Rating scheme: switching the forum to NHS assurance relabels the report's ratings.
  assert public.report_context(jsonb_build_object('report_id', rep)) -> 'scheme' ->> 'key' = 'rag', 'RAG by default';
  perform pg_temp.as_postgres();
  update public.forums set rating_scheme_id = (select id from public.rating_schemes where key = 'nhs_assurance') where id = f_prog;
  perform pg_temp.as_user(u_pmo);
  assert public.report_context(jsonb_build_object('report_id', rep)) -> 'scheme' ->> 'key' = 'nhs_assurance', 'NHS scheme follows the forum';
  assert exists (select 1 from jsonb_array_elements(public.report_context(jsonb_build_object('report_id', rep)) -> 'scheme' -> 'levels') l
    where l ->> 'rag' = 'red' and l ->> 'label' = 'Limited assurance'), 'red maps to limited assurance';
  perform pg_temp.as_postgres();
end $$;

-- ---------------------------------------------------------- escalations, portfolio tolerances
do $$
declare
  rep uuid;
begin
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000001');
  assert (select (pm.metrics ->> 'escalations_for_forum')::int from public.project_metrics(array[pg_temp.pid(7)], current_date,
    'd0000000-0000-4000-8000-000000000502') pm) = 1, 'RD07 escalated to the portfolio board';
  rep := public.create_report(jsonb_build_object('forum_id', 'd0000000-0000-4000-8000-000000000502', 'meeting_id', 'd0000000-0000-4000-8000-000000000604',
    'override_cutoff', true));
  assert exists (select 1 from public.report_inclusions i, jsonb_array_elements(i.reasons) x where i.report_id = rep
    and i.entity_id = pg_temp.pid(7) and x ->> 'rule_id' = 'escalated'), 'escalation reason on RD07';
  -- Portfolio tolerance is 30 days: RD03's 35-day slip counts, a 14-day one would not.
  assert jsonb_array_length(public.report_block_data(jsonb_build_object('report_id', rep), '{"id":"e","blockKey":"escalations"}') -> 'rows') >= 1, 'escalations block';
  perform pg_temp.as_postgres();
end $$;

-- ---------------------------------------------------------- partner access
do $$
declare
  u_partner uuid := 'd0000000-0000-4000-8000-000000000007';
  shared uuid;
  unshared uuid;
begin
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000001');
  shared := public.create_report(jsonb_build_object('scope_type', 'programme', 'scope_entity_id', 'd0000000-0000-4000-8000-000000000401', 'title', 'Shared'));
  unshared := public.create_report(jsonb_build_object('scope_type', 'programme', 'scope_entity_id', 'd0000000-0000-4000-8000-000000000402', 'title', 'Unshared'));
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_partner);
  assert (select count(*) from public.reports where id in (shared, unshared)) = 0, 'partner sees no drafts';
  perform pg_temp.as_postgres();
  update public.reports set status = 'published', published_at = now() where id in (shared, unshared);
  perform pg_temp.as_user(u_partner);
  assert (select count(*) from public.reports where id = shared) = 1, 'partner sees the shared published pack';
  assert (select count(*) from public.reports where id = unshared) = 0, 'partner cannot see an unshared pack';
  assert (select count(*) from public.projects where organisation_id = 'd0000000-0000-4000-8000-000000000100') = 0, 'partner sees no live projects';
  assert (public.report_permissions(shared) ->> 'is_partner')::boolean, 'partner flagged';
  assert public.report_permissions(shared) -> 'hidden_block_keys' ? 'budget_movers', 'share hides budget movers';
  assert not (public.report_permissions(shared) ->> 'can_edit')::boolean, 'partner cannot edit';
  perform pg_temp.as_postgres();
end $$;

-- ---------------------------------------------------------- forum actions RLS
do $$
declare
  a uuid;
begin
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000005'); -- viewer
  begin
    insert into public.forum_actions (forum_id, title) values ('d0000000-0000-4000-8000-000000000501', 'Nope');
    assert false, 'viewer cannot add actions';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000003'); -- chair
  insert into public.forum_actions (forum_id, title, due_date) values ('d0000000-0000-4000-8000-000000000501', 'Chair action', current_date + 7) returning id into a;
  update public.forum_actions set status = 'done' where id = a;
  assert (select closed_at is not null from public.forum_actions where id = a), 'closing stamps closed_at';
  perform pg_temp.as_postgres();
end $$;

rollback;
select 'reports_phase2 ok';
