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

## Health reads: stored tables (performance pass, 12/10/2026)

The app reads health from `project_health_current`, `programme_health_current` and
`portfolio_health_current`, filled only from the v_* views (which stay the definition). Writes to
any of the 25 tables that feed health queue the organisation; pg_cron drains the queue every 5 s;
full refresh plus a logged mismatch check (`private.health_check_log`) at 00:05 Europe/London and
02:15 UTC. Details and numbers: `docs/sql/perf-shell-views.sql`, `docs/sql/perf-health-current-b.sql`.
- Shell views target met: every stored-health read p95 < 15 ms server-side under 20 back-to-back
  loads of both pages, no 8 s timeouts. Write latency unchanged (~3.3 ms p50).
- A write shows in stored health after 4-7 s (5 s tick + 1.8-2.3 s refresh); the person who
  wrote sees "Updating health…" until then.
- Client: reference lists deduplicated through the React Query cache (`shared-query.ts`), the
  shell loads names only, leaving a page aborts its reads (`lib/page-reads.ts`).
- The Supabase MCP tool holds any SQL containing DELETE for a confirmation this environment never
  shows; such migrations are dry-run and applied in the SQL editor, then recorded in
  `supabase_migrations.schema_migrations`.
- Compute is the smallest tier (Nano/Micro, shared burstable CPU); it amplifies contention.
- Stage 2 (`get_project_overview`) reads health from the stored tables.

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

## Stage 2 and 3: project overview (13/10/2026)

- `get_project_overview(project_id)` (migration `20261013165004`): one security-invoker call with
  the raw rows; health from `project_health_current`. ARB ~26 ms in the database.
- Overview tab, second dark band (`components/overview/project-overview-band.tsx`): SummaryStrip,
  ProgressChart and SignalsList with `scope="project"`, plus StatusBar `scope="project"`. The
  builders are the shared ones (`overview.ts` getProjectSummaryMetrics, `progress-chart.ts`
  `project` window, `overview-panels.ts` buildProjectSignals); unit tests in
  `services/project-overview.test.ts`.
- Project chart: project start to the later of baseline and forecast finish; plan = budget
  phasing ÷ phased total; spend = closed-month actuals ÷ approved budget (forecast values after
  the last closed month); milestones and tasks ÷ the whole project; capabilities and outcomes as
  one line; closed projects draw no forecast. The spend-vs-delivery signal reads the chart's own
  figures, so the gap callout, the signal and "Spent to date" agree.
- Signal "Red risk not updated in N days" uses `updated_at` (no review history yet; see the RAID
  log backlog). `?dialog=justify` opens Add justification; other signals open their tab via
  `?tab=&sub=`.
- MilestoneSlippage, MilestoneDeliveryProfile and HealthByDimension moved unchanged to
  `components/overview/` (portfolio home pixel-identical before and after).
- No budget profile: the plan line is even phasing from start to baseline finish, labelled
  "Even phasing (no budget profile)".
- Milestones next 30 days "at risk" = slip band 15+ days (material / severe) or overdue.
- Spend signal: "Spending ahead of plan while delivery is behind (spend +N pts, M milestones
  behind)", only when spend leads plan by more than 15 points at the last closed month AND fewer
  milestones are delivered than baselined by now. The chart's gap callout is unchanged.
- Page reads of health all come from the stored tables now, including `get_portfolio_overview`,
  `v_roadmap_items` and `v_capability_health` (and `v_outcome_health` / `v_benefit_readiness`
  built on it): `docs/sql/health-reads-stored.sql`. The live views stay the definition, used by
  the refresh, the nightly check, the snapshot job and the write-time captures.
- Seed data: closed projects' actuals are one lump in Sep 2026 (FSC, SDO, SFZ, UC2); FSC fix
  proposed in `docs/sql/seed-fsc-actuals-in-window.sql`.

## Stage 4: project overview, light working area (14/10/2026)

- `components/overview/project-overview-work.tsx`, in order: schedule forecast card (replaces
  the sprint forecast card), MilestoneSlippage, MilestoneDeliveryProfile + HealthByDimension,
  last highlight report + top risks and issues. The three portfolio cards take
  `scope="project"`; portfolio mode is unchanged (portfolio home pixel-identical).
