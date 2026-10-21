-- Work package 0.5 (b), approved 21/10/2026. Evidence and parity notes: docs/sql/0-5-benefit-realisation.sql.
-- Evaluates each health view once per call (materialised CTEs). Same signature, columns, security
-- definer and search_path; create or replace keeps the existing ACL (postgres only).

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
