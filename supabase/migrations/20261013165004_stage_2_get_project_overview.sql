-- Stage 2: get_project_overview(p_project). Proposal and design notes: docs/sql/get-project-overview.sql.
-- Dry run (rolled back): member sees ARB, outsider gets NULL.

create or replace function public.get_project_overview(p_project uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
with proj as (
  select p.*, pr.reporting_cadence,
    o.settings,
    private.org_today(p.organisation_id) as today,
    private.fy_start(o.settings, private.org_today(p.organisation_id)) as fy_start,
    private.financial_cutoff(p.organisation_id) as cutoff_month
  from public.v_projects p
  join public.projects pr on pr.id = p.id
  join public.organisations o on o.id = p.organisation_id
  where p.id = p_project and p.archived_at is null
),
red_threshold as (
  select coalesce(
    (select max((band ->> 'minScore')::integer)
     from jsonb_array_elements(coalesce((select settings -> 'risk' -> 'bands' from proj), '[]'::jsonb)) band
     where (band ->> 'minScore') ~ '^\d+$'),
    15) as min_score
),
health as (
  select h.* from public.project_health_current h join proj on proj.id = h.project_id
),
milestones as (
  select
    m.id, m.ref, m.title, m.type::text as type, m.phase_id, lp.name as phase_name,
    m.baseline_date, m.forecast_date, m.actual_date,
    m.status::text as status, m.slip_days, m.slip_band, m.past_baseline,
    m.report_to_committee, m.owner_id, m.updated_at
  from public.v_milestones m
  join proj on proj.id = m.project_id
  left join public.lifecycle_phases lp on lp.id = m.phase_id
),
markers as (
  select m.id, m.title, m.type, m.report_to_committee, m.baseline_date,
    coalesce(m.actual_date, m.forecast_date) as date
  from milestones m
  where m.type = 'gate' or m.report_to_committee
),
phases as (
  select lp.id, lp.name, lp.short_name, lp.gate_name, lp.sort_order
  from public.lifecycle_phases lp
  join proj on proj.organisation_id = lp.organisation_id
),
financials as (
  select f.budget, f.has_baseline, f.baseline_version, f.budget_phased, f.phasing_gap,
    f.actuals_through, f.actual_to_date, f.actual_open_months, f.forecast_remaining, f.eac,
    f.variance, f.variance_percent, f.open_month_overrun, f.overrun_month
  from public.v_project_financials f
  join proj on proj.id = f.project_id
),
money_by_month as (
  select fv.project_id, fv.period_month as month, fv.kind::text as kind, sum(fv.amount) as amount
  from public.financial_values fv
  join proj on proj.id = fv.project_id
  group by fv.project_id, fv.period_month, fv.kind
),
forecast_history as (
  select ffh.project_id, ffh.reporting_month as month, ffh.budget, ffh.eac,
    ffh.actual_to_date, ffh.source::text as source
  from public.financial_forecast_history ffh
  join proj on proj.id = ffh.project_id
),
submitted as (
  select r.*
  from public.status_reports r
  join proj on proj.id = r.project_id
  where r.status = 'submitted'
),
project_snaps as (
  select distinct on (date_trunc('month', hs.snapshot_date))
    hs.project_id,
    date_trunc('month', hs.snapshot_date)::date as month,
    hs.snapshot_date,
    hs.overall::text as overall, hs.schedule::text as schedule, hs.financial::text as financial,
    hs.effort::text as effort, hs.issue::text as issue, hs.benefit::text as benefit,
    hs.source
  from public.health_snapshots hs
  join proj on proj.id = hs.project_id
  where proj.start_date is null or hs.snapshot_date >= date_trunc('month', proj.start_date)::date
  order by date_trunc('month', hs.snapshot_date), hs.snapshot_date desc
),
project_snaps_declared as (
  select s.*,
    d.overall::text as declared_overall, d.schedule::text as declared_schedule,
    d.financial::text as declared_financial, d.effort::text as declared_effort,
    d.issue::text as declared_issue, d.declared_benefit::text as declared_benefit,
    d.reporting_date as declared_report_date
  from project_snaps s
  left join lateral (
    select r.overall, r.schedule, r.financial, r.effort, r.issue, r.declared_benefit, r.reporting_date
    from submitted r
    where r.reporting_date <= (s.month + interval '1 month' - interval '1 day')::date
    order by r.reporting_date desc, r.submitted_at desc
    limit 1
  ) d on true
),
latest_report as (
  select r.id, r.ref, r.reporting_date, r.submitter_id, res.name as author, r.submitted_at,
    r.comments, r.accomplished, r.planned, r.decisions_needed,
    r.overall::text as declared_overall, r.schedule::text as declared_schedule,
    r.financial::text as declared_financial, r.effort::text as declared_effort,
    r.issue::text as declared_issue, r.declared_benefit::text as declared_benefit,
    r.evidenced_overall::text as evidenced_overall, r.evidenced_schedule::text as evidenced_schedule,
    r.evidenced_financial::text as evidenced_financial, r.evidenced_effort::text as evidenced_effort,
    r.evidenced_issue::text as evidenced_issue, r.evidenced_benefit::text as evidenced_benefit,
    r.source
  from submitted r
  left join public.resources res on res.id = r.submitter_id
  order by r.reporting_date desc, r.submitted_at desc
  limit 1
),
open_raid as (
  select 'risk' as kind, r.id, r.ref, r.title, r.score::integer as score, r.probability::integer as probability,
    r.impact::integer as impact, null::text as severity, r.review_date, r.owner_id, r.created_at, r.updated_at
  from public.risks r join proj on proj.id = r.project_id
  where r.status = 'open'
  union all
  select 'issue', i.id, i.ref, i.title, null, null, null, i.severity::text, null::date, i.owner_id,
    i.created_at, i.updated_at
  from public.issues i join proj on proj.id = i.project_id
  where i.status = 'open'
),
all_risks as (
  select r.id, r.project_id, r.title, r.score, r.created_at, r.closed_at, r.status::text as status
  from public.risks r join proj on proj.id = r.project_id
),
tasks_due as (
  select w.project_id, date_trunc('month', w.finish_date)::date as month,
    count(*) as due, count(*) filter (where w.status = 'done') as done_by_due
  from public.v_work_items w join proj on proj.id = w.project_id
  where w.finish_date is not null
  group by 1, 2
),
tasks_done as (
  select w.project_id, date_trunc('month', w.done_at)::date as month, count(*) as done
  from public.v_work_items w join proj on proj.id = w.project_id
  where w.done_at is not null
  group by 1, 2
),
linked_items as (
  select cp.capability_id, null::uuid as benefit_id
  from public.capability_projects cp join proj on proj.id = cp.project_id
  union
  select null::uuid, bp.benefit_id
  from public.benefit_projects bp join proj on proj.id = bp.project_id
),
pathway_month_end as (
  select distinct on (coalesce(ps.capability_id::text, ps.benefit_id::text), date_trunc('month', ps.snapshot_date))
    date_trunc('month', ps.snapshot_date)::date as month, ps.snapshot_date, ps.programme_id,
    ps.capability_id, ps.outcome_id, ps.benefit_id, ps.rag::text as rag, ps.phase::text as phase,
    ps.is_complete, ps.due_in_fy, ps.realised_value, ps.fy_profile_value
  from public.pathway_snapshots ps
  join linked_items li on li.capability_id = ps.capability_id or li.benefit_id = ps.benefit_id
  order by coalesce(ps.capability_id::text, ps.benefit_id::text), date_trunc('month', ps.snapshot_date),
    ps.snapshot_date desc
),
pathway_targets as (
  select c.id as capability_id, null::uuid as outcome_id, c.target_date, c.status::text as status
  from public.capabilities c
  join linked_items li on li.capability_id = c.id
  where c.archived_at is null
),
committee_dates as (
  select cp.meeting_date as date, cp.title
  from public.committee_packs cp
  join proj on proj.workspace_id = cp.workspace_id
)
select jsonb_build_object(
  'asOf', (select computed_at from health),
  'today', proj.today,
  'fyStart', proj.fy_start,
  'cutoffMonth', proj.cutoff_month,
  'redRiskMinScore', (select min_score from red_threshold),
  'project', jsonb_build_object(
    'id', proj.id, 'code', proj.code, 'name', proj.name, 'workspace_id', proj.workspace_id,
    'programme_id', proj.programme_id, 'effective_portfolio_id', proj.effective_portfolio_id,
    'state', proj.state, 'tier', proj.tier, 'priority', proj.priority,
    'start_date', proj.start_date, 'finish_date', proj.finish_date,
    'baseline_finish_date', proj.baseline_finish_date,
    'phase_id', proj.phase_id, 'phase_index', proj.phase_index, 'phase_count', proj.phase_count,
    'reporting_cadence', proj.reporting_cadence,
    'manager_id', proj.manager_id, 'project_officer_id', proj.project_officer_id,
    'sponsor_id', proj.sponsor_id, 'updated_at', proj.updated_at),
  'health', (select to_jsonb(h) from health h),
  'milestones', coalesce((select jsonb_agg(to_jsonb(m) order by m.baseline_date, m.title) from milestones m), '[]'::jsonb),
  'markers', coalesce((select jsonb_agg(to_jsonb(k) order by k.date) from markers k), '[]'::jsonb),
  'phases', coalesce((select jsonb_agg(to_jsonb(ph) order by ph.sort_order) from phases ph), '[]'::jsonb),
  'financials', (select to_jsonb(f) from financials f),
  'moneyByMonth', coalesce((select jsonb_agg(to_jsonb(m) order by m.month, m.kind) from money_by_month m), '[]'::jsonb),
  'forecastHistory', coalesce((select jsonb_agg(to_jsonb(f) order by f.month) from forecast_history f), '[]'::jsonb),
  'projectSnapshots', coalesce((select jsonb_agg(to_jsonb(s) order by s.month) from project_snaps_declared s), '[]'::jsonb),
  'latestReport', (select to_jsonb(r) from latest_report r),
  'openRaid', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from open_raid x), '[]'::jsonb),
  'riskBands', coalesce(proj.settings -> 'risk' -> 'bands', '[]'::jsonb),
  'risks', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from all_risks r), '[]'::jsonb),
  'tasksByMonth', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'projectId', d.project_id, 'month', d.month, 'due', d.due, 'doneByDue', d.done_by_due,
        'done', coalesce(dd.done, 0)) order by d.month)
     from tasks_due d left join tasks_done dd on dd.project_id = d.project_id and dd.month = d.month),
    '[]'::jsonb),
  'pathwayMonthEnd', coalesce((select jsonb_agg(to_jsonb(pm) order by pm.month) from pathway_month_end pm), '[]'::jsonb),
  'pathwayTargets', coalesce((select jsonb_agg(to_jsonb(pt)) from pathway_targets pt), '[]'::jsonb),
  'committeeDates', coalesce((select jsonb_agg(to_jsonb(c) order by c.date) from committee_dates c), '[]'::jsonb)
)
from proj
$$;

revoke all on function public.get_project_overview(uuid) from public, anon;
grant execute on function public.get_project_overview(uuid) to authenticated;
