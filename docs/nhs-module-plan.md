# ORMO PMO — NHS Module Build Plan

Status: in progress (unattended runs from 22/11/2026). Progress and decisions: `docs/nhs-run-log.md`.
Owner: Chris McDonald
Applies to: `cjpmd/virtual-pmo-hub`, Supabase project `xvdlmtkzfmbcegkmampz`

## Purpose

Add a set of capabilities that make ORMO feel built for NHS trust, ICB and ICS PMOs rather than adapted for them, while keeping each one usable by other sectors (universities, councils, housing associations) that run similar efficiency, impact assessment and assurance processes.

**Modules, not one switch.** Each capability ships as an individually toggleable **module**. A **sector pack** is just a recommended bundle of modules plus terminology and seeded defaults. Choosing "NHS" at sign-up turns on the NHS bundle with NHS language (e.g. "CIP", "QIA/EqIA"); other organisations can switch on individual modules with neutral language (e.g. "Efficiency programme", "Impact assessment"). Organisations with no modules on see no change.

| Module key | Neutral name | NHS name | Built in |
|---|---|---|---|
| `assurance` | Board assurance (strategic risk register, assurance ratings, committee templates) | Board Assurance Framework (BAF) | NHS-1 |
| `benefit_categories_nhs` | — (NHS-only seed set) | NHS benefit categories | NHS-2 |
| `impact_assessment` | Impact assessments (quality & equality) | QIA / EqIA | NHS-3 |
| `efficiency` | Efficiency / savings programme | CIP (Cost Improvement Programme) | NHS-4 |
| `five_case` | Five Case Model business cases | Five Case Model business cases | NHS-5 |
| `clinical_safety` | — (health and care only) | Clinical safety (DCB0129/DCB0160) | NHS-6 |
| `cross_org` | Partner (multi-organisation) programmes | ICS programmes | NHS-7 |

The cash-releasing / non-cash-releasing benefit split (NHS-2) is part of core benefits and available to everyone; only the NHS category set is pack-specific.

The packages, in build order:

| # | Package | Size | Est. Claude Code sessions | Depends on |
|---|---|---|---|---|
| NHS-0 | Modules and sector packs foundation | S–M | 1–2 | — |
| NHS-1 | Board assurance: NHS 5×5, assurance ratings, BAF, committee packs | M | 2 | NHS-0 |
| NHS-2 | NHS benefit categories and cash-releasing split | S | 1 | NHS-0 |
| NHS-3 | Quality & Equality Impact Assessment (QIA/EqIA) gateways | M | 2–3 | NHS-0, NHS-1 |
| NHS-4 | CIP / efficiency programme tracking | L | 3–5 | NHS-2, NHS-3 |
| NHS-5 | Five Case Model business cases | M | 2 | NHS-0 |
| NHS-6 | Clinical safety: DCB0129/DCB0160 hazard log and safety case | M–L | 3 | NHS-1 |
| NHS-7 | Cross-organisation (ICS) programmes | M | 2 | NHS-0 |
| NHS-8 | NHS demo dataset and sales readiness | S | 1 | all above |

**Total: roughly 18–21 Claude Code sessions**, plus Chris's review and testing between packages. "Session" = one focused Claude Code run producing a reviewed, tested, committed package. Sizes are relative; treat them as a planning guide, not a commitment.

**Minimum sellable slice:** NHS-0 → NHS-1 → NHS-2 → NHS-3 → NHS-4 (about 10–13 sessions). That gives the "CIP tracking with built-in QIA sign-off and board-ready reporting" pitch. NHS-5 to NHS-8 can follow.

## What already exists (build on it, don't duplicate it)

A schema review on 19 Nov 2026 found strong foundations. Each package must reuse these rather than create parallel structures:

