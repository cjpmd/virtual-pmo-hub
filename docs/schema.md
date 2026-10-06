# Virtual PMO: Supabase schema proposal

Status: **approved (Stage 2 review A–F applied)**. Implemented by the migrations in `supabase/migrations/`.
Project: `xvdlmtkzfmbcegkmampz` (London, Postgres 17).

This document records the Stage 1 decisions and turns them into a concrete schema: tables, columns, constraints, RLS, roll-ups, renames and migration order. Wherever a section says "decided", it follows your Stage 2 brief. Wherever a section says "proposed", it is my call and open to veto. §14 collects those calls.

---

## 1. Conventions

| Topic                  | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary keys           | `id uuid primary key default gen_random_uuid()` on every table. Join tables use a composite PK.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Human references       | `ref text` generated on insert by a `before insert` trigger. Format `PREFIX-nnn` (zero-padded to 3, grows beyond 999). Scope: **per project** for project-only children (work items, change requests, status reports, milestones); **per organisation** for registers that can sit at portfolio, programme or project level (risks, issues, decisions, assumptions, dependencies, benefits, lessons, improvement actions, requests). Counters live in `ref_counters (organisation_id, scope_id, prefix, last_value)`, incremented under a row lock, so refs are gapless in practice and never reused.                                                                                 |
| Tenancy columns        | Every tenant table has `organisation_id uuid not null`, plus `workspace_id uuid not null` when it holds workspace data. Both are indexed. Both are **filled by a trigger** from the parent row (`set_tenant_columns()`), so services never send them. Both are **immutable** after insert (a trigger raises if they change).                                                                                                                                                                                                                                                                                                                                                          |
| Cross-tenant integrity | Composite foreign keys stop a child pointing at a parent in another workspace. For example, `foreign key (project_id, workspace_id) references projects (id, workspace_id)`. Parents expose `unique (id, workspace_id)` and `unique (id, organisation_id)`. Composite FKs use `MATCH SIMPLE`, so they are skipped when the nullable scope column is null. That is exactly what the exactly-one-scope pattern needs.                                                                                                                                                                                                                                                                   |
| Org-level tenant guard | **Every FK to an organisation-level table is composite with `organisation_id`** (review A): resources (every person `*_id`), lifecycle_phases, gate_criteria, strategic_objectives, benefit_periods, project_templates, holiday_calendars, lookup_values, and profiles via membership. Those parents expose `unique (id, organisation_id)`. Where the FK nulls on delete, it uses the PG15+ column list `on delete set null (owner_id)`, so `organisation_id` is never nulled with it. Stage 3 test: a project whose `sponsor_id` belongs to another organisation must fail.                                                                                                          |
| Scope pattern          | RAID, change requests, decisions, assumptions and health snapshots have nullable `portfolio_id`, `programme_id` and `project_id` with `check (num_nonnulls(portfolio_id, programme_id, project_id) = 1)`. There are no polymorphic `type + id` columns. **The one deliberate exception is `audit_log`** (§11), which must outlive the rows it describes.                                                                                                                                                                                                                                                                                                                              |
| People                 | Every person field is a FK to **`resources`** (`*_id`). Only `created_by` and audit fields reference **`profiles`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Audit columns          | `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (maintained by the `set_updated_at()` trigger) and `created_by uuid default auth.uid() references profiles (id) on delete set null`. Append-only tables carry only `created_at`/`created_by`.                                                                                                                                                                                                                                                                                                                                                                                        |
| Dates                  | `date` for calendar dates (start, finish, due, review, baseline…). `timestamptz` for events (created, responded, changed, synced). All conversion to and from `DD/MM/YYYY` happens in **one** module, `src/services/db/format.ts`, used only by services.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| "Today"                | The database uses `org_today(organisation_id)`, which is `current_date` in the organisation's `settings->>'timeZone'`. A session setting `vpmo.today` (a date) overrides it, but only when `auth.uid()` is null (scripts, tests, the parity check). Signed-in sessions always get the real date. The front end uses one `today()` helper (Stage 4) in place of the 33 hardcoded `21/09/2026` values.                                                                                                                                                                                                                                                                                  |
| Naming                 | Tables are plural `snake_case`. Columns are the `snake_case` form of the front-end field name. That mechanical camelCase → snake_case change is **not** listed as a rename; §12 lists only real renames. Enum values are lower `snake_case`, and services map them to the Title Case labels the UI shows.                                                                                                                                                                                                                                                                                                                                                                             |
| Money                  | `numeric(14,2)`. Currency is per organisation (`settings.regional.baseCurrency`). Multi-currency stays out of scope apart from the `exchange_rates` table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Deletes                | (review B) **Portfolios, programmes and projects have no client delete policy.** `state = 'closed'` is the lifecycle end (still reported). `archived_at timestamptz` hides a record created in error; every list view excludes `archived_at is not null` by default. **Work items are never hard-deleted by clients**: "delete" sets `deleted_at`, and views exclude those rows. Register rows (RAID, change requests, decisions…) can be deleted by managers, and `audit_log` captures it. History tables (`health_snapshots`, `milestone_forecast_history`, `work_item_events`) reference their parents `on delete restrict`. Other children cascade only from their direct parent. |
| Views                  | Every view is `with (security_invoker = true)`, so the caller's RLS applies (the advisor flags `security definer` views).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## 2. Enums

**Rule:** if application logic branches on the value, it is a Postgres enum. If the list is configurable per organisation and purely descriptive, it is a row in `lookup_values` (§4.3).

| Enum                                                                                              | Values                                                                                                             | Replaces (front end)                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `app_role`                                                                                        | `admin`, `pmo`, `manager`, `contributor`, `viewer`                                                                 | `UserRole` (7 values, mapped in §9.4)                                                                                   |
| `health`                                                                                          | `green`, `amber`, `red`, `not_set`                                                                                 | `Health`, `RoadmapHealth`, `EvidencedRag`, status-report RAGs                                                           |
| `entity_state`                                                                                    | `active`, `closed`                                                                                                 | `EntityState` (portfolios, programmes)                                                                                  |
| `project_state`                                                                                   | `proposed`, `active`, `on_hold`, `closed`                                                                          | `ProjectState`                                                                                                          |
| `project_tier`                                                                                    | `small`, `medium`, `large`                                                                                         | `ProjectTier`                                                                                                           |
| `priority`                                                                                        | `low`, `moderate`, `high`, `critical`                                                                              | `Priority`                                                                                                              |
| `task_source`                                                                                     | `native`, `planner_basic`, `planner_premium`                                                                       | `TaskSource`                                                                                                            |
| `work_item_type`                                                                                  | `task`, `story`, `bug`, `spike`, `milestone_task`                                                                  | `ItemType` + `Task.isMilestone`                                                                                         |
| `work_item_status`                                                                                | `issued`, `not_started`, `in_progress`, `blocked`, `done`, `cancelled`                                             | `Task.percentComplete`-based state, `ProjectStatus`, `IssuedTaskStatus`                                                 |
| `status_category`                                                                                 | `todo`, `in_progress`, `done`                                                                                      | `StatusCategory` (`wip` → `in_progress`)                                                                                |
| `offer_response`                                                                                  | `accepted`, `declined`, `proposed_date`                                                                            | `IssuedTaskStatus` responses                                                                                            |
| `external_source`                                                                                 | `planner_basic`, `planner_premium`, `import`                                                                       | `WorkItem.source` (`native` becomes null)                                                                               |
| `milestone_type`                                                                                  | `delivery`, `gate`, `key_date`, `external_dependency`                                                              | `MilestoneType`                                                                                                         |
| `rag_open_closed`                                                                                 | `open`, `closed`                                                                                                   | Risk/Issue status                                                                                                       |
| `risk_response`                                                                                   | `avoid`, `reduce`, `transfer`, `accept`                                                                            |                                                                                                                         |
| `issue_severity`                                                                                  | `low`, `medium`, `high`                                                                                            | `Issue.severity`. Code branches on `High`, so this is an enum. The settings list `issueSeverities` becomes labels only. |
| `change_status`                                                                                   | `proposed`, `approved`, `rejected`                                                                                 |                                                                                                                         |
| `decision_status`                                                                                 | `pending`, `made`, `superseded`, `reversed`                                                                        |                                                                                                                         |
| `action_status`                                                                                   | `open`, `in_progress`, `done`                                                                                      | DecisionAction, ImprovementAction                                                                                       |
| `assumption_status`                                                                               | `open`, `validated`, `invalidated`                                                                                 |                                                                                                                         |
| `dependency_type`                                                                                 | `sequencing`, `alignment`, `information`, `resource`, `external`                                                   | Code branches on `Sequencing`                                                                                           |
| `dependency_validation`                                                                           | `inferred`, `proposed`, `confirmed`, `closed`, `broken`                                                            |                                                                                                                         |
| `criticality`                                                                                     | `low`, `medium`, `high`                                                                                            |                                                                                                                         |
| `benefit_type`                                                                                    | `benefit`, `disbenefit`                                                                                            |                                                                                                                         |
| `benefit_classification`                                                                          | `cash_releasing`, `non_cash_releasing`, `qualitative`, `societal`                                                  | Code branches on cash-releasing                                                                                         |
| `benefit_status`                                                                                  | `identified`, `validated`, `planned`, `in_realisation`, `realised`, `partially_realised`, `not_realised`, `closed` |                                                                                                                         |
| `confidence`                                                                                      | `high`, `medium`, `low`                                                                                            |                                                                                                                         |
| `measure_frequency`                                                                               | `monthly`, `quarterly`, `annually`                                                                                 |                                                                                                                         |
| `measurement_status`                                                                              | `submitted`, `validated`, `queried`                                                                                |                                                                                                                         |
| `benefit_review_type`                                                                             | `scheduled`, `post_implementation`                                                                                 |                                                                                                                         |
| `request_status`                                                                                  | `new`, `in_review`, `on_hold`, `approved`, `rejected`                                                              |                                                                                                                         |
| `lesson_type`                                                                                     | `success`, `problem`                                                                                               |                                                                                                                         |
| `lesson_applicability`                                                                            | `this_project`, `similar_projects`, `all_projects`                                                                 |                                                                                                                         |
| `lesson_status`                                                                                   | `identified`, `action_agreed`, `embedded`, `closed`                                                                |                                                                                                                         |
| `project_role`                                                                                    | `project_manager`, `project_officer`, `programme_manager`, `team_member`, `sponsor`                                | `TeamMember.role`                                                                                                       |
| `booking_type`                                                                                    | `soft`, `hard`                                                                                                     |                                                                                                                         |
| `leave_type`                                                                                      | `annual_leave`, `training`, `other`                                                                                |                                                                                                                         |
| `gate_check_key`                                                                                  | `benefit_profiles_owned`, `benefit_baselines`, `benefits_handover`, `lessons_reviewed`, `phase_lessons_review`     | `GateCheckKey`                                                                                                          |
| `ms_connection_status`, `plan_kind`, `sync_mode`, `sync_health`, `outbox_status`, `sync_log_kind` | as in `data/integrations.ts`                                                                                       | integrations                                                                                                            |

---

## 3. Tenancy and identity

```
auth.users ─1:1─ profiles
organisations ─< organisation_members >─ profiles
organisations ─< workspaces ─< workspace_members >─ profiles
organisations ─< resources (profile_id nullable, unique per organisation)
workspaces ─< portfolios ─< programmes ─< projects
                      └──────────────────< projects   (direct, no programme)
