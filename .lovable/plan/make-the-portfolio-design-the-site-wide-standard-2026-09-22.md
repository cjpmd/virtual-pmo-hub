# Make the Portfolio design the site-wide standard

## Goal
Use the Portfolio overview as the visual source of truth across Virtual PMO while preserving every existing feature, workflow and specialist view.

The Portfolio’s established language becomes canonical: calm spacing, compact page hierarchy, four-up headline metrics with context and trends, consistent chart cards, restrained semantic colours, standard legends/tooltips, uniform tables, and the same light/dark treatment.

## What the audit found
- The Portfolio page already uses the newer `MetricCard`, `MetricRow`, `ChartCard`, chart primitives and shared visualisation palette.
- Much of the rest of the site still uses the older `KpiCard`, locally defined panel/card wrappers, raw Recharts defaults and one-off table markup.
- This creates visible differences in card density, heading sizes, chart grids and colours, legends, tooltips, spacing, corner radii, table headers and empty states.
- Shared navigation, breadcrumbs, buttons, RAG pills and the monday-style `BoardWorkspace` are already broadly reusable and should be refined rather than replaced.

## Implementation plan

### 1. Codify the Portfolio visual system
- Promote the Portfolio’s page rhythm, section headings, metric cards, chart shells, legends, tooltips, axes, grids, table styling and empty/loading states into shared components.
- Consolidate repeated panel and section shells into a small set of shared patterns for dashboards, detail pages and dense working views.
- Keep all colours semantic and align chart series, RAG states, borders, surfaces and dark mode to the existing visualisation tokens.
- Retain compact, purposeful interaction patterns; specialist timelines, maps, heat maps and editors keep their functionality.

### 2. Standardise page structure and headline metrics
- Align list, dashboard and detail pages to the Portfolio hierarchy: breadcrumbs, page header, actions, headline metrics, primary analysis, supporting detail and register/table.
- Replace older KPI cards with the Portfolio metric pattern, including meaningful context and trends where historical mock data exists; avoid invented trends where it does not.
- Normalise page spacing, grid gaps, section titles, descriptions, action placement and responsive stacking.
- Align project, programme and benefit profile headers with the same typography, status placement and fact presentation while retaining their lifecycle steppers and tabs.

### 3. Standardise charts and data visualisation
- Move direct Recharts implementations onto the shared `ChartCard` and chart-theme conventions.
- Apply consistent chart titles, explanatory subtitles, information tooltips, legends, axis styling, grid lines, spacing, status colours and number/date/currency formatting.
- Add the same expand, PNG and CSV options where the underlying chart data supports them.
- Use the Portfolio’s chart primitives where they fit; retain specialised charts only when they communicate a distinct planning concept better.
- Bring status reports, milestones, tasks, resources, benefits and dashboard-builder widgets into the same visual system.

### 4. Standardise tables, registers and working surfaces
- Keep `BoardWorkspace` as the standard for editable registers and align its toolbar, view selector, filters, grouped rows, summaries, headers, sticky columns, side panels and empty states with the Portfolio table.
- Apply the same table treatment to read-only tables that should not become boards, including consistent density, headers, numeric alignment, totals and status formatting.
- Align resource heat maps, Gantts, roadmaps, dependency views and scenario tables to the same borders, surfaces, labels, controls and legends without removing their specialist interactions.

### 5. Apply the system across every route family
- **Portfolio:** Projects, Programmes, Collections, Requests and Roadmap.
- **Delivery:** Tasks, Milestones and Dependencies.
- **Resources:** Dashboard, Assignments, Allocation and Scenarios.
- **Benefits:** Value Dashboard, Register, Map, Realisation and Benefit Profile.
- **Governance:** RAIDD, Changes, Decisions, Committee Packs, Lessons and Improvement Actions.
- **Home and Insights:** My Work, My Timeline, Issued Tasks, Approvals, Notifications, Dashboards and Reports.
- **Detail workspaces:** Project and Programme tabs, panels, timelines and summaries.
- **Settings:** Preserve its denser configuration layout, but align cards, headings, controls, badges and feedback states with the Portfolio visual language.

### 6. Accessibility, responsive and regression pass
- Verify colour contrast, focus states, keyboard use, labelled chart information and colour-independent status communication.
- Check representative pages from every route family at desktop and mobile widths in both light and dark mode.
- Confirm long labels, wide tables, legends, filters and side panels do not overlap or overflow.
- Run type checks and interaction checks for existing workflows so the redesign does not alter behaviour.

## Technical approach
- Extend the existing shared chart and metric components rather than creating a second design system.
- Migrate route families in focused batches, starting with shared primitives so later pages inherit the standard automatically.
- Use existing formatting services for UK dates, currency and numbers throughout.
- Keep all data and business logic unchanged; this is a presentation-system consolidation only.
- Update the project roadmap with a concise checklist and close each route family only after visual and interaction verification.

## Acceptance criteria
- Every content page visibly belongs to the same product as the Portfolio overview.
- Equivalent metrics, charts, tables, panels, statuses and controls use the same shared treatment.
- No legacy KPI/card pattern or raw default chart styling remains on content pages without a justified specialist need.
- Existing features, mock data, routes, saved views and interactions continue to work.
- Light/dark mode and desktop/mobile checks pass across representative pages from every module.
