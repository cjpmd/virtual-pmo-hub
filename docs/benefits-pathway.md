# Benefits pathway: design (Stages BP1–BP2)

Status: **BP1 signed off; BP2 built** (see "Sign-off" below and §11 "BP2 as built"). BP3 onwards follow this document; each stage stops for review.

## Sign-off

Answers to the BP1 questions (§10):

1. **Pre-realisation hygiene: yes.** A linked benefit not yet in realisation with low confidence, or unvalidated from phase index 2, makes the project or programme benefit dimension at least **amber**, with the reason "Benefit confidence low, not yet validated".
2. **Seed re-phasing: yes.** BEN-007 to BEN-010 are re-phased and their pre-realisation measurements dropped (five in a fresh seed; six on the hosted demo, which had one more BEN-010 submission).
3. **Placeholder evidence: yes.** `scripts/seed-demo-files.ts` uploads small placeholder PDFs (watermarked "Demo placeholder") through the Storage API and only then creates the matching `documents` rows. A documents row is never created without its stored object.
4. **Acceptance grace: strict by default, configurable.** `settings.health.acceptanceGraceDays` (default 0). Capability rule "past target" becomes `target_date + grace < today` for a delivered capability; within the grace window a delivered-but-not-accepted capability is amber with the reason "Awaiting acceptance".
5. **Programmes: yes**, the same rule as projects (BP-8).

Also:

- **`realisation_start_date`:** null means readiness phase. It is required when a benefit's status moves into realisation. The register shows "Set realisation start" as a data gap (`v_benefit_readiness.needs_realisation_start`; the register UI is BP3).
- **Signals:** "capability awaiting acceptance past target" and "benefit has no pathway" are added to the overview signal rules (`portfolio-overview-spec.md`; wired in BP4).

The pathway is the chain the benefits map already draws: **projects → capabilities → outcomes → benefits**. Today the capability and outcome rows are only labels (`capabilities`, `outcomes`, `capability_projects`, `outcome_capabilities`, `outcome_benefits`, all in `20261005175434_benefits.sql`). This stage gives them dates, status and evidence, so that:

- the earliest benefits signal is "is the thing that enables the benefit being delivered and accepted?", long before a benefit has any measurements;
- the project benefit dimension stops being `not_set` (or driven by unmeasured benefits) for most projects;
- the portfolio overview's capabilities / outcomes / benefits series (`docs/design/portfolio-overview-spec.md`, §4 ProgressChart, Benefits tab) have real data.

Conventions carried over from `docs/schema.md` and `docs/financials-and-business-cases.md`: `organisation_id` and `workspace_id` on every table, filled by the tenant guard; audit columns; UK English; RLS written only with the array helpers; every new `private` function revoked from `public, anon`; views single-pass (no per-row function calls); timings measured as a signed-in user through RLS.

In the seed tables below, `d(n)` is the seed's relative date: n days from the Monday of the week the seed runs. On the hosted demo, `d(0)` = Mon 05/10/2026, and the financial year runs from 01/08/2026 (`d(-65)`) to 31/07/2027 (`d(299)`).

---

## Decisions for sign-off

These are the choices where I've gone beyond the brief or had to pick a reading. Everything else follows the brief as written.

| #    | Decision                                        | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BP-1 | Which project health a capability reads         | **The four delivery dimensions only** (schedule, financial, effort, issue), never the benefit dimension or the override. The project benefit dimension now reads capability health, so using the project's overall would make a loop. "Off track" = any of the four is red; "at risk" = any is amber. The override is left out because it is a judgement on the whole project, benefits included.                                                                                                                    |
| BP-2 | Breaking the view cycle                         | A new **`v_project_delivery_health`** holds the four dimensions. `v_capability_health` reads it; `v_project_health` reads it plus `v_capability_health`. Same columns and results as today for the four dimensions (checked with `health_views_snapshot.sql`).                                                                                                                                                                                                                                                       |
| BP-3 | When a benefit's realisation period starts      | A new column **`benefits.realisation_start_date`**. _(As signed off:)_ a benefit is in realisation once `realisation_start_date <= today`; null means readiness. The date is required to move a benefit into a realisation status (`in_realisation`, `realised`, `partially_realised`, `not_realised`). Benefits already in those statuses were back-filled with their first profiled period. It can't be worked out from the targets: every demo benefit has Q1 targets, including ones that are only `identified`. |
| BP-4 | Indicator measurements: periods or dates        | **Dates** (`measured_on`), not `benefit_periods`. Indicators are judged against a straight-line trajectory, which needs a point in time. The workflow (submit → validate or query; PMO only; queried never counts; validated beats submitted) is the same as for benefit measurements, using the same trigger function.                                                                                                                                                                                              |
| BP-5 | Who may accept a capability                     | `accepted_by` is a **resource**: the receiving business owner, who may not be a user. The **person recording** the acceptance must be a manager or PMO in the workspace, and at least one evidence document must be attached. Only PMO can un-accept, and the audit log keeps the change.                                                                                                                                                                                                                            |
| BP-6 | Who sets an outcome to achieved or not achieved | **PMO only**, like validating a measurement. The other statuses (`planned`, `emerging`) are open to contributors.                                                                                                                                                                                                                                                                                                                                                                                                    |
| BP-7 | Acceptance evidence storage                     | Use the **`documents`** table from F4 (`financials-and-business-cases.md` §2.4), with `capability` added to `document_scope` and a typed `capability_id` FK. If F4 hasn't landed when BP2 starts, BP2 creates `documents` to the F4 spec (with the capability scope) and F4 adds its own scopes later.                                                                                                                                                                                                               |
| BP-8 | Programme benefit dimension                     | **The same rule as projects:** the worst of the programme's capabilities and its benefits that are in realisation. The brief only names projects, but leaving programmes on the old rule would put two definitions of "benefit health" on one page.                                                                                                                                                                                                                                                                  |
| BP-9 | Monthly history                                 | A new item-level table **`pathway_snapshots`** (one row per capability, outcome and benefit per month-end), written by the existing `capture_health_snapshots` job. The chart and the "turned amber/red this month" signal both need per-item history; counts and % green are aggregated from it by the overview RPC.                                                                                                                                                                                                |