```

### `profiles`

| Column                 | Type                        | Notes                                              |
| ---------------------- | --------------------------- | -------------------------------------------------- |
| id                     | uuid PK                     | = `auth.users.id`, `on delete cascade`             |
| display_name           | text not null               |                                                    |
| email                  | text not null               | copied from auth on sign-up                        |
| avatar_path            | text                        | Storage                                            |
| last_organisation_id   | uuid → organisations        | remembers the org context                          |
| preferences            | jsonb not null default `{}` | notification channels, digest, favourites ordering |
| created_at, updated_at |                             |                                                    |

Filled by an `after insert on auth.users` trigger, `handle_new_user()` (security definer).

### `organisations`

| Column           | Type                      | Notes                                    |
| ---------------- | ------------------------- | ---------------------------------------- |
| id               | uuid PK                   |                                          |
| name, short_name | text                      | from `settings.organisation`             |
| slug             | text unique               |                                          |
| brand_colour     | text                      |                                          |
| logo_path        | text                      | Storage bucket `org-assets`              |
| support_contact  | text                      |                                          |
| region           | text check in (`uk`,`eu`) | from sign-up `Workspace.region`          |
| is_demo          | boolean default false     | the seed org is `true`                   |
| settings         | jsonb not null            | display and behaviour preferences (§4.1) |
| audit columns    |                           |                                          |

### `organisation_subscriptions` (1:1, platform-managed)

`organisation_id PK`, `plan`, `seats_total`, `renewal_date`, `billing_contact`. Org admins can **select** it. Writes are by the service role only. `seatsUsed` is computed as the count of members.

### `organisation_members`

`organisation_id`, `profile_id`, `role app_role not null`, audit columns. PK `(organisation_id, profile_id)`. A trigger stops the last `admin` from being removed or downgraded.

### `workspaces`

`id`, `organisation_id`, `name`, `description`, audit columns. `unique (id, organisation_id)`. A university creates one workspace per department or portfolio office, for example "Digital & Technology Services".

### `workspace_members`

`workspace_id`, `profile_id`, `organisation_id` (trigger-filled), `role app_role`, audit columns. PK `(workspace_id, profile_id)`. The member must also be an organisation member (enforced by FK `(organisation_id, profile_id) → organisation_members`).

### `resources`: every person the system names

| Column                    | Type                          | Notes                                                                                                                                                                                           |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                        | uuid PK                       |                                                                                                                                                                                                 |
| organisation_id           | uuid                          | org-level, not workspace-level: people span workspaces                                                                                                                                          |
| profile_id                | uuid null → profiles          | set when the person signs in. `on delete set null`. Unique per organisation (`unique (organisation_id, profile_id)`), so one person can have a resource row in each organisation they belong to |
| name                      | text not null                 |                                                                                                                                                                                                 |
| email                     | text                          | used to auto-link a profile on first sign-in                                                                                                                                                    |
| job_title                 | text                          |                                                                                                                                                                                                 |
| team_id                   | uuid → lookup_values (`team`) | was the `ResourceTeam` enum                                                                                                                                                                     |
| line_manager_id           | uuid → resources              | was a name                                                                                                                                                                                      |
| contracted_hours_per_week | numeric(5,2)                  |                                                                                                                                                                                                 |
| fte                       | numeric(3,2)                  |                                                                                                                                                                                                 |
| bau_percentage            | numeric(5,2)                  |                                                                                                                                                                                                 |
| is_bookable               | boolean default false         | true for the 20 resource-pool people                                                                                                                                                            |
| is_placeholder            | boolean default false         | replaces `GenericResource` ("Network Engineer (TBC)")                                                                                                                                           |
| placeholder_role          | text                          | GenericResource.role                                                                                                                                                                            |
| needs_staffing            | boolean default false         |                                                                                                                                                                                                 |
| is_active                 | boolean default true          |                                                                                                                                                                                                 |
| audit columns             |                               |                                                                                                                                                                                                 |

`initials` is not stored; services derive it from `name`.

Children:

- `resource_skills (resource_id, skill_id → lookup_values('skill'), level smallint check 1–3)`, PK `(resource_id, skill_id)`
- `resource_leave (id, resource_id, start_date, finish_date, leave_type)`

On sign-up into an organisation, `link_profile_to_resource()` matches `resources.email` and sets `profile_id`. If nothing matches, it creates a non-bookable resource. **Every org member therefore has a resource row**, as decided.

### `user_favourites`

`profile_id`, `organisation_id`, nullable `programme_id` / `project_id` with an exactly-one check, `created_at`. Replaces the `vpmo_favourites` localStorage key. RLS: owner only.

---

## 4. Organisation configuration

### 4.1 `organisations.settings` jsonb (display and behaviour preferences)

These keys keep the current `AppSettings` shape, so `settings.ts` keeps its API: `regional` (baseCurrency, symbolPosition, separators, decimalPlaces, compactFormatting, multiCurrency, locale, dateFormat, timeZone, firstDayOfWeek, financialYearStartMonth), `workingTime` (hoursPerWeek, workingDays, hoursPerDay, defaultBauPercentage), `terminology.terms`, `health` (the 9 thresholds, **read by the SQL roll-ups**), `risk` (matrixSize, labels, bands, appetiteThreshold), `benefits` (optimismBias keyed by category `value`, defaultMeasurementFrequency, appraisalYears), `tiers` (descriptions and guidelines per `project_tier`), `notifications` (org defaults), `templates` (statusReportSections, committeePack), `data.retentionMonths`.

A `jsonb` check constraint (`valid_org_settings`) validates the presence and type of the `health` keys, because SQL reads them, and of `benefits.optimismBias` (one entry per category, unique ignoring case, percentage 0–80; `valid_optimism_bias`). PMO members may change the optimism bias; everything else on the row is admin-only (see §9).

### 4.2 Tables

| Table                                 | Columns                                                                                                                                                                              | Why a table                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `lifecycle_phases`                    | id, organisation_id, name, short_name, description, gate_name, sort_order, unique (organisation_id, sort_order)                                                                      | `projects.phase_id`, `lessons.phase_id` and reviews point at it                                                          |
| `gate_criteria`                       | id, organisation_id, phase_id, label, tiers `project_tier[]`, document, check_key `gate_check_key` null, sort_order                                                                  | belongs to phases. Gate checklists filter on it                                                                          |
| `lookup_values`                       | id, organisation_id, list_key text, value text, label text, sort_order int, is_active bool. `unique (organisation_id, list_key, value)` and `unique (organisation_id, list_key, id)` | records point at it (§4.3)                                                                                               |
| `benefit_periods`                     | id, organisation_id, label, start_date, finish_date                                                                                                                                  | measurements and targets point at it (was the fixed `benefitPeriods` const in `pmo.ts`)                                  |
| `exchange_rates`                      | id, organisation_id, currency char(3), rate numeric(12,6), effective_date                                                                                                            | reports convert with it                                                                                                  |
| `holiday_calendars` / `holiday_dates` | calendar: id, organisation_id, name. Date: calendar_id, date, name                                                                                                                   | capacity calculations read it. Replaces `workingTime.holidayCalendars` and the global `NonWorkingPeriod` in `sprints.ts` |
| `project_templates`                   | id, organisation_id, name, tier, description, task_buckets text[]                                                                                                                    | projects may be created from one                                                                                         |

Currencies, date formats, locales and time zones **stay in code** (global, fixed).

### 4.3 `lookup_values` list keys and who points at them

| list_key           | Seeded from             | Referenced by                                                |
| ------------------ | ----------------------- | ------------------------------------------------------------ |
| `team`             | `ResourceTeam`          | `resources.team_id`                                          |
| `skill`            | people skill names      | `resource_skills.skill_id`                                   |
| `benefit_category` | `BenefitCategory`       | `benefits.category_id`, `request_benefit_drafts.category_id` |
| `lesson_category`  | `lessonCategories`      | `lessons.category_id`                                        |
| `project_type`     | `lists.projectTypes`    | `lesson_project_types` (was `Lesson.projectTypeTags`)        |
| `decision_forum`   | `decisionForums`        | `decisions.forum_id`                                         |
| `change_type`      | `lists.changeTypes`     | `change_requests.type_id`                                    |
| `collection_type`  | `lists.collectionTypes` | `collections.type_id`                                        |
| `business_unit`    | `lists.businessUnits`   | none yet (kept for the settings screen)                      |

**List-key enforcement (proposed).** Each referencing table has a stored generated constant column plus a composite FK, for example:

```sql
category_list text generated always as ('benefit_category') stored,
foreign key (organisation_id, category_list, category_id)
  references lookup_values (organisation_id, list_key, id)
