-- get_portfolio_overview: one RPC per overview load (docs/design/portfolio-overview-spec.md §6).
--
-- Run this in Supabase → SQL Editor. The overview page will be switched to this single call
-- once it is in.
--
-- Returns the underlying figures for the overview page; the page turns them into the summary
-- figures, chart lines, signals, cards and watchlist rows, reusing the calculations that are
-- already tested. SECURITY INVOKER so RLS decides what the caller may see; no health is
-- calculated here, it reads the v_* views and the snapshot tables only.
--
-- p_range: 'fy' (default) = from the financial-year start, '12m' = the last twelve months,
-- 'all' = everything.
create or replace function public.get_portfolio_overview(
  p_workspace uuid,
  p_programme uuid default null,
  p_range text default 'fy'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with bounds as (
  select
    w.id as workspace_id,
    w.organisation_id,
    o.settings,
    private.org_today(o.id) as today,
    private.fy_start(o.settings, private.org_today(o.id)) as fy_start,
    case p_range
      when '12m' then (date_trunc('month', private.org_today(o.id)) - interval '11 months')::date
      when 'all' then null::date
      else private.fy_start(o.settings, private.org_today(o.id))
    end as from_month,
    -- The cut-off rule lives in one place: the shared private.financial_cutoff.
    private.financial_cutoff(o.id) as cutoff_month
  from public.workspaces w
  join public.organisations o on o.id = w.organisation_id
  where w.id = p_workspace
),
red_threshold as (
  -- The red band's minScore from the organisation's risk settings; 15 when no bands are set.
  select coalesce(
    (
      select max((band ->> 'minScore')::integer)
      from jsonb_array_elements(coalesce(
        (select settings -> 'risk' -> 'bands' from bounds),
        '[]'::jsonb
      )) band
      where (band ->> 'minScore') ~ '^\d+$'
    ),
    15
  ) as min_score
),
scope as (
  select p.*
  from public.v_projects p
  join bounds b on b.workspace_id = p.workspace_id
  where (p_programme is null or p.programme_id = p_programme)
),
scoped_projects as (
  select
    s.id, s.workspace_id, s.programme_id, s.portfolio_id, s.effective_portfolio_id,
    s.name, s.code, s.tier, s.state, s.priority,
    s.start_date, s.finish_date, s.baseline_finish_date,
    s.budget, s.actual, s.forecast, s.has_baseline,
    s.task_source, s.health_override, s.health_override_reason,
    s.phase_index, s.phase_count,
    s.manager_id, s.project_officer_id, s.sponsor_id,
    h.overall, h.schedule, h.financial, h.effort, h.issue, h.benefit,
    h.forecast_finish_date, h.forecast_basis,
    s.updated_at
  from scope s
  join public.v_project_health h on h.project_id = s.id
),
milestones as (
  select
    m.id, m.project_id, m.title, m.type::text as type,
    m.baseline_date, m.forecast_date, m.actual_date,
    m.status::text as status, m.slip_days, m.report_to_committee, m.owner_id,
    m.updated_at
  from public.v_milestones m
  join scope s on s.id = m.project_id
),
-- One row per project per month: the latest snapshot in each month.
project_snaps as (
  select distinct on (hs.project_id, date_trunc('month', hs.snapshot_date))
    hs.project_id,
    date_trunc('month', hs.snapshot_date)::date as month,
    hs.snapshot_date,
    hs.overall::text as overall,
    hs.schedule::text as schedule,
    hs.financial::text as financial,
    hs.effort::text as effort,
    hs.issue::text as issue,
    hs.benefit::text as benefit
  from public.health_snapshots hs
  join scope s on s.id = hs.project_id
  join bounds b on b.workspace_id = hs.workspace_id
  where b.from_month is null or hs.snapshot_date >= b.from_month
  order by hs.project_id, date_trunc('month', hs.snapshot_date), hs.snapshot_date desc
),
-- The portfolio's own month-end history, or the selected programme's under the same key.
rollup_snaps as (
  select distinct on (date_trunc('month', hs.snapshot_date))
    date_trunc('month', hs.snapshot_date)::date as month,
    hs.snapshot_date,
    hs.overall::text as overall,
    hs.metrics,
    hs.portfolio_id,
    hs.programme_id
  from public.health_snapshots hs
  join bounds b on b.workspace_id = hs.workspace_id
  where (
      (p_programme is not null and hs.programme_id = p_programme)
      or (
        p_programme is null
        and hs.portfolio_id in (
          select distinct s.effective_portfolio_id from scope s
          where s.effective_portfolio_id is not null
        )
      )
    )
    and (b.from_month is null or hs.snapshot_date >= b.from_month)
  order by date_trunc('month', hs.snapshot_date), hs.snapshot_date desc
),
money_by_month as (
  select
    fv.period_month as month,
    fv.kind::text as kind,
    sum(fv.amount) as amount
  from public.financial_values fv
  join scope s on s.id = fv.project_id
  join bounds b on b.workspace_id = fv.workspace_id
  where b.from_month is null or fv.period_month >= b.from_month
  group by fv.period_month, fv.kind
),
tasks_due as (
  select
    date_trunc('month', w.finish_date)::date as month,
    count(*) as due,
    count(*) filter (where w.status = 'done') as done_by_due
  from public.v_work_items w
  join scope s on s.id = w.project_id
  join bounds b on b.workspace_id = w.workspace_id
  where w.finish_date is not null
    and (b.from_month is null or w.finish_date >= b.from_month)
  group by 1
),
tasks_done as (
  select
    date_trunc('month', w.done_at)::date as month,
    count(*) as done
  from public.v_work_items w
  join scope s on s.id = w.project_id
  join bounds b on b.workspace_id = w.workspace_id
  where w.done_at is not null
    and (b.from_month is null or date_trunc('month', w.done_at) >= b.from_month)
  group by 1
),
-- Risks on scoped projects with their open/closed dates, so the chart can count how
-- many were open at each month end. The threshold is returned, not applied here.
scope_risks as (
  select
    r.id, r.project_id, r.title, r.score,
    r.created_at, r.closed_at, r.status::text as status
  from public.risks r
  join scope s on s.id = r.project_id
),
red_risks as (
  select r.*
  from scope_risks r
  cross join red_threshold t
  where r.status = 'open' and r.score >= t.min_score
),
-- Last snapshot per pathway item per month.
pathway_month_end as (
  select distinct on (
      coalesce(ps.capability_id::text, ps.outcome_id::text, ps.benefit_id::text),
      date_trunc('month', ps.snapshot_date)
    )
    date_trunc('month', ps.snapshot_date)::date as month,
    ps.snapshot_date,
    ps.programme_id,
    ps.capability_id,
    ps.outcome_id,
    ps.benefit_id,
    ps.rag::text as rag,
    ps.phase::text as phase,
    ps.is_complete,
    ps.due_in_fy,
    ps.realised_value,
    ps.fy_profile_value
  from public.pathway_snapshots ps
  join bounds b on b.workspace_id = ps.workspace_id
  where (p_programme is null or ps.programme_id = p_programme)
    and (b.from_month is null or ps.snapshot_date >= b.from_month)
  order by
    coalesce(ps.capability_id::text, ps.outcome_id::text, ps.benefit_id::text),
    date_trunc('month', ps.snapshot_date),
    ps.snapshot_date desc
),
forecast_history as (
  select
    ffh.project_id, ffh.reporting_month as month, ffh.budget, ffh.eac
  from public.financial_forecast_history ffh
  join scope s on s.id = ffh.project_id
  join bounds b on b.workspace_id = ffh.workspace_id
  where b.from_month is null or ffh.reporting_month >= b.from_month
),
committee_dates as (
  select cp.meeting_date as date, cp.title
  from public.committee_packs cp
  join bounds b on b.workspace_id = cp.workspace_id
),
as_of as (
  select max(ts) as updated_at
  from (
    select s.updated_at as ts from scope s
    union all
    select m.updated_at from milestones m
    union all
    select w.updated_at
    from public.v_work_items w
    join scope s on s.id = w.project_id
    union all
    select fv.updated_at
    from public.financial_values fv
    join scope s on s.id = fv.project_id
  ) t
)
select jsonb_build_object(
  'asOf', (select updated_at from as_of),
  'today', (select today from bounds),
  'fyStart', (select fy_start from bounds),
  'cutoffMonth', (select cutoff_month from bounds),
  'redRiskMinScore', (select min_score from red_threshold),
  'projects', coalesce(
    (select jsonb_agg(to_jsonb(p) order by p.name) from scoped_projects p),
    '[]'::jsonb),
  'milestones', coalesce(
    (select jsonb_agg(to_jsonb(m) order by m.forecast_date) from milestones m),
    '[]'::jsonb),
  'portfolioSnapshots', coalesce(
    (select jsonb_agg(to_jsonb(r) order by r.month) from rollup_snaps r),
    '[]'::jsonb),
  'projectSnapshots', coalesce(
    (select jsonb_agg(to_jsonb(ps) order by ps.project_id, ps.month) from project_snaps ps),
    '[]'::jsonb),
  'moneyByMonth', coalesce(
    (select jsonb_agg(to_jsonb(m) order by m.month, m.kind) from money_by_month m),
    '[]'::jsonb),
  'tasksByMonth', coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'month', d.month, 'due', d.due, 'doneByDue', d.done_by_due, 'done', coalesce(dd.done, 0)
       ) order by d.month)
     from tasks_due d left join tasks_done dd on dd.month = d.month),
    '[]'::jsonb),
  'redRisks', coalesce(
    (select jsonb_agg(to_jsonb(r) order by r.score desc, r.created_at) from red_risks r),
    '[]'::jsonb),
  'risks', coalesce(
    (select jsonb_agg(to_jsonb(r) order by r.created_at) from scope_risks r),
    '[]'::jsonb),
  'pathwayMonthEnd', coalesce(
    (select jsonb_agg(to_jsonb(pm) order by pm.month) from pathway_month_end pm),
    '[]'::jsonb),
  'forecastHistory', coalesce(
    (select jsonb_agg(to_jsonb(f) order by f.month, f.project_id) from forecast_history f),
    '[]'::jsonb),
  'committeeDates', coalesce(
    (select jsonb_agg(to_jsonb(c) order by c.date) from committee_dates c),
    '[]'::jsonb)
)
$$;

revoke all on function public.get_portfolio_overview(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_portfolio_overview(uuid, uuid, text)
  to authenticated;