- **Configurable risk matrices** — `risk_matrices` (likelihood/consequence levels, score lookup, bands, default flag), referenced by `risks`, `forums` and `report_templates`. The NHS 5×5 and the DCB0129 matrix should be seed data on this, not new code.
- **Rating schemes** — `rating_schemes` with `is_assurance`. NHS assurance levels are seed data.
- **Approval gates** — `approval_gates` + `approval_steps` (step order, required role, approver, decision, comment) on any `entity_type`/`entity_id`. QIA, CSO and business-case sign-off should use these.
- **Lifecycle gates** — `lifecycle_phases`, `gate_criteria`, `gate_checklist_ticks`, `v_project_gates`.
- **Benefits** — full MSP model: `benefits`, `benefit_measures`, `benefit_measurements` (submit/validate), `benefit_periods`, `benefit_projects` (attribution), `v_benefit_realisation`, categories via `lookup_values`.
- **Financials** — `cost_lines`, `financial_values` (monthly by kind), `financial_periods` (close/reopen), `budget_baselines`, `actuals_imports`, `v_project_financials`.
- **Business cases** — `business_cases`, `business_case_versions`, `business_case_sections`, `business_case_templates` (org-level section templates), `business_case_options`, `business_case_benefits`.
- **Governance and reporting** — `forums`, `meetings`, `forum_members`, `forum_scope_items`, `reports`, `report_templates` (blocks, selection rules), `report_snapshots`, `report_narratives`, `decisions`.
- **Generic links** — `record_links` / `v_record_links`.
- **Cross-org sharing** — `entity_shares` (entity type/id, `partner_organisation_id`, access, hidden blocks) and `report_snapshots.hidden_from_partners`.
- **Configuration** — `lookup_values` (per-org lists), `organisations.settings` (jsonb), `strategic_objectives`, `documents`, `audit_log`, `is_sample` flags for demo data.

## Ground rules for every package

1. **Read first.** Before writing code, read `CLAUDE.md`, `docs/build-plan.md`, `docs/go-live-plan.md` and the existing code for the modules named in the package. Start each package with a short written audit: what exists, what you'll reuse, what's missing. Stop and ask if the audit contradicts this plan.
2. **Follow existing conventions** for migrations, RLS, `SECURITY DEFINER` RPCs with `set search_path = ''`, `private.*` helpers, `write_audit`, refs, `is_sample`, lookups, and UI patterns.
3. **Enforce rules in the database, not just the UI.** Stage gates (e.g. "a CIP scheme can't enter delivery without an approved QIA") must be checked in RPCs/triggers so they can't be bypassed.
4. **Everything is behind its module toggle** (NHS-0). Check the module, never the sector, in code: `isModuleEnabled('efficiency')`, not `sector === 'nhs'`. Hide navigation, report blocks and fields when a module is off. Shared code paths must behave exactly as before for organisations without the module.
5. **Configurable, not hard-coded.** Terms, categories, matrices, thresholds and sign-off roles are seeded defaults that each organisation can edit. NHS practice varies by trust, and other sectors use different language.
5a. **Terminology through labels.** User-facing names for module concepts (CIP vs savings scheme, QIA vs impact assessment, Medical Director vs approver role) come from the organisation's terminology settings, so the same screens serve NHS and non-NHS organisations. Database and code names stay neutral (`efficiency_schemes`, `impact_assessments`, `strategic_risks`).
5b. **Switching on later must be safe.** Enabling a module or pack for an organisation that already has data must never change existing records, scores or history (see "Enabling on an existing organisation" in NHS-0).
6. **Tests.** RLS tests for every new table (cross-org isolation, role permissions, partner access), RPC tests for every gate, and component tests where the project already has them.
7. **Accessibility.** WCAG 2.2 AA for new screens: keyboard paths for any drag-and-drop, text labels alongside RAG colours.
8. **No patient data.** Nothing in this module should invite patient-identifiable information. Add helper text on free-text fields in QIA, hazard log and CIP screens: "Do not enter patient-identifiable information."
9. **Domain check.** Where this plan states NHS conventions (matrix bands, rating labels, template fields), seed them as editable defaults and list them in the package summary so Chris can validate them with an NHS PMO contact before release.
10. **Finish each package** with: migration(s) applied, types regenerated, tests passing, Supabase security and performance advisors clean for new objects, this file updated (status + notes), and a short summary for Chris. Then stop for review before the next package.

---

## NHS-0 — Modules and sector packs foundation (S–M, 1–2 sessions)

**Goal:** individually toggleable modules, sector packs that switch on a recommended bundle with the right language and defaults, and rules that make enabling them safe for organisations that already have data.

### Modules

