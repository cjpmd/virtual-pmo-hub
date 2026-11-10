-- GL-6 Trial-ending and payment emails. PROPOSAL: not applied. Additive only (new column, new
-- table, new functions, one replaced function, one cron job); nothing is dropped or deleted.
--
-- How it works
--   * public.billing_notices: one row per (organisation, kind, period_key), unique, so the daily
--     job and the Stripe webhook can re-run safely. A row is queued (status 'pending'), then the
--     send-billing-notice edge function emails every organisation admin and marks it 'sent',
--     'skipped' (no longer applies, or no admin with an email) or, after 5 failed runs,
--     'failed'.
--   * Kinds and their period_key:
--       trial_ending   3 days or less before trial_ends_at, never subscribed (status null).
--                      Key: trial_ends_at (so an extended trial warns again).
--       trial_ended    trial over in the last 7 days, never subscribed, now read-only.
--                      Key: trial_ends_at.
--       payment_failed queued by stripe-webhook on invoice.payment_failed for renewal invoices
--                      (billing_reason subscription_cycle), once per invoice. Key: invoice id.
--       read_only      a past_due grace period ended, or the subscription became canceled,
--                      unpaid, incomplete_expired or paused, in the last 7 days, and the
--                      organisation is now read-only. Key: subscription id / period end, so
--                      past_due -> canceled in the same period sends one email, not two.
--     The 7-day windows stop the first run emailing about things that happened long ago.
--     The demo plan never gets a notice.
--   * Daily at 08:00 Europe/London: pg_cron runs at 07:00 and 08:00 UTC and only works when it
--     is 08:xx in London (pg_cron here schedules in GMT, as in GL-2). It queues what's due,
--     then, if anything is pending, calls send-billing-notice through pg_net with the URL from
--     Vault (billing_notice_url) and the service role key already stored for report-notify
--     (report_notify_service_key). Failed sends are retried by the next day's run.
--   * Every notice is re-checked when it is sent (pending_billing_notices returns
--     still_applies), so an organisation that subscribed or paid in between gets nothing.
--
-- Section 1b changes how the past_due grace period is measured. Read its note; it is
-- recommended but separable.

-- =====================================================================================
-- 1a. When did the Stripe status last change? Needed for the read_only window (and 1b).
-- =====================================================================================
alter table public.organisation_subscriptions
  add column if not exists status_changed_at timestamptz;
comment on column public.organisation_subscriptions.status_changed_at is
  'When status last changed (set by trigger). For past_due, when the payment first failed.';

-- Existing rows with a status: best available guess. (None on production on 10/11/2026.)
update public.organisation_subscriptions
set status_changed_at = updated_at
where status is not null and status_changed_at is null;

create or replace function private.track_subscription_status()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := case when new.status is not null then now() end;
  elsif new.status is distinct from old.status then
    new.status_changed_at := now();
  else
    new.status_changed_at := old.status_changed_at;
  end if;
  return new;
end;
$$;
revoke execute on function private.track_subscription_status() from public, anon, authenticated;

create trigger organisation_subscriptions_status_changed
  before insert or update on public.organisation_subscriptions
  for each row execute function private.track_subscription_status();

-- =====================================================================================
-- 1b. (Recommended) Measure the past_due grace from when the payment failed.
--     Today (GL-4) a past_due organisation stays writable until current_period_end + 14 days.
--     But Stripe advances current_period_end to the END of the new period when it creates the
--     renewal invoice, before trying to charge it. So after a failed renewal the grace is
--     really a month + 14 days (monthly) or a year + 14 days (annual), and GL-5's banner says
--     "update your card by" that date. With Stripe's default Smart Retries (8 tries in 2
--     weeks, then cancel) the subscription is canceled first anyway, so in practice the
--     14-day grace never applies. Measuring from status_changed_at makes it 14 days from the
--     first failure, as intended. If you'd rather not, I drop this section and
--     past_due_grace_ends_at uses current_period_end + 14 days, as now.
-- =====================================================================================
create or replace function private.past_due_grace_ends_at(p_status_changed_at timestamptz, p_period_end timestamptz)
returns timestamptz
language sql
immutable
set search_path to ''
as $$
  select coalesce(p_status_changed_at, p_period_end) + interval '14 days';
