-- GL-14 Phase C: retire Committee packs (docs/design/retire-committee-packs.md).
-- Section A applied to production 16/11/2026 (version 20261116142252). Section D not run.
--
-- Section A (non-destructive, the migration
-- supabase/migrations/20261116142252_gl_14c_retire_committee_packs.sql): get_portfolio_overview and
-- get_project_overview stop reading public.committee_packs; their committee markers come only from
-- published report-builder packs (committee / portfolio board forums, and collection packs).
-- Apply this first, with the front end that stops reading the table (services/progress-chart.ts).
--
-- Section D (DESTRUCTIVE: run by hand in the SQL editor, after section A is applied and the front
-- end is published). Production had 0 rows in public.committee_packs on 16/11/2026 (read-only
-- check); re-check with the first statement before dropping. supabase/tests/committee_markers.sql
-- proves both RPCs keep working after the drop, and every other local suite passes with the table
-- gone. Afterwards regenerate src/integrations/supabase/types.ts (committee_packs disappears).

-- =====================================================================================
-- Section A: migration (same text as the migration file)
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_portfolio_overview(p_workspace uuid, p_programme uuid DEFAULT NULL::uuid, p_range text DEFAULT 'fy'::text, p_portfolio uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  -- GL-14: published committee / portfolio board packs and collection packs from the report
  -- builder (the meeting's date, else the pack's as-at date). RLS on reports applies. GL-14
  -- Phase C: the retired committee pack table is no longer read.
  select coalesce(m.meeting_date, r.as_at) as date, r.title
  from public.reports r
  join bounds b on b.organisation_id = r.organisation_id and (r.workspace_id is null or r.workspace_id = b.workspace_id)
  left join public.forums f on f.id = r.forum_id
  left join public.meetings m on m.id = r.meeting_id
  where r.status = 'published'
    and (f.forum_type in ('committee', 'portfolio_board') or r.scope_type = 'collection')
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
$function$;

CREATE OR REPLACE FUNCTION public.get_project_overview(p_project uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
  -- GL-14 Phase C: published committee / portfolio board packs and collection packs from the
  -- report builder in the project's workspace (or organisation-wide), dated by the meeting, else
  -- the pack's as-at date, as get_portfolio_overview does. RLS on reports applies.
  select coalesce(m.meeting_date, r.as_at) as date, r.title
  from public.reports r
  join proj on proj.organisation_id = r.organisation_id and (r.workspace_id is null or r.workspace_id = proj.workspace_id)
  left join public.forums f on f.id = r.forum_id
  left join public.meetings m on m.id = r.meeting_id
  where r.status = 'published'
    and (f.forum_type in ('committee', 'portfolio_board') or r.scope_type = 'collection')
),
-- D1: open decisions with the overdue rule from v_decisions, and the decisions the latest
-- submitted report asked for (status_report_decisions).
open_decisions as (
  select d.id, d.ref, d.title, d.needed_by_date, d.overdue, d.days_overdue, d.deferral_count,
    d.decision_maker_id, lv.label as forum
  from public.v_decisions d
  join proj on proj.id = d.project_id
  left join public.lookup_values lv on lv.id = d.forum_id
  where d.status = 'pending'
),
latest_report_decisions as (
  select d.id, d.ref, d.title, d.status::text as status, d.needed_by_date, d.decision_date,
    d.overdue, srd.sort_order
  from public.status_report_decisions srd
  join latest_report r on r.id = srd.status_report_id
  join public.v_decisions d on d.id = srd.decision_id
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
  'committeeDates', coalesce((select jsonb_agg(to_jsonb(c) order by c.date) from committee_dates c), '[]'::jsonb),
  'openDecisions', coalesce((select jsonb_agg(to_jsonb(od) order by od.needed_by_date nulls last, od.ref) from open_decisions od), '[]'::jsonb),
  'latestReportDecisions', coalesce((select jsonb_agg(to_jsonb(rd) order by rd.sort_order, rd.ref) from latest_report_decisions rd), '[]'::jsonb)
)
from proj
$function$;

-- =====================================================================================
-- Section D: DESTRUCTIVE, run by hand (not part of any migration)
-- =====================================================================================
-- 1. Must return 0. If it doesn't, stop: export the rows first.
select count(*) from public.committee_packs;

-- 2. Drop the table (its policies and triggers go with it), then the two trigger functions only
--    it used. The shared trigger functions (tenant_guard, set_updated_at, audit_row_change,
--    enforce_org_writable) stay. No foreign key or view references the table.
begin;
drop table public.committee_packs;
drop function private.committee_pack_lock();
drop function private.committee_pack_no_delete();
commit;
-- Record it in the repo as a migration file afterwards (e.g. <timestamp>_gl_14c_drop_committee_packs.sql
-- with the three drop statements), so a fresh build matches production.