- `organisations.settings.modules`: a map of module key → enabled (keys from the table at the top of this plan). Unknown keys ignored; missing keys = off.
- A single source of truth for the module registry in code (key, neutral label, description, which nav items / report blocks / fields it controls, which modules it depends on, e.g. `efficiency` recommends `impact_assessment`).
- Server-side helper `private.module_enabled(org_id, key)` used by RPCs and RLS where a module's data should only be writable when it's on.
- Front-end hook `useModule(key)` / `isModuleEnabled(key)` used to show/hide navigation, fields and report blocks. Report templates and blocks declare the modules they need and are hidden if any are off.
- **Settings → Modules** page (org admins only): each module with a plain-English description, an on/off switch, and a note of what switching on will add. Switching a module off hides it but keeps its data; switching it back on restores it.
- Module changes are written to `audit_log`.

### Sector packs

- `organisations.settings.sector`: `'general' | 'nhs'` (extensible later, e.g. `'higher_education'`, `'local_government'`).
- **Onboarding:** an optional step "What kind of organisation are you?" (General / NHS). Choosing NHS enables the NHS bundle (`assurance`, `benefit_categories_nhs`, `impact_assessment`, `efficiency`, `five_case`, `clinical_safety`, `cross_org`) and applies the NHS terminology and defaults. Users can change individual modules afterwards.
- **Settings:** an admin can apply a pack later. Applying a pack shows exactly what will be switched on and seeded before confirming.
- **Terminology:** `organisations.settings.terminology`: a map of label keys → display text (e.g. `efficiency.scheme` → "CIP scheme" / "Savings scheme"; `impact_assessment.name` → "QIA" / "Impact assessment"; `org_unit` → "Directorate" / "Department"). The NHS pack seeds NHS labels; neutral labels are the fallback. Editable by admins. A `useTerm(key)` hook for the UI.
- Seeding is a per-module, idempotent RPC (`private.seed_module_defaults(org_id, module_key, sector)`), extended by later packages. It only inserts what's missing and never overwrites values the org has edited.

### Shared defaults set in NHS-0

- NHS terminology for organisational units (Division / Directorate / Care Group / Service).
- **Governance roles** lookup. NHS pack: Medical Director, Chief Nurse / Director of Nursing, Director of Finance, Chief Operating Officer, Clinical Safety Officer, Caldicott Guardian, SIRO, Head of PMO. General: Executive sponsor, Finance lead, Head of PMO, Quality lead.
- **Governance role assignment:** check how `approval_steps.required_role` works today. If it only supports app roles (admin/editor/viewer), add a way to assign named governance roles to resources/profiles (e.g. `governance_role_holders`: org, role key, resource/profile, deputy flag) and let approval steps require a governance role. Later packages depend on this.

### Enabling on an existing organisation

Applying a pack or module to an organisation that already has data must follow these rules:

1. **Financial year:** for a new organisation choosing NHS at sign-up, set the year to start in April. For an existing organisation, never change it automatically. Show a warning in the pack confirmation ("Your financial year starts in August. NHS organisations usually use April. Changing it will regroup existing monthly financials and benefit periods into different years.") and let the admin change it deliberately in Settings.
2. **Risk matrices:** a new default matrix (e.g. NHS 5×5) applies to **new** risks only. Existing risks keep their current matrix, scores and history. Provide an optional **re-scoring tool** (NHS-1) that lists existing risks, proposes a mapped score on the new matrix, and lets an admin review and accept per risk or in bulk, with each change audited.
3. **Gates:** delivery gates added by modules (QIA approval, clinical safety sign-off) are off by default and, when switched on, apply only to **future** transitions. Projects and schemes already past the gate are not blocked; show a non-blocking notice on them ("Started before QIA gate was enabled") and include them in a "missing assessment" list for the PMO.
4. **Templates and categories:** pack templates (report templates, business case template sets, benefit categories) are added alongside existing ones. Nothing existing is renamed, replaced or deleted.
5. **Terminology:** applying a pack only fills terminology keys the org hasn't customised.

**Done when:** an admin can switch individual modules on and off, choose NHS at sign-up or apply the pack later with a clear preview, see NHS terms and defaults appear without any existing data changing, assign people to governance roles, and switch modules off with no data loss. Tests cover: module isolation (off = hidden and not writable), idempotent seeding, and pack application on an org with existing risks and financials.

## NHS-1 — Board assurance (M, 2 sessions)

**Goal:** NHS-standard risk scoring, assurance ratings, a Board Assurance Framework (BAF), and committee-ready packs.

