-- Shell health views, fix A1 (docs/sql/perf-shell-views.sql): v_project_health gains trailing
-- code/state/phase_index; v_programme_health reads them instead of joining v_projects (which
-- re-ran v_project_financials once per project row); v_portfolio_health reads state from it
-- instead of joining projects. Output identical (dry run: 0 rows differ on all three views).

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
  d.forecast_finish_date,
  case when d.milestone_forecast_finish is null or d.finish_date > d.milestone_forecast_finish
       then 'declared' else 'milestones' end::text as forecast_basis,
  coalesce(b.reason, 'No capabilities or benefits in realisation') as benefit_reason,
  d.finish_slip_health,
  -- New trailing columns so v_programme_health and v_portfolio_health don't join back to
  -- v_projects / projects for them.
  d.code,
  d.state,
  d.phase_index
from delivery d
left join benefit b on b.project_id = d.project_id;


create or replace view public.v_programme_health with (security_invoker = true) as
WITH ph AS MATERIALIZED (
         SELECT ph.project_id,
            ph.organisation_id,
            ph.workspace_id,
            ph.programme_id,
            ph.effective_portfolio_id,
            ph.schedule,
            ph.financial,
            ph.effort,
            ph.issue,
            ph.benefit,
            ph.computed_overall,
            ph.overall,
            ph.is_overridden,
            ph.forecast_finish_date,
            ph.forecast_basis,
            ph.benefit_reason,
            ph.code,
            ph.state,
            ph.phase_index,
            GREATEST(ph.schedule, ph.financial, ph.effort, ph.issue) AS delivery
           FROM v_project_health ph
        ), kids AS MATERIALIZED (
         SELECT ph.programme_id,
            max(ph.overall) AS worst_project,
            max(ph.forecast_finish_date) AS forecast_finish_date,
            max(ph.phase_index) AS max_phase_index
           FROM ph
          WHERE ph.programme_id IS NOT NULL AND ph.state <> 'closed'::project_state
          GROUP BY ph.programme_id
        ), cap_delivery AS MATERIALIZED (
         SELECT cp.capability_id,
            string_agg(ph.code, ', '::text ORDER BY ph.code) FILTER (WHERE ph.delivery = 'red'::health) AS red_projects,
            string_agg(ph.code, ', '::text ORDER BY ph.code) FILTER (WHERE ph.delivery = 'amber'::health) AS amber_projects
           FROM capability_projects cp
             JOIN ph ON ph.project_id = cp.project_id
          WHERE ph.state <> 'closed'::project_state
          GROUP BY cp.capability_id
        ), caps AS MATERIALIZED (
         SELECT c.programme_id,
            c.title,
            x.rag,
            x.reason
           FROM capabilities c
             JOIN organisations o ON o.id = c.organisation_id
             LEFT JOIN cap_delivery cd ON cd.capability_id = c.id
             CROSS JOIN LATERAL private.capability_rag(c.status, c.target_date, c.forecast_date, c.accepted_at, private.org_today(c.organisation_id), private.health_threshold(o.settings, 'acceptanceGraceDays'::text)::integer, private.health_threshold(o.settings, 'capabilitySlipAmberDays'::text), cd.red_projects, cd.amber_projects) x(rag, reason)
          WHERE c.archived_at IS NULL
        ), benefit_flags AS MATERIALIZED (
         SELECT b.programme_id,
            b.ref,
            COALESCE(b.realisation_start_date <= private.org_today(b.organisation_id), false) AS in_realisation,
            b.confidence = 'low'::confidence OR COALESCE(r.behind_profile, false) AS is_red,
            COALESCE(r.measurement_overdue, false) AS is_overdue,
            b.status = 'identified'::benefit_status OR NOT b.eligibility_confirmed AS is_unvalidated,
            b.confidence = 'low'::confidence AND b.status <> 'closed'::benefit_status AS is_low,
            b.status <> 'closed'::benefit_status AS is_open
           FROM benefits b
             LEFT JOIN v_benefit_realisation r ON r.benefit_id = b.id
          WHERE b.programme_id IS NOT NULL
        ), items AS (
         SELECT ch.programme_id,
            ch.rag,
            1 AS priority,
            (('Capability "'::text || ch.title) || '": '::text) || ch.reason AS reason
           FROM caps ch
        UNION ALL
         SELECT f.programme_id,
                CASE
                    WHEN f.is_red THEN 'red'::health
                    WHEN f.is_overdue OR f.is_unvalidated THEN 'amber'::health
                    ELSE 'green'::health
                END AS "case",
            2,
            (('Benefit '::text || f.ref) || ': '::text) ||
                CASE
                    WHEN f.is_red THEN 'confidence low or behind profile'::text
                    WHEN f.is_overdue THEN 'measurement overdue'::text
                    WHEN f.is_unvalidated THEN 'not yet validated'::text
                    ELSE 'realising to profile'::text
                END
           FROM benefit_flags f
          WHERE f.in_realisation
        UNION ALL
         SELECT f.programme_id,
            'amber'::health AS health,
            3,
            'Benefit confidence low, not yet validated'::text
           FROM benefit_flags f
             LEFT JOIN kids ON kids.programme_id = f.programme_id
          WHERE NOT f.in_realisation AND (f.is_low OR f.is_open AND f.is_unvalidated AND GREATEST(0, COALESCE(kids.max_phase_index, 0)) >= 2)
        ), benefit AS MATERIALIZED (
         SELECT DISTINCT ON (i.programme_id) i.programme_id,
            i.rag,
            i.reason
           FROM items i
          ORDER BY i.programme_id, i.rag DESC, i.priority, i.reason
        ), dims AS (
         SELECT pr.id,
            pr.organisation_id,
            pr.workspace_id,
            pr.portfolio_id,
            pr.name,
            pr.description,
            pr.start_date,
            pr.finish_date,
            pr.budget,
            pr.value_statement,
            pr.state,
            pr.closed_reason,
            pr.health_override,
            pr.health_override_reason,
            pr.archived_at,
            pr.manager_id,
            pr.project_manager_id,
            pr.project_officer_id,
            pr.sponsor_id,
            pr.created_at,
            pr.updated_at,
            pr.created_by,
            kids.worst_project,
            kids.forecast_finish_date,
            COALESCE(bn.rag, 'not_set'::health) AS benefit,
            COALESCE(bn.reason, 'No capabilities or benefits in realisation'::text) AS benefit_reason
           FROM programmes pr
             LEFT JOIN kids ON kids.programme_id = pr.id
             LEFT JOIN benefit bn ON bn.programme_id = pr.id
          WHERE pr.archived_at IS NULL
        )
 SELECT id AS programme_id,
    organisation_id,
    workspace_id,
    portfolio_id,
    benefit,
    COALESCE(GREATEST(worst_project, benefit), 'not_set'::health) AS computed_overall,
    COALESCE(health_override, GREATEST(worst_project, benefit), 'not_set'::health) AS overall,
    health_override IS NOT NULL AS is_overridden,
    COALESCE(forecast_finish_date, finish_date) AS forecast_finish_date,
    'declared'::text AS forecast_basis,
    benefit_reason
   FROM dims;

