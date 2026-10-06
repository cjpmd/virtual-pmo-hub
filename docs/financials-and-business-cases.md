# Financials and Business Cases: design (Stage F1)

Status: **signed off** (F1 approved with the answers and changes in "Sign-off" below). F2 onwards follow this document; each stage stops for review.

Conventions carried over from `docs/schema.md`:

- every table has `organisation_id` and `workspace_id`, filled by the tenant guard from its parent;
- audit columns (`created_at`, `updated_at`, `created_by`);
- UK English labels;
- RLS on every table, **written only with the array helpers** (`workspace_id = any ((select private.my_workspace_ids('…'))::uuid[])`, `project_id = any ((select private.my_editable_project_ids())::uuid[])`), never a per-row helper;
- every new `private` function revoked from `public, anon`;
- performance measured as a signed-in user through RLS (`supabase/tests/health_timings.sql` pattern).

---

## Sign-off

Answers to the F1 questions:

1. **Cut-off (D2): kept.** `v_project_financials` adds `open_month_overrun`: true when any line has, in any month after the cut-off, an actual greater than its forecast. The Financials tab then warns "Actuals for <month> already exceed the forecast; EAC may be understated."
2. **Approval:** PMO and admin call `decide_business_case`, but it records **the governance body's decision**, not the caller's. See §2.3.
3. **Negative actuals:** allowed, flagged in the UI.
4. **Initial baseline (D5):** manager or PMO only. If the project has an approved business case version, the initial baseline must have source `business_case`.

Changes:

- **A.** `business_case_options.delivery_cost` (`numeric(14,2)`), required on the preferred option at submit, alongside `whole_life_cost`. A business-case baseline's total is the preferred option's `delivery_cost`. The confirm dialog shows it and lets the PMO adjust it with a reason, stored on the baseline.
- **B.** Financial health is `not_set` when the project has no baseline. In the roll-ups `not_set` ranks below green, as for the benefit dimension (the `health` enum order is `not_set < green < amber < red`, and overall is the worst dimension). Projects with a budget of 0 today get no baseline in the data move, so their financial dimension changes to `not_set`; the parity report lists them.
- **C.** Forecast history has a `source` (`close` or `scheduled`). A `pg_cron` job on the 1st of each month writes the previous month for any project without a row (`scheduled`); the month-end close writes `close`. Still append-only, one row per project and month.

Not in this phase: AI pre-fill from uploaded documents.

## Decisions (signed off)

These are the choices where I've gone beyond, or slightly away from, the brief. Everything else follows the brief as written.

| #   | Decision                                              | Recommendation                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | What happens to `projects.budget / actual / forecast` | **Drop the columns** in F2, after migrating each project's figures into baselines, lines and values (below). `v_projects` keeps columns of the same names, computed from `v_project_financials`, so the many screens that read them keep working unchanged. Writes to them are removed from the services. |
| D2  | How "actual to date" and "forecast remaining" meet    | **One cut-off month per organisation:** the latest closed financial period, or the previous calendar month if none is closed. Months up to and including the cut-off use actuals; later months use forecast. EAC = actuals ≤ cut-off + forecast > cut-off.                                                |
| D3  | Business case versions                                | Split into **`business_cases`** (the case: which request or project it belongs to) and **`business_case_versions`** (version, status, totals, content). Submitted versions can then stay fully immutable while the case itself moves from request to project on conversion.                               |
| D4  | Benefits the case hands to the register               | A **`business_case_benefits`** table (same shape as `request_benefit_drafts`). For a case on a request it is prefilled from that request's drafts. Option text alone isn't structured enough to create register entries.                                                                                  |
| D5  | First baseline of a new project                       | Version 1 by a manager or PMO (source `initial`), or from an approved business case, which is then required if the project has one. After that, only an approved change request or PMO with a reason.                                                                                                     |
| D6  | Documents link to their owner                         | **Typed foreign keys** (`business_case_id`, `project_id`, `programme_id`, exactly one set, matching `scope`) instead of a bare `entity_id`. RLS and integrity then work like every other table; `audit_log` stays the only polymorphic reference.                                                         |
| D7  | Rich text in business case sections                   | **Markdown** in a plain editor with preview. Stored as text, rendered sanitised. No new editor dependency. A WYSIWYG editor (TipTap) can come later.                                                                                                                                                      |
| D8  | CSV parsing for actuals import                        | A small in-house parser (quoted fields, commas, CRLF; UTF-8 with or without BOM). No new dependency.                                                                                                                                                                                                      |
| D9  | Request → project conversion                          | There is no conversion flow in the app yet (`projects.converted_from_request_id` exists but nothing sets it). F5 adds "Convert to project" on an approved request; that is where the business case moves across and the first baseline is offered.                                                        |

