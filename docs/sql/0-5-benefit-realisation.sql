-- Work package 0.5 (b). Approved 21/10/2026; applied as migration
-- supabase/migrations/20261021154238_0_5_live_project_health_materialise.sql.
--
-- Symptom: GET /rest/v1/v_benefit_realisation returned HTTP 500 (statement timeout, the
-- authenticated role's 8 s limit) on six smoke-test page loads, 21/10/2026.
--
-- Evidence, all read-only, 21/10/2026:
-- 1. The view on its own is not slow. EXPLAIN (ANALYZE, BUFFERS) as the authenticated test
--    user (demo organisation, 27 benefits): 105 ms execution, 113 ms planning, 1,573 buffers.
-- 2. RLS is not evaluated per row. Every policy helper (private.my_workspace_ids and friends)
--    appears as a one-off InitPlan ("workspace_id = ANY ((InitPlan n).col1)"), run once per
--    table; the first costs 36 ms, the rest under 1 ms. private.org_today is STABLE and is
--    called once per benefit row inside the base CTE (27 calls). Every correlated lookup
--    uses an index (benefit_measures_benefit_idx, benefit_reviews_benefit_idx,
--    benefit_projects_benefit_idx, benefit_measure_targets_measure_idx,
--    benefit_measurements_measure_idx). No missing index was found.
-- 3. Under load it varies widely. pg_stat_statements for the PostgREST query: 1,115 calls,
--    mean 413 ms, standard deviation 747 ms, max 5,770 ms among completed calls. It is called
--    on every signed-in page, because the notification bell loads benefits (fixed in the front
--    end by 0.5 (a)).
-- 4. The vpmo-health-refresh-queue failures are not the refresh being slow. Correction,
--    21/10/2026: the five failed runs (12:40:59, 12:41:20, 12:51:56, 12:52:27, 12:55:10) all
--    report "job startup timeout" in cron.job_run_details: pg_cron could not open a database
--    connection within 10 s, so the refresh never ran (47.8 s and ~11 s are waiting time).
--    At 12:41 the cause was connection exhaustion during Supabase platform work: Postgres
--    logged "sorry, too many clients already" and "remaining connection slots are reserved"
--    (max_connections 60) while the management API ran storage and realtime tenant
--    migrations, with only 2 API requests from the app that minute. At 12:51-12:55 it was
--    load from our own e2e run against production (about 1,000 API requests a minute,
--    12:46-12:51). The statement-timeout bursts on this view come from the same two events.
-- 5. Separately, the refresh itself is expensive. Read-only EXPLAIN ANALYZE of
--    select count(*) from private.live_project_health(<demo org>): 2,965 ms and 1,067,253
--    shared buffer hits for 37 projects, on a small instance (shared_buffers 224MB). That
--    cost, not the cron failures, is the reason for this change.
-- 6. docs/sql/health-refresh-materialise.sql (14/10/2026) proposed this fix and was never
--    applied: the live function still joins the three views directly.
--
-- Proposed change: evaluate each of the three health views once per call (materialised CTEs)
-- instead of letting the planner re-evaluate v_project_delivery_health and
-- v_project_divergence for each row of v_project_health.
-- Measured read-only on the demo organisation: 214 ms and 57,152 buffers, down from
-- 2,965 ms and 1,067,253 (about 14 times less work).
-- Parity, measured read-only: the current function and the new query give the same 37 rows,
-- with no row present in only one of them (EXCEPT ALL both ways, every column except
-- computed_at, which is now()).
--
-- Scope: same signature, same columns in the same order, same security definer and
-- search_path; create or replace keeps the existing ACL (postgres only, no execute for
-- public, anon or authenticated), so no grant statements are needed. No table, policy, view
-- or data change. No DELETE, DROP or TRUNCATE.
--
-- Not proposed here: rewriting v_benefit_realisation itself. Its five correlated scans of the
-- pv CTE cost about 0.4 ms each per benefit; with the bell no longer loading it on every
-- page, it runs only on the Benefits pages. Revisit if the Benefits pages stay slow after
-- this change.
--
-- Applied as supabase/migrations/20261021154238_0_5_live_project_health_materialise.sql;
-- no generated types change (private schema).

create or replace function private.live_project_health(p_org uuid)
returns setof public.project_health_current
language sql
stable
security definer
set search_path = ''
as $$
  with h as materialized (
    select * from public.v_project_health where organisation_id = p_org
  ),
  dh as materialized (
    select project_id, milestones_after_baseline_finish
    from public.v_project_delivery_health where organisation_id = p_org
  ),
  d as materialized (
    select * from public.v_project_divergence where organisation_id = p_org
  )
  select h.project_id, h.organisation_id, h.workspace_id, h.programme_id, h.effective_portfolio_id,
    h.code, h.state, h.phase_index,
    h.schedule, h.financial, h.effort, h.issue, h.benefit, h.computed_overall, h.overall,
    h.is_overridden, h.forecast_finish_date, h.forecast_basis, h.benefit_reason, h.finish_slip_health,
    dh.milestones_after_baseline_finish::integer,
    d.declared, d.evidenced, d.divergent, d.divergence_since, d.divergence_days, d.divergence_alert,
    d.divergence_kind, d.justified, d.justification, d.justification_at, d.justification_author_id,
    d.latest_report_id, d.divergent_prev_month_end, d.last_report_date, d.next_report_due,
    d.report_overdue, d.finish_vs_baseline_days, d.risk_score,
    now()
  from h
  join dh on dh.project_id = h.project_id
  left join d on d.project_id = h.project_id;
$$;
