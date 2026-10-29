# Virtual PMO — build plan for Claude Code

Audit baseline: commit `9408ecd` (19/10/2026). Supabase project `xvdlmtkzfmbcegkmampz`.
Commit this file as `docs/build-plan.md` so Claude Code can read it, and tick packages off as they land.

## How to run this plan

- **One work package per Claude Code session.** Paste the package's prompt, let it plan, review, then let it build.
- **Every package that touches the database stops twice.** First it writes the SQL to `docs/sql/<package>.sql` and stops for your approval. After you approve, it applies the SQL as a new migration, regenerates `src/integrations/supabase/types.ts`, then builds the front end.
- **Branches.** Lovable syncs `main`, so Claude Code works on `feat/<package-id>` and opens a PR. Merge only when the build, tests and lint pass. Never force-push.
- **Make Claude Code read the repo rules.** Claude Code reads `CLAUDE.md`, not `AGENTS.md`. Add a `CLAUDE.md` at the repo root containing:

```
@AGENTS.md
@docs/build-plan.md

Working style: plan first and wait for my go-ahead; scoped str_replace edits, never whole-file rewrites;
one work package per session; finish with `npx tsc --noEmit`, `npx tsc --noEmit -p scripts`,
`npx vitest run`, `npm run lint` and `npx vite build` all passing, and a short summary of what changed and what I need to check by hand.
```

## Decisions you need to make first

| # | Decision | Needed by | Decided |
|---|---|---|---|
| D1 | Pricing model: per seat, per organisation tier, or both; trial length | 2.3 | £10 per paid seat per month, GBP only, excluding VAT (Stripe Tax adds VAT where due). Monthly or annual (annual = 10× monthly, £100 per seat per year). Card only, through Stripe Checkout; no invoice option. Paid seats = contributor and above; viewers are free. |
| D2 | Email provider: Resend (recommended) or Supabase custom SMTP | 2.1, 4.1 | Supabase Auth custom SMTP backed by Resend (SMTP credentials). Edge functions send through the same SMTP credentials (invites in 2.1, notification email in 4.1). |
| D3 | Self-service sign-up: switch on with a free trial, or invite-only | 2.2 | Open self sign-up with a 14-day free trial, no card. On expiry the organisation becomes read-only; nothing is deleted. Cloudflare Turnstile CAPTCHA on sign-up; email confirmation required. Optional "start with sample data". |
| D4 | Board automations: hide until 4.3, or leave visible meanwhile | 1.4 | Hide until 4.3 |
| D5 | Committee pack export: PDF only, or PDF and PowerPoint | 1.2 | PDF only for now |
| D6 | Planner sync: keep (needs a Microsoft test tenant) or drop | Phase 5 | |

## Manual steps (you, not Claude Code)