---

## 1. Capabilities

### 1.1 New columns on `capabilities`

| Column            | Type                                                                         | Notes                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `status`          | enum `capability_status` = `planned`, `in_progress`, `delivered`, `accepted` | default `planned`                                                                                           |
| `target_date`     | `date`                                                                       | the committed date: when the capability should be **accepted**. Required once the status is past `planned`. |
| `forecast_date`   | `date`                                                                       | current forecast of acceptance. Defaults to `target_date`.                                                  |
| `delivered_date`  | `date`                                                                       | required when the status is `delivered` or `accepted`; null otherwise                                       |
| `accepted_at`     | `date`                                                                       | required when `accepted`; null otherwise                                                                    |
| `accepted_by_id`  | `uuid` → `resources (id, organisation_id)`                                   | required when `accepted` (BP-5)                                                                             |
| `acceptance_note` | `text`                                                                       | optional; what was accepted and any conditions                                                              |

Checks:

- `status in ('delivered','accepted')` ⇔ `delivered_date is not null`;
- `status = 'accepted'` ⇔ `accepted_at is not null and accepted_by_id is not null`;
- `accepted_at >= delivered_date`.

**Only `accepted` counts as delivered.** `delivered` means "handed over, awaiting sign-off" and is still open work: it can go red, and it does not count towards the chart's "Capabilities delivered" line.

### 1.2 Acceptance rules (trigger `private.capability_rules`)

