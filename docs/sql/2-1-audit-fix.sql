-- Work package 2.1 fix: audit entries from the 2.1 RPCs break public.audit_log_action_check.
-- PROPOSAL, not applied.
--
-- The problem: audit_log.action is constrained to 'insert' | 'update' | 'delete' (the row-change
-- trigger's operations). private.write_audit wrote the 2.1 events ('invite.created',
-- 'member.role_changed', 'seats.changed', ...) into action, so every RPC that audits fails with
-- 23514 and rolls back: create_invites, resend/revoke/accept_invite, change_member_role,
-- remove_member, the join-request and join-domain RPCs, record_billing_request, and the
-- organisation_subscriptions seat-audit trigger (so a Stripe webhook that changes seats_total
-- would fail too). Found by the deploy test of send-invite; no partial data was written.
--
-- The fix (additive: create or replace only, no drop, constraint unchanged):
--   * private.write_audit keeps action within the constraint (an event ending .created / .added
--     is 'insert', .removed is 'delete', everything else 'update') and records the event name in
--     detail.event, e.g. {"event": "invite.sent", "email": ..., "role": ...}.
--   * The two rate-limit counts look for detail ->> 'event' = 'invite.sent' instead of action.
-- Settings › Audit shows "<action> <table>" plus the detail, so these entries read like
-- "update organisation invites — event: invite.sent, email: …".
--
-- Alternative (not proposed): widen the check constraint to accept the event names. That needs
-- `alter table ... drop constraint`, so it would have to be run by hand.

-- 1. write_audit: same signature and grants (create or replace keeps them) ----------------------
create or replace function private.write_audit(p_org uuid, p_action text, p_table text, p_entity uuid, p_detail jsonb,
                                               p_actor uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (organisation_id, actor_id, action, entity_table, entity_id, detail)
  values (
    p_org,
    coalesce(p_actor, (select auth.uid())),
    case when p_action ~ '\.(created|added)$' then 'insert'
         when p_action ~ '\.removed$' then 'delete'
         else 'update' end,
    p_table,
    p_entity,
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('event', p_action)
  );
$$;

-- 2. Rate-limit counts read the event from detail -------------------------------------------------
create or replace function private.invite_emails_last_day(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.audit_log a
  where a.organisation_id = p_org and a.entity_table = 'organisation_invites'
    and a.detail ->> 'event' = 'invite.sent' and a.created_at > now() - interval '1 day';
$$;

-- Same body as 2_1_invites_seats except the per-invitation count (detail ->> 'event').
create or replace function public.resend_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organisation_invites;
begin
  select * into v_inv from public.organisation_invites i where i.id = p_invite_id;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  perform private.assert_org_admin(v_inv.organisation_id);
  perform private.lock_seats(v_inv.organisation_id);
  select * into v_inv from public.organisation_invites i where i.id = p_invite_id for update;
  if v_inv.accepted_at is not null then
    raise exception 'This invitation has already been accepted' using errcode = 'P0001', hint = 'invite_used';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'This invitation was revoked' using errcode = 'P0001', hint = 'invite_revoked';
  end if;
  if private.invite_emails_last_day(v_inv.organisation_id) >= 50 then
    raise exception 'This organisation can send 50 invitations a day. Try again tomorrow.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if (select count(*) from public.audit_log a
      where a.organisation_id = v_inv.organisation_id and a.entity_table = 'organisation_invites'
        and a.entity_id = p_invite_id and a.detail ->> 'event' = 'invite.sent'
        and a.created_at > now() - interval '1 day') >= 3 then
    raise exception 'This invitation has been emailed 3 times today. Try again tomorrow.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  -- An expired paid invitation isn't holding a seat; renewing it takes one again.
  if v_inv.expires_at <= now() and v_inv.role >= 'contributor' then
    perform private.assert_seats_for(v_inv.organisation_id, 1);
  end if;
  update public.organisation_invites i
  set expires_at = now() + interval '7 days', token_hash = null
  where i.id = p_invite_id;
end;
$$;
