# ORMO PMO — go-live plan for Claude Code

Source: platform audit of `main` at `3c77c64` (06/11/2026) and the live Supabase project
`xvdlmtkzfmbcegkmampz` (09/11/2026). Commit this file as `docs/go-live-plan.md` and add
`@docs/go-live-plan.md` to `CLAUDE.md` beneath `@docs/build-plan.md`.

## How to run this plan

- One work package per Claude Code session. Start a session with: `Work package GL-n from docs/go-live-plan.md.`
- The packages are in the order to run them. Where one depends on another, it says so.
- Branch `feat/gl-<n>`, open a PR, and merge only when everything in `CLAUDE.md` passes. Lovable publishes `main`, so merging is publishing.
- Packages marked **[DB]** stop twice: SQL to `docs/sql/gl-<n>-<name>.sql` first, then stop for approval; after approval, apply it as a migration, regenerate `src/integrations/supabase/types.ts`, then build the front end.
- Anything destructive follows the `CLAUDE.md` rule: its own section of the SQL file, run by me in the SQL editor.
- Measure database cost signed in, through RLS, as in `docs/perf.md`.
- Run e2e and SQL suites against a Supabase branch, or the local Postgres until we're on Pro (`supabase/tests/local/run.sh`), never production. Supabase branching needs the Pro plan.

---

### GL-1 Migration history reconciliation [DB]

```
Work package GL-1. The repo's supabase/migrations and production's migration history have
drifted (audit 09/11/2026):
- rb10_project_overview: repo 20261103180000, production 20261105163144.
- rb10_project_summary_phases: repo 20261106090000, production 20261106090956
  (production name rb10_project_summary_phase_id_phases).
- convert_request_to_project: repo 20261106100000, production 20261106140827.
- convert_request_fix (20261106142117) is on production with no file in the repo.
- grant_write_audit: repo 20261106120000, production 20261106143312.
- rb9_fix_create_report (repo 20261105090000) isn't in production's history, but its fix is
  live (create_report uses nullif): find which migration carried it.
- Three migrations are named by UUID (20261007211842, 20261007213413, 20261007213657,
  20261027162328): find what each does.
Use the Supabase tool read-only (list_migrations, and select from
supabase_migrations.schema_migrations for statements) to compare. Propose how to make the repo
reproduce production exactly: rename repo files to production's versions, add the missing file
from production's recorded statements, and descriptive names. Changes to
supabase_migrations.schema_migrations go in docs/sql/gl-1-migration-history.sql for me to run.
Don't apply anything. Stop for my review.
```
**Done when:** a fresh Supabase branch built from the repo has the same migration list and the same function definitions as production (spot-check `create_report`, `rb_project_summary`, `convert_request_to_project`).

**Done (09/11/2026):** verified on a fresh local Postgres from `main` `7380d02` (91 migrations, full
schema fingerprint and the three spot-checks match production); Supabase branching needs Pro.

### GL-2 Cron housekeeping [DB]

```
Work package GL-2. cron.job_run_details holds about 483k rows (156 MB) and grows by about 17k
a day, almost all from vpmo-health-refresh-queue (every 5 seconds, average 4 ms, max ~1 s).
Nothing purges it. Propose:
- A daily pg_cron job (vpmo-prune-cron-history, 03:30 Europe/London) deleting
  job_run_details rows older than 7 days, batched so it never holds a long lock. The first
  catch-up delete of the backlog goes in its own section for me to run in the SQL editor.
- A review of the queue drain: what writes to private.health_refresh_queue, how fast health
  needs to appear after an edit, and whether a 15–30 second interval (or a trigger that
  only schedules work when the queue is non-empty) is enough. Recommend with numbers.
Also prune net._http_response if pg_net isn't already doing it. SQL first, then stop.
```
**Done when:** the job exists, the backlog is cleared, and the run history stays roughly flat over a week.

