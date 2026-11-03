# ORMO PMO — Report Builder: Design & Build Specification

Version 1.0 · November 2026
Repo: `cjpmd/virtual-pmo-hub` · Suggested location: `docs/report-builder-spec.md`

---

## 0. Instructions for Claude Code

Read this whole document before writing any code. Then:

1. **Read `docs/build-plan.md`** and the existing codebase. Identify the stack conventions in use (expected: React + Vite + TypeScript, Tailwind, shadcn/ui, TanStack Query, Supabase).
2. **Inspect the existing Supabase schema** (`supabase/migrations/` and generated types). Map every concept in this spec to existing tables before creating new ones. Existing entities are expected to include: organisations, users/memberships, portfolios, programmes, projects, milestones, risks, issues, decisions (possibly), change requests, financials (budget/actual/forecast), resources/allocations, benefits/capabilities/outcomes, highlight reports, and the status collection function. Table names in this spec are **proposals**; if an equivalent exists, extend it rather than duplicate it.
3. **Write a short mapping note** at `docs/report-builder-mapping.md` listing: each spec concept → existing table/column or "new", plus any gaps. Stop and summarise this for Chris before Phase 1 migrations.
4. **Work phase by phase** (Section 18). Each phase ends with its acceptance criteria met, tests passing, and a short changelog entry in `docs/build-plan.md`.
5. **Migrations:** additive only. Never drop or rename existing columns without asking. Every new table gets RLS enabled in the same migration.
6. **Do not hard-code** RAG values, risk matrices, metric thresholds, or forum types anywhere in UI code. They come from configuration (Sections 8–9).
7. When something in this spec conflicts with the existing code's working behaviour, prefer the existing behaviour and log the conflict in the mapping note.

---

## 1. Purpose

Let users build reports for different governance forums (project boards, programme boards, portfolio boards, committees), either from a **template** or as an **ad hoc** report. Reports must:

- Show overall status for the scope, and the status of each project/programme within it.
- Automatically pick which projects get a detailed **deep-dive**, using exception rules against forum tolerances, with manual pin/exclude.
- Cover status, progress, resources, budget, decisions, risks & issues, dependencies, benefits, roadmap and requests, plus the additional blocks in Section 6.
- Be published as a **frozen snapshot** for a meeting, compared against the previous pack, and distributed to forum members.
- Feed decisions and actions from the meeting back into the platform.
- Be extensible to NHS-specific modules (CIP, QIA/EqIA, clinical safety, Five Case Model, BAF) without restructuring (Section 17).

Out of scope for this build: the NHS modules themselves, PPTX export (Phase 4 optional), scheduled auto-generation beyond collection-cycle linkage.

---

## 2. Concepts

| Term | Meaning |
|---|---|
| **Forum** | A governance body: Project Board, Programme Board, Portfolio Board, Committee, or custom. Has members, cadence, scope, tolerances, rating scheme and a default template. |
| **Meeting** | A dated sitting of a forum. A published report is attached to a meeting. |
| **Scope** | The set of entities a report covers: one project, a programme, a portfolio, or a custom list. May span organisations (Section 14). |
| **Block** | A reusable report component (e.g. Milestone Slippage, Top Risks). Defined in code in the Block Registry; configured per report. |
| **Template** | Saved ordered list of blocks + configs + selection rules, for a forum type or a specific forum. |
| **Report** | An instance: template (or none, if ad hoc) + scope + as-at date + forum/meeting + status. |
| **Metric** | A named, computed, per-entity value (e.g. `max_milestone_slip_days`). Used by blocks, selection rules and diffs. |
| **Tolerance** | Per-forum threshold for a metric. Breaching it triggers exception inclusion. |
| **Selection rule** | A condition over metrics deciding which projects get a deep-dive. |
| **Inclusion** | A record that a project is deep-dived in a report, with the reason(s). |
| **Snapshot** | The frozen data for every block at publish time. |
| **Rating scheme** | Configurable status scale: RAG, or NHS assurance levels, etc. |
| **Declared vs evidenced** | Declared = PM's reported status. Evidenced = status computed from data. Already present in the app ("Report · Data"). |

---

## 3. User journeys

**J1 — PMO builds a Programme Board pack from a template**
Governance → Forums → Programme Board 4 → Next meeting (12 Nov) → "Create pack". Report is created from the forum's default template, scope = programme, as-at = collection cut-off. The selection panel shows 3 projects auto-included (with reasons). PMO pins one more, edits narrative, submits for review. Chair approves. PMO publishes → snapshot frozen → email sent to members.

**J2 — Ad hoc report**
Reports → New → "Ad hoc". Pick scope (e.g. 7 named projects across two programmes), as-at = today, drag in blocks. View/export PDF. Optionally "Save as template".

**J3 — Template authoring**
Reports → Templates → New. Choose forum type, add/reorder blocks, configure each, define selection rules. Save. Set as default for a forum.

**J4 — During the meeting**
Open published report in Presentation mode. Record decisions against "Decisions required" items and add actions. These write to the decision log and actions table, linked to meeting + project.

**J5 — Board member**
Receives email → opens link (free read-only viewer seat) → reads the pack, sees "Changed since last meeting", downloads PDF.

---

## 4. Architecture overview

```
                ┌──────────────────────────┐
                │      Block Registry      │  (code: src/features/reports/blocks/*)
                │ key, config schema,      │
                │ data resolver, renderer, │
                │ exposed metrics          │
                └────────────┬─────────────┘
                             │
 Template / Report ──► Report Engine ──► resolves scope ──► computes metrics (SQL)
   (blocks JSON,          │                 │                     │
    rules JSON)           │                 ▼                     ▼
                          │        evaluates selection rules ──► inclusions
                          ▼
                 per-block data (live, for drafts)
                          │
                 publish ─┴─► snapshot (frozen JSON per block) ──► render (web / present / PDF)
                                                               └─► diff vs previous published snapshot
```

Key principles:

- **Drafts render live data. Published reports render only from snapshots.** Never recompute a published report.
- **Metrics are computed in Postgres** (SQL functions), not in the browser, so rules, blocks and diffs agree.
- **Blocks are pure:** `(scope, config, asAt, context) → data` and `(data, config) → UI`. Renderers never fetch.
- **Everything configurable lives in tables**, keyed by `org_id`.

Suggested code layout:

