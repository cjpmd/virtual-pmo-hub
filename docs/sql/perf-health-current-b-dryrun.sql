-- DRY RUN for docs/sql/perf-health-current-b.sql. Paste into the Supabase SQL editor and run.
-- Executes the migration's exact text, fills and checks the tables, checks a milestone update
-- queues the organisation, then raises an exception so EVERYTHING is rolled back. Expected
-- error text: "DRYRUN mismatches=0; rows project=39 ...; triggers=25; jobs=... ; queued before
-- update=0; queued after milestone update=1". Nothing is created or changed.
-- (The Supabase MCP tool holds any SQL containing DELETE for a confirmation this environment
-- cannot show, so this has to run in the SQL editor.)

do $dry$
declare
  total integer;
  r text;
begin
  execute $file$
create table public.project_health_current (
  project_id uuid primary key,
  organisation_id uuid not null,
  workspace_id uuid not null,
  programme_id uuid,
  effective_portfolio_id uuid,
  code text,
  state public.project_state,
  phase_index integer,
  -- v_project_health
  schedule public.health,
  financial public.health,
  effort public.health,
  issue public.health,
  benefit public.health,
  computed_overall public.health,
  overall public.health,
  is_overridden boolean,
  forecast_finish_date date,
  forecast_basis text,
  benefit_reason text,
  finish_slip_health public.health,
  -- v_project_delivery_health
  milestones_after_baseline_finish integer,
  -- v_project_divergence
  declared public.health,
  evidenced public.health,
  divergent boolean,
  divergence_since date,
  divergence_days integer,
  divergence_alert boolean,
  divergence_kind text,
  justified boolean,
  justification text,
  justification_at timestamptz,
  justification_author_id uuid,
  latest_report_id uuid,
  divergent_prev_month_end boolean,
  last_report_date date,
  next_report_due date,
  report_overdue boolean,
  finish_vs_baseline_days integer,
  risk_score integer,
  computed_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index project_health_current_organisation_idx on public.project_health_current (organisation_id);
create index project_health_current_workspace_idx on public.project_health_current (workspace_id, organisation_id);

create table public.programme_health_current (
  programme_id uuid primary key,
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid,
  benefit public.health,
  computed_overall public.health,
  overall public.health,
  is_overridden boolean,
  forecast_finish_date date,
  forecast_basis text,
  benefit_reason text,
  computed_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade
);
create index programme_health_current_organisation_idx on public.programme_health_current (organisation_id);
create index programme_health_current_workspace_idx on public.programme_health_current (workspace_id, organisation_id);

create table public.portfolio_health_current (
  portfolio_id uuid primary key,
  organisation_id uuid not null,
  workspace_id uuid not null,
  computed_overall public.health,
  overall public.health,
  is_overridden boolean,
  forecast_finish_date date,
  forecast_basis text,
  computed_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id) on delete cascade
);
create index portfolio_health_current_organisation_idx on public.portfolio_health_current (organisation_id);
create index portfolio_health_current_workspace_idx on public.portfolio_health_current (workspace_id, organisation_id);

-- Read like projects (workspace members); nobody but the refresh function writes.
alter table public.project_health_current enable row level security;
alter table public.programme_health_current enable row level security;
alter table public.portfolio_health_current enable row level security;
revoke all on public.project_health_current, public.programme_health_current, public.portfolio_health_current
  from anon, authenticated;
grant select on public.project_health_current, public.programme_health_current, public.portfolio_health_current
  to authenticated;
create policy project_health_current_select on public.project_health_current for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy programme_health_current_select on public.programme_health_current for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy portfolio_health_current_select on public.portfolio_health_current for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));

-- ---- What the tables hold: rows selected from the views, nothing else -----------------------
-- The only place the stored columns are filled from; the refresh and the check both use these.

create function private.live_project_health(p_org uuid)
returns setof public.project_health_current
language sql stable security definer set search_path = ''
as $$
  select h.project_id, h.organisation_id, h.workspace_id, h.programme_id, h.effective_portfolio_id,
    h.code, h.state, h.phase_index,
    h.schedule, h.financial, h.effort, h.issue, h.benefit, h.computed_overall, h.overall,
    h.is_overridden, h.forecast_finish_date, h.forecast_basis, h.benefit_reason, h.finish_slip_health,
    dh.milestones_after_baseline_finish::integer,
    d.declared, d.evidenced, d.divergent, d.divergence_since, d.divergence_days, d.divergence_alert,
    d.divergence_kind, d.justified, d.justification, d.justification_at, d.justification_author_id,
    d.latest_report_id, d.divergent_prev_month_end, d.last_report_date, d.next_report_due,
    d.report_overdue, d.finish_vs_baseline_days, d.risk_score,
    now()
  from public.v_project_health h
  join public.v_project_delivery_health dh on dh.project_id = h.project_id
  left join public.v_project_divergence d on d.project_id = h.project_id
  where h.organisation_id = p_org;