**Notes from GL-2 (09/11/2026), done pending a week of flat run history:** migration
`20261109161632_gl_2_cron_housekeeping` (`docs/sql/gl-2-cron-housekeeping.sql`).
`private.prune_cron_history_batch(keep 7 days, batch 10,000)` deletes the oldest run history
by `runid`; the job `vpmo-prune-cron-history` runs at 02:30 and 03:30 UTC and only works when
it's 03:xx in Europe/London (pg_cron here schedules in GMT), committing after each batch, at
most 50 batches. The per-batch commit was tested on the local Postgres (4 batches, 4
transactions) and the command run by hand on production. `vpmo-health-refresh-queue` now runs
every 10 seconds (was 5): about 8,640 runs a day, so roughly 60k rows / 20 MB kept, and a writer
waits about 6 s on average (worst ~12 s) for "Updating health…". The backlog (~364k rows) was
deleted by hand on 09/11; the table stays at 156 MB on disk (owned by `supabase_admin`, so no
`VACUUM FULL`) and reuses the space. `net._http_response` needs nothing: pg_net purges it after
6 hours. Tick GL-2 when this stays roughly flat (60–70k rows, oldest 7–8 days ago, size
not growing) for a week from 10/11:

```sql
select count(*) as rows, min(start_time) as oldest,
       count(*) filter (where start_time < now() - interval '7 days') as over_7_days,
       pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as size,
       (select max(start_time) from cron.job_run_details d
         join cron.job j using (jobid) where j.jobname = 'vpmo-prune-cron-history') as last_prune
from cron.job_run_details;
```

### GL-3 Hide what isn't live, and remove client-specific copy

No database change.

```
Work package GL-3. A new customer sees things that don't work yet. Fix the copy and hide the
dead ends; don't delete the code behind them.
- "DTS" in customer-visible text: resources.index.tsx (page description), portfolio.index.tsx
  and portfolio.collections.tsx (meta descriptions). Use neutral wording. Grep the rest of
  src for DTS, Dundee and university-only wording in anything a customer sees.
- Setup wizard (signup.setup.tsx) step 3: remove the "Connect Microsoft 365" card; "Go to
  your portfolio" becomes the only next step.
- /connect-microsoft and the "Connect Microsoft 365" link in integrations-workspace.tsx: hide
  behind a feature flag in lib/features.ts (VITE_PLANNER_SYNC, off by default). With the
  flag off, the route redirects to /settings and Settings › Integrations says Planner sync is
  coming later.
- Settings › Notifications: hide the Email and Microsoft Teams switches and the digest
  setting (they do nothing until GL-13). Keep In-app.
- Delivery: hide the sprint and evidence-based forecast tabs and panels that only show
  NoSprintData, including SprintForecastPanel on the project overview, until Phase 3.
- Grep for any other user-visible "prototype", "simulated" or "demo only" wording outside
  the demo organisation and list it for me before changing.
Add or update e2e checks so the hidden items stay hidden.
```

**Done (09/11/2026):** "DTS" removed from page descriptions. `defaultSettings.organisation` is
blank; `orgDisplayNames` (`services/settings.ts`) falls back to `organisations.name` for a blank
name or short name (sidebar, committee packs, report covers, dashboards), and a short name is no
longer derived from the first three letters. Flags in `lib/features.ts`: `VITE_PLANNER_SYNC`
(off: `/connect-microsoft` redirects to `/settings`, Settings › Integrations says Planner sync
is coming later) and `VITE_SPRINT_DELIVERY` (off: no project Delivery tab, `?tab=delivery` opens
Overview). The setup wizard's Microsoft 365 card is gone; Settings › Notifications shows In-app
only. e2e: `e2e/hidden-features.e2e.ts`.

### GL-4 Read-only when a trial or subscription lapses [DB]

