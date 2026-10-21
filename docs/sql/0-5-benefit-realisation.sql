-- Work package 0.5 (b). PROPOSAL, not applied. Stop for approval.
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
-- 4. The timeouts coincide with the health-refresh queue, not with the view. Postgres logged
--    "canceling statement due to statement timeout" in bursts: about 20 within one second at
--    12:41:57, and more at 12:52 and 12:55. cron.job_run_details for vpmo-health-refresh-queue
--    shows runs of 47.8 s (12:41:20), 11.1 s, 12.0 s, 11.5 s and 10.4 s (12:55:10) at exactly
--    those times, all status "failed". A normal run takes 1 to 3 s.
-- 5. The refresh is CPU-bound in private.live_project_health. Read-only EXPLAIN ANALYZE of
--    select count(*) from private.live_project_health(<demo org>): 2,965 ms and 1,067,253
--    shared buffer hits for 37 projects. log_lock_waits records no lock waits, and plain
--    SELECTs take no row locks, so readers are not blocked: they are starved of CPU. The
--    instance is small (max_connections 60, shared_buffers 224MB), so one refresh saturates
--    it and the heaviest live page query, this view, is the one that crosses 8 s.
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
-- After approval this becomes a new migration (supabase/migrations/<timestamp>_0_5_live_project_health_materialise.sql);
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
