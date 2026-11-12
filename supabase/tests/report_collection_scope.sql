-- GL-14 Phase A: collection scope, programme_coverage and benefits_value blocks, cover text,
-- the "Funding committee" template and the portfolio chart's committee markers.
-- Needs supabase/seed/reports_demo.sql. Rolled back.
--   supabase/tests/local/run.sh migrate && run.sh seed &&
--   psql -v ON_ERROR_STOP=1 -At -d vpmo -f supabase/tests/report_collection_scope.sql
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
create or replace function pg_temp.block(p_report uuid, p_key text, p_config jsonb default '{}') returns jsonb language sql as $$
  select public.report_block_data(jsonb_build_object('report_id', p_report),
    jsonb_build_object('id', 'b', 'blockKey', p_key, 'blockVersion', 1, 'config', p_config, 'placement', 'report')) $$;

do $$
declare
  org constant uuid := 'd0000000-0000-4000-8000-000000000100';
  ws constant uuid := 'd0000000-0000-4000-8000-000000000101';
  u_pmo constant uuid := 'd0000000-0000-4000-8000-000000000001';
  u_viewer constant uuid := 'd0000000-0000-4000-8000-000000000005';
  u_out constant uuid := 'd0000000-0000-4000-8000-000000000006';
  coll uuid;
  tpl uuid;
  rep uuid;
  ctx jsonb;
  d jsonb;
  ben_cash uuid;
  ben_dis uuid;
  obj uuid;
  checks int := 0;
