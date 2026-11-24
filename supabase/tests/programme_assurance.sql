-- NHS-1 part 3: programme assurance ratings and the assurance_by_programme block
-- (supabase/migrations/20261122210000_nhs_1c_programme_assurance.sql). Needs only the migrations
-- (no seed): creates its own organisation, runs inside a transaction and rolls everything back.
-- Each check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/programme_assurance.sql
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;
create temp table out (k text primary key, v jsonb);
grant all on out to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9300000-0000-4000-8000-000000000001', 'nhs1c.admin@example.com', now(), '{}'),
  ('e9300000-0000-4000-8000-000000000002', 'nhs1c.pmo@example.com', now(), '{}'),
  ('e9300000-0000-4000-8000-000000000003', 'nhs1c.contrib@example.com', now(), '{}'),
  ('e9300000-0000-4000-8000-000000000005', 'nhs1c.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9300000-0000-4000-8000-000000000001', 'nhs1c.admin@example.com', 'NHS1c Admin'),
  ('e9300000-0000-4000-8000-000000000002', 'nhs1c.pmo@example.com', 'NHS1c PMO'),
  ('e9300000-0000-4000-8000-000000000003', 'nhs1c.contrib@example.com', 'NHS1c Contributor'),
  ('e9300000-0000-4000-8000-000000000005', 'nhs1c.outsider@example.com', 'NHS1c Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9300000-0000-4000-8000-000000000001'),
  ('pmo', 'e9300000-0000-4000-8000-000000000002'), ('contrib', 'e9300000-0000-4000-8000-000000000003'),
  ('outsider', 'e9300000-0000-4000-8000-000000000005');

create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
create function pg_temp.as_owner() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true); $$;
create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update passed set n = n + 1;
end $$;
create function pg_temp.raises(name text, sql text, state text, hint text default null) returns void language plpgsql as $$
declare v_state text; v_hint text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    perform pg_temp.ok(name || ' [' || v_state || coalesce(' ' || v_hint, '') || ']',
                       v_state = state and (hint is null or v_hint = hint));
    return;
  end;
  raise exception 'FAIL: % (no error)', name;
end $$;
create function pg_temp.c(k text) returns uuid language sql stable as $$ select v from ctx where ctx.k = c.k $$;
grant execute on function pg_temp.c(text) to authenticated, anon;
create function pg_temp.o(k text) returns jsonb language sql stable as $$ select v from out where out.k = o.k $$;
grant execute on function pg_temp.o(text) to authenticated, anon;
create function pg_temp.block(as_at date default current_date, cfg jsonb default '{}') returns jsonb language sql as $$
  select public.report_block_data(
    jsonb_build_object('organisation_id', pg_temp.c('org'), 'scope_type', 'portfolio',
                       'scope_entity_id', pg_temp.c('portfolio'), 'as_at', as_at),
    jsonb_build_object('id', 'b', 'blockKey', 'assurance_by_programme', 'config', cfg)) $$;
grant execute on function pg_temp.block(date, jsonb) to authenticated, anon;
create function pg_temp.row_of(b jsonb) returns jsonb language sql immutable as $$
  select r from jsonb_array_elements(b -> 'rows') r where r ->> 'id' = pg_temp.c('prog')::text $$;
grant execute on function pg_temp.row_of(jsonb) to authenticated, anon;
create function pg_temp.audit_rows() returns bigint language sql stable security definer as $$
  select count(*) from public.audit_log where entity_table = 'programme_assurance_ratings'
    and organisation_id = pg_temp.c('org') $$;

-- An organisation with sample data (a programme in a portfolio). Board assurance is off.
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS1c Org', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('org'));
select pg_temp.as_owner();
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into ctx select 'portfolio', id from public.portfolios where organisation_id = pg_temp.c('org') and is_sample limit 1;
insert into ctx select 'prog', id from public.programmes where organisation_id = pg_temp.c('org') and is_sample limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('org'), pg_temp.c('pmo'), 'pmo'), (pg_temp.c('org'), pg_temp.c('contrib'), 'contributor');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('contrib'), 'contributor')
on conflict do nothing;
select pg_temp.ok('fixture: a sample programme in a portfolio', pg_temp.c('prog') is not null and pg_temp.c('portfolio') is not null);

