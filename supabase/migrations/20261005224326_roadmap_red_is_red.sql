-- Roadmap health: a red project always shows red (Stage 4 decision). The prototype rule only
-- showed red when the project was also Critical priority, so a red Moderate project read as
-- green on the roadmap. Amber still covers High priority or amber health; closed is green
-- (shown as Done), proposed is not set.
create or replace view public.v_roadmap_items with (security_invoker = true) as
select ri.id,
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
    when p.id is null then coalesce(ri.progress::integer, 0)
    when s.task_count > 0 then s.avg_percent_complete
    else private.js_round(((p.phase_index::numeric + 0.5) / greatest(p.phase_count, 1)::numeric) * 100::numeric)::integer
  end as progress,
  case
    when p.id is null then coalesce(ri.health, 'not_set'::public.health)
    when p.state = 'closed'::public.project_state then 'green'::public.health
    when p.state = 'proposed'::public.project_state then 'not_set'::public.health
    when h.overall = 'red'::public.health then 'red'::public.health
    when p.priority = 'high'::public.priority or h.overall = 'amber'::public.health then 'amber'::public.health
    else 'green'::public.health
  end as health,
  ((p.state = 'closed'::public.project_state) is true) as is_done,
  coalesce(p.manager_id, ri.owner_id) as owner_id,
  coalesce(p.priority, ri.priority) as priority,
  coalesce(p.programme_id, rr.programme_id) as programme_id
from public.roadmap_items ri
  join public.roadmap_rows rr on rr.id = ri.row_id
  left join public.v_projects p on p.id = ri.project_id
  left join public.v_project_task_stats s on s.project_id = p.id
  left join public.v_project_health h on h.project_id = p.id
where ri.project_id is null or p.id is not null;
