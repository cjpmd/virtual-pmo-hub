-- Stage 1 header: finish_slip_health, computed once in v_project_delivery_health.
-- The header shows "N days late" under Forecast finish in amber or red per the schedule
-- tolerance. That colour is a RAG decision, so it comes from the views, not the browser.
--
-- v_project_delivery_health: a new `slip` step works out finish_slip_health for the forecast
-- finish, taken as the later of the latest milestone date and the declared finish (finish_date),
-- so a PM-declared slip counts even when the milestones haven't been updated:
--   not_set  no forecast finish or no baseline finish
--   green    on or before the baseline finish
--   red      late by more than scheduleSlipPercent of the baseline duration
--   amber    late, within tolerance
-- The schedule CASE uses it for its forecast-finish clauses instead of repeating the sum:
--   red    finish_slip_health = 'red'    (was: milestone forecast finish beyond tolerance, or
--                                          declared finish beyond tolerance)
--   amber  finish_slip_health = 'amber'  (was: milestone forecast finish after baseline)
-- The other schedule clauses are unchanged. New behaviour: a declared finish late within
-- tolerance now gives amber (before, only a milestone forecast finish could).
-- finish_slip_health is a trailing column on v_project_delivery_health and v_project_health
-- (v_project_health stores its delivery columns expanded, so it is re-created to carry it).
-- v_project_health.forecast_finish_date is unchanged (milestones if any, else declared finish).
-- Both views otherwise unchanged; create or replace only, no drops.
--
-- Dry run 12/10/2026 (both views as temp views, compared with the live views by EXCEPT both
-- ways; nothing written):
--   every column other than schedule/delivery/overall: 0 rows differ on either view (37 rows)
--   schedule, delivery, computed_overall: no project differs from live (16 green, 14 amber, 7 red)
--   finish_slip_health: green 29, amber 7 (ACA, CAIG, DOC, IOFTC, NRDC, SFZ, W11), red 1 (FSC);
--     identical to the slip on the shown forecast finish. 17 projects have a declared finish later
--     than their milestones, but every one equals its baseline finish, so none changes colour.
--   Live schedule moved from 21/11/5 (Stage 1a apply, 08/10) to 16/14/7 by dates alone: replaying
--   the views with vpmo.today = 08/10 gives 21/11/5 and reproduces the 99 job snapshots for
--   09-11/10; no project, milestone, task, risk or issue was edited after the apply.
-- Applied 12/10/2026 after approval.

create or replace view public.v_project_delivery_health with (security_invoker = true) as
with base as (
  select p.*, o.settings, private.org_today(p.organisation_id) as today,
    s.task_count, s.overdue_count
  from public.v_projects p
  join public.organisations o on o.id = p.organisation_id
  join public.v_project_task_stats s on s.project_id = p.id
),
ms as materialized (
  select m.project_id,
    bool_or(m.status = 'overdue') as any_forecast_missed,
    max(m.slip_days) filter (where m.actual_date is null) as worst_open_slip,
    max(coalesce(m.actual_date, m.forecast_date)) as forecast_finish,
    count(*) filter (where m.baseline_date > p.baseline_finish_date) as after_baseline_finish
  from public.v_milestones m
  join public.projects p on p.id = m.project_id
  group by m.project_id
),
-- Forecast finish against the baseline finish: the later of the latest milestone date and the
-- declared finish, so a PM-declared slip counts even when the milestones haven't been updated.
-- The only place the scheduleSlipPercent tolerance is worked out for the finish date.
slip as materialized (
  select base.id, f.forecast_finish,
    case
      when f.forecast_finish is null or base.baseline_finish_date is null then 'not_set'::public.health
      when f.forecast_finish <= base.baseline_finish_date then 'green'::public.health
      when (base.baseline_finish_date - base.start_date) > 0
        and (f.forecast_finish - base.baseline_finish_date)::numeric / (base.baseline_finish_date - base.start_date)
            > private.health_threshold(base.settings, 'scheduleSlipPercent') / 100 then 'red'::public.health
      else 'amber'::public.health
    end as finish_slip_health
  from base
  left join ms on ms.project_id = base.id
  cross join lateral (select greatest(ms.forecast_finish, base.finish_date) as forecast_finish) f
),
dims as materialized (
  select
    base.id,
    case
      when coalesce(ms.any_forecast_missed, false) then 'red'::public.health
      when ms.worst_open_slip > 30 then 'red'::public.health
      when slip.finish_slip_health = 'red' then 'red'::public.health
      when ms.worst_open_slip >= 15 then 'amber'::public.health
      when slip.finish_slip_health = 'amber' then 'amber'::public.health
      when base.task_count > 0
        and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueAtRiskPercent') / 100 then 'amber'::public.health
      else 'green'::public.health
    end as schedule,
    case
      when not base.has_baseline then 'not_set'::public.health
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
    ms.forecast_finish,
    coalesce(ms.after_baseline_finish, 0) as after_baseline_finish,
    slip.finish_slip_health
  from base
  left join ms on ms.project_id = base.id
  join slip on slip.id = base.id
)
select
  base.id as project_id,
  base.organisation_id,
  base.workspace_id,
  base.programme_id,
  base.effective_portfolio_id,
  base.code,
  base.state,
  base.phase_index,
  base.health_override,
  base.finish_date,
  dims.schedule, dims.financial, dims.effort, dims.issue,
  greatest(dims.schedule, dims.financial, dims.effort, dims.issue) as delivery,
  base.baseline_finish_date,
  dims.forecast_finish as milestone_forecast_finish,
  dims.after_baseline_finish as milestones_after_baseline_finish,
  dims.finish_slip_health
