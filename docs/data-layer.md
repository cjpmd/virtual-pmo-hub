# Data layer (Stage 4)

How screens read and write Supabase. Stage 4b built this for one slice (programmes, the
projects list, project detail); Stage 4c applied it to every screen.

## Layers

| Layer       | Where                                 | Rule                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client      | `src/integrations/supabase/client.ts` | One browser client (Lovable convention). Publishable key only.                                                                                                                                                                          |
| Services    | `src/services/<domain>.ts`            | Plain async functions, no React. Return view models (labels such as "At Risk", ISO dates, database ids). Never compute health: read the `v_*` views. Every result goes through `unwrap()`; every write through `src/services/write.ts`. |
| Query hooks | `src/hooks/use-<domain>.ts`           | `useQuery` / `useMutation` around the services, keyed by `qk` under the current organisation.                                                                                                                                           |
| Screens     | `src/routes`, `src/components`        | Call hooks only, never `supabase` directly. Render reads with `<QueryState>`. "Today" comes from `src/lib/today.ts` (organisation time zone), never a literal date.                                                                     |

### Reads: embedding versus parallel queries

- **Embed** (PostgREST `table(child(...))`) for one-to-many reads with a single, unambiguous FK, e.g. benefits → measures → targets/measurements, lessons → project types and improvement actions, collections → collection_projects, resources → skills and leave. Where a table has more than one FK path to the same parent, name it (`decision_options!decision_options_decision_id_workspace_id_fkey(...)`).
- **Parallel queries joined by id** where embedding is ambiguous (anything pointing at `resources` several times: owner, sponsor, manager...) and for views, which can't be embedded (`v_work_items`, `v_projects`, `v_roadmap_items`, health views).

### Services by domain

