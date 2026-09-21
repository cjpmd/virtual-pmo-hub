# Resource capacity and RAID views

## What will be built

- Expand each project’s **Resources** tab into a team table showing person, role, assignment dates, allocated hours, and an effort-completed versus effort-remaining bar.
- Replace the placeholder **Resources** page with a portfolio-wide people view showing current weekly allocation, capacity status, and project count.
- Flag a person in red when overlapping project assignments take them above 37.5 hours in any week, and provide a drill-down panel listing their projects, roles, dates, and weekly allocations.
- Expand each project’s **RAID** tab with a 5×5 probability-impact heat map, selectable risk cells, a detailed risk register, and the existing issues list.
- Add a separate **Risks** page that aggregates risks from every project, supports severity/status filtering, and links each record back to its project.
- Add realistic team allocations and varied risk records to the mock dataset so both capacity and heat-map states are meaningful in demonstrations.

## Interaction and presentation

- Preserve the existing Virtual PMO visual system, UK dates, RAG colours, mobile scrolling, and dark mode.
- Use clear red overload indicators, compact avatar identities, sortable tables, and keyboard-accessible drill-down controls.
- Calculate weekly capacity from each assignment’s total hours distributed across its active date range; overlapping assignments are summed for each week.
- Calculate effort completed per person from assigned task progress where available, with a deterministic project-progress fallback for mock projects without detailed tasks.

## Technical details

- Keep calculations and aggregation in the typed service layer, not in page components.
- Add reusable resource and RAID workspace components, then wire them into the project route and portfolio routes.
- Add route-specific metadata for the new Risks page and update shared navigation.
- Verify calculations, project drill-down, heat-map selection, filters, dark mode, and desktop/mobile layouts in the live preview.