```
Work package GL-4. private.organisation_is_writable (migration 2_3_stripe_billing) exists
but nothing calls it, so expired trials and canceled, unpaid or long past-due subscriptions
keep full write access. Propose (SQL first, then stop):
- private.assert_org_writable(org uuid) raising errcode P0001 with hint 'org_read_only' and
  a plain message.
- Enforcement through BEFORE INSERT/UPDATE/DELETE triggers on every organisation-scoped
  table, so SECURITY DEFINER RPCs are covered as well as direct writes (47 definer RPCs per
  the advisor). Inventory the tables; for those without organisation_id, say how the trigger
  finds the organisation. One generic trigger function if possible.
- Writes that must still work when read-only: organisation_subscriptions and webhook event
  tables (service role), auth/profile updates, removing members and changing a paid member to
  viewer (so an admin can get under their seat count), Settings › Subscription, and system
  jobs that keep data correct (health refresh, snapshots, metric history). Say how you tell a
  system write from a user write (auth.uid() null / role).
- System jobs that create new user-facing work should skip read-only organisations: say which
  (scheduled report packs at least).
- Fix a gap in the function: a 'trial' organisation with trial_ends_at null is writable
  forever (production has one: "VPMO Test Outsider Org"). Backfill trial_ends_at for any
  trial row missing it, and make create_organisation always set it.
- Demo plan stays writable as now.
- Client: map hint 'org_read_only' to a friendly toast in services/service-error.ts.
- Tests: supabase/tests/read_only_mode.sql covering expired trial, canceled, unpaid, past_due
  inside and beyond 14 days, resubscribe restores writes, a definer RPC refused, member
  removal allowed, and reads and exports still working.
- Measure the cost on signed-in writes and reads as in docs/perf.md.
Nothing is ever deleted.
```

**Done (10/11/2026):** migration `20261110093319_gl_4_read_only` (`docs/sql/gl-4-read-only.sql`).
`private.organisation_is_writable` is null-safe now (a trial with no end date, or past_due with
no period end, is read-only); the default of writable applies only with no subscription row. The
Outsider org's missing trial end was backfilled to 24/11/2026, the E2E 2.1 organisation's trial
runs to 10/11/2027, and a constraint stops any trial without an end date. One trigger,
`zz_org_read_only` (`private.enforce_org_writable`), on the 136 tenant tables and
`organisations`; exempt: `organisation_subscriptions`, `audit_log`, `user_favourites` (and
`profiles`). A write is the system's when there's no signed-in user and the caller isn't anon
(cron, service role). While read-only, allowed by row shape: removing members, stepping down to
viewer, revoking invites, viewer invites (create, resend, accept), declining join requests and
approving them as viewer. Storage insert / update / delete policies check the organisation in
the path (members get the friendly error, outsiders a plain refusal). Scheduled pack drafts skip
read-only organisations. `public.organisation_writable(org)` for edge functions and GL-5.
`report-distribute` and `report-ai-summary` (version 2) check it before their service-role work;
the other edge functions don't need to (audit in the SQL file). Client: `read_only` error kind
in `services/service-error.ts`. Tests: `supabase/tests/read_only_mode.sql` (44 checks, local).
Cost: about 0.035 ms a row, 0.11 ms on a warm hosted update (`docs/perf.md`).

### GL-5 Trial and read-only banners

After GL-4. No database change expected.

```
Work package GL-5. Add a banner in the app shell, reading organisation_subscriptions through
services/billing.ts:
- Trial: "N days left in your trial", with Subscribe for admins (to Settings › Subscription).
  Stronger styling at 3 days or fewer.
- Read-only (trial ended, or subscription lapsed per private.organisation_is_writable logic,
  exposed as a field on the existing subscription read or a small RPC): "This organisation is
  read-only" with Subscribe for admins and "Ask your admin to subscribe" for everyone else.
- Past due within the grace period: "Payment failed — update your card by <date>" for admins.
- Nothing for the demo organisation or an active subscription.
- A useOrgWritable() hook; use it to disable the main create and edit buttons in Portfolio,
  Delivery, Governance and Benefits when read-only. List where you applied it.
Light and dark, desktop and 375 px. e2e: a trial org shows days left; a read-only org shows
the banner and a disabled New project button.
```