from base join dims on dims.id = base.id;

create or replace view public.v_project_health with (security_invoker = true) as
with delivery as materialized (
  select * from public.v_project_delivery_health
),
benefit_flags as materialized (
  select b.id, b.ref,
    coalesce(b.realisation_start_date <= private.org_today(b.organisation_id), false) as in_realisation,
    (b.confidence = 'low' or coalesce(r.behind_profile, false)) as is_red,
    coalesce(r.measurement_overdue, false) as is_overdue,
    (b.status = 'identified' or not b.eligibility_confirmed) as is_unvalidated,
    b.confidence = 'low' and b.status <> 'closed' as is_low,
    b.status <> 'closed' as is_open
  from public.benefits b
  left join public.v_benefit_realisation r on r.benefit_id = b.id
),
cap_delivery as materialized (
  select cp.capability_id,
    string_agg(d.code, ', ' order by d.code) filter (where d.delivery = 'red') as red_projects,
    string_agg(d.code, ', ' order by d.code) filter (where d.delivery = 'amber') as amber_projects
  from public.capability_projects cp
  join delivery d on d.project_id = cp.project_id
  where d.state <> 'closed'
  group by cp.capability_id
),
caps as materialized (
  select c.id, c.title, x.rag, x.reason
  from public.capabilities c
  join public.organisations o on o.id = c.organisation_id
  left join cap_delivery cd on cd.capability_id = c.id
  cross join lateral private.capability_rag(c.status, c.target_date, c.forecast_date, c.accepted_at,
    private.org_today(c.organisation_id), private.health_threshold(o.settings, 'acceptanceGraceDays')::integer,
    private.health_threshold(o.settings, 'capabilitySlipAmberDays'), cd.red_projects, cd.amber_projects) x
  where c.archived_at is null
),
items as (
  select cp.project_id, ch.rag, 1 as priority, 'Capability "' || ch.title || '": ' || ch.reason as reason
  from public.capability_projects cp
  join caps ch on ch.id = cp.capability_id
  union all
  select bp.project_id,
    case when f.is_red then 'red'::public.health when f.is_overdue or f.is_unvalidated then 'amber'::public.health else 'green'::public.health end,
    2,
    'Benefit ' || f.ref || ': ' || case when f.is_red then 'confidence low or behind profile'
                                        when f.is_overdue then 'measurement overdue'
                                        when f.is_unvalidated then 'not yet validated'
                                        else 'realising to profile' end
  from public.benefit_projects bp
  join benefit_flags f on f.id = bp.benefit_id and f.in_realisation
  union all
  select bp.project_id, 'amber'::public.health, 3, 'Benefit confidence low, not yet validated'
  from public.benefit_projects bp
  join benefit_flags f on f.id = bp.benefit_id and not f.in_realisation
  join delivery d on d.project_id = bp.project_id
  where f.is_low or (f.is_open and f.is_unvalidated and d.phase_index >= 2)
),
benefit as materialized (
  select distinct on (i.project_id) i.project_id, i.rag, i.reason
  from items i
  order by i.project_id, i.rag desc, i.priority, i.reason
)
select
  d.project_id,
  d.organisation_id,
  d.workspace_id,
  d.programme_id,
  d.effective_portfolio_id,
  d.schedule, d.financial, d.effort, d.issue,
  coalesce(b.rag, 'not_set'::public.health) as benefit,
  greatest(d.delivery, coalesce(b.rag, 'not_set'::public.health)) as computed_overall,
  coalesce(d.health_override, greatest(d.delivery, coalesce(b.rag, 'not_set'::public.health))) as overall,
  d.health_override is not null as is_overridden,
  coalesce(d.milestone_forecast_finish, d.finish_date) as forecast_finish_date,
  case when d.milestone_forecast_finish is not null then 'milestones' else 'declared' end::text as forecast_basis,
  coalesce(b.reason, 'No capabilities or benefits in realisation') as benefit_reason,
  d.finish_slip_health
from delivery d
left join benefit b on b.project_id = d.project_id;
