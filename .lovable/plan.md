# Status tab and report flow

## What will be built
- Replace the existing Status list with a full status workspace containing a multi-line health trend chart and a chronological report timeline.
- Add a **New status report** action that opens a right-hand side panel, pre-filled from the project’s current calculated health.
- Add editable Overall, Schedule, Financial, Effort, and Issues & risks health fields. Any value changed from its calculated value must include a reason before submission.
- Add **Draft from activity** to fill Accomplished and Planned with realistic summaries assembled from recently completed and upcoming mock tasks.
- Submit reports into local prototype state so the new entry immediately appears at the top of the timeline and in the trend chart.

## Interaction details
- The panel will support cancel, validation messages, and submission with today’s date and the current demo user.
- Historical reports will show all five health dimensions, narrative sections, comments, submitter, and any manual override reasons.
- The chart will map health states to a labelled RAG scale while preserving one line per dimension and usable tooltips.
- The experience will work in light and dark modes and remain usable on narrow screens.

## Technical details
- Extend the typed status report model with optional per-dimension override reasons.
- Add a focused reusable status workspace component; keep route code responsible only for selecting the project and supplying calculated values.
- Use Recharts for the trend visualisation and existing design-system controls for actions and fields.
- Keep all changes in browser memory because this is a mock-data prototype with no backend.

## Validation
- Check Ebbot and another project in the running preview.
- Verify draft generation, override-reason enforcement, report submission, trend updates, timeline ordering, mobile layout, and no browser errors.