$$;

create function private.live_programme_health(p_org uuid)
returns setof public.programme_health_current
language sql stable security definer set search_path = ''
as $$
  select g.programme_id, g.organisation_id, g.workspace_id, g.portfolio_id, g.benefit,
    g.computed_overall, g.overall, g.is_overridden, g.forecast_finish_date, g.forecast_basis,
    g.benefit_reason, now()
  from public.v_programme_health g
  where g.organisation_id = p_org;
$$;

create function private.live_portfolio_health(p_org uuid)
returns setof public.portfolio_health_current
language sql stable security definer set search_path = ''
as $$
  select p.portfolio_id, p.organisation_id, p.workspace_id, p.computed_overall, p.overall,
    p.is_overridden, p.forecast_finish_date, p.forecast_basis, now()
  from public.v_portfolio_health p
  where p.organisation_id = p_org;
$$;

-- ---- Refresh -------------------------------------------------------------------------------

create function private.refresh_health_current(p_org uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_org is null then return; end if;
  -- One refresh per organisation at a time; readers keep seeing the previous rows until commit.
  perform pg_advisory_xact_lock(hashtext('health_current'), hashtext(p_org::text));
  delete from public.project_health_current where organisation_id = p_org;
  insert into public.project_health_current select * from private.live_project_health(p_org);
  delete from public.programme_health_current where organisation_id = p_org;
  insert into public.programme_health_current select * from private.live_programme_health(p_org);
  delete from public.portfolio_health_current where organisation_id = p_org;
  insert into public.portfolio_health_current select * from private.live_portfolio_health(p_org);
end;
$$;

create function private.refresh_all_health_current()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  o uuid;
begin
  for o in select id from public.organisations loop
    perform private.refresh_health_current(o);
  end loop;
end;
$$;

-- ---- Queue ---------------------------------------------------------------------------------
-- Internal (private schema, organisation-level): which organisations need a refresh.
create table private.health_refresh_queue (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  queued_at timestamptz not null default now()
);
alter table private.health_refresh_queue enable row level security;
revoke all on private.health_refresh_queue from public, anon, authenticated;

-- Row trigger on every table that feeds health: queue the row's organisation (deduped).
create function private.health_current_enqueue()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  o uuid := coalesce(r ->> 'organisation_id', case when tg_table_name = 'organisations' then r ->> 'id' end)::uuid;
begin
  if o is not null then
    insert into private.health_refresh_queue (organisation_id) values (o)
    on conflict (organisation_id) do nothing;
  end if;
  return null;
end;
$$;

-- Drains the queue: each organisation is taken off (and committed) before it is refreshed, so
-- writers only ever wait for that short delete, and a write during the refresh re-queues it.
create procedure private.drain_health_refresh_queue()
language plpgsql
as $$
declare
  o uuid;
begin
  loop
    delete from private.health_refresh_queue q
    where q.organisation_id = (
      select organisation_id from private.health_refresh_queue
      order by queued_at limit 1 for update skip locked)
    returning q.organisation_id into o;
    exit when o is null;
    commit;
    perform private.refresh_health_current(o);
    commit;
  end loop;
end;
$$;

-- ---- Nightly check log -------------------------------------------------------------------------
create table private.health_check_log (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  run text not null,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  mismatches integer not null,
  details jsonb not null default '[]'::jsonb
);
create index health_check_log_checked_idx on private.health_check_log (checked_at desc);
create index health_check_log_organisation_idx on private.health_check_log (organisation_id);
alter table private.health_check_log enable row level security;
revoke all on private.health_check_log from public, anon, authenticated;

-- ---- Check: stored rows against the live views ---------------------------------------------
-- Lists every row that differs (or exists on one side only), ignoring computed_at. Empty means
-- the tables match the views.
create function private.health_current_mismatches(p_org uuid)
returns table (level text, id uuid, stored jsonb, live jsonb)
language sql stable security definer set search_path = ''
as $$
  with s as (select project_id as id, to_jsonb(t) - 'computed_at' as j from public.project_health_current t where organisation_id = p_org),
       l as (select project_id as id, to_jsonb(t) - 'computed_at' as j from private.live_project_health(p_org) t)
  select 'project', coalesce(s.id, l.id), s.j, l.j from s full join l on l.id = s.id
  where s.j is distinct from l.j
  union all
  select 'programme', coalesce(s.id, l.id), s.j, l.j
  from (select programme_id as id, to_jsonb(t) - 'computed_at' as j from public.programme_health_current t where organisation_id = p_org) s
  full join (select programme_id as id, to_jsonb(t) - 'computed_at' as j from private.live_programme_health(p_org) t) l on l.id = s.id
  where s.j is distinct from l.j
  union all
  select 'portfolio', coalesce(s.id, l.id), s.j, l.j
  from (select portfolio_id as id, to_jsonb(t) - 'computed_at' as j from public.portfolio_health_current t where organisation_id = p_org) s
  full join (select portfolio_id as id, to_jsonb(t) - 'computed_at' as j from private.live_portfolio_health(p_org) t) l on l.id = s.id
  where s.j is distinct from l.j;
$$;

-- Runs the check for every organisation and logs one row each; returns the total mismatches.
create function private.check_health_current(p_run text)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  o uuid;
  total integer := 0;
  n integer;
  d jsonb;
begin
  for o in select id from public.organisations loop
    select count(*), coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) into n, d
    from private.health_current_mismatches(o) m;
    insert into private.health_check_log (run, organisation_id, mismatches, details)
    values (p_run, o, n, d);
    total := total + n;
  end loop;
  return total;
