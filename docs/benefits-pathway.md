# Benefits pathway: design (Stage BP1)

Status: **awaiting sign-off.** Nothing here is built. BP2 onwards follow this document once it is approved; each stage stops for review.

The pathway is the chain the benefits map already draws: **projects → capabilities → outcomes → benefits**. Today the capability and outcome rows are only labels (`capabilities`, `outcomes`, `capability_projects`, `outcome_capabilities`, `outcome_benefits`, all in `20261005175434_benefits.sql`). This stage gives them dates, status and evidence, so that:

- the earliest benefits signal is "is the thing that enables the benefit being delivered and accepted?", long before a benefit has any measurements;
- the project benefit dimension stops being `not_set` (or driven by unmeasured benefits) for most projects;
- the portfolio overview's capabilities / outcomes / benefits series (`docs/design/portfolio-overview-spec.md`, §4 ProgressChart, Benefits tab) have real data.

Conventions carried over from `docs/schema.md` and `docs/financials-and-business-cases.md`: `organisation_id` and `workspace_id` on every table, filled by the tenant guard; audit columns; UK English; RLS written only with the array helpers; every new `private` function revoked from `public, anon`; views single-pass (no per-row function calls); timings measured as a signed-in user through RLS.

In the seed tables below, `d(n)` is the seed's relative date: n days from the Monday of the week the seed runs. On the hosted demo, `d(0)` = Mon 05/10/2026, and the financial year runs from 01/08/2026 (`d(-65)`) to 31/07/2027 (`d(299)`).

---

## Decisions for sign-off

These are the choices where I've gone beyond the brief or had to pick a reading. Everything else follows the brief as written.

| #    | Decision | Recommendation |
| ---- | -------- | -------------- |
| BP-1 | Which project health a capability reads | **The four delivery dimensions only** (schedule, financial, effort, issue), never the benefit dimension or the override. The project benefit dimension now reads capability health, so using the project's overall would make a loop. "Off track" = any of the four is red; "at risk" = any is amber. The override is left out because it is a judgement on the whole project, benefits included. |
| BP-2 | Breaking the view cycle | A new **`v_project_delivery_health`** holds the four dimensions. `v_capability_health` reads it; `v_project_health` reads it plus `v_capability_health`. Same columns and results as today for the four dimensions (checked with `health_views_snapshot.sql`). |
| BP-3 | When a benefit's realisation period starts | A new column **`benefits.realisation_start_date`**. A benefit is in realisation when its status is `in_realisation`, `realised`, `partially_realised`, `not_realised` or `closed`, **or** `realisation_start_date <= today`. It can't be worked out from the targets: every demo benefit has Q1 targets, including ones that are only `identified`. |
| BP-4 | Indicator measurements: periods or dates | **Dates** (`measured_on`), not `benefit_periods`. Indicators are judged against a straight-line trajectory, which needs a point in time. The workflow (submit → validate or query; PMO only; queried never counts; validated beats submitted) is the same as for benefit measurements, using the same trigger function. |
| BP-5 | Who may accept a capability | `accepted_by` is a **resource**: the receiving business owner, who may not be a user. The **person recording** the acceptance must be a manager or PMO in the workspace, and at least one evidence document must be attached. Only PMO can un-accept, and the audit log keeps the change. |
| BP-6 | Who sets an outcome to achieved or not achieved | **PMO only**, like validating a measurement. The other statuses (`planned`, `emerging`) are open to contributors. |
| BP-7 | Acceptance evidence storage | Use the **`documents`** table from F4 (`financials-and-business-cases.md` §2.4), with `capability` added to `document_scope` and a typed `capability_id` FK. If F4 hasn't landed when BP2 starts, BP2 creates `documents` to the F4 spec (with the capability scope) and F4 adds its own scopes later. |
| BP-8 | Programme benefit dimension | **The same rule as projects:** the worst of the programme's capabilities and its benefits that are in realisation. The brief only names projects, but leaving programmes on the old rule would put two definitions of "benefit health" on one page. |
| BP-9 | Monthly history | A new item-level table **`pathway_snapshots`** (one row per capability, outcome and benefit per month-end), written by the existing `capture_health_snapshots` job. The chart and the "turned amber/red this month" signal both need per-item history; counts and % green are aggregated from it by the overview RPC. |

