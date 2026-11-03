-- Report builder Phase 1 tests: risk matrices, project_metrics against the demo fixtures,
-- block data, create_report and RLS (organisation isolation, drafts vs viewers).
-- Needs supabase/seed/reports_demo.sql. Runs in one transaction that is rolled back.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/reports_phase1.sql
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
create or replace function pg_temp.metric(n int, k text) returns jsonb language sql as $$
  select pm.metrics -> k from public.project_metrics(array[pg_temp.pid(n)], current_date, 'd0000000-0000-4000-8000-000000000501') pm $$;

-- ---------------------------------------------------------------- risk matrices
do $$
declare
  rid uuid;
begin
  select id into rid from public.risks where project_id = pg_temp.pid(1) and probability = 5 and impact = 4;
  assert public.risk_score(rid) = 20, 'default matrix scores 5×4 = 20';
  assert public.risk_band(rid) ->> 'key' = 'critical', 'default band critical';
  assert (public.risk_band(rid) ->> 'top')::boolean, 'critical is the top band';
  -- Assign the NHS matrix to this risk: 20 is extreme.
  update public.risks set risk_matrix_id = (select id from public.risk_matrices where key = 'nhs_5x5' and organisation_id is null) where id = rid;
  assert public.risk_band(rid) ->> 'key' = 'extreme', 'nhs band extreme';
  update public.risks set risk_matrix_id = null where id = rid;
  assert private.matrix_band(private.org_risk_matrix(null), 7) ->> 'label' = 'Low', 'band boundary 7 low';
  assert private.matrix_band(private.org_risk_matrix(null), 8) ->> 'label' = 'Elevated', 'band boundary 8 elevated';
  assert private.matrix_band((select to_jsonb(m) from public.risk_matrices m where key = 'nhs_5x5'), 4) ->> 'key' = 'moderate', 'nhs 4 moderate';
  assert private.matrix_band((select to_jsonb(m) from public.risk_matrices m where key = 'nhs_5x5'), 3) ->> 'key' = 'low', 'nhs 3 low';
end $$;

-- Changing the org default matrix changes top_raid ordering and labels (Phase 1 acceptance).
do $$
declare
  before jsonb;
  after jsonb;
  inp jsonb := jsonb_build_object('organisation_id', 'd0000000-0000-4000-8000-000000000100', 'scope_type', 'project',
    'scope_entity_id', pg_temp.pid(1));
begin
  before := public.report_block_data(inp, '{"id":"r","blockKey":"top_raid","config":{"limit":5,"types":["risk"]}}');
  assert before -> 'rows' -> 0 ->> 'title' = 'Data migration defects', 'default: 5×4 risk first';
  assert before -> 'rows' -> 0 -> 'band' ->> 'label' = 'Critical', 'default label';
  insert into public.risk_matrices (organisation_id, key, name, likelihood_levels, consequence_levels, score_method, score_lookup, bands, is_default)
  values ('d0000000-0000-4000-8000-000000000100', 'lookup_test', 'Lookup', '[]', '[]', 'lookup',
    '[[1,1,1,1,1],[1,1,1,1,1],[1,1,1,25,1],[1,1,1,1,1],[1,1,1,2,1]]',
    '[{"min":1,"max":9,"key":"minor","label":"Minor","colour":"#999"},{"min":10,"max":25,"key":"serious","label":"Serious","colour":"#c00"}]', true);
  after := public.report_block_data(inp, '{"id":"r","blockKey":"top_raid","config":{"limit":5,"types":["risk"]}}');
  assert after -> 'rows' -> 0 ->> 'title' = 'Clinical safety sign-off delayed', 'org lookup matrix reorders';
  assert after -> 'rows' -> 0 -> 'band' ->> 'label' = 'Serious', 'org matrix relabels';
  delete from public.risk_matrices where key = 'lookup_test';
end $$;

