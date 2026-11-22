# NHS module — unattended run log

Scheduled Claude Code runs work through `docs/nhs-module-plan.md` while Chris is away.
Each run reads this file on the newest package branch, does the next piece of work, and appends an entry.

## Rules for unattended runs (override CLAUDE.md "wait for my go-ahead" for these runs only)

- **Never** apply migrations to the live Supabase project, run SQL against it, deploy edge functions, change Netlify, or push to / merge into `main`.
- Work on chained package branches: `nhs/0` from `nhs/base`, `nhs/1` from `nhs/0`, and so on. Each package gets one PR whose base is the previous package branch (`nhs/0` → base `nhs/base`). Open PRs as drafts.
- A package that needs more than one run continues on the same branch and updates its PR.
- Migrations go in `supabase/migrations/` as files only. Test them against a local Supabase stack (`npx supabase start`) if Docker works; otherwise record "DB tests not run" in the PR.
- Finish checks from CLAUDE.md: `npx tsc --noEmit`, `npx tsc --noEmit -p scripts`, `npx vitest run`, `npm run lint`, `npx vite build`.
- Where the plan says "stop and ask", take the most reasonable option, record the decision under "Decisions for Chris" below and in the PR, and carry on.
- Destructive SQL (drop/delete/truncate) goes in its own clearly marked section of a `docs/sql/` file for Chris to run, never in an auto-applied migration.
- If a package is blocked, write why here, mark it `blocked`, and move to the next package whose dependencies are met.
- AGENTS.md says to present SQL and stop before any database change. For these runs: write the SQL to `docs/sql/nhs-<n>-<name>.sql` and as a migration file, test it on the local Postgres (`supabase/tests/local/run.sh migrate`, then the relevant suites, including `cross_tenant.sql`, `read_only_mode.sql` and `organisation_purge.sql`), regenerate types locally as the report builder did, and leave applying to production for Chris. Every other AGENTS.md rule applies (tenant columns, RLS, `zz_org_read_only` trigger, revoked execute, never edit an existing migration).

### Known conflicts the NHS-0 audit must resolve (found 22/11/2026)

- `organisations.settings.sector` already exists (GL-8) with `university | public_sector | general`, a check constraint and `create_organisation(..., p_sector)`. Don't introduce `'general' | 'nhs'` as a parallel field. Default approach: add `nhs` as a fourth sector value (new migration extending the constraint and `private.sector_org_settings` / `seed_org_defaults`; April financial year), and keep modules in `settings.modules` as the plan says. Record the choice under Decisions.
- An `nhs_assurance` rating scheme already exists (RB Phase 2). NHS-1 reuses or extends it rather than seeding a duplicate.
- Risk matrices, approval gates, `record_links` and `entity_shares` exist from the report builder; new partner shares are paused (GL-10 follow-up), so NHS-7 must work with that switch and not turn it on.

- Lock: set `Lock:` below to the run's start time (UTC) and push before starting work; clear it when done. A run that finds a lock newer than 3 hours exits without changes.

Lock: none

## Status

| Package | Status | Branch | PR | Notes |
|---|---|---|---|---|
| NHS-0 | not started | | | |
| NHS-1 | not started | | | |
| NHS-2 | not started | | | |
| NHS-3 | not started | | | |
| NHS-4 | not started | | | |
| NHS-5 | not started | | | |
| NHS-6 | not started | | | |
| NHS-7 | not started | | | |
| NHS-8 | not started | | | |

## Decisions for Chris

(none yet)

## Run entries

(newest last)
