-- GL-14 Phase C: the progress-chart committee markers come only from published report-builder
-- packs, and both overview RPCs keep working once public.committee_packs is dropped
-- (docs/sql/gl-14c-retire-committee-packs.sql, section D). Runs on the seeded local Postgres
-- (supabase/tests/local/run.sh migrate && run.sh seed) inside one transaction that is rolled back,
-- including the drop. Never run it on production.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/committee_markers.sql
\set ON_ERROR_STOP 1
begin;

create temp table passed (n integer);
insert into passed values (0);
create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update passed set n = n + 1;
end $$;

create temp table ctx (k text primary key, v uuid);
insert into ctx select 'project', p.id from public.projects p
  join public.forums f on f.organisation_id = p.organisation_id and f.forum_type = 'committee'
  where p.archived_at is null order by p.created_at, p.id limit 1;
insert into ctx select 'org', organisation_id from public.projects where id = (select v from ctx where k = 'project');
insert into ctx select 'ws', workspace_id from public.projects where id = (select v from ctx where k = 'project');
insert into ctx select 'forum', f.id from public.forums f where f.organisation_id = (select v from ctx where k = 'org')
  and f.forum_type = 'committee' order by f.created_at limit 1;
insert into ctx select 'board', f.id from public.forums f where f.organisation_id = (select v from ctx where k = 'org')
  and f.forum_type = 'project_board' order by f.created_at limit 1;
select pg_temp.ok('setup: a project, a committee and a project board', (select count(*) from ctx where v is not null) = 5);
create function pg_temp.c(k text) returns uuid language sql stable as $$ select v from ctx where ctx.k = c.k $$;

-- A legacy committee pack (must not show), a published committee pack (shows), a published
-- project-board pack and a draft committee pack (don't show).
do $$ begin
  if to_regclass('public.committee_packs') is not null then  -- until section D has been run
    execute format('insert into public.committee_packs (organisation_id, workspace_id, title, meeting_date) values (%L, %L, %L, %L)',
                   pg_temp.c('org'), pg_temp.c('ws'), 'GL14C legacy pack', current_date - 40);
  end if;
end $$;
set local session_replication_role = replica;
insert into public.reports (organisation_id, workspace_id, forum_id, title, scope_type, scope_entity_id, as_at, status, published_at)
values
  (pg_temp.c('org'), pg_temp.c('ws'), pg_temp.c('forum'), 'GL14C committee pack', 'project', pg_temp.c('project'), current_date - 20, 'published', now()),
  (pg_temp.c('org'), pg_temp.c('ws'), pg_temp.c('board'), 'GL14C board pack', 'project', pg_temp.c('project'), current_date - 10, 'published', now()),
  (pg_temp.c('org'), pg_temp.c('ws'), pg_temp.c('forum'), 'GL14C draft pack', 'project', pg_temp.c('project'), current_date - 5, 'draft', null);
set local session_replication_role = origin;

create function pg_temp.titles(j jsonb) returns text[] language sql as $$
  select coalesce(array_agg(e ->> 'title' order by e ->> 'title'), '{}') from jsonb_array_elements(coalesce(j, '[]')) e
  where e ->> 'title' like 'GL14C%' $$;

select pg_temp.ok('project overview: only the published committee pack',
  pg_temp.titles(public.get_project_overview(pg_temp.c('project')) -> 'committeeDates') = array['GL14C committee pack']);
select pg_temp.ok('portfolio overview: only the published committee pack',
  pg_temp.titles(public.get_portfolio_overview(pg_temp.c('ws')) -> 'committeeDates') = array['GL14C committee pack']);
select pg_temp.ok('the marker is dated by the pack''s as-at date (no meeting)',
  (select (e ->> 'date')::date from jsonb_array_elements(public.get_project_overview(pg_temp.c('project')) -> 'committeeDates') e
   where e ->> 'title' = 'GL14C committee pack') = current_date - 20);

-- Section D of the SQL file: once the table is dropped, both RPCs still work.
do $$ begin
  if to_regclass('public.committee_packs') is not null then execute 'drop table public.committee_packs'; end if;
end $$;
select pg_temp.ok('project overview works without committee_packs',
  pg_temp.titles(public.get_project_overview(pg_temp.c('project')) -> 'committeeDates') = array['GL14C committee pack']);
select pg_temp.ok('portfolio overview works without committee_packs',
  public.get_portfolio_overview(pg_temp.c('ws')) ? 'committeeDates');
select pg_temp.ok('no function in public or private still names committee_packs',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'private') and p.prosrc ~ 'committee_packs'));

select 'committee_markers: ' || n || ' checks passed' from passed;
rollback;
