-- docs copy of supabase/migrations/20261123200000_nhs_4b_efficiency_summary.sql (NHS-4 part 2). Not applied to production.
-- Nothing destructive: no section for Chris to run by hand. Apply the migration file after 20261123190000.

-- NHS-4 part 2: efficiency / savings programme (CIP) calculations: the year summary the dashboard,
-- the targets screen and (part 4) the report blocks read (docs/nhs-module-plan.md § NHS-4 items 4–5,
-- docs/sql/nhs-4b-efficiency-summary.sql). Written by an unattended run on 23/11/2026: tested on the
-- local Postgres only, NOT applied to production. Apply after 20261123190000_nhs_4_efficiency.
-- Nothing here is destructive: two new functions, no table or policy changes.
--
-- Rules (mirrored by src/data/efficiency.ts; change both together)
-- - Schemes counted: every scheme the caller can see in the organisation (RLS: the function runs as
--   the caller), except rejected ones. On hold schemes still count (their plan is still the plan).
-- - In-year effect: the sum of the financial year's monthly values (recurrent + non-recurrent).
-- - Risk-adjusted: each scheme's planned value × its planning-confidence weight (0 without one).
-- - Forecast outturn, per scheme and month: the actual where one is recorded, else the forecast,
--   else the plan. So the outturn is "actuals to date plus the latest view of the rest".
-- - Full-year effect: the scheme's stored full_year_effect, else its run rate (the last three
--   planned recurrent months × 12, as efficiency_run_rate_fye), for schemes with a plan in the year.
-- - Recurrent carry-forward into the next year: the planned recurrent value of the year's last
--   month × 12 (the exit run rate). The part-year gap is carry-forward − recurrent in-year plan.
-- - Targets: a workspace's target is its whole-workspace target for the year, else the sum of its
--   organisational-unit targets; the organisation's is the sum over workspaces. Unit rows show the
--   unit targets only. Gap = target − the measure (positive = short of target).

-- The four measures per scheme and month of one financial year (helper for the summary).
create function private.efficiency_year_months(p_org uuid, p_year integer, p_workspace uuid default null)
returns table (scheme_id uuid, workspace_id uuid, business_unit text, category text, stage text,
               month date, plan numeric, plan_recurrent numeric, risk_adjusted numeric,
               forecast_outturn numeric, actual numeric, has_actual boolean)
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select private.org_financial_year_start(p_org) as start_month,
           private.efficiency_settings(p_org) -> 'confidenceWeights' as weights
  ), months as (
    select (make_date(p_year, cfg.start_month, 1) + make_interval(months => i))::date as month
    from cfg, generate_series(0, 11) i
  ), schemes as (
    select s.id, s.workspace_id, s.business_unit, s.category, s.stage,
           coalesce((cfg.weights ->> s.confidence)::numeric, 0) as weight
    from public.efficiency_schemes s, cfg
    where s.organisation_id = p_org and s.stage <> 'rejected'
      and (p_workspace is null or s.workspace_id = p_workspace)
  )
  select s.id, s.workspace_id, s.business_unit, s.category, s.stage, m.month,
         coalesce(pl.recurrent + pl.non_recurrent, 0),
         coalesce(pl.recurrent, 0),
         round(coalesce(pl.recurrent + pl.non_recurrent, 0) * s.weight, 2),
         coalesce(ac.recurrent + ac.non_recurrent, fc.recurrent + fc.non_recurrent,
                  pl.recurrent + pl.non_recurrent, 0),
         coalesce(ac.recurrent + ac.non_recurrent, 0),
         ac.id is not null
  from schemes s
  cross join months m
  left join public.efficiency_values pl on pl.scheme_id = s.id and pl.month = m.month and pl.kind = 'plan'
  left join public.efficiency_values fc on fc.scheme_id = s.id and fc.month = m.month and fc.kind = 'forecast'
  left join public.efficiency_values ac on ac.scheme_id = s.id and ac.month = m.month and ac.kind = 'actual';
$$;
revoke execute on function private.efficiency_year_months(uuid, integer, uuid) from public, anon;
grant execute on function private.efficiency_year_months(uuid, integer, uuid) to authenticated, service_role;

