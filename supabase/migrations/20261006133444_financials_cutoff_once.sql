-- v_project_financials: compute the cut-off once per organisation (a materialised CTE).
-- Written as a lateral sub-query it was inlined into the monthly-value filters, so the
-- cut-off (and org_today) was recomputed for every value. Same columns and results.
create or replace view public.v_project_financials with (security_invoker = true) as
with cutoffs as materialized (
  -- Once per organisation: inlined, the cut-off was recomputed for every monthly value.
  select o.id as organisation_id,
    coalesce(
      (select max(fp.period_month) from public.financial_periods fp
       where fp.organisation_id = o.id and fp.closed_at is not null),
      (date_trunc('month', private.org_today(o.id)) - interval '1 month')::date) as actuals_through
  from public.organisations o
)
select
  p.id as project_id,
  p.organisation_id,
  p.workspace_id,
  p.programme_id,
  coalesce(p.portfolio_id, pr.portfolio_id) as effective_portfolio_id,
  bl.version is not null as has_baseline,
  coalesce(bl.total, 0)::numeric(14,2) as budget,
  bl.version as baseline_version,
  coalesce(v.budget_phased, 0)::numeric(14,2) as budget_phased,
  (coalesce(bl.total, 0) - coalesce(v.budget_phased, 0))::numeric(14,2) as phasing_gap,
  c.actuals_through,
  coalesce(v.actual_to_date, 0)::numeric(14,2) as actual_to_date,
  coalesce(v.actual_open, 0)::numeric(14,2) as actual_open_months,
  coalesce(v.forecast_remaining, 0)::numeric(14,2) as forecast_remaining,
  (coalesce(v.actual_to_date, 0) + coalesce(v.forecast_remaining, 0))::numeric(14,2) as eac,
  (coalesce(bl.total, 0) - coalesce(v.actual_to_date, 0) - coalesce(v.forecast_remaining, 0))::numeric(14,2) as variance,
  case when bl.total > 0
    then round((coalesce(v.actual_to_date, 0) + coalesce(v.forecast_remaining, 0) - bl.total) / bl.total * 100, 1)
  end as variance_percent,
  ov.first_month is not null as open_month_overrun,
  ov.first_month as overrun_month
from public.projects p
left join public.programmes pr on pr.id = p.programme_id
join cutoffs c on c.organisation_id = p.organisation_id
left join lateral (
  select b.version, b.total from public.budget_baselines b
  where b.project_id = p.id order by b.version desc limit 1
) bl on true
left join lateral (
  select
    sum(fv.amount) filter (where fv.kind = 'budget') as budget_phased,
    sum(fv.amount) filter (where fv.kind = 'actual' and fv.period_month <= c.actuals_through) as actual_to_date,
    sum(fv.amount) filter (where fv.kind = 'actual' and fv.period_month > c.actuals_through) as actual_open,
    sum(fv.amount) filter (where fv.kind = 'forecast' and fv.period_month > c.actuals_through) as forecast_remaining
  from public.financial_values fv where fv.project_id = p.id
) v on true
left join lateral (
  -- An actual in an open month above that line's forecast for the month: EAC may be understated.
  select min(a.period_month) as first_month
  from public.financial_values a
  left join public.financial_values f
    on f.cost_line_id = a.cost_line_id and f.period_month = a.period_month and f.kind = 'forecast'
  where a.project_id = p.id and a.kind = 'actual' and a.period_month > c.actuals_through
    and a.amount > coalesce(f.amount, 0)
) ov on true
where p.archived_at is null;