---

## 1. Financials

### 1.1 Tables

**`cost_lines`**: what a project spends money on.

| Column                                        | Notes                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| id, organisation_id, workspace_id, project_id | tenant guard from `projects`                                                |
| name                                          | `not null`, unique per project (case-insensitive)                           |
| category_id → lookup_values                   | list `cost_category`; seeded: Staff, Contractors, Licences, Hardware, Other |
| spend_type                                    | enum `spend_type` = `capital`, `operating`                                  |
| funding_source_id → lookup_values             | optional; list `funding_source` (seeded empty, PMO-editable)                |
| sort_order, archived_at, audit columns        | archived lines keep their history and drop out of entry screens             |

**`financial_values`**: one row per line, month and kind.

| Column                                                      | Notes                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| id, organisation_id, workspace_id, project_id, cost_line_id | tenant guard from `cost_lines`                                                   |
| period_month                                                | `date`; `check (period_month = date_trunc('month', period_month))`               |
| kind                                                        | enum `financial_kind` = `budget`, `actual`, `forecast`                           |
| amount                                                      | `numeric(14,2) not null`. Credits (negative actuals) allowed; the UI flags them. |
| unique                                                      | `(cost_line_id, period_month, kind)`                                             |

Currency is the organisation's base currency (`settings.regional.baseCurrency`); amounts are stored in that currency only. `exchange_rates` stays a display aid.

**`budget_baselines`**: the approved budget, append-only.

| Column                                        | Notes                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| id, organisation_id, workspace_id, project_id |                                                                                                                      |
| version                                       | `int`, 1, 2, 3… per project (assigned by trigger)                                                                    |
| total                                         | `numeric(14,2) not null`                                                                                             |
| source                                        | enum `baseline_source` = `initial`, `business_case`, `change_request`, `pmo_adjustment`, `migration`                 |
| business_case_version_id, change_request_id   | set when the source is that kind                                                                                     |
| reason                                        | required for `pmo_adjustment`, and when a business-case baseline differs from the preferred option's `delivery_cost` |
| approved_at, approved_by → profiles           | set by the trigger to `now()` and `auth.uid()`                                                                       |

- **Current budget** = the latest version.
- **Monthly phasing:** the `budget` rows in `financial_values` phase that budget across months. When the phasing doesn't add up to the baseline total, the financials view reports `phasing_gap` and the screen shows a warning; it isn't blocked.
- **Rules (trigger `budget_baseline_guard`, raising readable errors):**
  - Rows are never updated or deleted.
  - `initial`: only when the project has no baseline yet, the caller is manager or PMO in the workspace, and the project has no approved business case version (if it has one, the first baseline must come from it).
  - `business_case`: the version must be `approved` and belong to this project. `total` defaults to the preferred option's `delivery_cost`; any other total needs PMO and a `reason`.
  - `change_request`: the CR must belong to this project, be `approved`, not already used by another baseline, and `total` must equal the previous total + `cost_impact`.
  - `pmo_adjustment`: caller is PMO in the workspace and `reason` is not blank.
  - `migration`: only without a signed-in user (the F2 data move).

**`financial_forecast_history`**: the forecast at each month end, append-only, like `milestone_forecast_history`.

| Column                                          | Notes                                                  |
| ----------------------------------------------- | ------------------------------------------------------ |
| project_id, reporting_month                     | primary key                                            |
| budget, actual_to_date, forecast_remaining, eac | as `v_project_financials` showed at capture            |
| source                                          | `close` (month-end close) or `scheduled` (monthly job) |
| captured_at                                     |                                                        |

Written by the month-end close for every project in the organisation (`close`), and by a `pg_cron` job on the 1st of each month for the previous month, for any project without a row yet (`scheduled`). Rows are never changed afterwards. Reopening a month doesn't rewrite history; closing it again adds nothing, because the row for that month already exists. A note on the period records that it was reopened.

