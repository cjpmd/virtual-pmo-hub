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
| NHS-7 | done (draft PR, awaiting review) | nhs-b/7 | [#147](https://github.com/cjpmd/virtual-pmo-hub/pull/147) | Migrations `20261123133252_nhs_7_partner_programmes` and `20261123134927_nhs_7b_ics_template` (not applied). Invitations (link), programme shares, partner-contributed projects, read-only roll-up over stored health, Partners tab, Partner programmes pages, `partner_contributions` block, ICS system programme board template. Sharing stays paused (GL-10). |

## Functions replaced in lane B

- `public.start_business_case_version(uuid)` (NHS-5, `20261123084500_nhs_5_five_case`): previous body (F4) plus the template set, stage, appraisal settings, option list fields, objectives and option years. Business cases only; lane A shouldn't need it.
- Not replaced, on purpose: `private.seed_module_defaults` (the five-case set and routes are seeded by a new trigger, `organisations_15_seed_five_case`, when `modules.five_case` turns on), `public.decide_approval_step` and `public.submit_business_case` (new triggers on `business_case_versions` and `approval_gates` do the work).
- `private.budget_baseline_guard()` (NHS-5 part 2, `20261123091727_nhs_5_five_case_baseline`): previous body (financials) with the `business_case` branch filled in and one added check in the `initial` branch. Financials only; lane A shouldn't need it unless NHS-4 touches budget baselines.
- Shared front-end files touched: `src/components/settings/modules-settings.tsx` (one import and the route card shown when `five_case` is on), `src/services/financials.ts` (`BaselineInput` takes `business_case`; `listCaseBaselines`), `src/styles.css` (a new print block at the end). New dependency `docx` 9.15.3 (package.json, package-lock.json, bun.lock).
- Shared front-end file touched: `src/features/reports/project/ApprovalGatesPanel.tsx` (business case gates read-only; one label). Two small hunks.
- NHS-7: no shared database function replaced. New block `private.rb_partner_contributions` is a new function (the dispatcher `private.report_block_resolve` is unchanged); `private.partner_unsafe_blocks` is unchanged (the block is partner-safe).
- NHS-7 shared front-end files touched (expect small merge conflicts with lane A):
  - `src/lib/modules.ts`: `cross_org` gets `navPaths: ["/portfolio/partner-programmes"]` and `reportBlocks: ["partner_contributions"]`.
  - `src/lib/navigation.ts`: a "Partner programmes" entry under Portfolio, plus the `Handshake` icon import. Nav hiding by module isn't wired on this branch; lane A's NHS-1 wiring hides it while the module is off.
  - `src/features/reports/blocks/catalogue/index.ts`: one import and one entry.
  - `src/features/reports/blocks/blocks.test.tsx`: count 39 → 40, plus one empty fixture. Lane A's integration must add its own blocks to the count.
  - `src/routes/portfolio.programmes.$programmeId.tsx`: a Partners tab while `cross_org` is on (NHS-1 also touches this file).
  - `src/routeTree.gen.ts`: regenerate after merging.

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

- **NHS-7 / B13: partners see a curated read-only roll-up through definer RPCs** (`shared_programme_overview`, `shared_programmes`, block `partner_contributions`), not wider table RLS.
  - The roll-up shows the programme, its projects, stored health, next milestone, overdue milestones, open risks and benefit totals (cash / non-cash).
  - No partner can read any other host table, and the host can't read the partner's tables.
  - Published programme packs were already visible to partners through `can_view_report` (scope share), with partner-unsafe and `hidden_block_keys` blocks withheld.
  - There's no editor for `hidden_block_keys` yet.
- **NHS-7 / B14: projects added by partners don't change the host programme's stored health** (no cross-organisation work in the health refresh). They show beside it in the roll-up and the pack block.
- **NHS-7 / B15: invitations are a link the host copies and sends** (shown once, sha256 at rest, 14 days). No email is sent: that would need an edge function (not deployable from these runs). Say if you want a `send-partner-invite` function like `send-invite`.
- **NHS-7 / B16: while sharing is paused (as shipped), creating and accepting invitations are refused** (hint `sharing_paused`), and the UI says so.
  - Existing shares and revoking still work.
  - The migration never switches sharing on; the tests switch it on inside their own transaction.
- **NHS-7 / B17: who can do what:**
  - Host workspace PMO / admin: invite, change access, end sharing, take projects out.
  - An admin of the partner organisation, signed in with the invited address (confirmed): accept on behalf of that organisation, or leave later.
  - Partner workspace PMO / admin: add or take out their own projects.
  - Every member of the partner organisation, free viewers included: read the roll-up.
- **NHS-7 / B18: the module must be on in both organisations.**
  - Host module off: partners lose the roll-up, and nothing can be shared.
  - Partner module off: its projects stop showing.
  - A contribution counts only while the share has contribute access. Dropping to view-only, or ending the share, hides it at once; the row is kept and reappears if access returns.
- **NHS-7 / B19: ending a share deletes the `entity_shares` grant row** (it is a permission, not a record; audited in both organisations). A host that is read-only (lapsed trial or subscription) can't end shares, because `zz_org_read_only` is on `entity_shares`. Say if ending a share should be allowed while read-only, as removing members is.
- **NHS-7 / B20: the "ICS system programme board" template is a global system row** (like "Funding committee"), shown only with the module on (lane A's template filter). Organisations that switch the module on but don't use NHS wording also see the ICS name; they can duplicate and rename it. Its deep-dive rules are copied from the system Programme Board.

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
- **23/11/2026 13:31–14:05 UTC, NHS-7 (package done):** the 10:28 lock was stale (no work pushed), so this run took over.
  - Audit in PR #147.
  - Migrations `20261123133252_nhs_7_partner_programmes` and `20261123134927_nhs_7b_ics_template` (`docs/sql/nhs-7-*.sql`).
  - `supabase/tests/nhs_partner_programmes.sql` (72 checks) and 11 `cross_tenant.sql` cases.
  - Local DB: `nhs_partner_programmes`, `cross_tenant`, `organisation_purge`, `read_only_mode`, `organisation_export`, `account_closure`, `nhs_modules`, `nhs_five_case`, `sample_data`, `entity_shares_paused`, `financials`, `tenant_guard`, `project_writes` and reports 1–5 pass. `reports_phase6` fails as on main.
  - Types: the new tables and RPCs spliced in from a before/after local generation.
  - Front end: Partners tab, Partner programmes list, system roll-up page, `/partner-invite`, block renderer, service tests.
  - tsc (app and scripts), vitest (709), lint (0 errors) and vite build pass. e2e, Supabase advisors and a signed-in browser check not run.
  - Lane B is complete.
