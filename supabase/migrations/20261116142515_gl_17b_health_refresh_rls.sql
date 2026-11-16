-- GL-17b: refresh each organisation's health under RLS as one of its admins (option C, docs/perf.md
-- § Multi-tenant health refresh). Proposal: docs/sql/gl-17b-health-refresh-rls.sql.
--
-- Why not `set role authenticated`: PostgreSQL refuses SET ROLE inside a SECURITY DEFINER function,
-- and the refresh is reached through definer functions (the nightly jobs, the status-report snapshot
-- trigger). Instead the live reads move into small reader functions OWNED BY `authenticated`
-- (SECURITY DEFINER, so they run as `authenticated`, which has no BYPASSRLS: every policy applies,
-- exactly as for a signed-in user). The caller sets the request claims of one of the organisation's
-- admins for the reads only, then puts the previous claims back and writes as the owner as today.
-- The claims only narrow what is read (to what that admin sees); no setting bypasses a guard. If a
-- read fails, the error rolls the (sub)transaction back, and set_config(..., true) with it.
--
-- * private.health_reader_id(org): the admin whose claims are used (earliest admin, not closed).
--   An organisation with no admin is skipped and logged in private.health_refresh_skips.
-- * private.rls_live_{project,programme,portfolio}_health(org): the bodies of private.live_*,
--   owned by authenticated. private.live_* stay (owner reads) for the parity test.
-- * private.rls_health_snapshot_rows(org, date): the rows capture_health_snapshots writes, read the
--   same way, as one jsonb array.
-- * refresh_health_current, health_current_mismatches and capture_health_snapshots use them; the
--   nightly refresh-and-check and the snapshot job now cost about N x one organisation.
-- No destructive statements.

-- =====================================================================================
-- 1. Whose claims, and the claim swap
-- =====================================================================================
create table private.health_refresh_skips (
  id bigint generated always as identity primary key,
  organisation_id uuid not null,
  job text not null,
  reason text not null,
  skipped_at timestamptz not null default now()
);
comment on table private.health_refresh_skips is
  'GL-17b: an organisation whose health refresh, check or snapshot was skipped (no admin to read as). Service role and owner only.';
create index health_refresh_skips_org_idx on private.health_refresh_skips (organisation_id, skipped_at desc);
revoke all on private.health_refresh_skips from public, anon, authenticated;

