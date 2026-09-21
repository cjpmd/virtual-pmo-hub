# Project Tasks workspace

## What will be built

- Replace the current Tasks table with a dedicated workspace offering **Grid**, **Board**, and **Timeline** views.
- Keep edits in local prototype state so users can safely edit and rearrange realistic mock tasks during demos.
- Show a subtle Planner status for Planner-connected projects, switching to **Syncing…** for 1.5 seconds after every edit or board move.

## Views

### Grid
- Inline editing for title, assignees, start date, finish date, completion percentage, and bucket.
- Avatar stacks for assignees with an inline selector.
- Completed work uses a green tick and struck-through title; milestones use a diamond marker.
- Retain sortable, sticky table behaviour where it does not conflict with active editing.

### Board
- Group task cards into bucket columns.
- Support pointer and keyboard-friendly drag and drop between buckets.
- Show assignees, dates, progress, completion, and milestone state on each card.

### Timeline
- Render a horizontally scrollable Gantt view with aligned task rows and date bars.
- Show milestone diamonds and dependency connector lines.
- Add a week/month zoom control that changes the timeline scale.

## Technical details

- Add a focused task-workspace component and keep the project page responsible only for selecting the Tasks section.
- Use browser-native drag events to avoid adding a large dependency for this prototype.
- Convert display dates to date inputs only while editing, preserving UK `DD/MM/YYYY` presentation everywhere else.
- Use existing semantic colours, buttons, typography, and responsive patterns; support light and dark modes.
- Verify editing, dragging, Planner sync timing, both timeline zoom levels, and desktop/mobile layouts.