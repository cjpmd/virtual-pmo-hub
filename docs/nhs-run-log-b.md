# NHS module — lane B run log

Lane B builds **NHS-5 (Five Case Model business cases)** and **NHS-7 (cross-organisation / ICS programmes)** in parallel with lane A, which builds NHS-1 to NHS-4, NHS-6 and NHS-8 on the `nhs/*` branches (log: `docs/nhs-run-log.md` on the newest `nhs/<n>` branch). Both packages depend only on NHS-0.

## Rules for lane B runs

- Every rule in `docs/nhs-run-log.md` ("Rules for unattended runs" and "Known conflicts") applies here too.
- Branches: `nhs-b/5` (from `nhs/0`) for NHS-5, then `nhs-b/7` (from `nhs-b/5`) for NHS-7. PR bases: `nhs-b/5` → `nhs/0`; `nhs-b/7` → `nhs-b/5`. Never push to `nhs/*` branches or `main`.
- Record status, decisions and run entries in **this file only**. Don't edit `docs/nhs-run-log.md` on lane B branches.
- **Shared functions:** where a package must `create or replace` a function that other packages also replace (for example `private.seed_module_defaults`, report block registries or dispatchers), keep the change as small as possible and list the function under "Functions replaced in lane B" below. Lane A's integration step uses that list to write one reconciliation migration that combines both lanes' versions.
- Migration file names use the real current UTC timestamp, as usual.
- Lock: set `Lock:` below to the run's start time (UTC) and push before starting work; clear it when done. A run that finds a lock newer than 90 minutes exits without changes.

Lock: none

## Status