```
src/features/reports/
  blocks/
    registry.ts            // registerBlock(), getBlock(), listBlocks()
    types.ts               // BlockDefinition, BlockInstance, BlockContext
    status/…  progress/…  budget/…  raid/…  (one folder per block)
  engine/
    resolveScope.ts
    evaluateRules.ts
    buildReportData.ts
    diff.ts
  builder/                 // builder UI (canvas, library, config panel, rules panel)
  viewer/                  // web view, presentation mode, print view
  api/                     // TanStack Query hooks over Supabase
supabase/functions/
  report-publish/          // builds and stores snapshot (service role)
  report-distribute/       // Resend emails
  report-pdf/              // Phase 3 server-side PDF (optional, see §11)
  report-ai-summary/       // Phase 4
```

---

## 5. Data model

Proposed SQL. Adjust names/foreign keys to the existing schema per the mapping note. All tables include `org_id uuid not null` (the owning org), `created_at`, `updated_at`, `created_by` where sensible, and RLS.

### 5.1 Configuration

```sql
-- Rating schemes (RAG, NHS assurance levels, etc.)
create table rating_schemes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id),       -- null = system default
  key text not null,                               -- 'rag', 'nhs_assurance'
  name text not null,
  levels jsonb not null,                           -- [{key,label,colour,rank}] rank: 1 = best
  unique (org_id, key)
);

-- Risk matrices (configurable, e.g. NHS 5x5)
create table risk_matrices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id),
  key text not null,
  name text not null,
  likelihood_levels jsonb not null,                -- [{value:1,label:'Rare',description}]
  consequence_levels jsonb not null,               -- [{value:1,label:'Negligible',description}]
  score_method text not null default 'product',    -- 'product' | 'lookup'
  score_lookup jsonb,                              -- optional grid if not product
  bands jsonb not null,                            -- [{min:1,max:3,key:'low',label,colour}]
  is_default boolean not null default false,
  unique (org_id, key)
);
```

Seed: system `rag` scheme (green/amber/red, plus `grey` = not reported), system `nhs_assurance` scheme (substantial / reasonable / limited / no assurance), system default matrix matching the app's current one, and a `nhs_5x5` matrix (likelihood 1–5 × consequence 1–5, bands 1–3 low, 4–6 moderate, 8–12 high, 15–25 extreme).

Risks: ensure existing risk/issue tables store numeric `likelihood` and `consequence` (or `impact`) plus `risk_matrix_id` (nullable → org default). Provide `risk_score(risk_id)` and `risk_band(risk_id)` SQL functions. Existing labels (e.g. "Low") should derive from the band, not be stored independently. If they are stored today, keep them but add the function and migrate display to it.

### 5.2 Forums and meetings

```sql
create type forum_type as enum ('project_board','programme_board','portfolio_board','committee','custom');

create table forums (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  name text not null,
  type forum_type not null,
  description text,
  scope_type text not null,              -- 'project' | 'programme' | 'portfolio' | 'custom'
  scope_entity_id uuid,                  -- for project/programme/portfolio scopes
  cadence text,                          -- free text or RRULE, e.g. 'FREQ=MONTHLY;BYDAY=2TU'
  rating_scheme_id uuid references rating_schemes(id),
  tolerances jsonb not null default '{}',-- { metric_key: {op:'>', value:14} }
  default_template_id uuid,              -- fk added after report_templates exists
  parent_forum_id uuid references forums(id),   -- escalation route
  archived_at timestamptz
);

create table forum_scope_items (          -- for scope_type = 'custom'
  forum_id uuid references forums(id) on delete cascade,
  entity_type text not null,              -- 'project' | 'programme'
  entity_id uuid not null,
  primary key (forum_id, entity_type, entity_id)
);

create type forum_role as enum ('chair','secretary','member','contributor','observer');

create table forum_members (
  forum_id uuid references forums(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role forum_role not null default 'member',
  primary key (forum_id, user_id)
);

create table forum_meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  forum_id uuid not null references forums(id),
  meeting_date date not null,
  collection_cycle_id uuid,               -- link to existing collection function, if modelled
  status text not null default 'scheduled' -- scheduled | held | cancelled
);
```

### 5.3 Templates and reports

```sql
create table report_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id),     -- null = system template
  name text not null,
  description text,
  forum_type forum_type,                         -- null = any
  scope_type text not null,                      -- project | programme | portfolio | custom | any
  blocks jsonb not null default '[]',            -- BlockInstance[] (see §6.1)
  selection_rules jsonb not null default '{}',   -- SelectionRuleSet (see §7)
  rating_scheme_key text,                        -- override; else forum's
  version int not null default 1,
  is_system boolean not null default false,
  archived_at timestamptz
);

alter table forums add constraint forums_default_template_fk
  foreign key (default_template_id) references report_templates(id);

create type report_status as enum ('draft','in_review','approved','published','withdrawn');

create table reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id),
  title text not null,
  template_id uuid references report_templates(id),   -- null = ad hoc
  template_version int,
  forum_id uuid references forums(id),
  meeting_id uuid references forum_meetings(id),
  scope_type text not null,
  scope_entity_id uuid,
  scope_items jsonb,                         -- for custom scope: [{entity_type, entity_id}]
  as_at date not null,
  blocks jsonb not null,                     -- copied from template at creation, then editable
  selection_rules jsonb not null,
  rating_scheme_id uuid references rating_schemes(id),
  overall_rating text,                       -- level key from scheme (declared by report owner)
  overall_rating_rationale text,
  status report_status not null default 'draft',
  previous_report_id uuid references reports(id), -- last published report for same forum
  submitted_at timestamptz, approved_at timestamptz, approved_by uuid,
  published_at timestamptz, published_by uuid
);

create table report_inclusions (
  report_id uuid references reports(id) on delete cascade,
  entity_type text not null default 'project',
  entity_id uuid not null,
  mode text not null,                        -- 'rule' | 'pinned' | 'excluded'
  reasons jsonb not null default '[]',       -- [{rule_id, metric, value, threshold, label}]
  sort_order int,
  primary key (report_id, entity_type, entity_id)
);

create table report_narratives (            -- editable text per block/entity in a draft
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  block_instance_id text not null,
  entity_id uuid,                            -- null = report-level
  body jsonb not null,                       -- rich text (TipTap/ProseMirror JSON) or markdown
  source text not null default 'human',      -- 'human' | 'ai_draft' | 'highlight_report'
  updated_by uuid, updated_at timestamptz default now()
);

create table report_snapshots (             -- immutable after insert
  report_id uuid references reports(id) on delete cascade,
  block_instance_id text not null,
  entity_id uuid,                            -- for per-project deep-dive blocks
  data jsonb not null,
  metrics jsonb,                             -- metrics used, for diffs
  primary key (report_id, block_instance_id, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
-- If coalesce in PK is not supported, use a surrogate id + unique index on the expression.

create table report_metric_snapshots (      -- per-entity metrics at publish, for diffs & trends
  report_id uuid references reports(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  metrics jsonb not null,                    -- { metric_key: value }
  primary key (report_id, entity_type, entity_id)
);

create table report_events (                -- audit trail
  id bigserial primary key,
  report_id uuid references reports(id) on delete cascade,
  event text not null,                       -- created|submitted|approved|returned|published|distributed|withdrawn
  actor uuid, payload jsonb, created_at timestamptz default now()
);
```

