-- Health view timings as a signed-in user through RLS (never as postgres: RLS is the cost).
-- Set :uid to an organisation admin's profile id and :org to the organisation's slug:
--   psql "$DB_URL" -v uid=<profile uuid> -v org=demo-university -f supabase/tests/health_timings.sql
-- sum(length(h::text)) forces every column to be computed; count(*) alone lets the planner
-- skip the expensive ones. Each view runs twice; the second run is the warm figure.
begin;
select set_config('request.jwt.claim.sub', :'uid', true),
       set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role', 'authenticated')::text, true) \g /dev/null
set local role authenticated;
set local statement_timeout = '120s';
\timing on
select 'v_project_health' as view, count(*), sum(length(h::text)) from public.v_project_health h
where h.organisation_id = (select id from public.organisations where slug = :'org');
select 'v_project_health' as view, count(*), sum(length(h::text)) from public.v_project_health h
where h.organisation_id = (select id from public.organisations where slug = :'org');
select 'v_programme_health' as view, count(*), sum(length(h::text)) from public.v_programme_health h
where h.organisation_id = (select id from public.organisations where slug = :'org');
select 'v_programme_health' as view, count(*), sum(length(h::text)) from public.v_programme_health h
where h.organisation_id = (select id from public.organisations where slug = :'org');
select 'v_portfolio_health' as view, count(*), sum(length(h::text)) from public.v_portfolio_health h
where h.organisation_id = (select id from public.organisations where slug = :'org');
select 'v_portfolio_health' as view, count(*), sum(length(h::text)) from public.v_portfolio_health h
where h.organisation_id = (select id from public.organisations where slug = :'org');
\timing off
rollback;
