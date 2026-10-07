<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- Read the relevant specification in `docs/design/` or `docs/*.md` before implementing a change — the written specification is authoritative.
- Read and write application records only through `src/services/`; components and routes must never query Supabase directly.
- Persist real records in Supabase only; do not add localStorage or mock-data persistence paths.
- Read health and RAG values from the database `v_*` views; never calculate health in browser code.
- Route all record mutations through the shared write helper so `updated_at` optimistic concurrency remains enforced.
- Treat portfolios, programmes, and projects as archivable records; never hard-delete them.
- Make every schema change in a new migration and never edit an existing migration.
- Before any database change, present the proposed SQL to the user and stop; apply it only after explicit approval.
- Every new tenant table must include `organisation_id` and `workspace_id`, use composite foreign keys to tenant-scoped parents, enable RLS, and follow the existing `private.my_workspace_ids(...)` workspace policy pattern.
- Revoke execute from `public` and `anon` for every new private database function.
- Regenerate `src/integrations/supabase/types.ts` after an approved schema change; never hand-edit generated database types.
- Keep changes focused; do not rewrite whole files or restyle pages outside the requested scope.
- Business case status changes go only through SECURITY DEFINER RPCs with an explicit permission check; the version trigger blocks status edits from plain client updates (current_user = 'authenticated'), so no session setting can bypass it.
