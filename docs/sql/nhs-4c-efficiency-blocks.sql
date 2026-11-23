-- docs copy of supabase/migrations/20261123220000_nhs_4c_efficiency_blocks.sql (NHS-4 part 4). Not applied to production.
-- Nothing destructive: no section for Chris to run by hand. Apply the migration file after 20261123200000.

-- NHS-4 part 4: efficiency / savings programme (CIP) report blocks and two committee templates
-- (docs/nhs-module-plan.md § NHS-4 item 9, docs/sql/nhs-4c-efficiency-blocks.sql). Written by an
-- unattended run on 23/11/2026: tested on the local Postgres only, NOT applied to production.
-- Apply after 20261123200000_nhs_4b_efficiency_summary. Nothing here is destructive: new functions,
-- two new system report templates (inserted only when missing), and two functions replaced:
--   public.efficiency_summary (same signature and result; its body moves to
--   private.efficiency_year_summary so the report blocks share it) and
--   private.partner_unsafe_blocks (NHS-3 part 3 list plus the four blocks; lane B also replaces this
--   function, so NHS-8 reconciles it).
--
-- Design
-- - Blocks follow the report builder's contract (RB-10): private.rb_<key>(ctx, cfg) shapes the data,
--   the renderer only draws it. report_block_data runs them as the caller (RLS on the efficiency
--   tables applies); publish_report runs them as the owner, so every read is filtered by
--   ctx.organisation_id.
-- - The efficiency programme is organisation-wide, like the BAF, so the blocks ignore the report's
--   project scope. Config whole_organisation (default true); false limits them to the report's
--   workspace (ctx.workspace_id; the whole organisation when the report has none).
-- - The financial year is the one containing the report's as-at date, in the organisation's year
--   start; "to date" means the months before the as-at month. A published pack keeps its figures.
-- - Sample schemes count (they make a demo pack look alive) and are marked in the scheme lists.
-- - Blocks (owned by the 'efficiency' module in src/lib/modules.ts, partner-unsafe):
--   * efficiency_summary: target, plan, risk-adjusted, forecast outturn and actual for the year with
--     the gap to target for each, plan and actual to date, and the cumulative months.
--   * efficiency_breakdown: the same measures by organisational unit (with unit targets and gaps),
--     by category or by stage (config group_by, default 'unit').
--   * efficiency_schemes_at_risk: schemes off track, largest shortfall first (config limit,
--     tolerance_pct). Reasons: forecast outturn below plan by more than the tolerance; actual to
--     date below plan to date by more than the tolerance (schemes in delivery or delivered); in or
--     past delivery without an approved impact assessment while assessments are required and the
--     impact_assessment module is on; on hold with planned value this year.
--   * efficiency_recurrent: recurrent and non-recurrent plan, forecast outturn and actual, the
--     recurrent share, full-year effect and carry-forward, by category.
--   "Gap to target" (plan item 9) is part of efficiency_summary and efficiency_breakdown rather than
--   a block of its own.
-- - Templates: the NHS-1 Finance & Performance and Trust Board templates are not changed. A template
--   is hidden while any of its blocks belongs to a module that is off, so adding these blocks to them
--   would hide them from organisations with board assurance but no efficiency programme (the NHS-3
--   decision). Instead two new system templates: "Finance & Performance Committee with efficiency
--   programme" (the F&P blocks plus the efficiency blocks; shown when assurance and efficiency are
--   both on) and "Efficiency programme report" (efficiency blocks only; shown with efficiency on).

-- ---------------------------------------------------------------------------------------------
-- 1. The year summary, shared by the screens and the blocks
-- ---------------------------------------------------------------------------------------------

-- Body of public.efficiency_summary (20261123200000) without the membership check. Invoker: RLS
-- applies to callers; the owner (publish_report) sees the organisation's schemes.
create function private.efficiency_year_summary(p_org uuid, p_year integer default null, p_workspace uuid default null)
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
revoke execute on function private.efficiency_year_summary(uuid, integer, uuid) from public, anon;
grant execute on function private.efficiency_year_summary(uuid, integer, uuid) to authenticated, service_role;

