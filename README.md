# Virtual PMO Hub

Build a clickable prototype of a web app called "Virtual PMO": a modern project, programme and portfolio management (PPM) platform for university IT/PMO teams. It replaces Microsoft's Project Accelerator (a Power Apps tool) with a much better-designed product that feels like monday.com, while syncing tasks with Microsoft Planner. This is a prototype for demos and user research, so use realistic mock data only. No authentication and no backend yet.

## Tech and structure

- React + TypeScript + Tailwind + shadcn/ui, lucide icons, recharts for charts.

- Put all mock data in a typed data layer (src/data/*.ts) accessed only through functions in src/services/ (e.g. getProjects(), getProgramme(id)), so it can later be swapped for Supabase without changing components.

- UK English throughout. Dates DD/MM/YYYY. Currency £. Today's date is 21/09/2026.

## Design direction

- Clean, calm, professional. Generous whitespace, rounded cards, subtle shadows, one strong accent colour (deep blue) plus RAG colours.

- RAG health shown as coloured pills: On Track (green), At Risk (amber), Off Track (red), Not Set (grey).

- Light and dark mode.

- Left sidebar navigation, collapsible. Top bar with global search and a user avatar (Chris McDonald, Head of Programmes & Projects).

- Tables must feel like monday.com: inline editing, grouped rows, column sorting, sticky headers, not like a database form.

## Data model

- Portfolio: name, description, owner, budget, derived health.

- Programme: belongs to one Portfolio. Name, description, programme manager, sponsor, start/end, budget, value statement, health.

- Project: belongs to one Programme (or directly to a Portfolio). Name, project manager, sponsor, stage (Discover, Define, Plan, Deliver, Close), state (Proposed, Active, On Hold, Closed), priority (Low/Moderate/High/Critical), start/finish, budget/actual/forecast, business case summary, benefits, task source.

- Task source on each project is one of: "Native", "Planner (Basic)", "Planner (Premium)". Show a small badge with a Planner icon for Planner-connected projects, plus an "Open in Planner" button (non-functional) and a "Last synced 2 mins ago" label.

- Collection: a cross-cutting group of projects that does NOT affect the hierarchy (a project can be in many collections). Types: "Governance" (e.g. Digital Committee), "Priority set" (e.g. Summer Priorities), "Funding stream" (e.g. Innovation Pot, which has a pot amount and awarded amounts).

- Task: title, bucket, assignees, start, finish, % complete, priority, is milestone, checklist count, dependencies.

- Team member: person, role (Project Manager, Team Member, Sponsor), start, finish, allocated effort hours.

- Risk: title, description, owner, probability (1-5), impact (1-5), score, response (Avoid/Reduce/Transfer/Accept), status, review date.

- Issue: title, owner, severity, status, due date.

- Change request: title, type (Scope/Schedule/Cost), cost impact, schedule impact (days), status (Proposed/Approved/Rejected), requested by.

- Status report: project, reporting date, submitter, overall/schedule/financial/effort/issue health, accomplished this period, planned next period, additional comments.

- Project request: title, requester, sponsor, description, estimated cost, estimated benefit, strategic alignment score, state (New, In Review, On Hold, Approved, Rejected).

## Health logic (important, this is a key differentiator)

- Project schedule health is calculated: Off Track if any milestone is overdue or finish date has slipped > 10%, At Risk if > 15% of tasks are overdue, otherwise On Track.

- Issue health is calculated from open high-severity issues and risks with score >= 15.

- Overall health = worst of the component healths.

- Programme and portfolio health roll up from their children (worst-of).

- Any calculated health can be overridden by the manager, but an override requires a reason. Show overridden health with a small "manual" marker and the reason on hover.

## Screens

1. Portfolio overview (home): KPI cards (active projects, total budget, forecast, % on track), a RAG summary chart, and a monday-style table of programmes with rolled-up health, project counts by RAG, budget and forecast. Click through to a programme.

2. Programme page: header with health and key facts, tabs for Overview, Projects (table of linked projects with health columns, "Add existing project" and "New project" buttons), Financials, Status, Notes.

3. Project page: header with name, stage progress indicator, health strip, task source badge. Tabs: Overview, Status, Tasks, Resources, RAID (risks and issues), Changes, Financials, Business case. The Overview tab is a single dashboard: health strip, mini timeline, top 3 risks, latest status report, upcoming milestones, budget vs forecast.

4. Collections: list of collections, and a collection page (e.g. Digital Committee) showing its projects with health and budget, plus a "Generate committee pack" button (build the button, we'll do the pack next).

5. Requests: kanban pipeline of project requests by state, with a request detail drawer showing a simple prioritisation score.

6. Resources: cross-project view of people, total allocated hours across all projects, and an over-allocation flag.

7. My Work: tasks assigned to the current user across all projects.

## Mock data

- One portfolio: "DTS 2025/26".

- Five programmes under it: "1. Standards, Governance & Best Practice", "2. Resilience & Business Continuity", "3. Optimisation & Cost Management", "4. Efficiency, Automation & AI", "5. People, Knowledge & Continuous Improvement".

- About 25 projects spread across them, including: Account creation automation, Copilot / Microsoft integration, Document Management, Ebbot (chatbot), Improve Infrastructure Resilience (VXRail), Reduce Our Cyber Risk, SharePoint Stabilisation & Migration, Windows 11 Rollout, VDI Review, Asset Management, Cyber and Information Governance, Network Refresh: Data Centre, Digital Landscape Mapping. Mix of stages, states and health so the RAG views look realistic (mostly green, some amber, 2-3 red).

- Collections: "Digital Committee" (Governance, ~8 projects), "Summer Priorities 2026" (Priority set, ~6 projects), "Innovation Pot" (Funding stream, £50,000 pot, 5 small funded projects with awarded amounts).

- Invent fictional staff names (about 15 people). Do not use real people.

- Give each project realistic tasks (8-20), team members, 2-6 risks, 0-3 issues, and 2-4 historical status reports so trends can be shown.

Start by building the layout, navigation, data layer and the Portfolio overview and Programme page. Keep components reusable (HealthPill, KpiCard, DataTable, EntityHeader).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ebeec5e8-ad15-4b56-9dc7-f8739875ba24).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