-- 1. Module off: nobody can rate.
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.raises('module off: PMO can''t rate a programme',
  $$insert into public.programme_assurance_ratings (programme_id, rating) values (pg_temp.c('prog'), 'reasonable')$$, '42501');

-- 2. Board assurance on (NHS pack). PMO rates the programme twice.
select pg_temp.as_user(pg_temp.c('admin'));
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.as_user(pg_temp.c('pmo'));
with ins as (
  insert into public.programme_assurance_ratings (programme_id, rating, rationale, rated_on)
  values (pg_temp.c('prog'), 'reasonable', 'Plans agreed; delivery not yet evidenced', current_date - 30)
  returning id, organisation_id, workspace_id, rating_scheme_id)
insert into ctx select 'r1', id from ins
  where organisation_id = pg_temp.c('org') and workspace_id = pg_temp.c('ws')
    and rating_scheme_id = (select id from public.rating_schemes where key = 'nhs_assurance' and organisation_id is null);
select pg_temp.ok('first rating: organisation, workspace and NHS scheme stamped', pg_temp.c('r1') is not null);
select pg_temp.ok('view: one rating, new', (select v.rating = 'reasonable' and v.direction = 'new' and v.rating_count = 1
  and v.label = 'Reasonable assurance' from public.v_programme_assurance v where v.programme_id = pg_temp.c('prog')));
insert into public.programme_assurance_ratings (programme_id, rating, rationale)
values (pg_temp.c('prog'), 'limited', 'Two milestones missed; recovery plan not agreed');
select pg_temp.ok('view: latest limited, previous reasonable, worse', (select v.rating = 'limited'
  and v.previous_rating = 'reasonable' and v.direction = 'worse' and v.rating_count = 2 and v.rated_by_name is not null
  from public.v_programme_assurance v where v.programme_id = pg_temp.c('prog')));
select pg_temp.ok('ratings are audited', pg_temp.audit_rows() = 2);

-- 3. Validation.
select pg_temp.raises('a rating must be a level of the scheme',
  $$insert into public.programme_assurance_ratings (programme_id, rating) values (pg_temp.c('prog'), 'excellent')$$, '23514');
select pg_temp.raises('a rating can''t be dated in the future',
  $$insert into public.programme_assurance_ratings (programme_id, rating, rated_on)
    values (pg_temp.c('prog'), 'limited', current_date + 1)$$, '23514');
select pg_temp.raises('a non-assurance scheme is refused',
  $$insert into public.programme_assurance_ratings (programme_id, rating, rating_scheme_id)
    select pg_temp.c('prog'), 'green', id from public.rating_schemes where key = 'rag' and organisation_id is null$$, '23514');
select pg_temp.raises('an unknown programme is refused',
  $$insert into public.programme_assurance_ratings (programme_id, rating) values (gen_random_uuid(), 'limited')$$, '23503');
select pg_temp.raises('ratings can''t be edited (a new judgement is a new row)',
  $$update public.programme_assurance_ratings set rating = 'substantial' where id = pg_temp.c('r1')$$, '42501');

-- 4. Roles: a contributor reads but can't rate or delete; an outsider sees nothing.
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.ok('contributor reads both ratings', (select count(*) from public.programme_assurance_ratings) = 2);
select pg_temp.raises('contributor can''t rate',
  $$insert into public.programme_assurance_ratings (programme_id, rating) values (pg_temp.c('prog'), 'substantial')$$, '42501');
delete from public.programme_assurance_ratings where id = pg_temp.c('r1');
select pg_temp.ok('contributor''s delete removes nothing', (select count(*) from public.programme_assurance_ratings) = 2);
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('outsider sees no rating', (select count(*) from public.programme_assurance_ratings) = 0
  and (select count(*) from public.v_programme_assurance) = 0);
select pg_temp.raises('outsider can''t rate',
  $$insert into public.programme_assurance_ratings (programme_id, rating) values (pg_temp.c('prog'), 'limited')$$, '23503');

-- 5. The block: rating in force on the as-at date.
select pg_temp.as_user(pg_temp.c('pmo'));
insert into out select 'now', pg_temp.block();
select pg_temp.ok('block: the programme is listed as limited and worse',
  pg_temp.row_of(pg_temp.o('now')) ->> 'rating' = 'limited' and pg_temp.row_of(pg_temp.o('now')) ->> 'direction' = 'worse'
  and pg_temp.row_of(pg_temp.o('now')) ->> 'previous' = 'Reasonable assurance');
