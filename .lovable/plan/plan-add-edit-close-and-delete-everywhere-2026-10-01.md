# Plan: Add, edit, close and delete everywhere

## What you will get
Every register in the app gets the same four actions, working the same way everywhere:
- **Add**: a "New ..." button above the list opens a side panel form.
- **Edit**: clicking an item opens its side panel. Every field can be edited there, as well as in the table.
- **Close**: a "Close" action asks for a short closing note. The item stays visible as Closed (or the item's own closed status, e.g. Realised or Done) and can be reopened.
- **Delete**: asks you to confirm, then removes the item. An "Undo" message appears for a few seconds. Deleting from the selection bar works for several items at once.

Changes are kept in this browser, like the rest of the demo, and survive a page refresh. "Restore sample data" in Settings clears them.

## Items covered
- Tasks (project Tasks tab already has most of this. It gets Close, meaning Complete, and a confirm step before delete)
- Issued tasks
- Milestones
- Risks and Issues (project RAID tab, portfolio Risks page and RAIDD)
- Assumptions
- Decisions, including their follow-up actions
- Dependencies
- Change requests
- Lessons and improvement actions
- Benefits (register and profile page), including measures and measurement records
- Project requests
- Sprint work items (Delivery tab)
- Roadmap items and key dates
- Collections

## How each item closes
- Risk, issue and dependency: Closed
- Decision: Superseded or Reversed (you choose)
- Assumption: Validated or Invalidated
- Action, task or improvement action: Done
- Benefit: Closed, with a lifecycle check
- Lesson: Closed
- Request: Rejected or Approved
- Change request: Approved or Rejected

## Technical details
- Add one generic browser-local record store (`src/services/record-store.ts`), modelled on `entity-store.ts`. It keeps typed create, update, close, reopen and delete operations per collection, saves deltas to localStorage, mutates the shared mock arrays so every service and roll-up updates, and offers a version hook for re-rendering.
- Extend `BoardWorkspace` with optional `onCreate`, `onDelete`, `onClose` and `createForm` props. These add the toolbar "New" button, close and delete in the item panel and row menu, a confirm dialog, and an undo toast. The bulk-delete action calls `onDelete`.
- Add a shared `RecordFormSheet` that builds its fields from a small field-spec per item type (text, textarea, select, person, date, number).
- Wire each board adapter and the existing custom panels (decision, dependency, benefit profile, RAID) to the store.
- Include the new store in `resetEntities`.
- Record the store decision in AGENTS.md. Verify with the type checker and a Playwright pass that adds, edits, closes and deletes a risk, a benefit and a decision.