-- Same signature and result as before: members get the summary, outsiders null.
create or replace function public.efficiency_summary(p_org uuid, p_year integer default null, p_workspace uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  -- Not a member: nothing (not even the organisation's financial year start).
  if not private.is_org_member(p_org) then
    return null;
  end if;
  return private.efficiency_year_summary(p_org, p_year, p_workspace);
end;
$$;
revoke execute on function public.efficiency_summary(uuid, integer, uuid) from public, anon;
grant execute on function public.efficiency_summary(uuid, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Report blocks
-- ---------------------------------------------------------------------------------------------

-- The organisation, workspace filter, financial year and as-at month a block reports on; no row
-- for a caller outside the organisation, so every block returns nothing.
create function private.rb_efficiency_frame(ctx jsonb, cfg jsonb)
returns table (org uuid, workspace uuid, year integer, start_month integer, as_at_month date)
language sql
stable
set search_path = ''
as $$
  select o.org,
         case when coalesce((cfg ->> 'whole_organisation')::boolean, true) then null
              else nullif(ctx ->> 'workspace_id', '')::uuid end,
         private.financial_year_of((ctx ->> 'as_at')::date, private.org_financial_year_start(o.org)),
         private.org_financial_year_start(o.org),
         date_trunc('month', (ctx ->> 'as_at')::date)::date
  from (select nullif(ctx ->> 'organisation_id', '')::uuid as org) o
  -- A preview for another organisation gets nothing (not even its year start); system callers
  -- with no signed-in user (service role) are let through.
  where private.is_org_member(o.org) or auth.uid() is null;
$$;

-- A label from one of the organisation's lists, else the stored value.
create function private.rb_list_label(p_org uuid, p_list text, p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select l.label from public.lookup_values l
                   where l.organisation_id = p_org and l.list_key = p_list and l.value = p_value), p_value);
$$;

-- efficiency_summary: the year's totals with the gap to target, to date, and the cumulative months.
-- Config: whole_organisation (default true), show_months (default true).
create function private.rb_efficiency_summary(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with f as (select * from private.rb_efficiency_frame(ctx, cfg)),
  s as (select f.*, private.efficiency_year_summary(f.org, f.year, f.workspace) as d from f),
  t as (select s.d -> 'totals' as tot, (s.d -> 'totals' ->> 'target')::numeric as target from s),
  td as (
    select coalesce(sum((m ->> 'plan')::numeric), 0) as plan, coalesce(sum((m ->> 'actual')::numeric), 0) as actual,
           count(*) filter (where (m ->> 'hasActual')::boolean) as months_reported, count(*) as months
    from s, jsonb_array_elements(s.d -> 'months') m
    where (m ->> 'month')::date < s.as_at_month
  )
  select jsonb_build_object(
    'year', s.year, 'start_month', s.start_month, 'currency', ctx ->> 'currency',
    'whole_organisation', s.workspace is null,
    'schemes', (t.tot ->> 'schemes')::integer,
    'target', t.target,
    'plan', (t.tot ->> 'plan')::numeric,
    'plan_recurrent', (t.tot ->> 'planRecurrent')::numeric,
    'risk_adjusted', (t.tot ->> 'riskAdjusted')::numeric,
    'forecast_outturn', (t.tot ->> 'forecastOutturn')::numeric,
    'actual', (t.tot ->> 'actual')::numeric,
    'full_year_effect', (t.tot ->> 'fullYearEffect')::numeric,
    'carry_forward', (t.tot ->> 'carryForward')::numeric,
    'gap', case when t.target is null then null else jsonb_build_object(
      'plan', t.target - (t.tot ->> 'plan')::numeric,
      'risk_adjusted', t.target - (t.tot ->> 'riskAdjusted')::numeric,
      'forecast_outturn', t.target - (t.tot ->> 'forecastOutturn')::numeric) end,
    'to_date', jsonb_build_object('months', td.months, 'months_reported', td.months_reported,
      'plan', td.plan, 'actual', td.actual, 'variance', td.actual - td.plan),
    'months', case when coalesce((cfg ->> 'show_months')::boolean, true) then coalesce((
      select jsonb_agg(jsonb_build_object('month', m ->> 'month', 'plan', (m ->> 'plan')::numeric,
               'actual', (m ->> 'actual')::numeric, 'has_actual', (m ->> 'hasActual')::boolean,
               'cum_plan', (m ->> 'cumPlan')::numeric, 'cum_risk_adjusted', (m ->> 'cumRiskAdjusted')::numeric,
               'cum_forecast_outturn', (m ->> 'cumForecastOutturn')::numeric, 'cum_actual', (m ->> 'cumActual')::numeric)
             order by m ->> 'month')
      from jsonb_array_elements(s.d -> 'months') m), '[]'::jsonb) else '[]'::jsonb end)
  from s, t, td;
$$;

-- efficiency_breakdown: plan, risk-adjusted, forecast outturn and actual by organisational unit
-- (with unit targets and gaps), category or stage. Config: group_by ('unit' | 'category' |
-- 'stage', default 'unit'), whole_organisation (default true).
create function private.rb_efficiency_breakdown(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with f as (select * from private.rb_efficiency_frame(ctx, cfg)),
  s as (select f.*, private.efficiency_year_summary(f.org, f.year, f.workspace) as d,
               case when cfg ->> 'group_by' in ('category', 'stage') then cfg ->> 'group_by' else 'unit' end as g
        from f),
  r as (
    select s.g, x.value as row,
           case s.g when 'stage' then x.value ->> 'stage' else x.value ->> 'key' end as key
    from s, jsonb_array_elements(case s.g when 'category' then s.d -> 'byCategory' when 'stage' then s.d -> 'byStage'
                                          else s.d -> 'byUnit' end) x
  )
  select jsonb_build_object(
    'year', s.year, 'start_month', s.start_month, 'currency', ctx ->> 'currency', 'group_by', s.g,
    'whole_organisation', s.workspace is null,
    'target', (s.d -> 'totals' ->> 'target')::numeric,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'key', r.key,
        'label', case r.g when 'unit' then private.rb_list_label(s.org, 'business_unit', r.key)
                          when 'category' then private.rb_list_label(s.org, 'efficiency_category', r.key)
                          else r.key end,
        'schemes', (r.row ->> 'schemes')::integer,
        'target', (r.row ->> 'target')::numeric,
        'plan', coalesce((r.row ->> 'plan')::numeric, 0),
        'risk_adjusted', coalesce((r.row ->> 'riskAdjusted')::numeric, 0),
        'forecast_outturn', (r.row ->> 'forecastOutturn')::numeric,
        'actual', (r.row ->> 'actual')::numeric,
        'gap_plan', (r.row ->> 'target')::numeric - coalesce((r.row ->> 'plan')::numeric, 0),
        'gap_forecast', (r.row ->> 'target')::numeric - (r.row ->> 'forecastOutturn')::numeric)
      order by r.ord)
      from (select r.*, row_number() over () as ord from r) r), '[]'::jsonb))
  from s;