```

This rejects a value from the wrong list or the wrong organisation with no triggers. Lookup rows are deactivated (`is_active = false`), never deleted (`on delete restrict`).

`labels` on work items (was `Task.labels`) stay as `text[]` with a GIN index. They are ad hoc tags that contributors type, and they don't need PMO-managed rows.

---

## 5. Hierarchy

### `portfolios`

id, organisation_id, workspace_id, name, description, owner_id → resources, budget, state `entity_state`, closed_reason, health_override `health` null, health_override_reason, archived_at, audit columns. `unique (id, workspace_id)`.

### `programmes`

id, organisation_id, workspace_id, portfolio_id (composite FK with workspace), name, description, manager_id, project_manager_id, project_officer_id, sponsor_id (all → resources), start_date, finish_date, budget, value_statement, state, closed_reason, health_override, health_override_reason, archived_at, audit columns.

### `projects`

| Column                                        | Type                         | Notes                                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id, organisation_id, workspace_id             |                              |                                                                                                                                                                                                                                                                                                    |
| programme_id                                  | uuid null                    | composite FK `(programme_id, workspace_id)`                                                                                                                                                                                                                                                        |
| portfolio_id                                  | uuid null                    | composite FK `(portfolio_id, workspace_id)`                                                                                                                                                                                                                                                        |
|                                               |                              | **`check (num_nonnulls(programme_id, portfolio_id) = 1)`**                                                                                                                                                                                                                                         |
| name                                          | text not null                |                                                                                                                                                                                                                                                                                                    |
| code                                          | text not null                | (review D) uppercase short code, `unique (organisation_id, code)`, `check (code ~ '^[A-Z0-9]{2,10}$')`. Editable by PMO only (trigger). Routes become `/projects/:code`. Seeded from the existing lesson prefixes (EBB, CYB, W11, FSC, UC2, SFZ), with the others derived from the name's initials |
| manager_id, project_officer_id, sponsor_id    | → resources                  |                                                                                                                                                                                                                                                                                                    |
| tier                                          | project_tier                 |                                                                                                                                                                                                                                                                                                    |
| phase_id                                      | uuid → lifecycle_phases      | was `stage` (phase **name**)                                                                                                                                                                                                                                                                       |
| state                                         | project_state                |                                                                                                                                                                                                                                                                                                    |
| priority                                      | priority                     |                                                                                                                                                                                                                                                                                                    |
| start_date, finish_date, baseline_finish_date | date                         | `finish_date` is the current forecast finish                                                                                                                                                                                                                                                       |
| budget, actual, forecast                      | numeric(14,2)                | **Being retired (Financials F2).** No longer read or written by the app; `v_projects` computes these from the financials (latest baseline, actual to date, estimate at completion). Dropped after the F2 branch merges                                                                             |
| business_case                                 | text                         |                                                                                                                                                                                                                                                                                                    |
| benefits_summary                              | text                         | was `benefits` (clashed with the benefits register)                                                                                                                                                                                                                                                |
| task_source                                   | task_source default `native` |                                                                                                                                                                                                                                                                                                    |
| health_override, health_override_reason       |                              |                                                                                                                                                                                                                                                                                                    |
| closed_reason                                 | text                         |                                                                                                                                                                                                                                                                                                    |
| archived_at                                   | timestamptz null             | (review B) records created in error                                                                                                                                                                                                                                                                |
| converted_from_request_id                     | uuid null → project_requests |                                                                                                                                                                                                                                                                                                    |
| audit columns                                 |                              |                                                                                                                                                                                                                                                                                                    |

The view `v_projects` adds `effective_portfolio_id = coalesce(portfolio_id, programme.portfolio_id)`, so "all projects in a portfolio" stays one indexed query. Since Financials F2 its `budget`, `actual` and `forecast` columns come from `v_project_financials` (current baseline total, actual to date, estimate at completion), and `has_baseline` says whether the project has a baseline at all (financial health is `not_set` without one). See `docs/financials-and-business-cases.md`. `getProjects(programmeId?)` reads this view.

**`taskCount` and `overdueTaskCount` are dropped.** They come from `v_project_task_stats` (§10).

### `strategic_objectives`

id, organisation_id, workspace_id, portfolio_id, title, description, owner_id, audit columns.

### `collections` and `collection_projects`

`collections`: id, organisation_id, workspace_id, name, type_id → lookup (`collection_type`), pot_amount numeric null, audit columns.
`collection_projects`: collection_id, project_id, organisation_id, workspace_id, award_amount numeric null. PK `(collection_id, project_id)`. Replaces **both** `Collection.projectIds`/`awards` and `Project.collectionIds`.

### `project_requests` and `request_benefit_drafts`

`project_requests`: id, ref (`REQ`), organisation_id, workspace_id, portfolio_id, title, status, requester_id, sponsor_id, estimated_cost, estimated_benefit, priority, alignment smallint check 0–100, themes text[], whole_life_cost, appraisal_years smallint, audit columns.
`request_benefit_drafts`: id, request_id, title, classification, category_id, owner_id, measure, baseline text, target text, annual_value, years_counted, strategic_objective_id, sort_order.

### Roadmaps

- `roadmaps`: id, organisation_id, workspace_id, portfolio_id null, name, owner_id, description, audit columns.
- `roadmap_rows`: id, roadmap_id, name, programme_id null, collection_id null, sort_order.
- `roadmap_items`: id, roadmap_id, row_id, project_id null, and for **standalone items only** title, start_date, finish_date, progress smallint, health, owner_id, priority. A check rejects standalone fields when `project_id` is set, and requires title and dates when `project_id` is null. Linked items get title, dates, progress, health and owner from the project in `v_roadmap_items`. `kind` is derived (`project_id is null` → Standalone).
- `roadmap_item_collections`: roadmap_item_id, collection_id (standalone items).
- `roadmap_key_dates`: id, roadmap_id, title, date, owner_id, milestone_id null. Status is computed in `v_roadmap_key_dates`.

---

## 6. Work items (one table for every task)

```
projects ─< project_buckets
projects ─< work_items ─< work_item_assignees >─ resources
                      ├─< work_item_checklist_items
                      ├─< work_item_links (predecessor → successor)
                      ├─< work_item_events   (append-only)
                      ├─< work_item_offers   (append-only)
                      └─< work_item_attachments
            work_items.milestone_id → milestones (same project)
            work_items.sprint_id    → sprints     (reserved; added in the sprints phase)
