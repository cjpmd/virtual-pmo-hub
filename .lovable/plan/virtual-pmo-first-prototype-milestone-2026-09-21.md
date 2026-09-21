# Virtual PMO — first prototype milestone

## Goal
Build the first clickable demo of Virtual PMO for university IT/PMO teams, centred on a working portfolio overview and programme experience. All content uses realistic fictional mock data, UK English, DD/MM/YYYY dates, pounds sterling, and 21/09/2026 as “today”.

## Experience and navigation
- Create a responsive application shell with a collapsible left navigation, global search, light/dark mode control, and Chris McDonald’s profile in the top bar.
- Use the agreed calm, professional visual language: deep-blue accent, generous whitespace, restrained shadows, rounded surfaces, clear RAG colours, and dense but approachable monday-style tables.
- Add routes for Portfolio, Programmes, Projects, Collections, Requests, Resources, and My Work.
- Portfolio and Programme routes will be fully interactive in this milestone.
- Every later route will be a clickable placeholder using the shared page header, a short purpose statement, a “Coming next” badge, and a faded skeleton of its eventual main layout.

## Typed mock-data foundation
- Define typed entities for portfolios, programmes, projects, collections, tasks, milestones, people, resources, risks, issues, changes, status reports, and requests.
- Add one portfolio, all five named programmes, and 25 realistically distributed projects, including the requested named projects.
- Give every project the summary fields, collection memberships, milestones, task totals/overdue totals, and open risk/issue drivers required for genuine health calculations.
- Add complete detailed records only for Ebbot (amber), Reduce Our Cyber Risk (red), and Account creation automation (green).
- Invent approximately 15 fictional staff members and ensure no real people are represented beyond the specified demo persona.
- Keep raw mock records private to the data layer; screens access them only through typed service functions such as `getPortfolio`, `getProgrammes`, `getProgramme`, and `getProjects`.

## Health calculation engine
- Calculate schedule health from overdue milestones, finish-date slippage above 10%, and overdue-task percentage above 15%.
- Calculate issue health from open high-severity issues and open risks scoring at least 15.
- Derive overall project health from the worst component result, then roll programme and portfolio health up from their children.
- Support manager overrides only when a reason is present.
- Display overrides with a compact manual marker and expose the reason in a hover tooltip.
- Use one reusable `HealthPill` for On Track, At Risk, Off Track, and Not Set states throughout.

## Portfolio overview
- Build KPI cards for active projects, total budget, forecast, and percentage on track, all computed from the mock records.
- Add a Recharts RAG summary visual with useful labels and accessible colour treatment.
- Build a sticky-header programme table with sortable columns, grouped visual treatment, rolled-up health, RAG project counts, budget, and forecast.
- Make programme rows navigable to their programme pages.

## Programme page
- Add a reusable entity header showing programme name, manager, sponsor, dates, budget, and calculated health.
- Provide Overview, Projects, Financials, Status, and Notes tabs with URL-addressable programme detail.
- Make Overview a useful summary of description, value statement, RAG mix, budget/forecast, and programme dates.
- Build the Projects tab as a monday-style sortable table with linked project names, health columns, stage, state, manager, budget, forecast, and task-source badges.
- Include “Add existing project” and “New project” demo controls with lightweight, non-persistent prototype interactions.
- Give Financials, Status, and Notes credible read-only prototype content based on the phase-one dataset rather than dead empty states.

## Reusable building blocks
- Create reusable `HealthPill`, `KpiCard`, `DataTable`, `EntityHeader`, task-source badge, page header, placeholder preview, and empty/loading treatments.
- Use existing design-system controls for buttons and interactive elements, lucide icons for actions, and tooltips for unfamiliar icon-only controls.
- Keep table editing safely local to the browser session and visibly demo-only; no backend or authentication will be added.

## Quality checks
- Add unique page metadata for every content route.
- Verify navigation, sidebar collapse/restore, search presentation, theme switching, sorting, programme drill-down, tabs, override tooltips, and demo interactions.
- Check the finished prototype at desktop and mobile widths for readable tables, non-overlapping content, sticky headers, and usable navigation.
- Validate that all displayed portfolio and programme metrics reconcile with the service-layer calculations and mock data.

## Technical boundaries
- Use the existing TanStack Start React/TypeScript application with Tailwind CSS v4, shadcn-style components, lucide-react, and Recharts.
- No authentication, persistence, external APIs, Microsoft Planner integration, or backend work in this milestone.
- “Open in Planner” will appear only where relevant in later detailed project work and remain non-functional for this prototype.
