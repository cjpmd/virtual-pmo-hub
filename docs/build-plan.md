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
one work package per session; finish with `npx tsc --noEmit`, `npx vitest run`, `npm run lint` and
`npx vite build` all passing, and a short summary of what changed and what I need to check by hand.
```

## Decisions you need to make first

| # | Decision | Needed by |
|---|---|---|
| D1 | Pricing model: per seat, per organisation tier, or both; trial length | 2.3 |
| D2 | Email provider: Resend (recommended) or Supabase custom SMTP | 2.1, 4.1 |
| D3 | Self-service sign-up: switch on with a free trial, or invite-only | 2.2 |
| D4 | Board automations: hide until 4.3, or leave visible meanwhile | 1.4 |
| D5 | Committee pack export: PDF only, or PDF and PowerPoint | 1.2 |
| D6 | Planner sync: keep (needs a Microsoft test tenant) or drop | Phase 5 |

## Manual steps (you, not Claude Code)

- **Supabase → Authentication:** turn on leaked-password protection, and confirm that email confirmation is required.
- **Stripe** (before 2.3): create the products and prices for D1, and note their price IDs.
- **Email** (before 2.1): create the Resend account, verify `originoverthrow.com`, and add `RESEND_API_KEY` to the Supabase edge-function secrets.
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

---

## Phase 2 — Make it sellable

### 2.1 Member invites and management
Database change: yes, plus an edge function. Needs D2.

```
Work package 2.1. There is no way to add people to an organisation. Design and propose:
- organisation_invites (organisation_id, email, role app_role, token_hash, expires_at,
  invited_by, accepted_at, revoked_at)
- RPCs (SECURITY DEFINER, explicit admin check, execute revoked from public and anon):
  create_invite, revoke_invite, accept_invite(token), change_member_role, remove_member.
  Never allow removing or demoting the last admin.
- Edge function send-invite: emails a sign-up/sign-in link carrying the token via Resend
  (RESEND_API_KEY). The token is hashed at rest.
- /auth/callback handles ?invite=token by calling accept_invite after sign-in.
- Settings › Users: Invite button (email + role), pending invites with resend and revoke,
  role change, remove.
SQL to docs/sql/2-1-invites.sql and stop. Plan the edge function separately before deploying.
```
**Note from 0.6:** the "Join the demo organisation" button is gone from the front end, but the
`public.join_demo_organisation()` RPC (and `settings.demoAdmins`) is still in the database.
Decide in 2.1 whether invites replace it, and drop it then in a new migration.

### 2.2 Self-service sign-up
Depends on D3, and on 2.3 if trials are used.

```
Work package 2.2. VITE_SELF_SIGNUP gates /signup. Review the existing sign-up and setup wizard
end to end, signed in, with a fresh email. List anything broken or university-specific, then
fix it. If D3 says trial: create_organisation also creates an organisation_subscriptions row
with plan "trial" and an end date (propose the SQL and stop). Show a trial banner with days left.
```

### 2.3 Stripe billing
Database change: yes, plus edge functions. Needs D1 and the Stripe price IDs.

```
Work package 2.3. Settings › Subscription only reads organisation_subscriptions; nothing is
wired to Stripe. Propose:
- Columns on organisation_subscriptions: stripe_customer_id, stripe_subscription_id, status,
  price_id, seats_total, current_period_end, cancel_at_period_end.
- Edge functions: create-checkout-session and create-portal-session (verify JWT, admin only),
  and stripe-webhook (verify_jwt false, Stripe signature verification, idempotent on event id)
  handling checkout.session.completed and customer.subscription.created, updated and deleted.
- Seat enforcement: accept_invite refuses when seats are full; admins see a clear message.
- When a subscription lapses: read-only mode for the organisation (writes refused by RLS or a
  check function), with a banner. Never delete data.
SQL first, then stop. Use Stripe test mode throughout.
```

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
- Edge function send-notification-email: daily digest via Resend, respecting organisation and
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
Run the e2e suite against a Supabase branch, not production (the 0.1 smoke run reached about
1,000 API requests a minute on the live project, 21/10/2026).

Also before go-live: a cross-tenant RLS test suite in `supabase/tests` (user A can't read or write any of organisation B's tables, including through every RPC), and a check that the backups/PITR tier fits the plan.

---

## Progress

- [ ] 0.1 Test harness  - [ ] 0.2 Clean-up  - [ ] 0.3 Migration history and indexes  - [ ] 0.4 Copy  - [ ] 0.5 Benefits timeout  - [x] 0.6 Sign-in without personal email
- [ ] 1.1 Data import/export  - [ ] 1.2 Pack export  - [ ] 1.3 Dashboards and views  - [ ] 1.4 Calendar and automations flag  - [ ] 1.5 Notes and map layout
- [ ] 2.1 Invites  - [ ] 2.2 Self sign-up  - [ ] 2.3 Stripe
- [ ] 3.1 Sprint schema  - [ ] 3.2 Sprint UI  - [ ] 3.3 Reports and forecast
- [ ] 4.1 Notifications  - [ ] 4.2 AI drafting  - [ ] 4.3 Automations  - [ ] 4.4 Programme report
- [ ] 5.x Planner  - [ ] 6.1 Multi-tenant refresh and RLS suite