**`financial_periods`**: month-end close.

| Column                                  | Notes                                             |
| --------------------------------------- | ------------------------------------------------- |
| organisation_id, period_month           | primary key                                       |
| closed_at, closed_by                    | `null` = open                                     |
| reopened_at, reopened_by, reopen_reason | latest reopen; earlier reopens are in `audit_log` |

- **Closing** (PMO, RPC `close_financial_period(month)`) must be done in order: you can't close March while February is open.
- **Reopening** (PMO, RPC `reopen_financial_period(month, reason)`) requires a reason and only works on the latest closed month.
- **Trigger on `financial_values`:** inserting, updating or deleting an `actual` or `forecast` row in a closed month raises "<Month> is closed. Ask the PMO to reopen it." Budget phasing in closed months is also locked.

**`actuals_imports`** and **`actuals_import_rows`**: the import log.

| `actuals_imports`                 | Notes                     |
| --------------------------------- | ------------------------- |
| id, organisation_id, workspace_id | one workspace per import  |
| file_name, row_count, total, mode | mode = `replace` or `add` |
| imported_by, imported_at          |                           |

| `actuals_import_rows`                                                            | Notes                                                 |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| import_id, row_number, project_id, cost_line_id, period_month, amount, reference | kept for drill-down ("which invoices make up March?") |

### 1.2 What the views compute

**`v_project_financials`**, one row per project:

| Column             | Definition                                                              |
| ------------------ | ----------------------------------------------------------------------- |
| budget             | latest `budget_baselines.total`, or 0                                   |
| baseline_version   | latest version, or `null`                                               |
| budget_phased      | Σ budget values                                                         |
| phasing_gap        | budget − budget_phased                                                  |
| actuals_through    | the organisation's cut-off month (D2)                                   |
| actual_to_date     | Σ actual where month ≤ cut-off                                          |
| actual_open_months | Σ actual where month > cut-off (shown, not in EAC)                      |
| forecast_remaining | Σ forecast where month > cut-off                                        |
| eac                | actual_to_date + forecast_remaining                                     |
| variance           | budget − eac (positive = under budget)                                  |
| variance_percent   | (eac − budget) / budget × 100, `null` when budget is 0                  |
| open_month_overrun | true when any line has, in a month after the cut-off, actual > forecast |

**`v_programme_financials`** and **`v_portfolio_financials`** sum the same columns over their projects; variance % is recomputed from the sums. A portfolio counts projects directly under it as well as those in its programmes, like `v_portfolio_health`.

`programmes.budget` and `portfolios.budget` stay as **envelopes** (what was allocated). The roll-ups show "allocated" next to "baselined" so a gap is visible.

All three views are written single-pass: one aggregate over `financial_values` grouped by project, joined to the latest baseline (`distinct on`). They don't call functions per row.

### 1.3 Financial health switches to these views

`v_project_health` now uses forecast vs budget from the project row. After F2:

```
red   when eac > budget × (1 + financialOffTrackPercent / 100)
amber when eac > budget × (1 + financialAtRiskPercent / 100)
green otherwise
```

Same tolerances from `organisations.settings.health`, same shape: only the source changes, so no new thresholds are needed. **With no baseline, the dimension is `not_set`** (change B).

**Parity:**

- **The data move:** F2 moves each project's current figures as follows.
  - Baseline v1 (`migration`) = `budget`, for projects with a budget above 0. Projects with a budget of 0 get no baseline (change B).
  - One line "Migrated balance", category Other, operating.
  - One `actual` row = `actual` in the cut-off month.
  - One `forecast` row = `forecast − actual` in the month after the cut-off.
- **Why it matches:** EAC then equals today's `forecast` and the budget equals today's `budget`, so every project with a budget keeps its financial and overall health. The only expected differences are projects with a budget of 0, whose financial dimension becomes `not_set` (change B); the parity report lists each one with old and new values.
- **How it's checked:** `health_views_snapshot.sql` before and after the move, diffed as in the RLS work, plus `scripts/health-parity.ts`.

`status_reports.evidenced_financial` keeps being copied from `v_project_health` at submission, so status reports need no change.

### 1.4 Permissions

