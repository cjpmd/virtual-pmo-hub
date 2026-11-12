-- GL-15 Report approver reminders (deferred item RB-34; report builder spec §12: "to approvers
-- when a report enters in_review"). Additive only: one new table, new functions, and
-- private.trigger_report_notify replaced so the existing vpmo-report-notify job (every 15
-- minutes) also queues and sends the reminders. No cron, Vault or edge-function secret changes.
--
-- What "pending approval" means here
--   A report's approval is its in_review status (submit_report -> approve_report / return_report),
--   not public.approval_steps: those are project gates whose steps name a role, not a person,
--   and have no "assigned" time, so nobody can be reminded about them. The approvers are the
--   people private.can_approve_report lets approve: the forum's chair(s) when the forum
--   requires approval and has a chair; otherwise the PMO / admins of the report's workspace
--   (of the organisation for an organisation-wide report).
--
-- When
--   * Assigned = reports.submitted_at (a returned and resubmitted report starts again).
--   * First reminder on the first working day (Monday to Friday, as
--     private.working_days_between) after the day it was submitted, in the organisation's time
--     zone, then every working day, from 08:00 local time (the 15-minute job queues it on its
--     first run after 08:00).
--   * Stops when the report leaves in_review (approved, returned, or anything else): unsent
--     rows for it are marked skipped and never sent.
--   * Holiday calendars are not used: they belong to resources, not to the organisation.
--   * Read-only organisations (GL-4: lapsed, or pending deletion) are skipped.
--
-- Idempotency
--   One row per (report, submitted_at, remind_on), unique, so re-runs queue nothing new. The
--   edge function sends each recipient one email with the Resend idempotency key
--   report-<id>-approval/<remind_on>/<n> and marks the row sent. A row not sent by the end of
--   its day is marked skipped (superseded) when the next day's row is queued.

-- =====================================================================================
-- 1. Table
-- =====================================================================================
create table public.report_approval_reminders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid,
  report_id uuid not null,
  submitted_at timestamptz not null,
  remind_on date not null,
  recipients jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  skipped_at timestamptz,
  result jsonb,
  unique (report_id, submitted_at, remind_on),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
comment on table public.report_approval_reminders is
  'GL-15: one daily reminder per report in review, to its approvers. Written by the report-notify job only.';
create index report_approval_reminders_report_idx on public.report_approval_reminders (report_id, organisation_id);
create index report_approval_reminders_ws_idx on public.report_approval_reminders (workspace_id, organisation_id);
create index report_approval_reminders_org_idx on public.report_approval_reminders (organisation_id);
create index report_approval_reminders_pending_idx on public.report_approval_reminders (created_at)
  where sent_at is null and skipped_at is null;
create trigger report_approval_reminders_00_tenant_guard before insert on public.report_approval_reminders
  for each row execute function private.tenant_guard('report_id', 'reports');
create trigger zz_org_read_only before insert or update or delete on public.report_approval_reminders
  for each row execute function private.enforce_org_writable();

alter table public.report_approval_reminders enable row level security;
revoke all on public.report_approval_reminders from anon, authenticated;
grant select on public.report_approval_reminders to authenticated;
-- Recipients' emails are in the row, so only the report's PMO / admins read it.
create policy report_approval_reminders_select on public.report_approval_reminders for select to authenticated
  using ((select private.is_report_pmo(report_id)));

-- =====================================================================================
-- 2. Who approves a report (mirrors private.can_approve_report, for every person rather than
--    the signed-in user).
-- =====================================================================================
create function private.report_approver_recipients(p_report uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (select * from public.reports where id = p_report),
  f as (select f.* from r join public.forums f on f.id = r.forum_id),
  chair_exists as (
    select exists (select 1 from f where f.chair_resource_id is not null)
      or exists (select 1 from f join public.forum_members m on m.forum_id = f.id and m.role = 'chair') as yes
  ),
  chairs as (
    select pr.id as profile_id, pr.email, pr.display_name, 'chair' as role
    from f join public.resources res on res.id = f.chair_resource_id join public.profiles pr on pr.id = res.profile_id
    union
    select pr.id, pr.email, pr.display_name, 'chair'
    from f join public.forum_members m on m.forum_id = f.id and m.role = 'chair'
    join public.resources res on res.id = m.resource_id join public.profiles pr on pr.id = res.profile_id
  ),
  -- is_report_pmo: organisation PMO / admins for an organisation-wide report; otherwise the
  -- workspace's PMO / admins (workspace members, and organisation PMO / admins), none while
  -- the workspace is archived (its roles are capped at viewer).
  pmo as (
    select pr.id as profile_id, pr.email, pr.display_name, 'pmo' as role
    from r join public.organisation_members om on om.organisation_id = r.organisation_id and om.role >= 'pmo'
    join public.profiles pr on pr.id = om.profile_id
    where r.workspace_id is null
       or exists (select 1 from public.workspaces w where w.id = r.workspace_id and w.archived_at is null)
    union
    select pr.id, pr.email, pr.display_name, 'pmo'
    from r join public.workspace_members wm on wm.workspace_id = r.workspace_id and wm.role >= 'pmo'
    join public.workspaces w on w.id = wm.workspace_id and w.archived_at is null
    join public.profiles pr on pr.id = wm.profile_id
  ),
  chosen as (
    select * from chairs
    where (select coalesce(bool_and(f.approval_required), false) from f) and (select yes from chair_exists)
    union all
    select * from pmo
    where not ((select coalesce(bool_and(f.approval_required), false) from f) and (select yes from chair_exists))
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object('profile_id', c.profile_id, 'email', c.email, 'name', c.display_name, 'role', c.role)), '[]')
  from chosen c
  where coalesce(btrim(c.email), '') <> '';
$$;
revoke all on function private.report_approver_recipients(uuid) from public, anon, authenticated;

-- First day a reminder is due: the first weekday strictly after the day of submission.
create function private.approval_first_reminder_day(p_submitted_on date)
returns date
language sql
immutable
set search_path = ''
as $$
  select min(d)::date from generate_series(p_submitted_on + 1, p_submitted_on + 7, interval '1 day') d
  where extract(isodow from d) < 6;
$$;
revoke all on function private.approval_first_reminder_day(date) from public, anon, authenticated;

-- =====================================================================================
-- 3. Queue (called by trigger_report_notify every 15 minutes). Returns rows queued.
--    p_now is for tests.
-- =====================================================================================
create function private.queue_approval_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
begin
  -- Stop: anything unsent for a report that is no longer in review with that submission, or
  -- for an earlier day (superseded), or for a read-only organisation.
  update public.report_approval_reminders a
  set skipped_at = p_now,
      result = jsonb_build_object('skipped', case
        when r.status is distinct from 'in_review' or r.submitted_at is distinct from a.submitted_at then 'decided'
        when not private.organisation_is_writable(a.organisation_id) then 'read_only'
        else 'superseded' end)
  from public.reports r
  where r.id = a.report_id and a.sent_at is null and a.skipped_at is null
    and (r.status is distinct from 'in_review' or r.submitted_at is distinct from a.submitted_at
         or not private.organisation_is_writable(a.organisation_id)
         or a.remind_on < (p_now at time zone private.org_time_zone(a.organisation_id))::date);

  insert into public.report_approval_reminders (report_id, submitted_at, remind_on, recipients)
  select x.id, x.submitted_at, x.local_now::date, private.report_approver_recipients(x.id)
  from (
    select r.id, r.submitted_at, r.organisation_id,
      p_now at time zone private.org_time_zone(r.organisation_id) as local_now,
      (r.submitted_at at time zone private.org_time_zone(r.organisation_id))::date as submitted_on
    from public.reports r
    where r.status = 'in_review' and r.submitted_at is not null and r.forum_id is not null
  ) x
  where extract(isodow from x.local_now) < 6
    and x.local_now::time >= time '08:00'
    and x.local_now::date >= private.approval_first_reminder_day(x.submitted_on)
    and private.organisation_is_writable(x.organisation_id)
  on conflict (report_id, submitted_at, remind_on) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.queue_approval_reminders(timestamptz) from public, anon, authenticated;

-- The organisation's time zone (Settings › Regional), as private.org_today reads it.
create function private.org_time_zone(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select o.settings -> 'regional' ->> 'timeZone' from public.organisations o where o.id = p_org), 'Europe/London');
$$;
revoke all on function private.org_time_zone(uuid) from public, anon, authenticated;

