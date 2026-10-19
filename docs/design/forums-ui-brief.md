# Forums and meetings UI brief for Lovable (D2, 19/10/2026)

**Status: database applied 19/10/2026** (migrations `20261019160254_d2_0_milestone_type_approval`
and `20261019160405_d2_forums_meetings`; record in `docs/sql/d2-forums-meetings.sql`). Types are
regenerated. `docs/sql/runbook-d2.sql` (retiring the forum lookups, option history by title) is
run by the user; check the handover says it has been run before testing option history.

**Split:** the database, the services and the hooks are done on our side (see section 5).
Lovable builds the screens in sections 2 to 4.

**House rules (AGENTS.md):**

- Read and write only through `src/services/`. Mutations go through the write helper or an RPC.
- Theme tokens only, light and dark, accessible, usable at 375px.
- Reuse components (`scope` and `size` props). Don't fork or copy them.
- Grow the existing Decision forum page. Don't add a parallel page.
- The database enforces every rule below. The UI hides what a user can't do, and shows the
  database's message when a write is refused.

## 1. What the database does

### Forums (`forums`, read through `v_forums`)

The five forum lookups became real records and kept their ids, so existing decisions didn't
change. These are Project Board, Programme Board, Digital Committee, Architecture Review Board
and Change Advisory Board, all **organisation-level**.

A forum is either:

- **organisation-level** (`workspace_id` null), such as the Digital Committee or the
  Architecture Review Board, or
- **a workspace's own forum** (`workspace_id` set), such as one PMO's Project Board.

| Column | Meaning |
|---|---|
| `workspace_id` | Null for an organisation-level forum; the workspace for a workspace forum. Set on create, never changed |
| `name` | Unique per organisation and workspace |
| `level` | `project`, `programme`, `portfolio` or `organisation` |
| `chair_resource_id` | A resource (person). `v_forums.chair_name` gives the name |
| `cadence` | `weekly`, `fortnightly`, `monthly`, `quarterly`, `ad_hoc` or null |
| `papers_deadline_days` | Days before a meeting that papers are due (0–60, default 5) |
| `active` | Inactive forums are kept. They are never deleted |
| `sort_order` | List order |

`v_forums` adds the following:

- `chair_name` and `member_count`
- `next_meeting_id`, `next_meeting_date` and `next_papers_deadline`: the next planned meeting
  from today
- `pending_decisions`

Members are in `forum_members (forum_id, resource_id)`. Adding a member is an insert and
removing one is a delete. There are no other columns.

### Meetings (`meetings`, read through `v_meetings`)

| Column | Meaning |
|---|---|
| `forum_id` | Fixed once created. A meeting can't move to another forum |
| `meeting_date` | |
| `papers_deadline` | Defaults to `meeting_date - forum.papers_deadline_days`. It is editable, but never later than the meeting |
| `status` | `planned`, `held` or `cancelled`. Meetings are cancelled, never deleted |
| `minutes_link` | A URL (optional) |
| `notes` | Optional |

`v_meetings` adds the following:

- `forum_name` and `today`
- `is_past`
- `papers_deadline_passed`: planned, and the deadline is before today
- `decisions_targeted` and `decisions_pending`

### Decisions

- `decisions.forum_id` now points at `forums`.
- `decisions.target_meeting_id` is optional. It must be a **planned meeting of the decision's
  forum**. Anything else is refused with the database's message.
- New columns on `v_decisions`:

| Column | Use |
|---|---|
| `target_meeting_id`, `target_meeting_date`, `target_papers_deadline`, `target_meeting_status` | Show the target meeting |
| `papers_deadline_passed` | Pending, and the target meeting's papers deadline has gone. Signal: "Papers deadline missed for <meeting>" |
| `needed_by_before_papers_deadline` | Pending, and it is needed before its papers are even due. Signal: "Needed by <date>, before the papers deadline <date>" |
| `target_meeting_after_needed_by` | Pending, and the meeting is after the needed-by date. Signal: "Target meeting is after the needed-by date" |

Show these signals as they come from the view. Don't recompute them in the browser.

- **History:** `edited` events now describe option changes by title, as
  `changes.options = { renamed: [[old, new]], added: [...], removed: [...], pros_cons_changed: [...] }`.
  Only the non-empty keys are present. A target meeting change appears as
  `changes.target_meeting_id = [old, new]`.

### Approval milestones

- `milestone_type` gains `approval` (label "Approval").
- `milestones.forum_id` names the forum that gives the approval. It is **required for approval
  milestones**. The database refuses "Choose the forum that gives this approval." otherwise.
- The 34 "Design authority approval" milestones become approvals of the Architecture Review
  Board.

### Permissions (enforced in the database)

| Action | Who |
|---|---|
| Read forums, members, meetings | Everyone in the organisation (all forums, both kinds) |
| Create, edit and deactivate an organisation-level forum; its members | Organisation admins |
| Create, edit and deactivate a workspace forum; its members | That workspace's PMO or admin |
| Create and edit meetings (date, papers deadline, status, minutes) | Whoever manages the forum, **or the forum's chair** |
| See decisions on a meeting page | Only decisions the viewer can already see (decisions keep their workspace access); counts in `v_meetings` / `v_forums` follow the same rule |
| Record, defer and reverse a decision | As before (PMO/admin or the decision maker), **plus the forum's chair** for decisions of their forum. `v_decisions.can_record` already includes this |
| Set a decision's forum or target meeting | Whoever can edit the Pending decision (`v_decisions.can_write`) |

