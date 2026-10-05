-- Virtual PMO: computed values. Nothing here is stored. All views use security_invoker,
-- so the caller's RLS applies. The rules port services/pmo.ts and services/dependencies.ts;
-- a parity check compares both on the demo seed.

create type public.delivery_status as enum ('on_track', 'future', 'late', 'overdue', 'completed');

-- JavaScript Math.round semantics (half rounds towards +infinity) so SQL and TS agree.
create function private.js_round(x numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$ select floor(x + 0.5) $$;

create function private.clamp(x numeric, lo numeric, hi numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$ select greatest(lo, least(hi, x)) $$;

-- Threshold from organisations.settings -> 'health'.
create function private.health_threshold(p_settings jsonb, p_key text)
returns numeric
language sql
immutable
set search_path = ''
as $$ select (p_settings -> 'health' ->> p_key)::numeric $$;

grant execute on function private.js_round(numeric), private.clamp(numeric, numeric, numeric),
  private.health_threshold(jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Projects (non-archived) with the effective portfolio and the 0-based phase index.
-- ---------------------------------------------------------------------------
create view public.v_projects with (security_invoker = true) as
select
  p.*,
  coalesce(p.portfolio_id, pr.portfolio_id) as effective_portfolio_id,
  coalesce(ph.phase_index, 0) as phase_index,
  ph.phase_count
from public.projects p
left join public.programmes pr on pr.id = p.programme_id
left join lateral (
  select x.phase_index, x.phase_count from (
    select lp.id, (row_number() over (order by lp.sort_order) - 1)::integer as phase_index, count(*) over ()::integer as phase_count
    from public.lifecycle_phases lp where lp.organisation_id = p.organisation_id
  ) x where x.id = p.phase_id
) ph on true
where p.archived_at is null;

-- ---------------------------------------------------------------------------
-- Work items (not deleted) with delivery status and checklist counts.
-- ---------------------------------------------------------------------------
create view public.v_work_items with (security_invoker = true) as
select
  wi.*,
  case
    when wi.status = 'done' then 'completed'::public.delivery_status
    when wi.finish_date < private.org_today(wi.organisation_id) then 'overdue'::public.delivery_status
    when wi.baseline_finish_date is not null and wi.finish_date > wi.baseline_finish_date then 'late'::public.delivery_status
    when wi.start_date > private.org_today(wi.organisation_id) then 'future'::public.delivery_status
    else 'on_track'::public.delivery_status
  end as delivery_status,
  coalesce(cl.total, 0)::integer as checklist_count,
  coalesce(cl.done, 0)::integer as checklist_done_count
from public.work_items wi
left join lateral (
  select count(*) as total, count(*) filter (where c.is_done) as done
  from public.work_item_checklist_items c where c.work_item_id = wi.id
) cl on true
where wi.deleted_at is null;

-- Replaces Project.taskCount / overdueTaskCount and the roadmap progress calculation.
create view public.v_project_task_stats with (security_invoker = true) as
select
  p.id as project_id,
  p.organisation_id,
  p.workspace_id,
  count(w.id)::integer as task_count,
  count(w.id) filter (where w.delivery_status = 'overdue')::integer as overdue_count,
  count(w.id) filter (where w.status = 'done')::integer as done_count,
  private.js_round(avg(coalesce(w.percent_complete, case when w.status = 'done' then 100 else 0 end)))::integer as avg_percent_complete
from public.projects p
left join public.v_work_items w on w.project_id = p.id and w.status <> 'cancelled'
where p.archived_at is null
group by p.id, p.organisation_id, p.workspace_id;

-- ---------------------------------------------------------------------------
-- Milestones with computed status and slip.
-- ---------------------------------------------------------------------------
create view public.v_milestones with (security_invoker = true) as
select
  m.*,
  case
    when m.actual_date is not null then 'completed'::public.delivery_status
    when m.forecast_date < private.org_today(m.organisation_id) then 'overdue'::public.delivery_status
    when m.forecast_date > m.baseline_date then 'late'::public.delivery_status
    when m.forecast_date - private.org_today(m.organisation_id) > 30 then 'future'::public.delivery_status
    else 'on_track'::public.delivery_status
  end as status,
  (m.forecast_date - m.baseline_date) as slip_days
from public.milestones m;

-- ---------------------------------------------------------------------------
-- Benefits: planned and evidenced fractions per profile period (from the first measure),
-- then realisation, variance and health. Ports getPlannedFractions, getActualFractions,
-- getBenefitRealised, getBenefitPercent, getBenefitVariance and getBenefitHealth.
-- ---------------------------------------------------------------------------
create view public.v_benefit_period_values with (security_invoker = true) as
with periods as (
  select bp.*,
    (row_number() over (partition by bp.organisation_id order by bp.start_date) - 1)::integer as idx,
    count(*) over (partition by bp.organisation_id)::integer as n
  from public.benefit_periods bp
),
first_measure as (
  select distinct on (bm.benefit_id) bm.*
  from public.benefit_measures bm
  order by bm.benefit_id, bm.sort_order, bm.created_at, bm.id
),
final_target as (
  select distinct on (t.measure_id) t.measure_id, t.value
  from public.benefit_measure_targets t
  join public.benefit_periods bp on bp.id = t.period_id
  order by t.measure_id, bp.start_date desc
),
target_counts as (
  select t.measure_id, count(*) as n from public.benefit_measure_targets t group by t.measure_id
)
select
  b.id as benefit_id,
  b.organisation_id,
  b.workspace_id,
  pe.id as period_id,
  pe.label as period_label,
  pe.start_date,
  pe.finish_date,
  pe.idx,
  pe.n,
  case
    when fm.id is null or coalesce(tc.n, 0) = 0 then (pe.idx + 1)::numeric / pe.n
    when tg.value is null then 0
    when coalesce(ft.value, fm.baseline_value) - fm.baseline_value = 0 then 0
    else private.clamp((tg.value - fm.baseline_value) / (coalesce(ft.value, fm.baseline_value) - fm.baseline_value), 0, 1)
  end as planned_fraction,
  case
    when fm.id is null or rec.actual_value is null then null
    when coalesce(ft.value, fm.baseline_value) - fm.baseline_value = 0 then 0
    else private.clamp((rec.actual_value - fm.baseline_value) / (coalesce(ft.value, fm.baseline_value) - fm.baseline_value), 0, 1.35)
  end as actual_fraction,
  tg.value as target_value,
  rec.actual_value
from public.benefits b
join periods pe on pe.organisation_id = b.organisation_id
left join first_measure fm on fm.benefit_id = b.id
left join final_target ft on ft.measure_id = fm.id
left join target_counts tc on tc.measure_id = fm.id
left join public.benefit_measure_targets tg on tg.measure_id = fm.id and tg.period_id = pe.id
left join lateral (
  -- Several submissions per period are allowed (resubmission after a query). Validated
  -- evidence counts first, then the earliest submission; queried records never count.
  select r.actual_value from public.benefit_measurements r
  where r.measure_id = fm.id and r.period_id = pe.id and r.status <> 'queried'
  order by (r.status = 'validated') desc, r.submitted_date nulls last, r.created_at, r.id
  limit 1
) rec on true;

create view public.v_benefit_realisation with (security_invoker = true) as
with base as (
  select b.*, private.org_today(b.organisation_id) as today, o.settings
  from public.benefits b
  join public.organisations o on o.id = b.organisation_id
),
pv as (
  select v.*, base.today,
    (v.start_date <= base.today and v.finish_date >= base.today) as is_current
  from public.v_benefit_period_values v join base on base.id = v.benefit_id
),
cur as (
  select pv.benefit_id,
    coalesce(min(pv.idx) filter (where pv.is_current), max(pv.n) - 1) as current_idx
  from pv group by pv.benefit_id
),
calc as (
  select
    base.id as benefit_id,
    -- latest evidenced fraction overall (realisation)
    (select p2.actual_fraction from pv p2 where p2.benefit_id = base.id and p2.actual_fraction is not null order by p2.idx desc limit 1) as latest_actual,
    -- latest evidenced fraction up to the current period (variance)
    coalesce((select p2.actual_fraction from pv p2 where p2.benefit_id = base.id and p2.actual_fraction is not null
              and p2.idx <= cur.current_idx order by p2.idx desc limit 1), 0) as achieved,
    coalesce((select p2.planned_fraction from pv p2 where p2.benefit_id = base.id and p2.idx = cur.current_idx - 1), 0) as previous_planned,
    coalesce((select p2.planned_fraction from pv p2 where p2.benefit_id = base.id and p2.idx = cur.current_idx), 0) as current_planned,
    (select case when p2.start_date is null then 1
                 else private.clamp((base.today - p2.start_date)::numeric / greatest(1, p2.finish_date - p2.start_date), 0, 1) end
       from pv p2 where p2.benefit_id = base.id and p2.idx = cur.current_idx) as elapsed
  from base left join cur on cur.benefit_id = base.id
),
flags as (
  select
    base.id as benefit_id,
    exists (select 1 from public.benefit_measures m where m.benefit_id = base.id and m.next_due_date < base.today) as measurement_overdue,
    (select min(m.next_due_date) from public.benefit_measures m where m.benefit_id = base.id) as next_measurement_due,
    (select coalesce(sum(bp.attribution_percent), 0) from public.benefit_projects bp where bp.benefit_id = base.id) as attribution_total,
    not (
      (base.status <> 'identified' and (base.owner_id is null or not base.eligibility_confirmed))
      or (base.status in ('planned', 'in_realisation', 'realised', 'partially_realised', 'not_realised', 'closed')
          and not exists (select 1 from public.benefit_measures m where m.benefit_id = base.id and m.baseline_date is not null
                          and exists (select 1 from public.benefit_measure_targets t where t.measure_id = m.id)))
      or (base.status in ('realised', 'partially_realised')
          and not exists (select 1 from public.benefit_reviews r where r.benefit_id = base.id and r.type = 'post_implementation'))
    ) as lifecycle_valid
  from base
)
select
  base.id as benefit_id,
  base.organisation_id,
  base.workspace_id,
  base.portfolio_id,
  base.programme_id,
  private.js_round(base.planned_total_value * coalesce(calc.latest_actual, 0)) as realised_value,
  case when abs(base.planned_total_value) = 0 then 0
       else least(135, private.js_round(abs(private.js_round(base.planned_total_value * coalesce(calc.latest_actual, 0))) / abs(base.planned_total_value) * 100))
  end::integer as realised_percent,
  (calc.previous_planned + (calc.current_planned - calc.previous_planned) * coalesce(calc.elapsed, 1)) as expected_fraction,
  calc.achieved as achieved_fraction,
  private.js_round((calc.achieved - (calc.previous_planned + (calc.current_planned - calc.previous_planned) * coalesce(calc.elapsed, 1))) * 100)::integer as variance_percent,
  (private.js_round((calc.achieved - (calc.previous_planned + (calc.current_planned - calc.previous_planned) * coalesce(calc.elapsed, 1))) * 100)
    < -private.health_threshold(base.settings, 'benefitBehindProfilePercent')) as behind_profile,
  flags.measurement_overdue,
  flags.next_measurement_due,
  flags.lifecycle_valid,
  flags.attribution_total,
  (flags.attribution_total > 100) as attribution_warning,
  case
    when base.confidence = 'low'
      or private.js_round((calc.achieved - (calc.previous_planned + (calc.current_planned - calc.previous_planned) * coalesce(calc.elapsed, 1))) * 100)
         < -private.health_threshold(base.settings, 'benefitBehindProfilePercent') then 'red'::public.health
    when flags.measurement_overdue or not flags.lifecycle_valid then 'amber'::public.health
    else 'green'::public.health
  end as health
from base
join calc on calc.benefit_id = base.id
join flags on flags.benefit_id = base.id;

-- Benefits as a health dimension for a set of benefits at a lifecycle stage (getBenefitDimensionHealth).
-- "Unvalidated past the Plan stage" applies from phase index 2 onwards.
create function private.benefit_dimension_health(p_benefit_ids uuid[], p_stage_index integer)
returns public.health
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(cardinality(p_benefit_ids), 0) = 0 then 'not_set'::public.health
    when exists (select 1 from public.benefits b join public.v_benefit_realisation r on r.benefit_id = b.id
                 where b.id = any (p_benefit_ids) and (b.confidence = 'low' or r.behind_profile)) then 'red'::public.health
    when exists (select 1 from public.v_benefit_realisation r where r.benefit_id = any (p_benefit_ids) and r.measurement_overdue)
      or (p_stage_index >= 2 and exists (select 1 from public.benefits b where b.id = any (p_benefit_ids)
                                         and (b.status = 'identified' or not b.eligibility_confirmed))) then 'amber'::public.health
    else 'green'::public.health
  end;
$$;
grant execute on function private.benefit_dimension_health(uuid[], integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Project, programme and portfolio health. overall = override, else the worst dimension.
-- forecast_finish_date is the declared finish today (forecast_basis = 'declared'); the
-- forecast-engine phase switches the basis without renaming the column.
-- ---------------------------------------------------------------------------
create view public.v_project_health with (security_invoker = true) as
with base as (
  select p.*, o.settings, private.org_today(p.organisation_id) as today,
    s.task_count, s.overdue_count
  from public.v_projects p
  join public.organisations o on o.id = p.organisation_id
  join public.v_project_task_stats s on s.project_id = p.id
),
dims as (
  select
    base.id,
    case
      when exists (select 1 from public.v_milestones m where m.project_id = base.id and m.status = 'overdue') then 'red'::public.health
      when (base.baseline_finish_date - base.start_date) > 0
        and (base.finish_date - base.baseline_finish_date)::numeric / (base.baseline_finish_date - base.start_date)
            > private.health_threshold(base.settings, 'scheduleSlipPercent') / 100 then 'red'::public.health
      when base.task_count > 0
        and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueAtRiskPercent') / 100 then 'amber'::public.health
      else 'green'::public.health
    end as schedule,
    case
      when base.forecast > base.budget * (1 + private.health_threshold(base.settings, 'financialOffTrackPercent') / 100) then 'red'::public.health
      when base.forecast > base.budget * (1 + private.health_threshold(base.settings, 'financialAtRiskPercent') / 100) then 'amber'::public.health
      else 'green'::public.health
    end as financial,
    case
      when base.task_count > 0 and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueOffTrackPercent') / 100 then 'red'::public.health
      when base.task_count > 0 and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueAtRiskPercent') / 100 then 'amber'::public.health
      else 'green'::public.health
    end as effort,
    case
      when exists (select 1 from public.issues i where i.project_id = base.id and i.status = 'open' and i.severity = 'high')
        or exists (select 1 from public.risks r where r.project_id = base.id and r.status = 'open'
                   and r.score >= private.health_threshold(base.settings, 'riskScoreOffTrack')) then 'red'::public.health
      when exists (select 1 from public.issues i where i.project_id = base.id and i.status = 'open')
        or exists (select 1 from public.risks r where r.project_id = base.id and r.status = 'open'
                   and r.score >= private.health_threshold(base.settings, 'riskScoreAtRisk')) then 'amber'::public.health
      else 'green'::public.health
    end as issue,
    private.benefit_dimension_health(
      array(select bp.benefit_id from public.benefit_projects bp where bp.project_id = base.id), base.phase_index) as benefit
  from base
)
select
  base.id as project_id,
  base.organisation_id,
  base.workspace_id,
  base.programme_id,
  base.effective_portfolio_id,
  dims.schedule, dims.financial, dims.effort, dims.issue, dims.benefit,
  greatest(dims.schedule, dims.financial, dims.effort, dims.issue, dims.benefit) as computed_overall,
  coalesce(base.health_override, greatest(dims.schedule, dims.financial, dims.effort, dims.issue, dims.benefit)) as overall,
  base.health_override is not null as is_overridden,
  base.finish_date as forecast_finish_date,
  'declared'::text as forecast_basis
from base join dims on dims.id = base.id;

create view public.v_programme_health with (security_invoker = true) as
with kids as (
  select ph.programme_id, max(ph.overall) as worst_project, max(ph.forecast_finish_date) as forecast_finish_date,
    max(vp.phase_index) as max_phase_index
  from public.v_project_health ph join public.v_projects vp on vp.id = ph.project_id
  where ph.programme_id is not null
  group by ph.programme_id
),
dims as (
  select pr.*, kids.worst_project, kids.forecast_finish_date, kids.max_phase_index,
    private.benefit_dimension_health(
      array(select b.id from public.benefits b where b.programme_id = pr.id), greatest(0, coalesce(kids.max_phase_index, 0))) as benefit
  from public.programmes pr left join kids on kids.programme_id = pr.id
  where pr.archived_at is null
)
select
  dims.id as programme_id,
  dims.organisation_id,
  dims.workspace_id,
  dims.portfolio_id,
  dims.benefit,
  coalesce(greatest(dims.worst_project, dims.benefit), 'not_set') as computed_overall,
  coalesce(dims.health_override, greatest(dims.worst_project, dims.benefit), 'not_set') as overall,
  dims.health_override is not null as is_overridden,
  coalesce(dims.forecast_finish_date, dims.finish_date) as forecast_finish_date,
  'declared'::text as forecast_basis
from dims;

create view public.v_portfolio_health with (security_invoker = true) as
select
  pf.id as portfolio_id,
  pf.organisation_id,
  pf.workspace_id,
  coalesce(greatest(
    (select max(g.overall) from public.v_programme_health g where g.portfolio_id = pf.id),
    (select max(h.overall) from public.v_project_health h where h.programme_id is null and h.effective_portfolio_id = pf.id)
  ), 'not_set') as computed_overall,
  coalesce(pf.health_override, greatest(
    (select max(g.overall) from public.v_programme_health g where g.portfolio_id = pf.id),
    (select max(h.overall) from public.v_project_health h where h.programme_id is null and h.effective_portfolio_id = pf.id)
  ), 'not_set') as overall,
  pf.health_override is not null as is_overridden,
  (select max(h.forecast_finish_date) from public.v_project_health h where h.effective_portfolio_id = pf.id) as forecast_finish_date,
  'declared'::text as forecast_basis
from public.portfolios pf
where pf.archived_at is null;

-- ---------------------------------------------------------------------------
-- Dependencies: health, boundary and acceptance (getDependencyHealth, getBoundary).
-- ---------------------------------------------------------------------------
create view public.v_dependency_health with (security_invoker = true) as
with ends as (
  select d.*,
    private.org_today(d.organisation_id) as today,
    private.health_threshold(o.settings, 'dependencyAtRiskWorkingDays') as at_risk_days,
    coalesce(d.giver_programme_id, gp.programme_id, gmp.programme_id) as giver_end_programme_id,
    coalesce(d.receiver_programme_id, rp.programme_id, rmp.programme_id) as receiver_end_programme_id,
    gm.forecast_date as giver_forecast_date, gm.actual_date as giver_actual_date, gm.id as giver_ms
  from public.dependencies d
  join public.organisations o on o.id = d.organisation_id
  left join public.projects gp on gp.id = d.giver_project_id
  left join public.milestones gm on gm.id = d.giver_milestone_id
  left join public.projects gmp on gmp.id = gm.project_id
  left join public.projects rp on rp.id = d.receiver_project_id
  left join public.milestones rm on rm.id = d.receiver_milestone_id
  left join public.projects rmp on rmp.id = rm.project_id
)
select
  e.id as dependency_id,
  e.organisation_id,
  e.workspace_id,
  e.giver_end_programme_id,
  e.receiver_end_programme_id,
  case
    when e.health_override is not null then e.health_override
    when e.validation = 'closed' then 'green'::public.health
    when e.validation = 'broken' then 'red'::public.health
    when e.type = 'sequencing' and e.giver_ms is not null then
      case
        when e.giver_actual_date is not null then 'green'::public.health
        when e.giver_forecast_date > e.required_by_date then 'red'::public.health
        when private.working_days_between(e.giver_forecast_date, e.required_by_date) <= e.at_risk_days then 'amber'::public.health
        else 'green'::public.health
      end
    when e.required_by_date < e.today then 'red'::public.health
    when not (e.giver_accepted and e.receiver_accepted) and private.working_days_between(e.today, e.required_by_date) <= 20 then 'amber'::public.health
    else 'green'::public.health
  end as health,
  case
    when e.giver_external_name is not null or e.receiver_external_name is not null then 'cross_portfolio'
    when e.giver_end_programme_id is not null and e.giver_end_programme_id = e.receiver_end_programme_id then 'within_programme'
    when coalesce(gpr.project_manager_id, gpr.manager_id) is not null and coalesce(rpr.project_manager_id, rpr.manager_id) is not null
      and coalesce(gpr.project_manager_id, gpr.manager_id) <> coalesce(rpr.project_manager_id, rpr.manager_id) then 'cross_pm'
    else 'cross_programme'
  end as boundary,
  case
    when e.validation = 'closed' then 'closed'
    when e.giver_accepted and e.receiver_accepted then 'confirmed'
    when not e.giver_accepted and not e.receiver_accepted then 'awaiting_both'
    when e.giver_accepted then 'awaiting_receiver'
    else 'awaiting_giver'
  end as acceptance_state,
  case when e.type = 'sequencing' and e.giver_ms is not null and e.giver_actual_date is null
       then private.working_days_between(e.required_by_date, e.giver_forecast_date) end as slip_working_days
from ends e
left join public.programmes gpr on gpr.id = e.giver_end_programme_id
left join public.programmes rpr on rpr.id = e.receiver_end_programme_id;

-- ---------------------------------------------------------------------------
-- Roadmaps: linked items take everything from the project (getResolvedRoadmapItems).
-- ---------------------------------------------------------------------------
create view public.v_roadmap_items with (security_invoker = true) as
select
  ri.id,
  ri.organisation_id,
  ri.workspace_id,
  ri.roadmap_id,
  ri.row_id,
  ri.project_id,
  ri.sort_order,
  (ri.project_id is not null) as is_linked,
  coalesce(p.name, ri.title) as title,
  coalesce(p.start_date, ri.start_date) as start_date,
  coalesce(p.finish_date, ri.finish_date) as finish_date,
  case
    when p.id is null then coalesce(ri.progress, 0)
    when s.task_count > 0 then s.avg_percent_complete
    else private.js_round(((p.phase_index + 0.5) / greatest(p.phase_count, 1)) * 100)::integer
  end as progress,
  case
    when p.id is null then coalesce(ri.health, 'not_set')
    when p.state = 'closed' then 'green'::public.health
    when p.state = 'proposed' then 'not_set'::public.health
    when p.priority = 'critical' and h.overall = 'red' then 'red'::public.health
    when p.priority = 'high' or h.overall = 'amber' then 'amber'::public.health
    else 'green'::public.health
  end as health,
  (p.state = 'closed') is true as is_done,
  coalesce(p.manager_id, ri.owner_id) as owner_id,
  coalesce(p.priority, ri.priority) as priority,
  coalesce(p.programme_id, rr.programme_id) as programme_id
from public.roadmap_items ri
join public.roadmap_rows rr on rr.id = ri.row_id
left join public.v_projects p on p.id = ri.project_id
left join public.v_project_task_stats s on s.project_id = p.id
left join public.v_project_health h on h.project_id = p.id
where ri.project_id is null or p.id is not null;

create view public.v_roadmap_key_dates with (security_invoker = true) as
select
  k.*,
  case
    when k.date < private.org_today(k.organisation_id) then 'completed'::public.delivery_status
    when k.date - private.org_today(k.organisation_id) <= 30 then 'on_track'::public.delivery_status
    else 'future'::public.delivery_status
  end as status
from public.roadmap_key_dates k;

-- ---------------------------------------------------------------------------
-- Issued work items: the latest offer per item decides the issued-task status.
-- ---------------------------------------------------------------------------
create view public.v_issued_work_items with (security_invoker = true) as
select
  w.*,
  o.id as offer_id,
  o.issued_by,
  o.issued_to,
  o.issued_at,
  o.acknowledgement_due_date,
  o.reminder_sent_at,
  o.response,
  o.proposed_date,
  o.comment as response_comment,
  o.responded_at,
  case
    when w.status = 'in_progress' then 'in_progress'
    when w.status = 'done' then 'done'
    when o.response = 'accepted' then 'accepted'
    when o.response = 'declined' then 'declined'
    when o.response = 'proposed_date' then 'proposed_new_date'
    else 'issued'
  end as issued_status,
  case
    when p.task_source = 'native' then 'not_applicable'
    when w.external_id is not null then 'created_in_planner'
    when o.response = 'accepted' or w.status in ('not_started', 'in_progress', 'done') then 'syncing'
    else 'pending_acceptance'
  end as planner_sync
from public.v_work_items w
join public.projects p on p.id = w.project_id
join lateral (
  select * from public.work_item_offers x where x.work_item_id = w.id order by x.issued_at desc, x.created_at desc limit 1
) o on true;

revoke all on public.v_projects, public.v_work_items, public.v_project_task_stats, public.v_milestones,
  public.v_benefit_period_values, public.v_benefit_realisation, public.v_project_health, public.v_programme_health,
  public.v_portfolio_health, public.v_dependency_health, public.v_roadmap_items, public.v_roadmap_key_dates,
  public.v_issued_work_items from anon, authenticated;
grant select on public.v_projects, public.v_work_items, public.v_project_task_stats, public.v_milestones,
  public.v_benefit_period_values, public.v_benefit_realisation, public.v_project_health, public.v_programme_health,
  public.v_portfolio_health, public.v_dependency_health, public.v_roadmap_items, public.v_roadmap_key_dates,
  public.v_issued_work_items to authenticated;