$$;

-- efficiency_schemes_at_risk: schemes off track this year, largest shortfall first. Config: limit
-- (default 15), tolerance_pct (default 10), whole_organisation (default true).
create function private.rb_efficiency_schemes_at_risk(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with f as (select * from private.rb_efficiency_frame(ctx, cfg)),
  tol as (select least(greatest(coalesce((cfg ->> 'tolerance_pct')::numeric, 10), 0), 100) / 100.0 as t),
  need_ia as (
    select coalesce((private.efficiency_settings(f.org) ->> 'requireAssessment')::boolean, true)
           and private.module_enabled(f.org, 'impact_assessment') as on_ from f
  ),
  per as (
    select ym.scheme_id,
           sum(ym.plan) as plan, sum(ym.forecast_outturn) as outturn,
           sum(ym.plan) filter (where ym.month < f.as_at_month) as plan_td,
           sum(ym.actual) filter (where ym.month < f.as_at_month) as actual_td,
           bool_or(ym.has_actual and ym.month < f.as_at_month) as reported
    from f, private.efficiency_year_months(f.org, f.year, f.workspace) ym
    group by ym.scheme_id
  ),
  flagged as (
    select s.id, s.ref, s.title, s.stage, s.business_unit, s.category, s.is_sample,
           ex.name as lead, per.plan, per.outturn, coalesce(per.plan_td, 0) as plan_td, coalesce(per.actual_td, 0) as actual_td,
           a.status as assessment_status,
           array_remove(array[
             case when per.plan > 0 and per.outturn < per.plan * (1 - tol.t) then 'forecast_below_plan' end,
             case when s.stage in ('in_delivery', 'delivered') and coalesce(per.plan_td, 0) > 0 and per.reported
                       and coalesce(per.actual_td, 0) < per.plan_td * (1 - tol.t) then 'actual_below_plan' end,
             case when need_ia.on_ and s.stage in ('in_delivery', 'delivered') and not s.is_sample
                       and a.status is distinct from 'approved' then 'assessment_not_approved' end,
             case when s.stage = 'on_hold' and per.plan > 0 then 'on_hold' end], null) as reasons
    from f
    cross join tol
    cross join need_ia
    join public.efficiency_schemes s on s.organisation_id = f.org and s.stage <> 'rejected'
      and (f.workspace is null or s.workspace_id = f.workspace)
    join per on per.scheme_id = s.id
    left join public.impact_assessments a on a.entity_type = 'efficiency_scheme' and a.entity_id = s.id
    left join public.resources ex on ex.id = coalesce(s.scheme_lead_id, s.executive_lead_id)
  ),
  hits as (select * from flagged where cardinality(reasons) > 0)
  select jsonb_build_object(
    'year', f.year, 'start_month', f.start_month, 'currency', ctx ->> 'currency',
    'tolerance_pct', (select round(t * 100, 1) from tol),
    'whole_organisation', f.workspace is null,
    'count', (select count(*) from hits),
    'shortfall', coalesce((select sum(greatest(plan - outturn, 0)) from hits), 0),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'ref', h.ref, 'title', h.title,
        'stage', h.stage, 'lead', h.lead,
        'unit', private.rb_list_label(f.org, 'business_unit', h.business_unit),
        'category', private.rb_list_label(f.org, 'efficiency_category', h.category),
        'plan', h.plan, 'forecast_outturn', h.outturn, 'shortfall', h.plan - h.outturn,
        'plan_to_date', h.plan_td, 'actual_to_date', h.actual_td,
        'assessment_status', h.assessment_status, 'reasons', to_jsonb(h.reasons), 'is_sample', h.is_sample)
      order by h.plan - h.outturn desc, h.ref)
      from (select * from hits order by plan - outturn desc, ref
            limit least(greatest(coalesce((cfg ->> 'limit')::integer, 15), 1), 50)) h), '[]'::jsonb))
  from f;