The services will expose, per forum, `canManage` and `canManageMeetings`, so the screens don't
have to work out roles.

## 2. Governance › Boards (grown from the Decision forum page)

Grow `src/routes/governance.forum.tsx` and `src/components/decision-forum.tsx`. Don't add a new
route:

- Rename the navigation item in `src/lib/navigation.ts` from "Decision forum" to "Boards".
  Keep the `/governance/forum` route and the `Landmark` icon.
- The page title becomes "Boards". Meta: "Decision forums, their members and meetings."

### 2a. Forum list (the page's default view)

Show one row or card per forum, sorted by `sort_order`. Each one shows:

- the name, with a level badge
- the chair, or "No chair"
- the member count
- the cadence
- the next meeting date with its papers deadline. Show a warning chip when the papers deadline
  is within 3 days or has passed
- the pending decisions count

Group the list as "Organisation" and then one group per workspace forum's workspace.
Inactive forums are hidden behind a "Show inactive" toggle.

Users who can manage forums also see:

- **Add forum**: name, level, chair, cadence, papers deadline days, and "Organisation-wide"
  or a workspace (organisation admins get both; a workspace PMO gets their workspaces only)
- **Edit** and **Deactivate**/**Reactivate** on each forum

At 375px, rows collapse to cards (the same pattern as the watchlist table).

### 2b. Forum detail (`/governance/forum?forum=<id>`, a search param on the same route)

- **Header:** the name, level, chair and cadence, the papers deadline ("Papers due 5 days
  before"), and Edit (PMO/admin).
- **Members:** a list of people. PMO/admin get add (a resource picker) and remove.
- **Upcoming meetings** (planned, today or later) and **Past meetings** (past, held or
  cancelled), each with date, papers deadline, status, decisions targeted/pending and a minutes
  link.
  - Users who can manage meetings get **Add meeting** (the date, plus the papers deadline,
    prefilled from the forum and editable) and per-meeting **Edit**, **Mark held** (asks for the
    minutes link) and **Cancel**.
- **The existing agenda and meeting mode** stay on this page and work on the selected forum.
  - The meeting date picker becomes a choice of this forum's planned meetings. It falls back to
    a free date when the forum has none.
  - The agenda lists the decisions targeted at that meeting first, then the other Pending
    decisions of the forum.

### 2c. Meeting detail (`?forum=<id>&meeting=<id>`)

- **Header:** the forum, the date, the papers deadline (with a "passed" chip), the status and the
  minutes link.
- **Decisions targeted at this meeting:** ref, title, project, needed-by, status and the three
  signals. A row opens the existing decision drawer.
- The meeting-mode button records them in order (reusing the existing MeetingMode).

## 3. Decision drawer: forum and meeting pickers

In the decision form (create and edit Pending):

- **Forum:** a picker over active forums, replacing the current lookup list. Keep the same field
  position.
- **Target meeting:** a picker over the chosen forum's planned meetings, showing the date and
  "papers due <date>", with "None" as an option.
  - Clear it when the forum changes.
  - It is disabled until a forum is chosen.
  - It saves through `updatePendingDecision` with `target_meeting_id`.
- In the read view, show "Target meeting: <forum> <date> (papers due <date>)" and the
  `v_decisions` signals as chips.
- **History:** render `changes.options` as lines:
  - "Renamed option A → B"
  - "Added option C"
  - "Removed option D"
  - "Changed pros/cons of E"

  Show a target meeting change as "Target meeting: <old date> → <new date>".

## 4. Milestone form: approval type

- **Type:** add "Approval" to the type options (`milestoneTypeLabel` in `src/services/labels.ts`
  is ours to update).
- **Forum:** when the type is Approval, show a forum picker (active forums). It is required.
  - Show the database's message if it is missing.
  - The board column for this is "Approving forum". It is shown only when an approval milestone
    exists or the type is Approval.
- On the milestone list and slippage views, approval milestones show the forum name as a
  secondary line.

## 5. Done on our side (after the migrations are applied)

- `src/integrations/supabase/types.ts` regenerated.
- In services:
  - `loadGovernance` and `listDecisionEvents` read forum names from `forums`, not
    `lookup_values`.
  - New `listForums`, `getForum`, `listMeetings`, `saveForum`, `setForumActive`,
    `addForumMember`, `removeForumMember`, `saveMeeting`, `setMeetingStatus`.
  - `updatePendingDecision` accepts `targetMeetingId`.
  - The milestone service maps `approval` and `forum_id`.
- In hooks: `useForums`, `useForum(id)`, `useMeetings(forumId)` and `useForumMutations`.
- Settings: the "Decision forums" list in Settings › Lists (`decisionForums`,
  `src/services/org-settings.ts`) is removed and replaced by a link to Governance › Boards. Forums
  are now managed there.
- Runbook `docs/sql/runbook-d2.sql` (the user runs it): it retires the forum lookups, seeds
  organisation-level forums for new organisations and adds option history by title.
- Done 19/10: `loadGovernance` and `listDecisionEvents` read forum names from `forums`; the
  `Approval` milestone type label exists (the form option and forum picker are Lovable's).

## 6. Checks before handing back

- Light and dark, keyboard only, at 375px and at desktop width.
- A contributor sees no add/edit controls. A forum chair (no PMO role) can add and edit their
  forum's meetings only, and can record that forum's decisions.
- Test writes only in the outsider test organisation's "UI Test" workspace. Never write test
  data to the demo organisation.
