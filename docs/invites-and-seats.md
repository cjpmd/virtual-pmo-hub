# Invites, seats and join requests (work package 2.1)

Database: migration `20261029171524_2_1_invites_seats` (`docs/sql/2-1-invites-seats.sql`, rollback
reference `docs/sql/2-1-rollback.sql`). Edge functions: `send-invite`, `notify-join-request`,
`manage-subscription`, and schedule handling in `stripe-webhook` (shared code in
`supabase/functions/_shared/`).

## How it works

- **Invites.** An admin invites up to 20 addresses at a time, each with a role, into chosen
  workspaces. `send-invite` calls `create_invites` as the admin (all checks run in the database),
  then for each invite makes a 32-byte token, stores only its SHA-256 hash
  (`issue_invite_token`), emails the link `APP_URL/invite?token=…` through Resend, and records
  the result (`mark_invite_sent`). If Resend refuses the email the token is cleared and the
  invite shows "Not sent"; Resend invite issues a new token, so older links stop working.
  Invitations last 7 days and work once. Accepting needs the signed-in user's confirmed
  `auth.users` email to match the invited address (case-insensitive).
- **Seats.** Seats used = paid members + unexpired paid-role invites. The limit is 10 during the
  free trial, the purchased quantity with a subscription (the lower number once a reduction is
  scheduled), and 0 after a subscription has ended. A database trigger refuses any change that
  needs a seat when none is free; every path locks the organisation's subscription row first, so
  simultaneous invites or role changes can't overshoot.
- **Join requests.** Off by default. An admin can add only their own confirmed email domain
  (personal domains refused) or the Microsoft tenant they signed in from. Matching users who
  aren't members can ask to join; `notify-join-request` emails each admin once. Nobody joins
  until an admin approves with a role.
- **Billing changes in the app** (`manage-subscription`). Adding seats shows the prorated cost
  (incl. VAT) and charges it immediately on confirmation; seats are only added if the payment
  succeeds. Reducing seats and switching monthly ↔ annual take effect at the next renewal,
  through one Stripe subscription schedule; "Cancel scheduled change" releases it. While a
  schedule is attached, the Stripe customer portal can't update or cancel the subscription
  (Stripe's rule), so the app explains this and offers Cancel scheduled change.
- **Audit.** Invites, acceptances, revocations, role changes, removals, join requests, join
  domains and seat changes are written to `audit_log` (admins and PMO can read them).

## Settings to configure by hand

**Resend** (done): verified sending domain `ormo-pmo.originoverthrow.com` (EU, eu-west-1);
edge-function secrets `RESEND_API_KEY` and `RESEND_FROM`
(`ORMO PMO <invites@ormo-pmo.originoverthrow.com>`). The sender is always read from
`RESEND_FROM`; any other domain is refused by Resend with a 403.

**Stripe** (test mode first, then live):

1. Customer portal (Settings › Billing › Customer portal): under Subscriptions, turn **off**
   "Update quantities" and "Switch plan". Keep payment methods, billing details, invoice history
   and Cancel subscription on.
2. Webhook endpoint for `stripe-webhook`: add the events `subscription_schedule.created`,
   `subscription_schedule.updated`, `subscription_schedule.released`,
   `subscription_schedule.completed`, `subscription_schedule.canceled`,
   `subscription_schedule.aborted`, `customer.subscription.pending_update_applied` and
   `customer.subscription.pending_update_expired`, next to the existing checkout, subscription and
   invoice events.
3. Prices: keep the lookup keys `ormo_seat_monthly` and `ormo_seat_annual` on the active prices;
   `manage-subscription` finds the switch target by lookup key.

## Manual test checklist

Use `delivered@resend.dev` for invites that should arrive, never made-up addresses at real
providers. Run the Stripe steps in test mode, with a test clock to move past renewal.

**Invites and accepting**

- [ ] Invite `delivered@resend.dev` as a viewer: the invite shows as sent; Resend's log shows the
      email from `invites@ormo-pmo.originoverthrow.com` with the idempotency key
      `invite/<id>/<hash prefix>`.
- [ ] Invite a real test mailbox you control as a member; accept with **email + password**
      (new account): after confirming the email you land in the organisation.
- [ ] Same with **Microsoft** sign-in (a different mailbox): accept, land in the organisation,
      sign-in method shows Microsoft on the Members page.
- [ ] Signed out: open the link → sign in or sign up → you come back to the invite and accept.
- [ ] **Wrong email**: open an invite while signed in as another address → "sent to a different
      email address", nothing joined.
- [ ] **Expired**: set an invite's `expires_at` in the past (SQL editor) → "expired"; Resend
      invite makes it work again with a new link and the old link stops working.
- [ ] **Revoked** link → "withdrawn by an admin". **Already used** link (second person) →
      "already been used".
- [ ] **Not sent**: temporarily set `RESEND_FROM` to an address on another domain, invite
      someone → the invite shows "Not sent" with "The email couldn’t be sent. Use Resend invite to
      try again."; put `RESEND_FROM` back and Resend invite → sent. (`bounced@resend.dev` is
      accepted by Resend and bounces later, so it doesn't show "Not sent" until the bounce
      webhook exists.)
