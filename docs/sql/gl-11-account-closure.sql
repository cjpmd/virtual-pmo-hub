-- =====================================================================================
-- GL-11 Account closure and organisation deletion: SQL proposal (NOT APPLIED).
-- Design: docs/design/account-closure.md. Decisions (10/11/2026): Stripe cancel at period end on
-- request; scheduled purge shipped in dry_run (first purges run by hand); admins emailed, every
-- member sees the banner; recent sign-in (10 min) for account closure; profiles_id_fkey dropped
-- (section D, run by hand) with an insert trigger keeping new profiles tied to auth.users; full
-- export is GL-11b; no retention limit for abandoned trials.
--
-- Sections A–H are one additive migration (no drop, delete or truncate runs when it's applied;
-- the deletes live inside function bodies and run only when the purge or a closure runs).
-- Section D at the end is destructive DDL: you run it in the SQL editor.
--
-- HOW THE PURGE BYPASS WORKS (section B)
--   The protective triggers (issued committee packs, report snapshots, submitted business cases,
--   recorded decisions, closed months, the last admin...) must let the purge delete an
--   organisation's rows, and nothing else. The bypass is a ROW, not a setting:
--     * private.privileged_ops holds (txid, backend_pid, kind, target). Nobody but the table owner
--       (postgres) has any privilege on it: no grants to public, anon, authenticated or
--       service_role, and the private schema gives clients USAGE only.
--     * Only two functions write it: private.purge_organisation (kind 'purge', execute granted to
--       service_role only, through public.purge_organisation) and public.close_my_account (kind
--       'closure'). Both insert their row at the start and delete it before returning, inside
--       the same transaction, so it never outlives the call; on any error the whole transaction,
--       row included, rolls back.
--     * private.in_purge() is true only when a 'purge' row matches txid_current_if_assigned()
--       AND pg_backend_pid(). Transaction ids are 64-bit and never reused, so no other
--       transaction, session or later call can match a row, even one left by a crash.
--     * No GUC is read anywhere (request.jwt.*, set_config, session_replication_role are all
--       irrelevant), so a client that can set any setting it likes gains nothing.
--     * 'closure' rows only lift the read-only check (enforce_org_writable) and skip row audit
--       for the caller's own closure; they never satisfy in_purge(), so no immutable record
--       can be changed by closing an account.
--   supabase/tests/account_closure.sql proves a signed-in user can't create, fake or reach the
--   bypass (section 1 of that file).
-- =====================================================================================

-- =====================================================================================
-- A. Profiles: closure marker, and integrity with auth.users once the FK is gone (section D).
-- =====================================================================================
alter table public.profiles add column closed_at timestamptz;
comment on column public.profiles.closed_at is
  'GL-11: set when the person closed their account. The row stays as a "Former member" tombstone so records they wrote keep pointing at it; the auth user is deleted.';

-- Replaces what profiles_id_fkey guaranteed for new rows: a profile is only created for an
-- existing auth user (private.handle_new_user runs after the auth insert, so it passes).
create function private.profile_requires_auth_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = new.id) then
    raise exception 'A profile needs a matching sign-in (auth.users %).', new.id
      using errcode = '23503', hint = 'profile_without_user';
  end if;
  return new;
end;
$$;
revoke execute on function private.profile_requires_auth_user() from public, anon, authenticated, service_role;
create trigger profiles_00_requires_auth_user
  before insert on public.profiles
  for each row execute function private.profile_requires_auth_user();

-- A closed account can't join (or rejoin) an organisation in the moments before its auth user
-- is deleted, or ever after.
create function private.member_not_closed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.profile_id and p.closed_at is not null) then
    raise exception 'This account has been closed.' using errcode = '42501', hint = 'account_closed';
  end if;
  return new;
end;
$$;
revoke execute on function private.member_not_closed() from public, anon, authenticated, service_role;
create trigger organisation_members_00_not_closed
  before insert on public.organisation_members
  for each row execute function private.member_not_closed();