-- =====================================================================================
-- 4. Service role: what to send, and marking it.
-- =====================================================================================
create function public.pending_approval_reminders()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'report_id', a.report_id, 'remind_on', a.remind_on,
      'recipients', a.recipients, 'title', r.title, 'forum', f.name, 'meeting_date', m.meeting_date,
      'submitted_at', a.submitted_at,
      'working_days_waiting', private.working_days_between(
        (a.submitted_at at time zone private.org_time_zone(a.organisation_id))::date, a.remind_on))
    order by a.created_at), '[]')
  from public.report_approval_reminders a
  join public.reports r on r.id = a.report_id
  left join public.forums f on f.id = r.forum_id
  left join public.meetings m on m.id = r.meeting_id
  where a.sent_at is null and a.skipped_at is null
    and r.status = 'in_review' and r.submitted_at = a.submitted_at;
$$;

create function public.mark_approval_reminder_sent(p_id uuid, p_result jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.report_approval_reminders set sent_at = now(), result = p_result
  where id = p_id and sent_at is null and skipped_at is null;
$$;
revoke all on function public.pending_approval_reminders(), public.mark_approval_reminder_sent(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.pending_approval_reminders(), public.mark_approval_reminder_sent(uuid, jsonb) to service_role;

-- =====================================================================================
-- 5. The existing 15-minute job: queue reminders, then call report-notify when either queue
--    has something waiting. Same Vault secrets as before.
-- =====================================================================================
create or replace function private.trigger_report_notify()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_request bigint;
begin
  perform private.queue_approval_reminders();
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  if not exists (select 1 from public.report_notifications where sent_at is null)
     and not exists (select 1 from public.report_approval_reminders a join public.reports r on r.id = a.report_id
                     where a.sent_at is null and a.skipped_at is null
                       and r.status = 'in_review' and r.submitted_at = a.submitted_at) then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'report_notify_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'report_notify_service_key';
  if v_url is null or v_key is null then
    raise warning 'report-notify: Vault secrets report_notify_url / report_notify_service_key are not set';
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 10000)'
    into v_request
    using v_url, jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'), '{}'::jsonb;
  return v_request;
end;
$$;
revoke all on function private.trigger_report_notify() from public, anon, authenticated;