---

## 1. Capabilities

### 1.1 New columns on `capabilities`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `status` | enum `capability_status` = `planned`, `in_progress`, `delivered`, `accepted` | default `planned` |
| `target_date` | `date` | the committed date: when the capability should be **accepted**. Required once the status is past `planned`. |
| `forecast_date` | `date` | current forecast of acceptance. Defaults to `target_date`. |
| `delivered_date` | `date` | required when the status is `delivered` or `accepted`; null otherwise |
| `accepted_at` | `date` | required when `accepted`; null otherwise |
| `accepted_by_id` | `uuid` → `resources (id, organisation_id)` | required when `accepted` (BP-5) |
| `acceptance_note` | `text` | optional; what was accepted and any conditions |

Checks:

- `status in ('delivered','accepted')` ⇔ `delivered_date is not null`;
- `status = 'accepted'` ⇔ `accepted_at is not null and accepted_by_id is not null`;
- `accepted_at >= delivered_date`.

**Only `accepted` counts as delivered.** `delivered` means "handed over, awaiting sign-off" and is still open work: it can go red, and it does not count towards the chart's "Capabilities delivered" line.

### 1.2 Acceptance rules (trigger `private.capability_acceptance`)

- Moving to `accepted` needs a manager or PMO role in the workspace (BP-5) and at least one non-archived `documents` row with `scope = 'capability'` for this capability. Error messages: "Only managers and PMO can record acceptance" / "Attach the acceptance evidence first".
- Moving out of `accepted` needs PMO. `accepted_at` and `accepted_by_id` are cleared, and the audit log keeps the old values.
- Server-side jobs and the seed (no `auth.uid()`) bypass the role checks, as with measurement validation.

### 1.3 Forecast history

`capability_forecast_history` has the same shape and behaviour as `milestone_forecast_history`: `(id, organisation_id, workspace_id, capability_id, reporting_date, forecast_date, created_at, created_by)`, unique on `(capability_id, reporting_date)`, written only by an `after insert or update of forecast_date` trigger (`private.record_capability_forecast`), and select-only for `authenticated`. History survives the capability (`on delete restrict` like milestones; capabilities are archived, not deleted, once any history exists).

### 1.4 Evidence

Documents use the `documents` table (BP-7): `scope = 'capability'`, `capability_id` set, storage path `{org}/{workspace}/capability/{capability id}/{document id}/{file name}`. Upload, versioning, signed-URL download and archive-only behaviour are as in F4 §2.4.

---

## 2. Outcomes

### 2.1 New columns on `outcomes`

| Column | Type | Notes |
| ------ | ---- | ----- |
| `status` | enum `outcome_status` = `planned`, `emerging`, `achieved`, `not_achieved` | default `planned`. `achieved` and `not_achieved` are PMO-only (BP-6). |
| `target_date` | `date` | when the outcome should be achieved |
| `achieved_date` | `date` | required when `achieved`; null otherwise |

### 2.2 `outcome_indicators`

| Column | Notes |
| ------ | ----- |
| id, organisation_id, workspace_id, outcome_id | tenant guard from `outcomes` |
| name, unit | e.g. "Students with active accounts on day one", `%` |
| baseline_value, baseline_date | required |
| target_value, target_date | required; `target_value <> baseline_value`; `target_date > baseline_date`. Whether higher or lower is better comes from the sign of `target_value − baseline_value`. |
| frequency | `measure_frequency`, default `quarterly` |
| next_due_date | as on `benefit_measures`: an overdue first measurement makes the indicator amber |
| data_source, measurement_method | text |
| sort_order, audit columns | |

### 2.3 `outcome_indicator_measurements`

Same columns as `benefit_measurements`, except `measured_on date not null` replaces `period_id` (BP-4): `actual_value`, `evidence`, `evidence_path` (the `evidence` bucket, as today), `notes`, `submitted_by_id`, `submitted_date`, `validated_by_id`, `validated_date`, `query_note`, `status measurement_status`.