```

### `project_buckets`

id, organisation_id, workspace_id, project_id, name, sort_order. `unique (project_id, name)`. Replaces `Task.bucket` **and** `WorkItem.workstream`, which are the same grouping concept.

### `work_items`

| Column                                         | Type                                   | Notes                                                                                                                                                                                                                            |
| ---------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id, organisation_id, workspace_id              |                                        |                                                                                                                                                                                                                                  |
| project_id                                     | uuid not null                          | composite FK                                                                                                                                                                                                                     |
| ref                                            | text                                   | `TSK-nnn` per project                                                                                                                                                                                                            |
| title                                          | text not null                          |                                                                                                                                                                                                                                  |
| description                                    | text                                   | was `Task.notes` / `IssuedTask.description`                                                                                                                                                                                      |
| item_type                                      | work_item_type default `task`          | `milestone_task` replaces `isMilestone`                                                                                                                                                                                          |
| status                                         | work_item_status default `not_started` |                                                                                                                                                                                                                                  |
| status_category                                | status_category                        | **generated stored** from `status`: `issued`/`not_started` → todo, `in_progress`/`blocked` → in_progress, `done`/`cancelled` → done. Completion metrics count `status = 'done'` only, so cancelled work never inflates velocity. |
| bucket_id                                      | uuid null → project_buckets            | same project (composite FK)                                                                                                                                                                                                      |
| parent_id                                      | uuid null → work_items                 | same project (composite FK)                                                                                                                                                                                                      |
| milestone_id                                   | uuid null → milestones                 | same project (composite FK)                                                                                                                                                                                                      |
| priority                                       | priority default `moderate`            |                                                                                                                                                                                                                                  |
| start_date, finish_date, baseline_finish_date  | date                                   | `finish_date` is the due date                                                                                                                                                                                                    |
| percent_complete                               | smallint null check 0–100              | null for agile items                                                                                                                                                                                                             |
| story_points                                   | numeric(6,2) null                      | was `estimateUnits`                                                                                                                                                                                                              |
| estimated_effort_hours, effort_completed_hours | numeric(8,2) null                      |                                                                                                                                                                                                                                  |
| labels                                         | text[] default `{}`                    | GIN index                                                                                                                                                                                                                        |
| backlog_rank                                   | numeric                                | fractional ranking, so reordering touches one row                                                                                                                                                                                |
| done_at                                        | timestamptz                            | set by trigger when status becomes `done`, cleared otherwise                                                                                                                                                                     |
| deleted_at                                     | timestamptz                            | soft delete, the **only** delete clients can do (review B). Scope history needs it                                                                                                                                               |
| external_source                                | external_source null                   | **reserved for Planner sync**                                                                                                                                                                                                    |
| external_id                                    | text null                              | reserved                                                                                                                                                                                                                         |
| external_etag                                  | text null                              | reserved                                                                                                                                                                                                                         |
| audit columns                                  |                                        |                                                                                                                                                                                                                                  |

Constraints: `unique (project_id, ref)` and `unique (project_id, external_source, external_id)`. `check ((external_source is null) = (external_id is null))`.

The sprints phase will add `sprint_id uuid null` with a composite FK to `sprints (id, project_id)`. That guarantees a work item can only join a sprint **in its own project**, and sprints belong to projects only. No column is created now.

### `work_item_assignees`

work_item_id, resource_id, organisation_id, workspace_id. PK `(work_item_id, resource_id)`. Multiple assignees, as Planner allows.

### `work_item_checklist_items`

id, work_item_id, label, is_done, sort_order, audit columns. `checklistCount` is derived.

### `work_item_links`

predecessor_id, successor_id, organisation_id, workspace_id, link_type text default `finish_to_start`. PK `(predecessor_id, successor_id)`, `check (predecessor_id <> successor_id)`, same project (trigger). Replaces `Task.dependencies[]`.

### `work_item_events` (append-only)

id, organisation_id, workspace_id, work_item_id, field text (`status`, `estimate`, `bucket`, `assignee`, `finish_date`, `created`, `deleted`, later `sprint`), old_value text, new_value text, changed_by → profiles, changed_at timestamptz. Written **only** by an `after insert or update` trigger on `work_items` (security definer). No insert, update or delete grants to clients. Used for velocity and scope history now, and burn charts later.

### `work_item_offers` (append-only)

| Column                            | Type                      | Notes                                                                                                |
| --------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| id, organisation_id, workspace_id |                           |                                                                                                      |
| work_item_id                      | uuid not null             |                                                                                                      |
| issued_by                         | uuid → resources          | was `IssuedTask.issuer`                                                                              |
| issued_to                         | uuid → resources          | was `IssuedTask.assignee`                                                                            |
| issued_at                         | timestamptz default now() |                                                                                                      |
| acknowledgement_due_date          | date                      | was `acknowledgementDue` (an addition to your column list: it belongs to the offer)                  |
| reminder_sent_at                  | timestamptz null          | was `reminderSent` (addition)                                                                        |
| response                          | offer_response null       |                                                                                                      |
| proposed_date                     | date null                 | required when `response = 'proposed_date'` (check)                                                   |
| comment                           | text null                 | was `responseReason`                                                                                 |
| responded_at                      | timestamptz null          |                                                                                                      |
| responded_by                      | uuid null → profiles      | (review E) who recorded the response: the issued-to person, the issuer, or pmo/admin on their behalf |
| created_at, created_by            |                           |                                                                                                      |

Append-only rules (trigger plus RLS):

- Insert by workspace contributors. The work item's status becomes `issued`.
- Exactly **one** update per row: response, proposed_date, comment and responded_at go from null to set. The profile linked to `issued_to`, the **issuer**, or pmo/admin can do it, the last two on behalf of a resource with no profile (review E). `responded_by` records who did. Every other column is frozen, and once responded the row is immutable. No delete.
- `accepted` moves the work item `issued` → `not_started` and adds `issued_to` to `work_item_assignees` (trigger).
- Re-issuing after `proposed_date` or `declined` inserts a **new row**.

The UI's `IssuedTaskStatus` is derived in `v_issued_work_items`: `in_progress` → In progress, `done` → Done, otherwise the latest offer's response (`accepted` / `declined` / `proposed_date`), or `Issued` if there is none.

`plannerSync` is derived too: Not applicable when `task_source = native`; Pending acceptance while the item is issued; Syncing while an outbox row is queued; Created in Planner when `external_id` is set.

### `work_item_attachments`

id, work_item_id, organisation_id, workspace_id, file_name, storage_path (bucket `attachments`, path `{org}/{workspace}/{work_item}/…`), size_bytes, audit columns.

### Not migrated in this phase

`sprints.ts` sprint data (sprints, commitments, per-project delivery settings, justifications) stays browser-local until the sprints phase. Its synthetic agile items are **not** seeded into `work_items`, because without sprints the forecast would have nothing to run on. `Task.sprint` ("Sprint 1"/"Backlog") is dropped from the seed.

---

## 7. Project delivery

### `milestones`

id, ref (`MS`, per project), organisation_id, workspace_id, project_id, title, type `milestone_type`, owner_id, baseline_date, forecast_date, actual_date null, report_to_committee bool, audit columns. **`status` is not stored.** It comes from `v_milestones` (§10).

### `milestone_forecast_history` (append-only)

id, milestone_id (`on delete restrict`), organisation_id, workspace_id, reporting_date date, forecast_date date, created_at, created_by. Written by a trigger whenever `milestones.forecast_date` changes, with `reporting_date = org_today()`. The seed inserts the mock history directly.

### `project_team_members`

id, organisation_id, workspace_id, project_id, resource_id, role `project_role`, start_date, finish_date, allocated_effort_hours, audit columns. This is the **governance role** on the project.

### `resource_assignments`

id, organisation_id, workspace_id, project_id, resource_id (person **or** placeholder, so no `resourceType`), work_item_id null (same project), role text, start_date, finish_date, hours_per_week numeric(5,2), booking_type, audit columns. This is the **capacity booking**.

Team members and assignments overlap (Stage 1, flag 3). I've kept both, with distinct meanings (role vs booking), as the screens do today. Merging them can wait for the resource-management phase.

### `status_reports`

id, ref (`SR`, per project), organisation_id, workspace_id, project_id, reporting_date, submitter_id, overall, schedule, financial, effort, issue (`health`), accomplished, planned, comments, override_reasons jsonb, ai_draft jsonb, **evidenced_overall, evidenced_schedule, evidenced_financial, evidenced_effort, evidenced_issue, evidenced_benefit** (`health`, review E: copied from `v_project_health` by the `submit_status_report()` trigger at insert, then frozen), audit columns. `unique (project_id, ref)`.

The declared RAGs and the evidenced RAGs **are** stored, deliberately. A submitted report is a point-in-time judgement, and changing it would rewrite history. They are not the computed health (§10).

### `phase_lessons_reviews` and `phase_lessons_review_attendees`

Review: id, organisation_id, workspace_id, project_id, phase_id, review_date, facilitator_id. Attendees: review_id, resource_id.

---

## 8. RAID, change, decisions, dependencies, benefits, lessons

All scoped tables below use the **exactly-one-of** `portfolio_id` / `programme_id` / `project_id` pattern, each with a composite FK to the same workspace.

### `risks`

id, ref (`RSK`), tenant columns, scope columns, title, description, owner_id, probability smallint check 1–5, impact smallint check 1–5, **score smallint generated always as (probability * impact) stored**, response `risk_response`, status `rag_open_closed`, review_date, closed_at, audit columns.

### `issues`

id, ref (`ISS`), tenant columns, scope columns, title, description (new, nullable), owner_id, severity `issue_severity`, status, due_date, closed_at, audit columns.

### `assumptions`

id, ref (`ASM`), tenant columns, scope columns, assumption, owner_id, rationale, validation_date, status, raised_issue_id null → issues, notes, audit columns.

### `change_requests`

id, ref (`CR`, **per project** as you asked, otherwise per org), tenant columns, scope columns, title, type_id → lookup (`change_type`), cost_impact, schedule_impact_days int, status `change_status`, requested_by_id, audit columns.

### Decisions

- `decisions`: id, ref (`DEC`), tenant columns, scope columns, title, context, chosen_option_id null (composite FK to its own options), rationale, decision_maker_id, forum_id → lookup (`decision_forum`), needed_by_date, decision_date, status, impact_scope bool, impact_scope_note, impact_cost bool, impact_cost_note, impact_time bool, impact_time_note, impact_benefits bool, impact_benefits_note, evidence_link, **supersedes_id** null → decisions, audit columns. `superseded_by` is derived (reverse lookup) and not stored twice.
- `decision_options`: id, decision_id, title, pros text[], cons text[], sort_order.
- `decision_actions`: id, decision_id, tenant columns, description, owner_id, due_date, status `action_status`, audit columns.
- Link tables (PK = both ids, tenant columns, same-workspace composite FKs): `decision_risks`, `decision_issues`, `decision_change_requests`, `decision_dependencies`, `decision_benefits`.

### Dependencies

`dependencies`: id, ref (`DEP`), tenant columns, then **giver** and **receiver** ends, each as four nullable columns plus an owner:

| End      | Columns                                                                                                                | Check                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| giver    | `giver_programme_id`, `giver_project_id`, `giver_milestone_id`, `giver_external_name`, `giver_owner_id`                | `num_nonnulls(giver_programme_id, giver_project_id, giver_milestone_id, giver_external_name) = 1` |
| receiver | `receiver_programme_id`, `receiver_project_id`, `receiver_milestone_id`, `receiver_external_name`, `receiver_owner_id` | same                                                                                              |

Then type `dependency_type`, description, required_by_date, criticality, validation, giver_accepted, receiver_accepted, health_override `health` null, health_override_reason (fixes the shape inconsistency), raised_date, raised_by_id, audit columns. The end `kind` is derived from whichever column is set. A milestone end's project and programme come from the milestone, so they are not stored twice.

Link tables: `dependency_risks`, `dependency_issues`.

Both ends must be in the same workspace (composite FKs). Cross-workspace dependencies are out of scope for this phase.

### Benefits

- `benefits`: id, ref (`BEN`), tenant columns, portfolio_id **not null** (benefits roll up across projects, so they sit at portfolio level, not exactly-one-of), programme_id null (review C: composite FK `(programme_id, portfolio_id) → programmes (id, portfolio_id)`, so the programme must belong to the benefit's portfolio; programme benefit health uses it directly, and `benefit_projects` stays as the contribution/attribution table), title, description, type, classification, category_id, beneficiaries text[], owner_id, sro_id, status, confidence, eligibility_confirmed, eligibility_confirmed_by_id, eligibility_confirmed_date, planned_total_value, dependency_notes text[] (renamed: it clashed with the dependency register), audit columns.
- `benefit_objectives`: benefit_id, strategic_objective_id.
- `benefit_projects`: benefit_id, project_id, attribution_percent numeric(5,2) check 0–100. Totals over 100% are allowed but surfaced as a warning column in `v_benefit_realisation`, which matches `getBenefitWarnings`.
- `benefit_measures`: id, benefit_id, tenant columns, name, unit, measurement_method, data_source, frequency, data_provider text (a team name, not a person), baseline_value, baseline_date, next_due_date, sort_order, audit columns. `next_due_date` stays **stored** as a scheduling field the PMO edits, as the screens treat it.
- `benefit_measure_targets`: measure_id, period_id → benefit_periods, value. PK `(measure_id, period_id)`.
- `benefit_measurements`: id, measure_id, tenant columns, period_id, actual_value, evidence text, evidence_path null (Storage `evidence`), notes, submitted_by_id, submitted_date, validated_by_id, validated_date, query_note, status, audit columns. Several rows per period are allowed (a resubmission after a query, or two data providers). Queried rows never count. The views use the validated row if there is one, otherwise the latest submission (`submitted_date desc, created_at desc`).
- `benefit_reviews`: id, benefit_id, tenant columns, review_date, type, findings, lessons_learned, reviewer_id, audit columns.
- `benefit_handovers` (0..1): benefit_id PK, tenant columns, bau_owner_id, bau_service, frequency, next_review_date, post_implementation_review_date, confirmed_by_id, confirmed_date, audit columns.
- Benefit maps: `capabilities` (programme_id, title, description, owner_id), `capability_projects`, `outcomes` (programme_id, …), `outcome_capabilities`, `outcome_benefits`, `benefit_maps` (programme_id, name, description, layout jsonb `[{nodeKey, x, y}]`). The layout is UI state, so it stays jsonb.

### Lessons

- `lessons`: id, ref (`LES`, org-wide), tenant columns, project_id not null, phase_id, sprint_name text null (temporary, becomes `sprint_id` in the sprints phase), type, category_id, summary, what_happened, impact, root_cause, recommendation, applicability, raised_by_id, raised_date, status, audit columns.
- `lesson_project_types`: lesson_id, project_type_id → lookup (`project_type`).
- `improvement_actions`: id, ref (`ACT`), tenant columns, lesson_id, description, owner_id, due_date, status, embedded_in, audit columns.

---

## 9. Security: roles, helpers and RLS

### 9.1 Role ladder

`viewer (1) < contributor (2) < manager (3) < pmo (4) < admin (5)`, via `app_role_rank(app_role) returns int` (immutable).

**Effective workspace role** = the higher of the `workspace_members.role` and the organisation role **when that is `pmo` or `admin`**. So org admins and PMO see and administer every workspace in their organisation, and everyone else needs explicit workspace membership.

### 9.2 Helper functions

All are `language sql stable security definer set search_path = ''`, use `(select auth.uid())`, fully qualify tables (`public.organisation_members`), and are `revoke`d from `anon` and granted to `authenticated`. Every new `private` function must be revoked from `public, anon` **explicitly** in its own migration. `alter default privileges ... in schema private` cannot remove Postgres's global EXECUTE-for-PUBLIC default (fixed retroactively in `advisor_fixes_2`).

| Function                                            | Returns                                                                                                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_org_member(org_id uuid)`                        | bool                                                                                                                                                                                                           |
| `has_org_role(org_id uuid, min_role app_role)`      | bool                                                                                                                                                                                                           |
| `workspace_role(ws_id uuid)`                        | app_role or null (effective role, §9.1)                                                                                                                                                                        |
| `is_workspace_member(ws_id uuid)`                   | `workspace_role(ws_id) is not null`                                                                                                                                                                            |
| `has_workspace_role(ws_id uuid, min_role app_role)` | bool                                                                                                                                                                                                           |
| `current_resource_id(org_id uuid)`                  | the caller's resource row (for offer responses and "my work")                                                                                                                                                  |
| `can_edit_project(project_id uuid)`                 | (review E) **every project-scoped write policy calls this.** Today it returns `has_workspace_role(project's workspace, 'contributor')`. Per-project membership can later narrow it without touching any policy |