$$;

-- efficiency_recurrent: recurrent and non-recurrent plan, forecast outturn and actual, with the
-- full-year effect and carry-forward, by category. Config: whole_organisation (default true).
create function private.rb_efficiency_recurrent(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with f as (select * from private.rb_efficiency_frame(ctx, cfg)),
  months as (select (make_date(f.year, f.start_month, 1) + make_interval(months => i))::date as month
             from f, generate_series(0, 11) i),
  schemes as (
    select s.id, s.category from f
    join public.efficiency_schemes s on s.organisation_id = f.org and s.stage <> 'rejected'
      and (f.workspace is null or s.workspace_id = f.workspace)
  ),
  cells as (
    select sc.category,
           coalesce(pl.recurrent, 0) as plan_r, coalesce(pl.non_recurrent, 0) as plan_n,
           coalesce(ac.recurrent, fc.recurrent, pl.recurrent, 0) as out_r,
           coalesce(ac.non_recurrent, fc.non_recurrent, pl.non_recurrent, 0) as out_n,
           coalesce(ac.recurrent, 0) as act_r, coalesce(ac.non_recurrent, 0) as act_n
    from schemes sc cross join months m
    left join public.efficiency_values pl on pl.scheme_id = sc.id and pl.month = m.month and pl.kind = 'plan'
    left join public.efficiency_values fc on fc.scheme_id = sc.id and fc.month = m.month and fc.kind = 'forecast'
    left join public.efficiency_values ac on ac.scheme_id = sc.id and ac.month = m.month and ac.kind = 'actual'
  ),
  tot as (select coalesce(sum(plan_r), 0) pr, coalesce(sum(plan_n), 0) pn, coalesce(sum(out_r), 0) o_r,
                 coalesce(sum(out_n), 0) o_n, coalesce(sum(act_r), 0) ar, coalesce(sum(act_n), 0) an from cells),
  s as (select private.efficiency_year_summary(f.org, f.year, f.workspace) -> 'totals' as t from f)
  select jsonb_build_object(
    'year', f.year, 'start_month', f.start_month, 'currency', ctx ->> 'currency',
    'whole_organisation', f.workspace is null,
    'plan', jsonb_build_object('recurrent', tot.pr, 'non_recurrent', tot.pn),
    'forecast_outturn', jsonb_build_object('recurrent', tot.o_r, 'non_recurrent', tot.o_n),
    'actual', jsonb_build_object('recurrent', tot.ar, 'non_recurrent', tot.an),
    'recurrent_pct', case when tot.pr + tot.pn > 0 then round(tot.pr * 100.0 / (tot.pr + tot.pn), 1) end,
    'forecast_recurrent_pct', case when tot.o_r + tot.o_n > 0 then round(tot.o_r * 100.0 / (tot.o_r + tot.o_n), 1) end,
    'full_year_effect', (s.t ->> 'fullYearEffect')::numeric,
    'carry_forward', (s.t ->> 'carryForward')::numeric,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('key', c.category,
        'label', private.rb_list_label(f.org, 'efficiency_category', c.category),
        'plan_recurrent', c.pr, 'plan_non_recurrent', c.pn,
        'forecast_recurrent', c.o_r, 'forecast_non_recurrent', c.o_n,
        'recurrent_pct', case when c.pr + c.pn > 0 then round(c.pr * 100.0 / (c.pr + c.pn), 1) end)
      order by c.category nulls last)
      from (select category, sum(plan_r) pr, sum(plan_n) pn, sum(out_r) o_r, sum(out_n) o_n
            from cells group by category having sum(plan_r) + sum(plan_n) + sum(out_r) + sum(out_n) <> 0) c), '[]'::jsonb))
  from f, tot, s;