$$;
revoke execute on function private.past_due_grace_ends_at(timestamptz, timestamptz) from public, anon, authenticated;

-- Same as GL-4 apart from the marked line.
create or replace function private.organisation_is_writable(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
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
-- Front end (if 1b is approved): GL-5's accessBanner computes the grace date from
-- current_period_end; it changes to status_changed_at + 14 days (admins already read the row).

-- =====================================================================================
-- 2. The notices table. Organisation-scoped (describes the organisation's billing, not work in
--    a workspace), so organisation_id only: please approve adding billing_notices to the
--    AGENTS.md exception list. Service role only, like stripe_webhook_events: RLS on, no
--    policies, no client grants. The read-only trigger is attached as the rule requires; the
--    only writers are cron and the service role, which it lets through (is_system_write).
-- =====================================================================================
create table public.billing_notices (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind            text not null check (kind in ('trial_ending', 'trial_ended', 'payment_failed', 'read_only')),
  period_key      text not null check (length(period_key) between 1 and 200),
  details         jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 4096),
  status          text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts        integer not null default 0,
  recipient_count integer,
  error           text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  unique (organisation_id, kind, period_key)
);
create index billing_notices_pending_idx on public.billing_notices (created_at) where status = 'pending';
alter table public.billing_notices enable row level security;
revoke all on public.billing_notices from anon, authenticated;
comment on table public.billing_notices is
  'GL-6: trial and payment emails to organisation admins, one per (organisation, kind, period_key). Service role only.';

create trigger zz_org_read_only before insert or update or delete on public.billing_notices
  for each row execute function private.enforce_org_writable();

-- =====================================================================================
-- 3. Queue what's due (trial_ending, trial_ended, read_only). payment_failed comes from the
--    webhook. Returns the number of new notices.
-- =====================================================================================
create or replace function private.queue_billing_notices()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  n integer := 0;
  k integer;