-- =====================================================================================
-- B. The privileged-operation marker (see the header).
-- =====================================================================================
create table private.privileged_ops (
  txid                   bigint      not null,
  backend_pid            integer     not null,
  kind                   text        not null check (kind in ('purge', 'closure')),
  target_organisation_id uuid,       -- purge: the organisation (not named organisation_id, so the
                                     -- purge's catalog scan of organisation tables skips it)
  target_profile_id      uuid,       -- closure: the profile
  started_at             timestamptz not null default now(),
  primary key (txid, kind)
);
revoke all on table private.privileged_ops from public, anon, authenticated, service_role;
comment on table private.privileged_ops is
  'GL-11: one row per running purge / account closure, keyed to its transaction. Written only by private.purge_organisation and public.close_my_account; read by private.in_purge / in_closure.';

create function private.in_purge()
returns boolean
language sql
volatile
security definer
set search_path to ''
as $$
  select exists (select 1 from private.privileged_ops o
                 where o.txid = txid_current_if_assigned() and o.kind = 'purge'
                   and o.backend_pid = pg_backend_pid());
$$;
create function private.in_closure()
returns boolean
language sql
volatile
security definer
set search_path to ''
as $$
  select exists (select 1 from private.privileged_ops o
                 where o.txid = txid_current_if_assigned() and o.kind = 'closure'
                   and o.backend_pid = pg_backend_pid());
$$;
-- The guard triggers run as the writing user (most aren't SECURITY DEFINER), so authenticated
-- needs EXECUTE on these two read-only checks. They can't create a marker; nothing can, except
-- the two functions above, which hold no grant for this table to anyone else.
revoke execute on function private.in_purge() from public, anon;
revoke execute on function private.in_closure() from public, anon;
grant execute on function private.in_purge() to authenticated, service_role;
grant execute on function private.in_closure() to authenticated, service_role;

-- =====================================================================================
-- C. Organisation deletion requests, purge settings and the logs that outlive a purge.
-- =====================================================================================
-- Organisation-scoped (describes the organisation itself): organisation_id only, on the AGENTS.md
-- exception list. NOT given the zz_org_read_only trigger, like organisation_subscriptions: a
-- lapsed (read-only) organisation must still be able to ask for deletion, and admins must be
-- able to cancel while it is pending (which is itself read-only). Writes go only through the
-- definer RPCs below and the service role. supabase/tests/read_only_mode.sql's exempt list gains it.
create table public.organisation_deletions (
  organisation_id     uuid primary key references public.organisations (id) on delete cascade,
  requested_by        uuid references public.profiles (id) on delete set null,
  requested_at        timestamptz not null default now(),
  purge_after         timestamptz not null,
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id) on delete set null,
  -- Service-side progress (edge functions organisation-deletion / purge-organisations).
  scheduled_email_at  timestamptz,
  reminder_7_email_at timestamptz,
  reminder_1_email_at timestamptz,
  cancelled_email_at  timestamptz,
  purge_started_at    timestamptz,
  stripe_done_at      timestamptz,
  storage_done_at     timestamptz,
  storage_counts      jsonb check (storage_counts is null or pg_column_size(storage_counts) <= 4096),
  attempts            integer not null default 0,
  last_error          text check (last_error is null or length(last_error) <= 2000),
  updated_at          timestamptz not null default now(),
  constraint organisation_deletions_purge_after_check check (purge_after >= requested_at),
  constraint organisation_deletions_cancel_check check (cancelled_at is null or purge_started_at is null)
);
create index organisation_deletions_requested_by_idx on public.organisation_deletions (requested_by);
create index organisation_deletions_cancelled_by_idx on public.organisation_deletions (cancelled_by);
create trigger organisation_deletions_updated_at
  before update on public.organisation_deletions
  for each row execute function private.set_updated_at();
alter table public.organisation_deletions enable row level security;
-- Every member reads the date for the banner; only the request columns are granted.
create policy organisation_deletions_select on public.organisation_deletions
  for select to authenticated
  using (organisation_id = any ((select private.my_org_ids('viewer'::public.app_role))::uuid[]));
revoke all on table public.organisation_deletions from public, anon, authenticated;
grant select (organisation_id, requested_at, purge_after, cancelled_at) on public.organisation_deletions to authenticated;
comment on table public.organisation_deletions is
  'GL-11: one row per organisation that has asked to be deleted. Pending (cancelled_at null) makes the organisation read-only; the purge runs after purge_after. Written by RPCs and the service role only.';

create table private.organisation_purge_settings (
  singleton  boolean primary key default true check (singleton),
  mode       text not null default 'dry_run' check (mode in ('off', 'dry_run', 'on')),
  updated_at timestamptz not null default now()
);
insert into private.organisation_purge_settings default values;
revoke all on table private.organisation_purge_settings from public, anon, authenticated, service_role;
comment on table private.organisation_purge_settings is
  'GL-11: off = the job does nothing; dry_run = emails and reports only, purges only when run by hand; on = purges when due. Change in the SQL editor.';

-- No foreign keys: these outlive the organisation / auth user. Ids and dates only, never names or
-- emails. Re-applied after any backup restore (docs/design/account-closure.md §5).
create table private.organisation_purge_log (
  purged_organisation_id uuid primary key,
  requested_at           timestamptz,
  purged_at              timestamptz not null default now(),
  row_counts             jsonb not null,
  storage_counts         jsonb
);
create table private.account_closure_log (
  profile_id uuid primary key,
  closed_at  timestamptz not null default now()
);
revoke all on table private.organisation_purge_log from public, anon, authenticated, service_role;
revoke all on table private.account_closure_log from public, anon, authenticated, service_role;

-- =====================================================================================
-- E. Read-only: pending deletion, and the closure's own writes.
-- =====================================================================================
-- Unchanged from GL-6 except the first line: a pending deletion makes the organisation
-- read-only whatever its subscription. One primary-key lookup per call.
create or replace function private.organisation_is_writable(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select not exists (select 1 from public.organisation_deletions d
                     where d.organisation_id = p_org and d.cancelled_at is null)  -- GL-11
    and coalesce((
    select
      (s.plan = 'demo') is true
      or (s.status in ('trialing', 'active')) is true
      or (s.status = 'past_due'
          and private.past_due_grace_ends_at(s.status_changed_at, s.current_period_end) > now()) is true  -- GL-6
      or (coalesce(s.status, '') not in ('canceled', 'unpaid', 'incomplete_expired', 'past_due')
          and s.trial_ends_at > now()) is true
    from public.organisation_subscriptions s
    where s.organisation_id = p_org
  ), true);
$$;
revoke execute on function private.organisation_is_writable(uuid) from public, anon, authenticated;

-- Unchanged from GL-4 except `and not private.in_closure()`: closing an account removes the
-- person's memberships, personal views and invites in every organisation, read-only or not.
-- Checked only after the organisation is found read-only, so writable organisations pay nothing.
create or replace function private.enforce_org_writable()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_col text := coalesce(tg_argv[0], 'organisation_id');
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_org uuid;
begin
  if private.is_system_write() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_org := coalesce(v_new ->> v_col, v_old ->> v_col)::uuid;
  if v_org is not null and not private.organisation_is_writable(v_org)
     and not private.read_only_write_allowed(tg_table_name, tg_op, v_old, v_new)
     and not private.in_closure() then  -- GL-11
    perform private.assert_org_writable(v_org);
  end if;
  -- A row moved between organisations (not done anywhere today) must be writable on both sides.
  if tg_op = 'UPDATE' and (v_old ->> v_col) is distinct from (v_new ->> v_col) then
    perform private.assert_org_writable((v_old ->> v_col)::uuid);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- =====================================================================================
-- F. Protective triggers: one added line each, straight after `begin` (marked "-- GL-11").
--    Bodies are production's current definitions (checked by md5 against
--    xvdlmtkzfmbcegkmampz on 10/11/2026; decision_rules differs from production only by the
--    comment line "-- UPDATE", which the repo's migration has and production doesn't).
--    These are the triggers that refuse a DELETE on an organisation table (found from the
--    catalog), committee_pack_lock (refuses set-null updates on issued packs), and the two
--    AFTER triggers that would write audit / health-queue rows for the rows being purged.
-- =====================================================================================
CREATE OR REPLACE FUNCTION private.guard_last_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if not exists (
      select 1 from public.organisation_members m
      where m.organisation_id = old.organisation_id and m.role = 'admin' and m.profile_id <> old.profile_id
    ) and exists (select 1 from public.organisations o where o.id = old.organisation_id) then
      raise exception 'An organisation must keep at least one admin' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.committee_pack_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  raise exception 'Committee packs are kept permanently and can''t be deleted.' using errcode = '42501';
end;
$function$
;
CREATE OR REPLACE FUNCTION private.committee_pack_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  if tg_op = 'UPDATE' and old.issued_at is not null then
    raise exception 'This pack has been issued and can no longer be changed.' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null then
    if new.issued_at is not null then
      new.issued_at := now();
      new.issued_by := (select auth.uid());
    else
      new.issued_by := null;
    end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.financial_values_closed_month()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  months date[] := case tg_op
    when 'INSERT' then array[new.period_month]
    when 'DELETE' then array[old.period_month]
    else array[old.period_month, new.period_month] end;
  org uuid := coalesce(new.organisation_id, old.organisation_id);
  closed date;
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  select fp.period_month into closed from public.financial_periods fp
  where fp.organisation_id = org and fp.period_month = any (months) and fp.closed_at is not null
  order by fp.period_month limit 1;
  if closed is not null then
    raise exception '% is closed. Ask the PMO to reopen it.', to_char(closed, 'FMMonth YYYY') using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.business_case_version_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('business_case_versions'), hashtext(new.business_case_id::text));
    new.version := coalesce((select max(v.version) from public.business_case_versions v
      where v.business_case_id = new.business_case_id), 0) + 1;
    new.status := 'draft';
    new.submitted_at := null; new.submitted_by := null;
    new.decided_at := null; new.decision_id := null; new.recorded_by := null;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'This version has been submitted and can''t be changed.' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.business_case_id <> old.business_case_id or new.version <> old.version then
    raise exception 'A version can''t move to another case or be renumbered' using errcode = '42501';
  end if;
  -- Plain client updates: drafts only, and never the status fields. The SECURITY DEFINER
  -- RPCs (submit_business_case, F5 decide_business_case) run as their owner instead.
  if current_user = 'authenticated' then
    if old.status <> 'draft' then
      raise exception 'This version has been submitted and can''t be changed.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       or new.submitted_at is distinct from old.submitted_at or new.submitted_by is distinct from old.submitted_by
       or new.decided_at is distinct from old.decided_at or new.decision_id is distinct from old.decision_id
       or new.recorded_by is distinct from old.recorded_by then
      raise exception 'Use Submit to change the status of a business case' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.business_case_child_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status public.business_case_status;
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  if tg_op = 'UPDATE' and new.version_id <> old.version_id then
    raise exception 'Can''t move content to another version' using errcode = '42501';
  end if;
  select v.status into v_status from public.business_case_versions v
  where v.id = case when tg_op = 'DELETE' then old.version_id else new.version_id end;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'This version has been submitted and can''t be changed.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.decision_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  changed jsonb;
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception '% is % and is kept for the record. Supersede or reverse it instead.', old.ref, old.status
        using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.chosen_option_id is not null or new.decision_date is not null
      or new.rationale is not null or new.supersedes_id is not null then
      raise exception 'A new decision starts as Pending. Record the outcome with Record decision.'
        using errcode = '42501';
    end if;
    new.decided_by_resource_id := null;
    new.decided_by_forum_id := null;
    new.recorded_by := null;
    new.recorded_at := null;
    return new;
  end if;
  -- UPDATE
  if old.status <> 'pending' then
    raise exception '% is % and read-only. Supersede or reverse it to change it.', old.ref, old.status
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status
    or new.chosen_option_id is distinct from old.chosen_option_id
    or new.decision_date is distinct from old.decision_date
    or new.rationale is distinct from old.rationale
    or new.supersedes_id is distinct from old.supersedes_id
    or new.decided_by_resource_id is distinct from old.decided_by_resource_id
    or new.decided_by_forum_id is distinct from old.decided_by_forum_id
    or new.recorded_by is distinct from old.recorded_by
    or new.recorded_at is distinct from old.recorded_at then
    raise exception 'Use Record decision, Defer, Supersede or Reverse to change a decision''s outcome.'
      using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)), '{}'::jsonb) into changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on o.key = n.key
  where n.value is distinct from o.value
    and n.key not in ('updated_at', 'created_at', 'created_by', 'organisation_id', 'workspace_id', 'ref', 'forum_list');
  if changed <> '{}'::jsonb then
    perform private.log_decision_edit(new.id, changed,
      case when new.needed_by_date is distinct from old.needed_by_date then old.needed_by_date end,
      case when new.needed_by_date is distinct from old.needed_by_date then new.needed_by_date end);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.decision_child_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  d record;
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  select dd.ref, dd.status into d from public.decisions dd
  where dd.id = coalesce(new.decision_id, old.decision_id);
  if d.status is not null and d.status <> 'pending' then
    raise exception '% is % and read-only. Supersede or reverse it to change it.', d.ref, d.status
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.status_report_decision_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  d record;
  report_status public.status_report_status;
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  select r.status into report_status from public.status_reports r
  where r.id = coalesce(new.status_report_id, old.status_report_id);
  if current_user = 'authenticated' and report_status = 'submitted' then
    raise exception 'This report has been submitted; its decisions needed can''t be changed.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.decision_id is distinct from old.decision_id
    or new.status_report_id is distinct from old.status_report_id) then
    raise exception 'Remove the link and add another instead.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;
  select dd.ref, dd.status, dd.project_id into d from public.decisions dd where dd.id = new.decision_id;
  if d.project_id is not null and d.project_id <> new.project_id then
    raise exception '% belongs to another project.', d.ref using errcode = '23514';
  end if;
  if d.status <> 'pending' then
    raise exception '% is % and no longer needs a decision.', d.ref, d.status using errcode = '23514';
  end if;
  new.created_by := (select auth.uid());
  new.created_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.workspace_lifecycle_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  if tg_op = 'UPDATE' then
    if new.archived_at is distinct from old.archived_at then
      new.archived_by := case when new.archived_at is null then null else (select auth.uid()) end;
    end if;
    if old.archived_at is null and new.archived_at is not null and not exists (
      select 1 from public.workspaces w
      where w.organisation_id = old.organisation_id and w.id <> old.id and w.archived_at is null
    ) then
      raise exception 'An organisation must keep at least one active workspace' using errcode = '42501';
    end if;
    return new;
  end if;
  -- DELETE: an empty workspace only (records block it through their foreign keys), and never
  -- the last active one, unless the organisation itself is being removed.
  if old.archived_at is null and not exists (
    select 1 from public.workspaces w
    where w.organisation_id = old.organisation_id and w.id <> old.id and w.archived_at is null
  ) and exists (select 1 from public.organisations o where o.id = old.organisation_id) then
    raise exception 'An organisation must keep at least one active workspace' using errcode = '42501';
  end if;
  return old;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.snapshot_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  raise exception 'Published snapshots can''t be changed or deleted.' using errcode = '42501';
