-- GL-15 report approver reminders. Needs supabase/seed/reports_demo.sql. Rolled back.
--   supabase/tests/local/run.sh migrate && run.sh seed &&
--   psql -v ON_ERROR_STOP=1 -At -d vpmo -f supabase/tests/approval_reminders.sql
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
-- A London wall-clock time as timestamptz (the seeded organisation has no time zone set).
create or replace function pg_temp.london(p text) returns timestamptz language sql as $$
  select (p::timestamp) at time zone 'Europe/London' $$;
create or replace function pg_temp.queued(p_report uuid) returns bigint language sql as $$
  select count(*) from public.report_approval_reminders where report_id = p_report $$;
create or replace function pg_temp.pending_ids() returns jsonb language sql as $$
  select coalesce(jsonb_agg(x -> 'report_id'), '[]') from jsonb_array_elements(public.pending_approval_reminders()) x $$;

do $$
declare
  org constant uuid := 'd0000000-0000-4000-8000-000000000100';
  ws constant uuid := 'd0000000-0000-4000-8000-000000000101';
  f_prog constant uuid := 'd0000000-0000-4000-8000-000000000501';
  u_chair constant uuid := 'd0000000-0000-4000-8000-000000000003';
  u_pmo constant uuid := 'd0000000-0000-4000-8000-000000000001';
  u_viewer constant uuid := 'd0000000-0000-4000-8000-000000000005';
  u_out constant uuid := 'd0000000-0000-4000-8000-000000000006';
  rep uuid;
  rec jsonb;
  pend jsonb;
  checks int := 0;
