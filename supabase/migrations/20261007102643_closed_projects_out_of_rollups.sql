-- Closed projects no longer count in programme or portfolio roll-ups: their health is history,
-- not a current risk. v_programme_health's worst project, forecast finish and furthest phase
-- now come from open projects only (capability delivery already ignored closed projects), and
-- v_portfolio_health's directly-held projects likewise. Lists show closed projects as "Closed"
-- rather than a RAG (front end).

-- Programme health: the benefit rule over the programme's capabilities and benefits (BP-8) and
-- the worst open project. Capability health reads the delivery dimensions of v_project_health,
-- so they are computed once.
create or replace view public.v_programme_health with (security_invoker = true) as
with ph as materialized (
  select ph.*, vp.code, vp.state, vp.phase_index, greatest(ph.schedule, ph.financial, ph.effort, ph.issue) as delivery
  from public.v_project_health ph join public.v_projects vp on vp.id = ph.project_id
),
kids as materialized (
  select ph.programme_id, max(ph.overall) as worst_project, max(ph.forecast_finish_date) as forecast_finish_date,
    max(ph.phase_index) as max_phase_index
  from ph
  where ph.programme_id is not null and ph.state <> 'closed'
  group by ph.programme_id
),
cap_delivery as materialized (
  select cp.capability_id,
    string_agg(ph.code, ', ' order by ph.code) filter (where ph.delivery = 'red') as red_projects,
    string_agg(ph.code, ', ' order by ph.code) filter (where ph.delivery = 'amber') as amber_projects
  from public.capability_projects cp
  join ph on ph.project_id = cp.project_id
  where ph.state <> 'closed'
  group by cp.capability_id
),
caps as materialized (
  select c.programme_id, c.title, x.rag, x.reason
  from public.capabilities c
  join public.organisations o on o.id = c.organisation_id
  left join cap_delivery cd on cd.capability_id = c.id
  cross join lateral private.capability_rag(c.status, c.target_date, c.forecast_date, c.accepted_at,
    private.org_today(c.organisation_id), private.health_threshold(o.settings, 'acceptanceGraceDays')::integer,
    private.health_threshold(o.settings, 'capabilitySlipAmberDays'), cd.red_projects, cd.amber_projects) x
  where c.archived_at is null
),
benefit_flags as materialized (
  select b.programme_id, b.ref,
    coalesce(b.realisation_start_date <= private.org_today(b.organisation_id), false) as in_realisation,
    (b.confidence = 'low' or coalesce(r.behind_profile, false)) as is_red,
    coalesce(r.measurement_overdue, false) as is_overdue,
    (b.status = 'identified' or not b.eligibility_confirmed) as is_unvalidated,
    b.confidence = 'low' and b.status <> 'closed' as is_low,
    b.status <> 'closed' as is_open
  from public.benefits b
  left join public.v_benefit_realisation r on r.benefit_id = b.id
  where b.programme_id is not null
),
items as (
  select ch.programme_id, ch.rag, 1 as priority, 'Capability "' || ch.title || '": ' || ch.reason as reason
  from caps ch
  union all
  select f.programme_id,
    case when f.is_red then 'red'::public.health when f.is_overdue or f.is_unvalidated then 'amber'::public.health else 'green'::public.health end,
    2,
    'Benefit ' || f.ref || ': ' || case when f.is_red then 'confidence low or behind profile'
                                        when f.is_overdue then 'measurement overdue'
                                        when f.is_unvalidated then 'not yet validated'
                                        else 'realising to profile' end
  from benefit_flags f where f.in_realisation
  union all
  select f.programme_id, 'amber'::public.health, 3, 'Benefit confidence low, not yet validated'
  from benefit_flags f
  left join kids on kids.programme_id = f.programme_id
  where not f.in_realisation and (f.is_low or (f.is_open and f.is_unvalidated and greatest(0, coalesce(kids.max_phase_index, 0)) >= 2))
),
benefit as materialized (
  select distinct on (i.programme_id) i.programme_id, i.rag, i.reason
  from items i
  order by i.programme_id, i.rag desc, i.priority, i.reason
),
dims as (
  select pr.*, kids.worst_project, kids.forecast_finish_date,
    coalesce(bn.rag, 'not_set'::public.health) as benefit,
    coalesce(bn.reason, 'No capabilities or benefits in realisation') as benefit_reason
  from public.programmes pr
  left join kids on kids.programme_id = pr.id
  left join benefit bn on bn.programme_id = pr.id
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
  'declared'::text as forecast_basis,
  dims.benefit_reason
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
  join public.projects p on p.id = h.project_id
  where p.state <> 'closed'
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