**Done (10/11/2026):** no database change. `services/billing.ts`: `getOrgWritable` (the GL-4
`organisation_writable` RPC, any member), `getSubscriptionStatus` (admins only, by RLS) and the
pure `accessBanner`, in priority order: nothing for demo; read-only (everyone: Subscribe for
admins, "Ask your admin to subscribe" for others); then admins only: past due inside the 14-day
grace ("update your card by <period end + 14 days>", Update card opens the Stripe portal), a
subscription set to cancel ("ends on <date> — read-only after that", Keep subscription opens the
portal; active or trialing), and a running trial ("N days left", stronger at 3 or fewer).
Members see no trial or payment banner (they can't read the subscription row; decided against an
RPC for them). `hooks/use-org-access.ts`: `useOrgAccess`, `useOrgWritable` (true while loading)
and `useProjectEditPermissions` (a project's permissions, all false while read-only). The banner
(`components/org-access-banner.tsx`) sits under the shell header; a write refused as read-only
(`router.tsx`) and the return from checkout refresh it. Disabled while read-only, with a tooltip
(`ReadOnlyTip`): New project and Issue task (Projects), New portfolio, New programme, programme
Edit / Close / Reopen / Archive and project Edit / ⋯ menu (`entity-management.tsx`), Issue task
and task edits (Plan › Tasks), New milestone (milestones board read-only), New report, New
decision (Decisions register and project decision log). Read-only through
`useProjectEditPermissions` / `useOrgWritable`: every project-page tab's `canEdit` (status
reports, RAID, gates, escalations, approval gates, links, dependencies, decisions), the Decisions
register and the Benefits register. The "Add milestone" links on the overview only navigate, so
they stay. e2e: `e2e/org-access.e2e.ts` replaces the membership, workspace-role,
`organisation_writable` and subscription responses (a real org can't be made read-only on
production).

### GL-6 Trial-ending and payment emails [DB]

After GL-4.

```
Work package GL-6. Organisation admins get no warning before a trial ends or access changes.
Propose:
- billing_notices (organisation_id, kind, period_key, sent_at, recipient count, error),
  unique on (organisation_id, kind, period_key) so jobs re-run safely.
- Kinds: trial_ending (3 days before trial_ends_at), trial_ended, payment_failed (from
  stripe-webhook on invoice.payment_failed, once per invoice), read_only (when a past_due
  grace period ends or a subscription is canceled or unpaid).
- A daily pg_cron job (08:00 Europe/London) that finds what's due and calls a new edge
  function send-billing-notice through Vault secrets, as report-notify does.
- Emails through supabase/functions/_shared/email.ts and email-templates.ts (Resend, sender
  "ORMO PMO <invites@ormo-pmo.originoverthrow.com>"), to every organisation admin, with a link
  to Settings › Subscription.
- Tell me which Stripe customer emails to switch off in the dashboard to avoid duplicates.
SQL first, then stop.
```