- The existing `private.benefit_measurement_validation()` is generic (it reads `new.status` and `new.workspace_id`), so the same function is attached as `outcome_indicator_measurements_10_validation`. Only PMO can validate or query.
- **Which measurement counts:** for each indicator, the latest `measured_on`. On the same date, a validated one beats a submitted one. Queried measurements never count. This matches `v_benefit_period_values`.
- Home → Approvals: the validation queue (`getValidationQueue`) gains indicator measurements beside benefit measurements.

RLS as for the benefit tables: select for workspace members; insert/update for contributors; delete for managers. Written with the array helpers.

---

## 3. Computed RAG views

All three views are `security_invoker`. Each returns `rag public.health` and a `reason text` (the first rule that matched, worded for a tooltip, e.g. "Past target date (21/09/2026) and not accepted"), so the UI and the signals never re-derive the rule. Each reads the org settings once, in a `base` CTE, as `v_project_health` does.

### 3.1 Thresholds (org settings)

New numeric keys under `settings.health` (so they appear in Settings → Health thresholds, are required by `valid_org_settings`, and are back-filled into existing organisations with these defaults):

| Key | Default | Used by |
| --- | ------- | ------- |
| `capabilitySlipAmberDays` | 30 | capability: amber when `forecast_date − target_date` is more than this |
| `outcomeBehindTrajectoryAmberPercent` | 10 | indicator: amber when behind the trajectory by more than this share of the planned change |
| `outcomeBehindTrajectoryRedPercent` | 25 | indicator: red above this |

### 3.2 `v_capability_health`

Columns: `capability_id, organisation_id, workspace_id, programme_id, status, target_date, forecast_date, slip_days, is_complete, rag, reason`.

Rules, first match wins:

1. `status = 'accepted'` → **green**, `is_complete = true`.
2. `target_date < today` (not accepted) → **red**.
3. Any delivering project (via `capability_projects`, project not closed) is off track on its delivery dimensions (BP-1) → **red**.
4. `forecast_date − target_date > capabilitySlipAmberDays` → **amber**.
5. Any delivering project is at risk → **amber**.
6. No `target_date` (still `planned` with no date) → **not_set**.
7. Otherwise → **green**.

### 3.3 `v_outcome_health`

Per-indicator status first (a materialised `indicators` CTE):

- `expected = baseline + (target − baseline) × clamp((measured_on − baseline_date) / (target_date − baseline_date), 0, 1)`
- `shortfall % = max(0, (expected − actual) / (target − baseline)) × 100`. Dividing by the signed change makes this work whether higher or lower is better.
- Red above the red threshold, amber above the amber threshold, otherwise green. An indicator with no counted measurement is ignored, unless its `next_due_date` has passed, which makes it amber.

Outcome rules, first match wins:

1. `status = 'achieved'` → **green**, complete.
2. `status = 'not_achieved'` → **red**.
3. `target_date < today` and not achieved → **red**.
4. Any indicator has a counted measurement → **the worst of its indicators** (measured ones, plus overdue ones as amber).
5. Before any measurements: **the worst of its enabling capabilities** (`outcome_capabilities` → `v_capability_health`; accepted counts as green).
6. No measurements and no capabilities → **not_set** ("No indicators measured and no enabling capabilities").

### 3.4 `v_benefit_readiness`

Columns: `benefit_id, organisation_id, workspace_id, portfolio_id, programme_id, phase ('readiness' | 'realisation'), rag, reason`.

- **Realisation** (BP-3): the per-benefit form of today's rule, from `v_benefit_realisation` in one pass: red if confidence is low or the benefit is behind profile; amber if a measurement is overdue, the status is `identified` or eligibility isn't confirmed; otherwise green.
- **Readiness** (before realisation starts): **the worst of its outcomes' RAG** (`outcome_benefits` → `v_outcome_health`). A benefit with no outcomes is **not_set**, with the reason "No pathway: link this benefit to an outcome". The register shows these as a data gap.
- `closed` benefits are left out.

---

## 4. Project and programme benefit dimension

### 4.1 New rule

In `v_project_health` the benefit dimension becomes:

- **not_set** when the project delivers no capabilities and has no linked benefit in realisation;
- otherwise **the worst of**:
  - the health of each capability it delivers (`capability_projects` → `v_capability_health`; accepted = green);
  - today's flags (`benefit_flags` as in `20261006104522_health_views_single_pass.sql`), applied **only to its linked benefits that are in realisation**.

Benefits that haven't started realisation no longer affect the project directly; their capabilities stand in for them. `v_programme_health` changes the same way (BP-8): its capabilities plus its benefits in realisation. `benefit_dimension_health()` (the single-item helper) gets the same rule.

Structure (BP-2): `v_project_delivery_health` → `v_capability_health` → `v_project_health`. If timings show the delivery dimensions being worked out twice per query is too slow, `v_project_health` inlines the capability rule from its own materialised delivery CTE, and a test asserts it matches `v_capability_health`.

Health snapshots taken before the switch keep their stored values, so the Health tab's benefit line may step at the switch month. The seed regenerates its synthetic history with the new rule, so the demo has no step.

### 4.2 Before / after on the demo organisation

"Before" is the hosted demo's `v_project_health` today. "After" applies §3–§4 to the same data plus the seed in §6, worked out with a read-only query against the hosted project. Only projects whose benefit dimension changes are listed. The other 28 projects are unchanged: 9 with a pathway (listed under the table) and 19 with none, which stay `not_set`.

| Project | State | Capabilities it delivers (RAG) | Benefit before | Benefit after | Overall before → after | Why |
| ------- | ----- | ------------------------------ | -------------- | ------------- | ---------------------- | --- |
| BCT Business Continuity Testing | active | C11 Rehearsed BC plans (**red**) | not_set | **red** | green → **red** | Delivered d(-9), target d(-14), not yet accepted by the owning services |
| CSCSI CIS Safeguards | active | C07 CIS safeguards (**red**) | not_set | **red** | amber → **red** | Co-delivering project CYB is off track |
| CMI Copilot / Microsoft integration | on hold | C04 Copilot toolset (amber) | not_set | **amber** | green → **amber** | Forecast 75 days beyond target |
| TAWS Testing Automation | active | C05 Workflow patterns (amber) | not_set | **amber** | green → **amber** | Co-delivering project WAH is at risk |
| W11 Windows 11 Rollout | active | C12 Managed device estate (green) | red | **green** | red → **green** | Red came from low-confidence benefits that haven't started realisation (BEN-011, BEN-021) |
| DSA Digital Skills Academy | active | C14 Learning platform (green) | red | **green** | red → **green** | Red came from a low-confidence benefit before realisation (BEN-016) |
| EBB Ebbot (chatbot) | active | C02 Assistant (green, accepted), C03 Knowledge base (amber) | green | **amber** | amber → amber | Knowledge base capability: delivering project at risk |
| WAH Workflow Automation Hub | active | C05 (amber) | not_set | **amber** | amber → amber | Its own delivery is at risk |
| NRDC Network Refresh | proposed | C09 DC network (**red**) | not_set | **red** | red → red | Past target, project off track |
| IRS Identity Recovery Service | on hold | C10 (green, accepted) | not_set | **green** | green → green | Accepted d(-30) |

Unchanged but now explained differently: ACA (red: BEN-001 is in realisation with low confidence; its capability is accepted), CYB (red both ways), SDO (amber: BEN-012 is in realisation and its measurement is overdue), CCM, IIRV and RDTA (green both ways), and the closed FSC, UC2 and SFZ (their benefits are all in realisation, so the existing rule applies unchanged).

**Roll-up (27 active projects):**

| | Before | After |
| - | ------ | ----- |
| Overall green / amber / red | 16 / 6 / 5 (59% green) | 16 / 6 / 5 (59% green), but different projects: BCT and CSCSI go red, TAWS goes amber, W11 and DSA go green |
| Benefit dimension green / amber / red / not_set | 4 / 0 / 4 / 19 | 5 / 3 / 4 / 15 |

Programmes: Resilience stays red (C07, C09 and C11 are red; BEN-006 is red). Efficiency, Automation & AI stays red (BEN-001). People, Knowledge & CI stays red (BEN-027 is in realisation with low confidence). **Optimisation & Cost Management: red → amber** on the benefit dimension (its capabilities are green and BEN-012 is amber), though its overall stays red because of VDI.