- Figures from `services/project-schedule.ts` (unit-tested): the Stage 2 rules for overdue,
  hit baseline, average slip, reforecast and the forecast range (late = forecast + average slip,
  at least 7 days); top risks and issues ranked by band / severity, then days since update.
- Shared primitives gained opt-in props only: Dumbbell (dashed rows, a marker through every row,
  "Delivered" tooltip label), CumulativeArea (coloured sign-off dots, a gap bracket at today,
  whole-number ticks), ChartCard `className` accepts undefined.
- Gate checklist moved to Plan › Gates (`?tab=plan&sub=gates`); the activity timeline moved to
  the Status tab, below the report history. Overview signal: "Gate <name> in N days, X of Y
  checklist items done" when the next undelivered gate milestone is within 30 days and the
  current phase's checklist is incomplete (`GATE_SOON_DAYS`). Manual checklist ticks are still
  page state only (not saved), as before.
- FSC seed actuals moved into its life (Sep 2024–Mar 2026), applied 14/10/2026.
- Empty states: no milestones, no report, no health history ("History starts …"; closed projects
  with no snapshots say "No health history"), closed projects show final values with no forecast.
- No-milestones screenshot used a test project (ZZT) in the outsider organisation, archived after;
  app users cannot hard-delete (no DELETE grant), so delete it in the SQL editor if wanted.

## Stage 5: checks (14/10/2026)

Spec: `docs/design/project-overview-spec.md` (components, data rules, option A changes).
- Portfolio home vs pre-Stage-1 (`fc808a3`, same database): differences are the 1b assurance
  figures (report vs data gaps 8 → 21, report rings / data dots in the watchlist, the
  report-vs-data signals), the status bar as-of time (now when stored health was refreshed,
  performance pass B), the dark "DT" logo text (contrast fix) and a 7px shorter top band (a
  two-line signal title before). Everything else matches; residual pixel noise is anti-aliasing.
- Keyboard: every control reachable and operable (header ⋯ menu Enter / arrows / Escape with
  focus returned, roving tabs with arrows, sub-tabs, chart presets, legend chips with Space,
  chart crosshair with arrows, By date / By slip, Add justification, card ⋯ menus). Fixed: the
  project chart's marker lines now show a visible focus state.
- Lighthouse accessibility 100 (navigation, loaded Overview light and dark), from 93–94. Fixed:
  text-safe colours for coloured text (slippage values, hit-baseline figure, health words),
  segmented toggle label contrast, logo text, sign-in loading text, a 24px target for the
  collapsed rail section toggle. (The Search and account button names were fixed after Stage 6.)