create function private.health_reader_id(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id
  from public.organisation_members m
  join public.profiles p on p.id = m.profile_id
  where m.organisation_id = p_org and m.role = 'admin' and p.closed_at is null
  order by m.created_at, m.profile_id
  limit 1;
$$;
revoke execute on function private.health_reader_id(uuid) from public, anon, authenticated;

-- Sets the claims of p_sub for the rest of the transaction (or until restored) and returns the
-- previous ones, for private.health_reader_restore.
create function private.health_reader_claims(p_sub uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text[] := array[current_setting('request.jwt.claims', true),
                        current_setting('request.jwt.claim.sub', true),
                        current_setting('request.jwt.claim.role', true)];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  -- The legacy per-claim settings can win over request.jwt.claims in auth.uid(), so whenever
  -- one is defined (even as '', which a rolled-back set_config leaves behind) it is replaced too;
  -- one never defined (null) is left undefined.
  if v_old[2] is not null then perform set_config('request.jwt.claim.sub', p_sub::text, true); end if;
  if v_old[3] is not null then perform set_config('request.jwt.claim.role', 'authenticated', true); end if;
  return v_old;
end;
$$;
revoke execute on function private.health_reader_claims(uuid) from public, anon, authenticated;

create function private.health_reader_restore(p_old text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', coalesce(p_old[1], ''), true);
  if p_old[2] is not null then perform set_config('request.jwt.claim.sub', p_old[2], true); end if;
  if p_old[3] is not null then perform set_config('request.jwt.claim.role', p_old[3], true); end if;
end;
$$;
revoke execute on function private.health_reader_restore(text[]) from public, anon, authenticated;

-- =====================================================================================
-- 2. Readers, owned by authenticated (RLS applies)
-- =====================================================================================
create function private.rls_live_project_health(p_org uuid)
returns setof public.project_health_current
language sql
stable
security definer
set search_path = ''
as $$
  with h as materialized (
    select * from public.v_project_health where organisation_id = p_org
  ),
  dh as materialized (
    select project_id, milestones_after_baseline_finish
    from public.v_project_delivery_health where organisation_id = p_org
  ),
  d as materialized (
    select * from public.v_project_divergence where organisation_id = p_org
  )
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
  from h
  join dh on dh.project_id = h.project_id
  left join d on d.project_id = h.project_id;
$$;

create function private.rls_live_programme_health(p_org uuid)
returns setof public.programme_health_current
language sql
stable
security definer
set search_path = ''
as $$
  select g.programme_id, g.organisation_id, g.workspace_id, g.portfolio_id, g.benefit,
    g.computed_overall, g.overall, g.is_overridden, g.forecast_finish_date, g.forecast_basis,
    g.benefit_reason, now()
  from public.v_programme_health g
  where g.organisation_id = p_org;
$$;

create function private.rls_live_portfolio_health(p_org uuid)
returns setof public.portfolio_health_current
language sql
stable
security definer
set search_path = ''
as $$
  select p.portfolio_id, p.organisation_id, p.workspace_id, p.computed_overall, p.overall,
    p.is_overridden, p.forecast_finish_date, p.forecast_basis, now()
  from public.v_portfolio_health p
  where p.organisation_id = p_org;
$$;

-- The rows capture_health_snapshots writes for one organisation (the three selects it ran as the
-- owner until GL-17b), as a jsonb array of health_snapshots-shaped objects. Each view is read once
-- (materialised): under RLS, the per-portfolio metrics subquery would otherwise re-read
-- v_projects and v_project_health for every portfolio.
create function private.rls_health_snapshot_rows(p_org uuid, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with d as materialized (
    select coalesce(p_date, private.org_today(p_org)) as day
  ),
  h as materialized (
    select * from public.v_project_health where organisation_id = p_org
  ),
  pj as materialized (
    select id, effective_portfolio_id, state, budget, forecast, actual from public.v_projects where organisation_id = p_org
  ),
  ms as materialized (
    select mp.effective_portfolio_id as portfolio_id, count(*) as n
    from public.milestones m join pj mp on mp.id = m.project_id cross join d
    where mp.state = 'active' and m.actual_date is null and m.forecast_date between d.day and d.day + 30
    group by mp.effective_portfolio_id
  ),
  pm as materialized (
    select p.effective_portfolio_id as portfolio_id,
      count(*) as active, coalesce(sum(p.budget), 0) as budget, coalesce(sum(p.forecast), 0) as forecast,
      coalesce(sum(p.actual), 0) as spend, coalesce(sum(p.forecast - p.budget), 0) as variance,
      count(*) filter (where h.overall = 'green') as green, count(*) filter (where h.overall = 'amber') as amber,
      count(*) filter (where h.overall = 'red') as red, count(*) filter (where h.overall = 'not_set') as unset,
      count(*) filter (where h.schedule = 'green') as g_schedule, count(*) filter (where h.financial = 'green') as g_financial,
      count(*) filter (where h.effort = 'green') as g_effort, count(*) filter (where h.issue = 'green') as g_issue,
      count(*) filter (where h.benefit = 'green') as g_benefit
    from pj p join h on h.project_id = p.id
    where p.state = 'active'
    group by p.effective_portfolio_id
  )
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select to_jsonb(r) as x from (
      select h.organisation_id, h.workspace_id, h.project_id, null::uuid as programme_id, null::uuid as portfolio_id,
        d.day as snapshot_date, h.overall,
        h.schedule, h.financial, h.effort, h.issue, h.benefit, h.forecast_finish_date, h.forecast_basis, null::jsonb as metrics
      from h join public.projects p on p.id = h.project_id cross join d
      where p.state <> 'closed'
    ) r
    union all
    select to_jsonb(r) from (
      select g.organisation_id, g.workspace_id, null::uuid as project_id, g.programme_id, null::uuid as portfolio_id,
        d.day as snapshot_date, g.overall, g.benefit, g.forecast_finish_date, g.forecast_basis
      from public.v_programme_health g join public.programmes pr on pr.id = g.programme_id cross join d
      where pr.state = 'active' and g.organisation_id = p_org
    ) r
    union all
    select to_jsonb(r) from (
      select f.organisation_id, f.workspace_id, null::uuid as project_id, null::uuid as programme_id, f.portfolio_id,
        d.day as snapshot_date, f.overall, f.forecast_finish_date, f.forecast_basis,
        jsonb_build_object(
          'activeProjects', coalesce(pm.active, 0),
          'budget', coalesce(pm.budget, 0),
          'forecast', coalesce(pm.forecast, 0),
          'spend', coalesce(pm.spend, 0),
          'variance', coalesce(pm.variance, 0),
          'green', coalesce(pm.green, 0),
          'amber', coalesce(pm.amber, 0),
          'red', coalesce(pm.red, 0),
          'unset', coalesce(pm.unset, 0),
          'percentOnTrack', case when coalesce(pm.active, 0) = 0 then 0 else private.js_round(100.0 * pm.green / pm.active) end,
          'milestonesDue30', coalesce(ms.n, 0),
          'dimensionsGreen', jsonb_build_object(
            'schedule', coalesce(pm.g_schedule, 0), 'financial', coalesce(pm.g_financial, 0),
            'effort', coalesce(pm.g_effort, 0), 'issue', coalesce(pm.g_issue, 0),
            'benefit', coalesce(pm.g_benefit, 0))) as metrics
      from public.v_portfolio_health f join public.portfolios pf on pf.id = f.portfolio_id cross join d
      left join pm on pm.portfolio_id = f.portfolio_id
      left join ms on ms.portfolio_id = f.portfolio_id
      where pf.state = 'active' and f.organisation_id = p_org
    ) r
  ) s;
$$;

-- Owned by authenticated: they run as that role, under RLS, with whatever claims the caller set.
-- Execute stays with the owner (authenticated, of which postgres is a member); never anon.
-- Changing a function's owner needs the new owner to have CREATE on its schema; on the hosted
-- project postgres isn't a superuser, so authenticated gets CREATE on private only for these four
-- statements, inside this migration's transaction, and loses it again before it commits.
grant create on schema private to authenticated;
alter function private.rls_live_project_health(uuid) owner to authenticated;
alter function private.rls_live_programme_health(uuid) owner to authenticated;
alter function private.rls_live_portfolio_health(uuid) owner to authenticated;
alter function private.rls_health_snapshot_rows(uuid, date) owner to authenticated;
revoke create on schema private from authenticated;
revoke execute on function private.rls_live_project_health(uuid), private.rls_live_programme_health(uuid),
  private.rls_live_portfolio_health(uuid), private.rls_health_snapshot_rows(uuid, date) from public, anon;

-- =====================================================================================
-- 3. The refresh, the nightly check and the snapshots, per organisation under RLS
-- =====================================================================================
create or replace function private.refresh_health_current(p_org uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reader uuid;
  v_old text[];
  v_projects public.project_health_current[];
  v_programmes public.programme_health_current[];
  v_portfolios public.portfolio_health_current[];
begin
  if p_org is null then return; end if;
  -- One refresh per organisation at a time; readers keep seeing the previous rows until commit.
  perform pg_advisory_xact_lock(hashtext('health_current'), hashtext(p_org::text));
  v_reader := private.health_reader_id(p_org);
  if v_reader is null then
    if exists (select 1 from public.organisations o where o.id = p_org) then
      insert into private.health_refresh_skips (organisation_id, job, reason) values (p_org, 'refresh', 'no_admin');
    end if;
    return;
  end if;
  -- GL-17b: read as the organisation's admin, through RLS.
  v_old := private.health_reader_claims(v_reader);
  select coalesce(array_agg(t), '{}') into v_projects from private.rls_live_project_health(p_org) t;
  select coalesce(array_agg(t), '{}') into v_programmes from private.rls_live_programme_health(p_org) t;
  select coalesce(array_agg(t), '{}') into v_portfolios from private.rls_live_portfolio_health(p_org) t;
  perform private.health_reader_restore(v_old);

  delete from public.project_health_current where organisation_id = p_org;
  insert into public.project_health_current select * from unnest(v_projects);
  delete from public.programme_health_current where organisation_id = p_org;
  insert into public.programme_health_current select * from unnest(v_programmes);
  delete from public.portfolio_health_current where organisation_id = p_org;
  insert into public.portfolio_health_current select * from unnest(v_portfolios);
end;
$function$;

-- Was language sql stable; plpgsql now (the claim swap). Same signature and result.
create or replace function private.health_current_mismatches(p_org uuid)
returns table(level text, id uuid, stored jsonb, live jsonb)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reader uuid := private.health_reader_id(p_org);
  v_old text[];
  v_projects public.project_health_current[];
  v_programmes public.programme_health_current[];
  v_portfolios public.portfolio_health_current[];
begin
  if v_reader is null then
    if exists (select 1 from public.organisations o where o.id = p_org) then
      insert into private.health_refresh_skips (organisation_id, job, reason) values (p_org, 'check', 'no_admin');
    end if;
    return;
  end if;
  v_old := private.health_reader_claims(v_reader);
  select coalesce(array_agg(t), '{}') into v_projects from private.rls_live_project_health(p_org) t;
  select coalesce(array_agg(t), '{}') into v_programmes from private.rls_live_programme_health(p_org) t;
  select coalesce(array_agg(t), '{}') into v_portfolios from private.rls_live_portfolio_health(p_org) t;
  perform private.health_reader_restore(v_old);

  return query
  with s as (select t.project_id as id, to_jsonb(t) - 'computed_at' as j from public.project_health_current t where t.organisation_id = p_org),
       l as (select t.project_id as id, to_jsonb(t) - 'computed_at' as j from unnest(v_projects) t)
  select 'project'::text, coalesce(s.id, l.id), s.j, l.j from s full join l on l.id = s.id
  where s.j is distinct from l.j
  union all
  select 'programme'::text, coalesce(s.id, l.id), s.j, l.j
  from (select t.programme_id as id, to_jsonb(t) - 'computed_at' as j from public.programme_health_current t where t.organisation_id = p_org) s
  full join (select t.programme_id as id, to_jsonb(t) - 'computed_at' as j from unnest(v_programmes) t) l on l.id = s.id
  where s.j is distinct from l.j
  union all
  select 'portfolio'::text, coalesce(s.id, l.id), s.j, l.j
  from (select t.portfolio_id as id, to_jsonb(t) - 'computed_at' as j from public.portfolio_health_current t where t.organisation_id = p_org) s
  full join (select t.portfolio_id as id, to_jsonb(t) - 'computed_at' as j from unnest(v_portfolios) t) l on l.id = s.id
  where s.j is distinct from l.j;
end;
$function$;

-- Per organisation (all of them when p_org is null), reading through RLS as each one's admin.
-- The inserts and conflict rules are unchanged; pathway snapshots are as before.
create or replace function private.capture_health_snapshots(p_org uuid default null::uuid, p_date date default null::date)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  n integer := 0;
  c integer;
  o uuid;
  v_reader uuid;
  v_old text[];
  v_rows jsonb;
begin
  for o in select x.id from public.organisations x where p_org is null or x.id = p_org order by x.id loop
    v_reader := private.health_reader_id(o);
    if v_reader is null then
      insert into private.health_refresh_skips (organisation_id, job, reason) values (o, 'snapshot', 'no_admin');
      continue;
    end if;
    v_old := private.health_reader_claims(v_reader);
    v_rows := private.rls_health_snapshot_rows(o, p_date);
    perform private.health_reader_restore(v_old);

    insert into public.health_snapshots (organisation_id, workspace_id, project_id, snapshot_date, overall, schedule, financial,
      effort, issue, benefit, forecast_finish_date, forecast_basis)
    select r.organisation_id, r.workspace_id, r.project_id, r.snapshot_date, r.overall, r.schedule, r.financial,
      r.effort, r.issue, r.benefit, r.forecast_finish_date, r.forecast_basis
    from jsonb_populate_recordset(null::public.health_snapshots, v_rows) r
    where r.project_id is not null
    on conflict (coalesce(portfolio_id, programme_id, project_id), snapshot_date) do update
      set overall = excluded.overall, schedule = excluded.schedule, financial = excluded.financial, effort = excluded.effort,
          issue = excluded.issue, benefit = excluded.benefit, forecast_finish_date = excluded.forecast_finish_date, is_synthetic = false;
    get diagnostics c = row_count; n := n + c;

    insert into public.health_snapshots (organisation_id, workspace_id, programme_id, snapshot_date, overall, benefit,
      forecast_finish_date, forecast_basis)
    select r.organisation_id, r.workspace_id, r.programme_id, r.snapshot_date, r.overall, r.benefit,
      r.forecast_finish_date, r.forecast_basis
    from jsonb_populate_recordset(null::public.health_snapshots, v_rows) r
    where r.programme_id is not null
    on conflict (coalesce(portfolio_id, programme_id, project_id), snapshot_date) do update
      set overall = excluded.overall, benefit = excluded.benefit, forecast_finish_date = excluded.forecast_finish_date, is_synthetic = false;
    get diagnostics c = row_count; n := n + c;

    insert into public.health_snapshots (organisation_id, workspace_id, portfolio_id, snapshot_date, overall,
      forecast_finish_date, forecast_basis, metrics)
    select r.organisation_id, r.workspace_id, r.portfolio_id, r.snapshot_date, r.overall,
      r.forecast_finish_date, r.forecast_basis, r.metrics
    from jsonb_populate_recordset(null::public.health_snapshots, v_rows) r
    where r.portfolio_id is not null
    on conflict (coalesce(portfolio_id, programme_id, project_id), snapshot_date) do update
      set overall = excluded.overall, forecast_finish_date = excluded.forecast_finish_date, metrics = excluded.metrics, is_synthetic = false;
    get diagnostics c = row_count; n := n + c;
  end loop;

  n := n + private.capture_pathway_snapshots(p_org, p_date);
  return n;
end;
$function$;