**Done (10/11/2026); the daily job sends once the Vault secret `billing_notice_url` exists:** migration `20261110102132_gl_6_billing_notices`
(`docs/sql/gl-6-billing-notices.sql`). `billing_notices` (service role only, on the AGENTS.md
organisation-only list), unique on (organisation, kind, period_key). The daily job
`vpmo-billing-notices` (07:00 and 08:00 UTC, works only at 08:xx London) queues `trial_ending`
(3 days or less, never subscribed), `trial_ended` and `read_only` (both within 7 days of
happening), then calls `send-billing-notice` through pg_net (URL in the Vault secret
`billing_notice_url`, key from `report_notify_service_key`). `stripe-webhook` (version 14) queues
`payment_failed` for renewal invoices (`billing_reason` `subscription_cycle`), once per invoice,
and sends it at once. Every notice is re-checked when sent (`still_applies`); admins whose address
Resend last reported as bounced or suppressed (`organisation_invites.email_status`) are skipped and
counted (`skipped_count`), and a notice with nobody left is `skipped`; five failed runs make it
`failed`. Also: `organisation_subscriptions.status_changed_at` (trigger), and the past_due grace now
runs 14 days from the failed payment (`private.past_due_grace_ends_at`), not from
`current_period_end`, which Stripe has already moved to the end of the unpaid period; GL-5's
"update your card by" date follows. "VPMO Test Outsider Org" has a year of trial so its test admin
gets no email; Originoverthrow is unchanged (trial ends 12/11). Tests:
`supabase/tests/billing_notices.sql` (36 checks, local) and `read_only_mode.sql` (46),
`_shared/billing-notices.test.ts`, `_shared/service-role.test.ts`.
`send-billing-notice` (verify_jwt on) accepts any token whose `role` claim is `service_role`: the
Vault key is the legacy service-role JWT and no longer equals the runtime's
`SUPABASE_SERVICE_ROLE_KEY`. `report-notify` compared the strings too: fixed in the GL-6
follow-up below.
Stripe dashboard: switch off "Send emails when card payments fail"; keep receipts, the 7-day
trial reminder (only Stripe trials carried over at checkout), upcoming renewals, expiring cards and
the 3D Secure link.

**GL-6 follow-up (10/11/2026):** `report-notify` compared the caller's key with the runtime's
`SUPABASE_SERVICE_ROLE_KEY`, but the Vault secret `report_notify_service_key` is the legacy
service-role JWT, which no longer matches. Every call from the cron job (`vpmo-report-notify`,
every 15 minutes, via `private.trigger_report_notify`) got 403, so no draft-pack-ready email went
out. It now uses `_shared/service-role.ts` like `send-billing-notice`: verify_jwt stays on (the
gateway checks the signature) and the function accepts a token whose `role` claim is
`service_role`, or the runtime key itself. Deployed as `report-notify` version 2. Checked on
production: the only database functions that call an edge function with the Vault key are
`private.trigger_report_notify` and `private.run_billing_notices`; no other edge function compares
keys (the rest only use `SUPABASE_SERVICE_ROLE_KEY` to build their own client). Proof: the call
from the database with the Vault URL and key answers 200; one test notice queued on the withdrawn
"Portfolio Report Test" report (demo organisation), addressed only to Resend's test inbox
`delivered@resend.dev`, was sent and marked sent by `private.trigger_report_notify()`, leaving
the queue empty. That test row stays in `report_notifications` (sent).

### GL-7 Terms, Privacy, DPA and Security pages

No database change. **Draft copy for my legal review: don't merge to main until I say so.**

```
Work package GL-7. /terms and /privacy are SitePlaceholderPage; /security has TODOs. Write
UK-law drafts for a B2B SaaS sold per seat by card through Stripe, with a 14-day free trial,
read-only on lapse and no deletion of customer data:
- Terms of service: accounts and admins, trial, seats and billing (£10 per seat per month or
  £100 per year, excl. VAT, viewers free), read-only on non-payment, acceptable use, customer
  data ownership, AI drafting caveats, availability, liability cap, termination and export,
  governing law Scotland.
- Privacy policy: what we collect (account, usage, customer content, billing via Stripe),
  lawful bases, retention, international transfers, user rights, contact, ICO complaint.
- /dpa: a Data Processing Agreement page (UK GDPR Article 28) with a subprocessor list,
  printable to PDF with print CSS. Link it from the footer, Pricing and Security.
- Subprocessors: Supabase (find the project's region with the Supabase tool), the web host
  (Lovable today), Resend, Stripe, Microsoft Entra (sign-in only), Anthropic (AI drafting),
  Cloudflare if Turnstile is on.
- /security: fill the hosting and database region TODOs from what you can confirm; leave the
  Entra region as a TODO for me if you can't confirm it.
Use [[placeholders]] for anything you don't know (legal entity name, company number,
registered address, ICO number, contact email) and list them in your summary. Keep the
existing site styling. "Last updated" date on each page.
```