begin
  -- A report in review, submitted on Thursday 12/11/2026 at 16:00 London.
  insert into public.reports (organisation_id, workspace_id, title, template_id, template_version, forum_id, scope_type,
    scope_entity_id, as_at, blocks, selection_rules, status, submitted_at)
  select organisation_id, workspace_id, 'GL-15 pack', template_id, template_version, forum_id, scope_type,
    scope_entity_id, as_at, blocks, selection_rules, 'in_review', pg_temp.london('2026-11-12 16:00')
  from public.reports where forum_id = f_prog and status = 'published' limit 1
  returning id into rep;

  -- Recipients: the forum requires approval and has a chair, so only the chair.
  rec := private.report_approver_recipients(rep);
  assert jsonb_array_length(rec) = 1 and rec @> '[{"email":"chair@reports-demo.test","role":"chair"}]', 'chair only: ' || rec::text;
  checks := checks + 1;

  -- Same day, and the next working day before 08:00: nothing.
  assert private.queue_approval_reminders(pg_temp.london('2026-11-12 18:00')) = 0, 'not on the day of submission';
  assert pg_temp.queued(rep) = 0, 'nothing queued on the day';
  assert private.queue_approval_reminders(pg_temp.london('2026-11-13 07:45')) = 0, 'not before 08:00';
  checks := checks + 2;
  -- Friday 13/11 after 08:00: one reminder, and re-runs add nothing.
  assert private.queue_approval_reminders(pg_temp.london('2026-11-13 08:00')) = 1, 'first working day after submission';
  assert private.queue_approval_reminders(pg_temp.london('2026-11-13 08:15')) = 0, 'once a day (08:15)';
  assert private.queue_approval_reminders(pg_temp.london('2026-11-13 17:00')) = 0, 'once a day (17:00)';
  assert pg_temp.queued(rep) = 1, 'once a day';
  assert (select remind_on from public.report_approval_reminders where report_id = rep) = date '2026-11-13', 'remind_on is the local day';
  assert (select organisation_id = org and workspace_id = ws from public.report_approval_reminders where report_id = rep), 'tenant columns filled';
  checks := checks + 4;

  -- Service role sees it with what the email needs; users can't drain it.
  perform pg_temp.as_role('service_role');
  pend := public.pending_approval_reminders();
  assert pend @> jsonb_build_array(jsonb_build_object('report_id', rep, 'remind_on', '2026-11-13', 'working_days_waiting', 1,
    'forum', 'Digital Care Programme Board', 'title', 'GL-15 pack')), 'pending row: ' || pend::text;
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_chair);
  begin
    perform public.pending_approval_reminders();
    assert false, 'users cannot read the queue through the RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_approval_reminder_sent(gen_random_uuid(), '{}');
    assert false, 'users cannot mark reminders';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.queue_approval_reminders();
    assert false, 'users cannot queue reminders';
  exception when insufficient_privilege then null;
  end;
  -- Table reads: PMO yes; the chair (a contributor), viewers and outsiders no.
  assert (select count(*) from public.report_approval_reminders where report_id = rep) = 0, 'chair (contributor) does not read the table';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_viewer);
  assert (select count(*) from public.report_approval_reminders) = 0, 'viewer reads nothing';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_out);
  assert (select count(*) from public.report_approval_reminders) = 0, 'outsider reads nothing';
  perform pg_temp.as_postgres();
  perform pg_temp.as_user(u_pmo);
  assert (select count(*) from public.report_approval_reminders where report_id = rep) = 1, 'PMO reads it';
  begin
    insert into public.report_approval_reminders (report_id, submitted_at, remind_on) values (rep, now(), current_date);
    assert false, 'no direct insert';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.as_postgres();
  checks := checks + 7;

  -- Sent once.
  perform pg_temp.as_role('service_role');
  perform public.mark_approval_reminder_sent((select id from public.report_approval_reminders where report_id = rep), '{"sent":1}');
  assert not pg_temp.pending_ids() @> to_jsonb(array[rep]), 'sent is no longer pending';
  perform pg_temp.as_postgres();
  checks := checks + 1;

  -- Weekend: nothing. Monday 16/11: the next one, 2 working days waiting.
  assert private.queue_approval_reminders(pg_temp.london('2026-11-14 10:00')) = 0
     and private.queue_approval_reminders(pg_temp.london('2026-11-15 10:00')) = 0, 'no weekend reminders';
  assert private.queue_approval_reminders(pg_temp.london('2026-11-16 09:00')) = 1, 'Monday';
  perform pg_temp.as_role('service_role');
  assert public.pending_approval_reminders() @> jsonb_build_array(jsonb_build_object('report_id', rep, 'working_days_waiting', 2)), 'two working days waiting';
  perform pg_temp.as_postgres();
  checks := checks + 3;

  -- Monday's not sent; Tuesday supersedes it.
  assert private.queue_approval_reminders(pg_temp.london('2026-11-17 09:00')) = 1, 'Tuesday';
  assert (select result ->> 'skipped' from public.report_approval_reminders where report_id = rep and remind_on = '2026-11-16') = 'superseded',
    'yesterday''s unsent reminder is superseded';
  checks := checks + 2;

  -- Decided (approved): Tuesday's is skipped, nothing pending, nothing new.
  update public.reports set status = 'approved', approved_at = now() where id = rep;
  assert private.queue_approval_reminders(pg_temp.london('2026-11-17 09:15')) = 0, 'nothing for an approved report';
  assert (select result ->> 'skipped' from public.report_approval_reminders where report_id = rep and remind_on = '2026-11-17') = 'decided', 'stopped';
  perform pg_temp.as_role('service_role');
  assert not pg_temp.pending_ids() @> to_jsonb(array[rep]), 'nothing pending once decided';
  perform pg_temp.as_postgres();
  assert private.queue_approval_reminders(pg_temp.london('2026-11-18 09:00')) = 0, 'still nothing the next day';
  checks := checks + 4;

  -- Returned and resubmitted on Wednesday 18/11: a new assignment, first reminder Thursday.
  update public.reports set status = 'in_review', approved_at = null, submitted_at = pg_temp.london('2026-11-18 11:00') where id = rep;
  assert private.queue_approval_reminders(pg_temp.london('2026-11-18 12:00')) = 0, 'not on the day of resubmission';
  assert private.queue_approval_reminders(pg_temp.london('2026-11-19 08:30')) = 1, 'Thursday after resubmission';
  checks := checks + 2;

  -- Withdrawn-like exit (back to draft): stopped.
  update public.reports set status = 'draft' where id = rep;
  assert private.queue_approval_reminders(pg_temp.london('2026-11-19 08:45')) = 0, 'nothing queued after return';
  assert (select result ->> 'skipped' from public.report_approval_reminders where report_id = rep and remind_on = '2026-11-19') = 'decided', 'stopped on return';
  checks := checks + 1;

  -- Friday submission: first reminder Monday.
  update public.reports set status = 'in_review', submitted_at = pg_temp.london('2026-11-20 10:00') where id = rep;
  assert private.queue_approval_reminders(pg_temp.london('2026-11-21 10:00')) = 0, 'not Saturday';
  assert private.queue_approval_reminders(pg_temp.london('2026-11-23 08:01')) = 1, 'Monday after a Friday submission';
  checks := checks + 2;

  -- Forum without required approval: PMO / admins of the workspace instead.
  update public.forums set approval_required = false where id = f_prog;
  rec := private.report_approver_recipients(rep);
  assert rec @> '[{"email":"pmo@reports-demo.test","role":"pmo"}]' and rec @> '[{"email":"admin@reports-demo.test","role":"pmo"}]'
     and not rec @> '[{"email":"chair@reports-demo.test"}]', 'PMO when approval is not required: ' || rec::text;
  update public.forums set approval_required = true where id = f_prog;
  checks := checks + 1;

  -- Read-only organisation: skipped, nothing queued.
  update public.organisation_subscriptions set trial_ends_at = now() - interval '1 day' where organisation_id = org;
  assert not private.organisation_is_writable(org), 'setup: read-only';
  assert private.queue_approval_reminders(pg_temp.london('2026-11-24 09:00')) = 0, 'read-only: nothing queued';
  assert (select result ->> 'skipped' from public.report_approval_reminders where report_id = rep and remind_on = '2026-11-23') = 'read_only',
    'read-only: unsent skipped';
  update public.organisation_subscriptions set trial_ends_at = now() + interval '14 days' where organisation_id = org;
  assert private.queue_approval_reminders(pg_temp.london('2026-11-24 09:05')) = 1, 'writable again: reminded';
  checks := checks + 3;

  -- The cron entry point queues as well (no pg_net locally, so it returns null).
  assert private.trigger_report_notify() is null, 'trigger_report_notify runs without pg_net';
  checks := checks + 1;

  raise notice 'approval_reminders: % checks passed', checks;
end $$;

rollback;
select 'approval_reminders ok';