| Table / action                                 | Viewer | Contributor (can edit the project) | Manager | PMO / admin          |
| ---------------------------------------------- | ------ | ---------------------------------- | ------- | -------------------- |
| Read everything financial                      | ✓      | ✓                                  | ✓       | ✓                    |
| Cost lines: add, rename, archive               |        | ✓                                  | ✓       | ✓                    |
| Forecast values                                |        | ✓                                  | ✓       | ✓                    |
| Actual values, actuals import                  |        |                                    |         | ✓                    |
| Budget phasing values                          |        |                                    |         | ✓                    |
| Baseline: initial (D5)                         |        |                                    | ✓       | ✓                    |
| Baseline: from an approved CR or business case |        |                                    | ✓       | ✓                    |
| Baseline: adjustment with reason               |        |                                    |         | ✓                    |
| Close / reopen a month                         |        |                                    |         | ✓ (organisation PMO) |

"Can edit the project" is `can_edit_project`: contributor or above in the workspace, project not archived. Policies:

- **`financial_values`:** `using`/`with check` = `case kind when 'forecast' then project_id = any (editable projects) else workspace_id = any (my_workspace_ids('pmo')) end`.
- **`budget_baselines`:** insert only (no update or delete grant), and the trigger enforces the rules in §1.1.

### 1.5 Actuals import

1. **Upload** a CSV in the browser (D8). Nothing leaves the browser until commit.
2. **Map columns:** date, amount, cost line _or_ category (with project code), reference (optional). Mappings are remembered per organisation in `localStorage`. They're a per-user convenience, not shared state.
3. **Preview:** each row resolved to project, line and month, with errors shown and committing blocked until they're fixed or excluded.
   - unparseable date or amount;
   - unknown project code;
   - no line matching the category, or more than one;
   - a closed month;
   - a project outside the workspace;
   - duplicate references.
   - Option: "create a line per category where missing".
   - Totals by month and project.
4. **Commit** with RPC `commit_actuals_import(workspace_id, file_name, mode, rows jsonb)` (PMO), in one transaction:
   - writes `actuals_imports` and `actuals_import_rows`;
   - sums rows by line and month;
   - in `replace` mode sets the month's actual to the imported sum (re-importing the same file is idempotent); in `add` mode adds to it;
   - the closed-month trigger still applies;
   - returns the import id, rows and total.
5. The import appears in the project's import log (who, when, file name, rows, total).

### 1.6 Change requests

When a change request with a `cost_impact` is approved, the Changes screen offers **"Update the budget baseline"**. This creates the next baseline version with the CR linked and total = previous + `cost_impact`. It's offered, never automatic, and the trigger enforces the arithmetic.

---

## 2. Business cases

### 2.1 Tables

**`business_case_templates`**: the organisation's sections.

| Column                                                           | Notes                         |
| ---------------------------------------------------------------- | ----------------------------- |
| id, organisation_id, key, title, guidance, sort_order, is_active | unique (organisation_id, key) |

Seeded from the Five Case Model for every organisation (in `seed_org_defaults` and backfilled for existing ones). PMO edits them in Settings → Templates.

- **`strategic`:** the case for change and fit with strategy.
- **`economic`:** options appraisal and value for money.
- **`commercial`:** procurement and contracts.
- **`financial`:** affordability and funding.
- **`management`:** delivery, governance, risks and benefits plan.

Removing a section deactivates it; existing versions keep their content.

**`business_cases`**: the case (D3).

| Column                                               | Notes                                              |
| ---------------------------------------------------- | -------------------------------------------------- |
| id, organisation_id, workspace_id                    |                                                    |
| request_id → project_requests, project_id → projects | `check (num_nonnulls(request_id, project_id) = 1)` |
| title                                                |                                                    |

One case per request or project (unique). On conversion (D9) the row moves from `request_id` to `project_id` in the same transaction that creates the project.

**`business_case_versions`**

| Column                                                                                  | Notes                                                                                    |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| id, organisation_id, workspace_id, business_case_id                                     |                                                                                          |
| version                                                                                 | 1, 2, 3… per case                                                                        |
| status                                                                                  | enum `business_case_status` = `draft`, `submitted`, `approved`, `rejected`, `superseded` |
| whole_life_cost, funding_requested                                                      | `numeric(14,2)`                                                                          |
| preferred_option_id → business_case_options                                             |                                                                                          |
| submitted_at, submitted_by, decided_at, decision_id → decisions, recorded_by → profiles |                                                                                          |

