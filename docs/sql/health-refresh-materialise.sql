-- PROPOSAL (not applied): cut the CPU cost of a health refresh (follow-up to Stage 6, 14/10/2026).
--
-- Finding: readers never wait on the refresh. private.refresh_health_current(org) deletes and
-- re-inserts the organisation's rows in one transaction under an advisory lock; plain SELECTs
-- (PostgREST, get_project_overview, get_portfolio_overview) take no row locks, so under MVCC they
-- keep reading the previous rows until it commits. log_lock_waits is on and no lock wait,
-- lock timeout or deadlock has been logged. The cancelled RPC at 12:22:51 was CPU starvation:
-- two page loads (about 100 requests, several live v_* views at 3 to 9 s) saturated the
-- instance, so even the cron worker took 6.6 s to start.
--
-- What this changes: the refresh itself costs about 1.85 s of CPU for the demo organisation,
-- 1.66 s of it in live_project_health, where the planner re-evaluates v_project_delivery_health
-- and v_project_divergence per row of v_project_health (the three views read separately take
-- about 0.46 s). Materialising each view once per call gives the same rows for a fraction of
-- the work. Same signature, same columns, same security; no table, policy or data change.
-- No DELETE, DROP or TRUNCATE here.

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

-- Unchanged grants: create or replace keeps the existing ACL (execute revoked from public,
-- anon and authenticated), so no grant statements are needed.