Immutability: a trigger rejects `update`/`delete` on `report_snapshots` and `report_metric_snapshots`, and rejects changes to `blocks`, `as_at`, `scope_*`, `selection_rules` on `reports` where `status = 'published'`. Withdrawal sets `status = 'withdrawn'` only.

### 5.4 Decisions and actions

Check for an existing decision log. If it exists, add nullable `forum_id`, `meeting_id`, `report_id`, `requested_of_forum_id`, `decision_due`, `options jsonb`, `outcome`, `decided_at`. Otherwise create:

```sql
create table decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  ref text,                                 -- DEC-001
  title text not null,
  description text,
  project_id uuid, programme_id uuid,
  requested_of_forum_id uuid references forums(id),
  decision_due date,
  options jsonb,                            -- [{key,label,recommendation:boolean,impact}]
  status text not null default 'open',      -- open | decided | deferred | withdrawn
  outcome text, decided_at timestamptz,
  meeting_id uuid references forum_meetings(id),
  report_id uuid references reports(id)
);

create table forum_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  forum_id uuid references forums(id),
  meeting_id uuid references forum_meetings(id),
  project_id uuid,
  title text not null,
  owner_id uuid, due_date date,
  status text not null default 'open',      -- open | done | overdue (derived) | cancelled
  closed_at timestamptz
);
```

Escalations: add `escalated_to_forum_id uuid` and `escalated_at` to risks and issues (and decisions use `requested_of_forum_id`). A forum's "escalations" are items pointing at it.

### 5.5 Foundations for later modules (schema now, minimal UI)

```sql
-- Generic approvals / gates (QIA/EqIA, clinical safety, business case stages, stage gates)
create table approval_gates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  entity_type text not null,                -- project | business_case | cip_scheme | safety_case ...
  entity_id uuid not null,
  gate_type text not null,                  -- stage_gate | qia | eqia | dcb0129 | dcb0160 | soc | obc | fbc
  name text not null,
  due_date date,
  status text not null default 'pending'    -- pending | approved | rejected | waived
);
create table approval_steps (
  id uuid primary key default gen_random_uuid(),
  gate_id uuid references approval_gates(id) on delete cascade,
  step_order int not null,
  required_role text not null,              -- e.g. 'medical_director', 'chief_nurse', 'cso', 'sro'
  approver_id uuid,
  decision text,                            -- approved | rejected | null
  decided_at timestamptz,
  comment text
);

-- Typed links between any records (BAF links, hazard↔risk, CIP↔benefit, dependencies)
create table record_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  from_type text not null, from_id uuid not null,
  to_type text not null,   to_id uuid not null,
  link_type text not null,                  -- depends_on | mitigates | contributes_to | maps_to_baf | relates_to
  attributes jsonb,                         -- e.g. {criticality:'high', need_by:'2027-01-10'}
  unique (from_type, from_id, to_type, to_id, link_type)
);

-- Cross-organisation sharing (ICS programmes)
create table entity_shares (
  id uuid primary key default gen_random_uuid(),
  owner_org_id uuid not null,
  entity_type text not null,                -- programme | project | forum | report
  entity_id uuid not null,
  partner_org_id uuid not null,
  access text not null default 'read',      -- read | contribute
  hidden_block_keys text[] default '{}',    -- blocks partners must not see
  created_by uuid, created_at timestamptz default now()
);
```

If dependencies already exist in their own table, keep them, and expose them through a view that unions into the same shape as `record_links` where `link_type = 'depends_on'`.

### 5.6 Access helpers (RLS)

Create SQL helper functions, `security definer`, `stable`:

- `is_org_member(org uuid) → bool`
- `can_view_entity(entity_type text, entity_id uuid) → bool`. True if the user is a member of the owning org, **or** their org has an `entity_shares` row for the entity or its parent programme.
- `forum_role_of(forum uuid) → forum_role | null`
- `can_edit_report(report uuid) → bool`. Org admin/PMO role, or forum chair/secretary, or report creator while `status = 'draft'`.

Policies:

- `reports`: select if `can_view_entity('report', id)` or forum member. Published reports are visible to forum members, including read-only viewer seats. Drafts are visible only to editors and the forum chair/secretary.
- `report_snapshots`: select follows parent report. Insert only via service role (publish function).
- `forums`, `forum_members`, `forum_meetings`: select for org members and forum members. Write for org admin/PMO and forum chair/secretary.
- Config tables: select for org members plus system rows (`org_id is null`). Write for org admins.

RLS tests are required (Section 19).

---

## 6. Block registry

### 6.1 Types

```ts
// src/features/reports/blocks/types.ts
import { z } from 'zod';

export type ScopeLevel = 'project' | 'programme' | 'portfolio' | 'custom';

export interface BlockContext {
  orgId: string;
  asAt: string;                    // ISO date
  scope: ResolvedScope;            // entities in scope (projects, programmes)
  entityId?: string;               // set for per-project deep-dive rendering
  forum?: ForumConfig;             // tolerances, rating scheme
  ratingScheme: RatingScheme;
  riskMatrix: RiskMatrix;
  previousReportId?: string;       // for "since last" comparisons
  audience: 'internal' | 'partner';
}

export interface BlockDefinition<C = unknown, D = unknown> {
  key: string;                     // 'milestone_slippage'
  version: number;                 // bump when config/data shape changes
  name: string;
  category: BlockCategory;         // 'status' | 'progress' | ... (see §6.3)
  description: string;
  supportedScopes: ScopeLevel[];
  perEntity: boolean;              // true = can render inside a project deep-dive
  configSchema: z.ZodType<C>;      // drives the config panel form
  defaultConfig: C;
  exposedMetrics?: string[];       // metric keys this block surfaces (for rules/diff)
  resolve: (ctx: BlockContext, config: C) => Promise<D>;  // fetch & shape data
  Renderer: React.FC<{ data: D; config: C; ctx: RenderContext }>;
  PrintRenderer?: React.FC<{ data: D; config: C; ctx: RenderContext }>; // optional print layout
  migrateConfig?: (old: unknown, fromVersion: number) => C;
  partnerSafe: boolean;            // false = hidden from partner audiences by default
}

export interface BlockInstance {
  id: string;                      // stable nanoid within a template/report
  blockKey: string;
  blockVersion: number;
  title?: string;                  // override display title
  config: unknown;
  placement: 'report' | 'deep_dive'; // report-level section or repeated per included project
  pageBreakBefore?: boolean;
}
```

