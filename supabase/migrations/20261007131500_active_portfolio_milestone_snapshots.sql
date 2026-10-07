-- Portfolio snapshots record milestonesDue30 (active projects, not signed off, forecast within next 30 days inclusive).
-- Applied manually in the SQL editor; committed here to keep migrations in step.

-- The nightly job (and the status-report trigger) capture the pathway with the health.
create or replace function private.capture_health_snapshots(p_org uuid default null, p_date date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  c integer;
begin
  insert into public.health_snapshots (organisation_id, workspace_id, project_id, snapshot_date, overall, schedule, financial,
    effort, issue, benefit, forecast_finish_date, forecast_basis)
  select h.organisation_id, h.workspace_id, h.project_id, coalesce(p_date, private.org_today(h.organisation_id)), h.overall,
    h.schedule, h.financial, h.effort, h.issue, h.benefit, h.forecast_finish_date, h.forecast_basis
  from public.v_project_health h join public.projects p on p.id = h.project_id
  where p.state <> 'closed' and (p_org is null or h.organisation_id = p_org)
  on conflict (coalesce(portfolio_id, programme_id, project_id), snapshot_date) do update
    set overall = excluded.overall, schedule = excluded.schedule, financial = excluded.financial, effort = excluded.effort,
        issue = excluded.issue, benefit = excluded.benefit, forecast_finish_date = excluded.forecast_finish_date, is_synthetic = false;
  get diagnostics c = row_count; n := n + c;

  insert into public.health_snapshots (organisation_id, workspace_id, programme_id, snapshot_date, overall, benefit,
    forecast_finish_date, forecast_basis)
  select g.organisation_id, g.workspace_id, g.programme_id, coalesce(p_date, private.org_today(g.organisation_id)), g.overall,
    g.benefit, g.forecast_finish_date, g.forecast_basis
  from public.v_programme_health g join public.programmes pr on pr.id = g.programme_id
  where pr.state = 'active' and (p_org is null or g.organisation_id = p_org)
  on conflict (coalesce(portfolio_id, programme_id, project_id), snapshot_date) do update
    set overall = excluded.overall, benefit = excluded.benefit, forecast_finish_date = excluded.forecast_finish_date, is_synthetic = false;
  get diagnostics c = row_count; n := n + c;

  insert into public.health_snapshots (organisation_id, workspace_id, portfolio_id, snapshot_date, overall,
    forecast_finish_date, forecast_basis, metrics)
  select f.organisation_id, f.workspace_id, f.portfolio_id, coalesce(p_date, private.org_today(f.organisation_id)), f.overall,
    f.forecast_finish_date, f.forecast_basis,
    (select jsonb_build_object(
       'activeProjects', count(*),
       'budget', coalesce(sum(p.budget), 0),
       'forecast', coalesce(sum(p.forecast), 0),
       'spend', coalesce(sum(p.actual), 0),
       'variance', coalesce(sum(p.forecast - p.budget), 0),
       'green', count(*) filter (where h.overall = 'green'),
       'amber', count(*) filter (where h.overall = 'amber'),
       'red', count(*) filter (where h.overall = 'red'),
       'unset', count(*) filter (where h.overall = 'not_set'),
       'percentOnTrack', case when count(*) = 0 then 0 else private.js_round(100.0 * count(*) filter (where h.overall = 'green') / count(*)) end,
       'milestonesDue30', (select count(*) from public.milestones m join public.v_projects mp on mp.id = m.project_id
         where mp.effective_portfolio_id = f.portfolio_id and mp.state = 'active' and m.actual_date is null
           and m.forecast_date between coalesce(p_date, private.org_today(f.organisation_id))
                               and coalesce(p_date, private.org_today(f.organisation_id)) + 30),
       'dimensionsGreen', jsonb_build_object(
         'schedule', count(*) filter (where h.schedule = 'green'), 'financial', count(*) filter (where h.financial = 'green'),
         'effort', count(*) filter (where h.effort = 'green'), 'issue', count(*) filter (where h.issue = 'green'),
         'benefit', count(*) filter (where h.benefit = 'green')))
     from public.v_projects p join public.v_project_health h on h.project_id = p.id
     where p.effective_portfolio_id = f.portfolio_id and p.state = 'active')
  from public.v_portfolio_health f join public.portfolios pf on pf.id = f.portfolio_id
  where pf.state = 'active' and (p_org is null or f.organisation_id = p_org)
  on conflict (coalesce(portfolio_id, programme_id, project_id), snapshot_date) do update
    set overall = excluded.overall, forecast_finish_date = excluded.forecast_finish_date, metrics = excluded.metrics, is_synthetic = false;
  get diagnostics c = row_count; n := n + c;

  n := n + private.capture_pathway_snapshots(p_org, p_date);
  return n;
end;
$$;
revoke all on function private.capture_health_snapshots(uuid, date) from public, anon, authenticated;
grant execute on function private.capture_health_snapshots(uuid, date) to service_role;
