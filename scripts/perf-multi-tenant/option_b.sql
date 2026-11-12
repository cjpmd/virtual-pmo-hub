-- GL-17 option B: the health views with their CTEs left to the planner (no MATERIALIZED), so the
-- organisation filter can be pushed down. Inside one transaction that is rolled back.
\set ON_ERROR_STOP 1
\ir measure_fn.sql
begin;
select id as t1 from public.organisations where slug = 'perf-test-university-t1' \gset
create temp table a_proj as select project_id as id, to_jsonb(t) - 'computed_at' as j from private.live_project_health(:'t1') t;
create temp table a_prog as select programme_id as id, to_jsonb(t) - 'computed_at' as j from private.live_programme_health(:'t1') t;
create temp table a_port as select portfolio_id as id, to_jsonb(t) - 'computed_at' as j from private.live_portfolio_health(:'t1') t;
do $$
declare r record; n int := 0;
begin
  for r in select c.oid, c.relname from pg_class c
           where c.relkind = 'v' and c.relnamespace = 'public'::regnamespace and pg_get_viewdef(c.oid) ilike '%as materialized%'
  loop
    execute format('create or replace view public.%I as %s', r.relname,
      regexp_replace(pg_get_viewdef(r.oid), 'AS MATERIALIZED', 'AS', 'gi'));
    n := n + 1;
  end loop;
  raise notice 'views rewritten: %', n;
end $$;
select count(*) as tenants from public.organisations \gset
\echo tenants=:tenants
select id as t1 from public.organisations where slug = 'perf-test-university-t1' \gset
select pg_temp.t('B: refresh_health_current(t1)', format('select private.refresh_health_current(%L)', :'t1'), 2);
select pg_temp.t('B:   live_project_health(t1)', format('select sum(length(t::text)) from private.live_project_health(%L) t', :'t1'), 2);
select pg_temp.t('B:   live_programme_health(t1)', format('select sum(length(t::text)) from private.live_programme_health(%L) t', :'t1'), 2);
select pg_temp.t('B:   live_portfolio_health(t1)', format('select sum(length(t::text)) from private.live_portfolio_health(%L) t', :'t1'), 2);
select pg_temp.t('B: signed-in t1 admin: v_portfolio_health', 'select count(*), sum(length(h::text)) from public.v_portfolio_health h', 2, 'authenticated', 'b1700000-0000-4000-8000-000000000001');
-- Same output as the materialised views?
select 'B: rows differing (project, programme, portfolio)|' ||
  (select count(*) from a_proj a full join (select project_id as id, to_jsonb(t) - 'computed_at' as j from private.live_project_health(:'t1') t) b using (id) where a.j is distinct from b.j) || ',' ||
  (select count(*) from a_prog a full join (select programme_id as id, to_jsonb(t) - 'computed_at' as j from private.live_programme_health(:'t1') t) b using (id) where a.j is distinct from b.j) || ',' ||
  (select count(*) from a_port a full join (select portfolio_id as id, to_jsonb(t) - 'computed_at' as j from private.live_portfolio_health(:'t1') t) b using (id) where a.j is distinct from b.j);
rollback;
