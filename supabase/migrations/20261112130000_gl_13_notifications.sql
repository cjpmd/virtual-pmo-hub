-- GL-13 Real notifications (build plan 4.1). docs/sql/gl-13-notifications.sql is identical.
-- NOT APPLIED to production: tested on the local Postgres only (supabase/tests/notifications.sql).
-- Additive only: no drop or truncate, and nothing is deleted when it is applied. The one delete is
-- inside a trigger function: closing an account removes that person's own notifications (§7).
--
-- What it adds
--   * public.notifications: one row per (recipient, kind, entity, due date), written only by the
--     generator and the triggers below (security definer). Recipients read their own rows and
--     mark them read through an RPC. A generator run also marks rows resolved when the thing
--     they were about no longer applies (task done, decision made, dependency back on track).
--   * private.generate_notifications(org): the five daily rules the browser hook used to work out
--     (overdue tasks, decisions due or overdue, overdue benefit measurements, off-track
--     dependencies, system-drafted packs) for every writable organisation.
--   * Immediate triggers: a task issued to you (work_item_offers insert) and a decision recorded
--     on your project or that you were to make (decisions.status leaving pending).
--   * Per-user preferences in profiles.preferences -> 'notifications' (no new table): email
--     digest (immediate | daily | weekly | off) and per-kind in-app / email switches, written
--     only through set_my_notification_preferences. Organisation settings still decide what is
--     sent at all (settings.notifications.channels.email and .events).
--   * Closing an account (GL-11) removes that person's notifications and unsubscribe tokens.
--   * Email: service-role RPCs for send-notification-email (pending emails, marking) and
--     one-click unsubscribe tokens (private table, sha256 only).
--   * The job vpmo-notifications every 15 minutes: generates once a day from 07:00 Europe/London,
--     sends "as they happen" emails each run and the daily (weekly on Mondays) digest once a day
--     from 07:30, through pg_net and the Vault secret notification_email_url.
--
-- Read-only organisations (GL-4)
--   public.notifications has NO zz_org_read_only trigger, like user_favourites: its rows are a
--   person's own inbox, written by the system, and marking one read must keep working while the
--   organisation is read-only. The generator and the email job skip organisations that aren't
--   writable (lapsed, or pending deletion), so nothing new is raised for them. The exemption is
--   listed in supabase/tests/read_only_mode.sql and AGENTS.md.

-- =====================================================================================
-- 1. Table
-- =====================================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  workspace_id uuid,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  entity_type text not null,
  entity_id uuid not null,
  text text not null,
  link text,
  due_date date not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  emailed_at timestamptz,
  email_skipped_at timestamptz,
  constraint notifications_kind_check check (kind in (
    'task_overdue', 'task_issued', 'decision_due', 'decision_recorded',
    'measurement_overdue', 'dependency_off_track', 'pack_drafted')),
  constraint notifications_entity_type_check check (entity_type in (
    'work_item', 'work_item_offer', 'decision', 'benefit_measure', 'dependency', 'report')),
  constraint notifications_text_check check (char_length(text) between 1 and 500),
  constraint notifications_link_check check (link is null or (link like '/%' and char_length(link) <= 300)),
  constraint notifications_unique unique (recipient_id, kind, entity_id, due_date),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
comment on table public.notifications is
  'GL-13: a person''s notifications. Written only by private.generate_notifications and the notify triggers; recipients read their own and mark them read (mark_notifications_read). No read-only trigger: personal inbox state, like user_favourites.';
create index notifications_recipient_idx on public.notifications (recipient_id, organisation_id, created_at desc);
create index notifications_org_idx on public.notifications (organisation_id);
create index notifications_ws_idx on public.notifications (workspace_id, organisation_id);
create index notifications_open_idx on public.notifications (organisation_id, kind)
  where resolved_at is null;
create index notifications_email_idx on public.notifications (organisation_id, recipient_id)
  where emailed_at is null and email_skipped_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid())
         and organisation_id = any ((select private.my_org_ids())::uuid[]));

