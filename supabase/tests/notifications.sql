-- GL-13 notifications. Needs supabase/seed/reports_demo.sql. Rolled back.
--   supabase/tests/local/run.sh migrate && run.sh seed &&
--   psql -v ON_ERROR_STOP=1 -At -d vpmo -f supabase/tests/notifications.sql
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
create or replace function pg_temp.open_count(p_kind text, p_recipient uuid) returns bigint language sql as $$
  select count(*) from public.notifications where kind = p_kind and recipient_id = p_recipient and resolved_at is null $$;

-- "Today" for the organisation's rules (private.org_today honours vpmo.today for system calls).
select set_config('vpmo.today', '2026-11-12', true);

do $$
declare
  org constant uuid := 'd0000000-0000-4000-8000-000000000100';
  other_org constant uuid := 'd0000000-0000-4000-8000-000000000300';
  ws constant uuid := 'd0000000-0000-4000-8000-000000000101';
  proj constant uuid := 'd0000000-0000-4000-8000-000000001001';     -- RD01, manager Pete
  u_pmo constant uuid := 'd0000000-0000-4000-8000-000000000001';
  u_admin constant uuid := 'd0000000-0000-4000-8000-000000000002';
  u_chair constant uuid := 'd0000000-0000-4000-8000-000000000003';
  u_pm constant uuid := 'd0000000-0000-4000-8000-000000000004';
  u_viewer constant uuid := 'd0000000-0000-4000-8000-000000000005';
  u_out constant uuid := 'd0000000-0000-4000-8000-000000000006';
  r_pmo uuid;
  r_chair uuid;
  r_pm uuid;
  r_viewer uuid;
  task uuid;
  task2 uuid;
  dec uuid := 'd0000000-0000-4000-8000-000000000701';
  ben uuid;
  measure uuid;
  dep uuid;
  offer uuid;
  rep uuid;
  res jsonb;
  pend jsonb;
  n bigint;
  token text;
  checks int := 0;
