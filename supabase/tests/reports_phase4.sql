-- Report builder Phase 4 tests: AI drafts block submission until reviewed, template updates,
-- scheduled packs, lessons_learned and linked_records blocks. Needs the demo seed.
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

do $$
declare
  u_pmo uuid := 'd0000000-0000-4000-8000-000000000001';
  f_prog uuid := 'd0000000-0000-4000-8000-000000000501';
  rep uuid;
  nid uuid;
  t uuid;
  out jsonb;
begin
  perform pg_temp.as_user(u_pmo);
  rep := public.create_report(jsonb_build_object('forum_id', f_prog, 'meeting_id', 'd0000000-0000-4000-8000-000000000603', 'override_cutoff', true));
  -- AI draft: stored as ai_draft, audited with the model, blocks submission until reviewed.
  nid := public.record_ai_draft(rep, 'exec', 'Draft summary from the metrics.', 'claude-opus-5-5');
  assert (select source from public.report_narratives where id = nid) = 'ai_draft', 'stored as an AI draft';
  assert exists (select 1 from public.report_events where report_id = rep and event = 'ai_draft' and payload ->> 'model' = 'claude-opus-5-5'), 'AI draft audited';
  assert public.ai_drafts_today(rep) >= 1, 'counted toward the daily cap';
  begin
    perform public.submit_report(rep);
    assert false, 'submit must wait for the AI draft review';
  exception when invalid_parameter_value then null;
  end;
  perform public.acknowledge_ai_draft(nid);
  assert (select source from public.report_narratives where id = nid) = 'human', 'reviewed draft is human text';
  -- Template versioning: edit the template copy, then update the report to it.
  t := (select id from public.report_templates where is_system and name = 'Programme Board');
  perform pg_temp.as_postgres();
  insert into public.report_templates (organisation_id, name, scope_type, blocks, selection_rules)
  select 'd0000000-0000-4000-8000-000000000100', 'Org programme board', scope_type, blocks, selection_rules from public.report_templates where id = t
  returning id into t;
  update public.reports set template_id = t, template_version = 1 where id = rep;
  update public.report_templates set blocks = blocks || '[{"id":"lessons","blockKey":"lessons_learned","blockVersion":1,"config":{},"placement":"report"}]' where id = t;
  assert (select version from public.report_templates where id = t) = 2, 'block change bumps the version';
  perform pg_temp.as_user(u_pmo);
  perform public.update_report_to_template(rep);
  assert (select template_version from public.reports where id = rep) = 2, 'report on the latest version';
  assert (select blocks @> '[{"blockKey":"lessons_learned"}]' from public.reports where id = rep), 'new block arrived';
  assert exists (select 1 from public.report_narratives where report_id = rep and block_instance_id = 'exec'), 'narratives kept';
  -- Phase 4 blocks resolve.
  out := public.report_block_data(jsonb_build_object('report_id', rep), '{"id":"l","blockKey":"lessons_learned","config":{"all_open":true}}');
  assert out ? 'rows', 'lessons_learned resolves';
  out := public.report_block_data(jsonb_build_object('report_id', rep), '{"id":"k","blockKey":"linked_records"}');
  assert exists (select 1 from jsonb_array_elements(out -> 'rows') x where x ->> 'link_type' = 'depends_on'), 'dependencies appear as links';
  perform pg_temp.as_postgres();

  -- Scheduled packs: a forum that opts in gets a draft once the papers deadline passes.
  update public.forums set auto_create_packs = true where id = 'd0000000-0000-4000-8000-000000000502';
  update public.meetings set papers_deadline = current_date - 1, meeting_date = current_date + 3 where id = 'd0000000-0000-4000-8000-000000000604';
  assert private.create_scheduled_packs() = 1, 'one pack drafted';
  assert private.create_scheduled_packs() = 0, 'never twice for a meeting';
  assert (select status from public.reports where meeting_id = 'd0000000-0000-4000-8000-000000000604') = 'draft', 'drafted only';
end $$;

rollback;
select 'reports_phase4 ok';