- **Supabase → Authentication:** turn on leaked-password protection, and confirm that email confirmation is required.
- **Stripe** (before 2.3, test mode first): one product with two GBP prices, £10 per seat per month and £100 per seat per year, both per-unit with tax behaviour "exclusive"; note their price IDs. Turn on Stripe Tax with the UK VAT registration. Card as the only payment method. Configure the customer portal (change seats, switch monthly/annual, cancel, update card, invoices).
- **Email** (before 2.1): create the Resend account and verify `originoverthrow.com`. In Supabase → Authentication → SMTP, set host `smtp.resend.com`, port 465, user `resend`, the Resend API key as password, and the sender address. Add the same values as edge-function secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (edge functions can't use ports 25 or 587, so keep 465).
- **Turnstile** (before 2.2): create a Cloudflare Turnstile widget for `pmo.originoverthrow.com` (and the preview hosts). Put the secret key in Supabase → Authentication → Bot and Abuse Protection (CAPTCHA, Turnstile) and the site key in `VITE_TURNSTILE_SITE_KEY`. Use Cloudflare's always-pass test keys on the Supabase branch the e2e suite runs against.
- **Anthropic** (before 4.2): add `ANTHROPIC_API_KEY` to the edge-function secrets.

---

## Phase 0 — Foundations

### 0.1 Signed-in test harness
No database change. **Do this first:** it lets every later package be verified signed in, which closes the open roadmap item.

```
Work package 0.1. Read AGENTS.md and roadmap.md.
Add Playwright end-to-end tests:
- A global setup signs in a dedicated test user (E2E_EMAIL / E2E_PASSWORD from .env.local,
  gitignored) who is a member of the demo organisation, and saves storage state.
- A smoke spec visits every route in src/lib/navigation.ts plus one project, one programme
  and one benefit detail page. It fails on console errors, failed network requests or error
  boundaries, at 1280px and 375px, in light and dark.
- A Boards spec covering what roadmap.md lists as unverified: Boards list, forum details,
  meeting details, role controls and one write that is reverted afterwards.
Add "test:e2e" to package.json. Do not change application code. Plan first.
```
**Done when:** `npm run test:e2e` passes locally. Then tick the Boards verification item in `roadmap.md`.

### 0.2 Clean-up
No database change.

```
Work package 0.2. Remove dead code and stale notes:
- Delete src/services/pmo.ts, src/data/mock-data.ts, decisions-data.ts, dependencies-data.ts,
  lessons-data.ts, benefits-map-data.ts and src/components/notifications-popover.tsx. Confirm
  with grep that nothing imports them first.
- In src/data/integrations.ts keep the types and delete any mock values; fix its header comment.
- Remove the stale "Stage 4c / still prototype data" comments in
  portfolio.projects.$projectCode.tsx, portfolio.programmes.$programmeId.tsx and lib/today.ts.
- Run eslint --fix, then fix the remaining errors (e.g. prefer-const). Leave warnings unless trivial.
- Remove the vite-tsconfig-paths plugin in favour of resolve.tsconfigPaths if the build stays green.
```
**Done when:** lint shows 0 errors and the build, tests and e2e smoke all pass.

**Notes from 0.2:** `pmo.ts` and the five prototype data modules moved to `scripts/fixtures/`
rather than being deleted, because `scripts/generate-seed.ts` and `scripts/health-parity.ts` still
use them; `npx tsc --noEmit -p scripts` now typechecks the scripts. `vite-tsconfig-paths` stays:
`@lovable.dev/vite-tanstack-config` loads it internally and lists it as a peer dependency, so
there is no plugin in our `vite.config.ts` to replace with `resolve.tsconfigPaths`.

### 0.3 Migration history and database advisor fixes
Database change: yes.

```
Work package 0.3. Database housekeeping. SQL proposal first, then stop.
1. supabase_migrations.schema_migrations on the live project is missing
   20261007131500_active_portfolio_milestone_snapshots and 20261007150000_get_portfolio_overview
   (applied by hand). Compare the live definitions (pg_get_functiondef) of every function those
   files create against the files. Report any differences. Then propose the INSERTs that record
   them in the history, with no schema change.
2. Propose one new migration adding covering indexes for these unindexed foreign keys:
   business_case_benefits (category_id, organisation_id, …),
   business_case_sections (version_id, workspace_id),
   business_case_versions (business_case_id, workspace_id),
   business_case_versions (preferred_option_id, id).
Write both to docs/sql/0-3-housekeeping.sql and stop for my approval.
```

### 0.4 Positioning copy
No database change unless the default lifecycle names live in SQL.

```
Work package 0.4. Make the public and sign-up copy sector-neutral. The product is for any
organisation's PMO, not just universities.
- signup.index.tsx, signin.tsx, signup.setup.tsx: replace university wording and the
  .ac.uk placeholders; drop the "University of X" name guess, or make it a suggestion only.
- The "six-phase university IT lifecycle" text: describe the default lifecycle generically. If
  the phase names themselves are seeded in create_organisation or elsewhere in SQL, propose that
  change separately and stop.
- Scan public-home.tsx and components/marketing for the same.
Copy changes only; no restyling.
```

### 0.5 Benefits timeout
Front end, plus a database proposal. Found by the 0.1 smoke run: `v_benefit_realisation` timed
out (HTTP 500) on governance and benefits pages.

```
Work package 0.5.
(a) Front end: the notification bell must not load the full benefits set on every page.
    Narrow the query or load it only when the bell opens. No SQL.
(b) Database: diagnose v_benefit_realisation, read-only. Run EXPLAIN (ANALYZE, BUFFERS) as an
    authenticated demo-org user, check for per-row RLS or function calls (unwrapped auth.uid(),
    security helpers evaluated per row) and missing indexes. Report the evidence, then write a
    proposal to docs/sql/0-5-benefit-realisation.sql and stop for approval.
```
**Done when:** the full e2e suite passes with no `v_benefit_realisation` errors.

### 0.6 Sign-in without personal email
No database change.

```
Work package 0.6. Remove the "Demo access (temporary)" panel from /signin, so no personal email
appears on any public page. Sign-in becomes magic link only. Grep for every other use of
DEMO_EMAIL (including any demo-org allowlist) and report before changing those.
```

---

## Phase 1 — Finish what's half-built

### 1.1 Settings › Data import and export
No database change.

```
Work package 1.1. The four buttons in DataSettings (components/settings/settings-sections.tsx)
have no handlers. Wire them up through src/services only:
- Export portfolio (CSV): every non-archived project with programme, portfolio, phase, tier,
  state, health dimensions from the stored health tables, budget, forecast, start and finish.
  Use lib/csv.ts and the organisation's date and currency format.
- Export settings (JSON): the loaded AppSettings, minus member emails.
- Import lessons (CSV): reuse components/lessons-import.tsx.
- Import projects (CSV): upload → column mapping → validation preview (unknown programme,
  phase or tier, bad dates, duplicate codes) → insert valid rows through the shared write helper.
  Admin and PMO only. No updates to existing projects in this version.
Add unit tests for the project CSV validation.
```
**Notes from 1.1:** the portfolio export, the import template and the import's column guesser
share one set of headers (`services/data-transfer.ts`), so an export re-imports without
re-mapping. Exports use ISO dates and plain amounts with the currency in the header
("Budget (GBP)"). The import takes at most 500 rows and inserts them in one request (all or
nothing); codes left blank are suggested in the browser with the same rule as
`private.suggest_project_code`, so two blank codes can't clash inside one insert. Budget is not
imported: it lives in `budget_baselines`, and a second insert would break all-or-nothing. Settings
JSON is admin only and leaves out member emails, the audit log and the signed logo URL.

### 1.2 Committee pack export
No database change. Scope depends on D5.

```
Work package 1.2. The Export to PDF and Export to PowerPoint buttons in
components/committee-pack.tsx have empty handlers.
- PDF: a print stylesheet that renders the pack pages one per A4 landscape page in light theme,
  triggered with window.print(). Issued packs export from their stored snapshot, drafts from
  live data.
- PowerPoint (only if D5 says so): pptxgenjs, loaded on demand, one slide per pack page,
  charts as images.
Plan first, including how charts render for print.
```
**Notes from 1.2:** PDF only (D5); the PowerPoint button is removed. Export to PDF calls
`window.print()`: the pack renders every page into `.pack-print-root` (shown only in print,
`styles.css`), one per A4 landscape sheet, in the light theme. The pack has no chart library:
its bars and health pills are HTML, so they print as they are, with `print-color-adjust:
exact`. The print CSS applies the pack's desktop grids directly, because browsers lay a printed
page out below the `lg` breakpoint. A long section (exceptions, milestones) continues onto a
second sheet. From this package the issued snapshot (`content.version` 2) also stores the
Benefits and Decisions pages; packs issued earlier show "Not stored when this pack was issued"
on those pages. Issued packs open read-only from the issued list and export from the snapshot.

### 1.3 Persist dashboards and board saved views
Database change: yes.

```
Work package 1.3. Insights › Dashboards keeps its widgets in useState, and board-workspace.tsx
keeps saved views in useState, so both reset on refresh.
Propose tables following the tenant rules in AGENTS.md:
- dashboards (organisation_id, workspace_id, owner profile, name, layout jsonb, is_shared,
  updated_at)
- saved_views (organisation_id, workspace_id, board_key text, owner, name, config jsonb,
  is_shared, is_default, updated_at)
RLS: owners edit their own; shared ones are readable by workspace members; PMO and admin can
edit shared ones. Write SQL to docs/sql/1-3-dashboards-views.sql and stop.
After approval: services, hooks, save/rename/delete/share UI, and seeded views kept as
read-only defaults.
```
**Notes from 1.3:** migration `20261022131402_1_3_dashboards_saved_views`, approved with size caps
(layout 64 KB, config 32 KB) and a personal `dashboards.is_default`. `workspace_id` is nullable as
on `forums` (null = organisation-wide; the UI saves organisation-wide rows). Owners edit their
own; shared rows are read by the organisation and edited by PMO / admin; a shared view that is
the board default is PMO's. Boards open on my default, else the shared default, else the seeded
one; dashboards open on my default, else the built-in one. Every `BoardWorkspace` has a stable
`boardKey`. Access rules were tested on a throwaway Postgres (50 checks) before applying. The
e2e spec writes at desktop width only and deletes its own "E2E …" rows in `afterAll`.

### 1.4 Board Calendar view and automations
No database change.

```
Work package 1.4.
- The Calendar view in board-workspace.tsx is hardcoded to September 2026 and matches dates by
  string. Rebuild it on todayIso() with previous, next and today controls, a correct month
  grid (week starts Monday, from settings if available), and real date parsing.
- Automations: [D4 = hide] hide the Automations button and panel behind a feature flag until
  work package 4.3. [D4 = keep] label the panel "Preview — not active yet".
```
**Notes from 1.4:** the Calendar view (`board-workspace.tsx`, helpers in `lib/calendar.ts`) opens on
the current month in the organisation's time zone, with previous / next / Today, whole weeks
starting on Settings › Regional › First day of week, and items on their finish date (else start),
read as DD/MM/YYYY or ISO. Up to three items a day, then "+N more". Automations are hidden behind
`VITE_BOARD_AUTOMATIONS` (`lib/features.ts`, off by default) until 4.3. Found, not fixed: the
board's Sort compares date columns as DD/MM/YYYY text, so it orders by day of the month.

### 1.5 Programme notes and shared dependency layout
Database change: yes.

```
Work package 1.5.
- The programme Notes tab shows fixed placeholder text. Propose programmes.office_note text
  (with updated_by and updated_at), editable by programme managers, PMO and admins.
- The dependency map saves node layout in localStorage, so workshop layouts aren't shared.
  Propose dependency_map_layouts (organisation_id, workspace_id, scope portfolio | programme,
  scope_id, positions jsonb, updated_at), editable by PMO and admins, and readable by members.
Write SQL to docs/sql/1-5.sql and stop. After approval, wire both up through services and
remove the localStorage path.
```
**Notes from 1.5:** migration `20261022163735_1_5_notes_map_layout`. The office note is its own
table, `programme_office_notes` (one row per programme), not a column on `programmes`: the
programme's manager edits it without programme edit rights, and saving it doesn't bump
`programmes.updated_at`. Editors: the programme's manager and workspace PMO / admin; archived
programmes are read-only. `dependency_map_layouts` uses nullable `portfolio_id` / `programme_id`
(both null = the organisation's map, which is today's map); PMO / admin save it, everyone reads
it. Updates send only the granted column (`note` / `positions`); the e2e spec checks the request
bodies. A save that conflicts reloads, re-applies only this user's moved nodes and saves once
more (`mergeMovedNodes`). The old localStorage layout is offered once to PMO / admin ("Save this
layout for everyone?") when no shared layout exists, then removed; nothing writes it any more.
The e2e note test restores the text but can't delete a note row it created (no delete grant).

### 1.6 Workspace management
Database change: probably yes (for example an archived_at column).

```
Work package 1.6. Workspace management. Settings › Workspaces (admins): create, rename,
describe and archive workspaces (archive, not delete, if it holds records). Workspace
membership: add an organisation member to a workspace, set or change their workspace role,
remove them. Creating a portfolio asks which workspace when the user is PMO in more than
one; moving a portfolio between workspaces is out of scope. Check that every list, board and
report behaves correctly with two workspaces and a user who belongs to only one. Add an e2e
test with a second workspace. SQL proposal first if anything in the schema or policies needs
changing (for example an archived_at column).
```
**Notes from 1.6:** migration `20261022221830_1_6_workspaces` (`docs/sql/1-6-workspaces.sql`):
`workspaces.archived_at` / `archived_by`. An archived workspace is read-only and stays visible:
`private.workspace_role` caps every role at viewer there and `my_workspace_ids(min_role)` leaves
it out of every write check, plus explicit checks on the write paths that don't go through a role
(decision maker, forum chair, programme manager, offer recipient, request author). A trigger keeps
one active workspace per organisation; a workspace holding records can't be deleted (foreign
keys). `my_workspace_roles()` is unchanged (changing its result needs a `drop`); the UI reads
`workspaces.archived_at` (`hooks/use-workspaces.ts`). Background jobs keep computing archived
workspaces. Signed-in reads cost 1–4 ms more on live (under 20%). Settings › Workspaces: org admins
create, edit, archive, restore and delete; org admins and the workspace's admins manage members
(`write.ts` now takes composite keys for `workspace_members`). New portfolios ask for the
workspace when the user is PMO in more than one; the portfolio overview reads from the
portfolio's own workspace instead of the organisation's first. "Archived workspace" badges on the
portfolio, programme and project headers, the portfolio manager and switcher, and Boards. The e2e
spec `e2e/workspaces.e2e.ts` needs two extra logins (E2E_ADMIN_* / E2E_MEMBER_*) and
`docs/sql/1-6-e2e-workspace.sql`; without them it skips all but one test. Found, not fixed:
`supabase/migrations/20261012120035_health_current_b.sql` is corrupted (live is correct), and the
status-report snapshot trigger skips system-written submissions (NULL logic in its guard).

### 1.7 Board date sort
No database change. Found in 1.4.

```
Work package 1.7. BoardWorkspace sorts by comparing cell values as text, so date columns
(DD/MM/YYYY) sort by day of the month across all months. Sort date columns (column type
"date", and start / finish) by calendar date using lib/calendar.ts toIsoDay, with blanks and
"—" last in both directions; keep text and number sorting as they are. Unit-test the
comparator, and add an e2e check that a board sorted by a date column is in date order.
```

### 1.9 Progress chart polish
No database change. Visual polish of `components/overview/progress-chart.tsx` to match the
Milestone delivery profile (`CumulativeArea`).

**Notes from 1.9:** every series is one `d3-shape` monotone-X curve (`d3-shape` is now an
explicit dependency), drawn twice and clipped at today, so the actual and forecast halves meet
exactly; months without a value are bridged as before. Forecasts are dashed `6 5` at 0.55
opacity; series dashed already (plan, % green) keep their dash in the forecast. Each tab names a
`lead` series (`TABS` / `PROJECT_TABS`) that gets a gradient fill under its actual period.
Hovering a chip or line dims the other series. Markers less than 8px apart merge
(`lib/cluster-marks.ts`): a diamond with a count on the portfolio, "Gate 2 +1" on the project.
Chart series colours now differ by theme (light values under `:root`, dark under `.dark`), are
at least 3:1 on both panels, and keep red, amber and orange for status. The overview spec still
says "dotted" for forecasts.

---

## Phase 2 — Make it sellable

### 2.1 Member invites and management
Database change: yes, plus an edge function. D2: Resend over SMTP.

```
Work package 2.1. There is no way to add people to an organisation. Design and propose:
- organisation_invites (organisation_id, email, role app_role, token_hash, expires_at,
  invited_by, accepted_at, revoked_at)
- RPCs (SECURITY DEFINER, explicit admin check, execute revoked from public and anon):
  create_invite, revoke_invite, accept_invite(token), change_member_role, remove_member.
  Never allow removing or demoting the last admin.
- Paid seats (D1): contributor, manager, pmo and admin use a paid seat; viewer is free. Put
  the seat count in one private function (paid members plus pending paid-role invites) that
  2.3 will check in accept_invite and change_member_role (viewer → contributor or above).
  Nothing is enforced in 2.1; the Users page shows "N paid seats, M viewers".
- Edge function send-invite: emails a sign-up/sign-in link carrying the token through the
  shared SMTP secrets (SMTP_HOST, SMTP_PORT 465, SMTP_USER, SMTP_PASS, SMTP_FROM), the same
  Resend account Supabase Auth uses. No RESEND_API_KEY. Put the SMTP sending in a shared
  module (supabase/functions/_shared) so 4.1 reuses it. The token is hashed at rest.
- /auth/callback handles ?invite=token by calling accept_invite after sign-in.
- Settings › Users: Invite button (email + role), pending invites with resend and revoke,
  role change, remove.
SQL to docs/sql/2-1-invites.sql and stop. Plan the edge function separately before deploying.
```
**Note from 0.6:** the "Join the demo organisation" button is gone from the front end, but the
`public.join_demo_organisation()` RPC (and `settings.demoAdmins`) is still in the database.
Decide in 2.1 whether invites replace it, and drop it then in a new migration.

**Notes from the auth package (28/10/2026, outside the numbered plan):** magic links are gone.
Sign-in is email + password (confirmation required) or Microsoft (Supabase `azure` provider,
`/common`), on `/login`; `/signin` redirects there. Anyone can create an account;
`VITE_SELF_SIGNUP` is now a kill switch for organisation creation only (default on), and the
personal-email block is removed. Users without an organisation go to `/signup/setup`. Migration
`20261028112834_auth_email_microsoft`: Microsoft names in profiles, profile email sync, and
`organisation_subscriptions.trial_ends_at` (14 days, not enforced yet). Setup steps, account
linking (needs the Entra `email` and `xms_edov` optional claims) and the manual test checklist
are in `docs/auth-setup.md`; email templates in `supabase/templates/`.

### 2.2 Self-service sign-up
Database change: yes. D3: open sign-up, 14-day trial with no card, read-only on expiry.
Comes before 2.3: the read-only mode built here is the one 2.3 reuses for a lapsed subscription.

```
Work package 2.2. VITE_SELF_SIGNUP gates /signup; switch it on. Review the existing sign-up and
setup wizard end to end, signed in, with a fresh email. List anything broken or
university-specific, then fix it. Then propose (SQL first, then stop):
- Trial: create_organisation also creates the organisation_subscriptions row with plan
  "trial" and trial_ends_at = now() + 14 days (done in the auth package: migration
  20261028112834_auth_email_microsoft). No card is asked for.
- Read-only on expiry: one private check function (organisation is writable unless its trial
  has ended with no active subscription) used by the write policies, or a trigger, so every
  write is refused, RPCs included. Reads and exports keep working; nothing is deleted. Admins
  can still reach Settings › Subscription to subscribe. Explain how it fits the existing
  policies, and measure the cost on signed-in reads as in 1.6.
- Trial banner with days left; after expiry a read-only banner with "Subscribe" for admins
  and "Ask your admin" for others.
- Turnstile CAPTCHA: Supabase Auth's built-in CAPTCHA protection with Turnstile. Supabase then
  asks for a captchaToken on every auth call, so the widget goes on /signup, /login and
  /auth/forgot-password (useCaptcha in components/auth/captcha.tsx is the slot) and the e2e global setup must pass a token (branch with Cloudflare test keys).
- Email confirmation stays required: the setup wizard runs only after the confirmed link.
- "Start with sample data" (optional, off by default) in the setup wizard: seeds a small
  sample portfolio, programme and projects through a SECURITY DEFINER RPC, labelled as sample.
  Propose how the user clears it (archive, never delete).
```
**Also in 2.2:** Setup wizard sector choice (University / Public sector / General). University
keeps the current seed_org_defaults; the others get neutral business units, benefit categories,
forum names and tier wording, and a financial year start of April (public sector) or January
(general). SQL proposal first.

### 2.3 Stripe billing
Database change: yes, plus edge functions. D1: £10 per paid seat per month or £100 per year,
GBP, VAT added by Stripe Tax, card only. Needs the Stripe price IDs.

```
Work package 2.3. Settings › Subscription only reads organisation_subscriptions; nothing is
wired to Stripe. Propose:
- Columns on organisation_subscriptions: stripe_customer_id, stripe_subscription_id, status,
  price_id, billing_interval (month | year), seats_total, current_period_end,
  cancel_at_period_end.
- Edge functions: create-checkout-session and create-portal-session (verify JWT, admin only),
  and stripe-webhook (verify_jwt false, Stripe signature verification, idempotent on event id)
  handling checkout.session.completed and customer.subscription.created, updated and deleted.
- Checkout: subscription mode, currency GBP, the monthly or annual price (STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_ANNUAL secrets) with quantity = seats chosen, defaulting to the current paid
  seats (contributor and above; viewers free). Card only (payment_method_types ['card']),
  automatic_tax on, billing address required, business tax ID collection on. No invoice
  payment method. Prices shown in the app say "excl. VAT".
- Seat enforcement, using the 2.1 seat function: accept_invite and change_member_role refuse a
  paid role when paid seats are full; viewer invites are always allowed. Admins see a clear
  message with a link to add seats in the portal. Propose whether the trial caps seats.
- Read-only: extend the 2.2 check function so a lapsed subscription (canceled, unpaid, or
  past_due beyond a grace period you propose) makes the organisation read-only, with the 2.2
  banner. Subscribing again restores writes. Never delete data.
SQL first, then stop. Use Stripe test mode throughout.
```
**Notes from 2.3:** migration `20261029095029_2_3_stripe_billing` (`docs/sql/2-3-stripe-billing.sql`),
applied on live before the front end, plus the edge functions `create-checkout-session`,
`create-portal-session` and `stripe-webhook` (`verify_jwt = false` in `supabase/config.toml`),
copied unchanged into `supabase/functions` (ESLint ignores that folder: it is Deno code). Prices
are found by lookup key (`ormo_seat_monthly`, `ormo_seat_annual`), not price-ID secrets. Checkout
keeps the rest of a trial when more than 48 hours remain. Settings › Subscription
(`components/settings/subscription-settings.tsx`, `services/billing.ts`) shows the plan and status,
paid seats X of Y plus free viewers, and the renewal, cancellation or trial end. Subscribe shows
whenever there's no live subscription (active, trialing, past_due, unpaid, incomplete), even with
a Stripe customer. Manage billing shows whenever a customer exists ("Billing history" without a
live subscription). The demo organisation can't subscribe. Not in this package:
`private.paid_seat_count` and `private.organisation_is_writable` exist but nothing calls them yet
(seat enforcement in `accept_invite` / `change_member_role` waits for 2.1, read-only mode and its
banner for 2.2). Fix (29/10/2026): the Stripe account has Managed Payments (Stripe as merchant
of record) on by default, which refuses `payment_method_types`, `automatic_tax`,
`tax_id_collection` and `customer_update`, so every checkout failed; `create-checkout-session`
(version 8) now sends `managed_payments.enabled = false`, logs the Stripe error (type, code, param,
request id) and returns a code (`billing_misconfigured`, `billing_unavailable`, `stripe_unavailable`,
`price_not_found`, `checkout_failed`). Keep the API version pinned at `2024-06-20`: newer versions
drop `payment_method_types`, and card-only would then have to come from the dashboard's payment
method configuration (it currently also offers Klarna, Link, Revolut Pay and Amazon Pay).

---

## Phase 3 — Sprints and forecasting in the database ("option A")

The browser-only store in `services/sprints.ts` is retired. `services/forecast.ts` and its tests are the specification.

### 3.1 Schema
```
Work package 3.1. Read docs/handover/stage-1-start.md (forecast option A), services/sprints.ts
(the data model the UI expects) and services/forecast.ts with forecast.test.ts.
Propose the schema, reusing work_items rather than duplicating it:
- sprints (project, name, goal, start/end dates, state planned|active|closed, capacity)
- work_items gains sprint_id, item_type (story|task|bug|spike|milestone_task), story_points,
  done_at (set by trigger when the status category becomes done)
- sprint_commitments (scope committed at sprint start, for say/do ratio)
- sprint_daily_snapshots (scope, done, wip per project per day, written by a pg_cron job
  that runs after the health refresh)
- closure days from the existing holiday calendars, not a new table
- carry-over on close recorded in work_item_events
All tenant rules apply. SQL to docs/sql/3-1-sprints.sql and stop.
```

### 3.2 Backlog, sprints and board UI
```
Work package 3.2. Services and hooks for 3.1. Bring back SprintDeliveryWorkspace's Backlog,
Sprints and Board views reading Supabase: create, start and close a sprint (with a carry-over
dialog), drag items between backlog and sprint, and estimates. Remove the localStorage store
from sprints.ts and keep only pure helpers. NoSprintData shows only when a project has no
sprints.
```

### 3.3 Reports and forecast
```
Work package 3.3.
- Views for burn-up, burndown, velocity (last N closed sprints) and cumulative flow from
  sprint_daily_snapshots.
- Port the forecast engine to a SQL function or view (per AGENTS.md, no forecast or RAG in the
  browser). Parity test: the forecast.test.ts worked example must give the same finish period
  from the database. Add a scripts/forecast-parity.ts like health-parity.ts.
- Bring back the Reports and Forecast views and SprintForecastPanel on the project overview,
  including the what-if (velocity and scope growth inputs passed to the function).
- Fix the explanation copy: "which the team has achieved never" → "which the team has not
  yet achieved".
- Propose (don't build) how the sprint forecast should feed v_project_divergence.
SQL first, then stop.
```

---

## Phase 4 — Notifications, AI drafting, automations

### 4.1 Real notifications and email
Database change: yes, plus an edge function. Needs D2.

```
Work package 4.1. The feed in hooks/use-notifications.ts is worked out in the browser, with
read state in localStorage, and the Email and Teams switches in Settings do nothing.
Propose:
- notifications (organisation_id, workspace_id, recipient profile, kind, entity type and id,
  text, due_date, created_at, read_at), unique on (recipient, kind, entity, due_date) so a job
  can re-run safely.
- private.generate_notifications() on pg_cron (07:00 Europe/London) for the same five rules
  the hook uses today, plus triggers for immediate events (task issued to you, decision
  recorded on your project).
- Per-user preferences (channel per kind, daily digest vs immediate) on profiles or a small
  table.
- Edge function send-notification-email: daily digest through the shared SMTP module from 2.1
  (D2), respecting organisation and
  user settings, with an unsubscribe link.
Teams stays off until Phase 5. SQL first, then stop. Then switch the bell and the page to the
table.
```

### 4.2 AI highlight-report drafting
Edge function. Possibly a small database change.

```
Work package 4.2. services/highlight-draft.ts is a templated stand-in. Add an edge function
draft-highlight-report:
- Input: project_id. It loads evidence server-side as the caller (respecting RLS) via
  get_project_overview plus open risks, issues and decisions.
- It calls the Anthropic Messages API (ANTHROPIC_API_KEY; model from an ANTHROPIC_MODEL
  secret) with instructions to use only the supplied evidence and to cite an evidence id for
  every claim. It returns structured JSON for the report fields.
- It validates the response: drop any sentence whose citation isn't in the evidence.
- Fallback to the existing template if the call fails.
- The draft is saved through save_status_report_draft with source 'ai' (propose the enum value
  if needed) so it is kept for audit.
- Per-organisation daily limit.
Plan first, including the prompt text, for my review.
```

### 4.3 Board automations that run
Database change: yes. After 4.1.

```
Work package 4.3. Propose board_automations (board_key, trigger, condition jsonb, action
jsonb, enabled, owner) and a database executor (triggers or the pg_cron job) supporting the
recipes in board-workspace.tsx that map to notify, set field and create a task. Unsupported
recipes are removed from the list. Show the run history per automation. SQL first, then stop.
Re-enable the panel hidden in 1.4.
```

### 4.4 Programme highlight report
Database change: probably yes.

```
Work package 4.4. The programme Status tab only shows a health pill. Design a programme
highlight report mirroring the project status report (declared RAG per dimension, summary,
achievements, next period, decisions needed, benefits/pathway position), with roll-up evidence
from the stored programme health and child projects' latest reports. Propose the schema, or
reuse status_reports with a programme scope if cleaner. Spec first, then stop.
```

---

## Phase 5 — Microsoft Planner sync (only if D6 = keep)

**Prerequisites (you):** a Microsoft 365 test tenant; an Entra app registration (multi-tenant) with delegated Tasks.ReadWrite, Group.Read.All and User.Read, and application User.Read.All for the directory; a redirect URI on pmo.originoverthrow.com; client ID and secret stored as edge-function secrets.

```
Work package 5.1 — design only. Read services/integrations.ts, the integrations migration and
the connect flow. Write docs/design/planner-sync.md covering: the admin-consent flow; token
storage in Supabase Vault; plan discovery; a pull (Graph delta queries, polled by pg_cron
calling an edge function); a push (draining sync_outbox, with etag/If-Match conflict detection
into sync_conflicts); Graph throttling and backoff; mapping Planner buckets, percentComplete
and assignments to work_items; the directory sync to resources; and what is lost when
unlinking. Stop for review.
```
Then 5.2 (consent and tokens), 5.3 (pull), 5.4 (push and conflicts), 5.5 (directory), each as its own session following the design.

---

## Phase 6 — Before the second customer

```
Work package 6.1. Read the "Pre-second-customer task" section of
docs/handover/stage-1-start.md. Create a synthetic second organisation (scripts/seed-perf-org.sql
as a base) on a Supabase branch, not production. Measure private.refresh_health_current per
organisation and the nightly full refresh with 1, 2 and 5 tenants. Recommend one of the three
options with numbers. Stop for my decision before any change.
```
Run health-parity against a freshly seeded Supabase branch; it can't run cleanly against live data
(it compares the database's results with the reference rules applied to the fixture data, not to
the rows the database read).

Run the e2e suite against a Supabase branch, not production (the 0.1 smoke run reached about
1,000 API requests a minute on the live project, 21/10/2026).

**Capacity (found in 0.5b, 21/10/2026):** the live instance stalled for about 20 s at ~900 API
requests a minute during e2e runs (16:14 and 16:35 UTC): the whole API stopped answering and
pg_cron could not open a connection, with no lock waits or connection exhaustion. Upgrade the
compute before the first customer, and load-test on a branch. The e2e suite runs with one
worker until then.

Also before go-live: a cross-tenant RLS test suite in `supabase/tests` (user A can't read or write any of organisation B's tables, including through every RPC), and a check that the backups/PITR tier fits the plan.

---

## Progress

- [x] 0.1 Test harness  - [ ] 0.2 Clean-up  - [x] 0.3 Migration history and indexes  - [x] 0.4 Copy  - [x] 0.5 Benefits timeout  - [x] 0.6 Sign-in without personal email
- [x] 1.1 Data import/export  - [x] 1.2 Pack export  - [x] 1.3 Dashboards and views  - [x] 1.4 Calendar and automations flag  - [x] 1.5 Notes and map layout  - [x] 1.6 Workspaces  - [ ] 1.7 Board date sort  - [x] 1.9 Progress chart polish
- [ ] 2.1 Invites  - [ ] 2.2 Self sign-up  - [x] 2.3 Stripe
- [ ] 3.1 Sprint schema  - [ ] 3.2 Sprint UI  - [ ] 3.3 Reports and forecast
- [ ] 4.1 Notifications  - [ ] 4.2 AI drafting  - [ ] 4.3 Automations  - [ ] 4.4 Programme report
- [ ] 5.x Planner  - [ ] 6.1 Multi-tenant refresh and RLS suite
