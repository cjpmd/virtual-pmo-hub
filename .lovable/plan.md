# Expanded resource management

## Goal
Turn Resources into a complete portfolio-capacity workspace for PMO teams, while keeping all interactions as realistic mock-data prototypes.

## Data and calculations
- Expand people to about 20 named staff across Infrastructure, Applications, Cyber Security, Service Desk and PMO.
- Add team, line manager, contracted weekly hours, FTE, BAU percentage, skills with levels, and dated leave.
- Add typed generic resources, including two unfilled roles flagged as needing staffing.
- Replace simple project-team allocations with typed assignments linking a person or generic role to a project and optionally a task, with dates, weekly hours and Soft/Hard booking type.
- Calculate weekly project capacity as contracted hours less BAU and leave, allocation percentages, utilisation, over-allocation, effort progress and role/skill supply versus demand through service functions.
- Seed three people as visibly over-allocated during October–November 2026.

## Resource pages
- Make `/resources` the Resource Dashboard with portfolio KPIs and charts for team utilisation, most allocated people, effort by resource and resources by project.
- Add `/resource-assignments` with Resource → Project → Task hierarchy, totals, progress and filters for team, project, programme and booking type.
- Add `/resource-allocation` with a 26-week people heat map, leave hatching, allocation bands and a cell detail panel.
- Add People and Role/skill modes to Allocation; Role/skill mode compares weekly demand with available capacity.
- Support moving assignment bars between weeks and reassigning them to another person in the prototype state.
- Add `/resource-scenarios` where PMO users select a request or proposed project, define role demand, shift the proposed start and compare baseline versus scenario capacity before mock approval.

## Project Resources tab
- Add a booking panel that searches by skill and project-date availability and displays free weekly capacity.
- Allow Soft or Hard booking and update the visible project team locally.
- Show booking badges throughout resource views.
- Show a prominent Needs staffing banner and unfilled-role cards whenever generic assignments remain open.

## Navigation and verification
- Add clear navigation between Dashboard, Assignments, Allocation and Scenarios.
- Give every new page unique title, description and social metadata.
- Verify calculations, filters, detail panels, booking, drag/reassign, scenario date changes, dark mode, and desktop/mobile layouts in the live preview.
