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

Account settings are a distinct Settings section backed by the existing browser-local settings store; this prototype has no authentication service, so log out only returns to the sign-up demo.
- Portfolio/programme/project create, edit and close go through src/services/entity-store.ts (browser-local, mutates shared mock arrays, root re-renders on change) — keeps services swappable for a real backend.
- Forecasting lives in src/services/forecast.ts (pure, vitest-tested); sprint/work-item data in src/services/sprints.ts (browser-local) — one engine so every screen shows identical numbers, swappable for Postgres later.
- Board items (risks, issues, benefits, decisions, etc.) add/edit/close/delete via BoardWorkspace + src/services/record-store.ts (per-board browser-local deltas) — one consistent behaviour, cleared by Restore sample data.
- Dependency records use a dedicated browser-local store shared by the register, map and project views, because their linked endpoints must stay valid across views.
