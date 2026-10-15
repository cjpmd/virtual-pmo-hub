# Decisions UI brief for Lovable (D1, 14/10/2026)

The database for the decision log is done: migration `20261014160439_d1_decision_log`
(proposal and dry runs in `docs/sql/d1-decision-log.sql`). Audit:
`docs/design/governance-decisions-audit.md`. Lovable builds the screens below.

**House rules (AGENTS.md):**

- Read and write only through `src/services/`.
- Mutations go through the write helper (`src/services/write.ts`) or an RPC.
- Theme tokens only, light and dark, accessible, usable at 375px.
- Reuse components (`scope` and `size` props); don't fork or copy them.
- The database enforces every rule below. The UI only hides what a user can't do, and shows the
  database's error message when a write is refused.

## 1. What the database now does

### Statuses and lifecycle

| Status | How a decision gets there | Editable by plain client writes? |
|---|---|---|
| Pending | created by a project editor (insert), or by `supersede_decision` | Yes: title, context, options, links, forum, maker, needed-by, impacts, evidence |
| Made | `record_decision` | No (read-only); actions stay editable |
| Superseded | automatically, when its successor is recorded | No |
| Reversed | `reverse_decision` | No |
| Withdrawn | `withdraw_decision` (Pending only) | No |

- **Deferred is not a status.** `defer_decision` keeps the decision Pending with a new needed-by
  and logs a `deferred` event.
- **Superseding:** `supersede_decision` creates a Pending copy (options and links included)
  pointing at the original with `supersedes_id`.
  - The original **stays Made** until the copy is recorded; it then becomes Superseded.
  - While the copy is Pending, `v_decisions.pending_successor_id` / `pending_successor_ref` are
    set on the original.
  - Withdrawing the copy releases the original: it stays Made and `pending_successor_*` clears.
  - One Pending successor at a time.
- **History:** every change is in `decision_events` (append-only; clients only read it).
  - Event types: `edited` (with `changes` JSON `{column: [old, new]}`), `deferred`, `made`,
    `superseded`, `reversed`, `withdrawn`.
  - Columns: `event_date`, `forum_id`, `decided_by_resource_id`, `reason`,
    `previous_needed_by` / `new_needed_by`, `actor_id`, `created_at`.
- **Who decided vs who recorded:** `decided_by_resource_id` or `decided_by_forum_id` (exactly one
  for a recorded decision) is the decider. `recorded_by` / `recorded_at` is the signed-in user
  who entered it.

### Permissions (enforced in the database)

