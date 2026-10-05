-- Virtual PMO: health snapshots (trend history) and the audit log.

create table public.health_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid,
  programme_id uuid,
  project_id uuid,
  snapshot_date date not null,
  overall public.health not null,
  schedule public.health,
  financial public.health,
  effort public.health,
  issue public.health,
  benefit public.health,
  forecast_finish_date date,
  forecast_basis text not null default 'declared',
  metrics jsonb not null default '{}'::jsonb,
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  -- History must never disappear with its subject (review B).
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id) on delete restrict,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete restrict,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete restrict,
  check (num_nonnulls(portfolio_id, programme_id, project_id) = 1)
);
create unique index health_snapshots_entity_day_idx on public.health_snapshots (coalesce(portfolio_id, programme_id, project_id), snapshot_date);
create index health_snapshots_workspace_org_idx on public.health_snapshots (workspace_id, organisation_id);
create index health_snapshots_organisation_idx on public.health_snapshots (organisation_id);
create index health_snapshots_portfolio_idx on public.health_snapshots (portfolio_id, workspace_id);
create index health_snapshots_programme_idx on public.health_snapshots (programme_id, workspace_id);
create index health_snapshots_project_idx on public.health_snapshots (project_id, workspace_id);
alter table public.health_snapshots enable row level security;
revoke all on public.health_snapshots from anon, authenticated;
grant select on public.health_snapshots to authenticated;
create policy health_snapshots_select on public.health_snapshots for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Writes one snapshot per non-archived, non-closed project, programme and portfolio for
-- the given day (default: today in each organisation's time zone). Idempotent per day.
create function private.capture_health_snapshots(p_org uuid default null, p_date date default null)
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
  return n;
end;
$$;
revoke all on function private.capture_health_snapshots(uuid, date) from public, anon, authenticated;
grant execute on function private.capture_health_snapshots(uuid, date) to service_role;

-- Snapshots are also taken whenever a status report is submitted.
create function private.snapshot_on_status_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('vpmo.seeding', true) is distinct from 'on' then
    perform private.capture_health_snapshots(new.organisation_id);
  end if;
  return new;
end;
$$;
create trigger status_reports_snapshot after insert on public.status_reports
  for each row execute function private.snapshot_on_status_report();

-- ---------------------------------------------------------------------------
-- Audit log. entity_table + entity_id deliberately has no FK: the log must outlive
-- the rows it describes. The only polymorphic reference in the schema.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  workspace_id uuid,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('insert', 'update', 'delete')),
  entity_table text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
create index audit_log_organisation_created_idx on public.audit_log (organisation_id, created_at desc);
create index audit_log_workspace_org_idx on public.audit_log (workspace_id, organisation_id);
create index audit_log_entity_idx on public.audit_log (entity_table, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy audit_log_select on public.audit_log for select to authenticated
  using (case when workspace_id is null then private.has_org_role(organisation_id, 'pmo')
              else private.has_workspace_role(workspace_id, 'pmo') end);

create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  changes jsonb;
begin
  if current_setting('vpmo.seeding', true) = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('from', o -> k, 'to', n -> k)), '{}'::jsonb) into changes
    from jsonb_object_keys(n) k
    where k not in ('updated_at') and (o -> k) is distinct from (n -> k);
    if changes = '{}'::jsonb then
      return null;
    end if;
  else
    changes := case when tg_op = 'DELETE' then jsonb_build_object('row', o) else '{}'::jsonb end;
  end if;
  insert into public.audit_log (organisation_id, workspace_id, actor_id, action, entity_table, entity_id, detail)
  values ((r ->> 'organisation_id')::uuid, (r ->> 'workspace_id')::uuid, (select auth.uid()), lower(tg_op), tg_table_name,
          coalesce((r ->> 'id')::uuid, (r ->> 'profile_id')::uuid), changes);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['organisation_members', 'workspace_members', 'resources', 'portfolios', 'programmes', 'projects',
    'project_requests', 'milestones', 'status_reports', 'risks', 'issues', 'assumptions', 'change_requests', 'decisions',
    'dependencies', 'benefits', 'benefit_measurements', 'lessons', 'improvement_actions', 'lifecycle_phases', 'lookup_values']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
                   t || '_audit', t);
  end loop;
end $$;

-- Retention: prune per organisation using settings.data.retentionMonths.
create function private.prune_audit_log()
returns integer
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.audit_log a using public.organisations o
    where o.id = a.organisation_id
      and a.created_at < now() - make_interval(months => coalesce((o.settings -> 'data' ->> 'retentionMonths')::integer, 84))
    returning 1
  )
  select count(*)::integer from gone;
$$;
revoke all on function private.prune_audit_log() from public, anon, authenticated;
grant execute on function private.prune_audit_log() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vpmo-capture-health-snapshots', '15 2 * * *', 'select private.capture_health_snapshots()');
    perform cron.schedule('vpmo-prune-audit-log', '45 3 * * 0', 'select private.prune_audit_log()');
  end if;
end $$;
