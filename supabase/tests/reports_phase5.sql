-- Report builder follow-up tests (rb5): published pack visibility, point-in-time metrics and
-- the data-basis note, history fallback for changes since last, the risk matrix default guard,
-- scheduled draft notifications. Needs supabase/seed/reports_demo.sql. Rolled back.
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

-- A workspace viewer who is not a member of any forum, and a second contributor.
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-4000-8000-000000000008', 'nonmember@reports-demo.test', '{"full_name":"Nina Nonmember"}'),
  ('d0000000-0000-4000-8000-000000000009', 'other@reports-demo.test', '{"full_name":"Oscar Other"}');
insert into public.profiles (id, display_name, email) values
  ('d0000000-0000-4000-8000-000000000008', 'Nina Nonmember', 'nonmember@reports-demo.test'),
  ('d0000000-0000-4000-8000-000000000009', 'Oscar Other', 'other@reports-demo.test') on conflict (id) do nothing;
insert into public.organisation_members (organisation_id, profile_id, role) values
  ('d0000000-0000-4000-8000-000000000100', 'd0000000-0000-4000-8000-000000000008', 'viewer'),
  ('d0000000-0000-4000-8000-000000000100', 'd0000000-0000-4000-8000-000000000009', 'contributor');
insert into public.workspace_members (workspace_id, profile_id, organisation_id, role) values
  ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000100', 'viewer'),
  ('d0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000100', 'contributor');

-- ---------------------------------------------------------------- A1 visibility
do $$
declare
  nonmember uuid := 'd0000000-0000-4000-8000-000000000008';
  other uuid := 'd0000000-0000-4000-8000-000000000009';
  member_viewer uuid := 'd0000000-0000-4000-8000-000000000005';
  pack uuid := (select id from public.reports where status = 'published' and forum_id = 'd0000000-0000-4000-8000-000000000501');
  adhoc uuid;
begin
  assert (select published_pack_visibility from public.forums where id = 'd0000000-0000-4000-8000-000000000501') = 'members', 'default members';
  perform pg_temp.as_user(nonmember);
  assert (select count(*) from public.reports where id = pack) = 0, 'non-member viewer cannot read a members-only pack';
  assert (select count(*) from public.report_snapshots where report_id = pack) = 0, '…nor its snapshots';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(member_viewer);
  assert (select count(*) from public.reports where id = pack) = 1, 'forum member reads it';
  perform pg_temp.as_postgres();
  update public.forums set published_pack_visibility = 'organisation' where id = 'd0000000-0000-4000-8000-000000000501';
  perform pg_temp.as_user(nonmember);
  assert (select count(*) from public.reports where id = pack) = 1, 'organisation-visible pack readable by any member';
  assert (select count(*) from public.report_snapshots where report_id = pack) > 0, '…with its snapshots';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000006');
  assert (select count(*) from public.reports where id = pack) = 0, 'other organisations still cannot';
  perform pg_temp.as_postgres();
  update public.forums set published_pack_visibility = 'members' where id = 'd0000000-0000-4000-8000-000000000501';

  -- Ad hoc: creator and PMO only.
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000004');
  adhoc := public.create_report(jsonb_build_object('scope_type', 'project', 'scope_entity_id', pg_temp.pid(1), 'title', 'PM ad hoc'));
  perform pg_temp.as_postgres();
  update public.reports set status = 'published', published_at = now() where id = adhoc;
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000004');
  assert (select count(*) from public.reports where id = adhoc) = 1, 'creator reads own ad hoc pack';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000001');
  assert (select count(*) from public.reports where id = adhoc) = 1, 'PMO reads it';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(other);
  assert (select count(*) from public.reports where id = adhoc) = 0, 'another contributor does not';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(nonmember);
  assert (select count(*) from public.reports where id = adhoc) = 0, 'a viewer does not';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(other);
  begin
    update public.forums set published_pack_visibility = 'organisation' where id = 'd0000000-0000-4000-8000-000000000501';
  end;
  perform pg_temp.as_postgres();
  assert (select published_pack_visibility from public.forums where id = 'd0000000-0000-4000-8000-000000000501') = 'members',
    'only forum managers change visibility';
end $$;

-- ---------------------------------------------------------------- A2 history
do $$
declare
  rd04 numeric;
  b jsonb;
  m jsonb;
  prog uuid[];
  pmo uuid := 'd0000000-0000-4000-8000-000000000001';
  old_pack uuid;
  draft uuid;
  ch jsonb;