- [ ] Rate limits: a 21st address in one request is refused; the 4th email of one invite in a
      day is refused.

**Seats and roles**

- [ ] Trial organisation: "Using X of 10 seats". Invite paid members up to 10, then an 11th paid
      invite is refused with "Not enough paid seats"; a viewer invite still works.
- [ ] Change a viewer to member when seats are full → refused. Free a seat (remove a member or
      make one a viewer) → the change now works immediately.
- [ ] **Last admin**: demote or remove the only admin → refused.
- [ ] **Viewer read-only**: as a viewer, editing a project, RAIDD item, meeting or programme note
      fails; recording a decision where you are the named decision maker, a business case on
      your own request, your own leave, and your personal dashboards and saved views still work;
      sharing a dashboard or saved view fails.

**Billing (Stripe test mode)**

- [ ] **Add seats with proration**: monthly subscription, add 2 seats mid-period → the preview
      shows the prorated amount and VAT; confirm → charged now, Members page shows the new total.
- [ ] Add seats with a declining test card → "The payment didn't go through", seat count unchanged,
      the proration invoice is void, and any scheduled change is still there.
- [ ] **3D Secure**: on a test clock, subscribe with `4000 0025 0000 3155` (3DS required), schedule
      a switch to annual, then add seats → 402 `requires_action` with the hosted invoice link;
      seats unchanged and the schedule released. Complete 3DS on the invoice page → seats added
      and the annual switch rescheduled at the new seat count. Repeat without completing 3DS and
      advance the clock 23 hours → the pending update expires, seats unchanged, and the original
      schedule is back.
- [ ] **Reduce at renewal**: schedule a reduction → "Reduces to N on <date>"; the portal can't
      cancel meanwhile; advance the test clock past renewal → seats_total = N and the schedule
      is gone.
- [ ] Reduction below seats in use → refused.
- [ ] Switch monthly → annual (and back) at renewal; combine with a reduction; Cancel scheduled
      change releases both.
- [ ] Add seats while a reduction is scheduled → the reduction is dropped (the UI says so first);
      with a pending annual switch, the switch is kept at the new count.
- [ ] Annual plan: repeat add seats (prorated on the £100 price) and reduce at renewal.

**Join requests**

- [ ] Admin adds their own email domain; a personal domain (gmail.com) is refused.
- [ ] Admin signed in with Microsoft adds the tenant; a personal Microsoft account is refused.
- [ ] A matching user with no organisation sees "Request to join <Org>", requests, and each admin
      gets one email; the Members page shows the badge.
- [ ] Approve as member when seats are full → refused; approve as viewer → joins. Decline →
      the user can ask again after 7 days.

## Seats

- The UI shows three tiers over the five database roles: **admin** (organisation admin),
  **member** (organisation contributor, manager or PMO, or an organisation viewer who is
  contributor or above in any workspace) and **viewer** (everyone else).
- Admins and members use a paid seat. Viewers are free.
- Seats used = paid members + pending, unexpired invitations for a paid role.

## What a free viewer can do

Principle: a viewer can act on items personally assigned to them, but can't run or edit shared
work. The database enforces this (RLS and the RPC permission checks), not only the UI.

**Free for viewers**

| Action | Enforced by |
|---|---|
| View projects, programmes, portfolios, dashboards, boards and reports in their workspaces | read policies (`my_workspace_ids()`) |
| Record, defer or reverse a decision where they are the named decision maker | `private.can_record_decision` (decision-maker branch) |
| Create, edit and submit business cases on their own requests (demand intake) | `private.my_authored_request_ids`, `private.my_editable_business_case_ids` |
| Add, change and remove their own leave entries | `resource_leave` policies (`my_resource_ids()`) |
| Create, edit and delete their own personal dashboards and saved views (not shared) | `dashboards` / `saved_views` policies |
| Favourites and their own profile | `user_favourites` / `profiles` policies |

**Needs a paid seat (member or admin)**

| Action | Enforced by |
|---|---|
| Create or edit any project, programme, portfolio, RAIDD, milestone, task, status report or other record | write policies (`my_workspace_ids('contributor')` and above, `my_editable_project_ids()`) |
| Edit meetings or record decisions as forum chair | `private.is_forum_chair` |
| Edit a programme office note as programme manager | `private.can_edit_programme_note` |
| Accept or decline a task offer | `work_item_offers_update` policy |
| Create or share a shared dashboard or saved view | `dashboards` / `saved_views` policies |
| Upload attachments, evidence or documents | storage policies (contributor and above) |

## Join domains: future option

Today an admin can add only the exact domain of their own confirmed email, or the Microsoft
(Entra) tenant they signed in from. Proving control of any other domain by a DNS TXT record is a
possible later addition.