-- =====================================================================================
-- 2. Settings: what the organisation allows, and what each person wants
-- =====================================================================================
-- The Settings › Notifications event label for each kind (organisations.settings ->
-- 'notifications' -> 'events' is keyed by label; a missing label counts as on).
create function private.notification_event_label(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'task_overdue' then 'Task overdue'
    when 'task_issued' then 'Task issued to me'
    when 'decision_due' then 'Decision needed by date approaching'
    when 'decision_recorded' then 'Decision recorded'
    when 'measurement_overdue' then 'Measurement overdue'
    when 'dependency_off_track' then 'Dependency off track'
    when 'pack_drafted' then 'Draft pack ready'
  end;
$$;

create function private.notification_kind_enabled(p_org uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case jsonb_typeof(o.settings -> 'notifications' -> 'events' -> private.notification_event_label(p_kind))
             when 'boolean' then (o.settings -> 'notifications' -> 'events' ->> private.notification_event_label(p_kind))::boolean
             else true end
    from public.organisations o where o.id = p_org), false);
$$;

-- The email digest a person gets in an organisation: off when the organisation has email
-- switched off; else their own choice; else the organisation's default ("Real time" ->
-- immediate, "Weekly" -> weekly, anything else -> daily).
create function private.notification_digest(p_org uuid, p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce((select (o.settings -> 'notifications' -> 'channels' ->> 'email')::boolean
                   from public.organisations o where o.id = p_org), true) is false then 'off'
    else coalesce(
      (select p.preferences -> 'notifications' ->> 'digest' from public.profiles p where p.id = p_profile),
      (select case o.settings -> 'notifications' ->> 'digest'
                when 'Real time' then 'immediate' when 'Weekly' then 'weekly' else 'daily' end
       from public.organisations o where o.id = p_org),
      'daily')
  end;
$$;

-- Whether a person wants a kind on a channel ('inApp' | 'email'); missing means yes.
create function private.notification_channel_on(p_profile uuid, p_kind text, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case jsonb_typeof(p.preferences -> 'notifications' -> p_channel -> p_kind)
             when 'boolean' then (p.preferences -> 'notifications' -> p_channel ->> p_kind)::boolean
             else true end
    from public.profiles p where p.id = p_profile), true);
$$;

revoke execute on function private.notification_event_label(text), private.notification_kind_enabled(uuid, text),
  private.notification_digest(uuid, uuid), private.notification_channel_on(uuid, text, text)
  from public, anon, authenticated;