**Drafted (10/11/2026), awaiting legal review; not merged:** `/terms`, `/privacy` and the new
`/dpa` (Article 28, incorporated by reference in the Terms, prints A4 portrait) share
`components/marketing/legal-page.tsx`; [[placeholders]] show highlighted. One subprocessor list,
`data/subprocessors.ts`, feeds `/security`, `/privacy` and `/dpa` (checked: Supabase eu-west-2,
Resend eu-west-1, Stripe account in GB so Stripe Payments UK Ltd; Anthropic added; Cloudflare
left out while Turnstile is off). The DPA is linked from the footer, Pricing, Security and the
sign-up form ("By creating an account you agree to…"). Email sign-up records `terms_version`
and `terms_accepted_at` in the auth user metadata (`lib/legal.ts` `TERMS_VERSION`); Microsoft
sign-up records nothing yet. Tick GL-7 after the legal review.

### GL-8 Sector choice and financial-year defaults [DB]

```
Work package GL-8. Every new organisation gets university and IT defaults from
private.seed_org_defaults (latest in migration auth_email_microsoft): "Student experience"
and "Research" benefit categories, Infrastructure / Service Desk teams, and an August
financial year in the wizard. Propose:
- A sector step in the setup wizard: University, Public sector, General.
- create_organisation gains the sector (stored in organisations.settings.sector). Adding a
  parameter creates a new signature: keep the old one working as a wrapper, or tell me what
  must be dropped and put that in its own section.
- seed_org_defaults by sector: University keeps today's values; Public sector and General
  get neutral teams, benefit categories, project types, forum names and tier wording.
  Show me the lists before building.
- Financial-year default follows the sector (August university, April public sector,
  January general); the user can still change it.
SQL first, then stop. e2e: a General organisation has no university wording in Settings.
```
**Note from GL-3:** `components/appraisal-panel.tsx:196` hard-codes "Student experience" (with
Efficiency and Income) as a category name in the appraisal logic; make it sector-aware. The
benefit categories, business units and lists in `data/settings-data.ts` `defaultSettings` are
still university values (the organisation name, short name and support contact were blanked in
GL-3).

### GL-9 Start with sample data [DB]

After GL-8.

```
Work package GL-9. Optional "Start with sample data" switch in the setup wizard, off by
default. Propose a SECURITY DEFINER RPC seed_sample_data(org) that creates a small portfolio,
a programme and four or five projects with tasks, milestones, a risk, an issue, a decision,
a benefit and a status report, enough to make Home, Portfolio, Governance and Benefits look
alive. Every row is marked as sample (propose how: a flag or a tag) and shows a "Sample"
chip. "Remove sample data" in Settings archives it (never deletes). Neutral, sector-aware
wording from GL-8. Sample projects don't count towards anything billed. SQL first, then stop.
```

### GL-10 Cross-tenant security suite [DB tests only]

```
Work package GL-10. Before a second real customer, prove organisation A can't read or write
organisation B's data. supabase/tests/rls_matrix.sql has one outsider; tenant_guard.sql
covers some cases. Build supabase/tests/cross_tenant.sql:
- Two organisations, each with an admin, a contributor and a viewer.
- Every public table with RLS: B's users see none of A's rows and can't insert, update or
  delete them (generate the table list from pg_class, so new tables are caught).
- Every function in public executable by authenticated (generate from pg_proc): an explicit
  call with A's ids as B's admin must fail or return nothing. A meta-check fails the suite
  if any such function has no case, so new RPCs can't slip through.
- Storage buckets and report print tokens: B can't fetch A's objects or snapshots.
Run on the local Postgres or a branch. Report any leak as a finding and stop before fixing it.
```

