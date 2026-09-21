# Monday-style shared workspace upgrade

## Scope
Upgrade the prototype’s shared list experience so projects, tasks, risks, issues, milestones and requests use one consistent, interactive board system. All changes remain mock-only in browser state; no authentication, backend, notifications delivery or automation execution is added.

## Build

### 1. Shared board foundation
- Create a typed reusable board model for rows, column definitions, column types, saved views, filters, sorting, grouping, conditional rules and automations.
- Add a shared board toolbar with Table, Kanban, Timeline, Calendar and Chart views.
- Support named views with editable filters, sort, group, visible columns and a default-view marker.
- Provide reusable renderers/editors for Status, People, Date, Timeline, Number/unit, Progress, Priority, Tags, Link, Dependency and read-only Formula columns.
- Standardise task and milestone states everywhere: Overdue, Late, On Track, Future and Completed with the specified icons and semantic RAG colours.

### 2. Advanced table behaviour
- Add inline cell editing, sortable columns, draggable row and column ordering, column resizing, and a sticky first data column.
- Add selection checkboxes and a bulk-action bar for status, reassignment, moving, and deleting.
- Add group-by for compatible columns, collapsible coloured group headings, and summary rows supporting sum, average, count and RAG distribution.
- Add conditional row styling, including overdue unfinished items highlighted red.

### 3. Alternate views
- Kanban: configurable grouping column with draggable cards and compact field summaries.
- Timeline: ranged bars, milestone diamonds, dependency connectors and week/month zoom.
- Calendar: month grid with dated items and milestone markers.
- Chart: selectable categorical breakdown rendered with the existing chart library.
- Preserve the simulated 1.5-second Planner sync state after task edits.

### 4. Item collaboration panel
- Open a shared right-side panel when an item is selected.
- Include Details, Updates, Files and Activity log tabs.
- Seed mock comments, @mentions, emoji reactions, attachments and change history; interactions update local demo state.

### 5. Automations
- Add an Automations button to each board.
- Build a sentence-style recipe editor for the three requested recipe patterns.
- Show active recipes with local on/off toggles and allow mock recipes to be added or removed; recipes will not execute.

### 6. Apply across the app
- Replace project/programme/collection lists with the shared project board.
- Upgrade project Tasks, RAID risks and issues, and milestones to the shared board views.
- Build the Requests board with realistic request data and prioritisation details.
- Keep specialist visualisations such as the risk heat map alongside the shared board.

### 7. Shared navigation features
- Add a notification bell and inbox with mentions, overdue alerts, status reminders and approval requests, including read/unread and Mark all read.
- Add a Ctrl/Cmd+K command palette for global navigation/search and quick actions.
- Add project, programme and saved-view favourites, with starred items pinned in a Favourites sidebar section.

### 8. Dashboards
- Add a Dashboards route and sidebar entry.
- Seed “DTS Portfolio” with KPI, RAG donut, bar chart, table, timeline, milestone and workload widgets.
- Add a widget picker and browser-only drag-and-drop widget ordering/layout.

## Verification
- Check all five views, saved/default views, grouping, summaries, inline edits, resizing/reordering, bulk actions, side panel tabs and automations on desktop.
- Check notifications, command palette shortcuts, favourites and dashboard editing.
- Verify project Tasks retain Planner sync simulation.
- Verify responsive layouts, dark mode, route metadata and no browser errors.