**What the change shows.** Two things to weigh at sign-off:

1. **Acceptance is strict.** BCT flips green → red only because the business continuity plans were delivered five days late and haven't been signed off. That is the intended "only accepted counts" behaviour. If it's too sharp, a `capabilityAcceptanceGraceDays` setting (amber, not red, for this many days past target when the status is `delivered`) is a one-line addition. **Not proposed by default.**
2. **Pre-realisation benefit hygiene goes quiet.** W11 and DSA turn green because low-confidence or unvalidated benefits that haven't started realisation no longer count. To keep that signal, one extra rule could cap them at **amber**: any linked pre-realisation benefit with low confidence, or still unvalidated from phase index 2 onwards. With that rule, W11 and DSA would be amber (active overall: 14 green / 8 amber / 5 red). **I recommend adding it.** It is listed as question Q1 because it goes beyond the brief.

---

## 5. Monthly snapshot values for the progress chart

### 5.1 `pathway_snapshots` (BP-9)

| Column | Notes |
| ------ | ----- |
| id, organisation_id, workspace_id, programme_id | `programme_id` so the chart filters by programme without joins |
| snapshot_date | month-end (or the capture day; the RPC takes the last row per month) |
| capability_id, outcome_id, benefit_id | exactly one set (check), FKs `on delete restrict`, as for `health_snapshots` |
| rag, phase (benefits only), is_complete | from the three views |
| due_in_fy | `target_date` (or the benefit's FY profile) falls in the organisation's financial year containing `snapshot_date` |
| realised_value, fy_profile_value | benefits only: realised value to date and this FY's profiled value, from `v_benefit_realisation` / `v_benefit_period_values` |
| is_synthetic, created_at | |

Unique on `(coalesce(capability_id, outcome_id, benefit_id), snapshot_date)`. Written by `private.capture_health_snapshots` in the same transaction as the health snapshots (idempotent per day, `on conflict do update`). Select for workspace members; no client writes.

### 5.2 Series definitions (as the overview spec words them)

| Series | Actual (month-end, from `pathway_snapshots`) | Forecast (dotted, live) | % green |
| ------ | --------------------------------------------- | ----------------------- | ------- |
| Capabilities delivered | accepted ÷ capabilities with `target_date` in this FY | cumulative count by month of `forecast_date` (a `delivered` capability counts at the next month-end) | green ÷ due this FY (accepted counts as green) |
| Outcomes achieved | achieved ÷ outcomes with `target_date` in this FY | none: outcomes have no forecast date | green ÷ due this FY |
| Benefits realised | realised value ÷ FY profile (unchanged definition) | from the current profile, as today | green ÷ benefits not closed |

The series stay hidden until the organisation has at least one capability with a `target_date` (overview spec, "Dependency").

### 5.3 Demo values (Benefits tab, FY 2026/27)

13 capabilities are due this FY (all except C02 and C15, whose targets fell in the last FY). 13 outcomes are due (O6's target is d(300), in the next FY).

| Month-end | Capabilities accepted | Capabilities forecast | Capabilities % green | Outcomes achieved | Outcomes % green | Benefits % green |
| --------- | --------------------- | --------------------- | -------------------- | ----------------- | ---------------- | ---------------- |
| Aug 2026 | 1 (8%) — C01 | | 69% (9 of 13) | 0 (0%) | 62% (8 of 13) | from seed |
| Sep 2026 | 2 (15%) — +C10 | | 54% (7 of 13) | 1 (8%) — O10 | 62% (8 of 13) | 74% (20 of 27) |
| Oct 2026 | | 4 (31%) — C11, C14 | | | | |
| Nov 2026 | | 6 (46%) — C13, C03 | | | | |
| Dec 2026 | | 8 (62%) — C08, C09 | | | | |
| Jan 2027 | | 10 (77%) — C04, C12 | | | | |
| Feb 2027 | | 11 (85%) — C06 | | | | |
| Mar–Jul 2027 | | 12 (92%) — C05 | | | | |

C07 (CIS safeguards) is forecast for d(320), after the year end, so the forecast line lands at 92%: the gap a board should see. Benefits realised (value ÷ profile) comes from the existing measurements and is worked out by the capture function at seed time rather than typed in. The August row applies the rules to the dates and forecasts as they stood at 31/08, with today's project delivery health. Months before August are synthetic (`is_synthetic = true`): counts follow the real dates, and % green eases from about 75% down to the August value.

---

## 6. Seed data for the demo organisation

Added to `scripts/generate-seed.ts` (the seed is generated; never edited by hand). Resource keys refer to existing seed resources.

### 6.1 Capabilities (existing C01–C11, new C12–C15)

| # | Capability | Delivered by | Status | Target | Forecast | Delivered | Accepted (by) | RAG today |
| - | ---------- | ------------ | ------ | ------ | -------- | --------- | ------------- | --------- |
| C01 | Automated identity provisioning | ACA | accepted | d(-60) | d(-66) | d(-66) | d(-58), Head of Service Desk `c9ac15caa52b` | green ✓ |
| C02 | Conversational service assistant | EBB | accepted | d(-80) | d(-80) | d(-84) | d(-78), `a1cee910a6d1` | green ✓ |
| C03 | Curated service knowledge base | EBB | in_progress | d(40) | d(48) | | | amber (EBB at risk) |
| C04 | Copilot-enabled productivity toolset | CMI | in_progress | d(20) | d(95) | | | amber (75 days' slip) |
| C05 | Reusable workflow automation patterns | WAH, TAWS | in_progress | d(150) | d(150) | | | amber (WAH at risk) |
| C06 | Automated research data triage models | RDTA | planned | d(130) | d(130) | | | green |
| C07 | CIS safeguards across the estate | CYB, CSCSI | in_progress | d(160) | d(320) | | | red (CYB off track) |
| C08 | Resilient virtualisation platform | IIRV | in_progress | d(60) | d(66) | | | green |
| C09 | Refreshed data centre network | NRDC | in_progress | d(-10) | d(75) | | | red (past target) |
| C10 | Tested identity recovery service | IRS | accepted | d(-35) | d(-30) | d(-33) | d(-30), `4938bab356ec` | green ✓ |
| C11 | Rehearsed business continuity plans | BCT | delivered | d(-14) | d(-9) | d(-9) | | red (past target, not accepted) |
| C12 | Windows 11 managed device estate *(new)* | W11 | in_progress | d(100) | d(112) | | | green |
| C13 | Cloud cost visibility and tagging *(new)* | CCM | in_progress | d(45) | d(45) | | | green |
| C14 | Digital skills learning platform *(new)* | DSA | delivered | d(10) | d(-5) | d(-5) | | green (awaiting acceptance) |
| C15 | Optimised service desk triage *(new)* | SDO | accepted | d(-75) | d(-70) | d(-72) | d(-70), `b3c221e80091` | green ✓ |

**Forecast history** (reporting date → forecast): C03 d(-30) → d(40), d(-5) → d(48); C04 d(-60) → d(20), d(-30) → d(60), d(-2) → d(95); C07 d(-90) → d(160), d(-30) → d(250), d(-2) → d(320); C09 d(-90) → d(-10), d(-40) → d(30), d(-5) → d(75); C12 d(-60) → d(100), d(-10) → d(112). The others have one row at creation.

**Evidence:** one PDF per accepted capability ("ACA acceptance certificate.pdf", "Ebbot pilot acceptance.pdf", "Identity recovery rehearsal report.pdf", "Service desk triage sign-off.pdf"), and a draft ("BC exercise summary – awaiting sign-off.pdf") on C11. The seed runner uploads a one-page placeholder PDF for each, because SQL alone can't put an object in storage (Q3).

### 6.2 Outcomes and indicators (existing O1–O10, new O11–O14)

| # | Outcome (enabled by) | Status / target | Indicator: baseline → target (dates) | Counted measurements | RAG today |
| - | -------------------- | --------------- | ------------------------------------ | -------------------- | --------- |
| O1 | New starters provisioned without manual tickets (C01) | emerging, d(150) | Staff accounts created automatically, %: 12 (d(-120)) → 95 (d(150)) | d(-56) 48 ✓, d(-26) 61 ✓ | green (ahead) |
| O2 | Students have working accounts on day one (C01) | emerging, d(-14) | Enrolling students with active accounts on day one, %: 71 (d(-380)) → 98 (d(-14)) | d(-14) 93 ✓ | **red** (past target, not achieved) |
| O3 | Routine queries resolved without the service desk (C02, C03) | emerging, d(180) | (a) Queries fully resolved by the assistant, %: 0 (d(-90)) → 35; (b) Contacts per 1,000 users a month: 182 → 140 | (a) d(-26) 14 ✓; (b) d(-26) 176 submitted | green (indicators beat the amber capability) |
| O4 | Students get help outside staffed hours (C02) | emerging, d(90) | Out-of-hours queries answered within 5 minutes, %: 0 (d(-90)) → 80 | d(-26) 22 **queried**: doesn't count | green (falls back to C02, accepted) |
| O5 | Colleagues spend less time on repetitive admin (C04, C05) | planned, d(270) | Hours of manual rekeying removed a month: 0 → 600 | none | amber (from C04/C05) |
| O6 | Research data triaged and quality-checked automatically (C06) | planned, d(300) | Datasets triaged automatically, %: 0 → 70 | none | green (from C06); not due this FY |
| O7 | Attack surface reduced and controls evidenced (C07) | emerging, d(160) | (a) CIS IG1 safeguards evidenced, %: 38 (d(-200)) → 90; (b) Critical vulnerabilities open > 14 days: 46 → 5 | (a) d(-26) 51 ✓ (23% behind); (b) d(-26) 31 ✓ (12% behind) | amber |
| O8 | Critical services stay available during component failure (C08, C09) | planned, d(240) | Critical-service availability, %: 99.2 → 99.9 | none | **red** (from C09) |
| O9 | The estate runs on fewer, more efficient hosts (C08) | planned, d(240) | Data centre IT power draw, kW: 182 → 140 | none | green |
| O10 | Identity services recoverable within agreed times (C10, C11) | **achieved** d(-21), target d(60) | Recovery time in rehearsal, hours: 72 (d(-150)) → 8 | d(-21) 7.5 ✓ | green ✓ |
| O11 | Colleagues work on supported, secure devices (C12) *(new)* | emerging, d(120) | Devices on a supported Windows version, %: 41 (d(-200)) → 100 | d(-26) 68 ✓ (9% behind) | green |
| O12 | Cloud spend is owned and actively managed (C13) *(new)* | planned, d(100) | Cloud spend tagged to an owning budget, %: 35 → 95 | none | green (from C13) |
| O13 | Colleagues are confident using core digital tools (C14) *(new)* | planned, d(280) | Staff confident with core tools (pulse survey), %: 54 → 75 | none | green (from C14) |
| O14 | Service desk resolves more contacts first time (C15, C03) *(new)* | emerging, d(120) | First-contact resolution, %: 61 (d(-150)) → 75 | d(-26) 63 ✓ (31% behind) | **red** |

New links: `outcome_benefits` O11 → BEN-010, BEN-011, BEN-021; O12 → BEN-014, BEN-015; O13 → BEN-016, BEN-017; O14 → BEN-012, BEN-013. Every benefit then has a pathway except the six from closed projects (FSC, UC2, SFZ), which are all in realisation.

### 6.3 Benefit realisation start dates

- In realisation by status (no date needed): BEN-001–006 and BEN-022–027.
- BEN-012 and BEN-013 (SDO closed): `d(-30)`.
- Before realisation: BEN-007 `d(170)`; BEN-008 and BEN-009 `d(70)`; BEN-010, BEN-011 and BEN-021 `d(120)`; BEN-014 and BEN-015 `d(100)`; BEN-016 and BEN-017 `d(140)`; BEN-018–020 `d(300)`.
- BEN-007–010 have Q1 targets and six Q1 measurements from before their new start dates. The seed re-phases their targets so the profile starts at the realisation start and drops those six measurements (Q2), so that readiness and realisation don't disagree on the demo.

Readiness today: BEN-007 amber (O7), BEN-008 **red** (O8), and the rest of the pre-realisation benefits green. Across all 27 benefits: 20 green, 3 amber, 4 red.

---

## 7. Screens (BP3)

Navigation follows `portfolio-overview-spec.md` §3a: Benefits stays a left-rail section, and its pages are top tabs.

- **Benefits → Pathway** (new tab, between Register and Realisation): three linked columns, Capabilities → Outcomes → Benefits. Each card shows its RAG chip with a label (never colour alone), the reason on hover or focus, target / forecast, and a "complete" tick for accepted or achieved. Selecting a card highlights its chain. Filtered by `?programme=<code>`, the same parameter as the overview. Rows with no pathway are listed under "Gaps".
- **Capability drawer:** dates and slip, forecast history sparkline, delivering projects with their delivery health, and an acceptance panel (evidence documents, accepted by, Record acceptance). The button explains when it's disabled (no evidence, wrong role).
- **Outcome drawer:** indicators, each with a small trajectory chart (baseline → target line, counted measurements as dots, queried shown hollow), Submit measurement, and the status control.
- **Home → Approvals:** indicator measurements join the validation queue.
- **Project → Benefits tab:** a "Capabilities this project delivers" panel above the benefits list, so the benefit dimension can be explained from the page that shows it.
- **Benefits map:** nodes pick up the RAG chips. Layout unchanged.
- **Settings → Health thresholds:** the three new keys.

---

## 8. Performance and tests

- Single-pass views with materialised CTEs; no per-row function calls. Indexes: `capabilities (programme_id, status)`, `capabilities (target_date)`, `capability_forecast_history (capability_id, reporting_date)`, `outcome_indicators (outcome_id)`, `outcome_indicator_measurements (indicator_id, measured_on desc)`, `pathway_snapshots (programme_id, snapshot_date)`, plus FK indexes as elsewhere.
- Timings through RLS: the health views stay under 500 ms on the demo org. The three new views are under 200 ms. 500-project org measured and reported (`scripts/seed-perf-org.sql` gains 2 capabilities and 1 outcome with 2 indicators per project).
- Tests (`supabase/tests/`):
  - `benefits_pathway.sql`: the acceptance trigger (role, evidence, un-accept by PMO only), forecast history, the indicator validation workflow, every RAG rule including the trajectory arithmetic for higher-is-better and lower-is-better indicators;
  - the RLS matrix covers the new tables, and existing results must not change;
  - `health_views_snapshot.sql`: the four delivery dimensions identical before and after; the benefit-dimension diff must equal §4.2.
- Unit tests (vitest): the trajectory and shortfall arithmetic shared by the outcome drawer chart, which must agree with the view.

---

## 9. Stages after sign-off

| Stage | Contents | Stop for |
| ----- | -------- | -------- |
| **BP2** | Migrations: enums, columns, `capability_forecast_history`, indicators and measurements, `documents` capability scope (or the table, BP-7), triggers, RLS, settings keys and back-fill, `v_project_delivery_health`, the three RAG views, the new benefit dimension, `pathway_snapshots` and the capture function. Seed (§6). Tests, before/after diff against §4.2, timings, advisors, types. | Diff and timings |
| **BP3** | Screens (§7) and services. | Browser test report |
| **BP4** | Overview wiring: the three chart series and their % green lines in `get_portfolio_overview`, and the capability/outcome signals (turned amber or red this month; past target and not accepted). Lands with, or right after, overview stage 2/3. | Screenshots |

---

## 10. Questions

1. **Pre-realisation hygiene (§4.2 point 2):** add the amber cap for low-confidence or unvalidated (phase index ≥ 2) benefits that haven't started realisation? Recommended: yes.
2. **Seed re-phasing (§6.3):** re-phase BEN-007–010's targets and drop their six pre-start measurements? The alternative is to give them realisation start dates in Q1, which puts them in realisation and leaves them out of the readiness demo.
3. **Placeholder evidence files:** is a seed runner step that uploads placeholder PDFs acceptable? Without it, the evidence rows show "Upload incomplete".
4. **Acceptance grace (§4.2 point 1):** keep acceptance strict (recommended), or add `capabilityAcceptanceGraceDays`?
5. **BP-8:** apply the new rule to programmes as well (recommended), or projects only as briefed?