-- ---------------------------------------------------------------- metrics fixtures
do $$
begin
  assert pg_temp.metric(1, 'evidenced_rating') #>> '{}' = 'red', 'RD01 evidenced red';
  assert (pg_temp.metric(1, 'budget_variance_pct') #>> '{}')::numeric = 25, 'RD01 variance 25%';
  assert (pg_temp.metric(1, 'budget_variance_abs') #>> '{}')::numeric = 250000, 'RD01 variance abs';
  assert (pg_temp.metric(2, 'rating_worsened') #>> '{}')::boolean, 'RD02 worsened';
  assert (pg_temp.metric(3, 'divergence_days') #>> '{}')::int > 14, 'RD03 divergence > 14';
  assert (pg_temp.metric(4, 'max_milestone_slip_days') #>> '{}')::int = 40, 'RD04 slip 40';
  assert (pg_temp.metric(5, 'budget_variance_pct') #>> '{}')::numeric = 8, 'RD05 variance 8%';
  assert (pg_temp.metric(6, 'open_decisions_for_forum') #>> '{}')::int = 1, 'RD06 decision for forum';
  assert (pg_temp.metric(8, 'days_to_next_gate') #>> '{}')::int = 12, 'RD08 gate in 12 days';
  assert pg_temp.metric(10, 'evidenced_rating') #>> '{}' = 'green', 'RD10 green';
  assert (pg_temp.metric(10, 'max_milestone_slip_days') #>> '{}')::int = 0, 'RD10 no slip';
  assert (pg_temp.metric(1, 'stale_update_days') #>> '{}')::int = 21, 'stale days since report';
end $$;

-- ---------------------------------------------------------------- blocks
do $$
declare
  k text;
  out jsonb;
  inp jsonb := jsonb_build_object('organisation_id', 'd0000000-0000-4000-8000-000000000100', 'scope_type', 'programme',
    'scope_entity_id', 'd0000000-0000-4000-8000-000000000401', 'forum_id', 'd0000000-0000-4000-8000-000000000501');
begin
  foreach k in array array['report_cover','executive_summary','overall_status','health_by_dimension','project_status_grid',
    'milestone_slippage','budget_summary','decisions_required','top_raid','change_requests','free_text','section_heading'] loop
    out := public.report_block_data(inp, jsonb_build_object('id', k, 'blockKey', k, 'config', '{}'::jsonb));
    assert out is not null and not (out ? 'unavailable'), k || ' resolves';
  end loop;
  foreach k in array array['project_summary','highlight_report_summary','overall_status','health_by_dimension'] loop
    out := public.report_block_data(inp, jsonb_build_object('id', k, 'blockKey', k, 'config', '{}'::jsonb), pg_temp.pid(1));
    assert out is not null and not (out ? 'unavailable'), k || ' resolves per project';
  end loop;
  out := public.report_block_data(inp, '{"id":"x","blockKey":"no_such_block"}');
  assert (out ->> 'unavailable')::boolean, 'unknown key is unavailable';
  out := public.report_block_data(inp, '{"id":"g","blockKey":"project_status_grid","config":{}}');
  assert jsonb_array_length(out -> 'rows') = 6, 'programme grid has 6 projects';
  out := public.report_block_data(inp, '{"id":"d","blockKey":"decisions_required","config":{}}');
  assert jsonb_array_length(out -> 'rows') = 1 and jsonb_array_length(out -> 'rows' -> 0 -> 'options') = 2, 'decision with options';
  out := public.report_block_data(inp, '{"id":"o","blockKey":"overall_status","config":{}}', pg_temp.pid(3));
  assert out ->> 'declared' = 'green' and out ->> 'evidenced' = 'red', 'overall_status declared vs evidenced';
  begin
    perform public.report_block_data(inp, '{"id":"o","blockKey":"overall_status"}', pg_temp.pid(1) /* in scope */);
    perform public.report_block_data(jsonb_build_object('organisation_id', 'd0000000-0000-4000-8000-000000000100', 'scope_type', 'programme',
      'scope_entity_id', 'd0000000-0000-4000-8000-000000000402'), '{"id":"o","blockKey":"overall_status"}', pg_temp.pid(1));
    assert false, 'deep-dive entity outside scope refused';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---------------------------------------------------------------- create_report + RLS
do $$
declare
  u_pmo uuid := 'd0000000-0000-4000-8000-000000000001';
  u_chair uuid := 'd0000000-0000-4000-8000-000000000003';
  u_pm uuid := 'd0000000-0000-4000-8000-000000000004';
  u_viewer uuid := 'd0000000-0000-4000-8000-000000000005';
  u_out uuid := 'd0000000-0000-4000-8000-000000000006';
  pb_template uuid := (select id from public.report_templates where is_system and name = 'Project Board');
  f_project uuid;
  rep uuid;
  adhoc uuid;
  n int;
begin
  -- PMO creates a Project Board forum for RD01 with the system template as default.
  perform pg_temp.as_user(u_pmo);
  insert into public.forums (organisation_id, workspace_id, name, level, forum_type, scope_type, scope_entity_id, default_template_id, chair_resource_id)
  values ('d0000000-0000-4000-8000-000000000100', 'd0000000-0000-4000-8000-000000000101', 'RD01 Project Board', 'project', 'project_board',
    'project', pg_temp.pid(1), pb_template, (select id from public.resources where profile_id = u_chair))
  returning id into f_project;
  rep := public.create_report(jsonb_build_object('forum_id', f_project));
  select count(*) into n from public.reports where id = rep and jsonb_array_length(blocks) = 16 and template_id = pb_template;
  assert n = 1, 'pack created from the default template';

  -- The project's manager creates their own project board pack (RB-20).
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_pm);
  perform public.create_report(jsonb_build_object('forum_id', f_project, 'title', 'PM pack'));
  -- …and an ad hoc report on their project.
  adhoc := public.create_report(jsonb_build_object('scope_type', 'project', 'scope_entity_id', pg_temp.pid(1), 'title', 'Ad hoc'));
  assert (select count(*) from public.reports where id = adhoc) = 1, 'creator sees own ad hoc draft';
  update public.reports set title = 'Ad hoc renamed' where id = adhoc;
  insert into public.report_narratives (report_id, block_instance_id, body) values (adhoc, 'exec', '{"format":"markdown","text":"Hello"}');
  begin
    update public.reports set status = 'published' where id = adhoc;
    assert false, 'status change by plain update must fail';
  exception when insufficient_privilege then null;
  end;

  -- Viewer: can't create, can't see drafts.
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_viewer);
  assert (select count(*) from public.reports where id in (rep, adhoc)) = 0, 'viewer sees no drafts';
  begin
    perform public.create_report(jsonb_build_object('scope_type', 'project', 'scope_entity_id', pg_temp.pid(2)));
    assert false, 'viewer cannot create';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.forums where organisation_id = 'd0000000-0000-4000-8000-000000000100') > 0, 'viewer sees forums';

  -- Outsider: nothing from the demo organisation.
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_out);
  assert (select count(*) from public.reports) = 0, 'outsider sees no reports';
  assert (select count(*) from public.forums where organisation_id = 'd0000000-0000-4000-8000-000000000100') = 0, 'outsider sees no forums';
  assert (select count(*) from public.report_templates where organisation_id is null) >= 1, 'system templates visible';
  assert (select count(*) from public.report_narratives) = 0, 'outsider sees no narratives';
  begin
    perform public.create_report(jsonb_build_object('scope_type', 'project', 'scope_entity_id', pg_temp.pid(1)));
    assert false, 'outsider cannot create over another org';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.report_block_data(jsonb_build_object('report_id', rep), '{"id":"c","blockKey":"report_cover"}');
    assert false, 'outsider cannot resolve a report';
  exception when insufficient_privilege then null;
  end;

  -- Chair of the programme board edits a programme pack; PMO can override the papers deadline.
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_pmo);
  begin
    perform public.create_report(jsonb_build_object('forum_id', 'd0000000-0000-4000-8000-000000000501', 'meeting_id', 'd0000000-0000-4000-8000-000000000603'));
    assert false, 'meeting before papers deadline refused';
  exception when invalid_parameter_value then null;
  end;
  rep := public.create_report(jsonb_build_object('forum_id', 'd0000000-0000-4000-8000-000000000501', 'meeting_id', 'd0000000-0000-4000-8000-000000000603',
    'override_cutoff', true, 'scope_type', 'programme'));
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_chair);
  assert private.can_edit_report(rep), 'chair edits the programme pack';
  perform pg_temp.as_postgres();
end $$;

rollback;
select 'reports_phase1 ok';
