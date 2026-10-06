-- Health views: compute each piece once per query.
--
-- Same columns and the same results (verified with supabase/tests/health_views_snapshot.sql
-- before and after); only the evaluation changes:
--   * v_project_health: the dimensions CTE is MATERIALIZED. Inlined, every dimension was
--     evaluated three times per project (its own column, computed_overall and overall).
--   * Benefit health no longer calls benefit_dimension_health() per project or programme;
--     each call recomputed v_benefit_realisation for every visible benefit. The same rules
--     are applied from one pass over the benefits (benefit_flags), then rolled up:
--       not_set  no linked benefits
--       red      any linked benefit with low confidence or behind profile
--       amber    any measurement overdue, or (phase index >= 2) any benefit still identified
--                or not confirmed eligible
--       green    otherwise
--     benefit_dimension_health() stays for single-item callers.
--   * v_portfolio_health: programme and project roll-ups are aggregated once and joined,
--     instead of five correlated sub-queries per portfolio.

create or replace view public.v_project_health with (security_invoker = true) as
with base as (
  select p.*, o.settings, private.org_today(p.organisation_id) as today,
    s.task_count, s.overdue_count
  from public.v_projects p
  join public.organisations o on o.id = p.organisation_id
  join public.v_project_task_stats s on s.project_id = p.id
),
benefit_flags as materialized (
  select b.id,
    r.benefit_id is not null and (b.confidence = 'low' or coalesce(r.behind_profile, false)) as is_red,
    coalesce(r.measurement_overdue, false) as is_overdue,
    (b.status = 'identified' or not b.eligibility_confirmed) as is_unvalidated
  from public.benefits b
  left join public.v_benefit_realisation r on r.benefit_id = b.id
),
project_benefits as materialized (
  select bp.project_id, count(*) as linked,
    coalesce(bool_or(f.is_red), false) as any_red,
    coalesce(bool_or(f.is_overdue), false) as any_overdue,
    coalesce(bool_or(f.is_unvalidated), false) as any_unvalidated
  from public.benefit_projects bp
  left join benefit_flags f on f.id = bp.benefit_id
  group by bp.project_id
),
dims as materialized (
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
    case
      when coalesce(pb.linked, 0) = 0 then 'not_set'::public.health
      when pb.any_red then 'red'::public.health
      when pb.any_overdue or (base.phase_index >= 2 and pb.any_unvalidated) then 'amber'::public.health
      else 'green'::public.health
    end as benefit
  from base
  left join project_benefits pb on pb.project_id = base.id
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

create or replace view public.v_programme_health with (security_invoker = true) as
with kids as materialized (
  select ph.programme_id, max(ph.overall) as worst_project, max(ph.forecast_finish_date) as forecast_finish_date,
    max(vp.phase_index) as max_phase_index
  from public.v_project_health ph join public.v_projects vp on vp.id = ph.project_id
  where ph.programme_id is not null
  group by ph.programme_id
),
benefit_flags as materialized (
  select b.programme_id,
    r.benefit_id is not null and (b.confidence = 'low' or coalesce(r.behind_profile, false)) as is_red,
    coalesce(r.measurement_overdue, false) as is_overdue,
    (b.status = 'identified' or not b.eligibility_confirmed) as is_unvalidated
  from public.benefits b
  left join public.v_benefit_realisation r on r.benefit_id = b.id
  where b.programme_id is not null
),
programme_benefits as materialized (
  select f.programme_id, count(*) as linked,
    bool_or(f.is_red) as any_red, bool_or(f.is_overdue) as any_overdue, bool_or(f.is_unvalidated) as any_unvalidated
  from benefit_flags f
  group by f.programme_id
),
dims as (
  select pr.*, kids.worst_project, kids.forecast_finish_date, kids.max_phase_index,
    case
      when coalesce(pg.linked, 0) = 0 then 'not_set'::public.health
      when pg.any_red then 'red'::public.health
      when pg.any_overdue or (greatest(0, coalesce(kids.max_phase_index, 0)) >= 2 and pg.any_unvalidated) then 'amber'::public.health
      else 'green'::public.health
    end as benefit
  from public.programmes pr
  left join kids on kids.programme_id = pr.id
  left join programme_benefits pg on pg.programme_id = pr.id
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

create or replace view public.v_portfolio_health with (security_invoker = true) as
with programmes as materialized (
  select g.portfolio_id, max(g.overall) as worst
  from public.v_programme_health g
  group by g.portfolio_id
),
projects as materialized (
  select h.effective_portfolio_id as portfolio_id,
    max(h.overall) filter (where h.programme_id is null) as worst_direct,
    max(h.forecast_finish_date) as forecast_finish_date
  from public.v_project_health h
  group by h.effective_portfolio_id
)
select
  pf.id as portfolio_id,
  pf.organisation_id,
  pf.workspace_id,
  coalesce(greatest(pg.worst, pj.worst_direct), 'not_set') as computed_overall,
  coalesce(pf.health_override, greatest(pg.worst, pj.worst_direct), 'not_set') as overall,
  pf.health_override is not null as is_overridden,
  pj.forecast_finish_date,
  'declared'::text as forecast_basis
from public.portfolios pf
left join programmes pg on pg.portfolio_id = pf.id
left join projects pj on pj.portfolio_id = pf.id
where pf.archived_at is null;