- Moving to `accepted` needs a manager or PMO role in the workspace (BP-5) and at least one non-archived `documents` row with `scope = 'capability'` for this capability **whose object is stored** in the `documents` bucket (a row alone doesn't count). Error messages: "Only managers and PMO can record acceptance" / "Attach the acceptance evidence first".
- Moving out of `accepted` needs PMO. `accepted_at` and `accepted_by_id` are cleared, and the audit log keeps the old values.
- Server-side jobs and the seed (no `auth.uid()`) bypass the role checks, as with measurement validation. The seed (`vpmo.seeding = 'on'`) also skips the evidence check, because its evidence is uploaded afterwards by `scripts/seed-demo-files.ts`.

### 1.3 Forecast history

`capability_forecast_history` has the same shape and behaviour as `milestone_forecast_history`: `(id, organisation_id, workspace_id, capability_id, reporting_date, forecast_date, created_at, created_by)`, unique on `(capability_id, reporting_date)`, written only by an `after insert or update of forecast_date` trigger (`private.record_capability_forecast`), and select-only for `authenticated`. History survives the capability (`on delete restrict` like milestones; capabilities are archived, not deleted, once any history exists).

### 1.4 Evidence

Documents use the `documents` table (BP-7): `scope = 'capability'`, `capability_id` set, storage path `{org}/{workspace}/capability/{capability id}/{document id}/{file name}`. Upload, versioning, signed-URL download and archive-only behaviour are as in F4 §2.4.

---

## 2. Outcomes

### 2.1 New columns on `outcomes`

| Column          | Type                                                                      | Notes                                                                 |
| --------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `status`        | enum `outcome_status` = `planned`, `emerging`, `achieved`, `not_achieved` | default `planned`. `achieved` and `not_achieved` are PMO-only (BP-6). |
| `target_date`   | `date`                                                                    | when the outcome should be achieved                                   |
| `achieved_date` | `date`                                                                    | required when `achieved`; null otherwise                              |

### 2.2 `outcome_indicators`

| Column                                        | Notes                                                                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id, organisation_id, workspace_id, outcome_id | tenant guard from `outcomes`                                                                                                                                         |
| name, unit                                    | e.g. "Students with active accounts on day one", `%`                                                                                                                 |
| baseline_value, baseline_date                 | required                                                                                                                                                             |
| target_value, target_date                     | required; `target_value <> baseline_value`; `target_date > baseline_date`. Whether higher or lower is better comes from the sign of `target_value − baseline_value`. |
| frequency                                     | `measure_frequency`, default `quarterly`                                                                                                                             |
| next_due_date                                 | as on `benefit_measures`: an overdue first measurement makes the indicator amber                                                                                     |
| data_source, measurement_method               | text                                                                                                                                                                 |
| sort_order, audit columns                     |                                                                                                                                                                      |

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

| Key                                   | Default | Used by                                                                                                                   |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `capabilitySlipAmberDays`             | 30      | capability: amber when `forecast_date − target_date` is more than this                                                    |
| `acceptanceGraceDays`                 | 0       | capability: days after target that a delivered capability is amber ("Awaiting acceptance") before red (sign-off answer 4) |
| `outcomeBehindTrajectoryAmberPercent` | 10      | indicator: amber when behind the trajectory by more than this share of the planned change                                 |
| `outcomeBehindTrajectoryRedPercent`   | 25      | indicator: red above this                                                                                                 |

### 3.2 `v_capability_health`

Columns: `capability_id, organisation_id, workspace_id, programme_id, status, target_date, forecast_date, slip_days, is_complete, rag, reason`.

Rules, first match wins:

1. `status = 'accepted'` → **green**, `is_complete = true`.
2. No `target_date` (still `planned` with no date) → **not_set**. _(Moved up in BP2: otherwise an undated capability copied its project's delivery health into the benefit dimension.)_
3. `status = 'delivered'`, past target but within `acceptanceGraceDays` → **amber**, "Awaiting acceptance".
4. Past target (for a delivered capability: past target plus the grace) and not accepted → **red**.
5. Any delivering project (via `capability_projects`, project not closed) is off track on its delivery dimensions (BP-1) → **red**.
6. `forecast_date − target_date > capabilitySlipAmberDays` → **amber**.
7. Any delivering project is at risk → **amber**.
8. Otherwise → **green** ("Delivered, acceptance due by …" for a delivered capability not yet past target).

The rule lives in one function, `private.capability_rag(...)`, which reads no tables; the view and both roll-ups call it (§11).

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

- **Realisation** (BP-3: `realisation_start_date <= today`): the per-benefit form of today's rule, from `v_benefit_realisation` in one pass: red if confidence is low or the benefit is behind profile; amber if a measurement is overdue, the status is `identified` or eligibility isn't confirmed; otherwise green.
- Also returned: `has_pathway` (for the "benefit has no pathway" signal) and `needs_realisation_start` (planned or validated with no date: the register's "Set realisation start" gap).
- **Readiness** (before realisation starts): **the worst of its outcomes' RAG** (`outcome_benefits` → `v_outcome_health`). A benefit with no outcomes is **not_set**, with the reason "No pathway: link this benefit to an outcome". The register shows these as a data gap.
- `closed` benefits are left out.

---

## 4. Project and programme benefit dimension

### 4.1 New rule

In `v_project_health` the benefit dimension becomes:

- **not_set** when the project delivers no capabilities and has no linked benefit in realisation;
- otherwise **the worst of**:
  - the health of each capability it delivers (`capability_projects` → `v_capability_health`; accepted = green);
  - today's flags (`benefit_flags` as in `20261006104522_health_views_single_pass.sql`), applied **only to its linked benefits that are in realisation**;
  - _(sign-off answer 1)_ **amber** for any linked benefit not yet in realisation with low confidence, or unvalidated from phase index 2: "Benefit confidence low, not yet validated".

A new last column, `benefit_reason`, names the worst contributor (on `v_project_health` and `v_programme_health`).

Benefits that haven't started realisation no longer affect the project directly; their capabilities stand in for them. `v_programme_health` changes the same way (BP-8): its capabilities plus its benefits in realisation. `benefit_dimension_health()` (the old single-item helper) has no callers and is left unchanged.

Structure (BP-2): `v_project_delivery_health` feeds both `v_capability_health` and `v_project_health`. Working the delivery dimensions out twice per query cost 50% on 500 projects, so (as planned) the roll-ups apply the capability rule from their own materialised delivery CTE, through the shared `private.capability_rag` function, so there is one definition.

Health snapshots taken before the switch keep their stored values, so the Health tab's benefit line may step at the switch month. The seed regenerates its synthetic history with the new rule, so the demo has no step.

### 4.2 Before / after on the demo organisation

"Before" is the hosted demo's `v_project_health` today. "After" applies §3–§4 to the same data plus the seed in §6, worked out with a read-only query against the hosted project. Only projects whose benefit dimension changes are listed. The other 28 projects are unchanged: 9 with a pathway (listed under the table) and 19 with none, which stay `not_set`.

| Project                             | State    | Capabilities it delivers (RAG)                              | Benefit before | Benefit after | Overall before → after | Why                                                                                       |
| ----------------------------------- | -------- | ----------------------------------------------------------- | -------------- | ------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| BCT Business Continuity Testing     | active   | C11 Rehearsed BC plans (**red**)                            | not_set        | **red**       | green → **red**        | Delivered d(-9), target d(-14), not yet accepted by the owning services                   |
| CSCSI CIS Safeguards                | active   | C07 CIS safeguards (**red**)                                | not_set        | **red**       | amber → **red**        | Co-delivering project CYB is off track                                                    |
| CMI Copilot / Microsoft integration | on hold  | C04 Copilot toolset (amber)                                 | not_set        | **amber**     | green → **amber**      | Forecast 75 days beyond target                                                            |
| TAWS Testing Automation             | active   | C05 Workflow patterns (amber)                               | not_set        | **amber**     | green → **amber**      | Co-delivering project WAH is at risk                                                      |
| W11 Windows 11 Rollout              | active   | C12 Managed device estate (green)                           | red            | **green**     | red → **green**        | Red came from low-confidence benefits that haven't started realisation (BEN-011, BEN-021) |
| DSA Digital Skills Academy          | active   | C14 Learning platform (green)                               | red            | **green**     | red → **green**        | Red came from a low-confidence benefit before realisation (BEN-016)                       |
| EBB Ebbot (chatbot)                 | active   | C02 Assistant (green, accepted), C03 Knowledge base (amber) | green          | **amber**     | amber → amber          | Knowledge base capability: delivering project at risk                                     |
| WAH Workflow Automation Hub         | active   | C05 (amber)                                                 | not_set        | **amber**     | amber → amber          | Its own delivery is at risk                                                               |
| NRDC Network Refresh                | proposed | C09 DC network (**red**)                                    | not_set        | **red**       | red → red              | Past target, project off track                                                            |
| IRS Identity Recovery Service       | on hold  | C10 (green, accepted)                                       | not_set        | **green**     | green → green          | Accepted d(-30)                                                                           |

Unchanged but now explained differently: ACA (red: BEN-001 is in realisation with low confidence; its capability is accepted), CYB (red both ways), SDO (amber: BEN-012 is in realisation and its measurement is overdue), CCM, IIRV and RDTA (green both ways), and the closed FSC, UC2 and SFZ (their benefits are all in realisation, so the existing rule applies unchanged).

**Roll-up (27 active projects):**

|                                                 | Before                 | After                                                                                                       |
| ----------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Overall green / amber / red                     | 16 / 6 / 5 (59% green) | 16 / 6 / 5 (59% green), but different projects: BCT and CSCSI go red, TAWS goes amber, W11 and DSA go green |
| Benefit dimension green / amber / red / not_set | 4 / 0 / 4 / 19         | 5 / 3 / 4 / 15                                                                                              |

Programmes: Resilience stays red (C07, C09 and C11 are red; BEN-006 is red). Efficiency, Automation & AI stays red (BEN-001). People, Knowledge & CI stays red (BEN-027 is in realisation with low confidence). **Optimisation & Cost Management: red → amber** on the benefit dimension (its capabilities are green and BEN-012 is amber), though its overall stays red because of VDI.

**What the change shows.** Two things to weigh at sign-off:

1. **Acceptance is strict.** BCT flips green → red only because the business continuity plans were delivered five days late and haven't been signed off. That is the intended "only accepted counts" behaviour. If it's too sharp, a `capabilityAcceptanceGraceDays` setting (amber, not red, for this many days past target when the status is `delivered`) is a one-line addition. **Not proposed by default.**
2. **Pre-realisation benefit hygiene goes quiet.** W11 and DSA turn green because low-confidence or unvalidated benefits that haven't started realisation no longer count. To keep that signal, one extra rule could cap them at **amber**: any linked pre-realisation benefit with low confidence, or still unvalidated from phase index 2 onwards. With that rule, W11 and DSA would be amber (active overall: 14 green / 8 amber / 5 red). **I recommend adding it.** It is listed as question Q1 because it goes beyond the brief.

---

## 5. Monthly snapshot values for the progress chart

### 5.1 `pathway_snapshots` (BP-9)

| Column                                          | Notes                                                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| id, organisation_id, workspace_id, programme_id | `programme_id` so the chart filters by programme without joins                                                               |
| snapshot_date                                   | month-end (or the capture day; the RPC takes the last row per month)                                                         |
| capability_id, outcome_id, benefit_id           | exactly one set (check), FKs `on delete restrict`, as for `health_snapshots`                                                 |
| rag, phase (benefits only), is_complete         | from the three views                                                                                                         |
| due_in_fy                                       | `target_date` (or the benefit's FY profile) falls in the organisation's financial year containing `snapshot_date`            |
| realised_value, fy_profile_value                | benefits only: realised value to date and this FY's profiled value, from `v_benefit_realisation` / `v_benefit_period_values` |
| is_synthetic, created_at                        |                                                                                                                              |

Unique on `(coalesce(capability_id, outcome_id, benefit_id), snapshot_date)`. Written by `private.capture_health_snapshots` in the same transaction as the health snapshots (idempotent per day, `on conflict do update`). Select for workspace members; no client writes.

### 5.2 Series definitions (as the overview spec words them)

| Series                 | Actual (month-end, from `pathway_snapshots`)          | Forecast (dotted, live)                                                                              | % green                                        |
| ---------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Capabilities delivered | accepted ÷ capabilities with `target_date` in this FY | cumulative count by month of `forecast_date` (a `delivered` capability counts at the next month-end) | green ÷ due this FY (accepted counts as green) |
| Outcomes achieved      | achieved ÷ outcomes with `target_date` in this FY     | none: outcomes have no forecast date                                                                 | green ÷ due this FY                            |
| Benefits realised      | realised value ÷ FY profile (unchanged definition)    | from the current profile, as today                                                                   | green ÷ benefits not closed                    |

The series stay hidden until the organisation has at least one capability with a `target_date` (overview spec, "Dependency").

### 5.3 Demo values (Benefits tab, FY 2026/27)

13 capabilities are due this FY (all except C02 and C15, whose targets fell in the last FY). 13 outcomes are due (O6's target is d(300), in the next FY).

| Month-end    | Capabilities accepted | Capabilities forecast | Capabilities % green | Outcomes achieved | Outcomes % green | Benefits % green |
| ------------ | --------------------- | --------------------- | -------------------- | ----------------- | ---------------- | ---------------- |
| Aug 2026     | 1 (8%) — C01          |                       | 69% (9 of 13)        | 0 (0%)            | 62% (8 of 13)    | from seed        |
| Sep 2026     | 2 (15%) — +C10        |                       | 54% (7 of 13)        | 1 (8%) — O10      | 62% (8 of 13)    | 74% (20 of 27)   |
| Oct 2026     |                       | 4 (31%) — C11, C14    |                      |                   |                  |                  |
| Nov 2026     |                       | 6 (46%) — C13, C03    |                      |                   |                  |                  |
| Dec 2026     |                       | 8 (62%) — C08, C09    |                      |                   |                  |                  |
| Jan 2027     |                       | 10 (77%) — C04, C12   |                      |                   |                  |                  |
| Feb 2027     |                       | 11 (85%) — C06        |                      |                   |                  |                  |
| Mar–Jul 2027 |                       | 12 (92%) — C05        |                      |                   |                  |                  |

C07 (CIS safeguards) is forecast for d(320), after the year end, so the forecast line lands at 92%: the gap a board should see. Benefits realised (value ÷ profile) comes from the existing measurements and is worked out by the capture function at seed time rather than typed in. The August row applies the rules to the dates and forecasts as they stood at 31/08, with today's project delivery health. Earlier months are worked out the same way (`is_synthetic = true`). Only two capabilities (C02, C15) fall due in FY 2025/26, both accepted in July, so the prior-year lines are short; the "eases from 75%" wording in BP1 was wrong. Benefit history rows carry RAG and phase but no realised value (not recoverable as at past dates). _As built: the August and September rows match this table exactly, locally and on the hosted demo._

---

## 6. Seed data for the demo organisation

Added to `scripts/generate-seed.ts` (the seed is generated; never edited by hand). Resource keys refer to existing seed resources.

### 6.1 Capabilities (existing C01–C11, new C12–C15)

| #   | Capability                                | Delivered by | Status      | Target | Forecast | Delivered | Accepted (by)                               | RAG today                       |
| --- | ----------------------------------------- | ------------ | ----------- | ------ | -------- | --------- | ------------------------------------------- | ------------------------------- |
| C01 | Automated identity provisioning           | ACA          | accepted    | d(-60) | d(-66)   | d(-66)    | d(-58), Head of Service Desk `c9ac15caa52b` | green ✓                         |
| C02 | Conversational service assistant          | EBB          | accepted    | d(-80) | d(-80)   | d(-84)    | d(-78), `a1cee910a6d1`                      | green ✓                         |
| C03 | Curated service knowledge base            | EBB          | in_progress | d(40)  | d(48)    |           |                                             | amber (EBB at risk)             |
| C04 | Copilot-enabled productivity toolset      | CMI          | in_progress | d(20)  | d(95)    |           |                                             | amber (75 days' slip)           |
| C05 | Reusable workflow automation patterns     | WAH, TAWS    | in_progress | d(150) | d(150)   |           |                                             | amber (WAH at risk)             |
| C06 | Automated research data triage models     | RDTA         | planned     | d(130) | d(130)   |           |                                             | green                           |
| C07 | CIS safeguards across the estate          | CYB, CSCSI   | in_progress | d(160) | d(320)   |           |                                             | red (CYB off track)             |
| C08 | Resilient virtualisation platform         | IIRV         | in_progress | d(60)  | d(66)    |           |                                             | green                           |
| C09 | Refreshed data centre network             | NRDC         | in_progress | d(-10) | d(75)    |           |                                             | red (past target)               |
| C10 | Tested identity recovery service          | IRS          | accepted    | d(-35) | d(-30)   | d(-33)    | d(-30), `4938bab356ec`                      | green ✓                         |
| C11 | Rehearsed business continuity plans       | BCT          | delivered   | d(-14) | d(-9)    | d(-9)     |                                             | red (past target, not accepted) |
| C12 | Windows 11 managed device estate _(new)_  | W11          | in_progress | d(100) | d(112)   |           |                                             | green                           |
| C13 | Cloud cost visibility and tagging _(new)_ | CCM          | in_progress | d(45)  | d(45)    |           |                                             | green                           |
| C14 | Digital skills learning platform _(new)_  | DSA          | delivered   | d(10)  | d(-5)    | d(-5)     |                                             | green (awaiting acceptance)     |
| C15 | Optimised service desk triage _(new)_     | SDO          | accepted    | d(-75) | d(-70)   | d(-72)    | d(-70), `b3c221e80091`                      | green ✓                         |

**Forecast history** (reporting date → forecast): C03 d(-30) → d(40), d(-5) → d(48); C04 d(-60) → d(20), d(-30) → d(60), d(-2) → d(95); C07 d(-90) → d(160), d(-30) → d(250), d(-2) → d(320); C09 d(-90) → d(-10), d(-40) → d(30), d(-5) → d(75); C12 d(-60) → d(100), d(-10) → d(112). The others have one row at creation.

**Evidence:** one PDF per accepted capability ("ACA acceptance certificate.pdf", "Ebbot pilot acceptance.pdf", "Identity recovery rehearsal report.pdf", "Service desk triage sign-off.pdf"), and a draft ("BC exercise summary – awaiting sign-off.pdf") on C11. The seed runner uploads a one-page placeholder PDF for each, because SQL alone can't put an object in storage (Q3).

### 6.2 Outcomes and indicators (existing O1–O10, new O11–O14)

| #   | Outcome (enabled by)                                                 | Status / target                   | Indicator: baseline → target (dates)                                                                             | Counted measurements                                       | RAG today                                    |
| --- | -------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| O1  | New starters provisioned without manual tickets (C01)                | emerging, d(150)                  | Staff accounts created automatically, %: 12 (d(-120)) → 95 (d(150))                                              | d(-56) 48 ✓, d(-26) 61 ✓                                   | green (ahead)                                |
| O2  | Students have working accounts on day one (C01)                      | emerging, d(-14)                  | Enrolling students with active accounts on day one, %: 71 (d(-380)) → 98 (d(-14))                                | d(-14) 93 ✓                                                | **red** (past target, not achieved)          |
| O3  | Routine queries resolved without the service desk (C02, C03)         | emerging, d(180)                  | (a) Queries fully resolved by the assistant, %: 0 (d(-90)) → 35; (b) Contacts per 1,000 users a month: 182 → 140 | (a) d(-26) 14 ✓; (b) d(-26) 176 submitted                  | green (indicators beat the amber capability) |
| O4  | Students get help outside staffed hours (C02)                        | emerging, d(90)                   | Out-of-hours queries answered within 5 minutes, %: 0 (d(-90)) → 80                                               | d(-26) 22 **queried**: doesn't count                       | green (falls back to C02, accepted)          |
| O5  | Colleagues spend less time on repetitive admin (C04, C05)            | planned, d(270)                   | Hours of manual rekeying removed a month: 0 → 600                                                                | none                                                       | amber (from C04/C05)                         |
| O6  | Research data triaged and quality-checked automatically (C06)        | planned, d(300)                   | Datasets triaged automatically, %: 0 → 70                                                                        | none                                                       | green (from C06); not due this FY            |
| O7  | Attack surface reduced and controls evidenced (C07)                  | emerging, d(160)                  | (a) CIS IG1 safeguards evidenced, %: 38 (d(-200)) → 90; (b) Critical vulnerabilities open > 14 days: 46 → 5      | (a) d(-26) 51 ✓ (23% behind); (b) d(-26) 31 ✓ (12% behind) | amber                                        |
| O8  | Critical services stay available during component failure (C08, C09) | planned, d(240)                   | Critical-service availability, %: 99.2 → 99.9                                                                    | none                                                       | **red** (from C09)                           |
| O9  | The estate runs on fewer, more efficient hosts (C08)                 | planned, d(240)                   | Data centre IT power draw, kW: 182 → 140                                                                         | none                                                       | green                                        |
| O10 | Identity services recoverable within agreed times (C10, C11)         | **achieved** d(-21), target d(60) | Recovery time in rehearsal, hours: 72 (d(-150)) → 8                                                              | d(-21) 7.5 ✓                                               | green ✓                                      |
| O11 | Colleagues work on supported, secure devices (C12) _(new)_           | emerging, d(120)                  | Devices on a supported Windows version, %: 41 (d(-200)) → 100                                                    | d(-26) 68 ✓ (9% behind)                                    | green                                        |
| O12 | Cloud spend is owned and actively managed (C13) _(new)_              | planned, d(100)                   | Cloud spend tagged to an owning budget, %: 35 → 95                                                               | none                                                       | green (from C13)                             |
| O13 | Colleagues are confident using core digital tools (C14) _(new)_      | planned, d(280)                   | Staff confident with core tools (pulse survey), %: 54 → 75                                                       | none                                                       | green (from C14)                             |
| O14 | Service desk resolves more contacts first time (C15, C03) _(new)_    | emerging, d(120)                  | First-contact resolution, %: 61 (d(-150)) → 75                                                                   | d(-26) 63 ✓ (31% behind)                                   | **red**                                      |

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

| Stage   | Contents                                                                                                                                                                                                                                                                                                                                                                                      | Stop for            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **BP2** | Migrations: enums, columns, `capability_forecast_history`, indicators and measurements, `documents` capability scope (or the table, BP-7), triggers, RLS, settings keys and back-fill, `v_project_delivery_health`, the three RAG views, the new benefit dimension, `pathway_snapshots` and the capture function. Seed (§6). Tests, before/after diff against §4.2, timings, advisors, types. | Diff and timings    |
| **BP3** | Screens (§7) and services.                                                                                                                                                                                                                                                                                                                                                                    | Browser test report |
| **BP4** | Overview wiring: the three chart series and their % green lines in `get_portfolio_overview`, and the capability/outcome signals (turned amber or red this month; past target and not accepted). Lands with, or right after, overview stage 2/3.                                                                                                                                               | Screenshots         |

---

## 10. Questions (answered at sign-off; see the top of this document)

1. **Pre-realisation hygiene (§4.2 point 2):** add the amber cap for low-confidence or unvalidated (phase index ≥ 2) benefits that haven't started realisation? Recommended: yes.
2. **Seed re-phasing (§6.3):** re-phase BEN-007–010's targets and drop their six pre-start measurements? The alternative is to give them realisation start dates in Q1, which puts them in realisation and leaves them out of the readiness demo.
3. **Placeholder evidence files:** is a seed runner step that uploads placeholder PDFs acceptable? Without it, the evidence rows show "Upload incomplete".
4. **Acceptance grace (§4.2 point 1):** keep acceptance strict (recommended), or add `capabilityAcceptanceGraceDays`?
5. **BP-8:** apply the new rule to programmes as well (recommended), or projects only as briefed?

---

## 11. BP2 as built

### Migrations (applied to the hosted project)

- **`20261007083935_benefits_pathway`**:
  - **Settings:** the four new health keys, back-filled for existing organisations. `valid_org_settings` now also rejects a _missing_ key; before, `bool_and` skipped the null a missing key produced, so an incomplete `health` object passed.
  - **Capabilities:** status, dates, acceptance and `archived_at`; the `capability_rules` trigger (acceptance role, stored-evidence check, PMO-only reversal); `capability_forecast_history` with its trigger; audit.
  - **`documents`** (BP-7: project, programme and capability scopes; `storage_path` set by the trigger; immutable apart from archiving). The private `documents` bucket (25 MB; PDF, DOCX, XLSX, PPTX). Storage policies: upload only to the path of a visible documents row; no update or delete.
  - **Outcomes:** status, `target_date`, `achieved_date`, `archived_at`; the `outcome_rules` trigger (PMO-only achieved / not achieved); `outcome_indicators` and `outcome_indicator_measurements` (same validate/query trigger as benefit measurements).
  - **Benefits:** `benefits.realisation_start_date` (back-filled for benefits already in a realisation status) and its required-to-move-into-realisation trigger.
  - **Views:** `v_project_delivery_health`, `private.capability_rag`, `v_capability_health`, `v_outcome_indicator_health`, `v_outcome_health`, `v_benefit_readiness`; `v_project_health` and `v_programme_health` with the new benefit dimension and a `benefit_reason` column.
  - **History:** `pathway_snapshots` and `private.capture_pathway_snapshots`, called from `capture_health_snapshots` (so the nightly job and status-report submissions capture it).
- **`20261007085404_capability_forecast_history_fk_index`**: the covering index the performance advisor asked for.

RLS uses the array helpers throughout. History and snapshot tables are read-only to clients. Capabilities and outcomes with history can no longer be deleted (`on delete restrict`, as for milestones and health snapshots); `archived_at` is there for BP3 to archive them instead.

### Seed and demo data

- `scripts/seed-data/benefits-pathway.ts` holds §6's data. `scripts/generate-seed.ts` writes it into `supabase/seed.sql` (regenerated; the generator still reproduces the committed seed byte for byte apart from these additions) and, with `--pathway-patch`, into **`scripts/demo-benefits-pathway.sql`**: the same statements as idempotent upserts for a demo organisation seeded before BP2, dated from that seed's own anchor.
- **Hosted demo:** the patch was applied (in steps through the SQL tool). Locally, "old seed + migration + patch" (run twice, and with a leftover `seed_tmp` schema present) gives exactly the same health, RAGs and month-end values as a fresh seed.
- **Evidence files:** `scripts/seed-demo-files.ts` (with `scripts/lib/placeholder-pdf.ts`) is written and unit-tested, but **not yet run against hosted**: it needs the service role key (`SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/seed-demo-files.ts`). Until it runs, the four accepted demo capabilities have no evidence document (the seed's acceptance bypass), and C11's draft is missing. Health is unaffected.
- **Clean-up needed on hosted:** the SQL tool would not run `drop schema` (it waits for a confirmation it never gets), so the empty helper schema `pathway_patch_tmp` is still there. Also present: a `seed_tmp` schema left by the original demo seeding. Both are harmless (no grants to `public`). To remove them: `drop schema pathway_patch_tmp cascade; drop schema seed_tmp cascade;`.

### Health diff (hosted demo = local fresh seed)

The four delivery dimensions are identical before and after for every project (checked locally and on hosted). Projects whose benefit dimension changed:

| Project | State    | Benefit before → after | Overall before → after | Reason (from `benefit_reason`)                                                                          |
| ------- | -------- | ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| BCT     | active   | not_set → **red**      | green → **red**        | Capability "Rehearsed business continuity plans": Past target date (21/09/2026) and awaiting acceptance |
| CSCSI   | active   | not_set → **red**      | amber → **red**        | Capability "CIS safeguards…": Delivering project off track: CYB                                         |
| TAWS    | active   | not_set → **amber**    | green → **amber**      | Capability "Reusable workflow automation patterns": Delivering project at risk: WAH                     |
| W11     | active   | red → **amber**        | red → **amber**        | Benefit confidence low, not yet validated                                                               |
| DSA     | active   | red → **amber**        | red → **amber**        | Benefit confidence low, not yet validated                                                               |
| CMI     | on hold  | not_set → **amber**    | green → **amber**      | Capability "Copilot-enabled productivity toolset": Forecast 75 days beyond target                       |
| EBB     | active   | green → **amber**      | amber → amber          | Capability "Curated service knowledge base": Delivering project at risk: EBB                            |
| WAH     | active   | not_set → **amber**    | amber → amber          | Capability "Reusable workflow automation patterns": Delivering project at risk: WAH                     |
| NRDC    | proposed | not_set → **red**      | red → red              | Capability "Refreshed data centre network": Past target date (25/09/2026) and not accepted              |
| IRS     | on hold  | not_set → **green**    | green → green          | Capability "Tested identity recovery service": Accepted 05/09/2026                                      |

This is §4.2 with sign-off answer 1 applied: W11 and DSA go amber, not green. Everything else is as §4.2 predicted.

- **Active projects, overall green / amber / red:** 16 / 6 / 5 → **14 / 8 / 5**.
- **Active projects, benefit dimension green / amber / red / not_set:** 4 / 0 / 4 / 19 → **3 / 5 / 4 / 15**.
- **Programmes:** Optimisation & Cost Management benefit red → **amber** (BEN-012 measurement overdue). The others are unchanged (Standards not_set; Resilience, Efficiency and People red). Programme and portfolio overall: unchanged.

### Tests

| Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Local                                                                                                                                                                   | Hosted                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `supabase/tests/benefits_pathway.sql` (new, 31 checks: acceptance role, stored evidence, a row without an object doesn't count, upload only to a documents-row path, no evidence delete, PMO-only reversal with audit, archived evidence, forecast history, grace window, missing settings key, outcome status, indicator validation and trajectory, queried not counted, realisation start, outsider reads and writes, cross-organisation links and `accepted_by`, spoofed tenant ids) | 0 failures                                                                                                                                                              | 0 failures (rolled back; nothing left behind) |
| `rls_matrix.sql` before/after on the same data                                                                                                                                                                                                                                                                                                                                                                                                                                          | Only additions (the five new tables); `audit_log` counts rise by the 12 audited back-fill updates                                                                       | —                                             |
| `health_views_snapshot.sql` before/after                                                                                                                                                                                                                                                                                                                                                                                                                                                | Only the benefit dimension changes, as above                                                                                                                            | —                                             |
| `tenant_guard`, `financials`, `project_writes`                                                                                                                                                                                                                                                                                                                                                                                                                                          | Pass before and after                                                                                                                                                   | —                                             |
| Vitest (`npx vitest run`)                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 44 pass, including new tests for the placeholder PDF and for the evidence order (upload before row; no row if the upload fails; object removed if the row insert fails) | —                                             |

### Timings (as a signed-in member, through RLS)

| View                         | Local demo, before → after | Local 500 projects, before → after | Hosted demo (warm) |
| ---------------------------- | -------------------------- | ---------------------------------- | ------------------ |
| `v_project_health`           | 60 → 47 ms                 | 599 → 634 ms                       | 77 ms              |
| `v_programme_health`         | 60 → 60 ms                 | 1,011 → 1,094 ms                   | 105 ms             |
| `v_portfolio_health`         | 145 → 132 ms               | 1,691 → 1,915 ms                   | 184 ms             |
| `v_capability_health`        | 32 ms                      | 267 ms                             | 54 ms              |
| `v_outcome_health`           | 36 ms                      | 300 ms                             | 59 ms              |
| `v_benefit_readiness`        | 52 ms                      | 708 ms                             | 68 ms              |
| `v_outcome_indicator_health` | 3 ms                       | 40 ms                              | 2 ms               |

The first build computed delivery health twice per query (+50% on 500 projects). Moving the capability rule into `private.capability_rag` and feeding it the roll-ups' own delivery CTE brought that down to +6–13%. The 500-project organisation gained 2 capabilities and 1 outcome per project (`scripts/seed-perf-org-pathway.sql`). It wasn't run on hosted (it would create a permanent organisation there).

### Advisors (hosted)

- **Security:** no new findings. The two existing warnings remain (`create_organisation` and `join_demo_organisation` are security-definer RPCs, on purpose; leaked-password protection is an Auth setting).
- **Performance:** one new finding, the unindexed `capability_forecast_history` foreign key, fixed by the second migration. The remaining notices are "unused index" (INFO), as on every other table.

### Front end

`HealthThresholds` gains the four keys (type, defaults, Settings → Health thresholds inputs), so saving settings keeps them. `src/integrations/supabase/types.ts` is regenerated; the only changes are additions (five tables, five views, new columns). No screens yet (BP3).

## 12. BP3 as built

The minimum screens to enter and maintain pathway data. They use the existing UI components; the design-token restyle comes with the overview rollout. BP4 (chart series and signals) is not a separate stage: it is built into the overview redesign (ProgressChart and SignalsList in `docs/design/portfolio-overview-spec.md`), reading `pathway_snapshots` and the health views.

### Screens

- **Benefits → Pathway** (`/benefits/pathway`, `?programme=` filter):
  - three columns: Capabilities → Outcomes → Benefits.
  - Every card has a RAG chip. Hovering or focusing it shows the reason from the view; accepted capabilities and achieved outcomes show "Complete".
  - "Show chain" highlights the linked capabilities, outcomes and benefits and dims the rest.
  - Benefit cards show the phase, a "No pathway" badge, and an inline "Set realisation start" form for readiness-phase benefits.
  - A Gaps section lists benefits with no pathway.
- **Capability sheet:**
  - title, description, owner, status, target/forecast/delivered dates, and delivering projects, plus the forecast history.
  - Acceptance:
    - Evidence: upload (documents row first, then the stored object; if the upload fails the row is archived, so a row never exists without its file), download (5-minute signed URL) and archive.
    - Record acceptance: accepted by, date and note. The button is disabled with the reason ("Attach the acceptance evidence first", "Only a manager or PMO…").
    - Reverse acceptance: PMO only.
  - Database triggers still enforce every rule; their messages reach the user verbatim (`service-error.ts`).
- **Outcome sheet:**
  - status: Achieved and Not achieved are PMO-only; enabling capabilities and benefits.
  - Indicators: add, edit, remove, with baseline/target/frequency, a RAG chip, and the counted measurement against the expected value.
  - Measurements: list with status and query notes; Submit measurement.
- **Home → Approvals** adds "Outcome indicator measurements awaiting validation": Validate, or Query with a note (PMO). The KPI counts benefit and indicator measurements together.

### Closed projects out of roll-ups

Migration `20261007102643_closed_projects_out_of_rollups.sql` filters `state <> 'closed'` in `v_programme_health` and `v_portfolio_health`.

In the front end, `openOnly()` (analytics.ts) is used by the portfolio programme rows, dashboards RAG, reports (on-track %, budget and forecast), the projects KPI and the programme overview metrics ("x / open", "closed projects not counted").

In lists and on the project header, a closed project shows a muted "Closed" pill instead of a RAG. Its past finish date is no longer tinted "Overdue".

Confirmation on hosted (demo university; 33 open, 4 closed projects):

| Programme | Overall | Worst open project | Closed projects ignored |
| --- | --- | --- | --- |
| 1. Standards, Governance & Best Practice | amber | amber | — |
| 2. Resilience & Business Continuity | red | red | UC2:amber |
| 3. Optimisation & Cost Management | red | red | FSC:red, SDO:amber |
| 4. Efficiency, Automation & AI | red | red | — |
| 5. People, Knowledge & Continuous Improvement | red (benefit: BEN-027 confidence low) | amber | SFZ:red |

Programme 5 stays red because of its benefit dimension, not because of the closed SafeZone project. The summary strip and the overview chart (overview stages 1–2) read the same open-only views and helpers.