**Policies don't call the per-row helpers above** (`rls_array_helpers`): through the health views that meant thousands of security-definer calls per query (8.4 s for the demo organisation as a signed-in admin, 190 ms with RLS bypassed). Instead they compare against the caller's ids, computed once per statement as an initplan:

| Array helper                                  | Ids where                                                               | Replaces                                            |
| --------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| `my_workspace_ids(min_role default 'viewer')` | the effective workspace role (§9.1) is at least `min_role`              | `is_workspace_member`, `has_workspace_role`         |
| `my_org_ids(min_role default 'viewer')`       | the organisation role is at least `min_role`                            | `is_org_member`, `has_org_role`                     |
| `my_editable_project_ids()`                   | `can_edit_project`: not archived, contributor or above in its workspace | `can_edit_project`, the project half of `can_write` |
| `my_resource_ids()`                           | resources linked to the caller's profile                                | `is_own_resource`                                   |
| `my_colleague_ids()`                          | profiles sharing one of the caller's organisations                      | `shares_org_with`                                   |

Written as `workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[])`. The cast matters: without it Postgres parses `any ((select ...))` as a row sub-query. The per-row helpers remain for RPCs and triggers that check one row. Check any policy change with `supabase/tests/rls_matrix.sql`: run it before and after and diff the output.

### 9.3 Policy matrix

| Tables                                                                                                                                                                                   | select                                                                         | insert / update                                                                                                                                                                                          | delete                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `organisations`                                                                                                                                                                          | `is_org_member(id)`                                                            | update: `has_org_role(id,'pmo')`, narrowed by the `organisations_role_scope` trigger: below admin, only `settings.benefits.optimismBias` may change. Insert only through the `create_organisation()` RPC | service role                            |
| `organisation_subscriptions`                                                                                                                                                             | `has_org_role(…,'admin')`                                                      | service role                                                                                                                                                                                             | service role                            |
| `organisation_members`                                                                                                                                                                   | `is_org_member`                                                                | `has_org_role(…,'admin')`                                                                                                                                                                                | admin (last-admin guard)                |
| `workspaces`                                                                                                                                                                             | `is_workspace_member(id)`                                                      | `has_org_role(organisation_id,'admin')`                                                                                                                                                                  | admin                                   |
| `workspace_members`                                                                                                                                                                      | `is_workspace_member`                                                          | `has_workspace_role(…,'admin')`                                                                                                                                                                          | admin                                   |
| Org reference data: `lifecycle_phases`, `gate_criteria`, `lookup_values`, `benefit_periods`, `exchange_rates`, `holiday_*`, `project_templates`                                          | `is_org_member`                                                                | `has_org_role(…,'pmo')`                                                                                                                                                                                  | pmo                                     |
| `resources`, `resource_skills`, `resource_leave`                                                                                                                                         | `is_org_member`                                                                | `has_org_role(…,'pmo')`, or `has_org_role(…,'manager')` for placeholders. Members may update their **own** leave                                                                                         | pmo                                     |
| `profiles`                                                                                                                                                                               | self, or a co-member of any shared org (for names)                             | self                                                                                                                                                                                                     | none                                    |
| `user_favourites`                                                                                                                                                                        | self                                                                           | self                                                                                                                                                                                                     | self                                    |
| `portfolios`                                                                                                                                                                             | `is_workspace_member`                                                          | `has_workspace_role(…,'pmo')`                                                                                                                                                                            | **none** (archive instead)              |
| `programmes`, `projects`                                                                                                                                                                 | `is_workspace_member`                                                          | `has_workspace_role(…,'manager')` (project `code` changes need pmo)                                                                                                                                      | **none** (archive instead)              |
| `strategic_objectives`, `collections`, `roadmaps`                                                                                                                                        | `is_workspace_member`                                                          | `has_workspace_role(…,'pmo')`                                                                                                                                                                            | pmo                                     |
| `project_requests`                                                                                                                                                                       | `is_workspace_member`                                                          | `has_workspace_role(…,'manager')`                                                                                                                                                                        | pmo                                     |
| `work_items`                                                                                                                                                                             | `is_workspace_member`                                                          | `can_edit_project(project_id)`                                                                                                                                                                           | **none** (soft delete via `deleted_at`) |
| Project-scoped records: buckets, work item children, milestones, team, assignments, status reports, lessons, reviews, and RAID / change / decision / dependency rows scoped to a project | `is_workspace_member`                                                          | `can_edit_project(project_id)`                                                                                                                                                                           | manager                                 |
| The same registers scoped to a programme or portfolio, and benefits                                                                                                                      | `is_workspace_member`                                                          | `has_workspace_role(…,'contributor')`                                                                                                                                                                    | manager                                 |
| `work_item_offers`                                                                                                                                                                       | member                                                                         | insert: `can_edit_project`. Update: the `issued_to` resource's own profile, the issuer, or pmo/admin, response columns only, once (trigger)                                                              | none                                    |
| `work_item_events`, `milestone_forecast_history`, `health_snapshots`, `audit_log`                                                                                                        | member (`audit_log`: pmo)                                                      | **none for clients**. Written by security-definer triggers or functions                                                                                                                                  | none                                    |
| `benefit_measurements`                                                                                                                                                                   | member                                                                         | insert/update: contributor. Setting status `validated` or `queried` requires pmo (trigger)                                                                                                               | manager                                 |
| Integrations tables                                                                                                                                                                      | member                                                                         | pmo                                                                                                                                                                                                      | pmo                                     |
| Storage (`org-assets`, `attachments`, `evidence`)                                                                                                                                        | path prefix `{organisation_id}/{workspace_id}/…` checked with the same helpers | contributor (`org-assets`: admin)                                                                                                                                                                        | manager                                 |