select pg_temp.ok('block: counts and scheme legend', (pg_temp.o('now') ->> 'rated')::int = 1
  and (pg_temp.o('now') ->> 'worse')::int = 1 and (pg_temp.o('now') -> 'counts' ->> 'limited')::int = 1
  and jsonb_array_length(pg_temp.o('now') -> 'scheme' -> 'levels') = 5);
select pg_temp.ok('block: rationale shown by default', pg_temp.row_of(pg_temp.o('now')) ->> 'rationale' like 'Two milestones%');
insert into out select 'hidden', pg_temp.block(current_date, '{"show_rationale": false}');
select pg_temp.ok('block: rationale hidden on request', pg_temp.row_of(pg_temp.o('hidden')) -> 'rationale' = 'null'::jsonb);
insert into out select 'past', pg_temp.block(current_date - 10);
select pg_temp.ok('block: ten days ago the rating was reasonable (new)',
  pg_temp.row_of(pg_temp.o('past')) ->> 'rating' = 'reasonable' and pg_temp.row_of(pg_temp.o('past')) ->> 'direction' = 'new');
insert into out select 'early', pg_temp.block(current_date - 60);
select pg_temp.ok('block: before any rating the programme is unrated', pg_temp.row_of(pg_temp.o('early')) ->> 'rating' is null
  and (pg_temp.o('early') -> 'counts' ->> 'unrated')::int >= 1);
insert into out select 'rated_only', pg_temp.block(current_date - 60, '{"include_unrated": false}');
select pg_temp.ok('block: unrated programmes left out on request', jsonb_array_length(pg_temp.o('rated_only') -> 'rows') = 0);
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('block: outsider gets no programme', jsonb_array_length(coalesce(pg_temp.block() -> 'rows', '[]')) = 0);

-- 6. PMO deletes the newest rating (a correction): the earlier one is current again.
select pg_temp.as_user(pg_temp.c('pmo'));
delete from public.programme_assurance_ratings where rating = 'limited';
select pg_temp.ok('after the correction the rating is reasonable', (select v.rating = 'reasonable' and v.rating_count = 1
  from public.v_programme_assurance v where v.programme_id = pg_temp.c('prog')));
select pg_temp.ok('the delete is audited', pg_temp.audit_rows() = 3);

-- 7. Archived programmes can't be rated.
select pg_temp.as_owner();
update public.programmes set archived_at = now() where id = pg_temp.c('prog');
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.raises('archived programme can''t be rated',
  $$insert into public.programme_assurance_ratings (programme_id, rating) values (pg_temp.c('prog'), 'limited')$$, '42501');
select pg_temp.as_owner();
update public.programmes set archived_at = null where id = pg_temp.c('prog');

-- 8. Module off: ratings stay readable; no new ratings or deletes.
select pg_temp.as_user(pg_temp.c('admin'));
select public.set_organisation_module(pg_temp.c('org'), 'assurance', false);
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.ok('module off: rating kept', (select count(*) from public.v_programme_assurance) = 1);
select pg_temp.raises('module off: no new rating',
  $$insert into public.programme_assurance_ratings (programme_id, rating) values (pg_temp.c('prog'), 'limited')$$, '42501');
delete from public.programme_assurance_ratings where id = pg_temp.c('r1');
select pg_temp.ok('module off: delete removes nothing', (select count(*) from public.programme_assurance_ratings) = 1);

-- 9. Partner safety and templates.
select pg_temp.as_owner();
select pg_temp.ok('block is partner-unsafe', 'assurance_by_programme' = any (private.partner_unsafe_blocks()));
select pg_temp.ok('Trust Board and Executive / PMO Board templates hold the block',
  (select count(*) from public.report_templates where is_system and organisation_id is null
     and name in ('Trust Board', 'Executive Management / PMO Board')
     and blocks @> '[{"blockKey":"assurance_by_programme"}]') = 2);
select pg_temp.ok('read-only trigger present', exists (select 1 from pg_trigger
  where tgrelid = 'public.programme_assurance_ratings'::regclass and tgname = 'zz_org_read_only'));
select pg_temp.ok('view is security invoker', (select reloptions @> '{security_invoker=true}' from pg_class
  where oid = 'public.v_programme_assurance'::regclass));

select 'programme_assurance: ' || n || ' checks passed' from passed;
rollback;