Notes:

- Templates and reports store `BlockInstance[]`. Blocks with `placement: 'deep_dive'` are rendered once per included project, in a "Project deep-dives" section, in inclusion order.
- `resolve` uses Supabase RPCs (Section 7.1) rather than many client queries. Prefer one RPC per block.
- `Renderer` must work on screen, in presentation mode and in print (A4 landscape). If layout differs a lot, provide `PrintRenderer`.
- Unknown block keys (e.g. after a downgrade) render a neutral "Block unavailable" placeholder and never crash the report.

### 6.2 Existing UI to reuse

Wrap existing components as blocks rather than rebuilding them:

- The "Projects by programme" grid → `project_status_grid`
- The expanded project panel: Summary → `project_summary`, Milestone slippage → `milestone_slippage`, Health by dimension → `health_by_dimension`, Last highlight report → `highlight_report_summary`, Top risks and issues → `top_raid`

Refactor them so data comes in via props (not internal fetches), then use the same component in the portfolio page and the block renderer.

### 6.3 Block catalogue

**P** = phase introduced. Scope: Pj = project, Pg = programme, Pf = portfolio, C = custom. **DD** = usable in deep-dive.

| Key | Category | Scopes | DD | P | Content & key config |
|---|---|---|---|---|---|
| `report_cover` | meta | all | – | 1 | Title, forum, meeting date, as-at, overall rating + rationale, author. |
| `executive_summary` | narrative | all | – | 1 | Rich text. Phase 4: "Draft with AI". |
| `overall_status` | status | all | ✓ | 1 | Declared vs evidenced rating, divergence alert. Config: show evidence, show trend. |
| `health_by_dimension` | status | all | ✓ | 1 | Schedule, financial, effort, RAID, benefits, overall sparkline per month. Config: months (default 6–12). |
| `project_status_grid` | status | Pg, Pf, C | – | 1 | Existing grid, grouped by programme. Config: columns, grouping, sort, "only exceptions" toggle. |
| `rating_distribution` | status | Pg, Pf, C | – | 2 | Count of projects by rating, declared vs evidenced. |
| `divergence_list` | assurance | Pg, Pf, C | – | 2 | Projects where declared is better than evidence, with days diverged. |
| `changes_since_last` | status | all | ✓ | 3 | Diff vs previous published report: rating moves, new red risks, slipped milestones, budget movement, new/closed items. |
| `project_summary` | progress | Pj | ✓ | 1 | Existing summary card: tier, priority, lifecycle phase, people, dates. |
| `milestone_slippage` | progress | all | ✓ | 1 | Next N open + slipped milestones vs baseline. Config: N, slip bands. |
| `milestone_timeline` | roadmap | all | ✓ | 2 | Gantt-lite of milestones over a window. Config: window, milestone types. |
| `roadmap` | roadmap | Pg, Pf, C | – | 2 | Cross-project timeline with phases, stage gates, key milestones. Config: window, swimlane by programme. |
| `burnup_forecast` | progress | Pj | ✓ | 2 | Burn-up/velocity and recovery forecast (reuse existing sprint reporting if present). |
| `stage_gates` | progress | all | ✓ | 2 | Upcoming gates with readiness, from `approval_gates` where `gate_type='stage_gate'`. |
| `budget_summary` | budget | all | ✓ | 1 | Budget / actual / forecast / variance, change this period. Config: units, show phasing. |
| `spend_profile` | budget | all | ✓ | 2 | Monthly planned vs actual vs forecast chart. |
| `budget_movers` | budget | Pg, Pf, C | – | 2 | Biggest overspend / biggest movers (as on the portfolio page). |
| `resource_summary` | resources | all | ✓ | 2 | Allocation vs capacity, over-allocated people, unfilled roles. |
| `decisions_required` | decisions | all | ✓ | 1 | Open decisions where `requested_of_forum_id` = this forum (or in scope). Options, recommendation, due date. |
| `decisions_taken` | decisions | all | ✓ | 2 | Decisions decided since previous meeting. |
| `top_raid` | raid | all | ✓ | 1 | Top N risks/issues by score, then staleness. Config: N, types, min band. |
| `risk_heatmap` | raid | all | ✓ | 2 | Matrix from the configured risk matrix. |
| `escalations` | raid | all | – | 2 | Risks/issues/decisions escalated to this forum. |
| `raid_movement` | raid | all | ✓ | 3 | New/closed/re-scored since last report. |
| `dependencies` | dependencies | all | ✓ | 2 | Dependencies in/out of scope, at-risk flag, need-by vs forecast. Config: show external only, at-risk only. |
| `benefits_summary` | benefits | all | ✓ | 2 | Benefits profile planned vs forecast vs realised; capability/outcome RAG. Config: categories. |
| `change_requests` | requests | all | ✓ | 1 | Change requests (open/decided), impact on time/cost/scope. |
| `requests_pipeline` | requests | Pf, C | – | 2 | New project, funding and resource requests awaiting this forum. |
| `actions_log` | governance | all | – | 2 | Actions from previous meetings: open, overdue, closed since last. |
| `data_quality` | assurance | all | ✓ | 2 | Stale updates (risks not updated > N days, missing highlight report, missing forecast). |
| `highlight_report_summary` | narrative | Pj | ✓ | 1 | Latest highlight report for the period: declared status, summary, link. |
| `lessons_learned` | governance | Pg, Pf, C | – | 3 | Lessons logged this period (if lessons exist; else defer). |
| `linked_records` | governance | all | ✓ | 3 | Generic list from `record_links` by link type (e.g. BAF links later). |
| `approvals_status` | governance | all | ✓ | 2 | Generic gates from `approval_gates` (any `gate_type`). Config: gate types. |
| `free_text` | narrative | all | ✓ | 1 | Heading + rich text. |
| `section_heading` | layout | all | – | 1 | Section divider; optional page break. |

### 6.4 Default system templates (seed)