-- A person's own preferences: { digest?: immediate|daily|weekly|off|null, inApp?: {kind: bool},
-- email?: {kind: bool} }. Merged into profiles.preferences -> 'notifications'; a null digest
-- clears the choice (back to the organisation's default). Profiles have no read-only trigger.
create function public.set_my_notification_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current jsonb;
  v_next jsonb;
  v_channel text;
  v_key text;
  v_value jsonb;
  v_kinds text[] := array['task_overdue', 'task_issued', 'decision_due', 'decision_recorded',
                          'measurement_overdue', 'dependency_off_track', 'pack_drafted'];
begin
  if v_uid is null then
    raise exception 'Sign in to change your notification settings.' using errcode = '42501';
  end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Notification settings must be an object.' using errcode = '22023';
  end if;
  select coalesce(preferences -> 'notifications', '{}'::jsonb) into v_current
  from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(v_current) <> 'object' then v_current := '{}'::jsonb; end if;
  v_next := v_current;
  for v_key in select jsonb_object_keys(p_preferences) loop
    if v_key not in ('digest', 'inApp', 'email') then
      raise exception 'Unknown notification setting: %', v_key using errcode = '22023';
    end if;
  end loop;
  if p_preferences ? 'digest' then
    v_value := p_preferences -> 'digest';
    if jsonb_typeof(v_value) = 'null' then
      v_next := v_next - 'digest';
    elsif jsonb_typeof(v_value) = 'string' and v_value #>> '{}' in ('immediate', 'daily', 'weekly', 'off') then
      v_next := jsonb_set(v_next, '{digest}', v_value);
    else
      raise exception 'Digest must be immediate, daily, weekly or off.' using errcode = '22023';
    end if;
  end if;
  foreach v_channel in array array['inApp', 'email'] loop
    if p_preferences ? v_channel then
      if jsonb_typeof(p_preferences -> v_channel) <> 'object' then
        raise exception '% must be an object of kinds.', v_channel using errcode = '22023';
      end if;
      for v_key, v_value in select * from jsonb_each(p_preferences -> v_channel) loop
        if not (v_key = any (v_kinds)) or jsonb_typeof(v_value) <> 'boolean' then
          raise exception 'Unknown notification kind or value: %', v_key using errcode = '22023';
        end if;
        v_next := jsonb_set(v_next, array[v_channel],
          coalesce(case when jsonb_typeof(v_next -> v_channel) = 'object' then v_next -> v_channel end, '{}'::jsonb)
            || jsonb_build_object(v_key, v_value));
      end loop;
    end if;
  end loop;
  update public.profiles
  set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{notifications}', v_next),
      updated_at = now()
  where id = v_uid;
  return v_next;
end;
$$;
revoke execute on function public.set_my_notification_preferences(jsonb) from public, anon;
grant execute on function public.set_my_notification_preferences(jsonb) to authenticated;

-- =====================================================================================
-- 3. Writing notifications
-- =====================================================================================
-- Inserts one notification per current member of the organisation among p_profiles, when the
-- organisation has the kind switched on. Re-running is safe (unique key). A row that was
-- resolved and applies again (same entity and due date) is reopened.
create function private.raise_notification(
  p_org uuid, p_workspace uuid, p_profiles uuid[], p_kind text, p_entity_type text,
  p_entity uuid, p_text text, p_link text, p_due date, p_exclude uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_profiles is null or not private.notification_kind_enabled(p_org, p_kind) then
    return 0;
  end if;
  insert into public.notifications as n
    (organisation_id, workspace_id, recipient_id, kind, entity_type, entity_id, text, link, due_date)
  select p_org, p_workspace, m.profile_id, p_kind, p_entity_type, p_entity, left(p_text, 500), p_link, p_due
  from (select distinct unnest(p_profiles) as profile_id) r
  join public.organisation_members m on m.organisation_id = p_org and m.profile_id = r.profile_id
  join public.profiles pr on pr.id = m.profile_id and pr.closed_at is null
  where r.profile_id is not null and r.profile_id is distinct from p_exclude
  on conflict (recipient_id, kind, entity_id, due_date) do update
    set resolved_at = null, text = excluded.text, link = excluded.link
    where n.resolved_at is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Profiles behind resources (people without a sign-in have none).
create function private.resource_profiles(p_resources uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.profile_id) filter (where r.profile_id is not null), '{}')
  from public.resources r where r.id = any (p_resources);
$$;

revoke execute on function private.raise_notification(uuid, uuid, uuid[], text, text, uuid, text, text, date, uuid),
  private.resource_profiles(uuid[]) from public, anon, authenticated;

-- =====================================================================================
-- 4. The daily rules (same five the browser hook used, plus resolving what no longer applies)
-- =====================================================================================
create function private.generate_notifications(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.org_today(p_org);
  v_raised integer := 0;
  v_resolved integer := 0;
  v_n integer;
  r record;
begin
  if not private.organisation_is_writable(p_org) then
    return jsonb_build_object('organisation_id', p_org, 'skipped', 'read_only');
  end if;

  -- 4a. Overdue tasks, to their assignees: one per task, keyed by its finish date.
  for r in
    select wi.id, wi.workspace_id, wi.title, wi.finish_date, p.code, p.name as project_name,
           array_agg(a.resource_id) as resources
    from public.work_items wi
    join public.projects p on p.id = wi.project_id and p.archived_at is null
    join public.work_item_assignees a on a.work_item_id = wi.id
    where wi.organisation_id = p_org and wi.deleted_at is null and wi.status <> 'done'
      and wi.finish_date < v_today
    group by wi.id, p.code, p.name
  loop
    v_raised := v_raised + private.raise_notification(p_org, r.workspace_id, private.resource_profiles(r.resources),
      'task_overdue', 'work_item', r.id,
      format('“%s” (%s) was due on %s.', r.title, coalesce(r.code, r.project_name), to_char(r.finish_date, 'DD/MM/YYYY')),
      '/home/my-work', r.finish_date);
  end loop;

  -- 4b. Pending decisions needed within three days or overdue: the decision maker, whoever
  --     raised it and the project's manager.
  for r in
    select d.id, d.workspace_id, d.ref, d.title, d.needed_by_date, p.code, p.manager_id,
           d.decision_maker_id, d.created_by
    from public.decisions d
    left join public.projects p on p.id = d.project_id
    where d.organisation_id = p_org and d.status = 'pending' and d.needed_by_date is not null
      and d.needed_by_date <= v_today + 3
      and (p.id is null or p.archived_at is null)
  loop
    v_raised := v_raised + private.raise_notification(p_org, r.workspace_id,
      private.resource_profiles(array[r.decision_maker_id, r.manager_id]) || array[r.created_by],
      'decision_due', 'decision', r.id,
      case when r.needed_by_date < v_today
        then format('%s “%s” passed its needed-by date (%s) and is still pending.', coalesce(r.ref, 'A decision'), r.title, to_char(r.needed_by_date, 'DD/MM/YYYY'))
        else format('%s “%s” is needed by %s.', coalesce(r.ref, 'A decision'), r.title, to_char(r.needed_by_date, 'DD/MM/YYYY')) end,
      case when r.code is not null then '/portfolio/projects/' || r.code || '?tab=raid' else '/governance/raidd' end,
      r.needed_by_date);
  end loop;

  -- 4c. Overdue measurements, to the benefit's owner.
  for r in
    select m.id, m.workspace_id, m.name, m.next_due_date, b.id as benefit_id, b.ref, b.owner_id
    from public.benefit_measures m
    join public.benefits b on b.id = m.benefit_id
    where m.organisation_id = p_org and m.next_due_date < v_today and b.owner_id is not null
      and b.status not in ('realised', 'not_realised', 'closed')
  loop
    v_raised := v_raised + private.raise_notification(p_org, r.workspace_id, private.resource_profiles(array[r.owner_id]),
      'measurement_overdue', 'benefit_measure', r.id,
      format('%s measurement “%s” was due on %s.', coalesce(r.ref, 'A benefit'), r.name, to_char(r.next_due_date, 'DD/MM/YYYY')),
      '/benefits/' || r.benefit_id, r.next_due_date);
  end loop;

  -- 4d. Off-track dependencies (stored health red), to both owners. Keyed by the required-by
  --     date, so one that slips to a new date notifies again.
  for r in
    select d.id, d.workspace_id, d.ref, d.description, d.giver_owner_id, d.receiver_owner_id,
           coalesce(d.required_by_date, d.raised_date, d.created_at::date) as due, h.slip_working_days
    from public.dependencies d
    join public.v_dependency_health h on h.dependency_id = d.id
    where d.organisation_id = p_org and h.health = 'red'
  loop
    v_raised := v_raised + private.raise_notification(p_org, r.workspace_id,
      private.resource_profiles(array[r.giver_owner_id, r.receiver_owner_id]),
      'dependency_off_track', 'dependency', r.id,
      format('%s is off track%s.', coalesce(r.ref, 'A dependency'),
        case when coalesce(r.slip_working_days, 0) > 0 then format(': %s working days late', r.slip_working_days) else '' end),
      '/delivery/dependencies', r.due);
  end loop;

  -- 4e. Packs the system drafted when the papers deadline passed, to their editors (forum chair
  --     and secretary, else PMO). report-notify already emails these, so they are in-app only.
  for r in
    select rep.id, rep.workspace_id, rep.title, rep.created_at::date as created_on
    from public.reports rep
    where rep.organisation_id = p_org and rep.status = 'draft' and rep.created_by is null
      and exists (select 1 from public.report_events e where e.report_id = rep.id and e.event = 'created'
                  and (e.payload ->> 'system')::boolean)
  loop
    v_raised := v_raised + private.raise_notification(p_org, r.workspace_id,
      (select coalesce(array_agg((x ->> 'profile_id')::uuid), '{}') from jsonb_array_elements(private.draft_pack_recipients(r.id)) x),
      'pack_drafted', 'report', r.id,
      format('“%s” was drafted when the papers deadline passed. Review it and submit it for approval.', r.title),
      '/governance/reports/' || r.id || '/edit', r.created_on);
  end loop;

  -- 4f. Resolve what no longer applies.
  update public.notifications n set resolved_at = now()
  where n.organisation_id = p_org and n.resolved_at is null and (
    (n.kind = 'task_overdue' and not exists (
       select 1 from public.work_items wi join public.projects p on p.id = wi.project_id and p.archived_at is null
       join public.work_item_assignees a on a.work_item_id = wi.id join public.resources res on res.id = a.resource_id
       where wi.id = n.entity_id and wi.deleted_at is null and wi.status <> 'done'
         and wi.finish_date = n.due_date and res.profile_id = n.recipient_id))
    or (n.kind = 'task_issued' and not exists (
       select 1 from public.work_item_offers o where o.id = n.entity_id and o.response is null))
    or (n.kind = 'decision_due' and not exists (
       select 1 from public.decisions d where d.id = n.entity_id and d.status = 'pending' and d.needed_by_date = n.due_date))
    or (n.kind = 'measurement_overdue' and not exists (
       select 1 from public.benefit_measures m join public.benefits b on b.id = m.benefit_id
       where m.id = n.entity_id and m.next_due_date = n.due_date
         and b.status not in ('realised', 'not_realised', 'closed')))
    or (n.kind = 'dependency_off_track' and not exists (
       select 1 from public.v_dependency_health h where h.dependency_id = n.entity_id and h.health = 'red'))
    or (n.kind = 'pack_drafted' and not exists (
       select 1 from public.reports rep where rep.id = n.entity_id and rep.status = 'draft'))
  );
  get diagnostics v_n = row_count;
  v_resolved := v_resolved + v_n;

  return jsonb_build_object('organisation_id', p_org, 'raised', v_raised, 'resolved', v_resolved);
end;
$$;
revoke execute on function private.generate_notifications(uuid) from public, anon, authenticated;

-- =====================================================================================
-- 5. Immediate triggers. They never make the user's write fail: any error is a warning.
-- =====================================================================================
create function private.notify_task_issued()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_code text;
  v_issuer text;
begin
  begin
    if tg_op = 'INSERT' and new.response is null then
      select wi.title, p.code into v_title, v_code
      from public.work_items wi join public.projects p on p.id = wi.project_id where wi.id = new.work_item_id;
      select coalesce(res.name, 'Someone') into v_issuer from public.resources res where res.id = new.issued_by;
      perform private.raise_notification(new.organisation_id, new.workspace_id,
        private.resource_profiles(array[new.issued_to]), 'task_issued', 'work_item_offer', new.id,
        format('%s issued you “%s” (%s). Accept, decline or propose a date.', coalesce(v_issuer, 'Someone'), coalesce(v_title, 'a task'), coalesce(v_code, 'a project')),
        '/home/my-work', new.issued_at::date, auth.uid());
    elsif tg_op = 'UPDATE' and new.response is not null and old.response is null then
      update public.notifications set resolved_at = now()
      where kind = 'task_issued' and entity_id = new.id and resolved_at is null;
    end if;
  exception when others then
    raise warning 'notify_task_issued: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
create trigger zz_notify_task_issued after insert or update of response on public.work_item_offers
  for each row execute function private.notify_task_issued();

create function private.notify_decision_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_manager uuid;
  v_label text;
begin
  begin
    if old.status = 'pending' and new.status = 'made' then
      select p.code, p.manager_id into v_code, v_manager from public.projects p where p.id = new.project_id;
      v_label := coalesce(new.ref, 'A decision');
      perform private.raise_notification(new.organisation_id, new.workspace_id,
        private.resource_profiles(array[new.decision_maker_id, v_manager]) || array[new.created_by],
        'decision_recorded', 'decision', new.id,
        format('%s “%s” was recorded%s.', v_label, new.title, case when v_code is not null then ' on ' || v_code else '' end),
        case when v_code is not null then '/portfolio/projects/' || v_code || '?tab=raid' else '/governance/raidd' end,
        coalesce(new.decision_date, private.org_today(new.organisation_id)), auth.uid());
    end if;
    if old.status = 'pending' and new.status <> 'pending' then
      update public.notifications set resolved_at = now()
      where kind = 'decision_due' and entity_id = new.id and resolved_at is null;
    end if;
  exception when others then
    raise warning 'notify_decision_recorded: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
create trigger zz_notify_decision_recorded after update of status on public.decisions
  for each row when (old.status is distinct from new.status)
  execute function private.notify_decision_recorded();

revoke execute on function private.notify_task_issued(), private.notify_decision_recorded()
  from public, anon, authenticated;

-- =====================================================================================
-- 6. Reading and marking (signed in)
-- =====================================================================================
-- Marks the caller's notifications read in one organisation: the given ids, or all of them.
create function public.mark_notifications_read(p_organisation uuid, p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = now()
  where recipient_id = v_uid and organisation_id = p_organisation and read_at is null
    and (p_ids is null or id = any (p_ids))
    and organisation_id = any (private.my_org_ids());
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.mark_notifications_read(uuid, uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid, uuid[]) to authenticated;

-- =====================================================================================
-- 7. Email (service role, for the send-notification-email edge function)
-- =====================================================================================
create table private.notification_unsubscribe_tokens (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index notification_unsubscribe_tokens_profile_idx on private.notification_unsubscribe_tokens (profile_id);
revoke all on private.notification_unsubscribe_tokens from public, anon, authenticated;

-- One row per day the daily digest went out (so it goes once a day).
create table private.notification_runs (
  run_on date primary key,
  generated_at timestamptz,
  digest_done_at timestamptz
);
revoke all on private.notification_runs from public, anon, authenticated;

-- Emails due. p_mode 'immediate': everyone whose digest is "as they happen". p_mode 'digest':
-- everyone on daily, and on weekly when it's Monday in London. One entry per (organisation,
-- person) with up to 50 items and a fresh unsubscribe token. Rows that will never be emailed
-- (person or organisation switched it off, already read or resolved, draft packs, not a member
-- any more, read-only organisation) are marked email_skipped_at here.
create function public.pending_notification_emails(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weekly boolean := extract(isodow from now() at time zone 'Europe/London') = 1;
  v_result jsonb := '[]'::jsonb;
  r record;
  v_token text;
begin
  if p_mode not in ('immediate', 'digest') then
    raise exception 'mode must be immediate or digest' using errcode = '22023';
  end if;

  update public.notifications n set email_skipped_at = now()
  where n.emailed_at is null and n.email_skipped_at is null and (
    n.kind = 'pack_drafted'
    or n.read_at is not null or n.resolved_at is not null
    or n.created_at < now() - interval '8 days'
    or not exists (select 1 from public.organisation_members m where m.organisation_id = n.organisation_id and m.profile_id = n.recipient_id)
    or not private.organisation_is_writable(n.organisation_id)
    or private.notification_digest(n.organisation_id, n.recipient_id) = 'off'
    or not private.notification_kind_enabled(n.organisation_id, n.kind)
    or not private.notification_channel_on(n.recipient_id, n.kind, 'email'));

  for r in
    select n.organisation_id, n.recipient_id, o.name as organisation_name, p.email, p.display_name,
           jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'text', n.text, 'link', n.link,
                                        'due_date', n.due_date) order by n.created_at, n.id) as items,
           count(*) as total
    from public.notifications n
    join public.organisations o on o.id = n.organisation_id
    join public.profiles p on p.id = n.recipient_id
    where n.emailed_at is null and n.email_skipped_at is null
      and coalesce(p.email, '') <> ''
      and case private.notification_digest(n.organisation_id, n.recipient_id)
            when 'immediate' then p_mode = 'immediate'
            when 'daily' then p_mode = 'digest'
            when 'weekly' then p_mode = 'digest' and v_weekly
            else false end
    group by n.organisation_id, n.recipient_id, o.name, p.email, p.display_name
  loop
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into private.notification_unsubscribe_tokens (token_hash, profile_id)
    values (sha256(convert_to(v_token, 'UTF8')), r.recipient_id);
    v_result := v_result || jsonb_build_object(
      'organisation_id', r.organisation_id, 'organisation_name', r.organisation_name,
      'recipient_id', r.recipient_id, 'email', r.email, 'name', r.display_name,
      'digest', private.notification_digest(r.organisation_id, r.recipient_id),
      'total', r.total,
      'items', (select coalesce(jsonb_agg(x), '[]') from (select x from jsonb_array_elements(r.items) x limit 50) t),
      'unsubscribe_token', v_token);
  end loop;
  return v_result;
end;
$$;

-- Marks the notifications in one email: 'sent' sets emailed_at, 'skipped' email_skipped_at.
-- Only rows still waiting change, so a retry can't double-mark.
create function public.mark_notification_emails(p_ids uuid[], p_outcome text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_outcome not in ('sent', 'skipped') then
    raise exception 'outcome must be sent or skipped' using errcode = '22023';
  end if;
  update public.notifications
  set emailed_at = case when p_outcome = 'sent' then now() end,
      email_skipped_at = case when p_outcome = 'skipped' then now() end
  where id = any (p_ids) and emailed_at is null and email_skipped_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The digest for today has been sent (the job stops asking for it until tomorrow).
create function public.mark_notification_digest_done()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.notification_runs (run_on, digest_done_at)
  values ((now() at time zone 'Europe/London')::date, now())
  on conflict (run_on) do update set digest_done_at = now();
$$;

revoke execute on function public.pending_notification_emails(text), public.mark_notification_emails(uuid[], text),
  public.mark_notification_digest_done() from public, anon, authenticated;
grant execute on function public.pending_notification_emails(text), public.mark_notification_emails(uuid[], text),
  public.mark_notification_digest_done() to service_role;

-- One-click unsubscribe from the email link (/notifications/unsubscribe?token=…): turns the
-- person's email digest off everywhere. Anyone holding the link can do it, signed in or not;
-- the token is random, stored as sha256 only and valid for 90 days.
create function public.unsubscribe_notification_emails(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if p_token is null or char_length(p_token) <> 64 then
    return false;
  end if;
  select t.profile_id into v_profile from private.notification_unsubscribe_tokens t
  where t.token_hash = sha256(convert_to(p_token, 'UTF8')) and t.created_at > now() - interval '90 days';
  if v_profile is null then
    return false;
  end if;
  update public.profiles
  set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{notifications}',
        coalesce(case when jsonb_typeof(preferences -> 'notifications') = 'object' then preferences -> 'notifications' end, '{}'::jsonb)
          || '{"digest": "off"}'::jsonb),
      updated_at = now()
  where id = v_profile;
  return true;
end;
$$;
revoke execute on function public.unsubscribe_notification_emails(text) from public;
grant execute on function public.unsubscribe_notification_emails(text) to anon, authenticated;

-- A closed account (GL-11: close_my_account sets profiles.closed_at and keeps a tombstone)
-- takes its inbox and unsubscribe links with it.
create function private.forget_closed_profile_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications where recipient_id = new.id;
  delete from private.notification_unsubscribe_tokens where profile_id = new.id;
  return null;
end;
$$;
revoke execute on function private.forget_closed_profile_notifications() from public, anon, authenticated;
create trigger zz_forget_closed_profile_notifications after update of closed_at on public.profiles
  for each row when (old.closed_at is null and new.closed_at is not null)
  execute function private.forget_closed_profile_notifications();

-- =====================================================================================
-- 8. The job (every 15 minutes). Dynamic SQL so it compiles without pg_net or Vault (local).
--    One-off on production, after deploying send-notification-email, in the SQL editor:
--      select vault.create_secret('https://xvdlmtkzfmbcegkmampz.supabase.co/functions/v1/send-notification-email', 'notification_email_url');
--    The service role key is read from the existing report_notify_service_key secret.
-- =====================================================================================
create function private.run_notifications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_london timestamp := now() at time zone 'Europe/London';
  v_day date := (now() at time zone 'Europe/London')::date;
  v_generated jsonb := null;
  v_mode text := 'immediate';
  v_url text;
  v_key text;
  v_request bigint;
  o record;
begin
  -- Generate once a day, on the first run from 07:00 London.
  if extract(hour from v_london) >= 7
     and not exists (select 1 from private.notification_runs where run_on = v_day and generated_at is not null) then
    insert into private.notification_runs (run_on, generated_at) values (v_day, now())
    on conflict (run_on) do update set generated_at = now();
    v_generated := '[]'::jsonb;
    for o in select id from public.organisations order by id loop
      begin
        v_generated := v_generated || private.generate_notifications(o.id);
      exception when others then
        raise warning 'generate_notifications(%): % (%)', o.id, sqlerrm, sqlstate;
      end;
    end loop;
  end if;
  -- The digest from 07:30 London, until the edge function reports it done.
  if (extract(hour from v_london) > 7 or (extract(hour from v_london) = 7 and extract(minute from v_london) >= 30))
     and not exists (select 1 from private.notification_runs where run_on = v_day and digest_done_at is not null) then
    v_mode := 'all';
  end if;
  if v_mode = 'immediate' and not exists (
       select 1 from public.notifications where emailed_at is null and email_skipped_at is null) then
    return jsonb_build_object('generated', v_generated, 'email', null);
  end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return jsonb_build_object('generated', v_generated, 'email', 'no pg_net or Vault');
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'notification_email_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'report_notify_service_key';
  if v_url is null or v_key is null then
    raise warning 'send-notification-email: Vault secrets notification_email_url / report_notify_service_key are not set';
    return jsonb_build_object('generated', v_generated, 'email', 'secrets missing');
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 60000)'
    into v_request
    using v_url, jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
          jsonb_build_object('mode', v_mode);
  return jsonb_build_object('generated', v_generated, 'email', v_mode, 'request', v_request);
end;
$$;
revoke execute on function private.run_notifications() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vpmo-notifications', '*/15 * * * *', 'select private.run_notifications()');
  end if;
end $$;