### GL-11 Account closure and organisation deletion [DB]

Design first.

```
Work package GL-11. There's no way to close an account or delete an organisation, which
UK GDPR erasure requests need. Write docs/design/account-closure.md, then stop:
- Organisation deletion (admin only, typed confirmation): the organisation becomes
  pending_deletion and read-only, the Stripe subscription is canceled (propose: at period
  end or immediately), admins are emailed, an export is offered, and after 30 days the data is
  purged. Admins can cancel within the 30 days.
- Personal account closure: refused while the user is the last admin of any organisation;
  otherwise memberships end, and the auth user is deleted through an edge function with
  the service role. Records they authored stay with the organisation; propose how their
  name is anonymised (audit log, owners, assignees).
- How the purge runs, given CLAUDE.md's rule on destructive statements (scheduled job vs a
  reviewed script I run), and how backups/PITR affect what "deleted" means for the privacy
  policy.
- Settings › Organisation and personal settings UI.
```

### GL-12 Bugs: board date sort and selection hint

No database change.

```
Work package GL-12.
1. Board date sort (build plan 1.7): BoardWorkspace compares cell values as text, so date
   columns (DD/MM/YYYY) sort by day of the month. Sort date columns (type "date", and
   start / finish) by calendar date using lib/calendar.ts toIsoDay, blanks and "—" last in
   both directions. Unit-test the comparator; e2e that a board sorted by date is in order.
   Tick 1.7 in docs/build-plan.md.
2. Report builder Selection panel: the "Rules changed: refresh" hint only appears when the
   set of matching projects changes, not when only a reason's threshold changes. Show it
   whenever the rules differ from those the current selection was computed with. Unit-test.
```

### GL-13 Real notifications [DB]

```
Work package GL-13 = build plan work package 4.1 (read its prompt in docs/build-plan.md).
Also: re-enable the Email switch and digest setting hidden in GL-3 once they work; Teams
stays hidden until Planner sync. Move the read state out of localStorage into the table.
SQL first, then stop. Tick 4.1 when done.
```

### GL-14 One pack system: retire Committee packs

Plan first.

```
Work package GL-14. Governance › Committee packs (committee_packs, components/committee-pack*,
use-committee-packs, the 1.2 PDF export) overlaps with the report builder's Boards packs.
Inventory what Committee packs does that the report builder doesn't, and what data exists on
production (counts only, read-only). Propose: close any feature gap in the report builder,
keep existing committee packs readable as an archive (never deleted), redirect
/governance/committee-packs to /governance/reports, and remove it from navigation, the
command palette and Home. Stop for my review before building.
```

### GL-15 Report approver reminders

```
Work package GL-15. Approvers aren't reminded about pending approval_steps (deferred item
RB-34). Using the existing report-notify cron and supabase/functions/_shared/report-notify.ts:
remind each approver of a pending step once a day, starting one working day after it was
assigned and stopping when it's decided or the report is withdrawn. Idempotent per step
per day (propose a small table or column if needed; SQL first, then stop if so). Skip
read-only organisations. Unit-test the selection logic.
```

### GL-16 Large packs overflow to Storage [DB]

Design first.

```
Work package GL-16. publish_report refuses packs with more than 2 MB of snapshot data
(RB-29). Propose storing large snapshot payloads in a private Storage bucket, with the path
and a content hash on report_snapshots, keeping snapshots immutable (the existing trigger)
and verifiable. Cover how the viewer, print route, PPTX export and report_snapshot_by_token
(anon, print tokens) read an overflowed snapshot (signed URL via an edge function?), and how
RLS on the bucket matches report visibility. SQL and design first, then stop.
```

### GL-17 Multi-tenant health refresh measurement

After GL-10. Supabase branch, or the local Postgres until we're on Pro.

