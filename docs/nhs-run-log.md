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

Lock: 2026-11-22 18:53 UTC

## Status

| Package | Status | Branch | PR | Notes |
|---|---|---|---|---|
| NHS-0 | done (draft PR, awaiting review) | nhs/0 | [#140](https://github.com/cjpmd/virtual-pmo-hub/pull/140) | Migration `20261122150000_nhs_0_modules` (not applied). Settings › Modules, NHS sign-up choice, governance roles. Nav/report-block hiding helpers exist but nothing is wired yet: NHS-1 wires them with its first module-owned item. |
| NHS-1 | in progress (part 1 of 2 done) | nhs/1 | [#142](https://github.com/cjpmd/virtual-pmo-hub/pull/142) | Migration `20261122170000_nhs_1_board_assurance` (not applied): strategic risk register (BAF), score history, actions, BAF links; Governance › Board assurance. Part 2: re-scoring tool, NHS report blocks, committee templates, one-click pack, programme assurance ratings. |
| NHS-2 | not started | | | |
| NHS-3 | not started | | | |
| NHS-4 | not started | | | |
| NHS-5 | not started | | | |
| NHS-6 | not started | | | |
| NHS-7 | not started | | | |
| NHS-8 | not started | | | |

## Decisions for Chris

- **NHS-0 / D1: NHS is a pack, not a fourth sector.** `settings.pack = 'nhs'` sits beside the GL-8 `sector = 'public_sector'` (April financial year). Adding `nhs` to the sector would mean dropping and re-adding `organisations_settings_sector_check` (destructive) and another `create_organisation` signature. Code checks modules, never the pack.
- **NHS-0 / D2:** `governance_role_holders` is organisation-scoped (no `workspace_id`) and was added to the AGENTS.md exception list, pending your approval.
- **NHS-0 / D3:** holders are organisation members (profiles), not resources.
- **NHS-0 / D4:** deciding a governance-role step needs workspace contributor or above and the role (or deputy). A free viewer can't approve. Say if NHS approvers should be able to approve as free viewers.
- **NHS-0 / D5:** direct client writes to approval decision fields are refused for every step. The UI already uses `decide_approval_step`.
- **NHS-0 / D6 (for NHS-3):** contributors can still delete or edit undecided approval steps. Module-created gates (QIA sign-off) need locking so a required step can't be removed.
- **NHS-0 / D7:** module switches can be turned on before their screens exist. Settings › Modules says each arrives in its package.

- **NHS-1 / D1:** the NHS 5×5 is the matrix for strategic risks (`settings.assurance.matrixKey`, set by the NHS pack), not yet for project and programme risks. The RB-13a guard refuses an organisation default matrix until the register scores from `risk_matrices`; part 2 proposes that change together with the re-scoring tool.
- **NHS-1 / D2:** `strategic_risks`, `strategic_risk_actions` and `strategic_risk_scores` are organisation-scoped (no `workspace_id`), added to the AGENTS.md exception list pending your approval.
- **NHS-1 / D3:** strategic risks are closed, never deleted; PMO and admins can delete actions.
- **NHS-1 / D4:** with the module off, BAF data stays readable; writes and new links are refused.

## Run entries

(newest last)

- **22/11/2026 14:55–15:20 UTC, NHS-0:** audited (in PR #140) and built the whole package.
  - Migration and `supabase/tests/nhs_modules.sql` (55 checks).
  - `cross_tenant.sql` cases plus a fixture row for the new table and RPCs.
  - Registry, settings, Settings › Modules, NHS sign-up option, terminology and lists.
  - Unit tests.
  - Local DB suites pass, except `reports_phase6.sql`, which fails as on main (shim has no cron job).
  - tsc (app and scripts), vitest (676), lint (0 errors) and vite build all pass.
  - e2e and Supabase advisors not run.
  - Types: the new objects were spliced in from the local generator, because a full local regeneration re-adds the hand-dropped `committee_packs`.
  - Next: NHS-1 (from `nhs/0`).
- **22/11/2026 15:54–16:15 UTC, NHS-1 part 1:** audit in PR #142.
  - Migration (BAF tables, view, links trigger, assurance seeding) and `supabase/tests/board_assurance.sql` (40 checks); `nhs_modules.sql` adjusted for the new seeds.
  - Local DB suites pass (cross_tenant, purge, read-only, export, closure, reports 1–5); `reports_phase6` fails as on main.
  - Board assurance page, nav hiding wired (section tabs, flyout, command palette), Risk appetite list, unit tests.
  - tsc (app and scripts), vitest (683), lint (0 errors), vite build pass. e2e and advisors not run.
  - Note: `nhs/0` was merged to `main` (#141) before this run.
  - Next: NHS-1 part 2 on `nhs/1`.
