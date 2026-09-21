# Full Projects portfolio workspace

## What the review found
The current Projects page already lists all portfolio projects in the shared monday-style workspace, with alternate views, grouping, sorting, inline editing, bulk actions, saved-view controls, item panels and automations. The new brief adds substantial portfolio-specific functionality that is not yet present: the full governance column set, seven meaningful seeded views, KPI summaries, CSV export and the New project wizard.

## Build

### 1. Expand the project portfolio data presented
- Extend the project board adapter to expose programme name, project state, priority, finish date, budget, actual, forecast and calculated variance.
- Add separate overall, schedule, financial, effort, and issue-health columns using the existing health services and consistent RAG labels.
- Add active risk and issue counts, Planner/native task-source badge, collection-name tags, next incomplete milestone, and latest status-report date.
- Highlight the last-report date in red when it is missing or more than 14 days before 21/09/2026.
- Correct overall project health to use the worst of schedule, financial, effort, and issue health, while continuing to honour reasoned manual overrides.

### 2. Add portfolio-specific saved views
Seed the Projects board with:
- **All active** — default, filtered to Active projects.
- **By programme** — active projects grouped by programme.
- **By project manager** — active projects grouped by manager.
- **Red and amber** — projects whose overall health is At Risk or Off Track.
- **Closed** — closed projects only.
- **Status reports overdue** — missing or older than 14 days.
- **Digital Committee** — projects tagged with that collection.

Extend the shared saved-view model to support structured filters, pre-seeded named views, grouping, sorting and visible columns without weakening user-created views or the default-view control. Keep all view state mock-only in the browser.

### 3. Add portfolio KPIs and page actions
- Add four KPI cards above the board: project counts by state, total budget versus forecast, percentage on track, and outstanding status reports.
- Add a primary **New project** action and a secondary **Export CSV** action in the page header.
- Make CSV export generate and download the current project data as a realistic local CSV file; no server or integration is added.

### 4. Build the New project wizard
Open a wide side panel with a clear step indicator and Back/Next controls:
1. **Basics** — project name, programme, project manager and sponsor.
2. **Business case** — concise business-case summary.
3. **Plan** — start/finish dates and budget with UK formatting and validation.
4. **Tasks** — choose Native, connect an existing Planner plan from a seeded mock list, or create a new mock Planner plan; choose Basic/Premium where relevant.
5. **Collections** — optional multi-select from existing collections, followed by a review step.

Submitting adds the new project to the on-screen board and refreshes the KPI totals for the demo session. It remains realistic mock behaviour with no authentication, backend or live Planner connection.

### 5. Presentation and verification
- Keep the existing calm Virtual PMO styling, compact portfolio density, UK English, DD/MM/YYYY dates, £ currency and light/dark mode.
- Verify every seeded view returns the intended projects and grouping, all requested columns render correctly, report-age highlighting uses the fixed prototype date, and KPI totals match the displayed rows.
- Verify wizard validation, all Planner branches, collection selection, local project creation, CSV download, project links, alternate board views, desktop/mobile layouts and browser console health.

## Technical details
- Continue sourcing all domain data through service functions; add derived project-list helpers there rather than calculating business rules in the page.
- Reuse the existing Project, Programme, Collection, Milestone and StatusReport mock entities; add only enough varied mock report/state data to make the seeded views credible.
- Extend `BoardWorkspace` through optional typed seeded-view/filter configuration so existing task, risk, issue and request boards retain their current behaviour.
