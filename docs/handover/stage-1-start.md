# Handover: project overview, start of Stage 1 (header)

Date: 08/10/2026. Brief: project page tidied header + Overview tab (`docs/design/project-overview-design.html`).
Supabase project: VirtualPMO (`xvdlmtkzfmbcegkmampz`).

## Branch and commits

Branch `claude/dazzling-volta-nehk5x`, from `fc808a3` on `main`. No pull request yet.

| Commit | What |
|---|---|
| `31827a9`, `87f9824` | Stage 1a SQL proposals (docs/sql) |
| `9d1ae73` | Stage 1a applied: project overview schema; seed milestone fix; types |
| `0ea16f4` | Stage 1b divergence view proposal |
| `ce22518` | Stage 1b: `v_project_divergence` applied; justifications proposal |
| `5b4b2c6` | Seed status reports proposal |
| `cc70f5f` | Stage 1b: justifications table and `divergence_kind` applied; types |
| `c5b9b95` | Stage 1b code: assurance from the database, not `sprints.ts` |
| (this commit) | `status_reports.source` migration, seed reports applied, this note |

## Migrations applied (in `supabase/migrations/`)

- `20261008191432_project_overview_schema`: `milestones.phase_id` (no backfill: phases have no
  dates); `v_milestones.slip_days` uses the actual date once delivered, plus `past_baseline`
  (display only) and `slip_band`; schedule health from milestone slip (every red before any
  amber; forecast finish uses `scheduleSlipPercent`); `v_project_health.forecast_finish_date`
  from milestones (`forecast_basis`); `status_reports` status draft|submitted, `submitted_at`,
  `decisions_needed`, `declared_benefit`, evidence captured and snapshot taken on submission;
  `projects.reporting_cadence`; `health_snapshots.source` (seed|job).
- `20261008192414_project_divergence`: `v_project_divergence` (declared vs evidenced, divergence
  days from snapshots and report history, alert threshold `divergenceAlertDays` default 14,
  report due/overdue, finish slip, risk score).
- `20261008193329_divergence_justifications`: insert-only justifications per submitted report
  (admins may edit/delete; "at the time" values captured by the database); view gains `justified`.
- `20261008193433_divergence_kind`: `optimistic_at_submission` vs `evidence_moved`.
- `20261008194610_status_reports_source`: `status_reports.source` (seed|user).

Data changes, not migrations (records in `docs/sql/`):
- `seed-milestones-within-baseline.sql`: 78 seed milestones on 17 projects rescaled inside their
  baseline finish.
- `seed-status-reports.sql`: 26 seed reports on 24 open projects (`source = 'seed'`).
- Seed purge, when wanted: `health_snapshots` and `status_reports` where `source = 'seed'`.

State after seeding (from the views): 13 divergent; 3 alerts (ACA, CYB, VDI, all
`optimistic_at_submission`, 33 days); 3 reports overdue (CCM, STO, WPCMP). ARB: declared amber,
evidenced red, `evidence_moved`, 0 days (its 11/09 report matched the evidence then; Stage 1a's
schedule rule turned it red today).

The Supabase MCP `apply_migration` tool hangs on statements it treats as destructive (for example
`drop trigger`) waiting for a confirmation this environment never shows. Use non-destructive
forms (`create or replace trigger`) or split the statement out.

## Decisions taken (summary)

