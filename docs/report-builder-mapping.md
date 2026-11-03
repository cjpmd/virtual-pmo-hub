# Report builder — mapping note (Phase 0)

Spec: `docs/report-builder-spec.md`. Decisions: `docs/report-builder-decisions.md` (referenced
below as RB-n). Baseline: `main` at `14285e6`, 77 migrations, every one applied cleanly to a
local Postgres 16 (`supabase/tests/local/run.sh`).

Stack found: React 19 + Vite 8 + TanStack Start/Router (file routes in `src/routes`), Tailwind 4,
shadcn/ui (`src/components/ui`), TanStack Query, Supabase JS, zod 3, Vitest 5, Playwright. Data
access only through `src/services` (AGENTS.md), hooks in `src/hooks`, mutations through
`services/write.ts` (`updated_at` optimistic concurrency), health read from stored tables /
`v_*` views, never computed in the browser.

## 1. Concept → existing schema

| Spec concept | Existing | Action |
|---|---|---|
| `org_id` | `organisation_id` everywhere, plus `workspace_id` | Use `organisation_id`; report tables also get `workspace_id` (nullable, like `forums`: null = organisation-wide). RB-4 |
| users / memberships | `profiles`, `organisation_members` (`app_role` viewer < contributor < manager < pmo < admin), `workspace_members`, `resources` (people, `profile_id` link) | Reuse. "PMO/admin" = `app_role >= pmo` in the workspace (`private.my_workspace_ids('pmo')`) |
| RLS helpers `is_org_member` | `private.is_org_member`, `private.my_org_ids()`, `private.my_workspace_ids(min_role)`, `private.has_org_role` | Reuse; add `private.can_view_entity`, `private.forum_role_of`, `private.can_edit_report`, `private.can_view_report` |
| `rating_schemes` | none (health enum `not_set/green/amber/red` is the RAG) | **New**, organisation-scoped config (RB-14). Each level carries `rag` mapping (§8) |
| `risk_matrices` | `organisations.settings.risk` (5×5 labels, bands Low ≥1 / Elevated ≥8 / Critical ≥15); `risks.probability`, `risks.impact` (1–5), stored `risks.score` | **New** table; system default seeded from the app's current settings; `risks.risk_matrix_id` added; `risk_score()` / `risk_band()` functions. The org settings bands keep driving health (RB-13) |
| `forums` | `forums` (organisation or workspace level; `level` project/programme/portfolio/organisation; `chair_resource_id`; `cadence`; `papers_deadline_days`; `active`) + `v_forums` | **Extend**: `forum_type`, `description`, `scope_type`, `scope_entity_id`, `rating_scheme_id`, `tolerances`, `default_template_id`, `parent_forum_id`, `approval_required`, `archived_at` (RB-5) |
| `forum_scope_items` | none | **New** |
| `forum_members` (user, role) | `forum_members` (forum, **resource**) | **Extend** with `role` (`forum_role` enum). Members are resources; the auth user is `resources.profile_id`. Chair stays `forums.chair_resource_id` (RB-5) |
| `forum_meetings` | `meetings` (+ `v_meetings`), status planned/held/cancelled, `papers_deadline` | **Reuse** `meetings`. `forum_meetings.collection_cycle_id` → no cycle table exists; cut-off = `meetings.papers_deadline` (RB-6) |
| `report_templates`, `reports`, `report_inclusions`, `report_narratives`, `report_snapshots`, `report_metric_snapshots`, `report_events` | `committee_packs` (funding-collection pack, JSON snapshot on issue) is a different, collection-specific feature | **New** tables. `committee_packs` left untouched (RB-9) |
| `decisions` | `decisions` (+ `decision_options`, `decision_events`, `decision_actions`, links, `v_decisions`, `record_decision` RPC): `forum_id` = forum asked, `target_meeting_id`, `needed_by_date`, `decision_date`, `chosen_option_id`, `rationale`, status pending/made/… | **Extend**: `report_id`, `decided_meeting_id`. Mapping: requested_of_forum_id → `forum_id`; decision_due → `needed_by_date`; options → `decision_options`; outcome → chosen option + `rationale`; decided_at → `decision_date` / `recorded_at`; status open → `pending`, decided → `made` (RB-7) |
| `forum_actions` | `decision_actions` (always belong to a decision), `improvement_actions` (lessons) | **New** `forum_actions` for meeting actions not tied to a decision (RB-8) |
| escalations | none | **Extend** `risks`, `issues` with `escalated_to_forum_id`, `escalated_at`; decisions use `forum_id` |
| `approval_gates`, `approval_steps` | stage gates are `milestones` (type `gate`) + `gate_criteria` + `gate_checklist_ticks` + `v_project_gates` | **New** generic tables; the `stage_gates` block shows both (RB-10) |
| `record_links` | `dependencies` (+ `v_dependency_health`, link tables) | **New** `record_links`; view `v_record_links` unions `dependencies` as `depends_on` |
| `entity_shares` | none | **New** |
| collection function | Status (highlight) reports: `status_reports` per project, `projects.reporting_cadence`, `submit_status_report` / `save_status_report_draft`, evidenced columns captured at submission. (`collections` are funding pots, not cycles) | Reuse; "cycle" = window between the forum's previous meeting cut-off and this one (RB-6) |
| lessons | `lessons` register exists | `lessons_learned` block is built (§21 q5) |

## 2. Metrics → where they come from today