| Package | Status | Branch | PR | Notes |
|---|---|---|---|---|
| NHS-5 | done (draft PR, awaiting review) | nhs-b/5 | [#145](https://github.com/cjpmd/virtual-pmo-hub/pull/145) | Migrations `20261123084500_nhs_5_five_case` and `20261123091727_nhs_5_five_case_baseline` (not applied). Stages, objectives, appraisal aid, approval routes and gates, route editor in Settings › Modules, Word/PDF export, budget baseline from an approved case. |
| NHS-7 | not started | | | |

## Functions replaced in lane B

- `public.start_business_case_version(uuid)` (NHS-5, `20261123084500_nhs_5_five_case`): previous body (F4) plus the template set, stage, appraisal settings, option list fields, objectives and option years. Business cases only; lane A shouldn't need it.
- Not replaced, on purpose: `private.seed_module_defaults` (the five-case set and routes are seeded by a new trigger, `organisations_15_seed_five_case`, when `modules.five_case` turns on), `public.decide_approval_step` and `public.submit_business_case` (new triggers on `business_case_versions` and `approval_gates` do the work).
- `private.budget_baseline_guard()` (NHS-5 part 2, `20261123091727_nhs_5_five_case_baseline`): previous body (financials) with the `business_case` branch filled in and one added check in the `initial` branch. Financials only; lane A shouldn't need it unless NHS-4 touches budget baselines.
- Shared front-end files touched: `src/components/settings/modules-settings.tsx` (one import and the route card shown when `five_case` is on), `src/services/financials.ts` (`BaselineInput` takes `business_case`; `listCaseBaselines`), `src/styles.css` (a new print block at the end). New dependency `docx` 9.15.3 (package.json, package-lock.json, bun.lock).
- Shared front-end file touched: `src/features/reports/project/ApprovalGatesPanel.tsx` (business case gates read-only; one label). Two small hunks.

## Decisions for Chris

- **NHS-5 / B1: approval routes live in `organisations.settings.fiveCase.approvalRoutes`**, not a new table: `{stage: [{name, governanceRole, minValue}]}`, written only through `set_business_case_approval_routes` (admins, validated). Each step must name a governance role, because a step without one could be decided by any workspace contributor.
- **NHS-5 / B2: default routes are placeholders to validate.** NHS: SOC = Director of Finance + Executive Management Team; OBC/FBC = Director of Finance + Trust Board, plus ICB at £15m whole-life cost and (FBC) NHS England at £50m; single-stage = Director of Finance + Trust Board at £1m. Board-level steps are "recorded by Head of PMO". General: Executive sponsor (SOC), Finance lead + Investment board (OBC/FBC), Executive sponsor + Finance lead (single). The thresholds in particular need checking against current NHS delegated limits.
- **NHS-5 / B3: no `decisions` row is written** when a business case gate is decided (F1 §2.3 planned one through `decide_business_case`, which was never built). The step decisions, the version's `decided_at` / `recorded_by` and the audit log are the record. Say if you want a decision row too.
- **NHS-5 / B4: approving a stage supersedes only earlier approved versions of the same stage.** An approved SOC stays approved when the OBC is approved.
- **NHS-5 / B5: stage rules.** Once a stage is approved the case can't go back, can move at most one stage beyond the highest approved stage, and can't switch between single-stage and staged. Before any approval any stage can be chosen (so small schemes can start at OBC).
- **NHS-5 / B6: the appraisal (PV, NPV, NPSV, BCR) is worked out on screen** (`services/five-case.ts`, unit-tested) from the stored per-year figures: one discount rate (default 3.5 %) for all years, optimism bias on costs. It is labelled as an aid, not health or RAG, so the "no calculation in the browser" rule doesn't apply. The Green Book's lower long-term rate after year 30 isn't modelled.
- **NHS-5 / B7: template set names come from the app** (Standard, Five Case Model), not a lookup list; adding a lookup list changed the NHS-0 test's "existing lists unchanged" fingerprint.
- **NHS-5 / B8: with the module switched off**, existing staged cases can still be revised (the stage carries forward), but objectives and appraisal years aren't copied into the new version (they stay on the earlier one) and can't be edited.

- **NHS-5 / B9: budget baseline from a business case follows docs/financials-and-business-cases.md**: the total defaults to the preferred option's delivery cost (a different total needs the PMO and a reason); a manager or PMO sets the first baseline, replacing one from a later case (FBC after OBC) is the PMO's; each version once; an SOC can't set one. An `initial` baseline is now refused when the project has an approved (non-SOC) business case, as that document's D5 says. This applies to every organisation, but only bites once a case is approved, which today needs the `five_case` module.
- **NHS-5 / B10: PDF is the browser's print dialog** (A4 portrait, one page per case), not a server PDF, like the 1.2 pack export. Word is built in the browser with the `docx` library (new dependency, loaded on demand, ~67 kB gzip). Headings use Word heading styles; numbered lists are plain numbered paragraphs.
- **NHS-5 / B11: routes editor changes apply to versions submitted afterwards**; open gates keep their steps. A stage with no steps opens no approval, so its versions can't be approved: the editor says so.
- **NHS-5 / B12:** Settings › Modules still shows "Screens for this module arrive in a later release" for every module (NHS-0 text in a shared file); lane A's integration should drop it for built modules.

## Run entries

(newest last)

- **23/11/2026 08:27–09:00 UTC, NHS-5 part 1:** the 22/11 21:00 lock was stale (no work had been pushed), so this run took over.
  - Audit in the PR. F5 (`decide_business_case`, business case baselines) was never built, so approval now runs through `approval_gates` and governance roles.
  - Migration `20261123084500_nhs_5_five_case` (`docs/sql/nhs-5-five-case.sql`), `supabase/tests/nhs_five_case.sql` (57 checks), `cross_tenant.sql` cases.
  - Local DB: `nhs_five_case`, `nhs_modules`, `cross_tenant`, `organisation_purge`, `read_only_mode`, `organisation_export`, `account_closure`, `sample_data`, `tenant_guard`, `financials` and `project_writes` pass. `rls_matrix` ("no subscription record") and `convert_request_to_project` ("more than one row") fail the same way without this migration.
  - Types: the new objects spliced in from a before/after local generation (full regeneration re-adds `committee_packs`).
  - Front end: `services/five-case.ts` (+ tests), business case page panels.
  - tsc (app and scripts), vitest (688), lint (0 errors) and vite build pass. e2e, Supabase advisors and a signed-in browser check not run.
  - Next run (NHS-5 part 2): approval-route editor in Settings › Modules, Word/PDF export in Five Case structure, business case → budget baseline (financial case).
- **23/11/2026 09:16–09:50 UTC, NHS-5 part 2 (package done):**
  - Migration `20261123091727_nhs_5_five_case_baseline` (`docs/sql/nhs-5-five-case-baseline.sql`): business case → budget baseline, FK to `business_case_versions`.
  - Settings › Modules › Business case approval routes (`five-case-routes-settings.tsx`); business case page Export (Word, PDF) and Budget baseline panel.
  - Local DB: `nhs_five_case` (69), `financials` (0 failures; one label updated), `project_writes`, `tenant_guard`, `nhs_modules`, `read_only_mode`, `organisation_export`, `account_closure`, `sample_data`, `cross_tenant`, `organisation_purge` pass.
  - Types: the new foreign key spliced in from a local generation.
  - tsc (app and scripts), vitest (700), lint (0 errors) and vite build pass. Word output checked with python-docx and the print layout as a PDF. e2e, Supabase advisors and a signed-in browser check not run.
  - Next run: NHS-7 on `nhs-b/7` from `nhs-b/5`.