| Action | Who |
|---|---|
| Read decisions, events, links | Workspace members |
| Create, edit a Pending decision, its options and links; Supersede; Withdraw | Project editors (`my_editable_project_ids`); for programme or portfolio decisions, workspace contributor+ |
| Record, Defer, Reverse | Workspace PMO or admin (on the forum's behalf), or the decision maker when their resource has a login. The forum chair joins in D2 |
| Delete | Pending decisions only (workspace manager+, as before). Made, Superseded, Reversed and Withdrawn are kept |
| Actions (`decision_actions`) | As before; editable in every status so owners can progress them |

There is no client-side permission helper for "can record" yet. Show Record, Defer and Reverse
to users with `useProjectPermissions(...).canEdit`, or PMO/admin, and let the RPC refuse with its
message (42501). Don't hide the buttons on a guess.

### RPCs (all `supabase.rpc(...)`, SECURITY DEFINER, explicit permission checks)

Every RPC takes an optional `p_expected_updated_at`. Pass the row's `updated_at` so a stale
write fails with 40001, and show "Changed by someone else, reload to see the latest."

Error codes:

- `42501`: not allowed
- `22023`: invalid input (a readable sentence; show it as is)
- `40001`: stale

`fromPostgrest` maps these codes (40001 to a conflict with the RPC's message).

| RPC | Arguments | Notes |
|---|---|---|
| `record_decision` | `p_decision_id`, `p_chosen_option_id`, `p_rationale`, `p_decision_date` (not in the future), `p_decided_by_resource_id?`, `p_decided_by_forum_id?` (not both), `p_actions` jsonb `[{description, owner_id?, due_date?}]` | Decided-by default: PMO → the forum (else the maker); the decision maker → themselves. Supersedes the predecessor if there is one. |
| `defer_decision` | `p_decision_id`, `p_new_needed_by` (today or later), `p_reason` (required), `p_event_date?` (≤ today), `p_forum_id?` | Pending only |
| `supersede_decision` | `p_decision_id`, `p_needed_by` | Made only; returns the new Pending decision |
| `reverse_decision` | `p_decision_id`, `p_rationale` (required), `p_event_date?` | Made only; no successor |
| `withdraw_decision` | `p_decision_id`, `p_reason` (required) | Pending only |
| `submit_status_report` | `p_project_id`, `p_report` jsonb, `p_decision_ids uuid[]`, `p_report_id?` | See §5 |

The service already uses `record_decision` and `supersede_decision`: `recordDecision` and
`supersedeDecision` in `src/services/decisions.ts`. Add service functions for the others in the
same file, plus mutations in `src/hooks/use-governance.ts`.

### Views

`v_decisions` (security invoker) has every `decisions` column plus:

- `today`: the organisation's today
- `overdue`: Pending past needed-by
- `days_overdue`
- `deferral_count`, `last_deferred_on`
- `superseded_by_id` / `_ref` / `_status`: the recorded successor
- `pending_successor_id` / `_ref`: the proposed replacement

**Read overdue from the view; don't compute it in the browser.** That replaces
`decisions.ts:267` and the notifications check.

`get_project_overview` now also returns:

- `openDecisions`: Pending decisions on the project, with overdue, days_overdue,
  deferral_count and forum
- `latestReportDecisions`: decisions linked to the latest submitted report

### New tables

- `decision_milestones` (`decision_id`, `milestone_id`, `project_id`): select, insert, delete.
  Frozen once the decision isn't Pending.
- `status_report_decisions` (`status_report_id`, `decision_id`, `sort_order`), see §5.
- `decision_events`: read only.

`write.ts` already lists all three in `NO_UPDATED_AT`.

## 2. RAID log › Decisions (project page): "New decision"

**Where:** the inline JSX in `src/routes/portfolio.projects.$projectCode.tsx` (Decisions
sub-tab). Move it into a component that takes `scope` so a programme page can reuse it.

**Add:**

- A **New decision** button for users with `permissions.canEdit`.
- It opens the decision drawer (§3) in create mode.
- Fields:
  - title (required) and context
  - options, at least two, each with a title and pros and cons as lists
  - decision maker (resource picker) and forum (lookup `decision_forum`)
  - needed-by (DD/MM/YYYY)
  - the four impacts, each with a toggle and a note
  - evidence link
  - links to risks, issues, change requests, dependencies, benefits and milestones on this
    project
- **Save:**
  - `insertRow("decisions", {project_id, ...})`; status is always pending, so don't send it
  - then `insertRows("decision_options", ...)` and the link tables
- **New service function:** `createDecision` in `decisions.ts`. Reuse `insertRow` and
  `insertRows`.

**Cards:**

- Show status pills for Pending, Made, Superseded, Reversed and Withdrawn.
- Show "Overdue N days" from `v_decisions`.
- Show "Deferred ×N" when `deferral_count > 0`.
- On a Made card with `pending_successor_ref`, show **"Replacement proposed: DEC-0xx"**,
  linking to that decision.

## 3. Decision drawer (`src/components/decision-panel.tsx`)

**Header:** ref, title, status pill, and the overdue pill (from the view).

**Pending:**

- Editable fields, as in create mode.
- **Record decision** form:
  - chosen option (radio)
  - rationale (required)
  - decision date (default today, not in the future)
  - **decided by**: a toggle between "Forum: <forum>" (default for PMO) and "Person: <maker>";
    the decision maker sees only themselves or their forum
  - follow-up actions (description, owner, due date)
  - calls `record_decision`
- **Defer:** new needed-by, reason (required), meeting date (optional, default today), forum
  (default the decision's). Calls `defer_decision`.
- **Withdraw:** reason (required) with a confirm step. Calls `withdraw_decision`. Use a
  destructive-variant button.

**Made:** read-only. Show:

- decided by (person or forum)
- recorded by and when
- the chosen option, highlighted

Plus:

- **Supersede:** needed-by for the replacement. Calls `supersede_decision`, then opens the new
  decision.
  - Change the copy that says the original "becomes Superseded". It now stays Made until the
    replacement is recorded.
  - When `pending_successor_ref` is set, hide Supersede and show "Replacement proposed:
    DEC-0xx".
- **Reverse:** rationale (required), date. Calls `reverse_decision`, with a confirm step.

**Superseded / Reversed / Withdrawn:** read-only. Show the reason, the successor ("Superseded
by DEC-0xx") or the predecessor ("Supersedes DEC-0xx").

**History:** a timeline from `decision_events`, newest first:

- edited: list the changed fields
- deferred: "from DD/MM to DD/MM"
- the reason, the actor and the date for every event

**Actions:** editable in every status (status, owner, due date).

**Links:** show linked records. Add or remove only while the decision is Pending.

## 4. Portfolio decision log (Governance)

**Where:** reuse the existing board on Governance › RAIDD › Decisions
(`src/components/decisions-workspace.tsx`); don't build a second log.

**Changes:**

- **Filters:** forum, status (all five), and overdue (from `v_decisions.overdue`). Keep the
  views Pending, Pending overdue, By forum, Made this month and Superseded; add Withdrawn.
- **Read-only cells:**
  - Status is read-only on the board. Only the RPCs change it, and the database refuses a
    status edit.
  - Every cell is read-only on a non-Pending row.
- **Clicking a row** opens the same decision drawer (§3).
- **Create:** offer New decision with a scope picker (project, programme or portfolio).
- **Remove the misleading toasts** (`decisions-workspace.tsx:45-52`):
  - "Raise new decisions from the project or programme they belong to." There is a create
    path now.
  - The delete toast is still accurate for non-Pending rows. For Pending rows, a manager can
    delete; offer Withdraw instead (keeps the record).
- The same "Raise new assumptions …" toast in `assumptions-workspace.tsx:75` is out of D1 scope;
  leave it.

## 5. Status report "Decisions needed" picker

**Where:** the status report form (`src/components/status-workspace.tsx`).

**Form changes:**

- Add a **Decisions needed** section:
  - a multi-select of the project's Pending decisions (`openDecisions` from
    `get_project_overview`, or `v_decisions` filtered to the project and status `pending`),
    ordered as picked
  - a **"New decision"** shortcut that opens the drawer in create mode, then adds the new
    decision to the selection
- Keep the legacy free text `decisions_needed` as **"Legacy notes"** (optional), sent in
  `p_report.decisions_needed`.

**Submit:**

- Submit uses `submitStatusReport` (`src/services/status-reports.ts`), which already calls
  `submit_status_report`.
- Pass `decisionIds` in display order. The RPC:
  - saves the report and its links in one transaction
  - inserts the report as submitted, or turns a draft (`reportId`) into submitted
- After submit the links are frozen. The database refuses any change from the client.

**Drafts:**

- Links stay editable on a draft: insert and delete `status_report_decisions` rows.
- Only Pending decisions of the same project can be linked.
- When a draft is submitted, a draft link missing from `p_decision_ids` is refused ("Remove
  DEC-0xx from the draft first, or include it"). Send every link you show.

**Display:** the highlight report on the Overview reads `latestReportDecisions`. Show ref,
title, needed-by and overdue, then the legacy text if any.

## 6. Milestone "report to committee" toggle

**Where:** Plan › Milestones (`src/components/project-milestones.tsx`) and Delivery ›
Milestones.

**Add:**

- A "Report to committee" switch per milestone, for `permissions.canEdit`.
- It saves with the existing `updateMilestone` (`reportToCommittee` →
  `milestones.report_to_committee`) through the write helper, with `lastSeen`.
- The "Committee" tag and the default "Committee milestones" view already read it.

**Decision links:** in the decision drawer, link milestones through `decision_milestones`.

## 7. Gate checklist (done in code, for reference)

- Plan › Gates ticks and the "relevant lessons reviewed" tick now save to
  `gate_checklist_ticks`:
  - one row per criterion per gate milestone, against the next open gate milestone
  - `src/services/gate-ticks.ts`, `src/hooks/use-gate-ticks.ts`
- The Overview gate signal counts the saved ticks.
- No UI work is needed beyond styling. The checklist header names the gate milestone the ticks
  are saved against.

## 8. Screen → data map

| Screen | Reads | Writes |
|---|---|---|
| RAID log › Decisions (project) | `v_decisions` (project), `decision_options`, links, `decision_actions` | `decisions` insert/update (Pending), `decision_options`, link tables incl. `decision_milestones` |
| Decision drawer | `v_decisions`, `decision_events`, options, actions, links | RPCs `record_decision`, `defer_decision`, `supersede_decision`, `reverse_decision`, `withdraw_decision`; `decision_actions` |
| Governance › RAIDD › Decisions | `v_decisions` (organisation), `lookup_values` (`decision_forum`) | `decisions` update (Pending only, not status); RPCs via the drawer |
| Status report form | `get_project_overview.openDecisions` or `v_decisions` | RPC `submit_status_report`; `status_report_decisions` (drafts only) |
| Overview highlight report | `get_project_overview.latestReportDecisions`, `openDecisions` | none |
| Plan › Milestones / Delivery › Milestones | `milestones` | `milestones.report_to_committee` |
| Plan › Gates, Overview gate signal | `gate_checklist_ticks` | `gate_checklist_ticks` insert/delete |

## 9. Not in D1

These come later:

- forums as a table, chairs, members and meetings (D2)
- agendas, outcomes and packs, and `decide_business_case` (D3)
- gate approvals and escalations (to be defined first)