end;
$$;

-- Full refresh, then the logged check (both nightly runs and the first fill).
create function private.full_health_refresh_and_check(p_run text)
returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.refresh_all_health_current();
  return private.check_health_current(p_run);
end;
$$;

-- 00:05 Europe/London: pg_cron runs in UTC, so the job fires at 23:05 and 00:05 UTC and acts only
-- in the first quarter-hour of the London day (BST or GMT).
create function private.london_midnight_health_refresh()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (now() at time zone 'Europe/London')::time < time '00:15' then
    perform private.full_health_refresh_and_check('00:05 Europe/London');
  end if;
end;
$$;

revoke all on function private.live_project_health(uuid), private.live_programme_health(uuid),
  private.live_portfolio_health(uuid), private.refresh_health_current(uuid),
  private.refresh_all_health_current(), private.health_current_enqueue(),
  private.health_current_mismatches(uuid), private.check_health_current(text),
  private.full_health_refresh_and_check(text), private.london_midnight_health_refresh()
  from public, anon, authenticated;
revoke all on procedure private.drain_health_refresh_queue() from public, anon, authenticated;

-- One trigger on every table that feeds health ("zz" so it runs after the tables' own triggers).
do $$
declare
  t text;
begin
  foreach t in array array[
    'benefit_measure_targets', 'benefit_measurements', 'benefit_measures', 'benefit_periods',
    'benefit_projects', 'benefit_reviews', 'benefits', 'budget_baselines', 'capabilities',
    'capability_projects', 'divergence_justifications', 'financial_periods', 'financial_values',
    'health_snapshots', 'issues', 'lifecycle_phases', 'milestones', 'organisations', 'portfolios',
    'programmes', 'projects', 'risks', 'status_reports', 'work_item_checklist_items', 'work_items'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function private.health_current_enqueue()',
      t || '_zz_health_enqueue', t);
  end loop;
end $$;

-- ---- Schedules ------------------------------------------------------------------------------
select cron.schedule('vpmo-health-refresh-queue', '5 seconds', 'call private.drain_health_refresh_queue()');
select cron.schedule('vpmo-health-refresh-london-midnight', '5 23,0 * * *',
  'select private.london_midnight_health_refresh()');
-- The nightly 02:15 UTC job: snapshots, then the full refresh and the logged check.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'vpmo-capture-health-snapshots'),
  command := 'select private.capture_health_snapshots(); select private.full_health_refresh_and_check(''02:15 UTC'');'
);

-- ---- First fill and check ----------------------------------------------------------------------
select private.full_health_refresh_and_check('first fill');

$file$;
  select coalesce(sum(mismatches), -1) into total from private.health_check_log where run = 'first fill';
  r := format('mismatches=%s; rows project=%s programme=%s portfolio=%s; triggers=%s; jobs=%s; nightly_cmd=%s',
    total,
    (select count(*) from public.project_health_current), (select count(*) from public.programme_health_current),
    (select count(*) from public.portfolio_health_current),
    (select count(*) from pg_trigger where tgname like '%_zz_health_enqueue'),
    (select string_agg(jobname || ' [' || schedule || ']', ', ' order by jobid) from cron.job),
    (select command from cron.job where jobname = 'vpmo-capture-health-snapshots'));
  -- the trigger queues the organisation (rolled back with everything else)
  r := r || format('; queued before update=%s', (select count(*) from private.health_refresh_queue));
  update public.milestones set title = title where id = 'b10e4c08-c1a2-d2d0-0ded-3e6eae622bf6';
  r := r || format('; queued after milestone update=%s', (select count(*) from private.health_refresh_queue));
  raise exception 'DRYRUN %', r;
end
$dry$;