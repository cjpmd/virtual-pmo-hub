-- GL-7 follow-up: public.terms_acceptances and public.accept_terms
-- (docs/sql/gl-7-terms-acceptances.sql). Needs only the migrations (no seed): creates its own
-- organisation, runs inside a transaction and rolls everything back. Each check raises on
-- failure; the last line prints the count passed. Cross-tenant cases are in cross_tenant.sql,
-- closure and purge handling in account_closure.sql.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/terms_acceptances.sql
\set ON_ERROR_STOP 1
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e7000000-0000-4000-8000-000000000001', 'gl7.admin@example.com', now(), '{}'),
  ('e7000000-0000-4000-8000-000000000002', 'gl7.member@example.com', now(),
   '{"terms_version": "2026-11-10", "terms_accepted_at": "2026-11-12T09:30:00Z"}'),
  ('e7000000-0000-4000-8000-000000000003', 'gl7.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e7000000-0000-4000-8000-000000000001', 'gl7.admin@example.com', 'GL7 Admin'),
  ('e7000000-0000-4000-8000-000000000002', 'gl7.member@example.com', 'GL7 Member'),
  ('e7000000-0000-4000-8000-000000000003', 'gl7.outsider@example.com', 'GL7 Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e7000000-0000-4000-8000-000000000001'),
  ('member', 'e7000000-0000-4000-8000-000000000002'), ('outsider', 'e7000000-0000-4000-8000-000000000003');

create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'anon', true), set_config('role', 'anon', true); $$;
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

select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'GL7 Org', p_sector => 'general');
select pg_temp.as_owner();
insert into public.organisation_members (organisation_id, profile_id, role) values (pg_temp.c('org'), pg_temp.c('member'), 'viewer');

-- Refusals.
select pg_temp.as_anon();
select pg_temp.raises('anon can''t call it', $$select public.accept_terms(pg_temp.c('org'), '2026-11-10', 'sign_in_prompt')$$, '42501');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('bad version', $$select public.accept_terms(pg_temp.c('org'), 'latest', 'sign_in_prompt')$$, '22023', 'bad_terms_version');
select pg_temp.raises('bad method', $$select public.accept_terms(pg_temp.c('org'), '2026-11-10', 'by_magic')$$, '22023', 'bad_method');
select pg_temp.raises('direct insert refused', $$insert into public.terms_acceptances (organisation_id, profile_id, terms_version, method)
  values (pg_temp.c('org'), pg_temp.c('admin'), '2026-11-10', 'sign_in_prompt')$$, '42501');
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.raises('a non-member can''t accept for the organisation',
  $$select public.accept_terms(pg_temp.c('org'), '2026-11-10', 'sign_in_prompt')$$, '42501');
select pg_temp.as_user(pg_temp.c('member'));
select pg_temp.raises('only an admin accepts at setup',
  $$select public.accept_terms(pg_temp.c('org'), '2026-11-10', 'organisation_setup')$$, '42501');
select pg_temp.raises('sign-up form: the version must match the metadata',
  $$select public.accept_terms(pg_temp.c('org'), '2026-12-01', 'signup_form')$$, '22023', 'terms_version_mismatch');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('sign-up form: no metadata (a Microsoft sign-up)',
  $$select public.accept_terms(pg_temp.c('org'), '2026-11-10', 'signup_form')$$, '22023', 'terms_version_mismatch');

-- Accepting.
select pg_temp.ok('the admin accepts at setup', public.accept_terms(pg_temp.c('org'), '2026-11-10', 'organisation_setup') <= now());
select pg_temp.as_user(pg_temp.c('member'));
select pg_temp.ok('sign-up form: accepted_at is the form''s time',
  public.accept_terms(pg_temp.c('org'), '2026-11-10', 'signup_form') = '2026-11-12T09:30:00Z'::timestamptz);
select pg_temp.ok('accepting again returns the first acceptance',
  public.accept_terms(pg_temp.c('org'), '2026-11-10', 'sign_in_prompt') = '2026-11-12T09:30:00Z'::timestamptz);
select pg_temp.ok('a new version is a new record', public.accept_terms(pg_temp.c('org'), '2026-12-01', 'sign_in_prompt') is not null);
select pg_temp.as_owner();
select pg_temp.ok('three rows, with method and person',
  (select count(*) from public.terms_acceptances where organisation_id = pg_temp.c('org')) = 3
  and exists (select 1 from public.terms_acceptances where profile_id = pg_temp.c('member') and terms_version = '2026-11-10' and method = 'signup_form')
  and exists (select 1 from public.terms_acceptances where profile_id = pg_temp.c('admin') and method = 'organisation_setup'));

-- Reads: own rows; admins see the organisation's.
select pg_temp.as_user(pg_temp.c('member'));
select pg_temp.ok('a member sees only their own', (select count(*) from public.terms_acceptances) = 2
  and not exists (select 1 from public.terms_acceptances where profile_id <> pg_temp.c('member')));
select pg_temp.raises('a member can''t edit their record', $$update public.terms_acceptances set accepted_at = now()$$, '42501');
select pg_temp.raises('or delete it', $$delete from public.terms_acceptances$$, '42501');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.ok('the admin sees all three', (select count(*) from public.terms_acceptances where organisation_id = pg_temp.c('org')) = 3);
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('an outsider sees none', (select count(*) from public.terms_acceptances) = 0);

-- Read-only organisation: accepting still works (no read-only trigger on the table).
select pg_temp.as_owner();
update public.organisation_subscriptions set trial_ends_at = now() - interval '1 day' where organisation_id = pg_temp.c('org');
select pg_temp.ok('setup: organisation read-only', private.organisation_is_writable(pg_temp.c('org')) is false);
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.ok('accepting works while read-only', public.accept_terms(pg_temp.c('org'), '2026-12-01', 'sign_in_prompt') is not null);

-- A closed account can't accept.
select pg_temp.as_owner();
update public.profiles set closed_at = now() where id = pg_temp.c('member');
select pg_temp.as_user(pg_temp.c('member'));
select pg_temp.raises('a closed account can''t accept', $$select public.accept_terms(pg_temp.c('org'), '2027-01-01', 'sign_in_prompt')$$, '42501');

select pg_temp.as_owner();
select 'terms_acceptances: ' || n || ' checks passed' from passed;
rollback;
