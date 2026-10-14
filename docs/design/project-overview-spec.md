# Project overview: build spec (as built)

Reference design: `docs/design/project-overview-design.html` (example data). Portfolio
counterpart: `docs/design/portfolio-overview-spec.md`. This file records what was built in
Stages 1 to 5 (October 2026), the data rules it relies on, and what changes when sprints
(option A) land. Where the reference and this spec disagree, this spec wins.

## 1. Principles

- **One call, raw rows.** `get_project_overview(project_id)` (security invoker, RLS decides)
  returns the project's raw rows in the same shapes as `get_portfolio_overview` where they
  overlap. The browser composes and formats; it never works out a RAG.
- **RAG from the database.** Health and divergence come from `project_health_current` (the
  stored copy of `v_project_health`, `v_project_delivery_health` and `v_project_divergence`,
  refreshed within about 5 seconds of a write). Slip days and bands come from `v_milestones`.
- **Shared components with `scope`.** SummaryStrip, ProgressChart, SignalsList, StatusBar,
  MilestoneSlippage, MilestoneDeliveryProfile and HealthByDimension take `scope="project"`;
  portfolio mode is unchanged. Shared chart primitives only gained opt-in props.
- **Shared builders.** `services/overview.ts`, `overview-panels.ts`, `progress-chart.ts` and
  `project-schedule.ts` hold every project-scope rule, unit-tested in
  `project-overview.test.ts` and `project-schedule.test.ts`.
- **Tokens, both themes, no colour-only meaning.** The top band is always dark; the working
  area follows the theme. Every RAG carries a word, a count or a shape (ring = declared,
  dot = evidenced). Coloured text uses the text-safe `--health-*-foreground` tokens.

## 2. Page layout

1. **Header** (dark band, Stage 1): breadcrumb, chips, actions (Business case, Issue task, ⋯
   menu), lifecycle stepper, people and dates, health bar (declared ring vs evidenced dot,
   divergence wording, Add justification), tabs. `?dialog=justify` opens Add justification.
2. **Second dark band** (Overview only, `components/overview/project-overview-band.tsx`):
   SummaryStrip, ProgressChart and SignalsList.
3. **Light working area** (`project-overview-work.tsx`), in order: Schedule forecast card;
   MilestoneSlippage (full width); MilestoneDeliveryProfile + HealthByDimension (2:1); Last
   highlight report + Top risks and issues (2:1).
4. **Status bar** (sticky): live dot, "Data last changed …", "Financials closed to <month>,
   <month> open". No project count, no sprint item.

Moved off the Overview (decision 14/10): the gate checklist is Plan › Gates
(`?tab=plan&sub=gates`); the activity timeline is on Status, below the report history.

## 3. Components, project scope

### SummaryStrip (8 cells)
| Cell | Value | Change / detail |
|---|---|---|
| Budget | approved budget | m/m from the previous month-end in `financial_forecast_history` |
| Forecast | EAC | m/m as above |
| Variance | (EAC − budget) ÷ budget | £ change m/m; "£x over / under" |
| Spent to date | closed-month actuals (`v_project_financials.actual_to_date`) | "% of budget" |
| Milestones delivered | delivered of all | m/m count; "N% on time" |
| Milestones, next 30 days | due within 30 days, not delivered | "N at risk" (see §4) |
| Red risks | open risks scoring ≥ the top band | m/m from open/close dates |
| Forecast finish | `forecast_finish_date` | days after / before baseline finish |

With no month-end yet the money cells read "No previous month" (until the first close).

### ProgressChart
- Presets: Overlay (plan, spend, milestones, tasks; capabilities & outcomes off), Spend
  (plan, spend), Delivery (plan, milestones, tasks), Benefits (plan, capabilities & outcomes).
  Legend chips toggle each line (`aria-pressed`). No range switch.
- Window: project start month to the later of baseline finish and forecast finish.
- Every line is % of its own whole-project plan: plan = budget phasing ÷ phased total (or
  **even phasing from start to baseline finish when there is no budget profile**, labelled
  "Even phasing (no budget profile)"); spend = closed-month actuals ÷ approved budget, with
  forecast values added after the last closed month; milestones delivered ÷ all; tasks done ÷
  all with a due date (forecast from the run rate); capabilities and outcomes complete ÷ linked
  (one line, hidden when there are none).
- Markers: labelled dotted lines for Start, gates and report-to-committee milestones, Baseline
  finish and Forecast finish (not for closed projects); focusable, with a visible focus state.