begin
  -- ---------------------------------------------------------------- fixtures (as the system)
  select id into r_pmo from public.resources where organisation_id = org and profile_id = u_pmo;
  select id into r_chair from public.resources where organisation_id = org and profile_id = u_chair;
  select id into r_pm from public.resources where organisation_id = org and profile_id = u_pm;
  select id into r_viewer from public.resources where organisation_id = org and profile_id = u_viewer;
  select id into ben from public.benefits where organisation_id = org order by ref limit 1;
  select id into dep from public.dependencies where organisation_id = org order by ref limit 1;
  insert into public.work_items (organisation_id, workspace_id, project_id, title, status, finish_date)
  values (org, ws, proj, 'GL-13 overdue task', 'in_progress', date '2026-11-10') returning id into task;
  insert into public.work_item_assignees (organisation_id, workspace_id, work_item_id, project_id, resource_id)
  values (org, ws, task, proj, r_pm), (org, ws, task, proj, r_viewer);
  insert into public.work_items (organisation_id, workspace_id, project_id, title, status, finish_date)
  values (org, ws, proj, 'GL-13 future task', 'in_progress', date '2026-11-20') returning id into task2;
  insert into public.work_item_assignees (organisation_id, workspace_id, work_item_id, project_id, resource_id)
  values (org, ws, task2, proj, r_pm);
  update public.decisions set needed_by_date = date '2026-11-14', decision_maker_id = r_chair, status = 'pending'
  where id = dec;
  update public.benefits set owner_id = r_pm where id = ben;
  insert into public.benefit_measures (organisation_id, workspace_id, benefit_id, name, next_due_date)
  select organisation_id, workspace_id, id, 'GL-13 measure', date '2026-11-01' from public.benefits where id = ben
  returning id into measure;
  update public.dependencies set health_override = 'red', health_override_reason = 'GL-13', giver_owner_id = r_chair,
    receiver_owner_id = null where id = dep;

  -- ---------------------------------------------------------------- the daily rules
  res := private.generate_notifications(org);
  assert (res ->> 'raised')::int > 0, 'raised something: ' || res::text;
  assert pg_temp.open_count('task_overdue', u_pm) = 1, 'overdue task to its assignee';
  assert pg_temp.open_count('task_overdue', u_viewer) = 1, 'every assignee with a sign-in';
  assert (select count(*) from public.notifications where entity_id = task2) = 0, 'a future task raises nothing';
  assert (select text from public.notifications where entity_id = task and recipient_id = u_pm) = '“GL-13 overdue task” (RD01) was due on 10/11/2026.',
    'task text';
  assert (select due_date = date '2026-11-10' and link = '/home/my-work' and organisation_id = org and workspace_id = ws
          from public.notifications where entity_id = task and recipient_id = u_pm), 'task row shape';
  checks := checks + 5;
  assert pg_temp.open_count('decision_due', u_chair) = 1, 'decision due to its decision maker';
  assert (select text like '%is needed by 14/11/2026.' from public.notifications where kind = 'decision_due' and recipient_id = u_chair),
    'decision due text';
  assert pg_temp.open_count('measurement_overdue', u_pm) = 1, 'overdue measurement to the benefit owner';
  assert (select link = '/benefits/' || ben from public.notifications where entity_id = measure), 'measurement link';
  assert pg_temp.open_count('dependency_off_track', u_chair) = 1, 'off-track dependency to its owner';
  checks := checks + 5;

  -- Re-running raises nothing new.
  n := (select count(*) from public.notifications);
  res := private.generate_notifications(org);
  assert (res ->> 'raised')::int = 0 and (select count(*) from public.notifications) = n, 'idempotent: ' || res::text;
  checks := checks + 1;

  -- A kind the organisation switched off isn't raised.
  update public.organisations set settings = jsonb_set(coalesce(settings, '{}'), '{notifications}',
    '{"events": {"Task overdue": false}}') where id = org;
  update public.work_items set finish_date = date '2026-11-09' where id = task;
  res := private.generate_notifications(org);
  assert pg_temp.open_count('task_overdue', u_pm) = 0, 'switched-off kind: the old one resolves and no new one is raised';
  update public.organisations set settings = settings - 'notifications' where id = org;
  res := private.generate_notifications(org);
  assert pg_temp.open_count('task_overdue', u_pm) = 1
     and (select due_date from public.notifications where entity_id = task and recipient_id = u_pm and resolved_at is null) = date '2026-11-09',
     'switched back on: raised for the new finish date';
  checks := checks + 2;

  -- Resolving: task done, measurement recorded (next due moves), dependency back on track.
  update public.work_items set status = 'done' where id = task;
  update public.benefit_measures set next_due_date = date '2026-12-01' where id = measure;
  update public.dependencies set health_override = 'green' where id = dep;
  res := private.generate_notifications(org);
  assert (res ->> 'resolved')::int >= 4, 'resolved: ' || res::text;
  assert pg_temp.open_count('task_overdue', u_pm) = 0 and pg_temp.open_count('task_overdue', u_viewer) = 0, 'done task resolved';
  assert pg_temp.open_count('measurement_overdue', u_pm) = 0, 'measurement resolved';
  assert pg_temp.open_count('dependency_off_track', u_chair) = 0, 'dependency resolved';
  checks := checks + 4;
  -- Off track again on the same date: the row reopens rather than duplicating.
  update public.dependencies set health_override = 'red' where id = dep;
  perform private.generate_notifications(org);
  assert pg_temp.open_count('dependency_off_track', u_chair) = 1
     and (select count(*) from public.notifications where entity_id = dep) = 1, 'reopened, not duplicated';
  checks := checks + 1;

  -- A pack the system drafted: its editors (the forum's chair) hear about it; publishing resolves it.
  insert into public.reports (organisation_id, workspace_id, title, template_id, template_version, forum_id, scope_type,
    scope_entity_id, as_at, blocks, selection_rules, status)
  select organisation_id, workspace_id, 'GL-13 drafted pack', template_id, template_version, forum_id, scope_type,
    scope_entity_id, as_at, blocks, selection_rules, 'draft'
  from public.reports where status = 'published' limit 1
  returning id into rep;
  update public.reports set created_by = null where id = rep;
  insert into public.report_events (organisation_id, workspace_id, report_id, event, payload)
  select organisation_id, workspace_id, id, 'created', '{"system": true}' from public.reports where id = rep;
  perform private.generate_notifications(org);
  assert pg_temp.open_count('pack_drafted', u_chair) = 1, 'drafted pack to the chair';
  assert (select bool_and(link = '/governance/reports/' || rep || '/edit') from public.notifications where entity_id = rep), 'pack link';
  checks := checks + 2;

  -- ---------------------------------------------------------------- immediate triggers
  -- Issued by Priya (signed in) to Pete: Pete is told, Priya isn't.
  perform pg_temp.as_user(u_pmo);
  insert into public.work_item_offers (organisation_id, workspace_id, work_item_id, project_id, issued_to, issued_by)
  values (org, ws, task2, proj, r_pm, r_pmo) returning id into offer;
  perform pg_temp.as_postgres();
  assert pg_temp.open_count('task_issued', u_pm) = 1, 'task issued: recipient told at once';
  assert (select text from public.notifications where entity_id = offer) like 'Priya PMO issued you “GL-13 future task” (RD01).%', 'issued text';
  -- Responding resolves it.
  update public.work_item_offers set response = 'accepted', responded_at = now() where id = offer;
  assert pg_temp.open_count('task_issued', u_pm) = 0, 'responded: resolved';
  checks := checks + 3;
  -- Issuing to yourself raises nothing.
  perform pg_temp.as_user(u_pmo);
  insert into public.work_item_offers (organisation_id, workspace_id, work_item_id, project_id, issued_to, issued_by)
  values (org, ws, task2, proj, r_pmo, r_pmo);
  perform pg_temp.as_postgres();
  assert pg_temp.open_count('task_issued', u_pmo) = 0, 'not told about your own issue';
  checks := checks + 1;

  -- Decision recorded by the chair: the PM of the project hears, the chair (the recorder) doesn't;
  -- the decision-due notification resolves.
  update public.decisions set project_id = proj where id = dec;
  -- Run as postgres with the chair's claims, so auth.uid() is the chair (the recorder).
  perform set_config('request.jwt.claims', json_build_object('sub', u_chair, 'role', 'authenticated')::text, true);
  update public.decisions set status = 'made', decision_date = date '2026-11-12' where id = dec;
  perform set_config('request.jwt.claims', '', true);
  assert pg_temp.open_count('decision_recorded', u_pm) = 1, 'decision recorded: project manager told';
  assert pg_temp.open_count('decision_recorded', u_chair) = 0, 'the recorder is not told';
  assert pg_temp.open_count('decision_due', u_chair) = 0, 'decision due resolved';
  assert (select link from public.notifications where kind = 'decision_recorded' and recipient_id = u_pm) = '/portfolio/projects/RD01?tab=raid',
    'decision link';
  checks := checks + 4;

  -- ---------------------------------------------------------------- reading and marking
  perform pg_temp.as_user(u_pm);
  n := (select count(*) from public.notifications);
  assert n > 0 and n = (select count(*) from public.notifications where recipient_id = u_pm), 'Pete reads only his own';
  begin
    update public.notifications set read_at = now();
    assert false, 'no direct update';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.notifications (organisation_id, recipient_id, kind, entity_type, entity_id, text, due_date)
    values (org, u_pm, 'task_overdue', 'work_item', task, 'x', current_date);
    assert false, 'no direct insert';
  exception when insufficient_privilege then null;
  end;
  assert public.mark_notifications_read(org, array[(select id from public.notifications where kind = 'decision_recorded')]) = 1, 'mark one read';
  assert public.mark_notifications_read(org) = n - 1, 'mark all read';
  assert public.mark_notifications_read(org) = 0, 'nothing left to mark';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_out);
  assert (select count(*) from public.notifications) = 0, 'outsider reads nothing';
  assert public.mark_notifications_read(org) = 0, 'outsider marks nothing';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_viewer);
  assert (select count(*) from public.notifications where recipient_id <> u_viewer) = 0, 'viewer reads only their own';
  assert public.mark_notifications_read(org, array(select id from public.notifications where recipient_id = u_pm)) = 0, 'viewer cannot mark Pete''s';
  perform pg_temp.as_postgres();
  assert (select count(*) from public.notifications where recipient_id = u_pm and read_at is null) = 0, 'Pete''s all read';
  checks := checks + 9;

  -- ---------------------------------------------------------------- preferences
  perform pg_temp.as_user(u_chair);
  res := public.set_my_notification_preferences('{"digest": "immediate", "email": {"task_overdue": false}}');
  assert res = '{"digest": "immediate", "email": {"task_overdue": false}}', 'saved: ' || res::text;
  res := public.set_my_notification_preferences('{"inApp": {"decision_due": false}}');
  assert res @> '{"digest": "immediate", "email": {"task_overdue": false}, "inApp": {"decision_due": false}}', 'merged: ' || res::text;
  begin
    perform public.set_my_notification_preferences('{"digest": "hourly"}');
    assert false, 'bad digest refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_my_notification_preferences('{"email": {"made_up": true}}');
    assert false, 'unknown kind refused';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.set_my_notification_preferences('{"theme": "dark"}');
    assert false, 'unknown key refused';
  exception when invalid_parameter_value then null;
  end;
  perform pg_temp.as_postgres();
  assert private.notification_digest(org, u_chair) = 'immediate', 'own digest wins';
  assert private.notification_digest(org, u_pm) = 'daily', 'default daily';
  assert not private.notification_channel_on(u_chair, 'task_overdue', 'email') and private.notification_channel_on(u_chair, 'task_issued', 'email'),
    'per-kind email switch';
  update public.organisations set settings = jsonb_set(coalesce(settings, '{}'), '{notifications}', '{"digest": "Weekly"}') where id = org;
  assert private.notification_digest(org, u_pm) = 'weekly', 'organisation default';
  update public.organisations set settings = jsonb_set(settings, '{notifications}', '{"digest": "Daily", "channels": {"email": false}}') where id = org;
  assert private.notification_digest(org, u_chair) = 'off', 'organisation email off beats the person';
  update public.organisations set settings = settings - 'notifications' where id = org;
  perform pg_temp.as_user(u_chair);
  res := public.set_my_notification_preferences('{"digest": null}');
  assert not res ? 'digest', 'null digest clears it';
  perform public.set_my_notification_preferences('{"digest": "immediate"}');
  perform pg_temp.as_postgres();
  checks := checks + 10;

  -- ---------------------------------------------------------------- email
  begin
    perform pg_temp.as_user(u_admin);
    perform public.pending_notification_emails('digest');
    assert false, 'users cannot read the email queue';
  exception when insufficient_privilege then perform pg_temp.as_postgres();
  end;
  checks := checks + 1;
  -- A fresh decision due for the chair (immediate) and a task for Pete (daily).
  update public.decisions set status = 'pending', needed_by_date = date '2026-11-13' where id = dec;
  update public.work_items set status = 'in_progress', finish_date = date '2026-11-11' where id = task;
  perform private.generate_notifications(org);
  perform pg_temp.as_role('service_role');
  pend := public.pending_notification_emails('immediate');
  assert jsonb_array_length(pend) = 1 and pend -> 0 ->> 'email' = 'chair@reports-demo.test', 'immediate: the chair only: ' || pend::text;
  assert (select bool_and(x ->> 'kind' <> 'task_overdue') from jsonb_array_elements(pend -> 0 -> 'items') x), 'chair''s email for task_overdue is off';
  assert char_length(pend -> 0 ->> 'unsubscribe_token') = 64, 'token';
  token := pend -> 0 ->> 'unsubscribe_token';
  assert public.mark_notification_emails(array(select (x ->> 'id')::uuid from jsonb_array_elements(pend -> 0 -> 'items') x), 'sent') >= 1, 'marked sent';
  assert jsonb_array_length(public.pending_notification_emails('immediate')) = 0, 'sent once';
  pend := public.pending_notification_emails('digest');
  assert pend @> '[{"email": "pm@reports-demo.test", "digest": "daily"}]', 'digest includes Pete: ' || pend::text;
  assert not pend @> '[{"email": "chair@reports-demo.test"}]', 'digest leaves out the immediate people';
  perform pg_temp.as_postgres();
  -- Read notifications aren't emailed (they were marked read above, so they are skipped now).
  assert (select count(*) from public.notifications where read_at is not null and emailed_at is null and email_skipped_at is null) = 0,
    'read rows are skipped';
  -- Draft packs are never in the digest (report-notify emails them).
  assert not exists (select 1 from public.notifications where kind = 'pack_drafted' and emailed_at is not null), 'no draft packs';
  checks := checks + 8;

  -- Unsubscribe: anon with the token turns the digest off; a wrong token does nothing.
  perform pg_temp.as_role('anon');
  assert not public.unsubscribe_notification_emails(repeat('0', 64)), 'wrong token';
  assert not public.unsubscribe_notification_emails('short'), 'short token';
  assert public.unsubscribe_notification_emails(token), 'right token';
  perform pg_temp.as_postgres();
  assert private.notification_digest(org, u_chair) = 'off', 'unsubscribed';
  checks := checks + 4;

  -- ---------------------------------------------------------------- read-only organisations
  update public.organisation_subscriptions set plan = 'trial', status = null, trial_ends_at = now() - interval '1 day'
  where organisation_id = org;
  if not private.organisation_is_writable(org) then
    res := private.generate_notifications(org);
    assert res ->> 'skipped' = 'read_only', 'read-only organisation skipped: ' || res::text;
    -- Marking read still works while read-only (no read-only trigger on notifications).
    perform pg_temp.as_user(u_chair);
    perform public.mark_notifications_read(org);
    perform pg_temp.as_postgres();
    checks := checks + 1;
  else
    raise exception 'SETUP: could not make the organisation read-only';
  end if;

  -- The job runs without pg_net / Vault (local) and generates once a day.
  res := private.run_notifications();
  assert res ? 'generated', 'job result: ' || res::text;
  checks := checks + 1;

  -- Closing an account takes the person's notifications and unsubscribe links with it.
  assert exists (select 1 from public.notifications where recipient_id = u_chair), 'SETUP: the chair has notifications';
  update public.profiles set closed_at = now() where id = u_chair;
  assert not exists (select 1 from public.notifications where recipient_id = u_chair), 'closed account: notifications gone';
  assert not exists (select 1 from private.notification_unsubscribe_tokens where profile_id = u_chair), 'closed account: tokens gone';
  checks := checks + 2;

  raise notice 'notifications: % checks passed', checks;
end $$;

rollback;