**Project Board** (scope: project): `report_cover`, `executive_summary`, `overall_status`, `health_by_dimension`, `project_summary`, `milestone_slippage`, `budget_summary`, `resource_summary`, `decisions_required`, `top_raid`, `dependencies`, `benefits_summary`, `change_requests`, `actions_log`, `changes_since_last`, `free_text` ("Forward look").

**Programme Board** (scope: programme): `report_cover`, `executive_summary`, `overall_status` (programme), `rating_distribution`, `project_status_grid`, `changes_since_last`, `roadmap`, `budget_summary`, `budget_movers`, `escalations`, `dependencies`, `benefits_summary`, `decisions_required`, `change_requests`, `actions_log`, `section_heading` ("Project deep-dives"). Deep-dive blocks: `overall_status`, `health_by_dimension`, `milestone_slippage`, `budget_summary`, `top_raid`, `highlight_report_summary`. Rules: default exception set (§7.3).

**Portfolio Board / Committee** (scope: portfolio): `report_cover`, `executive_summary`, `rating_distribution`, `project_status_grid` (grouped by programme, exceptions only), `divergence_list`, `budget_summary`, `budget_movers`, `benefits_summary`, `roadmap`, `escalations`, `requests_pipeline`, `decisions_required`, `data_quality`, `actions_log`. Deep-dive blocks: `overall_status`, `health_by_dimension`, `milestone_slippage`, `budget_summary`, `top_raid`. Rules: default exception set with tighter tolerances.

Any forum can copy a system template into an org template and edit it.

---

## 7. Metrics and selection rules

### 7.1 Metric registry

Metrics are computed per entity, as at a date, in SQL. Create:

```sql
-- Returns one row per project in scope with a jsonb of metrics.
create function project_metrics(p_project_ids uuid[], p_as_at date)
returns table (project_id uuid, metrics jsonb)
language sql stable security invoker as $$ … $$;
```

Mirror the metric definitions in TypeScript (`src/features/reports/engine/metrics.ts`) for labels, units and operators only. Computation stays in SQL.

