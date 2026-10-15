# Decision log UI (brief D1)

Follows `docs/design/decisions-ui-brief.md` section by section. No database, migration, view, RPC or RLS changes. If an RPC or policy refuses a write that the brief says should work, I stop and report it. I won't work around it.

## 1. Services and hooks (`src/services/decisions.ts`, `src/hooks/use-governance.ts`)
- Read decisions from `v_decisions`, which gives overdue, days_overdue, deferral_count, pending_successor_*, superseded_by_*. This removes the browser overdue calculation at line 268.
- New reads: `decision_events` (history) and `decision_milestones`.
- New writes:
  - `createDecision`: `insertRow` decisions, then `insertRows` for options and the link tables, milestones included.
  - Pending-only link add/remove.
  - `deferDecision`, `reverseDecision`, `withdrawDecision` RPCs. Each passes `p_expected_updated_at`.
- Update `recordDecision` to take decided-by (person or forum) and the decision date.
- Matching mutations, with errors shown through `fromPostgrest`:
  - 42501 and 22023: the database's message is shown as is.
  - 40001: "Changed by someone else, reload to see the latest."
- Small tests for:
  - mapping the RPC arguments
  - which actions each status gets

## 2. Project RAID log › Decisions
- Move the inline sub-tab JSX into a new `DecisionLog` component with a `scope` prop. The route only swaps in the component.
- Each card shows:
  - ref, title, forum, maker, needed-by
  - a status pill with a text label (all five statuses)
  - "Overdue N days"
  - "Deferred ×N"
  - "Replacement proposed: DEC-0xx", linking to that decision
- A "New decision" button for `canEdit` users opens the drawer in create mode.

## 3. Decision drawer (`decision-panel.tsx`)
- **Create and Pending edit:**
  - title, context, two or more options with pros and cons lists
  - maker (resource picker), forum (`decision_forum` lookup), needed-by in DD/MM/YYYY
  - four impact toggles, each with a note
  - evidence link
  - links to the project's risks, issues, changes, dependencies, benefits and milestones
- **Pending actions:**
  - Record: chosen option (radio), rationale, date (not in the future), decided-by toggle (Forum or Person), follow-up actions
  - Defer: new needed-by, reason, meeting date, forum
  - Withdraw: reason, then a confirm step; destructive button
- **Made** (read-only):
  - shows decided by, recorded by and when, and the chosen option highlighted
  - Supersede: needed-by, then opens the copy. New wording: the original "stays Made until the replacement is recorded". Supersede is hidden while a replacement is proposed.
  - Reverse: rationale and date, with a confirm step
- **Superseded / Reversed / Withdrawn** (read-only): shows the reason, plus "Superseded by" or "Supersedes" links.
- **History timeline**, newest first:
  - edited: the changed fields
  - deferred: "from DD/MM to DD/MM"
  - every event: reason, actor and date
- **Actions** stay editable in every status.
- **Who sees which buttons:**
  - Record, Defer and Reverse show for `canEdit` users and for PMO/admin. The RPC has the final say.
  - The drawer is a focus-trapped sheet that works at 375px.

## 4. Governance › RAIDD › Decisions (`decisions-workspace.tsx`, `decision-board-data.ts`)
- Filters for forum, status (all five) and overdue. Add a "Withdrawn" view.
- Status column is always read-only. Every cell is read-only on non-Pending rows.
- Clicking a row opens the drawer.
- "New decision" comes with a scope picker: project, programme or portfolio.
- Remove the "Raise new decisions…" toast; create now opens the drawer.
- Delete: non-Pending rows keep the accurate toast. Pending rows offer Withdraw instead.

## 5. Status report form (`status-workspace.tsx`, `status-reports.ts`)
- **"Decisions needed" picker:**
  - multi-select of the project's Pending decisions, kept in the order picked
  - "New decision" opens the drawer in create mode and adds the result to the selection
- **"Legacy notes":** optional, sent as `p_report.decisions_needed`.
- **Submit:** only through `submit_status_report`, with `decisionIds` in display order.
- **Drafts:**
  - An existing draft can be opened. Its links are edited through `status_report_decisions` insert and delete, then it is submitted with `reportId`.
  - There is no Save draft button, and a TODO marks where it will go.
  - Gap: no RPC creates a draft.
- **Submitted reports** show their linked decisions read-only.

## 6. Highlight report panel (only this one file in `src/components/overview`)
- Uses `latestReportDecisions` already in the payload. No new queries.
- **Full size:** each decision is a link (ref, title, status, needed-by, overdue) that opens the drawer on RAID log › Decisions. The legacy text sits below.
- **Compact:** up to 2 links plus "+N more". No free text.
- Other props and behaviour stay unchanged.

## 7. Milestone "Report to committee" switch
- Added to `project-milestones.tsx` and the Delivery › Milestones edit form, for `canEdit` users.
- Saves through `updateMilestone` with `lastSeen`.

## Not changed
- Project header, the rest of the project route, the other overview components, and all database objects.
- The assumptions toast.

## Gaps to report
- No create-draft RPC for status reports.
- There is no client-side "can record" helper. Buttons follow the brief's visibility rule, and the RPC refuses when needed.