Every table has `alter table … enable row level security` and **no** policy for `anon`. The anon key can read nothing.

### 9.4 Mapping the current roles

| `UserRole` (settings)              | `app_role`  |
| ---------------------------------- | ----------- |
| Admin                              | admin       |
| PMO                                | pmo         |
| Programme Manager, Project Manager | manager     |
| Project Officer, Team Member       | contributor |
| Executive Viewer                   | viewer      |

`RoleDefinition.permissions` (8 toggles) **can't drive RLS** from configurable jsonb without making every policy a jsonb lookup. I propose a fixed matrix (above). The Settings → Roles screen shows it read-only, and `hasPermission()` maps permission keys to minimum roles in code. `defaultHome` per role stays configurable in `settings`.

---

## 10. Computed values (views and functions, never stored)

All are `security_invoker` views over the tables above. "Today" is `org_today(organisation_id)`. Thresholds are read from `organisations.settings->'health'`. **The SQL rules port `pmo.ts` exactly.** A Stage 3 parity check compares SQL and TS results on the seed.

| View / function                                             | Produces                                                                                                                                                                          | Replaces                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `v_project_task_stats`                                      | task_count, overdue_count (not done, `finish_date < today`, not deleted), done_count, avg percent_complete per project                                                            | `taskCount`, `overdueTaskCount`, `projectProgress()`                                |
| `v_milestones`                                              | milestone + `status` (`completed` if actual_date, `overdue` if forecast < today, `late` if forecast > baseline, `future` if more than 30 days out, else `on_track`) + `slip_days` | `Milestone.status`, `PortfolioMilestone.slipDays`                                   |
| `v_work_items`                                              | work item + delivery status (same rules on finish/baseline) + checklist_count                                                                                                     | `getTaskStatus`, `checklistCount`                                                   |
| `benefit_realisation(benefit_id)` → `v_benefit_realisation` | realised value, percent, variance %, benefit health, behind_profile, measurement_overdue                                                                                          | `getBenefitRealised`, `getBenefitPercent`, `getBenefitVariance`, `getBenefitHealth` |

> **Known limitation (benefits phase).** Realisation uses the benefit's **first measure only** (lowest `sort_order`), as `pmo.ts` did. Other measures are stored and shown, but they do not feed realised value, percent, variance or health. Combining measures is deferred to the benefits phase.
> | `v_project_health` | schedule, financial, effort, issue and benefit health, **overall = health_override, or else the worst of the five**, plus `forecast_finish_date` and `forecast_basis`. Today `forecast_basis = 'declared'` and the date is the declared `finish_date`; the forecast-engine phase switches the basis to `evidenced` without renaming the column, so callers don't break (review F) | `getProjectHealth` and the dimension functions |
> | `v_programme_health` | overall = override, or else the worst of its projects' overall + programme benefit health. `forecast_finish_date` = the latest of its projects' forecast finish | `getProgrammeHealth` |
> | `v_portfolio_health` | overall = override, or else the worst of its programmes **and** direct projects. Latest forecast finish | `getPortfolioHealth` |
> | `v_dependency_health` | health (override, else the sequencing + giving-milestone forecast vs required-by rule in working days), boundary, acceptance state | `getDependencyHealth`, `getBoundary` |
> | `v_roadmap_items` | linked items take title, dates, progress, health and owner from the project. Standalone items pass through | `getResolvedRoadmapItems` |
> | `v_roadmap_key_dates` | status (`completed` if date < today, `on_track` within 30 days, else `future`) | `RoadmapKeyDate.status` |
> | `v_issued_work_items` | issued-task view with derived `IssuedTaskStatus` and `plannerSync` (§6) | `getIssuedTasks` |
> | `v_projects` | `effective_portfolio_id` + joins used by lists | `getProjects` |

"Worst" uses `red > amber > green > not_set`, as `pmo.ts` does.

### `health_snapshots` (trend history)

| Column                                               | Type                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| id                                                   | uuid                                                                          |
| organisation_id, workspace_id                        |                                                                               |
| portfolio_id / programme_id / project_id             | exactly one (FKs, `on delete restrict`, review B)                             |
| snapshot_date                                        | date                                                                          |
| overall, schedule, financial, effort, issue, benefit | health (dimension columns null for portfolio and programme rows)              |
| forecast_finish_date                                 | date                                                                          |
| metrics                                              | jsonb (headline figures for portfolio rows: counts, budget, forecast, actual) |
| is_synthetic                                         | boolean default false                                                         |
| created_at                                           |                                                                               |

Unique index on `(coalesce(portfolio_id, programme_id, project_id), snapshot_date)`.

`capture_health_snapshots()` (security definer) writes one row per active entity from the views above. It runs **nightly via `pg_cron`** and also on status-report submission. `trends.ts` reads this table. Real organisations show an empty state until history exists. The demo org's history is backfilled with `is_synthetic = true`.

**A deviation from your brief:** you asked for "entity type/id". I've used the exactly-one-of FK columns instead, consistent with your RAID rule, so snapshots keep real FKs and cascade on delete. Same data, safer shape.

---

## 11. Integrations and audit

