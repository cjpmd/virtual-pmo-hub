# Planner-style task actions and dependency lines

## What you will get (project Tasks tab)

### 1. Task details panel (like Planner)
Clicking a task, or choosing "Open details" from its menu, opens a panel on the right where you can view and edit everything:
- Title with a tick button to mark it complete (the title gets crossed out)
- Assignees (add or remove people) and labels shown as coloured chips, with priority
- Notes, with "Show more"
- Start, Finish, Duration (worked out from the dates), % Complete
- Bucket, Priority and Sprint dropdowns
- A checklist with a progress bar ("Checklist 2 / 3"): tick items, add items, remove items
- Effort: Completed + Remaining = Total, all in hours
- "Depends on": a list of the tasks this one waits for, with "Add dependency" and remove buttons
- Attachments (pretend files) and a conversation thread
- For Planner Premium projects, fields that Planner calculates show a lock, and the Planner sync message appears after each edit

### 2. Task menu (right-click, or the "…" button on each row)
- Open details
- Cut, Copy, Paste (paste puts the task below the one you picked; cut moves it there)
- Insert task above
- Delete task (asks you to confirm, then shows an Undo)
- Copy link to task (copies a link that opens this task's details panel, and shows "Link copied")
- Add dependency (choose a task from a searchable list; it won't let you create a loop)
- Remove dependency (choose one of the task's current dependencies)
- Mark as complete / Mark as incomplete

Keyboard shortcuts for the selected row: Ctrl/Cmd+X, C, V, Delete, and Enter to open details.

### 3. Timeline dependency lines
- The timeline adds numbered rows beside the bars, with a tick, title and assignee pictures, like your screenshot.
- Each dependency draws a thin elbow-shaped line from the end of the earlier task to the start of the task that depends on it.
- Lines update when you move dates or add/remove dependencies. Hovering over a task highlights its lines.
- If a task starts before the task it depends on has finished, the line turns amber.

## Technical details
- Extend `Task` with optional `notes`, `labels`, `sprint`, `checklist` items `{id,label,done}`, and `effortCompletedHours`. Also add these to the mock data for the main demo projects. Existing `dependencies: string[]` stays as it is.
- New `src/components/task-detail-panel.tsx` and `src/components/task-context-menu.tsx`, using shadcn ContextMenu and DropdownMenu.
- `TaskWorkspace` keeps the task list in local state so cut/copy/paste/insert/delete and dependencies can change it, and passes those actions to `BoardWorkspace` through new optional props (`rowMenu`, `onOpenItem`), so other boards stay unaffected.
- The task links use `?task=<id>` on the project page, which opens the panel when the page loads. Copying uses the clipboard.
- Upgrade the `Timeline` view in board-workspace: add a numbered left column, and draw SVG elbow lines using row index and date position, but only when the rows include `dependencies`.
- Changes are kept for the current session only, as elsewhere in the prototype. Afterwards, check the build and test in the preview on the Ebbot project.