- Today line, shaded forecast region, gap callout when spend leads milestones by more than 15
  points, crosshair with arrow keys, visually hidden data table.
- Closed projects: no forecast values, lines or finish marker; chips show the last month.

### SignalsList ("Assurance signals")
Rule-generated, serious first, at most five, each with an action that opens a tab or dialog:

| Signal | Rule | Opens |
|---|---|---|
| Report says X, evidence says Y | divergent and not justified; wording by kind (§4) | Add justification |
| Justified: … | divergent and justified | Status |
| Status report overdue by N days / due in N days | overdue, or due within 7 days | Status |
| Red risk not updated in N days | open risk in the top band, `updated_at` 14+ days ago | RAID › Risks |
| Spending ahead of plan while delivery is behind (spend +N pts, M milestones behind) | spend − plan at the last closed month > 15 points AND delivered < baselined by now | Financials |
| Gate <name> in N days, X of Y checklist items done | next undelivered gate milestone within 30 days and the current phase's checklist incomplete | Plan › Gates |
| Forecast finish N days beyond baseline | `finish_vs_baseline_days` > 0; "within / beyond tolerance" from `finish_slip_health` | Plan › Milestones |
| N milestones baselined after project finish | `milestones_after_baseline_finish` > 0 (data quality) | Plan › Milestones |

No velocity signals. Thresholds (7, 14, 15, 30 days) are constants in
`services/overview-panels.ts`; they become organisation settings (handover backlog).