- Forecast: option B for this build (milestone-based). Option A (sprints and the forecast engine
  in Supabase as a view) is the next phase; `sprints.ts` is kept but unused until then, and the
  Delivery tab and forecast card show "No sprint data yet".
  For the option A phase: fix the `forecast.ts` explanation copy ("which the team has achieved
  never" should read naturally, e.g. "which the team has not yet achieved"). Left as is in
  Stage 1 because only the sprint panels render it and they are switched off.
- Overdue = not delivered and forecast date passed (`v_milestones.status = 'overdue'`).
  "Past baseline, forecast dd Mon" for reforecast milestones past their baseline.
- Overview data: raw rows from `get_project_overview` plus the shared TypeScript builders with
  `scope="project"`; every RAG decision from the `v_*` views.
- Highlight report: `accomplished` / `planned` reused; `comments` is the summary.
- Every schema change: SQL in `docs/sql/` first, applied only after approval.

## Open decisions / known gaps

- Data-quality signal "N milestones baselined after project finish": the count is in
  `v_project_delivery_health.milestones_after_baseline_finish`; the signal rule still has to be
  added to the project and portfolio signal builders (Stage 3).
- Status report form: capture `decisions_needed`, `declared_benefit` and drafts (status) in the
  UI; not done yet.
- Portfolio home: two prettier findings and two hook-dependency warnings in
  `portfolio.index.tsx` and the project page predate this work; left alone.
- The pre-1b vs post-1b assurance figures were compared headlessly instead of with screenshots
  (agreed); the "before" screens only showed generated sprint data.

## Pre-second-customer task: health refresh cost grows with every tenant

Not now; do before a second organisation goes live. The health views (`v_project_health`,
`v_project_divergence`, `v_programme_health`, `v_portfolio_health`) compute every project they
can see and filter afterwards: their CTEs are `materialized`, so an `organisation_id` filter
never reaches the inner tables. Signed-in users only see their own workspaces (RLS), but the
health refresh (`private.refresh_health_current`, fix B in `docs/sql/perf-health-current-b.sql`)
runs as `postgres`, which bypasses RLS, so each organisation's refresh computes every tenant.
Today that is ~0.45 s for 39 projects. With N organisations of similar size, each refresh costs
roughly N times that, and a full nightly refresh (one per organisation) roughly N x N times.

Options:
- **Organisation-scoped functions** (`private.project_health_rows(p_org)` etc. holding the view
  bodies with the filter at the base CTE; the views become `select * from` the function for the
  signed-in user's organisations). Cost per refresh then scales with that organisation only.
  Trade-off: the rules move from view text into function text (still one definition, but every
  view migration becomes a function migration), and functions are opaque to the planner, so the
  views lose predicate pushdown entirely for ad-hoc queries.
- **Remove `materialized` from the CTEs** so the planner can push the organisation filter
  down. Keeps the views as the definition. Trade-off: the CTEs were materialized on purpose
  (`health_views_single_pass`, docs/perf.md) because inlining made Postgres compute each
  dimension several times per project; un-materializing risks bringing back the 8 s plans.
  Would need the per-CTE timing work redone, and the plan can change as data grows.
- **Refresh per tenant with `set local role` / claims of an org member** instead of `postgres`,
  so RLS limits the work to that organisation. Cheapest change; relies on there always being a
  member to impersonate, and RLS overhead comes back into every refresh.
- Measure first with a synthetic second tenant (500-project org exists locally for this).

## Rule: tests that write data

Any test that writes data runs in a transaction that is rolled back, or on a dedicated test
project created for it and deleted afterwards. Never write test records to real or demo projects.

## Test accounts: recreate credentials in the next session

Two test users exist in Supabase auth:
- `vpmo-test-member@example.com`: non-admin (contributor) member of the demo organisation.
- `vpmo-test-outsider@example.com`: admin of its own "VPMO Test Outsider Org", no access to the
  demo organisation.

Their passwords were stored only in `.env.test.local` in the previous session's container (never
committed). In the next session, set new passwords (bcrypt hashes written to `auth.users`) and
store them in a local `.env.test.local` listed in `.git/info/exclude`. Never commit or print them.

## Environment notes

- This container's network policy blocked `xvdlmtkzfmbcegkmampz.supabase.co`, so the app could not
  be run against live data here; the allow-list change should apply to new sessions.
- `bun install` can't reach Lovable's private registry; for local checks use
  `npm install --no-package-lock --registry https://registry.npmjs.org` (don't commit lockfile
  changes). Checks: `npx tsc --noEmit`, `bun test`, `npx eslint <files>`.

## Next: Stage 1, persistent header

Per the brief: breadcrumb, title/code/star, chips (Tier, Priority, task source), actions (Edit,
Business case, Issue task, ⋯ with Archive and Close), lifecycle stepper with phase names,
people/dates grid (baseline finish; forecast finish from `v_project_health`), one health bar
(declared ring vs evidenced dot using `v_project_divergence`, divergence wording by kind,
"Add justification" inline), grouped tabs with `?tab=&sub=` and old-name / `?task=` mapping.
Stop with screenshots (desktop, 375px, dark) of ARB and one green project.