Initial metrics (adapt to the available data and document any you can't compute):

| Key | Type | Meaning |
|---|---|---|
| `declared_rating` | enum | PM's declared overall status for the period |
| `evidenced_rating` | enum | Computed overall status |
| `rating_rank_delta` | int | Evidenced rank − declared rank (>0 = declared better than evidence) |
| `divergence_days` | int | Days the declared rating has been better than evidence |
| `rating_worsened` | bool | Evidenced rating worse than at previous published report |
| `dimension_red_count` | int | Number of health dimensions at red |
| `max_milestone_slip_days` | int | Largest forecast-vs-baseline slip among open milestones |
| `slipped_milestones` | int | Count of open milestones with slip > 0 |
| `budget_variance_abs` | money | Forecast at completion − budget |
| `budget_variance_pct` | pct | Variance / budget |
| `budget_change_period` | money | Movement in forecast since previous report/month |
| `max_risk_score` | int | Highest open risk score (configured matrix) |
| `risks_in_top_band` | int | Open risks in the highest band |
| `open_issues_high` | int | Open issues at high or above |
| `open_decisions_for_forum` | int | Decisions requested of the context forum |
| `escalations_for_forum` | int | Items escalated to the context forum |
| `open_change_requests` | int | Open change requests |
| `days_to_next_gate` | int | Days until next stage gate |
| `at_risk_dependencies` | int | Dependencies flagged at risk |
| `benefits_rating` | enum | Benefits dimension rating |
| `stale_update_days` | int | Days since last highlight report or status update |
| `percent_complete` | pct | Existing % done |

Forum-dependent metrics (`*_for_forum`) take the forum id as an extra parameter. Provide `project_metrics(p_project_ids, p_as_at, p_forum_id default null)`.

### 7.2 Rule format

```ts
export interface SelectionRuleSet {
  mode: 'any' | 'all';             // include if any rule matches (default 'any')
  rules: SelectionRule[];
  maxAutoIncluded?: number;        // cap, ordered by severity
  orderBy?: 'severity' | 'programme' | 'name';
}

export interface SelectionRule {
  id: string;
  label: string;                   // shown as the inclusion reason, e.g. "Schedule slip beyond tolerance"
  metric: string;                  // metric key
  op: '>' | '>=' | '<' | '<=' | '=' | '!=' | 'in' | 'worse_than';
  value?: number | string | string[];
  useForumTolerance?: boolean;     // take threshold from forum.tolerances[metric]
  severity: 1 | 2 | 3;             // for ordering and capping
  enabled: boolean;
}
```

Evaluation (`engine/evaluateRules.ts`, pure function, unit-tested):

1. Get metrics for all projects in scope.
2. For each project, evaluate the enabled rules. Threshold = forum tolerance when `useForumTolerance`, otherwise `value`.
3. Matched projects become `mode='rule'` inclusions, with `reasons` listing every matched rule and the actual value vs threshold.
4. Apply `maxAutoIncluded` by highest severity, then by number of reasons.
5. Merge manual overrides. `pinned` always included (reason "Pinned by <name>"). `excluded` is removed even if matched, and the UI still shows it as "Excluded (would have matched: …)".
6. Re-evaluate on demand in drafts ("Refresh selection"). Freeze at publish.

Field-agnostic by design: any new module only needs to add metrics to `project_metrics` (or a sibling function) and register them in `metrics.ts`. Rules then work automatically.

### 7.3 Default exception rule set

| Label | Metric | Condition |
|---|---|---|
| Evidenced red | `evidenced_rating` | `= red` |
| Worsened since last report | `rating_worsened` | `= true` |
| Report better than evidence | `divergence_days` | `> tolerance` (default 14) |
| Schedule slip beyond tolerance | `max_milestone_slip_days` | `> tolerance` (default 14) |
| Budget variance beyond tolerance | `budget_variance_pct` | `> tolerance` (default 5%) |
| Decision required from this forum | `open_decisions_for_forum` | `> 0` |
| Escalated to this forum | `escalations_for_forum` | `> 0` |
| Stage gate due | `days_to_next_gate` | `<= tolerance` (default 30) |

Default tolerances per forum type are seeded. Portfolio-level defaults are looser on minor slips (e.g. slip 30 days, variance 10%) so fewer projects reach the higher forum.

---

## 8. Rating schemes and overall rating

- Each forum has a rating scheme (default `rag`). Reports inherit it, and the template can override.
- `overall_status` and `project_status_grid` render using the scheme's levels and colours. Evidenced ratings are computed as RAG internally, so map RAG → scheme with a `scheme_mapping` in `rating_schemes.levels` (e.g. green → substantial, amber → reasonable, red → limited). Store the mapping in config; never hard-code it.
- The report owner sets `reports.overall_rating` + `overall_rating_rationale` before submitting. Required when the forum's scheme is an assurance scheme.
- Every display of declared vs evidenced uses the forum's scheme labels.

---

## 9. Builder UI

Routes (adapt to the existing router and left nav; reports live under **Governance**):

| Route | Purpose |
|---|---|
| `/governance/forums` | Forum list, create/edit forum (members, scope, cadence, scheme, tolerances, default template) |
| `/governance/forums/:id` | Forum home: upcoming meetings, past packs, open decisions, actions |
| `/governance/reports` | All reports: filter by forum, status, date; "New report" (from template / ad hoc) |
| `/governance/reports/templates` | Template library (system + org); new/copy/edit/archive |
| `/governance/reports/templates/:id/edit` | Template builder |
| `/governance/reports/:id/edit` | Report builder (draft) |
| `/governance/reports/:id` | Report viewer (draft live, or published snapshot) |
| `/governance/reports/:id/present` | Presentation mode |
| `/governance/reports/:id/print` | Print layout (used for PDF) |

### 9.1 Builder layout

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ Title · Forum ▾ · Meeting ▾ · Scope ▾ · As at [date] · Status: Draft           │
│ [Refresh data] [Preview] [Submit for review]   [Save as template] [⋯]         │
├──────────────┬──────────────────────────────────────────┬─────────────────────┤
│ BLOCK LIBRARY│ CANVAS                                   │ INSPECTOR           │
│ search       │ ┌ Report-level blocks (drag to reorder) ┐│ (selected block)    │
│ ▸ Status     │ │ Cover                                 ││ Title override      │
│ ▸ Progress   │ │ Executive summary  [rich text]        ││ Config form from    │
│ ▸ Budget     │ │ Project status grid (live preview)    ││ zod schema          │
│ ▸ Resources  │ │ …                                     ││ Page break before ☐ │
│ ▸ Decisions  │ └───────────────────────────────────────┘│ Hide from partners ☐│
│ ▸ RAID       │ ┌ Project deep-dives ───────────────────┐│                     │
│ ▸ Deps       │ │ Blocks repeated per included project  ││ ─── or ───          │
│ ▸ Benefits   │ │ [overall_status][milestones][budget]… ││ SELECTION panel     │
│ ▸ Roadmap    │ └───────────────────────────────────────┘│ Rules (toggle/edit) │
│ ▸ Requests   │                                          │ Included (reasons)  │
│ ▸ Narrative  │                                          │ Pinned / Excluded   │
└──────────────┴──────────────────────────────────────────┴─────────────────────┘
```

- Drag and drop: `@dnd-kit/core` + `@dnd-kit/sortable`. Library → canvas adds a block. Blocks marked `perEntity` can be dropped in either zone. Others go in the report-level zone only.
- Canvas shows live previews from `resolve()` (TanStack Query, cached by `(blockKey, config, scope, asAt)`).
- Inspector config forms are generated from the block's zod schema (keep a small form generator supporting enum, number, boolean, multi-select, date window).
- Selection panel: list of rules with on/off toggles and threshold inputs (pre-filled from forum tolerances, with "override" indicated), then the resulting inclusion list. Each project shows reason chips (e.g. "Divergence 59 days", "Slip +9d"). Actions: Pin, Exclude, reorder. Also shows "Other projects in scope" with Pin buttons.
- Narrative editing inline on the canvas (rich text). Highlight-report text can be pulled in with "Use PM's summary" (source = `highlight_report`).
- Template builder = same component with `mode='template'`: no live as-at data (uses a sample scope chosen by the user for preview), no narratives, no status.
- "Save as template" from an ad hoc or forum report copies `blocks` + `selection_rules` into a new org template.
- Autosave drafts (debounced 1s), with conflict detection via `updated_at`.

### 9.2 Viewer

- Sticky table of contents (sections and deep-dives).
- Banner on published reports: "Published 10 Nov 2026 · as at 31 Oct 2026 · Snapshot". Drafts show "Draft · live data".
- `changes_since_last` badges inline: small ▲▼ markers next to ratings and figures that moved.
- Each deep-dive links to the live project ("Open project") with a note that live data may differ from the snapshot.

### 9.3 Presentation mode

Full screen. One section or one deep-dive per slide. Keyboard ←/→, `Esc` exits. Side drawer to record **decisions** (against `decisions_required` items: choose option, outcome text) and **actions** (title, owner, due, project). These write immediately to `decisions` / `forum_actions` with `meeting_id` and `report_id`. Recording outcomes does **not** change the published snapshot.

---

## 10. Report lifecycle and permissions

```
draft ──submit──► in_review ──approve──► approved ──publish──► published
  ▲                  │                                            │
  └────return────────┘                                     withdraw ▼
                                                              withdrawn
```

| Transition | Who | Effect |
|---|---|---|
| create | PMO/admin, forum chair/secretary, any project manager (for own Project Board) | Copies template blocks/rules, computes inclusions, links `previous_report_id` |
| submit | Editors | Requires overall rating if the scheme requires it; locks structure for reviewers' edits only |
| return | Chair/secretary/PMO | Back to draft with comment (in `report_events`) |
| approve | Forum chair (or delegate, or PMO if forum has `approval_required = false`) | Records approver |
| publish | PMO/secretary | Calls `report-publish` edge function |
| withdraw | PMO/admin | Status only; snapshot retained |

Add `approval_required boolean default true` to `forums`. Ad hoc reports with no forum skip review: draft → published (or just stay as a draft used for viewing/export).

### 10.1 Publish (edge function `report-publish`)

Runs with the service role, inside a transaction:

1. Validate status (`approved`, or `draft` for ad hoc) and caller permission.
2. Re-resolve scope as at `as_at`. Re-evaluate rules, merge overrides, write final `report_inclusions`.
3. For every block instance (report-level once, and per included project for deep-dives), run the block's resolver **server-side**.
4. Insert `report_snapshots` and `report_metric_snapshots` (all projects in scope, not just included ones, so later diffs work).
5. Set `status='published'`, `published_at`, `published_by`. Write `report_events`.
6. Optionally trigger `report-distribute`.

**Resolver sharing:** resolvers must run both in the browser (draft preview) and in the edge function (Deno). To make that possible, the data access in each resolver should be a single Supabase RPC call returning JSON. Shape the data in a shared, dependency-free module (`src/features/reports/blocks/<key>/shape.ts`) that both environments import. If sharing code with Deno is awkward in this repo, put all shaping logic in the SQL RPC and keep TS shaping trivial.

### 10.2 Diffs (`changes_since_last`)

Compare `report_metric_snapshots` for this report vs `previous_report_id`:

- Rating moves (declared and evidenced) per project
- Projects newly entering or leaving the exception list
- Milestone slip changes over 7 days
- Budget forecast movement over a configurable amount
- New risks in the top band; risks closed
- Decisions made; actions closed/overdue

For drafts, diff live metrics against the previous published snapshot.

---

## 11. Exports

**Phase 1 — Print to PDF:** `/print` route with a print stylesheet (A4 landscape, `@page` margins, page breaks at `pageBreakBefore` and before each deep-dive, header with forum/as-at, footer with page number and "Published snapshot / Draft"). The "Download PDF" button opens the print route and calls `window.print()`. Charts must render as SVG for crisp print.

**Phase 3 — Server-side PDF:** an endpoint renders `/print?token=…` in headless Chromium and returns a PDF stored in Supabase Storage (`report-pdfs/<org>/<report>.pdf`), generated at publish and attached to the distribution email. Hosting decision for Chris: a Netlify Function using `@sparticuz/chromium` + `puppeteer-core` (fits the possible Netlify move), or a small container service. Supabase Edge Functions (Deno) are not suitable for headless Chromium. Use a short-lived signed token so the print route can render a published report without a user session.

**Phase 4 (optional) — PPTX:** one slide per section/deep-dive, using `pptxgenjs`.

---

## 12. Distribution (Resend)

Edge function `report-distribute`:

- Recipients: forum members (all roles except `contributor` unless configured), plus partner-org members for shared forums.
- Sender: `ORMO PMO <reports@ormo-pmo.originoverthrow.com>` (same verified domain as invites; add the address if needed).
- Content: forum, meeting date, overall rating, short summary (first 300 chars of the executive summary), counts (e.g. "3 projects by exception, 2 decisions required"), button to view. PDF attached when Phase 3 is available.
- Use an idempotency key `report-<id>-publish` so re-runs don't double-send. Log to `report_events`.
- Read-only viewer seats can open the link. This depends on existing seat logic, so verify that viewers have the `select` access needed via RLS.

Optional reminders (Phase 3): to contributors N days before collection cut-off (reuse the collection function's reminders if they exist), and to approvers when a report enters `in_review`.

---

## 13. Collection function integration

The existing collection function produces highlight reports/status updates per period. Integrate rather than replace:

- `forum_meetings.collection_cycle_id` links a meeting to a collection cycle. Default `as_at` = the cycle's cut-off.
- "Create pack" is disabled (with an explanation) until the cut-off has passed, though PMO can override.
- The `data_quality` block lists projects in scope with no submission for the cycle.
- `highlight_report_summary` and narratives pull from the cycle's submissions.

Document the actual collection model found in the codebase in the mapping note.

---

## 14. Cross-organisation scope (foundation)

Build now:

- `entity_shares` table and the `can_view_entity()` helper used by all report-related RLS.
- Scope resolution includes shared projects/programmes the user can view.
- Partner audience: when the viewer's org ≠ report org, render with `audience='partner'`. Hide blocks where `partnerSafe=false` or where they are listed in `hidden_block_keys`, and show "Hidden from partner organisations" placeholders to internal editors only.
- Default `partnerSafe = false` for `resource_summary` (named people) and `data_quality`. All others default to true.

Defer: UI for creating shares (seed via SQL for testing), partner contributions.

---

## 15. Approvals and gates (foundation)

Build now: tables (§5.5), a simple gate editor on the project page (add gate, add steps with role, approve/reject with comment), and the `approvals_status` and `stage_gates` blocks.

The `required_role` values are free text for now. Later NHS modules (QIA/EqIA, DCB0129/0160, SOC/OBC/FBC) create gates of their own `gate_type`, and they appear in reports with no builder changes.

---

## 16. Record links

`record_links` underpins `dependencies` (if no dependency table exists), `linked_records`, and future BAF links. Build a minimal "Links" panel on project/risk detail pages (add a link to another record by search, choose the link type). If a dependencies table already exists, keep it and add a view that exposes it alongside `record_links`.

---

## 17. NHS extension points (later modules — not built now)

| Future module | Plugs in via |
|---|---|
| CIP / efficiency tracking | New tables + metrics (`cip_plan_vs_actual_pct`, `cip_recurrent_gap`) in a `cip_metrics()` function merged into project metrics; blocks `cip_pipeline`, `cip_plan_vs_actual`, `cip_fye` |
| QIA / EqIA gateways | `approval_gates` with `gate_type in ('qia','eqia')`; assessment form tables; existing `approvals_status` block; metric `qia_overdue` |
| Clinical safety (DCB0129/0160) | Hazard log table using `risk_matrices` (a clinical matrix row); `record_links` hazard↔risk; gates `dcb0129/dcb0160`; blocks `hazard_log`, `safety_case_status` |
| Five Case Model | Business case template + stage gates `soc/obc/fbc`; block `business_case_status` |
| NHS benefit categories | Configurable benefit categories (ensure the benefits model supports category config); `benefits_summary` config filters by category |
| Board Assurance Framework | BAF risk table; `record_links` with `link_type='maps_to_baf'`; block `baf_summary`; `nhs_assurance` rating scheme on committee forums |
| Committee packs | Org templates for Finance & Performance and Quality committees built from the above blocks |

Rule: a new module adds **data, metrics and blocks only**. If a module needs a change to the engine, builder, snapshot or permissions code, treat that as a design defect and raise it.

---

## 18. Phased build plan

Each phase: migrations → engine → UI → tests → docs. Do not start a phase until the previous one meets its acceptance criteria.

### Phase 0 — Discovery (no feature code)
- Produce `docs/report-builder-mapping.md` (see §0).
- Identify which existing components become blocks, and what refactoring that needs (props-in data).
- Confirm how declared/evidenced health, % done, budget variance and milestone slip are computed today, and where.
- **Acceptance:** mapping note reviewed by Chris.

### Phase 1 — Foundations and Project Board pack
- Migrations: `rating_schemes`, `risk_matrices` (+ seeds, with risk score/band functions), `forums`, `forum_members`, `forum_meetings`, `report_templates`, `reports`, `report_inclusions`, `report_narratives`, `report_events`, `decisions` (or extension of the existing table), `approval_gates`, `approval_steps`, `record_links`, `entity_shares`, RLS helpers and policies.
- Block registry + types + error-safe renderer.
- Phase 1 blocks (marked P1 in §6.3), including refactors of the existing project panel components.
- `project_metrics()` with at least: `declared_rating`, `evidenced_rating`, `divergence_days`, `max_milestone_slip_days`, `budget_variance_abs/pct`, `max_risk_score`, `open_decisions_for_forum`, `percent_complete`, `stale_update_days`.
- Builder (report + template modes) with drag and drop, inspector, narratives, autosave.
- Ad hoc reports; "Save as template".
- Project Board system template.
- Viewer + print route + browser print PDF.
- Forums: basic CRUD (members, scope, scheme, default template).
- **Acceptance:**
  - A user can create an ad hoc project report, add/reorder/configure blocks, and print it to a clean multi-page PDF.
  - A user can create a Project Board forum, create a pack from the default template, edit narrative and view it.
  - Changing the org's default risk matrix changes `top_raid` ordering and band labels without code changes.
  - Unknown block key renders a placeholder.
  - RLS tests pass for org isolation.

### Phase 2 — Programme/portfolio packs and exception selection
- Remaining metrics in §7.1; forum tolerances UI with seeded defaults.
- Rule engine + selection panel + inclusion reasons + pin/exclude.
- Deep-dive zone rendering.
- Phase 2 blocks.
- Programme Board and Portfolio/Committee system templates.
- Rating scheme selection per forum, with `nhs_assurance` seeded. Overall rating + rationale on reports.
- Escalation fields on risks/issues; `escalations` block.
- `forum_actions` + `actions_log` block.
- Gate editor + `stage_gates` / `approvals_status` blocks.
- Partner audience rendering (with shares seeded by SQL).
- **Acceptance:**
  - On a programme with mixed projects, defaults auto-include exactly the projects breaching rules, each showing correct reason chips with values vs thresholds.
  - Changing a forum tolerance changes inclusion on "Refresh selection".
  - Pinned and excluded overrides persist and are respected.
  - Switching a forum to `nhs_assurance` re-labels all ratings in its reports.
  - A partner-org viewer sees a shared programme report with partner-unsafe blocks hidden, and cannot see unshared projects (RLS test).
  - Rule engine unit tests cover all operators, tolerance lookup, capping and overrides.

### Phase 3 — Governance workflow, snapshots and distribution
- Lifecycle transitions + `report_events` + review/approve UI.
- `report-publish` edge function, `report_snapshots`, `report_metric_snapshots`, immutability triggers.
- Published viewer reads from snapshots only.
- `changes_since_last` + inline movement markers; `raid_movement`.
- Presentation mode with decision/action capture.
- `report-distribute` via Resend (idempotent).
- Collection cycle linkage (`as_at` default, `data_quality` by cycle).
- Server-side PDF (after hosting decision) stored in Storage and attached to emails.
- **Acceptance:**
  - After publish, editing project data does not change the published report (automated test).
  - Update/delete on snapshots fails.
  - The second published pack for a forum correctly shows the changes since the first.
  - Decisions recorded in presentation mode appear in the decision log with meeting/report links, and in the next pack's `decisions_taken`.
  - Publishing twice does not send duplicate emails.
  - Read-only viewers can open published packs from the email link.

### Phase 4 — Enhancements
- AI executive summary: `report-ai-summary` edge function calling the Anthropic Messages API with the report's metrics/snapshot JSON (no personal data beyond names already in the pack). The model is set via env var `ANTHROPIC_MODEL`. Output is inserted as a narrative with `source='ai_draft'`, clearly badged, and the report cannot be submitted while an un-edited AI draft is unacknowledged.
- Template versioning UI (show which template version a report used; "Update report to latest template").
- Scheduled pack creation when a collection cycle closes (draft only).
- Optional PPTX export.
- `lessons_learned`, `linked_records` blocks.
- **Acceptance:** defined when Phase 4 starts.

---

## 19. Testing

- **Unit (Vitest):** rule engine; diff engine; block config migrations; metric label/units mapping; zod schemas for each block's default config.
- **SQL tests (pgTAP or a SQL test script run in CI against a local Supabase):** `project_metrics()` against fixture data (one fixture per metric); `risk_score`/`risk_band` for both matrices; immutability triggers.
- **RLS tests:** org A cannot read org B's reports, forums or snapshots. Partner sharing exposes only shared entities. Viewers can read published but not draft reports. Only allowed roles can transition statuses.
- **Component tests (Testing Library):** each block renders with fixture data, empty data and error state.
- **E2E (Playwright), Phase 3:** create forum → create pack → select → submit → approve → publish → view as viewer → record decision → second pack shows change.
- **Fixtures:** seed script `supabase/seed/reports_demo.sql` with one portfolio, two programmes, ten projects covering every exception rule, two forums, and one previous published pack. This is also useful for demos and sales.

---

## 20. Non-functional requirements

- Draft preview of a programme pack with up to 30 projects and 10 deep-dives renders in under 3 seconds on warm cache. Publish completes in under 20 seconds.
- All charts are SVG, accessible (titles/aria labels), and not reliant on colour alone. Rating chips always include text labels.
- Dates shown in the org's locale (en-GB default); currency from org settings (GBP default).
- Snapshot payloads under 2 MB per report. If larger, store the overflow in Storage and keep a pointer.
- Audit: every status change, publish, distribution and AI draft is recorded in `report_events`.

---

## 21. Open questions for Chris

1. Who can approve when a forum has no chair set: PMO or nobody (block publish)?
2. Should project managers be able to create their own Project Board packs, or only the PMO?
3. Server-side PDF hosting: Netlify Function or a separate service? (Affects Phase 3.)
4. Do read-only viewers receive packs for every forum they belong to, or only when explicitly added as recipients?
5. Is there an existing lessons-learned register, or should `lessons_learned` wait for one?

---

## 22. Kick-off prompt for Claude Code

> Read `docs/report-builder-spec.md` in full, then `docs/build-plan.md`. Do Phase 0 only: inspect the existing schema, migrations, generated types and the portfolio page components, and write `docs/report-builder-mapping.md` mapping every concept in the spec to existing tables/columns/components or marking it new, plus gaps, risks and any conflicts with current behaviour. Also list the existing components to be refactored into blocks and what that requires. Do not write migrations or feature code yet. When done, summarise the mapping and your proposed Phase 1 migration list for review.