Module: `assurance` (neutral name "Board assurance"; NHS name "Board Assurance Framework"). Store strategic risks in neutrally named tables (e.g. `strategic_risks`).

0. **Risk re-scoring tool** (core, available to all orgs): when an org changes its default matrix, an admin can review existing risks with a proposed mapped score on the new matrix and accept per risk or in bulk. Each change is audited and keeps score history. Never runs automatically.
1. **NHS 5×5 risk matrix** seeded into `risk_matrices` and set as the default for **new** risks when the NHS pack is applied. Consequence 1–5 (negligible, minor, moderate, major, catastrophic) × likelihood 1–5 (rare, unlikely, possible, likely, almost certain), score = product (1–25). Default bands: low 1–3, moderate 4–6, high 8–12, extreme 15–25 (editable). Add a "risk appetite / tolerance" score per risk where useful.
2. **Assurance rating scheme** seeded into `rating_schemes` (`is_assurance = true`): Substantial, Reasonable, Limited, No assurance, with descriptions. Usable on reports, programmes and BAF entries.
3. **Board Assurance Framework** — a new org-level register of strategic risks. Fields: ref, title, description, linked strategic objective (`strategic_objectives`), executive lead, lead committee (`forums`), risk appetite, initial / current / target score (on the NHS matrix), key controls, sources of assurance (first, second and third line), gaps in control, gaps in assurance, actions (owner, due date, status), review date, trend. Programme and project `risks` can be linked to a BAF risk via `record_links` (link type `contributes_to_baf`). Keep score history for trend arrows.
4. **NHS report blocks** for the report builder: BAF heat map and summary; risks above appetite; assurance ratings by programme; programme-risk-to-BAF linkage. Later packages add CIP, QIA and hazard blocks.
5. **Committee templates** seeded into `report_templates`: Trust Board, Finance & Performance Committee, Quality Committee, Audit & Risk Committee, Executive Management / PMO Board. Each uses the NHS matrix and assurance scheme. Templates must degrade gracefully before later packages' blocks exist.
6. **One-click committee pack:** from a forum's meeting, generate the pack from the template and export to PDF (and Word if the report builder already supports it). Reuse the existing report builder; don't build a separate pack engine.

**Done when:** an NHS org can score risks on the 5×5, maintain a BAF with linked programme risks, rate assurance, and produce a committee pack PDF from a meeting.

## NHS-2 — NHS benefit categories (S, 1 session)

**Goal:** benefits that speak the NHS's language and separate cash-releasing from non-cash-releasing value.

- Seed benefit category lookups: Cash-releasing efficiency; Non-cash-releasing efficiency (productivity, capacity); Staff time released; Bed days saved; Length of stay; Elective activity / waiting list (waits, RTT); Patient safety (incidents, harm); Patient experience; Clinical outcomes; Staff experience and retention; Environmental / net zero; Health inequalities.
- Add `is_cash_releasing` (boolean) to `benefits`, `business_case_benefits` and `request_benefit_drafts`, defaulted from category and editable.
- Seed measure unit presets: £, staff hours, WTE, bed days, patients, weeks wait, incidents, %.
- Optional conversion factor on a measure (e.g. staff hour → £ notional value) clearly labelled as notional/non-cash.
- Benefits screens, dashboards and reports show cash-releasing vs non-cash-releasing totals separately. Never sum them into one "savings" figure.
- New report block: benefits by NHS category, cash vs non-cash.

**Done when:** benefits can be categorised the NHS way and every benefit total shows the cash/non-cash split.

## NHS-3 — QIA / EqIA gateways (M, 2–3 sessions)

**Goal:** no scheme or service change progresses without a Quality & Equality Impact Assessment signed off by the right clinical leaders.

1. **Assessment target:** a QIA attaches to a project, a programme, or (after NHS-4) a CIP scheme. Use a polymorphic `entity_type` / `entity_id` like `approval_gates`.
2. **Two stages:**
   - **Screening:** short questionnaire across quality domains. If any domain scores above the threshold, a **full assessment** is required.
   - **Full assessment:** detailed form per domain.
