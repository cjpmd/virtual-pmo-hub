-- Work package 2.1: invitation bounces from Resend. Applied on live as migration
-- 20261029192147_2_1_resend_bounces (29/10/2026).
-- Apply after docs/sql/2-1-audit-fix.sql (it uses private.write_audit's fixed version).
-- Additive only: new columns, one new table, three new functions.
--
-- How it works:
--   * send-invite stores the Resend email id of each invitation it sends
--     (record_invite_email_id, service role), with delivery status 'sent'.
--   * A new edge function, resend-webhook (verify_jwt off), checks the Svix signature on every
--     request (RESEND_WEBHOOK_SECRET), ignores replays (resend_webhook_events, keyed on svix-id),
--     and passes delivery events to record_invite_email_event.
--   * email.delivered     -> status 'delivered'
--     email.delivery_delayed -> status 'delayed' (Resend keeps retrying)
--     email.bounced / email.suppressed -> status 'bounced' / 'suppressed', token cleared, so the
--         link can't be used and the Members page shows "Not delivered — Resend invite"; audited
--     email.complained   -> status 'complained' (recorded and audited; the token is kept)
--   * Events are matched on the invitation's latest email id only, so a bounce of an older
--     email (sent before a Resend invite) changes nothing.
--   * Join-request emails to admins are not tracked.

-- 1. Delivery state on invitations -------------------------------------------------------------
alter table public.organisation_invites
  add column if not exists last_email_id     text,
  add column if not exists email_status      text,
  add column if not exists email_status_at   timestamptz,
  add column if not exists email_status_note text;

alter table public.organisation_invites
  add constraint organisation_invites_email_status_check
    check (email_status is null or email_status in ('sent', 'delivered', 'delayed', 'bounced', 'suppressed', 'complained'));

create unique index if not exists organisation_invites_last_email_id_uidx
  on public.organisation_invites (last_email_id) where last_email_id is not null;

comment on column public.organisation_invites.last_email_id is
  'Resend email id of the latest invitation email. Bounce and delivery events are matched on it.';
comment on column public.organisation_invites.email_status is
  'Latest Resend delivery status of that email: sent, delivered, delayed, bounced, suppressed or complained.';

-- Admins read the new columns too (token_hash stays unreadable).
grant select (last_email_id, email_status, email_status_at, email_status_note)
  on public.organisation_invites to authenticated;

-- 2. Webhook idempotency (service role only, like stripe_webhook_events) -------------------------
create table if not exists public.resend_webhook_events (
  id           text primary key,          -- svix-id
  type         text not null,
  email_id     text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text
);
alter table public.resend_webhook_events enable row level security;
revoke all on public.resend_webhook_events from anon, authenticated;
comment on table public.resend_webhook_events is
  'Resend webhook deliveries seen by the resend-webhook edge function, for idempotency. No RLS policies: service role only.';

-- 3. Service-role RPCs ----------------------------------------------------------------------------

-- Called by send-invite after Resend accepts an invitation email.
create function public.record_invite_email_id(p_invite_id uuid, p_email_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.organisation_invites i
  set last_email_id = p_email_id, email_status = 'sent', email_status_at = now(), email_status_note = null
  where i.id = p_invite_id;
$$;

-- Called by resend-webhook for each verified delivery event. Returns false when the email isn't
-- the latest invitation email (older email, join-request email, or unknown).
create function public.record_invite_email_event(p_email_id text, p_event text, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := case p_event
    when 'email.delivered' then 'delivered'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.bounced' then 'bounced'
    when 'email.suppressed' then 'suppressed'
    when 'email.complained' then 'complained'
  end;
  v_inv public.organisation_invites;
begin
  if v_status is null or p_email_id is null then
    return false;
  end if;
  update public.organisation_invites i
  set email_status = v_status,
      email_status_at = now(),
      email_status_note = left(p_note, 300),
      -- A bounced or suppressed email never reached anyone: void its link so Resend invite is the
      -- way forward. Accepted or revoked invitations keep their hash for the link messages.
      token_hash = case when v_status in ('bounced', 'suppressed') and i.accepted_at is null and i.revoked_at is null
                        then null else i.token_hash end
  where i.last_email_id = p_email_id
    -- Never let a late "delivered" or "delayed" overwrite a bounce of the same email.
    and not (i.email_status in ('bounced', 'suppressed') and v_status in ('delivered', 'delayed'))
  returning * into v_inv;
  if not found then
    return false;
  end if;
  if v_status in ('bounced', 'suppressed', 'complained') then
    perform private.write_audit(v_inv.organisation_id, 'invite.' || v_status, 'organisation_invites', v_inv.id,
                                jsonb_build_object('email', v_inv.email, 'role', v_inv.role, 'note', left(p_note, 300)),
                                null);
  end if;
  return true;
end;
$$;

revoke execute on function public.record_invite_email_id(uuid, text), public.record_invite_email_event(text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_invite_email_id(uuid, text), public.record_invite_email_event(text, text, text)
  to service_role;
