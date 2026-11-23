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

Lock: 2026-11-23T14:58Z

## Status

| Package | Status | Branch | PR | Notes |
|---|---|---|---|---|
| NHS-0 | done (draft PR, awaiting review) | nhs/0 | [#140](https://github.com/cjpmd/virtual-pmo-hub/pull/140) | Migration `20261122150000_nhs_0_modules` (not applied). Settings › Modules, NHS sign-up choice, governance roles. Nav/report-block hiding helpers exist but nothing is wired yet: NHS-1 wires them with its first module-owned item. |
| NHS-1 | done (draft PR, awaiting review) | nhs/1 | [#142](https://github.com/cjpmd/virtual-pmo-hub/pull/142) | Migrations `20261122170000_nhs_1_board_assurance`, `20261122190000_nhs_1b_assurance_blocks`, `20261122210000_nhs_1c_programme_assurance` and `20261123090000_nhs_1d_register_matrix` (not applied): BAF register; BAF report blocks; five committee templates; programme assurance ratings and the "Assurance by programme" block; register matrix and risk re-scoring tool. One-click pack reuses the forum "Create pack" button. |
| NHS-2 | done (draft PR, awaiting review) | nhs/2 | [#146](https://github.com/cjpmd/virtual-pmo-hub/pull/146) | Migration `20261123100000_nhs_2_benefit_categories` (not applied): NHS categories, measure units and default classifications seeded by the module; notional value per unit; cash / non-cash split on every benefit total; `benefits_by_category` block. |
| NHS-3 | in progress (part 1 of 3) | nhs/3 | [#148](https://github.com/cjpmd/virtual-pmo-hub/pull/148) | Migration `20261123140000_nhs_3_impact_assessments` (not applied): assessments, decisions, register view, sign-off RPCs, locked module gates, project phase gate; service and template rules. Next: part 2 screens (assessment tab, register, Settings template and gate, gaps list), part 3 approver notifications and report blocks. |
| NHS-4 | not started | | | |
| NHS-5 | lane B (see docs/nhs-run-log-b.md) | nhs-b/5 | | |
| NHS-6 | not started | | | |
| NHS-7 | lane B (see docs/nhs-run-log-b.md) | nhs-b/7 | | |
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
- **NHS-1 / D5:** the committee templates are global system rows (like "Funding committee") with the NHS names from the plan. The app hides any template containing a block whose module is off, so they only appear with board assurance on. A non-NHS organisation that switches board assurance on sees the NHS names; it can duplicate and rename them.
- **NHS-1 / D6:** the committee templates use the `nhs_assurance` rating scheme but set no risk matrix, so project risks in a pack keep the register's matrix (RB-13a). The BAF blocks use the BAF matrix (`settings.assurance.matrixKey`).
- **NHS-1 / D7:** the BAF blocks are partner-unsafe (added to `private.partner_unsafe_blocks`). `baf_summary` and `baf_above_appetite` show the whole organisation's BAF whatever the report's scope; `baf_linkage` shows only linked risks in scope unless its "in scope only" option is off.
- **NHS-1 / D8:** no separate pack engine. A forum's "Create pack for <meeting>" already makes a pack from the forum's default template, and Export to PDF prints it. Set the forum's default template to a committee template in its Report settings.
- **NHS-1 / D9:** programme assurance ratings are a history (`programme_assurance_ratings`, workspace-scoped): the newest by date is current. Workspace PMO and admins record them while the module is on (not programme managers: the rating is the board's judgement); a rating can't be edited, only removed as a mistake. Say if programme managers or forum chairs should rate too.
- **NHS-1 / D10:** `assurance_by_programme` is partner-unsafe and was added to the Trust Board (after the rating distribution) and Executive Management / PMO Board (after the status grid) system templates, by updating those two system rows; reports already made keep their blocks.
- **NHS-1 / D11:** the risk re-scoring tool and scoring the project/programme register from `risk_matrices` (D1) moved to a part 4: it touches the RAID screens, health thresholds and the RB-13a guard, so it gets its own run.
- **NHS-1 / D12 (part 4, supersedes D1 for the register):** an organisation's own matrix may now be its default when it is 5 × 5 and scored by product (the register's `risks.score` is the generated product of 1–5 levels). The organisation default is the "register matrix": Settings › Risk's size, labels and bands are copied from it by trigger and locked in the UI; the appetite threshold stays editable. Other matrices still work on forums and templates. Organisations that never choose one behave exactly as before.
- **NHS-1 / D13:** choosing a system matrix (the NHS 5×5) copies it into the organisation, because a system row can't be one organisation's default; the forum matrix list then shows "NHS 5×5 (your organisation)" beside the system one.
- **NHS-1 / D14:** changing the register matrix stamps every existing risk that followed the old default with the old matrix (`risks.risk_matrix_id`), so scores, bands and pack history don't change. This bumps those risks' `updated_at` and writes one row-change audit entry per risk.
- **NHS-1 / D15:** re-scoring is open to workspace PMO and admins (per risk's workspace), not only organisation admins; closed risks are never offered. Between two 5 × 5 matrices the proposal keeps likelihood and consequence (only the band can change); other sizes are scaled by level position. Accepted risks follow the register matrix again.
- **NHS-1 / D16:** the NHS pack doesn't switch an existing organisation's register matrix (rule 2: nothing changes existing scoring automatically). New organisations choosing NHS at sign-up get the NHS 5×5 as their register matrix (the setup wizard calls `set_register_risk_matrix` after applying the pack); others choose it in Settings › Risk. `private.seed_module_defaults` was not changed, to avoid a conflict with lane B.
- **NHS-2 / D1:** no `is_cash_releasing` column: `benefits`, `business_case_benefits` and `request_benefit_drafts` already carry `classification` (cash_releasing / non_cash_releasing / qualitative / societal). Cash-releasing = `cash_releasing`; everything else is non-cash.
- **NHS-2 / D2:** category defaults are `settings.benefits.categoryClassification` (lookup value → classification), edited by admins in Settings › Benefits; they only pre-select. Please validate the NHS defaults (quality categories qualitative, net zero and inequalities societal) in PR #146.
- **NHS-2 / D3:** the notional value per unit and the `benefits_by_category` block are core (every organisation), partner-safe like `benefits_value`, and not added to the committee templates.
- **NHS-2 / D4:** `private.seed_module_defaults` replaced again (NHS-1 body plus one branch): reconcile with lane B in NHS-8.
- **NHS-3 / D1:** the template lives in `settings.impactAssessment.template` (no new table), written only by `set_impact_assessment_template` (admins; validated, version bumped) and copied onto each assessment, so a later change never alters a completed one.
- **NHS-3 / D2:** one assessment per project or programme; each submission is a new version with its own sign-off gate; earlier gates and decisions stay as history.
- **NHS-3 / D3:** `approval_steps.decision` stays approved / rejected (no constraint dropped). "Approve with conditions" and "return for revision" are kept in `impact_assessment_decisions`; returning closes the gate as rejected and puts the assessment back to draft; a rejected assessment can be revised and resubmitted.
- **NHS-3 / D4 (settles NHS-0 D6 for module gates):** client writes can't add, change or remove gates / steps of type `impact_assessment` (`private.locked_gate_types()`; NHS-6 adds its type). `decide_approval_step` still works on them but records no conditions.
- **NHS-3 / D5:** the delivery gate is a lifecycle phase an admin picks (`set_impact_assessment_gate`): moving into or past it, or creating a project there, needs an approved assessment. Sample projects are exempt, programmes aren't gated, module off = gate off; projects already past it are listed by `impact_assessment_gaps`, never blocked.
- **NHS-3 / D6:** editors are project contributors and above (project) or workspace managers and above (programme); submitting is refused while any sign-off role has no holder.
- **NHS-3 / D7:** please validate the defaults in PR #148: five quality domains, nine protected characteristics plus health inequalities and deprivation, Medical Director then Chief Nurse, a full assessment when a negative screening score is 8 or more or any equality impact is negative, review six months after submission, no QIA panel step by default.
- **NHS-1 / note:** `nhs/0` and `nhs/1` (part 1) were merged to `main` before their migrations were applied to production. Nothing breaks while modules are off, but apply `20261122150000`, `20261122170000` and `20261122190000` before switching a module on.

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
- **22/11/2026 18:53–19:15 UTC, NHS-1 part 2:** continued on `nhs/1` (PR #142 updated).
  - Migration `20261122190000_nhs_1b_assurance_blocks` (BAF blocks, partner-unsafe list, five committee templates) and `supabase/tests/assurance_blocks.sql` (25 checks, including a published Trust Board pack).
  - Local DB suites pass: cross_tenant, purge, read-only (46), export, closure, sample data, nhs_modules (55), board_assurance (40), reports 1–5. `reports_phase6` fails as on main.
  - Block renderers, module ownership of the blocks, block library and template lists filtered by module, unit tests.
  - tsc (app and scripts), vitest (693), lint (0 errors), vite build pass. e2e and advisors not run. Types unchanged (no new public objects).
  - Next: NHS-1 part 3 on `nhs/1`.
- **22/11/2026 20:58–21:15 UTC, NHS-1 part 3:** continued on `nhs/1` (PR #142 updated).
  - Migration `20261122210000_nhs_1c_programme_assurance` (rating history table, `v_programme_assurance`, `assurance_by_programme` block, partner-unsafe list, two templates) and `supabase/tests/programme_assurance.sql` (34 checks); `ct_fixture.sql` gets a hand row for the new table.
  - Local DB suites pass: cross_tenant, purge, read-only (46), export (29), closure (82), sample data (27), nhs_modules (55), board_assurance (40), assurance_blocks (25), reports 1–5. `reports_phase6` fails as on main.
  - Assurance rating card on the programme Status tab (module on only), block renderer, unit tests. Types spliced from the local generator (table and view only).
  - tsc (app and scripts), vitest (700), lint (0 errors), vite build pass. e2e and advisors not run.
  - Next: NHS-1 part 4 (re-scoring tool, register matrix) on `nhs/1`.
- **23/11/2026 08:57–09:20 UTC, NHS-1 part 4 (package done):** continued on `nhs/1` (PR #142 updated).
  - Migration `20261123090000_nhs_1d_register_matrix` (RB-13a guard relaxed for 5 × 5 product matrices, settings.risk sync triggers, `set_register_risk_matrix`, `risk_rescore_candidates`, `rescore_risks`) and `supabase/tests/register_matrix.sql` (44 checks); `cross_tenant.sql` cases for the three RPCs.
  - Local DB suites pass: cross_tenant, purge, read-only (46), export (29), closure (82), sample data (27), nhs_modules (55), board_assurance (40), assurance_blocks (25), programme_assurance (34), reports 1–5. `reports_phase6` fails as on main.
  - Settings › Risk: Risk register matrix card (admins), Re-score risks card (PMO / admins), labels and bands locked while the organisation has its own matrix; NHS sign-up sets the NHS 5×5; forum report settings copy updated. Types spliced from the local generator (three RPCs).
  - tsc (app and scripts), vitest (707), lint (0 errors), vite build pass. e2e and advisors not run.
  - Next: NHS-2 on `nhs/2` (from `nhs/1`).
- **23/11/2026 09:58–10:20 UTC, NHS-2 (package done):** new branch `nhs/2` from `nhs/1`, draft PR #146 (audit in the PR).
  - Migration `20261123100000_nhs_2_benefit_categories` and `supabase/tests/benefit_categories.sql` (29 checks); `nhs_modules.sql` and `board_assurance.sql` fingerprints leave out what the module adds.
  - Local DB suites pass: cross_tenant, purge, read-only (46), export (29), closure (82), sample data (27), nhs_modules (55), board_assurance (40), assurance_blocks (25), programme_assurance (34), register_matrix (44), reports 1–5. `reports_phase6` fails as on main.
  - Register Category column with default classification, cash / non-cash split on register, dashboard and business case, measure unit and notional value editor, Settings › Benefits defaults card, Settings › Lists measure units, block renderers. Types: `benefit_measures` spliced from the local generator.
  - tsc (app and scripts), vitest (723), lint (0 errors), vite build pass. e2e and advisors not run.
  - Next: NHS-3 on `nhs/3` (from `nhs/2`).
- **23/11/2026 13:57–14:25 UTC, NHS-3 part 1:** new branch `nhs/3` from `nhs/2`, draft PR #148 (audit in the PR).
  - Migration `20261123140000_nhs_3_impact_assessments` and `supabase/tests/impact_assessments.sql` (63 checks); `cross_tenant.sql` cases for the 7 RPCs, `ct_fixture.sql` rows for both tables.
  - Local DB suites pass: cross_tenant (0 leaks), purge, read-only (46), export (29), closure (82), sample data (27), nhs_modules (55), board_assurance (40), assurance_blocks (25), programme_assurance (34), register_matrix (44), benefit_categories (29), approval_reminders, notifications, collections, reports 1–5. `reports_phase6` fails as on main.
  - `data/impact-assessment.ts` (templates and rules mirroring the SQL) and `services/impact-assessments.ts`, with unit tests. Types spliced from the local generator. No screens yet.
  - tsc (app and scripts), vitest (737), lint (0 errors), vite build pass. e2e and advisors not run.
  - The lock was taken on `nhs/2` (commit 53011c5) before `nhs/3` existed; it is cleared here.
  - Next: NHS-3 part 2 (screens) on `nhs/3`.