3. **Quality domains** (configurable): patient safety, clinical effectiveness, patient experience, workforce/staff wellbeing, and operational performance. For each: impact (positive / neutral / negative), description, consequence × likelihood on the NHS 5×5, mitigations, and monitoring indicators.
4. **Equality (EqIA):** the nine protected characteristics under the Equality Act 2010 (age, disability, gender reassignment, marriage and civil partnership, pregnancy and maternity, race, religion or belief, sex, sexual orientation), plus health inequalities and deprivation. Each: impact, evidence, mitigation.
5. **Templates are configurable** per org (domains, questions, thresholds), seeded with NHS defaults. Store each completed assessment against the template version used.
6. **Sign-off** via `approval_gates` / `approval_steps` using governance roles from NHS-0. Default route: Medical Director and Chief Nurse (both required); full assessments can add a QIA panel step. Record approver, decision (approve / approve with conditions / reject / return for revision), comments, conditions and date.
7. **Gate enforcement:** an RPC-level check, e.g. `private.assert_impact_assessment_approved(entity_type, entity_id)`, that blocks the protected transition (project entering delivery when the org requires it; efficiency scheme entering delivery in NHS-4). Org setting decides which transitions require an assessment; gates are off by default and apply only to future transitions (NHS-0 rule 3), with a "missing assessment" list for items already past the gate.

Module: `impact_assessment` (neutral name "Impact assessment"; NHS name "QIA / EqIA"). The NHS pack seeds the NHS quality domains and Medical Director + Chief Nurse sign-off; the general default seeds quality and equality domains with an approver role chosen by the org.
8. **Monitoring and re-assessment:** post-implementation review date; quality indicators to monitor (optionally linked to `outcome_indicators`); a "material change" flag that sets the QIA back to "re-assessment required" and re-blocks the gate.
9. **Views and reporting:** QIA register (status, score, approvers, overdue reviews); notifications to approvers; report blocks for QIA status, schemes awaiting sign-off, and negative impacts with mitigations.

**Done when:** a project or programme can be screened, fully assessed, signed off by the Medical Director and Chief Nurse, and is blocked server-side from entering delivery until approved.

## NHS-4 — CIP / efficiency programme tracking (L, 3–5 sessions)

**Goal:** replace the trust CIP spreadsheet. This is the headline NHS feature.

Module: `efficiency` (neutral name "Efficiency programme" / "Savings scheme"; NHS name "CIP" / "CIP scheme"). Use neutral table names (`efficiency_schemes`, `efficiency_values`, `efficiency_targets`) and terminology labels in the UI; the names `cip_*` below are illustrative. NHS-specific seeds (categories, planning-confidence labels, April year) come from the NHS pack; the general default seeds neutral categories (staffing, procurement, estates, process improvement, income).

**Design decision to confirm in the audit:** CIP schemes are a new entity rather than a benefit subtype, because they need monthly £ phasing by financial year with a recurrent split, a scheme pipeline and QIA gating. Each scheme can optionally link to a delivering project/programme and to a cash-releasing benefit. If the audit shows benefits can carry this cleanly, propose that instead and stop for a decision.

1. **Schemes** (`cip_schemes`): ref, title, description, organisational unit (division/directorate from NHS-0 lookups), category (seeded: workforce/pay, agency and bank, medicines, procurement/non-pay, estates and facilities, clinical productivity, corporate services, income), savings type (pay / non-pay / income), recurrent or non-recurrent, executive lead, scheme lead, finance lead, start month, optional linked project/programme/benefit, status.
2. **Pipeline stages** (configurable, enforced in RPCs): Idea → Opportunity → Plan in progress → Fully developed → In delivery → Delivered/closed, plus On hold and Rejected. Default rules: entering "Fully developed" needs a plan and phased values; entering "In delivery" needs an approved QIA (NHS-3) and finance validation.
3. **Planning confidence** for risk adjustment: a configurable rating per scheme (default labels aligned to NHS efficiency planning categories: Fully developed – in delivery; Fully developed – delivery not yet started; Plans in progress; Opportunity), each with a default weighting (editable) to produce risk-adjusted values.
4. **Financial phasing** (`cip_values`): by scheme, financial year (April–March) and month: plan, actual, forecast. Recurrent and non-recurrent amounts separately.
   - **In-year effect** = sum of the year's monthly values.
   - **Full-year effect (FYE)** = annualised recurrent value once fully implemented (stored, with a helper to calculate it from the run-rate).
   - **Recurrent carry-forward** into the next financial year.
   - Reuse `financial_periods` for month close where sensible.