- Load (ARB, member, through this container's proxy, ~340 ms per request): production build cold
  ~7.2 s to content, warm reload ~4.6 s, back to Overview in the app ~0.2 s (cached);
  `get_project_overview` ~26 ms in the database, 0.5–1.4 s in the browser. The wait is the app's
  ~50 boot queries (governance, benefits, dependencies, reference data) before the project record
  resolves at ~6 s; the overview call can only start after it. Options (not done): start
  `get_project_overview` by code in the route loader, and trim or defer the boot queries.
- RLS: outsider gets null from `get_project_overview` and 0 rows from the divergence and health
  views, `project_health_current`, status reports, snapshots and milestones; a justification
  (inserted in a rolled-back transaction) is visible to the member and not the outsider; anon 401.
- Advisors: known items only (pre-launch RPC review, business case FK indexes, private tables
  without policies, leaked-password protection, unused indexes).

## Stage 6 and follow-ups (14/10/2026)

- Expandable rows on "Projects by programme" (`?open=ARB,KBR`), panel in
  `components/overview/project-row-panel.tsx` with the overview components at `size="compact"`;
  same query keys as the project page. 20 expansions as the member (production build): RPC p50
  342 ms / p95 753 ms, click to rendered p50 1.03 s / p95 1.12 s. Spec: project-overview-spec.md.
- Health refresh vs readers: readers never wait (delete + insert per organisation in one
  transaction; plain SELECTs read the previous rows under MVCC; `log_lock_waits` on, no waits
  logged). The statement timeouts (09:16 and 12:22 on 14/10) and the two "job startup timeout"
  cron runs were CPU starvation on this small instance (max_connections 60, 6 worker processes):
  app boot fires ~50 queries per page load, several on live views taking 3–9 s under load.
  Queue job, last 24 h: all runs p50 2 ms / p95 9 ms; runs that refreshed p50 99 ms / p95
  1.37 s / max 2.2 s. Proposal (not applied): `docs/sql/health-refresh-materialise.sql` cuts a
  refresh from ~1.85 s to ~0.41 s with identical rows.
- Accessibility: Lighthouse 100 on the portfolio (rows closed and open) and ARB, light and dark.
  Light `--muted-foreground` is slightly darker (L 0.53); text-safe `slipTextColour` /
  `scoreTextColour` sit beside the chart colours in `services/analytics.ts`.
- Projects table: responsive widths below 1024px; columns hidden below 1024px (sponsor, PM,
  changes, 6 months) and 640px (risks · issues, change this month). No sideways page scroll at
  375px (the chart grid now has an explicit single column below xl).
- Lint: `npm run lint` checks files changed since the merge base with origin/main;
  `npm run lint:all` checks everything. GitHub Actions runs the changed-files check on pull
  requests and branch pushes (public npm install; bun.lock points at Lovable's internal
  registry). Generated `types.ts` is excluded. Lint is error-free (the `prefer-const` in
  `integrations/supabase/previewAuthStorage.ts` was fixed so the PR check passes); 51 warnings remain.

## Gate ticks and D1 decision log, database (14/10/2026)

- Audit: `docs/design/governance-decisions-audit.md`. Proposals and dry runs:
  `docs/sql/gate-checklist-ticks.sql`, `docs/sql/d1-decision-log.sql` (both applied).
  Migrations `20261014155434_decision_status_withdrawn`, `20261014160229_gate_checklist_ticks`,
  `20261014160439_d1_decision_log`.
- Gate checklist ticks persist in `gate_checklist_ticks` against the project's next open gate
  milestone (`checklistGateMilestone` in `services/gates.ts`); the lessons-reviewed tick is a
  tick of that criterion. The Overview gate signal counts them.
- Decisions:
  - Made, Superseded, Reversed and Withdrawn are read-only in the database (`decisions_05_rules`).
  - Status changes only through the RPCs `record_decision`, `defer_decision`,
    `supersede_decision`, `reverse_decision` and `withdraw_decision`.
  - History is in `decision_events`; overdue is in `v_decisions`.
  - Status reports submit through `submit_status_report`; links in `status_report_decisions`
    freeze on submit.
  - `recordDecision` / `supersedeDecision` in `services/decisions.ts` now call the RPCs.
- UI is Lovable's: `docs/design/decisions-ui-brief.md`.
- The Governance › RAIDD board still offers a status edit, which the database now refuses
  (brief §4 makes it read-only).
- The Supabase MCP `execute_sql` hangs on a statement containing DELETE; dry runs avoid it.
- 15/10/2026: Lovable built the decision log UI (reviewed against the brief). Added
  `save_status_report_draft` (migration `20261015091539`, proposal and dry run in
  `docs/sql/save-status-report-draft.sql`) and a Save draft button on the status report form.
  Client reads of the latest report (committee packs, project list last-report date, status
  trend and activity feed) now skip drafts.

## Gate phases, decision fixes, UI test data (15/10/2026)

- Gate milestones carry a phase (`20261015102227_gate_milestone_phases`; mapping and dry run in
  `docs/sql/gate-milestone-phases.sql`). 37 of 87 demo gate milestones were mapped by title;
  "Design authority approval" (34) and "GATE 1 - Ready to Deliver" (16) are unmapped until a
  user edits them (a gate now needs a phase). `v_project_gates` drives the checklist, the
  Overview gate signal and the "Gate N not passed" data-quality signal.
- 16/10: "GATE 1 - Ready to Deliver" mapped to Phase 3; "Design authority approval" is now a
  key-date milestone reported to committee (`20261016154517_gate_mapping_2`). `v_decisions`
  has `can_record` / `can_write` (`20261016154523_decision_can_record`); the drawer uses them.
- The user applied `docs/sql/runbook-decision-edit-and-draft-links.sql`
  (`20261016170000_decision_edit_and_draft_links`): the drawer edits Pending decisions and their
  links through `update_pending_decision`; draft save and submit replace a draft's links in the
  same transaction (no client-side delete). UIT round 2 run 19/10 (`docs/sql/ui-test-data.sql`).
- UI write flows run in the "UI Test" workspace of the outsider test organisation (project
  UIT), never in the demo organisation. Setup and purge runbook: `docs/sql/ui-test-data.sql`.
  The member test user is now also a viewer of that organisation (contributor on UI Test only),
  so member-scoped counts include UIT records.

## D2 forums and meetings (19/10/2026)

- Applied: `20261019160254_d2_0_milestone_type_approval`, `20261019160405_d2_forums_meetings`
  (record and dry run 26/26: `docs/sql/d2-forums-meetings.sql`). Forums are organisation-level
  (workspace_id null; the five former lookups, ids kept) or workspace forums. Organisation
  admins manage organisation-level forums, workspace PMO/admin their workspace's, chairs their
  forum's meetings; everyone in the organisation reads forums and meetings; decisions keep their
  workspace RLS. 34 Design authority approvals are now `approval` milestones of the ARB.
- App: forum names come from `forums` (`src/services/decisions.ts`); `Approval` milestone label
  added; types regenerated. Screens: `docs/design/forums-ui-brief.md` (Lovable).
- Runbook `docs/sql/runbook-d2.sql` (user): drops the forum lookup FKs/indexes, deletes the 10
  decision_forum lookups, seeds organisation-level forums for new organisations,
  update_pending_decision with option history by title and target_meeting_id. Migration version
  20261019170000. Run by the user 19/10 (Block A 7/7; Block B2; verified: 0 forum lookups,
  0 lookup FKs, new seed and update_pending_decision, no anon execute); types regenerated.
- Settings › Lists still shows "Decision forums" (lookup list); after the runbook it is empty.
  Lovable replaces it with a link to Governance › Boards (brief section 5).
- Demo gate seed (`docs/sql/seed-gate-consistency.sql`) applied 19/10 for Phase 4-6 projects
  except NRDC: 28 milestones. Remaining "Gate N not passed": ARB, CYB, EBB GATE 0; NRDC GATE 0
  and GATE 1 (kept as real-slip examples).
- UI test data (UI Test workspace) stays until D2's screens are tested.

## Pre-launch security task: review signed-in RPCs and business case FK indexes

Not now; do before launch. Don't change them until reviewed. The security advisor flags three
SECURITY DEFINER functions any signed-in user can call through `/rest/v1/rpc/`:
- `join_demo_organisation()`: can any signed-in user join the demo organisation and see its
  data? Decide whether that is intended (demo sign-up) and, if so, that the demo org holds
  nothing real; otherwise restrict or remove it.
- `create_organisation(...)`: confirm it checks the caller's rights (and any limits on how many
  organisations one user can create).
- `submit_business_case(p_version_id)`: confirm it checks the caller's permission on that
  version's workspace before changing status.
The performance advisor also lists four `business_case_*` foreign keys without covering indexes
(`business_case_benefits` category, `business_case_sections` version, `business_case_versions`
business case and preferred option); add them in a migration with the review.

## Backlog: organisation settings

- The project signal thresholds become organisation settings (today constants in
  `services/overview-panels.ts`): report due soon `REPORT_DUE_SOON_DAYS` = 7 days, and red risk
  not updated `RED_RISK_STALE_DAYS` = 14 days.

## Backlog: RAID log phase

- Add `last_reviewed_at` to risks and issues with a "Mark reviewed" action, then switch the
  project signal "Red risk not updated in N days" (Stage 3, which uses `updated_at` because there
  is no review history) to "not reviewed in N days" from `last_reviewed_at`.

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