end;
$function$
;
CREATE OR REPLACE FUNCTION private.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  changes jsonb;
begin
  if private.in_purge() or private.in_closure() then return null; end if;  -- GL-11: the purge and closure write their own audit rows
  if (select auth.uid()) is null and current_setting('vpmo.seeding', true) = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('from', o -> k, 'to', n -> k)), '{}'::jsonb) into changes
    from jsonb_object_keys(n) k
    where k not in ('updated_at') and (o -> k) is distinct from (n -> k);
    if changes = '{}'::jsonb then
      return null;
    end if;
  else
    changes := case when tg_op = 'DELETE' then jsonb_build_object('row', o) else '{}'::jsonb end;
  end if;
  insert into public.audit_log (organisation_id, workspace_id, actor_id, action, entity_table, entity_id, detail)
  values ((r ->> 'organisation_id')::uuid, (r ->> 'workspace_id')::uuid, (select auth.uid()), lower(tg_op), tg_table_name,
          coalesce((r ->> 'id')::uuid, (r ->> 'profile_id')::uuid), changes);
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.health_current_enqueue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  o uuid := coalesce(r ->> 'organisation_id', case when tg_table_name = 'organisations' then r ->> 'id' end)::uuid;
begin
  if private.in_purge() then return null; end if;  -- GL-11: nothing to refresh for an organisation being purged
  if o is not null then
    insert into private.health_refresh_queue (organisation_id) values (o)
    on conflict (organisation_id) do nothing;
  end if;
  return null;
