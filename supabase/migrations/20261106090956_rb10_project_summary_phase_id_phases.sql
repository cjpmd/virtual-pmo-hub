-- Migration: add phase_id and phases array to rb_project_summary so the
-- ProjectOverviewPanel can show lifecycle (Phase N of M, name) in the report
-- viewer, print and PPTX export.
--
-- safe: CREATE OR REPLACE on a SQL STABLE function never needs a DROP.

create or replace function private.rb_project_summary(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(x) from (
    select p.id, p.code, p.name, p.tier::text as tier, p.priority::text as priority,
      p.state::text as state,
      p.phase_id,
      lp.name as phase, p.phase_index, p.phase_count,
      p.start_date, p.finish_date, p.baseline_finish_date,
      h.forecast_finish_date, h.finish_vs_baseline_days,
      g.name as programme,
      mgr.name as manager, sp.name as sponsor, po.name as project_officer,
      round(coalesce(t.avg_percent_complete, 0)) as percent_complete,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',         lp2.id,
          'name',       lp2.name,
          'short_name', lp2.short_name,
          'gate_name',  lp2.gate_name,
          'sort_order', lp2.sort_order
        ) order by lp2.sort_order)
        from public.lifecycle_phases lp2
        where lp2.organisation_id = p.organisation_id
      ), '[]'::jsonb) as phases
    from public.v_projects p
    left join public.lifecycle_phases lp on lp.id = p.phase_id
    left join public.project_health_current h on h.project_id = p.id
    left join public.programmes g on g.id = p.programme_id
    left join public.resources mgr on mgr.id = p.manager_id
    left join public.resources sp on sp.id = p.sponsor_id
    left join public.resources po on po.id = p.project_officer_id
    left join public.v_project_task_stats t on t.project_id = p.id
    where p.id = private.rb_single_project(ctx)) x;
$$;
