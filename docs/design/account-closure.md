# Account closure and organisation deletion (GL-11)

Status: **built 10/11/2026** (migration `20261110170309_gl_11_account_closure`; section D, the
`profiles_id_fkey` drop, is run by hand). Tests: `supabase/tests/account_closure.sql` (75 checks) and
`supabase/tests/organisation_purge.sql` (full coverage, GL-10's filler), both on the local Postgres.
Built on top of the design below: the recent-sign-in check falls back to the session's creation time
when the JWT's amr has no timestamp (Microsoft), and the purge refuses while Storage objects remain.
The full data export is GL-11b. Written
10/11/2026 from `main` `42e089e` and a read-only look at production (`xvdlmtkzfmbcegkmampz`).

**Decisions (10/11/2026)** — D1 cancel at period end on request; D2 scheduled purge shipped in
`dry_run`, first purges run by hand; D3 admins emailed, and every member sees "This organisation
is scheduled for deletion on <date>" in the banner; D4 sign-in within 10 minutes for account
closure; D5 drop `profiles_id_fkey` (run by hand) and add an insert trigger on `profiles`
requiring a matching `auth.users` row; D6 full export is GL-11b; D7 no retention limit for
abandoned trials. Bypass: no session setting or GUC; a row only the definer purge function can
write, keyed to the current transaction id and backend.

**Where the SQL proposal differs from the sections below** (the SQL file is authoritative):
- The marker table is `private.privileged_ops` (kind `purge` or `closure`), not
  `private.purges_in_progress`. A `closure` row only lifts the read-only check and row audit for
  the closure's own writes; it never satisfies `in_purge()`.
- Deletion emails are tracked in columns on `organisation_deletions` (`scheduled_email_at`,
  `reminder_7_email_at`, `reminder_1_email_at`, `cancelled_email_at`), not new `billing_notices`
  kinds: widening that check would need a `drop constraint`.
- For the same reason, audit rows reuse existing actions: `update` on `organisation_deletions` for
  a request or cancel, `member.removed` with `reason: account_closed` for a closure.
- `organisation_deletions` has no `zz_org_read_only` trigger (like `organisation_subscriptions`),
  so a lapsed organisation can still ask for deletion and admins can cancel while it's pending.
  Members can read only `organisation_id`, `requested_at`, `purge_after` and `cancelled_at`.
- `close_my_account` refuses (`closure_not_enabled`) until `profiles_id_fkey` is dropped, so a
  `deleteUser` can never cascade the profile.
- The guard functions changed are the ones the catalog shows refusing a DELETE on an organisation
  table, plus `committee_pack_lock`, `audit_row_change` and `health_current_enqueue`. Not changed:
  `meeting_rules`, `forum_action_rules`, `risk_matrix_default_guard`, `financial_period_guard`
  (they don't refuse deletes; the purge test passes without them).
- The purge test covers the tables that sample data plus the guarded records touch, not literally
  every table; GL-10's generated table list is the natural place for the every-table seed.

There are two separate requests:

| | Who asks | What goes | What stays |
|---|---|---|---|
| **Organisation deletion** | an organisation admin | everything belonging to the organisation, after 30 days | nothing in our database except a purge log entry with the organisation id and dates; Stripe's invoices (Stripe keeps them) |
| **Personal account closure** | any signed-in user | their sign-in (auth user), personal data, memberships | records they wrote stay with each organisation, attributed to "Former member" |

The organisation is the controller of its content (the DPA says so); we are the controller of
account data (the Privacy notice). So closing an account removes the person's account, not their
employer's project records. An erasure request about the project records goes to the organisation.

---

## 1. What production looks like today (evidence)

**Who points at a user.** `profiles.id` references `auth.users` **on delete cascade**. 127
foreign keys reference `profiles`:

- **cascade** (6): `organisation_members`, `workspace_members`, `user_favourites`, `dashboards`,
  `saved_views`, `organisation_join_requests`. Deleting a profile today silently deletes the
  person's dashboards and saved views, **including shared ones** other people use.
- **set null** (121): every `created_by`, plus `audit_log.actor_id`, `decision_events.actor_id`,
  `report_events.actor`, `approval_steps.approver_id`, `business_case_versions.submitted_by`, and so on.

A set-null action is an `UPDATE` of the referencing row, so the row's triggers fire. 30 tables with
those keys have `BEFORE UPDATE` triggers that can raise: submitted business cases, frozen decision
options, issued committee packs (`committee_pack_lock` raises on *any* update of an issued pack),
closed financial months, and others. **So deleting an auth user today fails** for anyone who
issued a committee pack, submitted a business case or recorded something in a closed month. Where it
does succeed, it wipes "who did this" from the audit log, decision history and report events.

**Who points at an organisation.** 140 public tables carry `organisation_id`. 15 foreign keys to
`organisations` cascade, 22 are `no action` (`workspaces`, `resources`, `reports`, `audit_log`,
`forums`…), and the rest reach the organisation through composite keys to workspaces or projects.
Besides the read-only trigger, 83 triggers fire on delete across those tables. Several refuse
deletes outright: `committee_packs_no_delete`, `report_snapshots_immutable`,
`report_metric_snapshots_immutable`, submitted `business_case_versions`, closed financial periods.
`delete from organisations` can't work as it stands.

**Can we switch the triggers off for a purge?** No. `session_replication_role = replica`
(which skips triggers) is refused for `postgres` on this project (checked: "permission denied to
set parameter"). `alter table … disable trigger` would lock each table for every tenant. So the
purge needs an explicit, unspoofable bypass in the guard functions (§3.4).

**Storage.** Five private buckets: `org-assets`, `attachments`, `evidence`, `documents`,
`report-pdfs`; object paths start with the organisation id (GL-4's storage policies rely on that).
`storage.objects` has Supabase's `protect_objects_delete` trigger, so a SQL delete is refused; and
deleting the row would leave the file anyway. Objects must go through the Storage API.

**Resources.** Every member gets a `resources` row (`private.link_profile_to_resource`): it links
an existing resource with the same email, or creates a non-bookable one with the profile's name and
email (`created_by` null). Owners and assignees across RAID, tasks, milestones and benefits point at
`resources`, not `profiles`. `remove_member` unlinks the resource and leaves the name (backlog item
from 2.1).

**Backups.** The Privacy notice and DPA already say that the current plan keeps no automatic
backups, and that when it does they'll be kept for 7 days.

**Today's legal wording** (GL-7 drafts, still with the solicitor):
- Privacy: "If you close your account, we delete or anonymise your account details within 30
  days; records you authored stay with your organisation." This design fits that wording.
- Privacy / Terms / DPA: "When an organisation is closed, its data is deleted within 30 days."
  With a 30-day cancellation window, the purge happens **30 days after the request** (§2.6).

---

## 2. Organisation deletion

### 2.1 Flow

1. **Request** (Settings › Organisation › "Delete organisation", org admins only). The dialog says
   what happens and when, offers the exports (§2.5) first, and asks the admin to **type the
   organisation's name** exactly. RPC `request_organisation_deletion(p_org, p_confirm_name)`.
2. The organisation becomes **pending deletion**: read-only for everyone (§2.3); a banner shows
   "This organisation will be deleted on <date>", with **Cancel deletion** for admins.
3. Edge function `organisation-deletion` (verify_jwt, admin) does the Stripe step (§2.4) and emails
   **every admin** (template "Your organisation is scheduled for deletion", with the date and a
   link to cancel). Members see the banner; they don't get an email (see decision D3).
4. **Reminder** to admins 7 days before the purge, and **1 day before**.
5. **Cancel** (any admin, until the purge starts): RPC `cancel_organisation_deletion(p_org)`. Writes
   come back at once, if the subscription or trial still allows them. Admins get a "Deletion
   cancelled" email.
6. **Purge** on day 30 (§3). A last email goes to the admin addresses captured when the purge
   starts: "<Organisation> has been deleted." Members' accounts stay. Anyone with no organisation
   left goes to `/signup/setup` at their next sign-in, and the email says they can close their
   account in Account settings.

Refused: the demo organisation (`is_demo`), a second request while one is pending, a wrong name,
non-admins. Each refusal has a hint the client maps in `services/service-error.ts`.

### 2.2 Schema (proposal; SQL comes in the build session)

- `public.organisation_deletions`. It describes the organisation itself, so it has
  `organisation_id` only (add it to the AGENTS.md exception list). Columns: `organisation_id`
  (pk, references organisations on delete cascade), `requested_by`, `requested_at`, `purge_after`
  (`requested_at + 30 days`), `cancelled_at`, `cancelled_by`, `purge_started_at`, `stripe_done_at`,
  `storage_done_at`, `last_error`, `attempts`. RLS: org admins select; no client writes (definer
  RPCs and the service role only). The `zz_org_read_only` trigger is attached as the rule requires;
  the RPCs need an entry in `private.read_only_write_allowed` (cancelling must work while
  read-only). Re-requesting after a cancel updates the row (one row per organisation).
- `private.purge_log` (no foreign keys, so it survives the purge): `organisation_id`,
  `requested_at`, `purged_at`, row counts per table (jsonb), objects removed per bucket. No names
  and no email addresses. It's also the list to re-apply after a backup restore (§5).
- `billing_notices.kind` gains `deletion_scheduled`, `deletion_reminder` and `deletion_cancelled`,
  sent through the GL-6 `send-billing-notice` path (same templates module, same bounce skipping,
  idempotent on `period_key = requested_at`). The "deleted" email can't use `billing_notices`, which
  cascades away, so the purge function sends it directly.

### 2.3 Read-only while pending

`private.organisation_is_writable(org)` gets one more condition: **false** while an uncancelled
`organisation_deletions` row exists. Everything GL-4 built then applies unchanged: the trigger on 136
tables, storage policies, `public.organisation_writable` for edge functions, the GL-5 banner and
`useOrgWritable`. Reads and exports keep working. Allowed while pending: what GL-4 already allows
(removing members, stepping down to viewer, revoking invites) plus cancelling the deletion. The demo
exemption in `organisation_is_writable` comes after the deletion check, but the demo can't be
deleted anyway.

GL-5 `accessBanner` gets a `pending_deletion` state, ranked above read-only: everyone sees the date;
admins also get Cancel deletion. Scheduled pack drafts already skip read-only organisations (GL-4).

### 2.4 Stripe

**Recommendation: cancel at period end when the deletion is requested; cancel immediately at the
purge if the subscription is still live.**

- At the request: if there's a subscription schedule (`stripe_schedule_id`, used for pending seat
  cuts and interval switches), release it, then set `cancel_at_period_end = true`. The webhook
  updates `organisation_subscriptions` as now. Nothing is refunded (the Terms say fees aren't
  refundable), and no renewal happens during the 30 days.
- Cancelling the deletion sets `cancel_at_period_end = false`, so nothing is lost. A schedule that
  was released isn't put back; the admin redoes a pending seat cut in the portal. The dialog says so.
- At the purge, if the subscription is still live (annual plans, or a monthly one with more than 30
  days left), cancel it **immediately**, with no proration and no final invoice.
- The **Stripe customer is kept**, with its invoices: they're tax records (HMRC: 6 years), and
  Stripe holds them as its own controller for payments. We drop our link (the row cascades away).
  The Privacy notice already lists Stripe for billing; add one line: "billing records stay with
  Stripe for the period the law requires."

The alternative, cancelling immediately at the request, ends access to the portal and invoices at
once and makes a cancelled deletion need a fresh checkout. Not recommended.

### 2.5 Export before deletion

What exists today: Export portfolio (CSV) and Export settings (JSON) (1.1), plus per-register CSVs.
That isn't "your data". **Proposal:** a new edge function, `export-organisation` (admin only, works
while read-only). It reads every organisation table as the service role, filtered by
`organisation_id`, and writes one JSON file per table plus a manifest into a zip in a new private
bucket, `exports/<org>/<timestamp>.zip`. It returns a signed URL (24 hours) and deletes the zip after
7 days. Storage files (documents, evidence) are listed in the manifest with their paths. The
attachments themselves aren't zipped in v1, because of size; each one can still be downloaded until
the purge. The deletion dialog and Settings › Data both offer it. This is the largest piece of the
build. It can ship as its own package (GL-11b) if you'd rather not hold the rest up.

### 2.6 Timing and legal wording

- Purge after 30 days, run by the daily job (08:xx London, alongside GL-6), so it happens on day 30
  or 31.
- Proposed wording (for the solicitor checklist): "When an administrator deletes an organisation,
  it becomes read-only at once and any administrator can cancel for 30 days. After that we delete
  its data, normally within 2 days. Copies in backups expire as described below."
- Abandoned organisations (a trial that lapsed and was never subscribed) are **not** deleted by
  this package. The Terms promise not to delete for non-payment. If you want a retention limit for
  those (for example 12 months read-only, with warning emails), that's a separate decision and a
  Terms change.

---

## 3. How the purge runs

### 3.1 Scheduled job, not a script you run (recommended, with a switch)

The CLAUDE.md rule covers destructive statements **in migrations** applied through the Supabase
tool. The migration for this package only creates functions; it deletes nothing when it's applied.
The deletes run later, inside `private.purge_organisation`, as runtime behaviour. A reviewed script
you run by hand for every deletion doesn't scale, and it makes "within 30 days" depend on someone
remembering. So:

- `private.purge_organisation(p_org uuid, p_dry_run boolean default true)`: owner `postgres`,
  execute revoked from public, anon and authenticated, granted to `service_role` only. A dry run
  returns the row counts it *would* delete and changes nothing.
- A daily pg_cron job, `vpmo-organisation-purge` (08:xx London, with the same two-UTC-slot pattern
  as GL-2 and GL-6), calls the edge function `purge-organisations` through the Vault URL and key, as
  `send-billing-notice` is called.
- **Switch:** the Vault secret or a row in `private.app_flags`, `organisation_purge_mode` =
  `off | dry_run | on`. It ships as **`dry_run`**: the job sends reminders and logs what it would
  purge, and you run `select private.purge_organisation('<id>', false)` in the SQL editor for the
  first few. When you're happy, set `on`.

### 3.2 Order of work (edge function `purge-organisations`, service role, idempotent)

For each organisation with `purge_after <= now()`, not cancelled, not done:

1. Re-check that the deletion is still pending (it could have been cancelled a second ago).
   `select … for update` on the `organisation_deletions` row, set `purge_started_at`. From then on,
   cancelling is refused.
2. **Stripe:** cancel a live subscription immediately (§2.4). Set `stripe_done_at`.
3. **Storage:** list and remove every object under `<org>/` in the five buckets (and `exports/`),
   in pages of 1,000, through the Storage API. Set `storage_done_at` and record the counts.
4. Capture the admins' email addresses (for the final email) in memory, not in a table.
5. **Database:** `rpc('purge_organisation', { p_org, p_dry_run: false })`, in one transaction (§3.3).
6. Send the "deleted" email; write `private.purge_log`.

If any step fails: `attempts += 1`, `last_error` is set, the next day's run carries on from the
step it reached (each step is safe to repeat), and after 3 failures you get an alert email
(`SUPPORT_EMAIL`).

### 3.3 Inside `private.purge_organisation`

- Writes a row to `private.purges_in_progress (organisation_id, backend_pid, txid)` and deletes it
  before returning, in the same transaction. Clients can't write the `private` schema, so a client
  can't fake it.
- Deletes are **generated from the catalog**, not hand-listed, so new tables are covered: every
  `public` table with `organisation_id`, children before parents, ordered by walking `pg_constraint`
  (the same idea as GL-10's generated table list). Then `organisations` itself. Tables without
  `organisation_id` that hang off the organisation (`private.health_refresh_queue`,
  `private.health_check_log` cascade already) are covered by their cascades.
- Afterwards, a **completeness check** over every table with `organisation_id` (public and private)
  raises, and rolls everything back, if a single row is left.
- Audit: the delete triggers would write tens of thousands of `audit_log` rows for an organisation
  that is itself being deleted. `audit_row_change` returns early while the purge marker is set
  (same check as below).
- Performance: one transaction holds row locks only on that organisation's rows. A large
  organisation takes seconds. Measure on the local Postgres with the perf seed (`scripts/seed-perf-org.sql`).

### 3.4 The trigger bypass

`private.purging(p_org uuid)` returns true when `private.purges_in_progress` has a row for that
organisation **and** `backend_pid = pg_backend_pid()` and `txid = txid_current()`. It's
`security definer`, execute revoked from everyone but the definer functions.

These guard functions get one early line, `if private.purging(old.organisation_id) then return
old; end if;` (or the matching `new` for updates), via `create or replace` in a new migration.
Additive, no drops:
`committee_pack_no_delete`, `committee_pack_lock`, `report_snapshots_immutable`,
`report_metric_snapshots_immutable`, `business_case_version_rules`, `business_case_child_frozen`,
`decision_child_frozen`, `decision_rules`, `financial_period_guard`,
`financial_values_closed_month`, `guard_last_admin`, `workspace_lifecycle_guard`, `meeting_rules`,
`forum_action_rules`, `risk_matrix_default_guard`, `audit_row_change`, plus any others the local
test finds. The list is confirmed by running the purge on the local Postgres against a fully seeded
organisation, and `supabase/tests/organisation_purge.sql` keeps it honest (§6).

That matches the AGENTS.md rule for business cases: the bypass isn't a session setting. It depends
on a row only a `postgres`-owned function can write, tied to the backend and transaction.

---

## 4. Personal account closure

### 4.1 Flow

1. Settings › Account settings › "Close my account". The dialog lists the user's organisations and
   their role in each.
   - **Refused while the user is the last admin of any organisation** (hint `last_admin`). The
     dialog names the organisations and offers "Make someone else admin" (Members & invitations) or,
     where they're the only member, "Delete organisation" (§2). The existing `guard_last_admin`
     trigger is the backstop.
   - The user types their email address to confirm.
   - Recommended: also ask for a **recent sign-in**: the session started within the last 10
     minutes (`auth.sessions.created_at` for the JWT's `session_id`), or else "Sign in again to
     continue". Decision D4.
2. Edge function `close-account` (verify_jwt; the caller can only close their own account):
   1. RPC `close_my_account()` as the user (definer, §4.2), in one transaction.
   2. Remove their avatar object, if any.
   3. `auth.admin.deleteUser(uid)` with the service role: hard delete (not soft delete). Identities
      (Microsoft included), sessions and MFA factors cascade inside `auth`.
   4. Email the captured address: "Your ORMO PMO account has been closed."
3. If step 3 fails after step 1 succeeded, the profile is already closed and has no memberships, so
   it can't see anything. The daily job retries `deleteUser` for profiles with `closed_at` set whose
   auth user still exists.

The person is signed out on their device straight away. A JWT already issued elsewhere keeps working
up to its expiry (1 hour), but with no membership it matches no RLS policy.

### 4.2 `close_my_account()`: what happens to each thing

| Data | Action |
|---|---|
| `organisation_members`, `workspace_members` | deleted, via the same logic as `remove_member` (seat counts follow). Allowed while an org is read-only (GL-4 already allows leaving). |
| `profiles` row | **kept as a tombstone**: `display_name = 'Former member'`, `email = ''`, `avatar_path = null`, `preferences = '{}'`, `last_organisation_id = null`, new column `closed_at = now()`. |
| Everything that points at the profile (121 set-null keys, `audit_log.actor_id`, decision and report history, approvers) | **unchanged**. It now reads "Former member". History stays intact, and none of the frozen-row triggers fire. |
| Linked `resources` (owners, assignees) | Unlinked in each org (`profile_id = null`). If the resource was **auto-created for the membership** (`created_by is null`, `is_bookable = false`, name equal to the profile's name at closure), it's also anonymised: `name = 'Former member'`, `email = null`, `is_active = false`. A resource an admin created as a staff record keeps its name: it belongs to the organisation. This also settles the 2.1 backlog item in the closure case. |
| Personal `dashboards` / `saved_views` (not shared) | deleted |
| **Shared** `dashboards` / `saved_views` | kept, owned by the tombstone; PMO / admin can already edit shared ones |
| `user_favourites`, `organisation_join_requests` | deleted |
| `organisation_invites` sent **to** their email | pending ones revoked; the `email` on all of them is replaced with `removed-<invite id>@invalid` (the column is not null). Invites they **sent** keep `invited_by` (it reads "Former member"). |
| `audit_log.detail` | Their email is replaced with `[removed]` wherever it appears as a JSON string value, in rows of the organisations they belonged to. Names aren't text-replaced: a name like "Sam" would damage other text. Free text they wrote (comments, narratives, report text) stays: it's organisation content. |
| `report_snapshots` (published packs) | unchanged: immutable records of what a board saw, and organisation content. They may contain the resource's name as it was when published. |

`close_my_account` writes one `audit_log` row per organisation ("member closed their account"),
with no personal data in it.

### 4.3 Schema change this needs (and the one destructive statement)

The tombstone needs `profiles` to outlive its `auth.users` row, so the foreign key
`profiles_id_fkey` (`profiles.id` → `auth.users.id`, on delete cascade) has to go:

```sql
-- Destructive (CLAUDE.md): in its own section of docs/sql/gl-11-…sql, for you to run in the SQL editor.
alter table public.profiles drop constraint profiles_id_fkey;
```

Everything else is additive: `profiles.closed_at`, with RLS on `profiles` unchanged. A tombstone
has no auth user, so nobody can sign in as it, and no memberships, so it appears only where a
record already points at it (as "Former member").

The new-user trigger (auth insert → profile insert) is unaffected: a new sign-up with the same
email gets a new id.

**Alternative, if you'd rather not drop the key:** don't delete the auth user. Anonymise it (email
`closed-<id>@invalid`, delete identities, ban permanently) and keep the cascade. That's weaker
("anonymised", not "deleted") but needs no destructive DDL. Not recommended: the plan asks for
deletion, and a banned auth row still holds the user's metadata (`terms_accepted_at`, Microsoft
name claims) unless we scrub that too.

---

## 5. Backups, PITR and what "deleted" means

- **Today:** no automatic backups on the current plan. A purge or a closure is final at once.
- **On Pro:** daily backups, kept 7 days. PITR is an add-on with its own retention window. Supabase
  can't delete one organisation from a backup, so deleted data stays in backups until they expire.
  Privacy-notice wording (already drafted): "copies can remain in backups until they expire (7
  days)". If we add PITR, the window becomes the PITR retention; keep it at 7 days or update the
  wording.
- **Beyond use:** we never restore deleted data except to recover the whole Service. After any
  restore, a runbook step re-applies `private.purge_log` (purge every organisation id listed whose
  `purged_at` is after the backup) and re-closes profiles closed since then (`close-account`
  replay from a `private.closure_log`: profile id and `closed_at` only). Both logs hold ids and
  dates, never names or emails. The step goes in a new `docs/runbooks/restore.md`.
- **Other processors:** Resend keeps sent-email logs for its own retention (we can't purge per
  organisation; the DPA's subprocessor table should say so). Stripe keeps billing records (§2.4).
  Anthropic API inputs are not used for training and are kept per its API retention. Nothing to do
  in code; the solicitor checklist gets one line for each.

---

## 6. UI summary

- **Settings › Organisation › Danger zone** (admins): "Delete organisation". Dialog: what happens,
  the date, the export buttons, a typed name, and a red "Delete in 30 days" button. When pending,
  the section shows the date and Cancel deletion.
- **Banner** (`components/org-access-banner.tsx`): new `pending_deletion` state.
- **Settings › Account settings**: "Close my account". Dialog: organisations and roles, the
  last-admin block with links, typed email, recent sign-in check. After closing: signed out and sent
  to the public homepage with a toast.
- **Settings › Data**: "Export all data (zip)" (§2.5).
- Former members show as "Former member" everywhere a profile or resource name is shown (no code
  change where the name is read from the row; check the people pickers hide `closed_at` profiles and
  inactive resources).

## 7. Tests

- `supabase/tests/organisation_purge.sql` (local Postgres): seed one organisation **touching every
  table with `organisation_id`** (a meta-check fails if a table has no seeded row, so new tables
  are caught), plus a second organisation that must be untouched. It checks the dry run changes
  nothing; the real run leaves zero rows (catalog-wide); the other organisation's counts are
  unchanged; a client can't call `purge_organisation` or fake `purges_in_progress`; and immutable
  rows are still immutable outside a purge.
- `supabase/tests/account_closure.sql`: last admin refused; memberships gone; the tombstone keeps
  references (business case submitted_by, issued committee pack, closed financial month); the
  auto-created resource is anonymised and the admin-created one isn't; shared dashboards survive;
  the email is scrubbed from `audit_log`; `auth.users` delete succeeds with the FK dropped.
- `read_only_mode.sql`: pending deletion → read-only, cancel → writable.
- Unit: `accessBanner` pending state; the purge function's step resumption; the email templates.
- e2e (not on production): the two dialogs, with mocked RPC responses, as in GL-5.

## 8. Decisions for you

| # | Question | Recommendation |
|---|---|---|
| D1 | Stripe at request: cancel at period end, or immediately? | **Period end**; immediate cancel at purge if still live (§2.4) |
| D2 | Purge: scheduled job, or a script you run each time? | **Scheduled job, shipped in `dry_run`**; you run the first few by hand, then switch it `on` (§3.1) |
| D3 | Email all members when deletion is requested, or admins only? | **Admins** (the plan says admins); members see the banner. Members could get one email at request if you prefer. |
| D4 | Recent sign-in required for account closure and org deletion? | **Yes for account closure** (10 minutes); typed name only for org deletion, because any other admin can cancel |
| D5 | Drop `profiles_id_fkey` (tombstone profiles), or ban and anonymise the auth user instead? | **Drop the key** (§4.3); you run the one statement |
| D6 | Full data export (§2.5) in this package, or a separate GL-11b? | **Separate GL-11b**, built before GL-11's deletion UI goes live, so the dialog can offer it |
| D7 | Retention limit for abandoned (never-subscribed) organisations? | **Not now**; needs a Terms change |

## 9. Build plan once approved

1. SQL: `docs/sql/gl-11-account-closure.sql`. Additive migration: `organisation_deletions`,
   `private.purge_log`, `private.closure_log`, `private.purges_in_progress`, `profiles.closed_at`,
   `billing_notices` kinds, `organisation_is_writable` change, `purging()` and the guard-function
   updates, RPCs (`request_organisation_deletion`, `cancel_organisation_deletion`,
   `close_my_account`, `purge_organisation`), the cron job. Separate section: the
   `profiles_id_fkey` drop for you to run. Stop for approval.
2. Apply, regenerate types, then run both SQL suites on the local Postgres.
3. Edge functions: `organisation-deletion`, `purge-organisations`, `close-account` (plan them
   before deploying, as in 2.1).
4. Front end (§6), the service-error hints and the banner state.
5. Update the solicitor checklist and this file's status.
