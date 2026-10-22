@AGENTS.md
@docs/build-plan.md

Working style: plan first and wait for my go-ahead; scoped str_replace edits, never whole-file rewrites;
one work package per session; finish with `npx tsc --noEmit`, `npx tsc --noEmit -p scripts`,
`npx vitest run`, `npm run lint` and `npx vite build` all passing, and a short summary of what changed and what I need to check by hand.

Migrations: avoid destructive statements (drop, delete, truncate) where an additive alternative
exists. If one is unavoidable, don't apply it through the Supabase tool (the confirmation can't
reach me): put it in its own section of the docs/sql file and ask me to run it in the SQL editor.
