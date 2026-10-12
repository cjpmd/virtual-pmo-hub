-- PROPOSAL (not applied). Fix B for the shell health views: store current health per project,
-- programme and portfolio, refreshed on write and nightly; the app reads the tables, the v_*
-- views stay the only definition of every rule. Follows docs/sql/perf-shell-views.sql (A1-A4
-- applied; target not met).
--
-- ============================================================================ WHY B (measured)
-- 20 back-to-back browser loads as vpmo-test-member, server time from pg_stat_statements deltas
-- (no other session hit these views during the runs: call deltas matched the browser's own
-- request counts exactly). ~p95 = mean + 1.645 sd (pg_stat_statements has no percentiles).
--                                      before A1-A4                 after A1-A4
--   /portfolio/projects/ARB  req/load  82.8                         62.0
--                            5xx       54 (all timeouts)            0
--     v_project_health       mean / ~p95  1622 / 3695 ms, 27 t/o    312 / 642 ms
--     v_project_divergence   (on demand)                            344 / 798 ms
--     v_portfolio_health     16 of 20 timed out                     not requested
--     v_programme_health     16 of 20 timed out                     not requested
--   /portfolio (overview)    req/load  85.8                         77.2
--                            5xx       25 (all timeouts)            0
--     v_portfolio_health     mean / ~p95  1952 / 4754 ms            930 / 2062 ms
--     v_programme_health                  1691 / 3690 ms            665 / 1294 ms
--     v_project_health                    2165 / 4278 ms            667 / 1338 ms
-- No 8 s timeouts remain, but no view meets p95 < 300 ms under back-to-back loads.
--
-- Reading the stored rows instead (temp copies of the tables below, RLS on with the same policy,
-- as the member, 20 runs each, re-planned every time):
--   project health list (37 rows)          p50 0.6 ms  p95 1.2 ms
--   one project's health + divergence      p50 0.6 ms  p95 0.7 ms
--   assurance rows, all projects           p50 0.9 ms  p95 1.0 ms
--   programme health                       p50 0.5 ms  p95 0.7 ms
--   portfolio health                       p50 0.5 ms  p95 0.5 ms
-- The cost moves to writes: computing one organisation's rows from the views takes
-- p50 443 ms, p95 455 ms (10 runs, as postgres). See "Refresh scope and cost" below.
--
-- ===================================================================== REFRESH SCOPE AND COST
-- * Whole organisation, not one project. A capability's RAG uses the delivery health of every
--   project linked to it (v_project_health.caps), so a write to project A can change project
--   B's benefit health; refreshing only A's row would leave B stale. It costs the same anyway:
--   the views compute every project in one pass and filter afterwards (materialized CTEs), so a
--   one-project refresh still computes them all.
-- * Once per write statement (row triggers note the organisation, a statement trigger refreshes
--   it), serialised per organisation with an advisory lock. Bulk writes are one statement.
-- * ~0.45 s added to each write statement today, inside the writer's transaction, so the next
--   read is always fresh. As postgres the views compute every tenant before filtering, so this
--   grows with total project count across organisations. If that becomes a problem the
--   alternative is a queue drained by pg_cron every few seconds (writes unaffected, reads up to
--   a few seconds stale): decision for you.
-- * Date-driven changes (milestones going overdue at midnight, report due dates) need no write:
--   the nightly 02:15 UTC job refreshes every organisation after taking its snapshots. Between
--   midnight (Europe/London) and 02:15 UTC the stored rows still reflect yesterday's date; an
--   extra 00:05 Europe/London run would close that gap if wanted.
--
-- ======================================================================= WHAT FEEDS HEALTH
-- From pg_depend over v_project_health, v_project_divergence, v_programme_health and
-- v_portfolio_health (all view layers): benefit_measure_targets, benefit_measurements,
-- benefit_measures, benefit_periods, benefit_projects, benefit_reviews, benefits,
-- budget_baselines, capabilities, capability_projects, divergence_justifications,
-- financial_periods, financial_values, health_snapshots, issues, lifecycle_phases, milestones,
-- organisations (settings), portfolios, programmes, projects, risks, status_reports,
-- work_item_checklist_items, work_items. Every one gets the two refresh triggers.
--
-- ============================================================================== APP CHANGES
-- (client, after the migration; no rule moves into TypeScript)
-- * hierarchy.loadProjectContext: health from project_health_current instead of v_project_health.
-- * listProgrammes / listPortfolios: health from programme_health_current / portfolio_health_current.
-- * assurance (list and the project header): divergence columns from project_health_current.
-- * Status bar "data last changed": max(computed_at) over the rows in scope (and the
--   get_portfolio_overview RPC's asOf likewise).
-- * The views stay for anything that needs a live answer (the justification trigger, the
--   status-report evidence capture, the snapshot job) and for the mismatch check.
--
-- ===================================================================================== SQL

-- ---- Tables --------------------------------------------------------------------------------

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

-- Row trigger: note the row's organisation for this statement (transaction-local setting).
create function private.health_current_mark()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  o text := coalesce(r ->> 'organisation_id', case when tg_table_name = 'organisations' then r ->> 'id' end);
  seen text := coalesce(current_setting('vpmo.health_dirty', true), '');
begin
  if o is not null and position(o in seen) = 0 then
    perform set_config('vpmo.health_dirty', seen || ',' || o, true);
  end if;
  return null;
end;
$$;

-- Statement trigger: refresh every organisation the statement touched, then forget them.
create function private.health_current_refresh()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  o text;
  dirty text := coalesce(current_setting('vpmo.health_dirty', true), '');
begin
  if dirty = '' then return null; end if;
  perform set_config('vpmo.health_dirty', '', true);
  foreach o in array string_to_array(trim(both ',' from dirty), ',') loop
    perform private.refresh_health_current(o::uuid);
  end loop;
  return null;
end;
$$;

revoke all on function private.live_project_health(uuid), private.live_programme_health(uuid),
  private.live_portfolio_health(uuid), private.refresh_health_current(uuid),
  private.refresh_all_health_current(), private.health_current_mark(),
  private.health_current_refresh()
  from public, anon, authenticated;

-- Two triggers on every table that feeds health ("zz" so they run after the tables' own triggers).
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
         for each row execute function private.health_current_mark()',
      t || '_zz_health_mark', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each statement execute function private.health_current_refresh()',
      t || '_zz_health_refresh', t);
  end loop;
end $$;

-- ---- Nightly ------------------------------------------------------------------------------
-- After the 02:15 UTC snapshots (the snapshot inserts already refresh through the
-- health_snapshots triggers; the explicit full refresh also covers organisations with no
-- open projects and anything date-driven).
select cron.alter_job(
  (select jobid from cron.job where jobname = 'vpmo-capture-health-snapshots'),
  command := 'select private.capture_health_snapshots(); select private.refresh_all_health_current();'
);

-- ---- Check: stored rows against the live views ---------------------------------------------
-- Lists every row that differs (or exists on one side only), ignoring computed_at. Empty means
-- the tables match the views. Run from the SQL editor (not granted to app users).
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
revoke all on function private.health_current_mismatches(uuid) from public, anon, authenticated;

-- ---- First fill ------------------------------------------------------------------------------
select private.refresh_all_health_current();
