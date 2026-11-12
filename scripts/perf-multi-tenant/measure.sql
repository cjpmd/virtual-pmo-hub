-- GL-17 harness (local only). Prints label|runs|median ms|min ms|max ms. Every run is inside a
-- subtransaction that is rolled back, so each run starts from the same data.
\set ON_ERROR_STOP 1
create or replace function pg_temp.t(p_label text, p_sql text, p_runs int default 3, p_role text default null, p_uid uuid default null)
returns text language plpgsql as $$
declare
  ms numeric[] := '{}';
  t0 timestamptz;
  i int;
begin
  for i in 1 .. p_runs loop
    begin
      if p_role is not null then
        perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
        perform set_config('request.jwt.claim.sub', p_uid::text, true);
        execute format('set local role %I', p_role);
      end if;
      t0 := clock_timestamp();
      execute p_sql;
      ms := ms || round(extract(epoch from clock_timestamp() - t0) * 1000, 0);
      raise exception using errcode = 'P0042', message = 'rollback run';
    exception when sqlstate 'P0042' then
      null;
    end;
    execute 'reset role';
  end loop;
  select array_agg(x order by x) into ms from unnest(ms) x;
  return format('%s|%s|%s|%s|%s', p_label, p_runs, ms[(p_runs + 1) / 2], ms[1], ms[p_runs]);
end $$;

select count(*) as tenants, (select count(*) from public.projects) as projects from public.organisations \gset
\echo tenants=:tenants projects=:projects
select id as t1 from public.organisations where slug = 'perf-test-university-t1' \gset

select pg_temp.t('warm-up refresh t1', format('select private.refresh_health_current(%L)', :'t1'), 1);
select pg_temp.t('refresh_health_current(t1)', format('select private.refresh_health_current(%L)', :'t1'), 3);
select pg_temp.t('  live_project_health(t1)', format('select sum(length(t::text)) from private.live_project_health(%L) t', :'t1'), 3);
select pg_temp.t('  live_programme_health(t1)', format('select sum(length(t::text)) from private.live_programme_health(%L) t', :'t1'), 3);
select pg_temp.t('  live_portfolio_health(t1)', format('select sum(length(t::text)) from private.live_portfolio_health(%L) t', :'t1'), 3);
select pg_temp.t('refresh_all_health_current()', 'select private.refresh_all_health_current()', 2);
select pg_temp.t('nightly full_health_refresh_and_check', $q$select private.full_health_refresh_and_check('gl-17')$q$, 2);
select pg_temp.t('capture_health_snapshots() all orgs', 'select private.capture_health_snapshots()', 2);
select pg_temp.t('signed-in t1 admin: v_project_health', 'select count(*), sum(length(h::text)) from public.v_project_health h', 3, 'authenticated', 'b1700000-0000-4000-8000-000000000001');
select pg_temp.t('signed-in t1 admin: v_portfolio_health', 'select count(*), sum(length(h::text)) from public.v_portfolio_health h', 3, 'authenticated', 'b1700000-0000-4000-8000-000000000001');
select pg_temp.t('signed-in t1 admin: project_health_current', 'select count(*), sum(length(h::text)) from public.project_health_current h', 3, 'authenticated', 'b1700000-0000-4000-8000-000000000001');
