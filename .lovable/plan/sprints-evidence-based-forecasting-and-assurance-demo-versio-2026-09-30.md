# Sprints, evidence-based forecasting and assurance (demo version)

The whole brief, built as clickable demo screens with sample data kept in the browser. There's no database, no real sign-in and no real AI call. Everything goes through the existing service layer, so a real backend can replace it later without changing the screens. Some parts of the brief need a database (row-level security tests, nightly jobs, forecasting in Postgres). Those are simulated in TypeScript and named as open items.

## What exists already and gets extended
- Project Tasks (Grid, Board, Timeline, subtasks, sprint labels). This becomes the single list of work items: the backlog, the sprint board and the task views all read the same data.
- Milestones, RAID, status reports (declared RAG), health engine, Benefits module (register, profile, map, realisation, value dashboard), committee packs.
- The Benefits module already covers most of Phase 5. It gets extended, not rebuilt.

## Phase 1: Sprint foundations
- Project settings: delivery approach (agile, waterfall or hybrid), work unit (points, tasks or hours), sprint length, baseline scope, start and end dates, RAG tolerance.
- Tasks gain a type, workstream, estimate, status (the project's own statuses, each in a To do, In progress or Done category), sprint, milestone and backlog rank. Default estimates apply when an item has none.
- New project tabs:
  - **Backlog:** drag to rank, edit estimates in place, filter by type and workstream, and a totals bar.
  - **Sprints:** plan a sprint by dragging items in, see a capacity bar, start it (only one active sprint at a time), and close it with a carry-over dialog that records committed, completed and added units.
  - **Board:** Kanban of the active sprint, with a filter by person.
- Waterfall projects: the backlog shows as a list grouped by milestone or workstream.
- Every change is logged (audit trail), and the date an item was done is set automatically.
- Admin: non-working periods, such as Christmas closure, in Settings.

## Phase 2: Snapshots and burn charts
- Daily snapshots are generated from the event history, including back-filled history for the demo.
- Charts: sprint burndown (skips closure days, marks scope added mid-sprint), project burn-up (scope, baseline and done), velocity with a 3-sprint average, and cumulative flow with a flag for items blocked more than 10 working days.
- Every chart has a table toggle and a CSV export.
- Recovery plans: target velocity by date range.

## Phase 3: Forecast engine
- One shared forecast function returns: gap, recovery date, forecast finish, required velocity, plausibility, converging yes or no, and delivery status. Velocity can be based on the last sprint, a 3-sprint average, best, worst or the plan.
- A seeded demo project matches the brief's worked example (480 units, 6 closed sprints). Automated tests check the brief's expected numbers: gap 54, rolling average 38, recovery at sprint 9 with v=60, not converging with v=5, and so on.
- On screen:
  - Burn-up forecast overlay with a best/worst cone, a recovery marker and a basis selector.
  - Forecast panel on the project dashboard, with a plain-English sentence.
  - What-if sliders for velocity and scope growth.
  - Sprint dashboard with a "will this sprint land?" verdict.
- Every forecast number has a "How is this calculated?" popover.

## Phase 4: Assurance
- Declared and Evidenced RAG shown side by side on portfolio, programme and project views. RAG always has a text label as well as a colour.
- Divergence ("watermelon") alert: when declared RAG is better than evidenced for 2 reports or 14+ days, the PM must add a justification.
- Portfolio Assurance page:
  - Table sorted by assurance risk.
  - Counts by delivery status.
  - 90-day forecast slip trend.
  - Forecast accuracy on closed projects.
  - "Stale evidence" (grey) after 14 days with no changes.

## Phase 5: Benefits additions
- An at-risk flag when the latest measurement is more than 10% below plan.
- Reminders in the notifications bell when a measurement is due.
- Closed projects stay visible until realisation ends.
- Portfolio roll-up with disbenefits netted off.
- Output nodes linked to projects on the benefits map.

## Phase 6: Highlight report drafting
- "Draft highlight report" builds a draft in the existing status report panel from templates, using only real project data. Each claim gets a reference, for example "(forecast: finish 14 Mar, 21 days late)".
- The draft is kept alongside the final text for audit.
- An exception report version appears when the evidenced RAG turns Red.

## Delivery order
All six phases in one go, in order, with a roadmap checklist. I'll check each phase in the preview before starting the next.

## Technical details
- New `src/data/sprint-types.ts`, `sprint-data.ts`. Work item fields are added as optional fields on `Task`.
- `src/services/sprints.ts`, `snapshots.ts`, `forecast.ts` (pure functions, unit-tested with vitest against the brief's worked example), `assurance.ts`.
- Browser-local store, following the entity-store pattern.
- Components: backlog, sprint planner, sprint board, burn charts, forecast panel, assurance workspace, using existing ChartCard/MetricCard/BoardWorkspace.
- New route `/delivery/assurance`, plus new project tabs.

## Open items (need a real backend, not built)
Own Supabase connection, org-level security and its test script, nightly snapshot job, Postgres forecast functions, Microsoft sign-in, the Claude API for drafting.
