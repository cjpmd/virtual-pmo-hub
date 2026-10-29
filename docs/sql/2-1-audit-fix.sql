-- Work package 2.1 fix: let audit_log hold the 2.1 event names.
-- Applied on live as migration 20261029192122_2_1_audit_actions (29/10/2026), approved as written:
-- widen the constraint; write_audit and the rate-limit counts unchanged.
--
-- The problem: audit_log_action_check allowed only 'insert' | 'update' | 'delete' (the row-change
-- trigger's operations). private.write_audit records the 2.1 events in action ('invite.created',
-- 'member.role_changed', 'seats.changed', ...), so every RPC that audits failed with 23514 and
-- rolled back: create_invites, resend/revoke/accept_invite, change_member_role, remove_member, the
-- join-request and join-domain RPCs, record_billing_request, and the organisation_subscriptions
-- seat-audit trigger (a Stripe webhook that changes seats_total or a scheduled change would fail
-- too). Found by the deploy test of send-invite; no partial data was written.
--
-- The fix replaces the constraint with one that also allows the 2.1 events, as an explicit list.
-- Contains `drop constraint` (schema only: no rows are removed). Existing rows all use
-- insert/update/delete, so the new constraint validates immediately. Run as one transaction.

alter table public.audit_log drop constraint audit_log_action_check;

alter table public.audit_log add constraint audit_log_action_check check (action in (
  -- row changes (private.audit_row_change)
  'insert', 'update', 'delete',
  -- invitations
  'invite.created', 'invite.sent', 'invite.send_failed', 'invite.revoked', 'invite.accepted',
  'invite.bounced', 'invite.suppressed', 'invite.complained',
  -- members
  'member.role_changed', 'member.removed',
  -- join requests and domains
  'join_settings.changed', 'join_domain.added', 'join_domain.removed',
  'join_request.created', 'join_request.withdrawn', 'join_request.approved', 'join_request.declined',
  -- billing requests (record_billing_request) and what Stripe applied (seat-audit trigger)
  'billing.seats_added', 'billing.seat_reduction_scheduled', 'billing.scheduled_change_cancelled',
  'billing.interval_switch_scheduled',
  'seats.changed', 'seats.change_scheduled', 'seats.scheduled_change_cleared'
));

comment on constraint audit_log_action_check on public.audit_log is
  'Row operations from audit_row_change plus the work package 2.1 events written by private.write_audit. Add new event names here.';