| Service                                                           | Covers                                                                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hierarchy.ts`, `entities.ts`                                     | portfolios, programmes, projects (read; create, edit, close/reopen, archive), people, phases, permissions. Project money is read-only here (see below) |
| `analytics.ts`, `trends.ts`                                       | portfolio overview (views) and trends (`health_snapshots`)                                                                                             |
| `project-records.ts`                                              | milestones, risks, issues, forecast history, organisation-wide RAID                                                                                    |
| `benefits.ts`, `benefits-value.ts`, `benefits-map.ts`             | benefits domain (load + pure calculations)                                                                                                             |
| `decisions.ts`                                                    | decisions, assumptions, change requests                                                                                                                |
| `dependencies.ts`, `roadmaps.ts`, `requests.ts`, `collections.ts` | as named; collections also load committee-pack facts                                                                                                   |
| `committee-packs.ts`                                              | issued packs (`committee_packs`): list, issue. Issued packs are immutable                                                                              |
| `lessons.ts`, `gates.ts`                                          | lessons, improvement actions, phase reviews; stage-gate checklist and lifecycle helpers                                                                |
| `work-items.ts`, `issued-tasks.ts`, `status-reports.ts`           | project tasks (diff-based save), portfolio and personal task views; issued work (offers); status reports                                               |
| `resources.ts`, `assurance.ts`                                    | capacity planning; declared versus evidenced RAG                                                                                                       |
| `integrations.ts`, `favourites.ts`, `org-settings.ts`, `auth.ts`  | Microsoft 365 state, starred items, organisation settings, sign-up/sign-in                                                                             |

## Writes (`src/services/write.ts`)

- `insertRow` / `insertRows` select the row back; `updateRow` sends `.eq("updated_at", lastSeen)` whenever the screen edited a loaded copy. If no row comes back it reads the row again: a newer `updated_at` means **"Changed by someone else, reload to see the latest"** (`conflict`), the same `updated_at` means RLS refused (`forbidden`), no row means it is gone (`not_found`).
- Tenant columns (`organisation_id`, `workspace_id`) and `ref` are filled by triggers; services send only the parent id. Tables with no tenant trigger (`portfolios`, `ms_connections`) pass their parent explicitly.
- The hierarchy is never deleted: closing sets `state = closed` with a reason, archiving sets `archived_at`. Record-level deletes (risks, milestones...) are offered only when `project_permissions().can_delete` is true.
- **Own writes:** the helper remembers the `updated_at` each of its writes returned, per row, and `updateRow` sends the newer of that and the caller's `lastSeen`. A screen still holding a copy from before its own last save (a refetch in flight, a debounced form, the settings queue, a cached list) therefore doesn't trip the check on itself, while someone else's later save, being newer than both, is still reported. Callers just pass the `updated_at` they loaded; none keeps its own copy.

## Project money

Project budget, actual and forecast come from the financials tables (Financials F2, `docs/financials-and-business-cases.md`): `v_projects.budget` is the current baseline, `actual` the actuals to the cut-off and `forecast` the estimate at completion, with `has_baseline`. Creating a project with a budget inserts an `initial` row into `budget_baselines`; editing a project never writes money (the dialog shows it read-only). Baselines change through an approved change request or a PMO adjustment, from the Financials tab (F3).

`financials.ts` reads the Financials tab in one parallel load (summary view, lines, values, baselines, import log, closed months) and writes cells one row at a time through `write.ts`. Month-end close, reopen and the actuals import are RPCs. `financials-calc.ts` and `actuals-import.ts` are pure (unit-tested): month arithmetic, the cut-off and EAC sums the view uses, and the import preview. Financial mutations refresh the roll-ups without awaiting them, so the grid's save queue and the import dialog don't wait for every health view on the page to reload.

## Boards writing to records

- `BoardWorkspace` is editable only with `onRecordChange`; without it the board is read-only. Nothing is ever saved only in the browser (the prototype record, entity and dependency stores are gone).
- `useBoardRecordSync` maps board columns to service fields with a per-board `toInput()`, merges a record's edits and writes after 700 ms. Pending edits are never dropped: they flush on blur, before route changes, when the tab is hidden and on unmount. Writes to one record run in order, each carrying the previous write's `updated_at`.
- The project task screen uses the same rules through `saveTaskChanges(prev, next)`, which writes only the difference (inserts, soft deletes, field changes, assignees, links, checklist, order).

## Query keys and invalidation

```
["me", userId, "memberships"]                              profile + organisations (auth gate)
["org", orgId, "portfolios" | "programmes", ...]
["org", orgId, "projects", "list" | "detail", code]
["org", orgId, "projects", projectId, "milestones" | "raid" | "tasks" | "status-reports" | ...]
["org", orgId, "projects", "dependencies" | "roadmaps" | "all-tasks" | "assurance" | "collections" | "issued-tasks" | "resource-planning" | ...]
["org", orgId, "benefits" | "governance" | "lessons" | "requests" | "settings" | "integrations" | "favourites"]
```

- Anything whose numbers feed health sits under `projects`, so one invalidation refreshes it.
- **Current rule:** after a write that can change health, refresh the whole project → programme → portfolio chain (`invalidateRollups`: `projects.all`, `programmes.all`, `portfolios.all`). Simple and always correct.
- **Later optimisation:** invalidate only the affected project, its programme and portfolio, and the specific organisation-wide lists, once query volume makes the full refresh noticeable.

## Errors (`src/services/service-error.ts`)

- `ServiceError.kind`: `unauthenticated | forbidden | not_found | conflict | invalid | network | timeout | unknown`, with a message written for people. `timeout` (Postgres 57014, or HTTP 500/504 from PostgREST without a more specific code) reads "This is taking too long — please try again."
- Reads: `<QueryState>` shows a skeleton, an inline error with retry, or a not-found card. Writes: one `MutationCache.onError` toast, unless a mutation opts out (`meta: { silent: true }`) and shows the error inline.
- Only `network` and `unknown` reads are retried (twice); a `timeout` is not, as it would most likely time out again. Mutations are never retried.
- The settings save queue doesn't wait for the organisation's queries to refetch before taking the next edit.

## Permissions

- `project_permissions(project)` returns `can_edit`, `can_delete`, `can_manage_project`; `my_workspace_roles()` returns the user's role per workspace. They decide which buttons appear ("don't show buttons that always fail"); RLS still enforces every write.
- The header shows the effective role in the workspace being viewed; the organisation role is in the profile menu.

## Still browser-local, by design

| What                                                                         | Why                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprints, backlog, delivery settings, justifications (`sprints.ts`)           | Not migrated until the sprints phase (schema §6). Keyed by project code, generated from the Supabase project; closures default to the organisation's holiday calendars. |
| Selected portfolio, recent items, notification read state, saved board views | Per-viewer conveniences.                                                                                                                                                |

## Prototype data still in the repo

`src/data/*` and `src/services/pmo.ts` remain only as the parity fixture (`scripts/health-parity.ts`) and seed source (`scripts/generate-seed.ts`). Static configuration also lives there (`settings-data`, `lifecycle` defaults, Microsoft permission descriptions, types).