end;
$function$
;

-- =====================================================================================
-- G. RPCs.
-- =====================================================================================

-- G1. Ask for deletion (org admin; typed name). Works while read-only (a lapsed organisation can
--     ask to be deleted). Returns the purge date. The Stripe step and emails are the
--     organisation-deletion edge function's.
create function public.request_organisation_deletion(p_organisation_id uuid, p_confirm_name text)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_org public.organisations;
  v_after timestamptz := now() + interval '30 days';
begin
  perform private.assert_org_admin(p_organisation_id);
  select * into v_org from public.organisations o where o.id = p_organisation_id for update;
  if v_org.is_demo or exists (select 1 from public.organisation_subscriptions s
                              where s.organisation_id = p_organisation_id and s.plan = 'demo') then
    raise exception 'The demo organisation can''t be deleted.' using errcode = '42501', hint = 'demo_org';
  end if;
  if btrim(coalesce(p_confirm_name, '')) is distinct from v_org.name then
    raise exception 'Type the organisation''s name exactly to confirm.' using errcode = '22023', hint = 'name_mismatch';
  end if;

  insert into public.organisation_deletions (organisation_id, requested_by, requested_at, purge_after)
  values (p_organisation_id, (select auth.uid()), now(), v_after)
  on conflict (organisation_id) do update
    set requested_by = excluded.requested_by, requested_at = excluded.requested_at,
        purge_after = excluded.purge_after, cancelled_at = null, cancelled_by = null,
        scheduled_email_at = null, reminder_7_email_at = null, reminder_1_email_at = null,
        cancelled_email_at = null, stripe_done_at = null, storage_done_at = null,
        storage_counts = null, attempts = 0, last_error = null
    where public.organisation_deletions.cancelled_at is not null;
  if not found then
    raise exception 'This organisation is already scheduled for deletion.' using errcode = '23505', hint = 'deletion_pending';
  end if;

  -- audit_log.action is a fixed list (widening it means dropping its check), so this reuses
  -- 'update' on organisation_deletions, as the row-change audit would record it.
  perform private.write_audit(p_organisation_id, 'update', 'organisation_deletions', p_organisation_id,
                              jsonb_build_object('deletion', 'requested', 'purge_after', v_after));
  return v_after;