create or replace view public.v_portfolio_health with (security_invoker = true) as
WITH programmes AS MATERIALIZED (
         SELECT g.portfolio_id,
            max(g.overall) AS worst
           FROM v_programme_health g
          GROUP BY g.portfolio_id
        ), projects AS MATERIALIZED (
         SELECT h.effective_portfolio_id AS portfolio_id,
            max(h.overall) FILTER (WHERE h.programme_id IS NULL) AS worst_direct,
            max(h.forecast_finish_date) AS forecast_finish_date
           FROM v_project_health h
          WHERE h.state <> 'closed'::project_state
          GROUP BY h.effective_portfolio_id
        )
 SELECT pf.id AS portfolio_id,
    pf.organisation_id,
    pf.workspace_id,
    COALESCE(GREATEST(pg.worst, pj.worst_direct), 'not_set'::health) AS computed_overall,
    COALESCE(pf.health_override, GREATEST(pg.worst, pj.worst_direct), 'not_set'::health) AS overall,
    pf.health_override IS NOT NULL AS is_overridden,
    pj.forecast_finish_date,
    'declared'::text AS forecast_basis
   FROM portfolios pf
     LEFT JOIN programmes pg ON pg.portfolio_id = pf.id
     LEFT JOIN projects pj ON pj.portfolio_id = pf.id
  WHERE pf.archived_at IS NULL;
