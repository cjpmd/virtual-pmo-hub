# Data layer (Stage 4)

How screens read and write Supabase. Stage 4b built this for one slice: programmes, the
projects list, and project detail (overview, milestones, RAID). Stage 4c repeats it everywhere
else.

## Layers

| Layer | Where | Rule |
|---|---|---|
| Client | `src/integrations/supabase/client.ts` | One browser client (Lovable convention). Publishable key only. |
| Services | `src/services/<domain>.ts` | Plain async functions, no React. One supabase-js call per table or view, run in parallel and joined by id. Every result goes through `unwrap()` / `unwrapWrite()`. Returns view models (labels such as "At Risk", not enum values). Never computes health: it reads the `v_*` views. |
| Query hooks | `src/hooks/use-<domain>.ts` | `useQuery` / `useMutation` around the services. Keys come from `qk` and are scoped to the current organisation. |
| Screens | `src/routes`, `src/components` | Call hooks only, never `supabase` directly. Render reads with `<QueryState>`. Format with `useFormat()`; "today" comes from `src/lib/today.ts`. |

## Query keys (`src/services/query-keys.ts`)

```
["me", userId, "memberships"]                 profile + organisations (auth gate)
["org", orgId, "portfolios", "list"]
["org", orgId, "programmes", "list" | "detail", id]
["org", orgId, "projects", "list" | "detail", code]
["org", orgId, "projects", projectId, "milestones" | "raid" | "can-edit"]
["org", orgId, "resources", "list"]   ["org", orgId, "phases"]
```

- Everything tenant-scoped sits under `["org", orgId]`.
- Switching organisation removes the whole `["org"]` subtree. Signing out, or a different user signing in, clears the cache.
- After any record write, invalidate the record's key plus `projects.all`, `programmes.all` and `portfolios.all`, because health roll-ups depend on records.

## Errors (`src/services/service-error.ts`)

- Services throw `ServiceError` with a `kind`: `unauthenticated | forbidden | not_found | conflict | invalid | network | unknown`.
- Each error carries a message written for people. Trigger messages (`P0001`) pass through unchanged.
- An update or delete that RLS silently filters returns no rows. `unwrapWrite()` turns that into `forbidden`. Writes therefore always `.select("id")` the row back.
- **Reads:** `<QueryState>` shows a skeleton, then an inline error with a retry, or a not-found card.
- **Writes:** one `MutationCache.onError` in `src/router.tsx` shows a toast. A mutation can opt out with `meta: { silent: true }` when its screen shows the error inline.
- **Retries:** only `network` and `unknown` failures are retried, at most twice. Mutations are never retried.

## Boards writing to records

- `BoardWorkspace` has a server mode: pass `onRecordChange`. It then reports `create`, `update(id, patch)` and `delete(ids)`, stores nothing in localStorage, and offers no undo.
- `useBoardRecordSync` maps board column keys to service fields with a per-board `toInput()`. It merges a record's edits and writes them after 700 ms, and holds back values that aren't valid yet, such as a half-typed date.
- Mappers so far: `riskInputFromBoard` and `issueInputFromBoard` in `project-raid.tsx`, and `milestoneInputFromBoard` in `project-milestones.tsx`.
- Read-only users get non-editable columns. Boards are keyed on the permission because the board copies its columns when it mounts.

## Permissions

`public.project_permissions(project)` (SECURITY INVOKER) returns `can_edit` (RLS `can_edit_project`), `can_delete_records` (workspace manager) and `can_manage_project`. It only drives what the UI shows; RLS still enforces every write (`supabase/tests/project_writes.sql`).

## Temporary bridge (removed in 4c)

Screens not yet migrated still link with prototype ids. `src/services/legacy-bridge.ts` maps prototype project ids to codes and prototype programme ids to uuids, and back again. This lets unmigrated tabs on the project and programme pages read the demo organisation's prototype record. Outside the demo organisation, those tabs show a placeholder.
