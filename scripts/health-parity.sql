-- Health parity fixture, database side. Run against a seeded database with "today" pinned
-- to the seed's anchor (the Monday that mock 21/09/2026 maps to), e.g.
--   set vpmo.today = '<anchor>';  then run this query and save the single JSON value.
-- scripts/health-parity.ts compares it with services/pmo.ts on the original mock data.
with org as (select id from public.organisations where slug = 'demo-university')
select jsonb_build_object(
  'today', private.org_today((select id from org)),
  'projects', (select jsonb_object_agg(p.name, jsonb_build_object('schedule', h.schedule, 'financial', h.financial, 'effort', h.effort,
      'issue', h.issue, 'benefit', h.benefit, 'overall', h.overall, 'taskCount', s.task_count, 'overdue', s.overdue_count))
    from public.v_project_health h join public.projects p on p.id = h.project_id join public.v_project_task_stats s on s.project_id = p.id
    where p.organisation_id = (select id from org)),
  'programmes', (select jsonb_object_agg(pr.name, jsonb_build_object('overall', g.overall, 'benefit', g.benefit))
    from public.v_programme_health g join public.programmes pr on pr.id = g.programme_id where pr.organisation_id = (select id from org)),
  'portfolios', (select jsonb_object_agg(pf.name, f.overall)
    from public.v_portfolio_health f join public.portfolios pf on pf.id = f.portfolio_id where pf.organisation_id = (select id from org)),
  'benefits', (select jsonb_object_agg(b.title, jsonb_build_object('health', r.health, 'realised', r.realised_value,
      'percent', r.realised_percent, 'variance', r.variance_percent))
    from public.v_benefit_realisation r join public.benefits b on b.id = r.benefit_id where b.organisation_id = (select id from org)),
  'dependencies', (select jsonb_object_agg(d.ref, jsonb_build_object('health', v.health, 'boundary', v.boundary))
    from public.v_dependency_health v join public.dependencies d on d.id = v.dependency_id where d.organisation_id = (select id from org)),
  'milestones', (select jsonb_object_agg(p.name || ' / ' || m.title, m.status)
    from public.v_milestones m join public.projects p on p.id = m.project_id where p.organisation_id = (select id from org)),
  'roadmapItems', (select jsonb_object_agg(r.name || ' / ' || i.title, jsonb_build_object('health', i.health, 'done', i.is_done, 'progress', i.progress))
    from public.v_roadmap_items i join public.roadmaps r on r.id = i.roadmap_id where r.organisation_id = (select id from org))
) as result;