**`business_case_sections`**: version, template section (key and title copied at creation, so later template edits don't rewrite history), content (Markdown, D7), sort_order.

**`business_case_options`**

| Column                         | Notes                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| version_id, name, description  |                                                                                                     |
| whole_life_cost                | cost over the whole appraisal period                                                                |
| delivery_cost                  | cost to deliver; required on the preferred option at submit; the source of a business-case baseline |
| benefits_summary, risk_summary |                                                                                                     |
| is_preferred                   | partial unique index: at most one per version                                                       |

**`business_case_benefits`** (D4): version, title, classification, category, measure, baseline, target, annual value, years counted, owner. Same shape as `request_benefit_drafts`.

### 2.2 Versioning and status

- **One draft per case:** a partial unique index on `(business_case_id) where status = 'draft'`.
- **Submit** (anyone who can edit the request or project, RPC `submit_business_case(version_id)`):
  - checks there is exactly one preferred option, with `whole_life_cost` and `delivery_cost` set, and that no required section is empty;
  - sets `submitted`, `submitted_at` and `submitted_by`.
- **Frozen once submitted:** a submitted, approved, rejected or superseded version, and its sections, options and benefits, can't be updated or deleted; a trigger raises "This version has been submitted and can't be changed."
- **Editing after submission:** "Start a new version" copies the latest version's sections, options and benefits into a new draft (version + 1).
- **Approving** a version sets any earlier `approved` version of the case to `superseded`. That is the only change allowed to a frozen version, made inside the decision RPC.

### 2.3 Approval

RPC `decide_business_case(version_id, outcome approved|rejected, rationale, forum_id, decision_maker_resource_id, decision_date, minutes_document_id?)`. PMO or admin in the workspace call it to **record the governance body's decision**:

- `forum_id`: required; the decision forum (lookup list `decision_forum`).
- `decision_maker_resource_id`: required; any resource in the organisation. People don't need accounts.
- `minutes_document_id`: optional; a `documents` row on this business case (the minutes).

In one transaction it:

1. Records a decision in `decisions`:
   - title "Business case v<n> approved" or "… rejected";
   - rationale, status `made`, decision date as given;
   - decision maker and forum **from the parameters, not the caller**;
   - `evidence_link` pointing to the minutes document when given;
   - scope: the project, or for a request the request's portfolio.
2. Sets the version's status, `decided_at`, `decision_id`, and `recorded_by` = the caller; supersedes the earlier approved version.

After approval the page offers two **separate, user-confirmed** actions; nothing happens automatically.

- **(a) Create the budget baseline from the preferred option:** next version, source `business_case`, total = the preferred option's `delivery_cost` (change A). The confirm dialog shows that figure; a PMO may change it with a reason, stored on the baseline.
  - For a request-level case, this is offered when the request is converted.
  - The phasing is left for the PMO to spread across months.
- **(b) Add benefits to the register:** creates `benefits` rows from `business_case_benefits`, linked to the project (or to the portfolio for a request-level case until conversion).
  - Each benefit is shown with a tick box first, so the user chooses which ones to create.

### 2.4 Documents

**`documents`** (D6):

| Column                                     | Notes                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| id, organisation_id, workspace_id          |                                                                          |
| scope                                      | enum `document_scope` = `business_case`, `project`, `programme`          |
| business_case_id, project_id, programme_id | exactly one, matching `scope`                                            |
| file_name, mime_type, size_bytes           | check: allowed types and ≤ 25 MB                                         |
| version                                    | per (owner, file name): re-uploading the same name makes version + 1     |
| storage_path                               | unique; `{org}/{workspace}/{scope}/{owner id}/{document id}/{file name}` |
| uploaded_by, created_at, archived_at       | never deleted; archived instead                                          |

**Storage:**

- **Bucket:** a new private bucket `documents` with `file_size_limit` 25 MB and `allowed_mime_types` set to:
  - PDF: `application/pdf`
  - DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - XLSX: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - PPTX: `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- **Upload order:** the app inserts the `documents` row first, then uploads to its `storage_path`.
- **Storage policies, matching the table RLS:**
  - **insert:** a `documents` row with this exact path exists, is visible to the caller, and the caller can edit its owner (contributor for project and business case, manager for programme).
  - **select:** `private.storage_workspace(name) = any (my_workspace_ids())`.
  - **update:** none.
  - **delete:** none (archive only).
- **Download:** by signed URL (`createSignedUrl`, 5 minutes).
- **Cleanup:** a row whose upload failed is shown as "Upload incomplete" with Retry or Remove. Remove is the one delete allowed: by its uploader, and only while no object exists.
- **Advisors:** the F4 advisor run includes storage.

---

## 3. Screens

**Project → Financials tab**

- **Summary cards:** budget (with baseline version), actual to date (actuals through <month>), EAC, variance (amount and %, coloured with the health thresholds).
- **Warnings:** "Actuals for <month> already exceed the forecast; EAC may be understated." when `open_month_overrun` is true; negative actuals flagged in the grid; phasing gap when the budget phasing doesn't match the baseline.
- **Monthly grid:** cost lines × months, with a Budget / Actual / Forecast toggle.
  - Closed months are greyed and locked.
  - Cells are editable only where the role allows (§1.4).
  - Edits save through the board-style debounced queue: flush on blur, route change and unmount, so edits are never dropped.
  - Row and column totals.
- **Chart:** cumulative budget vs actual vs forecast by month, with a marker at the cut-off month (Recharts, already a dependency).
- **Baseline history:** version, total, source (linked CR or business case), reason, approved by and when.
- **Actions:** Import actuals (PMO), Add cost line, Adjust baseline (PMO).
- **Import log:** recent imports for this project.

**Business case page** (`/portfolio/requests/$requestId/business-case` and `/portfolio/projects/$projectCode/business-case`)

- Header: status, version selector (version history with status, dates and who), Submit / Approve / Reject / Start a new version by role.
- **Sections:** Markdown editor per template section with its guidance. Read-only once submitted.
- **Options:** table of name, whole-life cost, benefits, risks and preferred (radio).
- **Benefits:** the drafts that will go to the register.
- **Documents panel:** upload (type and size checked before upload), list with versions, download by signed URL, archive.
- After approval: the two hand-off actions (§2.3).

**Elsewhere**

- **Settings:** cost categories and funding sources in Lists; business case sections in Templates; Finance → month-end close with the period list, Close next month and Reopen with reason.
- **Programme and portfolio pages:** financial summary from the roll-up views, showing allocated vs baselined.

---

## 4. Performance and tests

- **Single-pass views:** no per-row function calls, as for the health views.
- **Indexes:**
  - `financial_values (project_id, kind, period_month)`;
  - `budget_baselines (project_id, version desc)`;
  - `financial_periods (organisation_id, period_month desc)`;
  - foreign-key indexes as elsewhere.
- **Timing targets**, signed in through RLS:
  - demo organisation: `v_project_financials` < 200 ms, health views still under the current targets (< 500 ms);
  - 500-project organisation: measured and reported. `scripts/seed-perf-org.sql` gains cost lines and 24 months of values per project.
- **New tests (`supabase/tests/`):**
  - the RLS matrix covers the new tables, and existing tables' results must not change;
  - a financial rules test covers closed-month rejection, baseline rules, forecast history append-only and import replace/add;
  - a business case test covers the frozen version, the one-draft rule, exactly one preferred option at submit, the decision record and the documents/storage policies;
  - the health snapshot diff covers the F2 data move.
- **Unit tests:** the CSV parser and the cut-off and EAC arithmetic shared by the UI.

---

## 5. Stages after sign-off

| Stage  | Contents                                                                                                                                                                                                                                                                 | Stop for                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| **F2** | Migrations: lookup lists, enums, financial tables, triggers, RLS, views. Data move from `projects.budget/actual/forecast` (D1), `v_projects` and `v_project_health` switched over, columns dropped. Services updated. Parity diff, RLS matrix, timings, advisors, types. | Parity report and timings |
| **F3** | Financials tab, month-end close in Settings, actuals import with preview and log, CR "update the baseline" action, programme and portfolio financial summaries.                                                                                                          | Browser test report       |
| **F4** | Business case tables, templates seeding, versioning and freezing, sections, options and benefits editor, documents table, bucket and storage policies, documents panel. Advisors including storage.                                                                      | Report                    |
| **F5** | `decide_business_case`, approval UI, the two hand-off actions, request → project conversion carrying the case across (D9).                                                                                                                                               | Report                    |

## 6. Questions

All answered at sign-off (see the top of this document).
