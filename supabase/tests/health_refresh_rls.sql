-- GL-17b: health refresh under RLS (docs/sql/gl-17b-health-refresh-rls.sql). Parity and behaviour.
-- Runs on any local database with organisations (the seeded one, or the 5-tenant perf data from
-- scripts/perf-multi-tenant/run.sh) inside one transaction that is rolled back. Never on production.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/health_refresh_rls.sql
-- Parity: for every organisation with an admin, what the RLS readers return as that admin equals
-- what the owner's functions return (private.live_*, and the owner's copy of the snapshot rows),
-- row for row apart from computed_at; after refresh_all_health_current the nightly check finds no
-- mismatch, and the stored rows equal the owner's live rows.
\set ON_ERROR_STOP 1
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update passed set n = n + 1;
end $$;
create function pg_temp.as_owner() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true); $$;

-- The owner's reference for the snapshot rows: the three selects capture_health_snapshots ran as
-- the owner before GL-17b (migration 20261005175729 and later), unchanged, for one organisation.
create function pg_temp.owner_snapshot_rows(p_org uuid, p_date date) returns jsonb language sql as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select to_jsonb(r) as x from (
      select h.organisation_id, h.workspace_id, h.project_id, coalesce(p_date, private.org_today(h.organisation_id)) as snapshot_date, h.overall,
        h.schedule, h.financial, h.effort, h.issue, h.benefit, h.forecast_finish_date, h.forecast_basis
      from public.v_project_health h join public.projects p on p.id = h.project_id
      where p.state <> 'closed' and h.organisation_id = p_org) r
    union all
    select to_jsonb(r) from (
      select g.organisation_id, g.workspace_id, g.programme_id, coalesce(p_date, private.org_today(g.organisation_id)) as snapshot_date, g.overall,
        g.benefit, g.forecast_finish_date, g.forecast_basis
      from public.v_programme_health g join public.programmes pr on pr.id = g.programme_id
      where pr.state = 'active' and g.organisation_id = p_org) r
    union all
    select to_jsonb(r) from (
      select f.organisation_id, f.workspace_id, f.portfolio_id, coalesce(p_date, private.org_today(f.organisation_id)) as snapshot_date, f.overall,
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
         where p.effective_portfolio_id = f.portfolio_id and p.state = 'active') as metrics
      from public.v_portfolio_health f join public.portfolios pf on pf.id = f.portfolio_id
      where pf.state = 'active' and f.organisation_id = p_org) r
  ) s $$;

-- One snapshot object in a fixed shape (every column, table defaults for the ones capture leaves out).
create function pg_temp.norm_snap(e jsonb) returns jsonb language sql as $$
  select (to_jsonb(r) - 'id' - 'is_synthetic' - 'created_at' - 'source') || jsonb_build_object('metrics', coalesce(r.metrics, '{}'))
  from jsonb_populate_record(null::public.health_snapshots, e) r $$;

create temp table hr_orgs as
select o.id, private.health_reader_id(o.id) as reader,
       (select count(*) from public.projects p where p.organisation_id = o.id) as projects
from public.organisations o;
select pg_temp.ok('setup: at least one organisation with an admin and projects',
  exists (select 1 from hr_orgs where reader is not null and projects > 0));

-- Rows as the organisation's admin through the readers (the swap the refresh does).
create function pg_temp.rls_rows(p_org uuid, p_level text) returns setof jsonb language plpgsql as $$
declare v_old text[] := private.health_reader_claims(private.health_reader_id(p_org));
begin
  if p_level = 'project' then return query select to_jsonb(t) - 'computed_at' from private.rls_live_project_health(p_org) t;
  elsif p_level = 'programme' then return query select to_jsonb(t) - 'computed_at' from private.rls_live_programme_health(p_org) t;
  elsif p_level = 'portfolio' then return query select to_jsonb(t) - 'computed_at' from private.rls_live_portfolio_health(p_org) t;
  else return query select pg_temp.norm_snap(e) from jsonb_array_elements(private.rls_health_snapshot_rows(p_org, current_date)) e;
  end if;
  perform private.health_reader_restore(v_old);