begin
  insert into public.billing_notices (organisation_id, kind, period_key, details)
  select s.organisation_id, 'trial_ending', to_char(s.trial_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"'),
         jsonb_build_object('trial_ends_at', s.trial_ends_at)
  from public.organisation_subscriptions s
  where s.plan <> 'demo' and s.status is null
    and s.trial_ends_at > now() and s.trial_ends_at <= now() + interval '3 days'
  on conflict (organisation_id, kind, period_key) do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into public.billing_notices (organisation_id, kind, period_key, details)
  select s.organisation_id, 'trial_ended', to_char(s.trial_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"'),
         jsonb_build_object('trial_ends_at', s.trial_ends_at)
  from public.organisation_subscriptions s
  where s.plan <> 'demo' and s.status is null
    and s.trial_ends_at <= now() and s.trial_ends_at > now() - interval '7 days'
    and not private.organisation_is_writable(s.organisation_id)
  on conflict (organisation_id, kind, period_key) do nothing;
  get diagnostics k = row_count; n := n + k;

  insert into public.billing_notices (organisation_id, kind, period_key, details)
  select s.organisation_id, 'read_only',
         coalesce(s.stripe_subscription_id, 'no-subscription') || '/'
           || coalesce(to_char(s.current_period_end at time zone 'UTC', 'YYYY-MM-DD'), 'no-period'),
         jsonb_build_object('status', s.status, 'since', x.read_only_since)
  from public.organisation_subscriptions s
  cross join lateral (
    select case when s.status = 'past_due'
                then private.past_due_grace_ends_at(s.status_changed_at, s.current_period_end)
                else s.status_changed_at end as read_only_since
  ) x
  where s.plan <> 'demo'
    and s.status in ('past_due', 'unpaid', 'canceled', 'incomplete_expired', 'paused')
    and x.read_only_since > now() - interval '7 days'
    and not private.organisation_is_writable(s.organisation_id)
  on conflict (organisation_id, kind, period_key) do nothing;
  get diagnostics k = row_count; n := n + k;

  return n;
end;
$$;
revoke execute on function private.queue_billing_notices() from public, anon, authenticated;

-- =====================================================================================
-- 4. Service-role RPCs for the edge function (same shape as report-notify's).
-- =====================================================================================
-- Pending notices with their recipients and the organisation's state now. still_applies false
-- means "skip it": the organisation subscribed, paid or extended its trial in the meantime.
create or replace function public.pending_billing_notices()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'organisation_id', n.organisation_id,
      'organisation_name', o.name,
      'kind', n.kind,
      'period_key', n.period_key,
      'details', n.details,
      'attempts', n.attempts,
      'status', s.status,
      'trial_ends_at', s.trial_ends_at,
      'grace_ends_at', case when s.status = 'past_due'
                            then private.past_due_grace_ends_at(s.status_changed_at, s.current_period_end) end,
      'writable', private.organisation_is_writable(n.organisation_id),
      'still_applies', case n.kind
          when 'trial_ending' then s.status is null and s.trial_ends_at > now()
            and to_char(s.trial_ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') = n.period_key
          when 'trial_ended' then s.status is null and not private.organisation_is_writable(n.organisation_id)
          when 'payment_failed' then s.status in ('past_due', 'unpaid')
          when 'read_only' then not private.organisation_is_writable(n.organisation_id)
          else false
        end and coalesce(s.plan, '') <> 'demo',
      'recipients', (
        select coalesce(jsonb_agg(jsonb_build_object('email', p.email, 'name', p.display_name) order by p.email), '[]'::jsonb)
        from public.organisation_members m
        join public.profiles p on p.id = m.profile_id
        where m.organisation_id = n.organisation_id and m.role = 'admin'
          and nullif(trim(p.email), '') is not null
      )
    ) order by n.created_at), '[]'::jsonb)
  from public.billing_notices n
  join public.organisations o on o.id = n.organisation_id
  left join public.organisation_subscriptions s on s.organisation_id = n.organisation_id
  where n.status = 'pending';
$$;

-- p_outcome: 'sent' (p_recipient_count emails went out), 'skipped' (p_error says why) or
-- 'error' (counts an attempt; the fifth makes it 'failed').
create or replace function public.mark_billing_notice(p_id uuid, p_outcome text, p_recipient_count integer, p_error text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_outcome not in ('sent', 'skipped', 'error') then
    raise exception 'Unknown outcome %', p_outcome using errcode = '22023';
  end if;
  update public.billing_notices
  set status = case p_outcome
                 when 'sent' then 'sent'
                 when 'skipped' then 'skipped'
                 else case when attempts + 1 >= 5 then 'failed' else 'pending' end
               end,
      attempts = attempts + 1,
      recipient_count = p_recipient_count,
      error = left(p_error, 500),
      sent_at = case when p_outcome = 'error' then sent_at else now() end
  where id = p_id and status = 'pending';
end;
$$;

revoke all on function public.pending_billing_notices(), public.mark_billing_notice(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.pending_billing_notices(), public.mark_billing_notice(uuid, text, integer, text)
  to service_role;

-- =====================================================================================
-- 5. The daily job. Dynamic SQL so it compiles where pg_net or Vault aren't installed (local).
--    One-off on production, run by you in the SQL editor after deploying send-billing-notice:
--      select vault.create_secret('https://xvdlmtkzfmbcegkmampz.supabase.co/functions/v1/send-billing-notice', 'billing_notice_url');
--    The service role key is read from the existing report_notify_service_key secret.
-- =====================================================================================
create or replace function private.run_billing_notices()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_key text;
  v_request bigint;
begin
  if extract(hour from now() at time zone 'Europe/London') <> 8 then
    return null;
  end if;
  perform private.queue_billing_notices();
  if not exists (select 1 from public.billing_notices where status = 'pending') then
    return null;
  end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'billing_notice_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'report_notify_service_key';
  if v_url is null or v_key is null then
    raise warning 'send-billing-notice: Vault secrets billing_notice_url / report_notify_service_key are not set';
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
    into v_request
    using v_url, jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'), '{}'::jsonb;
  return v_request;
end;
$$;
revoke execute on function private.run_billing_notices() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vpmo-billing-notices', '0 7,8 * * *', 'select private.run_billing_notices()');
  end if;
end $$;
