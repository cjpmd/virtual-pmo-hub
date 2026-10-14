-- Page-serving health reads from the stored tables (get_portfolio_overview, v_roadmap_items,
-- v_capability_health and the views built on it). Proposal, inventory and dry run:
-- docs/sql/health-reads-stored.sql.
create or replace function public.get_portfolio_overview(
  p_workspace uuid,
  p_programme uuid default null,
  p_range text default 'fy',
  p_portfolio uuid default null
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
    private.financial_cutoff(o.id) as cutoff_month
  from public.workspaces w
  join public.organisations o on o.id = w.organisation_id
  where w.id = p_workspace
),
red_threshold as (
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
  where p.archived_at is null
    and (p_programme is null or p.programme_id = p_programme)
    and (p_portfolio is null or p.effective_portfolio_id = p_portfolio)
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
  join public.project_health_current h on h.project_id = s.id
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
  where b.from_month is null
     or hs.snapshot_date >= (b.from_month - interval '6 months')::date
  order by hs.project_id, date_trunc('month', hs.snapshot_date), hs.snapshot_date desc
),
rollup_snaps as (
  select distinct on (coalesce(hs.programme_id, hs.portfolio_id), date_trunc('month', hs.snapshot_date))
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
    and (
      b.from_month is null
      or hs.snapshot_date >= (b.from_month - interval '6 months')::date
    )
  order by coalesce(hs.programme_id, hs.portfolio_id),
           date_trunc('month', hs.snapshot_date), hs.snapshot_date desc
),
money_by_month as (
  select
    fv.project_id,
    fv.period_month as month,
    fv.kind::text as kind,
    sum(fv.amount) as amount
  from public.financial_values fv
  join scope s on s.id = fv.project_id
  join bounds b on b.workspace_id = fv.workspace_id
  where b.from_month is null or fv.period_month >= b.from_month
  group by fv.project_id, fv.period_month, fv.kind
),
tasks_due as (
  select
    w.project_id,
    date_trunc('month', w.finish_date)::date as month,
    count(*) as due,
    count(*) filter (where w.status = 'done') as done_by_due
  from public.v_work_items w
  join scope s on s.id = w.project_id
  join bounds b on b.workspace_id = w.workspace_id
  where w.finish_date is not null
    and (b.from_month is null or w.finish_date >= b.from_month)
  group by 1, 2
),
tasks_done as (
  select
    w.project_id,
    date_trunc('month', w.done_at)::date as month,
    count(*) as done
  from public.v_work_items w
  join scope s on s.id = w.project_id
  join bounds b on b.workspace_id = w.workspace_id
  where w.done_at is not null
    and (b.from_month is null or date_trunc('month', w.done_at) >= b.from_month)
  group by 1, 2
),
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
portfolio_programmes as (
  select pr.id
  from public.programmes pr
  join bounds b on b.workspace_id = pr.workspace_id
  where p_portfolio is not null and pr.portfolio_id = p_portfolio
),
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
    and (p_portfolio is null or ps.programme_id in (select id from portfolio_programmes))
    and (b.from_month is null or ps.snapshot_date >= b.from_month)
  order by
    coalesce(ps.capability_id::text, ps.outcome_id::text, ps.benefit_id::text),
    date_trunc('month', ps.snapshot_date),
    ps.snapshot_date desc
),
pathway_targets as (
  select
    c.id as capability_id,
    null::uuid as outcome_id,
    c.target_date,
    c.status::text as status
  from public.capabilities c
  join bounds b on b.workspace_id = c.workspace_id
  where (p_programme is null or c.programme_id = p_programme)
    and (p_portfolio is null or c.programme_id in (select id from portfolio_programmes))
  union all
  select
    null::uuid,
    o.id,
    o.target_date,
    o.status::text
  from public.outcomes o
  join bounds b on b.workspace_id = o.workspace_id
  where (p_programme is null or o.programme_id = p_programme)
    and (p_portfolio is null or o.programme_id in (select id from portfolio_programmes))
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
    (select jsonb_agg(to_jsonb(r) order by r.portfolio_id, r.programme_id, r.month) from rollup_snaps r),
    '[]'::jsonb),
  'projectSnapshots', coalesce(
    (select jsonb_agg(to_jsonb(ps) order by ps.project_id, ps.month) from project_snaps ps),
    '[]'::jsonb),
  'moneyByMonth', coalesce(
    (select jsonb_agg(to_jsonb(m) order by m.project_id, m.month, m.kind) from money_by_month m),
    '[]'::jsonb),
  'tasksByMonth', coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'projectId', d.project_id,
         'month', d.month, 'due', d.due, 'doneByDue', d.done_by_due, 'done', coalesce(dd.done, 0)
       ) order by d.project_id, d.month)
     from tasks_due d
     left join tasks_done dd on dd.project_id = d.project_id and dd.month = d.month),
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
  'pathwayTargets', coalesce(
    (select jsonb_agg(to_jsonb(pt)) from pathway_targets pt),
    '[]'::jsonb),
  'forecastHistory', coalesce(
    (select jsonb_agg(to_jsonb(f) order by f.month, f.project_id) from forecast_history f),
    '[]'::jsonb),
  'committeeDates', coalesce(
    (select jsonb_agg(to_jsonb(c) order by c.date) from committee_dates c),
    '[]'::jsonb)
)
$$;