end;
$$;
revoke execute on function public.request_organisation_deletion(uuid, text) from public, anon;
grant execute on function public.request_organisation_deletion(uuid, text) to authenticated;

-- G2. Cancel (any org admin) until the purge has started. Writes come back at once if the
--     subscription or trial allows them. Undoing Stripe's cancel_at_period_end is the edge
--     function's.
create function public.cancel_organisation_deletion(p_organisation_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform private.assert_org_admin(p_organisation_id);
  update public.organisation_deletions d
     set cancelled_at = now(), cancelled_by = (select auth.uid()), cancelled_email_at = null
   where d.organisation_id = p_organisation_id and d.cancelled_at is null and d.purge_started_at is null;
  if not found then
    if exists (select 1 from public.organisation_deletions d
               where d.organisation_id = p_organisation_id and d.cancelled_at is null) then
      raise exception 'Deletion has already started and can''t be cancelled.' using errcode = '55000', hint = 'purge_started';
    end if;
    raise exception 'This organisation isn''t scheduled for deletion.' using errcode = 'P0002', hint = 'no_deletion';
  end if;
  perform private.write_audit(p_organisation_id, 'update', 'organisation_deletions', p_organisation_id,
                              jsonb_build_object('deletion', 'cancelled'));
end;
$$;
revoke execute on function public.cancel_organisation_deletion(uuid) from public, anon;
grant execute on function public.cancel_organisation_deletion(uuid) to authenticated;

-- G3. The purge. Dry run (default) counts and changes nothing. A real run needs the deletion to
--     be due and claimed (purge_started_at), with Stripe and Storage done by purge-organisations
--     first. Deletes are generated from the catalog (every table in public and private with an
--     organisation_id column), repeated in passes so foreign-key order doesn't matter (a delete
--     refused by a foreign key is retried next pass; a pass with no progress fails the purge),
--     then the organisation row, then a completeness check. One transaction: all or nothing.
create function private.purge_organisation(p_organisation_id uuid, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_del public.organisation_deletions;
  v_tables text[];
  v_t text;
  v_n bigint;
  v_counts jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_left bigint;
  v_progress boolean;
  v_pass integer := 0;
begin
  if not exists (select 1 from public.organisations o where o.id = p_organisation_id) then
    raise exception 'No such organisation.' using errcode = 'P0002', hint = 'no_organisation';
  end if;
  if exists (select 1 from public.organisations o where o.id = p_organisation_id and o.is_demo) then
    raise exception 'The demo organisation can''t be purged.' using errcode = '42501', hint = 'demo_org';
  end if;

  select array_agg(format('%I.%I', n.nspname, c.relname) order by n.nspname, c.relname) into v_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped
  where n.nspname in ('public', 'private') and c.relkind = 'r';

  foreach v_t in array v_tables loop
    execute format('select count(*) from %s where organisation_id = $1', v_t) into v_n using p_organisation_id;
    if v_n > 0 then
      v_counts := v_counts || jsonb_build_object(v_t, v_n);
      v_total := v_total + v_n;
    end if;
  end loop;

  if p_dry_run then
    return jsonb_build_object('organisation_id', p_organisation_id, 'dry_run', true,
                              'total', v_total, 'rows', v_counts,
                              'storage_objects', (select count(*) from storage.objects s
                                                  where s.name like p_organisation_id::text || '/%'));
  end if;

  select * into v_del from public.organisation_deletions d where d.organisation_id = p_organisation_id for update;
  if v_del.organisation_id is null or v_del.cancelled_at is not null or v_del.purge_after > now()
     or v_del.purge_started_at is null or v_del.stripe_done_at is null or v_del.storage_done_at is null then
    raise exception 'This organisation isn''t ready to purge (needs a due, claimed deletion with Stripe and Storage done).'
      using errcode = '55000', hint = 'purge_not_ready';
  end if;

  -- Files are removed through the Storage API by purge-organisations first (SQL can't remove
  -- them). Every object path starts with the organisation id; any left means Storage isn't done.
  if exists (select 1 from storage.objects s where s.name like p_organisation_id::text || '/%') then
    raise exception 'Storage objects remain for this organisation; remove them through the Storage API first.'
      using errcode = '55000', hint = 'storage_not_empty';
  end if;

  insert into private.privileged_ops (txid, backend_pid, kind, target_organisation_id)
  values (txid_current(), pg_backend_pid(), 'purge', p_organisation_id);

  loop
    v_pass := v_pass + 1;
    v_progress := false;
    v_left := 0;
    foreach v_t in array v_tables loop
      begin
        execute format('delete from %s where organisation_id = $1', v_t) using p_organisation_id;
        get diagnostics v_n = row_count;
        if v_n > 0 then v_progress := true; end if;
      exception when foreign_key_violation or restrict_violation then
        v_left := v_left + 1;  -- another table still points here; next pass
      end;
    end loop;
    exit when v_left = 0;
    if not v_progress or v_pass >= 25 then
      raise exception 'Purge stuck after % passes: % tables still referenced.', v_pass, v_left
        using errcode = '55000', hint = 'purge_stuck';
    end if;
  end loop;

  delete from public.organisations o where o.id = p_organisation_id;

  foreach v_t in array v_tables loop
    execute format('select count(*) from %s where organisation_id = $1', v_t) into v_n using p_organisation_id;
    if v_n > 0 then
      raise exception 'Purge incomplete: % rows left in %.', v_n, v_t using errcode = '55000', hint = 'purge_incomplete';
    end if;
  end loop;

  insert into private.organisation_purge_log (purged_organisation_id, requested_at, row_counts, storage_counts)
  values (p_organisation_id, v_del.requested_at, v_counts, v_del.storage_counts);

  delete from private.privileged_ops o where o.txid = txid_current() and o.kind = 'purge';
  return jsonb_build_object('organisation_id', p_organisation_id, 'dry_run', false,
                            'total', v_total, 'rows', v_counts, 'passes', v_pass);
end;
$$;
revoke execute on function private.purge_organisation(uuid, boolean) from public, anon, authenticated, service_role;

-- Entry point for the purge-organisations edge function (service role only). You run it as
-- postgres in the SQL editor: select public.purge_organisation('<id>');  -- dry run
create function public.purge_organisation(p_organisation_id uuid, p_dry_run boolean default true)
returns jsonb
language sql
security definer
set search_path to ''
as $$ select private.purge_organisation(p_organisation_id, p_dry_run); $$;
revoke execute on function public.purge_organisation(uuid, boolean) from public, anon, authenticated;
grant execute on function public.purge_organisation(uuid, boolean) to service_role;

create function public.organisation_purge_mode()
returns text
language sql
stable
security definer
set search_path to ''
as $$ select s.mode from private.organisation_purge_settings s; $$;
revoke execute on function public.organisation_purge_mode() from public, anon, authenticated;
grant execute on function public.organisation_purge_mode() to service_role;

-- When the caller last signed in: the newest timestamp in the signed JWT's amr claim (password,
-- OTP, OAuth...). Some sign-ins carry no timestamp there (e.g. Microsoft, decided 10/11/2026),
-- so then it falls back to the creation time of the JWT's own sign-in session (auth.sessions,
-- matched on session_id and the user), which a token refresh doesn't change. Null = unknown.
create function private.signed_in_at(p_uid uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_claims jsonb := auth.jwt();
  v_amr bigint;
  v_session uuid;
  v_at timestamptz;
begin
  if jsonb_typeof(v_claims -> 'amr') = 'array' then
    select max((e ->> 'timestamp')::bigint) into v_amr
    from jsonb_array_elements(v_claims -> 'amr') e
    where jsonb_typeof(e -> 'timestamp') = 'number';
  end if;
  if v_amr is not null then
    return to_timestamp(v_amr);
  end if;
  begin
    v_session := nullif(v_claims ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  if v_session is null then
    return null;
  end if;
  select s.created_at into v_at from auth.sessions s where s.id = v_session and s.user_id = p_uid;
  return v_at;
end;
$$;
revoke execute on function private.signed_in_at(uuid) from public, anon, authenticated, service_role;

-- G4. Close my own account. Called by the close-account edge function with the user's JWT;
--     the function then deletes the auth user with the service role (needs section D first:
--     refused until profiles_id_fkey is gone, so a deleteUser can never cascade the profile).
--     Returns the address and avatar path the edge function needs after the profile is scrubbed.
create function public.close_my_account(p_confirm_email text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_p public.profiles;
  v_signed_in numeric;
  v_blocking text;
  v_org uuid;
  v_res uuid[];
  v_orgs uuid[];
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if exists (select 1 from pg_constraint c
             where c.conrelid = 'public.profiles'::regclass and c.conname = 'profiles_id_fkey') then
    raise exception 'Account closure isn''t switched on yet.' using errcode = '55000', hint = 'closure_not_enabled';
  end if;
  select * into v_p from public.profiles p where p.id = v_uid for update;
  if v_p.id is null or v_p.closed_at is not null then
    raise exception 'This account is already closed.' using errcode = '42501', hint = 'account_closed';
  end if;
  if v_p.email = '' or lower(btrim(coalesce(p_confirm_email, ''))) is distinct from lower(v_p.email) then
    raise exception 'Type your email address exactly to confirm.' using errcode = '22023', hint = 'email_mismatch';
  end if;
  -- Recent sign-in (private.signed_in_at): within 10 minutes.
  v_signed_in := extract(epoch from private.signed_in_at(v_uid));
  if v_signed_in is null or v_signed_in < extract(epoch from now()) - 600 then
    raise exception 'Sign in again to close your account.' using errcode = '42501', hint = 'reauth_required';
  end if;
  -- Last admin of any organisation (guard_last_admin is the backstop).
  select string_agg(o.name, ', ' order by o.name) into v_blocking
  from public.organisation_members m
  join public.organisations o on o.id = m.organisation_id
  where m.profile_id = v_uid and m.role = 'admin'
    and not exists (select 1 from public.organisation_members m2
                    where m2.organisation_id = m.organisation_id and m2.role = 'admin' and m2.profile_id <> v_uid);
  if v_blocking is not null then
    raise exception 'You''re the last admin of %. Make someone else admin, or delete the organisation, first.', v_blocking
      using errcode = '42501', hint = 'last_admin';
  end if;

  insert into private.privileged_ops (txid, backend_pid, kind, target_profile_id)
  values (txid_current(), pg_backend_pid(), 'closure', v_uid);

  select coalesce(array_agg(m.organisation_id), '{}') into v_orgs
  from public.organisation_members m where m.profile_id = v_uid;

  -- Resources: an auto-created one (made for the membership, never edited into a staff record)
  -- is anonymised; any other is only unlinked and stays the organisation's record.
  with anon as (
    update public.resources r
       set profile_id = null, name = 'Former member', email = null, is_active = false
     where r.profile_id = v_uid and r.created_by is null and not r.is_bookable and r.name = v_p.display_name
    returning r.id
  )
  select coalesce(array_agg(id), '{}') into v_res from anon;
  update public.resources r set profile_id = null where r.profile_id = v_uid;

  foreach v_org in array v_orgs loop
    delete from public.organisation_members m where m.organisation_id = v_org and m.profile_id = v_uid;
    perform private.write_audit(v_org, 'member.removed', 'organisation_members', v_uid,
                                jsonb_build_object('reason', 'account_closed'));
  end loop;

  delete from public.dashboards d where d.owner_id = v_uid and not d.is_shared;
  delete from public.saved_views v where v.owner_id = v_uid and not v.is_shared;
  delete from public.user_favourites f where f.profile_id = v_uid;
  delete from public.organisation_join_requests j where j.profile_id = v_uid;

  update public.organisation_invites i set revoked_at = now(), revoked_by = v_uid
   where i.email = lower(v_p.email) and i.accepted_at is null and i.revoked_at is null;
  update public.organisation_invites i set email = 'removed-' || i.id || '@removed.invalid'
   where i.email = lower(v_p.email);

  -- Audit history: the email wherever it is a whole JSON string value, and the anonymised
  -- resources' old name in their own audit rows. Other free text is organisation content.
  update public.audit_log a
     set detail = replace(a.detail::text, to_jsonb(v_p.email)::text, '"[removed]"')::jsonb
   where strpos(a.detail::text, to_jsonb(v_p.email)::text) > 0;
  if cardinality(v_res) > 0 and coalesce(v_p.display_name, '') <> '' then
    update public.audit_log a
       set detail = replace(a.detail::text, to_jsonb(v_p.display_name)::text, '"Former member"')::jsonb
     where a.entity_table = 'resources' and a.entity_id = any (v_res)
       and strpos(a.detail::text, to_jsonb(v_p.display_name)::text) > 0;
  end if;

  update public.profiles p
     set display_name = 'Former member', email = '', avatar_path = null, preferences = '{}'::jsonb,
         last_organisation_id = null, closed_at = now()
   where p.id = v_uid;
  insert into private.account_closure_log (profile_id) values (v_uid);

  delete from private.privileged_ops o where o.txid = txid_current() and o.kind = 'closure';
  return jsonb_build_object('email', v_p.email, 'avatar_path', v_p.avatar_path, 'organisations', cardinality(v_orgs));
end;
$$;
revoke execute on function public.close_my_account(text) from public, anon;
grant execute on function public.close_my_account(text) to authenticated;

-- G5. Closed profiles whose auth user still exists (deleteUser failed or hasn't run): the daily
--     job retries them. Service role only.
create function public.account_closures_pending()
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  select p.id from public.profiles p
  where p.closed_at is not null and exists (select 1 from auth.users u where u.id = p.id);
$$;
revoke execute on function public.account_closures_pending() from public, anon, authenticated;
grant execute on function public.account_closures_pending() to service_role;

-- =====================================================================================
-- H. Daily job: emails, reminders, due purges and closure retries, through the
--    purge-organisations edge function (built after approval). Same pattern as GL-6: two UTC
--    slots, works only at 08:xx London; URL in the Vault secret organisation_purge_url (not set
--    until the function is deployed, so the job does nothing until then). The mode travels in
--    the body; in dry_run the function emails and reports only.
--    Run one purge by hand (any hour, any mode except off):
--      select private.run_organisation_purges('<organisation id>', true);
-- =====================================================================================
create function private.run_organisation_purges(p_organisation_id uuid default null, p_force boolean default false)
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_mode text := (select s.mode from private.organisation_purge_settings s);
  v_url text;
  v_key text;
  v_request bigint;
begin
  if v_mode = 'off' then
    return null;
  end if;
  if p_organisation_id is null then
    if extract(hour from now() at time zone 'Europe/London') <> 8 then
      return null;
    end if;
    if not exists (select 1 from public.organisation_deletions d
                   where d.cancelled_at is null or d.cancelled_email_at is null)
       and not exists (select 1 from public.account_closures_pending()) then
      return null;
    end if;
  end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'organisation_purge_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'report_notify_service_key';
  if v_url is null or v_key is null then
    raise warning 'purge-organisations: Vault secrets organisation_purge_url / report_notify_service_key are not set';
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 60000)'
    into v_request
    using v_url, jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
          jsonb_build_object('mode', v_mode, 'organisation_id', p_organisation_id, 'force', p_force);
  return v_request;
end;
$$;
revoke execute on function private.run_organisation_purges(uuid, boolean) from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vpmo-organisation-purge', '20 7,8 * * *', 'select private.run_organisation_purges()');
  end if;
end $$;

-- =====================================================================================
-- D. DESTRUCTIVE — run by hand in the SQL editor, after the migration above is applied.
--    Lets profiles outlive their auth user (tombstones, design §4.3). Until this runs,
--    close_my_account refuses (hint closure_not_enabled). New profiles stay tied to auth.users
--    through profiles_00_requires_auth_user (section A).
-- =====================================================================================
-- alter table public.profiles drop constraint profiles_id_fkey;