5. **Targets** (`cip_targets`): organisation and per-unit targets by financial year, so dashboards show gap to target (planned, risk-adjusted, forecast and actual).
6. **Finance validation:** actuals submitted by scheme leads and validated by the finance lead (pattern from `benefit_measurements`), with comments and audit.
7. **Import:** CSV/XLSX import for existing scheme lists and monthly values (pattern from `actuals_imports`), because every trust starts from a spreadsheet.
8. **Screens:**
   - Pipeline board by stage (with keyboard-accessible moves), totals per column.
   - Scheme detail: summary, phasing grid (12 months × plan/forecast/actual, recurrent/non-recurrent), QIA status, links, history.
   - CIP dashboard: target vs plan vs risk-adjusted vs forecast vs actual; cumulative chart by month; by unit and by category; recurrent %; pipeline value by stage; schemes off-track.
9. **Report blocks:** CIP summary, gap to target, by-division table, schemes at risk, recurrent vs non-recurrent. Add these to the Finance & Performance and Trust Board templates from NHS-1.
10. **Benefits link:** when a scheme links to a cash-releasing benefit, show the realised savings on the benefit without double counting in portfolio totals. Document the rule.

**Suggested split across sessions:** (a) schema, RLS, RPCs and stage rules; (b) phasing grid, targets and calculations with tests; (c) pipeline board and scheme detail; (d) dashboard, report blocks and import; (e) polish and edge cases.

**Done when:** a trust can import its CIP list, phase savings monthly, track plan/forecast/actual against target by division, see risk-adjusted values, can't start delivery without an approved QIA, and can drop CIP blocks into its F&P committee pack.

## NHS-5 — Five Case Model business cases (M, 2 sessions)

**Goal:** business cases that follow HM Treasury Green Book practice and NHS approval stages.

1. **Template sets:** extend `business_case_templates` so an org can hold multiple named template sets. Seed a Five Case Model set with sections grouped under the Strategic, Economic, Commercial, Financial and Management cases, each with guidance text (written fresh, not copied from Treasury guidance).
2. **Stages:** add stage to `business_case_versions`: Strategic Outline Case (SOC) → Outline Business Case (OBC) → Full Business Case (FBC), plus a single-stage option for smaller cases. A new stage starts as a new version carrying forward content.
3. **Strategic case:** spending objectives and critical success factors as structured lists.
4. **Economic case:** long list to short list (options framework), using `business_case_options`. Optional appraisal calculator: costs and benefits by year, discount rate (default 3.5%, editable), optimism bias % per option, outputs NPV / net present social value and benefit-cost ratio. Show the calculation clearly; label it as an aid, not a substitute for finance review.
5. **Financial case:** pull capital/revenue figures and whole-life cost; link to project financials after approval (existing `budget_baselines.business_case_version_id`).
6. **Approval route by stage** via `approval_gates` (e.g. trust board; ICB; regional/national above delegated limits) — configurable.
7. **Export** the case to Word (.docx) and PDF in Five Case structure, because NHS boards receive Word/PDF papers.

**Done when:** an NHS user can write a SOC, progress it to OBC and FBC, run a simple options appraisal, get each stage approved, and export a board-ready document.

## NHS-6 — Clinical safety: DCB0129 / DCB0160 (M–L, 3 sessions)

**Goal:** a hazard log and clinical safety case workflow for digital projects, signed off by a Clinical Safety Officer (CSO).

1. **Clinical safety settings per project:** flag "clinical safety applies"; standard (DCB0129 for manufacturers, DCB0160 for deploying organisations, or both); assigned CSO (governance role from NHS-0).
2. **Hazard log** (`hazards`): ref, title, description, cause(s), effect, potential harm, initial severity and likelihood with initial risk rating, existing controls, additional controls (each with owner, status, evidence), residual severity, likelihood and rating, status (open / mitigated / transferred / closed), hazard owner, raised and reviewed dates, source (internal or supplier hazard log reference). Keep full history.
3. **Clinical risk matrix:** seed a separate `risk_matrices` entry for clinical safety: severity (minor, significant, considerable, major, catastrophic) × likelihood (very low, low, medium, high, very high) → clinical risk rating 1–5 with acceptability bands. Seed as editable defaults and flag for validation against the current NHS England DCB0129/DCB0160 specifications before release.
4. **Safety documents:** Clinical Risk Management Plan, Clinical Safety Case Report and Hazard Log as document types on `documents`, versioned, with CSO sign-off per version via `approval_gates`.
5. **Go-live gate:** an org/project setting that blocks the go-live milestone or delivery phase transition until the current safety case report is CSO-approved and no open hazards exceed the acceptable rating (server-side check).
6. **Export** the hazard log to XLSX and PDF in a conventional layout for sharing with suppliers and assurance teams.
7. **Report blocks:** hazards by residual rating, open hazards over threshold, safety case status by project.