revoke all on function public.get_portfolio_overview(uuid, uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.get_portfolio_overview(uuid, uuid, text, uuid)
  to authenticated;

-- ---- (2) v_roadmap_items: project health from the stored table -----------------------------
create or replace view public.v_roadmap_items with (security_invoker = true) as
 WITH project_health AS MATERIALIZED (
         SELECT h_1.project_id,
            h_1.overall
           FROM project_health_current h_1
        ), task_stats AS MATERIALIZED (
         SELECT s_1.project_id,
            s_1.task_count,
            s_1.avg_percent_complete
           FROM v_project_task_stats s_1
        )
 SELECT ri.id,
    ri.organisation_id,
    ri.workspace_id,
    ri.roadmap_id,
    ri.row_id,
    ri.project_id,
    ri.sort_order,
    (ri.project_id IS NOT NULL) AS is_linked,
    COALESCE(p.name, ri.title) AS title,
    COALESCE(p.start_date, ri.start_date) AS start_date,
    COALESCE(p.finish_date, ri.finish_date) AS finish_date,
        CASE
            WHEN (p.id IS NULL) THEN COALESCE((ri.progress)::integer, 0)
            WHEN (s.task_count > 0) THEN s.avg_percent_complete
            ELSE (private.js_round(((((p.phase_index)::numeric + 0.5) / (GREATEST(p.phase_count, 1))::numeric) * (100)::numeric)))::integer
        END AS progress,
        CASE
            WHEN (p.id IS NULL) THEN COALESCE(ri.health, 'not_set'::health)
            WHEN (p.state = 'closed'::project_state) THEN 'green'::health
            WHEN (p.state = 'proposed'::project_state) THEN 'not_set'::health
            WHEN (h.overall = 'red'::health) THEN 'red'::health
            WHEN ((p.priority = 'high'::priority) OR (h.overall = 'amber'::health)) THEN 'amber'::health
            ELSE 'green'::health
        END AS health,
    ((p.state = 'closed'::project_state) IS TRUE) AS is_done,
    COALESCE(p.manager_id, ri.owner_id) AS owner_id,
    COALESCE(p.priority, ri.priority) AS priority,
    COALESCE(p.programme_id, rr.programme_id) AS programme_id
   FROM ((((roadmap_items ri
     JOIN roadmap_rows rr ON ((rr.id = ri.row_id)))
     LEFT JOIN v_projects p ON ((p.id = ri.project_id)))
     LEFT JOIN task_stats s ON ((s.project_id = p.id)))
     LEFT JOIN project_health h ON ((h.project_id = p.id)))
  WHERE ((ri.project_id IS NULL) OR (p.id IS NOT NULL));

-- ---- (3) v_capability_health: linked projects' delivery RAG from the stored table ----------
create or replace view public.v_capability_health with (security_invoker = true) as
 WITH base AS (
         SELECT c.id,
            c.organisation_id,
            c.workspace_id,
            c.programme_id,
            c.title,
            c.description,
            c.owner_id,
            c.created_at,
            c.updated_at,
            c.created_by,
            c.status,
            c.target_date,
            c.forecast_date,
            c.delivered_date,
            c.accepted_at,
            c.accepted_by_id,
            c.acceptance_note,
            c.archived_at,
            private.org_today(c.organisation_id) AS today,
            o.settings
           FROM (capabilities c
             JOIN organisations o ON ((o.id = c.organisation_id)))
          WHERE (c.archived_at IS NULL)
        ), delivery AS MATERIALIZED (
         SELECT cp.capability_id,
            string_agg(d.code, ', '::text ORDER BY d.code) FILTER (WHERE (d.delivery = 'red'::health)) AS red_projects,
            string_agg(d.code, ', '::text ORDER BY d.code) FILTER (WHERE (d.delivery = 'amber'::health)) AS amber_projects
           FROM (capability_projects cp
             JOIN (SELECT h.project_id, h.code, h.state,
                     GREATEST(h.schedule, h.financial, h.effort, h.issue) AS delivery
                   FROM project_health_current h) d ON ((d.project_id = cp.project_id)))
          WHERE (d.state <> 'closed'::project_state)
          GROUP BY cp.capability_id
        )
 SELECT base.id AS capability_id,
    base.organisation_id,
    base.workspace_id,
    base.programme_id,
    base.title,
    base.status,
    base.target_date,
    base.forecast_date,
    (base.forecast_date - base.target_date) AS slip_days,
    (base.status = 'accepted'::capability_status) AS is_complete,
    ((base.status = 'delivered'::capability_status) AND (base.target_date < base.today)) AS awaiting_acceptance_past_target,
    x.rag,
    x.reason
   FROM ((base
     LEFT JOIN delivery dl ON ((dl.capability_id = base.id)))
     CROSS JOIN LATERAL private.capability_rag(base.status, base.target_date, base.forecast_date, base.accepted_at, base.today, (private.health_threshold(base.settings, 'acceptanceGraceDays'::text))::integer, private.health_threshold(base.settings, 'capabilitySlipAmberDays'::text), dl.red_projects, dl.amber_projects) x(rag, reason));