begin
  prog := (select array_agg(id) from public.projects where programme_id = 'd0000000-0000-4000-8000-000000000401');
  -- Today's position stored as at ten days ago, then RD04 slips further.
  assert private.capture_project_metric_history('d0000000-0000-4000-8000-000000000100', current_date - 10) = 10, 'ten projects captured';
  assert (select count(*) from public.project_metric_history where as_of = current_date - 10 and metrics ? '_basis') = 0, 'basis not stored';
  update public.milestones set forecast_date = current_date + 120 where project_id = pg_temp.pid(4) and title = 'Go-live';
  -- As at five days ago: every metric from history.
  select pm.metrics into m from public.project_metrics(array[pg_temp.pid(4)], current_date - 5) pm;
  assert (m ->> 'max_milestone_slip_days')::int = 40, 'slip as it was: ' || (m ->> 'max_milestone_slip_days');
  assert m -> '_basis' ->> 'source' = 'history' and (m -> '_basis' ->> 'as_of')::date = current_date - 10, 'basis history';
  -- As at today: current.
  select pm.metrics into m from public.project_metrics(array[pg_temp.pid(4)], current_date) pm;
  assert (m ->> 'max_milestone_slip_days')::int = 100, 'current slip now';
  assert m -> '_basis' ->> 'source' = 'current', 'basis current';
  -- Before any history: ratings as at, the rest current.
  select pm.metrics into m from public.project_metrics(array[pg_temp.pid(4)], current_date - 20) pm;
  assert m -> '_basis' ->> 'ratings' = 'as_at', 'no history: ratings as at';
  -- Data-basis notes.
  b := private.report_data_basis(prog, current_date - 5, 'd0000000-0000-4000-8000-000000000100', 'draft');
  assert b ->> 'text' = 'All figures as at ' || to_char(current_date - 5, 'FMDD Mon YYYY'), b ->> 'text';
  b := private.report_data_basis(prog, current_date - 20, 'd0000000-0000-4000-8000-000000000100', 'published');
  assert b ->> 'text' = 'Ratings as at ' || to_char(current_date - 20, 'FMDD Mon YYYY') || '; financials and RAID current at publish (no history before '
    || to_char(current_date - 10, 'FMDD Mon YYYY') || ')', b ->> 'text';
  delete from public.project_metric_history where project_id = pg_temp.pid(9);
  b := private.report_data_basis(prog, current_date - 5, 'd0000000-0000-4000-8000-000000000100', 'draft');
  assert b ->> 'source' = 'mixed' and b ->> 'text' like 'Figures as at % for 6 of 7 projects;%', b ->> 'text';
  b := private.report_data_basis(prog, current_date, 'd0000000-0000-4000-8000-000000000100', 'draft');
  assert b ->> 'text' = 'All figures as at ' || to_char(current_date, 'FMDD Mon YYYY'), b ->> 'text';

  -- Cover and published note.
  perform pg_temp.as_user(pmo);
  draft := public.create_report(jsonb_build_object('scope_type', 'programme', 'scope_entity_id', 'd0000000-0000-4000-8000-000000000401',
    'as_at', current_date - 5, 'title', 'History pack'));
  assert public.report_block_data(jsonb_build_object('report_id', draft), '{"id":"c","blockKey":"report_cover"}') ->> 'data_basis' like 'Figures as at %',
    'cover shows the basis';
  perform public.publish_report(draft);
  assert (select data ->> 'text' from public.report_snapshots where report_id = draft and block_instance_id = '__basis') like 'Figures as at %',
    'published pack keeps its note';
  perform pg_temp.as_postgres();

  -- changes_since_last falls back to history where the previous pack has no metric snapshot.
  insert into public.reports (organisation_id, workspace_id, title, forum_id, scope_type, scope_entity_id, as_at, blocks, status, published_at)
  values ('d0000000-0000-4000-8000-000000000100', 'd0000000-0000-4000-8000-000000000101', 'Old pack without snapshots',
    'd0000000-0000-4000-8000-000000000502', 'portfolio', 'd0000000-0000-4000-8000-000000000400', current_date - 8, '[]', 'published', now() - interval '8 days')
  returning id into old_pack;
  perform pg_temp.as_user(pmo);
  draft := public.create_report(jsonb_build_object('forum_id', 'd0000000-0000-4000-8000-000000000502',
    'meeting_id', 'd0000000-0000-4000-8000-000000000604', 'override_cutoff', true));
  assert (select previous_report_id from public.reports where id = draft) = old_pack, 'previous is the old pack';
  ch := public.report_block_data(jsonb_build_object('report_id', draft), '{"id":"x","blockKey":"changes_since_last"}');
  assert ch ->> 'previous_basis' = 'history', 'compared with history: ' || coalesce(ch ->> 'previous_basis', 'null');
  assert exists (select 1 from jsonb_array_elements(ch -> 'projects') x where x ->> 'code' = 'RD04'
    and (x -> 'prev' ->> 'max_milestone_slip_days')::int = 40 and (x -> 'curr' ->> 'max_milestone_slip_days')::int = 100), 'RD04 slip 40 → 100 from history';
  perform pg_temp.as_postgres();