**Done when:** a digital project can maintain a hazard log on the clinical matrix, version its safety case, get CSO sign-off, and is blocked from go-live until both are in place.

## NHS-7 — Cross-organisation (ICS) programmes (M, 2 sessions)

**Goal:** an ICB or host trust runs one programme across several partner organisations.

1. **Audit `entity_shares` first** and report: which entity types can be shared, what access levels exist, how partner users see shared items, and how free viewers interact with it. Then build only the gap.
2. **Shared programme:** the host organisation shares a programme with partner organisations. Partner users see the programme, its projects, roll-up health, benefits and reports (respecting `hidden_block_keys` / `hidden_from_partners`). Partner viewers are free, consistent with the existing seat model.
3. **Partner-contributed projects:** a partner organisation can link one of its own projects into the host's shared programme so it rolls up (health, milestones, risks, benefits, CIP if applicable), while the project stays owned and edited in the partner's org. The host sees it read-only.
4. **Partner invitation flow:** host admin invites a partner organisation by an admin's email; the partner admin accepts on behalf of their org. Accepting never moves data between orgs.
5. **Strict isolation tests:** partners only see what's explicitly shared; revoking a share removes access immediately; nothing leaks into the host's non-shared data or vice versa.
6. **ICS report template:** system-level programme board pack showing contributions by organisation.

**Done when:** an ICB can host a programme, partner trusts can contribute their own projects to it, everyone sees the roll-up they're entitled to, and isolation tests pass.

## NHS-8 — NHS demo dataset and sales readiness (S, 1 session)

- A sample NHS trust dataset (`is_sample`): a few divisions, 15–20 CIP schemes across stages, QIAs at different stages, a digital project with a hazard log, a Five Case OBC, BAF risks, an ICS shared programme, and a Finance & Performance committee pack.
- An "NHS overview" section on the public site describing the module (no claims of accreditation the product doesn't hold).
- **NHS starter directorates (added 24/11/2026 at Chris's request).** Applying the NHS pack today only relabels the Business units list as "Directorate"; the values stay the university defaults seeded at creation (Digital & Technology Services, Student Services …). Seed NHS starter values into the `business_unit` list when the pack is applied (for example Medicine, Surgery, Women's & Children's, Clinical Support Services, Corporate Services; Chris to validate), through `private.seed_module_defaults` / the pack plan so the preview lists them. Follow NHS-0 rule 4: add only values that are missing, never rename, hide or remove the organisation's existing entries. Note in Settings › Lists that efficiency schemes store the directorate name as text, so renaming an entry doesn't update existing schemes.
- Update this plan's status table and write release notes.

---

## Kick-off prompt for Claude Code

Use this for the first session, then "Continue with the next package in docs/nhs-module-plan.md" for later ones.

```
Read CLAUDE.md, docs/build-plan.md, docs/go-live-plan.md and docs/nhs-module-plan.md.

We're starting the NHS module. Work on package NHS-0 only.

1. First, write a short audit (in chat, not a file) of what already exists that NHS-0 touches:
   organisation settings, onboarding, lookups, approval_steps.required_role and how approvers
   are resolved, how navigation and report blocks are shown/hidden, and any existing feature
   flags or settings patterns. Say what you'll reuse and what's missing.
   If anything contradicts the plan, stop and ask me.
2. Then implement NHS-0 following the ground rules in the plan: migrations, RLS, RPCs,
   UI, seeds, tests.
3. Finish with: migrations applied, types regenerated, tests passing, Supabase advisors clean
   for new objects, the plan's status table updated, and a short summary for me listing any
   NHS defaults I should validate. Then stop. Don't start NHS-1.

Also add a one-line reference to docs/nhs-module-plan.md in CLAUDE.md alongside the other plans.
```