-- The year summary: totals, months (with cumulative values), by organisational unit (with targets),
-- by category and by stage. Runs as the caller, so it only counts what they can see; an outsider
-- gets null. p_year is the calendar year the financial year starts in (null = the current one).
create function public.efficiency_summary(p_org uuid, p_year integer default null, p_workspace uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start integer := private.org_financial_year_start(p_org);
  v_year integer := coalesce(p_year, private.financial_year_of(current_date, v_start));
  v_last date := (make_date(v_year, v_start, 1) + interval '11 months')::date;
  v_result jsonb;
begin
  -- Not a member: nothing (not even the organisation's financial year start).
  if not private.is_org_member(p_org) then
    return null;
  end if;
  if v_year not between 2000 and 2100 then
    raise exception 'Choose a financial year between 2000 and 2100.' using errcode = '22023';
  end if;

  with ym as (
    select * from private.efficiency_year_months(p_org, v_year, p_workspace)
  ), per_scheme as (
    select ym.scheme_id, ym.workspace_id, ym.business_unit, ym.category, ym.stage,
           sum(ym.plan) as plan, sum(ym.plan_recurrent) as plan_recurrent,
           sum(ym.risk_adjusted) as risk_adjusted, sum(ym.forecast_outturn) as forecast_outturn,
           sum(ym.actual) as actual,
           sum(ym.plan_recurrent) filter (where ym.month = v_last) * 12 as carry_forward
    from ym group by 1, 2, 3, 4, 5
  ), fye as (
    select ps.scheme_id,
           case when ps.plan = 0 and ps.forecast_outturn = 0 then 0
                else coalesce(s.full_year_effect, public.efficiency_run_rate_fye(ps.scheme_id), 0) end as fye
    from per_scheme ps join public.efficiency_schemes s on s.id = ps.scheme_id
  ), targets as (
    select t.workspace_id, t.business_unit, t.amount
    from public.efficiency_targets t
    where t.organisation_id = p_org and t.financial_year = v_year
      and (p_workspace is null or t.workspace_id = p_workspace)
  ), ws_target as (
    select w.workspace_id,
           coalesce(max(w.amount) filter (where w.business_unit is null),
                    sum(w.amount) filter (where w.business_unit is not null)) as amount
    from targets w group by w.workspace_id
  ), month_rows as (
    select ym.month, sum(ym.plan) as plan, sum(ym.risk_adjusted) as risk_adjusted,
           sum(ym.forecast_outturn) as forecast_outturn, sum(ym.actual) as actual,
           bool_or(ym.has_actual) as has_actual
    from ym group by ym.month
  ), units as (
    select coalesce(ps.business_unit, t.business_unit) as unit
    from per_scheme ps full join (select distinct business_unit from targets where business_unit is not null) t
      on t.business_unit = ps.business_unit
    group by 1
  )
  select jsonb_build_object(
    'year', v_year,
    'startMonth', v_start,
    'totals', jsonb_build_object(
      'schemes', (select count(*) from per_scheme),
      'target', (select sum(amount) from ws_target),
      'plan', coalesce((select sum(plan) from per_scheme), 0),
      'planRecurrent', coalesce((select sum(plan_recurrent) from per_scheme), 0),
      'riskAdjusted', coalesce((select sum(risk_adjusted) from per_scheme), 0),
      'forecastOutturn', coalesce((select sum(forecast_outturn) from per_scheme), 0),
      'actual', coalesce((select sum(actual) from per_scheme), 0),
      'fullYearEffect', coalesce((select sum(fye) from fye), 0),
      'carryForward', coalesce((select sum(carry_forward) from per_scheme), 0)),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'month', mc.month, 'plan', mc.plan, 'riskAdjusted', mc.risk_adjusted,
               'forecastOutturn', mc.forecast_outturn, 'actual', mc.actual, 'hasActual', mc.has_actual,
               'cumPlan', mc.cum_plan, 'cumRiskAdjusted', mc.cum_risk_adjusted,
               'cumForecastOutturn', mc.cum_forecast_outturn, 'cumActual', mc.cum_actual)
             order by mc.month)
      from (select mr.*, sum(mr.plan) over w as cum_plan, sum(mr.risk_adjusted) over w as cum_risk_adjusted,
                   sum(mr.forecast_outturn) over w as cum_forecast_outturn, sum(mr.actual) over w as cum_actual
            from (select gm.month, coalesce(r.plan, 0) as plan, coalesce(r.risk_adjusted, 0) as risk_adjusted,
                         coalesce(r.forecast_outturn, 0) as forecast_outturn, coalesce(r.actual, 0) as actual,
                         coalesce(r.has_actual, false) as has_actual
                  from (select (make_date(v_year, v_start, 1) + make_interval(months => i))::date as month
                        from generate_series(0, 11) i) gm
                  left join month_rows r on r.month = gm.month) mr
            window w as (order by mr.month)) mc), '[]'::jsonb),
    'byUnit', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', u.unit,
               'schemes', (select count(*) from per_scheme ps where ps.business_unit is not distinct from u.unit),
               'target', (select sum(t.amount) from targets t where t.business_unit = u.unit),
               'plan', coalesce((select sum(plan) from per_scheme ps where ps.business_unit is not distinct from u.unit), 0),
               'riskAdjusted', coalesce((select sum(risk_adjusted) from per_scheme ps where ps.business_unit is not distinct from u.unit), 0),
               'forecastOutturn', coalesce((select sum(forecast_outturn) from per_scheme ps where ps.business_unit is not distinct from u.unit), 0),
               'actual', coalesce((select sum(actual) from per_scheme ps where ps.business_unit is not distinct from u.unit), 0))
             order by u.unit nulls last)
      from units u), '[]'::jsonb),
    'byCategory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', c.category, 'schemes', c.schemes, 'plan', c.plan, 'planRecurrent', c.plan_recurrent,
               'riskAdjusted', c.risk_adjusted, 'forecastOutturn', c.forecast_outturn, 'actual', c.actual)
             order by c.category nulls last)
      from (select ps.category, count(*) schemes, sum(plan) plan, sum(plan_recurrent) plan_recurrent,
                   sum(risk_adjusted) risk_adjusted, sum(forecast_outturn) forecast_outturn, sum(actual) actual
            from per_scheme ps group by ps.category) c), '[]'::jsonb),
    'byStage', coalesce((
      select jsonb_agg(jsonb_build_object('stage', st.stage, 'schemes', st.schemes, 'plan', st.plan,
                                          'riskAdjusted', st.risk_adjusted)
             order by private.efficiency_stage_rank(st.stage) = 0, private.efficiency_stage_rank(st.stage), st.stage)
      from (select ps.stage, count(*) schemes, sum(plan) plan, sum(risk_adjusted) risk_adjusted
            from per_scheme ps group by ps.stage) st), '[]'::jsonb))
  into v_result;
  return v_result;
end;
$$;
revoke execute on function public.efficiency_summary(uuid, integer, uuid) from public, anon;
grant execute on function public.efficiency_summary(uuid, integer, uuid) to authenticated;