end $$;
create function pg_temp.owner_rows(p_org uuid, p_level text) returns setof jsonb language plpgsql as $$
begin
  if p_level = 'project' then return query select to_jsonb(t) - 'computed_at' from private.live_project_health(p_org) t;
  elsif p_level = 'programme' then return query select to_jsonb(t) - 'computed_at' from private.live_programme_health(p_org) t;
  elsif p_level = 'portfolio' then return query select to_jsonb(t) - 'computed_at' from private.live_portfolio_health(p_org) t;
  else return query select pg_temp.norm_snap(e) from jsonb_array_elements(pg_temp.owner_snapshot_rows(p_org, current_date)) e;
  end if;
end $$;
-- Each side computed once (the owner's reads are slow with several tenants).
create temp table hr_owner as
select o.id, l.level, j from hr_orgs o, unnest(array['project', 'programme', 'portfolio', 'snapshot']) l(level),
  lateral pg_temp.owner_rows(o.id, l.level) j where o.reader is not null;
create temp table hr_rls as
select o.id, l.level, j from hr_orgs o, unnest(array['project', 'programme', 'portfolio', 'snapshot']) l(level),
  lateral pg_temp.rls_rows(o.id, l.level) j where o.reader is not null;
create temp table hr_parity as
select o.id, l.level,
  (select count(*) from hr_owner w where w.id = o.id and w.level = l.level) as owner_rows,
  (select count(*) from (
     (select j from hr_owner w where w.id = o.id and w.level = l.level except all select j from hr_rls r where r.id = o.id and r.level = l.level)
     union all
     (select j from hr_rls r where r.id = o.id and r.level = l.level except all select j from hr_owner w where w.id = o.id and w.level = l.level)) x) as differences
from hr_orgs o, unnest(array['project', 'programme', 'portfolio', 'snapshot']) l(level)
where o.reader is not null;
select 'parity: ' || level || ' ' || id || ' rows ' || owner_rows || ' differences ' || differences from hr_parity order by id, level;
select pg_temp.ok('parity: RLS readers equal the owner''s rows for every organisation and level',
  not exists (select 1 from hr_parity where differences <> 0));
select pg_temp.ok('parity: the comparison saw rows', (select sum(owner_rows) from hr_parity) > 0);

-- The full nightly path: refresh everything under RLS, then the check finds nothing.
select private.refresh_all_health_current();
select pg_temp.ok('nightly check after a full refresh: 0 mismatches',
  private.check_health_current('gl-17b test') = 0);
create function pg_temp.stored_rows(p_org uuid, p_level text) returns setof jsonb language sql as $$
  select to_jsonb(t) - 'computed_at' from public.project_health_current t where p_level = 'project' and t.organisation_id = p_org
  union all select to_jsonb(t) - 'computed_at' from public.programme_health_current t where p_level = 'programme' and t.organisation_id = p_org
  union all select to_jsonb(t) - 'computed_at' from public.portfolio_health_current t where p_level = 'portfolio' and t.organisation_id = p_org $$;
select pg_temp.ok('stored rows equal the owner''s live rows for every organisation and level',
  not exists (
    select 1 from hr_orgs o, unnest(array['project', 'programme', 'portfolio']) l(level) where o.reader is not null and exists (
      (select j from hr_owner w where w.id = o.id and w.level = l.level except all select j from pg_temp.stored_rows(o.id, l.level) j)
      union all
      (select j from pg_temp.stored_rows(o.id, l.level) j except all select j from hr_owner w where w.id = o.id and w.level = l.level))));

-- Snapshots: what capture writes (today) equals the owner's rows.
create function pg_temp.snap_key(r public.health_snapshots) returns text language sql as $$
  select concat_ws('|', r.workspace_id, r.project_id, r.programme_id, r.portfolio_id, r.overall, r.schedule, r.financial,
                   r.effort, r.issue, r.benefit, r.forecast_finish_date, r.forecast_basis, coalesce(r.metrics, '{}')) $$;  -- the table's default
delete from public.health_snapshots where snapshot_date = current_date;
select private.capture_health_snapshots(null, current_date);
select pg_temp.ok('snapshots written for every organisation with an admin equal the owner''s rows (metrics included)',
  not exists (
    select 1 from hr_orgs o where o.reader is not null and exists (
      (select pg_temp.snap_key(jsonb_populate_record(null::public.health_snapshots, w.j)) from hr_owner w where w.id = o.id and w.level = 'snapshot'
       except all
       select pg_temp.snap_key(s) from public.health_snapshots s where s.organisation_id = o.id and s.snapshot_date = current_date)
      union all
      (select pg_temp.snap_key(s) from public.health_snapshots s where s.organisation_id = o.id and s.snapshot_date = current_date
       except all
       select pg_temp.snap_key(jsonb_populate_record(null::public.health_snapshots, w.j)) from hr_owner w where w.id = o.id and w.level = 'snapshot'))));

-- The claims are put back exactly: a signed-in caller (request.jwt.claims only, as PostgREST
-- sends), a caller with the legacy per-claim settings too, and the cron job (none).
create temp table hr_any as select id from hr_orgs where reader is not null order by projects desc limit 1;
select set_config('request.jwt.claims', '{"sub":"e1700000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
select private.refresh_health_current((select id from hr_any));
select pg_temp.ok('claims restored for a PostgREST-style caller',
  auth.uid() = 'e1700000-0000-4000-8000-0000000000aa'
  and coalesce(current_setting('request.jwt.claim.sub', true), '') = '');
select set_config('request.jwt.claim.sub', 'e1700000-0000-4000-8000-0000000000bb', true);
select set_config('request.jwt.claims', '{"sub":"e1700000-0000-4000-8000-0000000000bb","role":"authenticated"}', true);
select private.capture_health_snapshots((select id from hr_any), current_date + 401);
select pg_temp.ok('claims restored for a caller with the legacy claim settings',
  auth.uid() = 'e1700000-0000-4000-8000-0000000000bb'
  and current_setting('request.jwt.claim.sub', true) = 'e1700000-0000-4000-8000-0000000000bb');
select pg_temp.as_owner();
select private.refresh_health_current((select id from hr_any));
select pg_temp.ok('claims left empty for the cron job', auth.uid() is null);
-- A legacy claim setting left as '' (what a rolled-back set_config leaves): still read as the admin.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
delete from public.project_health_current where organisation_id = (select id from hr_any);
select private.refresh_health_current((select id from hr_any));
select pg_temp.ok('an empty legacy claim setting doesn''t hide the rows',
  (select count(*) from public.project_health_current where organisation_id = (select id from hr_any))
  = (select count(*) from hr_owner where id = (select id from hr_any) and level = 'project'));
select pg_temp.ok('the empty legacy claim setting is put back as it was',
  current_setting('request.jwt.claim.sub', true) = '' and auth.uid() is null);
-- A failing read rolls the swap back with it.
do $$ begin
  begin
    perform private.health_reader_claims(gen_random_uuid());
    raise exception 'boom';
  exception when others then null;
  end;
end $$;
select pg_temp.ok('a failed read leaves no swapped claims behind', auth.uid() is null);

-- The readers only see what the claims allow: no claims, or another organisation's admin, sees nothing.
select pg_temp.ok('a reader without claims sees nothing',
  not exists (select 1 from private.rls_live_project_health((select id from hr_any))));
select pg_temp.ok('readers are owned by authenticated, and anon can''t run them',
  (select bool_and(p.proowner = 'authenticated'::regrole and not has_function_privilege('anon', p.oid, 'execute'))
   from pg_proc p where p.oid in ('private.rls_live_project_health(uuid)'::regprocedure, 'private.rls_live_programme_health(uuid)'::regprocedure,
     'private.rls_live_portfolio_health(uuid)'::regprocedure, 'private.rls_health_snapshot_rows(uuid,date)'::regprocedure)));
select pg_temp.ok('authenticated can''t run the claim swap, the refresh or the reader choice',
  not has_function_privilege('authenticated', 'private.health_reader_claims(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.refresh_health_current(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.health_reader_id(uuid)', 'execute'));

-- An organisation with no admin is skipped and logged; its stored rows stay as they were.
insert into public.organisations (id, name, slug) values ('e1700000-0000-4000-8000-000000000001', 'GL17b no admin', 'gl17b-no-admin');
select private.refresh_health_current('e1700000-0000-4000-8000-000000000001');
select pg_temp.ok('no admin: refresh skipped and logged',
  exists (select 1 from private.health_refresh_skips where organisation_id = 'e1700000-0000-4000-8000-000000000001' and job = 'refresh'));
select pg_temp.ok('no admin: the check returns nothing',
  not exists (select 1 from private.health_current_mismatches('e1700000-0000-4000-8000-000000000001')));
select pg_temp.ok('no admin: the check is logged',
  exists (select 1 from private.health_refresh_skips where organisation_id = 'e1700000-0000-4000-8000-000000000001' and job = 'check'));

select 'health_refresh_rls: ' || n || ' checks passed' from passed;
rollback;