| Metric | Source |
|---|---|
| `declared_rating` | latest submitted `status_reports.overall` with `reporting_date <= as_at` (`project_health_current.declared` when as-at is today) |
| `evidenced_rating` | `project_health_current.evidenced` / `overall` (stored copy of `v_project_health`, refreshed by queue); for a past as-at, the last `health_snapshots.overall` on or before it |
| `rating_rank_delta`, `divergence_days` | `project_health_current.divergence_days` (`v_project_divergence`) |
| `rating_worsened` | evidenced vs the previous published report's `report_metric_snapshots` (Phase 3); before that vs the health snapshot a month earlier |
| `dimension_red_count` | `project_health_current` schedule/financial/effort/issue/benefit |
| `max_milestone_slip_days`, `slipped_milestones` | `v_milestones.slip_days` (forecast − baseline, open milestones) |
| `budget_variance_abs/pct` | `v_project_financials.variance`, `variance_percent` (EAC − budget) |
| `budget_change_period` | `financial_forecast_history` (month-end EAC) |
| `max_risk_score`, `risks_in_top_band` | `risks` via `risk_score()` / `risk_band()` (new) |
| `open_issues_high` | `issues.severity = 'high'` and open |
| `open_decisions_for_forum` | `decisions.forum_id = forum` and `status = 'pending'` |
| `escalations_for_forum` | new escalation columns |
| `open_change_requests` | `change_requests.status = 'proposed'` |
| `days_to_next_gate` | `v_project_gates` (not passed) and `approval_gates` (stage_gate, pending) |
| `at_risk_dependencies` | `v_dependency_health.health in ('amber','red')` |
| `benefits_rating` | `project_health_current.benefit` |
| `stale_update_days` | `as_at − project_health_current.last_report_date` |
| `percent_complete` | `v_project_task_stats.avg_percent_complete` |

## 3. Existing components → blocks

The project-panel components already take data through props: they are fed by
`get_project_overview(p_project)` (one RPC, `services/project-overview.ts`) and used on the
project page and in the portfolio "Projects by programme" expanded row
(`components/overview/project-row-panel.tsx`). No fetch-inside refactor is needed; the blocks
reuse them by passing data in.

| Block | Component | Work |
|---|---|---|
| `health_by_dimension` | `overview/health-by-dimension.tsx` (`HealthByDimension scope="project"`) | Feed `healthMonths` from the block RPC (same shape as `get_project_overview`) |
| `milestone_slippage` | `overview/milestone-slippage.tsx` | Same; the report block also needs a print-friendly table, so it gets its own compact renderer using the same slip bands |
| `highlight_report_summary` | `overview/project-work-panels.tsx` `HighlightReport` | Pass the latest report (≤ as-at) |
| `top_raid` | `project-work-panels.tsx` `TopRisks` | Ranking moves to SQL (`risk_score`/`risk_band` by the configured matrix) so it follows the org default matrix |
| `project_summary` | `project-header.tsx` `Chip`/`Fact`/`Lifecycle` | Small renderer over SQL facts |
| `project_status_grid` | `overview/project-watchlist.tsx` (`HealthMark`, declared/evidenced) | Table renderer grouped by programme using `HealthMark`-style chips with the scheme's labels |

Print uses the same renderers in a light A4-landscape stylesheet (as committee packs do).

## 4. Gaps and conflicts

- **No as-at history for most data.** Health is stored "current"; only `health_snapshots`
  (nightly), `status_reports`, `milestone_forecast_history` and `financial_forecast_history` are
  dated. Drafts therefore show current data labelled with the as-at date; published packs freeze
  it (RB-11).
- **Forum members are resources, not auth users.** Distribution and viewer access go through
  `resources.profile_id` (members without a profile can't open packs; they are listed as
  "no account" in the distribution log).
- **No rich-text editor in the repo.** Narratives are Markdown (`lib/markdown.tsx` already
  renders it), stored as `{format:"markdown", text}` in `report_narratives.body` (RB-17).
- **No sprint data in the database** (build plan Phase 3 not done): `burnup_forecast` uses
  work-item completion (`v_work_items.done_at`, story points when set) rather than sprints
  (RB-22).
- **Types.** No hosted dev branch is configured (`.env.local` absent), so types are generated
  from the local database with postgres-meta (`supabase/tests/local/gen-types.sh`); output
  matches the committed file apart from line wrapping (RB-2).
- **Edge functions vs shared shaping.** All block shaping lives in SQL, so drafts (browser RPC)
  and publish (one `publish_report` transaction) use the same code (RB-10).
- **Existing Boards route.** AGENTS.md: forum details share `/governance/forum`; forum report
  settings and packs are added there instead of new `/governance/forums/:id` routes (RB-18).
- `supabase/migrations/20261012120035_health_current_b.sql` has a stray line 7 (known since
  1.6); the local runner comments it out in a temporary copy.

## 5. Phase 1 migration list (as built)

1. `…_rb1_report_builder_foundations.sql`: `rating_schemes`, `risk_matrices` (+ seeds),
   `risks.risk_matrix_id`, `risk_score()`, `risk_band()`; forum extensions, `forum_role`,
   `forum_scope_items`; `report_templates`, `reports`, `report_inclusions`,
   `report_narratives`, `report_events`; `decisions.report_id` / `decided_meeting_id`;
   `approval_gates`, `approval_steps`, `record_links`, `v_record_links`, `entity_shares`;
   RLS helpers and policies; `project_metrics()`; `report_block_data()` and the Phase 1 block
   functions; system Project Board template.
2. Phase 2: remaining metrics, escalation columns, `forum_actions`, Phase 2 blocks and
   templates, `nhs_assurance`.
3. Phase 3: `report_snapshots`, `report_metric_snapshots`, immutability triggers, lifecycle
   RPCs, `publish_report`, diffs.
4. Phase 4: AI narrative support, template versioning, scheduled packs.