- `ms_connections`: organisation_id PK, tenant_name, tenant_domain, status, connected_by_id → profiles, connected_on, environments text[], admin_request_sent_to, directory_synced_at, directory_people. **No tokens or secrets here.** Those belong in Supabase Vault and edge functions when real sync arrives.
- `project_plan_links`: project_id PK, plan_id, kind, last_sync_at, mode, health.
- `sync_outbox`, `sync_conflicts`, `sync_log`: as in `data/integrations.ts`, plus tenant columns. `sync_log.project_id` is nullable.
- The sign-up "Workspace" (orgName, domain, region, currency, fyStartMonth, lifecycle) becomes the `create_organisation(name, domain, region, currency, fy_start_month)` RPC. It inserts the organisation, a first workspace, the caller as `admin` in both, the caller's resource, and default lookups and lifecycle copied from a template.
- `committee_packs`: id, organisation_id, workspace_id, collection_id null → collections (a collection with packs can't be deleted), title, meeting_date, content jsonb (sections, collection and project facts as issued), issued_at, issued_by → profiles, audit columns. A pack is a draft until `issued_at` is set; the `committee_pack_lock` trigger then stamps `issued_at = now()` and `issued_by = auth.uid()` and refuses every later update. Never deleted: no delete grant, and a trigger refuses deletes even for the service role. RLS: select for workspace members; insert and update (drafts only) for workspace PMO. Audited.
- `audit_log`: id, organisation_id, workspace_id null, actor_id → profiles, action text, entity_table text, entity_id uuid, detail jsonb, created_at. Written by a generic `audit_row_change()` trigger on the hierarchy and register tables. **No FK on entity_id, by design.** Pruned by `pg_cron` per `settings.data.retentionMonths`.

---

## 12. Renames: front end → database

Mechanical camelCase → snake_case (`dueDate` → `due_date`) is not listed. Services map everything back, so **components keep today's field names**.

### Cross-cutting

| Front end                                                                                                                                                                                                                                                                                                        | Database                                                                           | Reason                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id` (slug or `r-12`)                                                                                                                                                                                                                                                                                            | `id uuid` + `ref` where shown to users                                             | decided. Projects also get `code`, and routes become `/projects/:code` (review D). Other detail routes use uuids |
| `reference`                                                                                                                                                                                                                                                                                                      | `ref`                                                                              | decided naming                                                                                                   |
| `start` / `finish` / `end`                                                                                                                                                                                                                                                                                       | `start_date` / `finish_date`                                                       | decided                                                                                                          |
| `baselineFinish`                                                                                                                                                                                                                                                                                                 | `baseline_finish_date`                                                             | consistency                                                                                                      |
| `requiredBy`, `neededBy`                                                                                                                                                                                                                                                                                         | `required_by_date`, `needed_by_date`                                               | dates end in `_date`                                                                                             |
| `date` (Lesson, BenefitReview, PhaseLessonsReview)                                                                                                                                                                                                                                                               | `raised_date`, `review_date`                                                       | `date` is ambiguous and a type name                                                                              |
| every person name field: `owner`, `manager`, `sponsor`, `projectOfficer`, `projectManager`, `sro`, `raisedBy`, `requester`, `requestedBy`, `submitter`, `submittedBy`, `validatedBy`, `reviewer`, `decisionMaker`, `facilitator`, `bauOwner`, `confirmedBy`, `eligibilityConfirmedBy`, `lineManager`, `personId` | `<name>_id` → resources (`personId` → `resource_id`, `submitter` → `submitter_id`) | decided: names become FKs                                                                                        |
| `healthOverride {health, reason}`                                                                                                                                                                                                                                                                                | `health_override`, `health_override_reason`                                        | flattened                                                                                                        |
| Health values `On Track`/`At Risk`/`Off Track`/`Not Set` (and the roadmap and evidenced variants)                                                                                                                                                                                                                | `green`/`amber`/`red`/`not_set`                                                    | decided single enum                                                                                              |
| Enum labels (`Planner (Premium)`, `On Hold`, …)                                                                                                                                                                                                                                                                  | snake_case enum values                                                             | mapped in services                                                                                               |
| `closedReason`                                                                                                                                                                                                                                                                                                   | `closed_reason`                                                                    | (mechanical)                                                                                                     |

### Per entity

| Entity                   | Front end                                                                                                                                              | Database                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Project                  | `stage` (phase name)                                                                                                                                   | `phase_id`                                                                                   |
| Project                  | `benefits` (text)                                                                                                                                      | `benefits_summary`                                                                           |
| Project                  | `taskCount`, `overdueTaskCount`                                                                                                                        | removed → `v_project_task_stats`                                                             |
| Project                  | `collectionIds`                                                                                                                                        | removed → `collection_projects`                                                              |
| Project                  | `milestones`, `risks`, `issues`, `tasks`, `team`, `changes`, `reports` (embedded)                                                                      | child tables                                                                                 |
| Programme                | `end`                                                                                                                                                  | `finish_date`                                                                                |
| Collection               | `projectIds`, `awards`                                                                                                                                 | `collection_projects.award_amount`                                                           |
| Collection               | `type`                                                                                                                                                 | `type_id` → lookup                                                                           |
| Milestone                | `status`                                                                                                                                               | removed → `v_milestones.status`                                                              |
| Milestone                | `forecastHistory`                                                                                                                                      | `milestone_forecast_history`                                                                 |
| Risk                     | `score`                                                                                                                                                | generated column (read-only)                                                                 |
| Task                     | `bucket`                                                                                                                                               | `bucket_id` → `project_buckets`                                                              |
| Task                     | `isMilestone`                                                                                                                                          | `item_type = 'milestone_task'`                                                               |
| Task                     | `assignees[]`                                                                                                                                          | `work_item_assignees`                                                                        |
| Task                     | `notes`                                                                                                                                                | `description`                                                                                |
| Task                     | `checklist`, `checklistItems`, `checklistCount`                                                                                                        | `work_item_checklist_items` (count derived)                                                  |
| Task                     | `dependencies[]`                                                                                                                                       | `work_item_links`                                                                            |
| Task                     | `sprint`                                                                                                                                               | dropped this phase (§6)                                                                      |
| Task                     | `parentId`                                                                                                                                             | `parent_id`                                                                                  |
| WorkItem                 | `estimateUnits`                                                                                                                                        | `story_points`                                                                               |
| WorkItem                 | `workstream`                                                                                                                                           | `bucket_id`                                                                                  |
| WorkItem                 | `statusId` (+ per-project `ProjectStatus` list)                                                                                                        | `status` (one vocabulary) + generated `status_category`                                      |
| WorkItem                 | `assignee`                                                                                                                                             | `work_item_assignees`                                                                        |
| WorkItem                 | `source` / `externalId`                                                                                                                                | `external_source` / `external_id` (+ `external_etag`)                                        |
| IssuedTask               | whole entity                                                                                                                                           | `work_items` (status `issued`) + `work_item_offers`                                          |
| IssuedTask               | `issuer`, `assignee`, `issuedDate`                                                                                                                     | `issued_by`, `issued_to`, `issued_at`                                                        |
| IssuedTask               | `acknowledgementDue`, `reminderSent`                                                                                                                   | `acknowledgement_due_date`, `reminder_sent_at`                                               |
| IssuedTask               | `responseReason`, `proposedDate`                                                                                                                       | `comment`, `proposed_date`                                                                   |
| IssuedTask               | `status`, `plannerSync`                                                                                                                                | derived in `v_issued_work_items`                                                             |
| IssuedTask               | `dueDate`, `estimatedEffortHours`, `checklist`, `attachments`                                                                                          | `work_items.finish_date`, `estimated_effort_hours`, checklist items, `work_item_attachments` |
| Person / GenericResource | both                                                                                                                                                   | `resources` (`is_bookable`, `is_placeholder`)                                                |
| Person                   | `team`, `skills`, `leave`, `initials`                                                                                                                  | `team_id`, `resource_skills`, `resource_leave`, derived                                      |
| ResourceAssignment       | `resourceType` + `resourceId`, `taskId`, `end`                                                                                                         | `resource_id`, `work_item_id`, `finish_date`                                                 |
| StatusReport             | `overrideReasons`, `aiDraft`                                                                                                                           | `override_reasons` jsonb, `ai_draft` jsonb                                                   |
| Benefit                  | `enablingProjects[]` / `attribution`                                                                                                                   | `benefit_projects.attribution_percent`                                                       |
| Benefit                  | `strategicObjectiveIds`                                                                                                                                | `benefit_objectives`                                                                         |
| Benefit                  | `dependencies` (text[])                                                                                                                                | `dependency_notes`                                                                           |
| Benefit                  | `category`                                                                                                                                             | `category_id` → lookup                                                                       |
| Benefit                  | `measures`, `reviews`, `handover`                                                                                                                      | child tables                                                                                 |
| BenefitMeasure           | `targetProfile[{period, value}]`                                                                                                                       | `benefit_measure_targets (period_id, value)`                                                 |
| BenefitMeasure           | `nextDue`, `records`                                                                                                                                   | `next_due_date`, `benefit_measurements`                                                      |
| MeasurementRecord        | `period` (label)                                                                                                                                       | `period_id` → `benefit_periods`                                                              |
| Decision                 | `options`, `chosenOptionId`, `actions`                                                                                                                 | `decision_options`, `chosen_option_id`, `decision_actions`                                   |
| Decision                 | `impact.{scope,cost,time,benefits}.{impacted,note}`                                                                                                    | `impact_scope`, `impact_scope_note`, …                                                       |
| Decision                 | `riskIds`, `issueIds`, `changeIds`, `dependencyIds`, `benefitIds`                                                                                      | link tables                                                                                  |
| Decision                 | `supersededById`                                                                                                                                       | derived (only `supersedes_id` stored)                                                        |
| Decision                 | `forum`                                                                                                                                                | `forum_id` → lookup                                                                          |
| Dependency               | `giver` / `receiver` objects                                                                                                                           | `giver_*` / `receiver_*` columns                                                             |
| Dependency               | `healthOverride: Health`                                                                                                                               | `health_override` + `health_override_reason`                                                 |
| Dependency               | `riskIds`, `issueIds`                                                                                                                                  | `dependency_risks`, `dependency_issues`                                                      |
| Lesson                   | `phaseId`, `category`, `projectTypeTags`, `sprint`                                                                                                     | `phase_id`, `category_id`, `lesson_project_types`, `sprint_name`                             |
| Lesson                   | `reference` like `EBB-001`                                                                                                                             | `ref` `LES-001` (org-wide; see §14)                                                          |
| PhaseLessonsReview       | `attendees[]`                                                                                                                                          | `phase_lessons_review_attendees`                                                             |
| RoadmapItem              | `kind`                                                                                                                                                 | derived from `project_id`                                                                    |
| RoadmapItem (linked)     | `start`, `finish`, `progress`, `health`, `owner`                                                                                                       | from the project via `v_roadmap_items`                                                       |
| RoadmapKeyDate           | `status`                                                                                                                                               | derived                                                                                      |
| ProjectRequest           | `draftBenefits`                                                                                                                                        | `request_benefit_drafts`                                                                     |
| Settings                 | `users`, `roles`, `currentUserId`                                                                                                                      | `profiles`, memberships, `auth.uid()`                                                        |
| Settings                 | `lifecycle.phases`, `lists.*`, `regional.exchangeRates`, `workingTime.holidayCalendars`, `templates.projectTemplates`, `data.auditLog`, `subscription` | tables (§4.2, §11)                                                                           |
| Settings                 | everything else                                                                                                                                        | `organisations.settings` jsonb                                                               |

---

## 13. Migration plan (Stage 3)

Small named migrations, applied through the Supabase connector. After each one I read `list_migrations` and save the committed file as `supabase/migrations/<version>_<name>.sql`, using **exactly** the version and name the database recorded.

As built. The order differs from the original plan: `delivery` (milestones) comes before `work_items`, because milestone-linked work items need it. The `migrations` folder is the source of truth.

| Version        | Name                        | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20261005174438 | `extensions_enums_utils`    | `pgcrypto`, `pg_cron`; all enums; `private` schema; `set_updated_at`, `ref_counters`, `next_ref()`, `assign_ref()`                                                                                                                                                                                                                                                                                                                                                                             |
| 20261005174507 | `tenancy_core`              | profiles, organisations, subscriptions, organisation_members, workspaces, workspace_members, `handle_new_user`, last-admin guard                                                                                                                                                                                                                                                                                                                                                               |
| 20261005174626 | `tenancy_rls_helpers`       | helper functions (§9.2), `org_today`, `tenant_guard`, RLS on the tenancy tables                                                                                                                                                                                                                                                                                                                                                                                                                |
| 20261005174707 | `org_reference_data`        | lookup_values, lifecycle_phases, gate_criteria, benefit_periods, exchange_rates, holidays, project_templates + RLS                                                                                                                                                                                                                                                                                                                                                                             |
| 20261005174736 | `resources`                 | resources, skills, leave, `link_profile_to_resource`, user_favourites + RLS                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 20261005174830 | `hierarchy`                 | portfolios, programmes, projects, strategic_objectives, collections, collection_projects, `can_edit_project` + RLS                                                                                                                                                                                                                                                                                                                                                                             |
| 20261005174922 | `requests_roadmaps`         | project_requests, request_benefit_drafts, roadmaps and children + RLS                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 20261005175004 | `delivery`                  | milestones + forecast history, project_team_members, resource_assignments, status_reports + RLS                                                                                                                                                                                                                                                                                                                                                                                                |
| 20261005175109 | `work_items`                | project_buckets, work_items + children, events and offers triggers + RLS                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 20261005175156 | `raid_change`               | risks, issues, assumptions, change_requests + RLS                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 20261005175302 | `decisions_dependencies`    | decisions + children + links, dependencies + links + RLS                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 20261005175434 | `benefits`                  | benefits and children, capabilities, outcomes, maps + RLS                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 20261005175510 | `lessons`                   | lessons, lesson_project_types, improvement_actions, phase_lessons_reviews + RLS                                                                                                                                                                                                                                                                                                                                                                                                                |
| 20261005175540 | `integrations`              | ms_connections, plan links, outbox, conflicts, log + RLS                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 20261005175656 | `rollup_views`              | all §10 views and functions, `js_round()`                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 20261005175729 | `snapshots_audit`           | health_snapshots, `capture_health_snapshots`, audit_log + triggers, cron jobs                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 20261005175820 | `create_organisation_rpc`   | `create_organisation()`, `seed_org_defaults()`, `join_demo_organisation()`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 20261005175833 | `storage`                   | buckets + storage.objects policies (one per action)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 20261005183516 | `lock_down_rls_auto_enable` | security advisor fix (see below)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 20261005185157 | `advisor_fixes_2`           | revoke every `private` function from `public, anon`; `org_today` override only without a user; latest-submission rule in `v_benefit_period_values`                                                                                                                                                                                                                                                                                                                                             |
| 20261005190346 | `project_permissions_rpc`   | Stage 4b: `project_permissions(project)` for the UI (SECURITY INVOKER)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 20261005213047 | `permissions_can_delete`    | Stage 4c: `project_permissions` returns `can_delete` alongside `can_edit`; `my_workspace_roles()` for the header role and button visibility. The 4b function is renamed `project_permissions_4b` and revoked (drop it by hand: the connector can't run `drop function` without a prompt)                                                                                                                                                                                                       |
| 20261005224326 | `roadmap_red_is_red`        | Stage 4c: a red project is always "High risk" on the roadmap                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 20261005225559 | `roadmap_items_single_pass` | Stage 4c: `v_roadmap_items` computes project health and task stats once (materialised CTEs) instead of once per row                                                                                                                                                                                                                                                                                                                                                                            |
| 20261006084142 | `optimism_bias_settings`    | Optimism bias required and validated in `organisations.settings`; defaults backfilled; PMO may update it (and only it)                                                                                                                                                                                                                                                                                                                                                                         |
| 20261006084203 | `committee_packs`           | Issued committee packs: immutable once issued, never deleted, readable by workspace members                                                                                                                                                                                                                                                                                                                                                                                                    |
| 20261006090010 | `ref_numbers_past_999`      | `next_ref` pads to three digits but no longer truncates (RSK-1000, not RSK-100)                                                                                                                                                                                                                                                                                                                                                                                                                |
| 20261006103801 | `rls_array_helpers`         | Every RLS policy compares against per-statement id arrays (`my_workspace_ids`, `my_org_ids`, `my_editable_project_ids`, `my_resource_ids`, `my_colleague_ids`) instead of calling a helper per row. Same permissions (`rls_matrix.sql`)                                                                                                                                                                                                                                                        |
| 20261006104522 | `health_views_single_pass`  | Health views compute each piece once: materialised dimensions, benefit health in one pass over benefits, portfolio roll-ups joined. Same output (`health_views_snapshot.sql`)                                                                                                                                                                                                                                                                                                                  |
| 20261006133131 | `financials`                | Financials F2: cost-category lookups, `cost_lines`, `financial_values`, `budget_baselines` (append-only, versioned), `financial_periods` (month-end close), `financial_forecast_history` (`close` or `scheduled`, cron on the 1st), `actuals_imports` and rows; RLS; `v_project_financials`, `v_programme_financials`, `v_portfolio_financials`; `v_projects` money computed, `has_baseline`; financial health `not_set` without a baseline; data moved from `projects.budget/actual/forecast` |
| 20261006133444 | `financials_cutoff_once`    | `v_project_financials` computes the cut-off once per organisation (materialised CTE) instead of once per monthly value. Same output                                                                                                                                                                                                                                                                                                                                                            |

**Seed.** `scripts/generate-seed.ts` imports the current mock modules and writes `supabase/seed.sql`:

- one demo organisation ("Demo University", `is_demo = true`) with one workspace
- deterministic uuids (`md5('virtual-pmo-demo:' || kind:old_id)` cast to uuid), so reruns are stable
- project codes from the existing lesson prefixes, the rest derived from initials and made unique
- dates re-expressed relative to the run: mock 21/09/2026 (a Monday) becomes the Monday of the current London week, so weekday patterns survive
- every person name resolved to a `resources` row. Names that match neither directory become unlinked, non-bookable resources, listed with `raise notice`
- synthetic `health_snapshots` backfill (`is_synthetic = true`)

It has no auth users. After your first sign-in, `select public.join_demo_organisation()` adds you as admin. This works only for orgs flagged `is_demo` and only for profiles named in `organisations.settings->'demoAdmins'`.

The seed builds helper functions in a temporary `seed_tmp` schema and drops it at the end. On the hosted project the seed was loaded in chunks through the connector, which cannot run `drop schema` without a confirmation prompt, so `seed_tmp` has to be dropped by hand there (`drop schema seed_tmp cascade;`).

**Types.** Generated with the connector's `generate_typescript_types` into `src/integrations/supabase/types.ts`, identical to `supabase gen types typescript --linked`.

**Advisors (after the seed).**

- Security:
  - `public.rls_auto_enable()` was executable by `anon` and `authenticated`. It is Supabase's platform event-trigger function, not ours. Fixed by revoking EXECUTE in `lock_down_rls_auto_enable`. The committed file guards the revoke so a local stack without the function still resets.
  - `create_organisation()` and `join_demo_organisation()` are SECURITY DEFINER and callable by `authenticated`. This is intended: they are the onboarding RPCs and check the caller themselves. Accepted.
- Performance: only `unused_index` (INFO). These are the FK-covering indexes, unused because the database has had no traffic yet. Kept; removing them would raise `unindexed_foreign_keys` instead.

**Checks.**

- `scripts/health-parity.sql` + `scripts/health-parity.ts` compare the SQL roll-ups with `pmo.ts`.
- `supabase/tests/tenant_guard.sql` runs the cross-organisation checks in a rolled-back transaction.

---

## 14. Review outcome

| #   | Call                                                  | Outcome                                           |
| --- | ----------------------------------------------------- | ------------------------------------------------- |
| 1   | Org admin/pmo hold that role in every workspace       | approved                                          |
| 2   | Fixed permission matrix                               | approved                                          |
| 3   | No per-project membership                             | covered by `can_edit_project()` (review E)        |
| 4   | Ref scopes (`LES-001` org-wide)                       | approved                                          |
| 5   | Benefits portfolio-scoped                             | approved, plus nullable `programme_id` (review C) |
| 6   | Snapshots use exactly-one-of FKs                      | kept, with `on delete restrict` (review B)        |
| 7   | Work item status vocabulary                           | approved                                          |
| 8   | Team members vs assignments separate                  | approved                                          |
| 9   | No cross-workspace dependencies                       | approved                                          |
| 10  | `sprints.ts` stays browser-local                      | approved                                          |
| 11  | Lookup enforcement by generated column + composite FK | approved                                          |
| 12  | uuid URLs                                             | replaced by project `code` (review D)             |

**Also from review:**

- After Stage 4, the `pmo.ts` health logic runs only as the parity-test fixture, never at runtime.
- Whether workspace PMOs can manage resources is **on hold**. Built as written: org-level pmo writes resources, and managers write placeholders.