### Schedule forecast card
Forecast finish (days late / early / on baseline), slip vs baseline finish against tolerance,
hit-baseline %, overdue count, forecast basis ("Based on milestone forecasts", or "Based on the
declared finish date, which is later than the milestone forecasts"). Tags: schedule RAG and,
when late, "Finish within / beyond tolerance". No velocity figures.

### MilestoneSlippage
All milestones, By date / By slip. Hollow baseline dot, filled actual or forecast dot, line
coloured by slip band (green on time), solid when delivered and dashed when not, today marker
through every row (not for closed projects). Subtitle: phase name, or the type when the
milestone has no phase, then "Delivered dd Mon" / "Forecast dd Mon" / "Past baseline, forecast
dd Mon" / "Overdue, forecast dd Mon". Footer: due next 30 days, overdue, reforecast, hit
baseline. Empty: "No milestones yet" + Add milestone.

### MilestoneDeliveryProfile
Monthly cumulative counts over the project window: dashed baselined plan, solid signed-off line
with fill, forecast range band after today (early = forecast dates, late = forecast + the
project's average slip, at least 7 days), a dot in each month with sign-offs (green on time,
amber if any was late), "N behind plan" bracket at today. Footer sentence: signed off vs
baselined by now, total, on-time count, average slip, overdue, forecast range vs the latest
baseline. Closed projects: no band.

### HealthByDimension
2×3 small multiples (Schedule, Financial, Effort, Issues and risks, Benefits, Overall), y = RAG
level at each month-end (last snapshot per month from the project's start), current status top
right, a ring where the report current at that month-end declared better than the evidence,
caption "Declared better in X of N months" / "Report matched evidence", footnote that Overall
is the worst of the five. Months from seed snapshots (`source = 'seed'`) are drawn lighter with
"Earlier months are sample data". Empty: "History starts dd/mm/yyyy", or "No health history"
for a closed project with no snapshots.

### Last highlight report
Reporting date (the period), author, submitted date, next due; tags "Declared X" and
"Evidenced Y at the time"; Summary (`comments`), Done this period (`accomplished`), Planned
next period (`planned`), Decisions needed; table of declared vs evidence at submission for each
dimension including benefits and overall; "Open full report". Empty: "No highlight report yet"
+ Start report.

### Top risks and issues
Three, ranked by severity (a risk's band from the organisation's risk bands: top band red, next
amber, rest green; an issue's severity: high red, medium amber, low green), then score, then
longest since last updated. Each shows ref, title, band or severity word, "updated N days ago",
kind. "Open RAID log".

### Portfolio home: expandable project rows (Stage 6)
Each row of "Projects by programme" has a chevron button (`aria-expanded`, `aria-controls`);
clicking anywhere on the row except the project name toggles it, the name opens the project.
Open rows are in the URL (`?open=ARB,ACA`). The first expand calls `get_project_overview` with
the project page's query key (and the project record with its key), so opening the project
afterwards reuses the cache. The panel (`components/overview/project-row-panel.tsx`) uses the
same components at `size="compact"`:
- **Summary**: tier, priority and tasks chips; compact lifecycle ("Phase N of M, name" over a
  segmented bar); PM, project officer, sponsor; start, baseline and forecast finish with days
  late coloured from `finish_slip_health`; report ring vs evidence dot with the divergence wording.
- **MilestoneSlippage** compact: the next 5 open milestones by baseline date plus any other open
  milestone that has slipped; no sort toggle, no footer.
- **HealthByDimension** compact: the six plots without captions or footnote.
- **Last highlight report** compact: date, author, declared / evidenced tags, summary cut at three
  lines, decisions needed when recorded. **Top risks and issues** as on the project page.
- "Open project" goes to the Overview. Three columns from 1024px, stacked below; below 640px only
  the summary and the highlight report.

## 4. Data rules

- **Overdue**: not delivered and the forecast date has passed. `past_baseline` (not delivered,
  baseline passed) is display only ("Past baseline, forecast dd Mon").
- **Slip days**: actual date if delivered, else forecast, minus baseline (`v_milestones`).
- **Slip bands**: on time (≤ 0), minor (1–14), material (15–30), severe (> 30).
- **At risk** (next 30 days): material or severe band, plus anything overdue.
- **Hit baseline %**: delivered on time ÷ delivered. **Average slip**: mean slip over delivered,
  on time counting as 0. **Reforecast**: not delivered and forecast ≠ baseline.
- **Forecast finish**: the later of the milestone forecast finish and the declared finish;
  `forecast_basis` = 'declared' when the declared finish is later (or there are no milestones),
  else 'milestones'.
- **Tolerance** (`finish_slip_health`, computed once in `v_project_delivery_health`): green when
  the forecast finish is on or before the baseline finish; red when the slip exceeds the
  organisation's `scheduleSlipPercent` of the baseline duration (start to baseline finish);
  amber otherwise. The schedule RAG reads it.
- **Divergence**: the latest submitted report's declared overall is better than the evidenced
  overall. Kinds: `optimistic_at_submission` (the report was already better than the evidence
  frozen at submission: "Report declared better than the evidence (N days)") and
  `evidence_moved` (it matched then, the evidence has worsened since: "Evidence has worsened
  since the last report (N days). Next report should reflect this."). **Alert** after
  `divergenceAlertDays` (default 14) or when the last two reports were both better.
- **Justification lifecycle**: one or more per submitted report, inserted by members with edit
  rights while the project is divergent; the database records the report, author, time and the
  declared / evidenced / days at the time. Edit and delete are workspace-admin only. It holds
  (no alert, risk score 15 instead of 40) until the evidence worsens past what was justified or
  a new report is submitted, which needs its own justification.
- **First report due**: next due = latest submitted reporting date + cadence (weekly,
  fortnightly, monthly; default monthly); with no report yet, one cadence after the start date.
  Overdue only for active and on-hold projects.
- **Red risk**: score at or above the top band's `minScore` (15 when unset).
- **Seed data**: health snapshots with `source = 'seed'` and status reports with
  `source = 'seed'` are sample history (purge by `source`). Snapshots before the project's start
  month are left out. Seed actuals for closed projects were booked in Sep 2026, after closure;
  FSC was moved into its life (Sep 2024 to Mar 2026), SDO, SFZ and UC2 still have the lump.

## 5. When sprints land (option A)

- **Forecast**: `forecast_basis` gains 'sprints'; the forecast engine moves into a Supabase view,
  and the Schedule forecast card becomes the Evidence-based forecast card of the reference (gap to
  plan, recovery date, forecast finish, required velocity) with the velocity explanation (fix
  the "achieved never" copy in `forecast.ts`).
- **Summary strip**: a "Points done" cell (vs plan) beside or instead of Milestones delivered.
- **Chart**: a "Points done" series in Overlay and Delivery, sprint boundaries as markers.
- **Signals**: velocity signals ("Recovery needs N points a sprint", best and average sprint).
- **Status bar**: "Sprint N of M in progress".
- **Delivery tab**: sprint views replace "No sprint data yet".
- `get_project_overview` gains a sprints section; `services/sprints.ts` stops being unused.

## 6. Checks (Stage 5, 14/10/2026)

Lighthouse accessibility 100 (navigation, and the loaded Overview in light and dark); keyboard
pass; RLS (outsider gets null / no rows; anon 401); advisors clean apart from known items.
Results and timings: handover note.