end $$;

-- ---------------------------------------------------------------- A3 matrix guard
do $$
begin
  -- System matrices are unaffected by the guard (one system default).
  update public.risk_matrices set is_default = false where key = 'default' and organisation_id is null;
  update public.risk_matrices set is_default = true where key = 'nhs_5x5' and organisation_id is null;
  update public.risk_matrices set is_default = false where key = 'nhs_5x5' and organisation_id is null;
  update public.risk_matrices set is_default = true where key = 'default' and organisation_id is null;
  insert into public.risk_matrices (organisation_id, key, name, likelihood_levels, consequence_levels, bands)
  values ('d0000000-0000-4000-8000-000000000100', 'org_m', 'Org', '[]', '[]', '[{"min":1,"max":25,"key":"x","label":"X","colour":"#000"}]');
  begin
    update public.risk_matrices set is_default = true where key = 'org_m';
    assert false, 'org matrix cannot become the default';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- A7 scheduled drafts
do $$
declare
  rep uuid;
  n jsonb;
  f uuid;
begin
  update public.forums set auto_create_packs = true where id = 'd0000000-0000-4000-8000-000000000501';
  update public.meetings set papers_deadline = current_date - 1, meeting_date = current_date + 4 where id = 'd0000000-0000-4000-8000-000000000603';
  assert private.create_scheduled_packs() >= 1, 'drafted (meetings 602 and 603 are both past their deadline)';
  select id into rep from public.reports where meeting_id = 'd0000000-0000-4000-8000-000000000603';
  assert (select created_by is null from public.reports where id = rep), 'no human creator';
  assert exists (select 1 from public.report_events where report_id = rep and event = 'created' and (payload ->> 'system')::boolean
    and payload ->> 'creator' = 'system'), 'system creator marker';
  select recipients into n from public.report_notifications where report_id = rep and kind = 'draft_ready';
  assert n @> '[{"email":"chair@reports-demo.test","role":"chair"}]' and n @> '[{"email":"pmo@reports-demo.test","role":"secretary"}]',
    'secretary and chair notified: ' || n::text;
  assert not n @> '[{"email":"viewer@reports-demo.test"}]', 'members are not';
  assert private.create_scheduled_packs() = 0, 'not again';
  assert (select count(*) from public.report_notifications where report_id = rep) = 1, 'one notification per report';

  -- The secretary, chair and PMO edit the system draft.
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000003');
  assert private.can_edit_report(rep), 'chair edits';
  update public.reports set title = 'Edited by the chair' where id = rep;
  assert (select title from public.reports where id = rep) = 'Edited by the chair', 'chair''s edit saved';
  assert exists (select 1 from public.my_system_drafted_packs() where report_id = rep), 'in the chair''s feed';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000001');
  assert private.can_edit_report(rep), 'secretary / PMO edits';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000005');
  assert not private.can_edit_report(rep) and not exists (select 1 from public.my_system_drafted_packs() where report_id = rep), 'members don''t';
  perform pg_temp.as_postgres();

  -- Outbox: service role drains, marking sent once.
  perform pg_temp.as_role('service_role');
  assert public.pending_report_notifications() @> jsonb_build_array(jsonb_build_object('report_id', rep)), 'pending';
  perform public.mark_report_notification_sent((select id from public.report_notifications where report_id = rep), '{"sent":2}');
  assert not public.pending_report_notifications() @> jsonb_build_array(jsonb_build_object('report_id', rep)), 'sent';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user('d0000000-0000-4000-8000-000000000003');
  begin
    perform public.pending_report_notifications();
    assert false, 'users cannot drain the outbox';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_postgres();

  -- A forum with no chair or secretary: PMO / admins are told.
  insert into public.forums (organisation_id, workspace_id, name, level, forum_type, scope_type, scope_entity_id, default_template_id, auto_create_packs)
  values ('d0000000-0000-4000-8000-000000000100', 'd0000000-0000-4000-8000-000000000101', 'Unchaired board', 'programme', 'programme_board',
    'programme', 'd0000000-0000-4000-8000-000000000402', (select id from public.report_templates where is_system and name = 'Programme Board'), true)
  returning id into f;
  insert into public.meetings (forum_id, meeting_date, papers_deadline) values (f, current_date + 3, current_date - 2);
  assert private.create_scheduled_packs() = 1, 'drafted for the unchaired board';
  select n2.recipients into n from public.report_notifications n2 join public.reports r on r.id = n2.report_id where r.forum_id = f;
  assert n @> '[{"email":"pmo@reports-demo.test","role":"pmo"}]' and n @> '[{"email":"admin@reports-demo.test","role":"pmo"}]',
    'PMO and admins notified: ' || n::text;
end $$;

rollback;
select 'reports_phase5 ok';