begin
  -- The template exists once, globally, scoped to collections.
  select id into tpl from public.report_templates where is_system and name = 'Funding committee';
  assert tpl is not null and (select organisation_id is null and scope_type = 'collection' and forum_type = 'committee'
    from public.report_templates where id = tpl), 'Funding committee system template';
  assert (select bool_and(b ->> 'blockKey' in ('report_cover', 'executive_summary', 'rating_distribution', 'budget_summary',
      'programme_coverage', 'project_status_grid', 'divergence_list', 'milestone_timeline', 'benefits_value',
      'decisions_required', 'decisions_taken', 'section_heading', 'project_overview'))
    from public.report_templates t, jsonb_array_elements(t.blocks) b where t.id = tpl), 'template uses known blocks';
  assert (select bool_and(to_regprocedure('private.rb_' || (b ->> 'blockKey') || '(jsonb,jsonb)') is not null)
    from public.report_templates t, jsonb_array_elements(t.blocks) b where t.id = tpl and b ->> 'blockKey' <> 'section_heading'
      and b ->> 'blockKey' <> 'executive_summary'), 'every data block has its SQL function';
  checks := checks + 3;

  -- A funding collection: three projects, a 2.5m pot, two awards.
  insert into public.collections (organisation_id, workspace_id, name, pot_amount, type_id)
  values (org, ws, 'Innovation Fund', 2500000,
    (select id from public.lookup_values where list_key = 'collection_type' and organisation_id = org and label = 'Funding stream'))
  returning id into coll;
  insert into public.collection_projects (organisation_id, workspace_id, collection_id, project_id, award_amount) values
    (org, ws, coll, pg_temp.pid(1), 500000), (org, ws, coll, pg_temp.pid(2), 400000), (org, ws, coll, pg_temp.pid(7), null);

  -- Constraints accept the new scope.
  insert into public.forums (organisation_id, workspace_id, name, level, forum_type, scope_type, scope_entity_id)
  values (org, ws, 'Innovation Fund Committee', 'portfolio', 'committee', 'collection', coll);
  begin
    insert into public.forums (organisation_id, workspace_id, name, level, forum_type, scope_type)
    values (org, ws, 'Collection forum without a collection', 'portfolio', 'committee', 'collection');
    assert false, 'a collection-scoped forum needs its collection';
  exception when check_violation then null;
  end;
  checks := checks + 2;

  -- PMO creates a collection-scoped report from the template.
  perform pg_temp.as_user(u_pmo);
  rep := public.create_report(jsonb_build_object('scope_type', 'collection', 'scope_entity_id', coll, 'template_id', tpl,
    'title', 'Innovation Fund — November'));
  assert (select scope_type = 'collection' and scope_entity_id = coll and workspace_id = ws and organisation_id = org and scope_items is null
    from public.reports where id = rep), 'collection report stored';
  ctx := public.report_context(jsonb_build_object('report_id', rep));
  assert (ctx -> 'project_ids') @> to_jsonb(array[pg_temp.pid(1), pg_temp.pid(2), pg_temp.pid(7)])
     and jsonb_array_length(ctx -> 'project_ids') = 3, 'scope = the collection''s projects: ' || (ctx -> 'project_ids')::text;
  assert (select count(*) from public.report_inclusions where report_id = rep and mode = 'rule') = 3, 'every collection project is a deep-dive';
  checks := checks + 3;

  -- The scope follows the collection.
  perform pg_temp.as_postgres();
  insert into public.collection_projects (organisation_id, workspace_id, collection_id, project_id, award_amount)
  values (org, ws, coll, pg_temp.pid(3), 250000);
  perform private.compute_inclusions(rep);
  perform pg_temp.as_user(u_pmo);
  assert jsonb_array_length(public.report_context(jsonb_build_object('report_id', rep)) -> 'project_ids') = 4, 'a project added to the collection joins';
  assert (select count(*) from public.report_inclusions where report_id = rep and mode <> 'excluded') = 4, 'and is selected';
  checks := checks + 2;

  -- Cover: collection name as the scope label, optional cover text.
  d := pg_temp.block(rep, 'report_cover', '{"cover_text":"  Papers for the funding round.  "}');
  assert d ->> 'scope_label' = 'Innovation Fund' and d ->> 'scope_type' = 'collection', 'cover scope label: ' || d::text;
  assert d ->> 'cover_text' = 'Papers for the funding round.', 'cover text trimmed';
  assert pg_temp.block(rep, 'report_cover') -> 'cover_text' = 'null'::jsonb, 'no cover text by default';
  checks := checks + 3;

  -- programme_coverage: per programme, totals, pot vs requested vs awarded.
  d := pg_temp.block(rep, 'programme_coverage');
  assert (d -> 'totals' ->> 'projects')::int = 4 and (d -> 'totals' ->> 'budget')::numeric = 4000000, 'coverage totals: ' || (d -> 'totals')::text;
  assert (select sum((r ->> 'projects')::int) from jsonb_array_elements(d -> 'rows') r) = 4, 'rows add up';
  assert (d -> 'collection' ->> 'pot')::numeric = 2500000 and (d -> 'collection' ->> 'requested')::numeric = 4000000
     and (d -> 'collection' ->> 'awarded')::numeric = 1150000 and (d -> 'collection' ->> 'remaining')::numeric = 1350000
     and d -> 'collection' ->> 'name' = 'Innovation Fund', 'pot vs requested: ' || (d -> 'collection')::text;
  checks := checks + 3;

  -- Benefits value: a cash-releasing benefit on an objective, a disbenefit, an overdue measure.
  perform pg_temp.as_postgres();
  insert into public.strategic_objectives (organisation_id, workspace_id, portfolio_id, title)
  values (org, ws, 'd0000000-0000-4000-8000-000000000400', 'Better patient flow') returning id into obj;
  insert into public.benefits (organisation_id, workspace_id, portfolio_id, title, classification, category_id,
    planned_total_value, type, confidence)
  select organisation_id, workspace_id, portfolio_id, 'Fewer agency staff', 'cash_releasing', category_id, 200000, 'benefit', 'low'
  from public.benefits where ref = 'BEN-001' returning id into ben_cash;
  insert into public.benefits (organisation_id, workspace_id, portfolio_id, title, classification, category_id,
    planned_total_value, type)
  select organisation_id, workspace_id, portfolio_id, 'Training time', 'non_cash_releasing', category_id, 30000, 'disbenefit'
  from public.benefits where ref = 'BEN-001' returning id into ben_dis;
  insert into public.benefit_projects (organisation_id, workspace_id, benefit_id, project_id) values
    (org, ws, ben_cash, pg_temp.pid(2)), (org, ws, ben_dis, pg_temp.pid(2));
  insert into public.benefit_objectives (organisation_id, workspace_id, benefit_id, strategic_objective_id) values (org, ws, ben_cash, obj);
  insert into public.benefit_measures (organisation_id, workspace_id, benefit_id, name, next_due_date)
  values (org, ws, ben_cash, 'Agency spend', (select as_at from public.reports where id = rep) - 10);
  perform pg_temp.as_user(u_pmo);
  d := pg_temp.block(rep, 'benefits_value');
  assert (d ->> 'benefits')::int = 3, 'three benefits enabled by the collection''s projects: ' || d::text;
  assert (d ->> 'cash_releasing_planned')::numeric = 650000 and (d ->> 'disbenefit_value')::numeric = 30000, 'cash-releasing (seeded BEN-001 450k + 200k) and disbenefit split';
  assert (d ->> 'planned')::numeric = (select sum(greatest(0, planned_total_value)) from public.benefits b
      where b.type = 'benefit' and b.id in (select benefit_id from public.benefit_projects where project_id = any (array[pg_temp.pid(1), pg_temp.pid(2), pg_temp.pid(3), pg_temp.pid(7)]))),
    'planned excludes disbenefits';
  assert (d ->> 'at_risk')::int >= 1, 'low confidence is at risk';
  assert d -> 'objectives' @> '[{"name":"Better patient flow","planned":200000}]', 'by objective: ' || (d -> 'objectives')::text;
  assert (d ->> 'overdue_count')::int = 1 and d -> 'overdue' @> '[{"measure":"Agency spend","days_overdue":10}]', 'overdue measurement: ' || (d -> 'overdue')::text;
  assert (pg_temp.block(rep, 'benefits_value', '{"limit":0}') -> 'overdue') = '[]'::jsonb, 'limit applies to the lists';
  checks := checks + 7;

  -- Deep-dive: per project.
  d := public.report_block_data(jsonb_build_object('report_id', rep),
    '{"id":"b","blockKey":"benefits_value","blockVersion":1,"config":{},"placement":"deep_dive"}', pg_temp.pid(1));
  assert (d ->> 'benefits')::int = 1, 'deep-dive benefits are the project''s own: ' || d::text;
  checks := checks + 1;

  -- Outsiders and viewers.
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_out);
  assert not private.can_view_entity('collection', coll), 'outsider can''t see the collection';
  begin
    perform public.create_report(jsonb_build_object('scope_type', 'collection', 'scope_entity_id', coll));
    assert false, 'outsider can''t create a report on another organisation''s collection';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_viewer);
  assert private.can_view_entity('collection', coll), 'workspace viewer can see the collection';
  begin
    perform public.create_report(jsonb_build_object('scope_type', 'collection', 'scope_entity_id', coll));
    assert false, 'viewers can''t create reports';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_postgres();
  checks := checks + 4;

  -- Portfolio chart markers: a published collection pack appears; a draft doesn't.
  perform pg_temp.as_user(u_pmo);
  assert not exists (select 1 from jsonb_array_elements(public.get_portfolio_overview(ws, null, 'all', null) -> 'committeeDates') c
    where c ->> 'title' = 'Innovation Fund — November'), 'draft pack is not a marker';
  perform pg_temp.as_postgres();
  update public.reports set status = 'published', published_at = now() where id = rep;
  perform pg_temp.as_user(u_pmo);
  assert exists (select 1 from jsonb_array_elements(public.get_portfolio_overview(ws, null, 'all', null) -> 'committeeDates') c
    where c ->> 'title' = 'Innovation Fund — November' and c ->> 'date' = (select as_at::text from public.reports where id = rep)),
    'published collection pack is a marker';
  perform pg_temp.as_postgres();
  checks := checks + 2;

  raise notice 'report_collection_scope: % checks passed', checks;
end $$;

rollback;
select 'report_collection_scope ok';