```
Work package GL-17 = build plan work package 6.1 (read its prompt and the Phase 6 notes in
docs/build-plan.md, and docs/perf.md). Measure with 1, 2 and 5 tenants on a Supabase branch, or the local Postgres until we're on Pro,
recommend with numbers, and stop for my decision before any change. Tick 6.1 when decided.
```

### GL-18 Smaller main bundle

No database change.

```
Work package GL-18. The main client chunk is 669 kB minified and Vite warns about chunk
size (recharts' generateCategoricalChart 365 kB, export-pptx 383 kB). Measure what's in the
main chunk (sourcemap explorer or rollup visualizer as a dev dependency), then: route-level
code splitting through TanStack Router (autoCodeSplitting if the Lovable config allows it),
lazy-load charts, PPTX export, the report builder and the dependency map. Report before and
after sizes and first-load time on the public homepage and /portfolio. Don't change behaviour.
```

### GL-19 Finish clean-up 0.2

No database change.

```
Work package GL-19. Package 0.2 in docs/build-plan.md is unticked; read its prompt and its
"Notes from 0.2". Do whatever is still outstanding (stale prototype comments in
portfolio.projects.$projectCode.tsx, portfolio.programmes.$programmeId.tsx and lib/today.ts,
mock values in data/integrations.ts, the notifications popover), run eslint over all of src
(not just changed files) with 0 errors, and tick 0.2.
```

### GL-20 Split the oversized components (one per session)

No database change. No behaviour change: the full e2e suite must pass before and after.

```
Work package GL-20<a|b|c|d>. Split <component> into smaller files by responsibility (data
hooks, toolbar, views, dialogs, pure helpers), with pure helpers unit-tested. Scoped moves
only; no behaviour or styling change.
  a: components/board-workspace.tsx (~2,000 lines)
  b: components/settings/settings-sections.tsx (~1,900 lines): one file per section
  c: components/delivery-workspace.tsx (~1,700 lines): move the dormant sprint code to its
     own module for Phase 3
  d: components/task-workspace.tsx (~1,600 lines)
```

### GL-21 Remove the prototype-shape adapters (one domain per session)

No database change expected. No behaviour change.

```
Work package GL-21<a|b|c>. Services still convert database records into the prototype's
shapes before the screens use them (e.g. project-raid.tsx "RaidWorkspace renders the
prototype Risk/Issue shapes; these adapt the database records"). For <domain>, make the
screens use the generated database types (or thin view models built directly from them)
and delete the adapter layer. List every screen touched; e2e for that domain must pass.
  a: RAID (risks, issues, assumptions, decisions, dependencies)
  b: Benefits (services/benefits.ts)
  c: Resources (services/resources.ts)
```

---

## Not for Claude Code (me)

- Stripe: confirm the webhook endpoint points at production `stripe-webhook`; run a full test-mode cycle; then live keys and prices.
- Supabase: compute upgrade; leaked-password protection on; confirm email confirmation is required.
- Cloudflare Turnstile widget, `VITE_TURNSTILE_SITE_KEY` and the Supabase CAPTCHA secret.
- Confirm the production edge-function secrets: `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and the Stripe keys.
- Legal review of GL-7 before it merges.

## Progress

- [x] GL-1 Migrations  - [ ] GL-2 Cron  - [x] GL-3 Hide dead ends  - [x] GL-4 Read-only  - [x] GL-5 Banners  - [x] GL-6 Billing emails  - [ ] GL-7 Legal pages
- [ ] GL-8 Sector  - [ ] GL-9 Sample data  - [ ] GL-10 Cross-tenant  - [ ] GL-11 Closure  - [ ] GL-12 Bugs  - [ ] GL-13 Notifications  - [ ] GL-14 Committee packs
- [ ] GL-15 Reminders  - [ ] GL-16 Pack overflow  - [ ] GL-17 Multi-tenant  - [ ] GL-18 Bundle  - [ ] GL-19 Clean-up 0.2  - [ ] GL-20a–d Components  - [ ] GL-21a–c Adapters