$$;

revoke all on function private.rb_efficiency_frame(jsonb, jsonb), private.rb_list_label(uuid, text, text),
  private.rb_efficiency_summary(jsonb, jsonb), private.rb_efficiency_breakdown(jsonb, jsonb),
  private.rb_efficiency_schemes_at_risk(jsonb, jsonb), private.rb_efficiency_recurrent(jsonb, jsonb)
  from public, anon;
grant execute on function private.rb_efficiency_frame(jsonb, jsonb), private.rb_list_label(uuid, text, text),
  private.rb_efficiency_summary(jsonb, jsonb), private.rb_efficiency_breakdown(jsonb, jsonb),
  private.rb_efficiency_schemes_at_risk(jsonb, jsonb), private.rb_efficiency_recurrent(jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Partner safety: the efficiency programme never reaches partner organisations. Previous list
--    (NHS-3 part 3) plus the four blocks.
-- ---------------------------------------------------------------------------------------------

create or replace function private.partner_unsafe_blocks()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['resource_summary', 'data_quality', 'baf_summary', 'baf_above_appetite', 'baf_linkage',
                   'assurance_by_programme', 'impact_assessment_status', 'impact_assessments_awaiting',
                   'impact_negative_impacts', 'efficiency_summary', 'efficiency_breakdown',
                   'efficiency_schemes_at_risk', 'efficiency_recurrent']; $$;

-- ---------------------------------------------------------------------------------------------
-- 4. Templates (system rows; hidden in the app while a block's module is off)
-- ---------------------------------------------------------------------------------------------

insert into public.report_templates (organisation_id, name, description, forum_type, scope_type, is_system,
                                     rating_scheme_key, blocks, selection_rules)
select null, t.name, t.description, t.forum_type, t.scope_type, true, t.scheme, t.blocks, coalesce(pb.rules, '{}'::jsonb)
from (values
  ('Finance & Performance Committee with efficiency programme',
   'Finance and performance pack with the efficiency (CIP) programme: delivery against target, by directorate, schemes at risk and recurrent savings, then budget, benefits, strategic risks above appetite and decisions.',
   'committee', 'any', 'nhs_assurance', '[
    {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
    {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
    {"id":"eff-summary","blockKey":"efficiency_summary","blockVersion":1,"config":{"whole_organisation":true,"show_months":true},"placement":"report","pageBreakBefore":true},
    {"id":"eff-units","blockKey":"efficiency_breakdown","blockVersion":1,"config":{"group_by":"unit","whole_organisation":true},"placement":"report"},
    {"id":"eff-risk","blockKey":"efficiency_schemes_at_risk","blockVersion":1,"config":{"limit":15,"tolerance_pct":10,"whole_organisation":true},"placement":"report","pageBreakBefore":true},
    {"id":"eff-recurrent","blockKey":"efficiency_recurrent","blockVersion":1,"config":{"whole_organisation":true},"placement":"report"},
    {"id":"budget","blockKey":"budget_summary","blockVersion":1,"config":{"show_projects":true},"placement":"report","pageBreakBefore":true},
    {"id":"spend","blockKey":"spend_profile","blockVersion":1,"config":{},"placement":"report"},
    {"id":"benefits","blockKey":"benefits_value","blockVersion":1,"config":{},"placement":"report"},
    {"id":"appetite","blockKey":"baf_above_appetite","blockVersion":1,"config":{"limit":10,"show_gaps":true},"placement":"report","pageBreakBefore":true},
    {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report"},
    {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"}
   ]'::jsonb),
  ('Efficiency programme report',
   'Efficiency (CIP) programme report: delivery against target, by organisational unit and category, schemes at risk and recurrent savings.',
   'committee', 'any', null, '[
    {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
    {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
    {"id":"eff-summary","blockKey":"efficiency_summary","blockVersion":1,"config":{"whole_organisation":true,"show_months":true},"placement":"report"},
    {"id":"eff-units","blockKey":"efficiency_breakdown","blockVersion":1,"config":{"group_by":"unit","whole_organisation":true},"placement":"report","pageBreakBefore":true},
    {"id":"eff-categories","blockKey":"efficiency_breakdown","blockVersion":1,"config":{"group_by":"category","whole_organisation":true},"placement":"report"},
    {"id":"eff-stages","blockKey":"efficiency_breakdown","blockVersion":1,"config":{"group_by":"stage","whole_organisation":true},"placement":"report"},
    {"id":"eff-risk","blockKey":"efficiency_schemes_at_risk","blockVersion":1,"config":{"limit":20,"tolerance_pct":10,"whole_organisation":true},"placement":"report","pageBreakBefore":true},
    {"id":"eff-recurrent","blockKey":"efficiency_recurrent","blockVersion":1,"config":{"whole_organisation":true},"placement":"report"},
    {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
    {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"}
   ]'::jsonb)
) as t(name, description, forum_type, scope_type, scheme, blocks)
left join lateral (select r.selection_rules as rules from public.report_templates r
                   where r.is_system and r.name = 'Portfolio Board / Committee' limit 1) pb on true
where not exists (select 1 from public.report_templates x where x.is_system and x.name = t.name);
