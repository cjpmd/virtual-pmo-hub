-- GL-11 account closure and organisation deletion tests (docs/sql/gl-11-account-closure.sql).
-- Needs only the migrations (no seed): creates its own organisations, runs inside a transaction
-- and rolls everything back (including the profiles_id_fkey drop it does in section 4). Each
-- check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/account_closure.sql
\set ON_ERROR_STOP 1
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;
create temp table counts (k text primary key, n bigint);

insert into auth.users (id, email, email_confirmed_at) values
  ('e1100000-0000-4000-8000-000000000001', 'gl11.a.admin@example.com', now()),
  ('e1100000-0000-4000-8000-000000000002', 'gl11.a.member@example.com', now()),
  ('e1100000-0000-4000-8000-000000000003', 'gl11.b.admin@example.com', now()),
  ('e1100000-0000-4000-8000-000000000004', 'gl11.b.leaver@example.com', now()),
  ('e1100000-0000-4000-8000-000000000005', 'gl11.b.admin2@example.com', now());
insert into public.profiles (id, email, display_name) values
  ('e1100000-0000-4000-8000-000000000001', 'gl11.a.admin@example.com', 'GL11 A Admin'),
  ('e1100000-0000-4000-8000-000000000002', 'gl11.a.member@example.com', 'GL11 A Member'),
  ('e1100000-0000-4000-8000-000000000003', 'gl11.b.admin@example.com', 'GL11 B Admin'),
  ('e1100000-0000-4000-8000-000000000004', 'gl11.b.leaver@example.com', 'GL11 B Leaver'),
  ('e1100000-0000-4000-8000-000000000005', 'gl11.b.admin2@example.com', 'GL11 B Admin Two')
on conflict (id) do nothing;
insert into ctx values
  ('a_admin', 'e1100000-0000-4000-8000-000000000001'), ('a_member', 'e1100000-0000-4000-8000-000000000002'),
  ('b_admin', 'e1100000-0000-4000-8000-000000000003'), ('b_leaver', 'e1100000-0000-4000-8000-000000000004'),
  ('b_admin2', 'e1100000-0000-4000-8000-000000000005');

-- as_user: signed in; amr_age = seconds since sign-in (null = no amr claim at all).
create function pg_temp.as_user(u uuid, amr_age integer default 60) returns void language sql as $$
  select set_config('request.jwt.claims', (jsonb_build_object('sub', u, 'role', 'authenticated')
           || case when amr_age is null then '{}'::jsonb else jsonb_build_object('amr', jsonb_build_array(
                jsonb_build_object('method', 'password', 'timestamp', floor(extract(epoch from now())) - amr_age))) end)::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
-- as_oauth: a sign-in whose amr has no timestamp (as Microsoft's does), with its session id.
create function pg_temp.as_oauth(u uuid, session uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated', 'session_id', session,
           'amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
-- private.signed_in_at for given claims, called as the owner.
create function pg_temp.signed_in(u uuid, claims jsonb) returns timestamptz language plpgsql as $$
declare v timestamptz;
begin
  perform set_config('request.jwt.claims', claims::text, true);
  v := private.signed_in_at(u);
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;
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
grant execute on function pg_temp.c(text) to authenticated;
-- Rows anywhere (public and private tables with organisation_id) for an organisation.
create function pg_temp.org_rows(p_org uuid) returns bigint language plpgsql as $$
declare v_t record; v_n bigint; v_total bigint := 0;
begin
  for v_t in select format('%I.%I', n.nspname, c.relname) t from pg_class c join pg_namespace n on n.oid = c.relnamespace
             join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped
             where n.nspname in ('public', 'private') and c.relkind = 'r' loop
    execute format('select count(*) from %s where organisation_id = $1', v_t.t) into v_n using p_org;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end $$;

-- Two organisations with sample data; A gets the records that refuse deletion.
do $$
declare v_a uuid; v_b uuid; v_ws uuid; v_bc uuid; v_ver uuid; v_rep uuid; v_dec uuid;
begin
  perform pg_temp.as_user(pg_temp.c('a_admin'));
  v_a := public.create_organisation(p_name => 'GL11 Org A', p_sector => 'general');
  perform public.seed_sample_data(v_a);
  perform pg_temp.as_user(pg_temp.c('b_admin'));
  v_b := public.create_organisation(p_name => 'GL11 Org B', p_sector => 'general');
  perform public.seed_sample_data(v_b);
  perform pg_temp.as_owner();
  insert into ctx values ('org_a', v_a), ('org_b', v_b);

  insert into public.organisation_members (organisation_id, profile_id, role) values
    (v_a, pg_temp.c('a_member'), 'contributor'),
    (v_b, pg_temp.c('b_leaver'), 'contributor'),
    (v_a, pg_temp.c('b_leaver'), 'viewer'),
    (v_b, pg_temp.c('b_admin2'), 'admin');

  select id into v_ws from public.workspaces where organisation_id = v_a limit 1;
  -- Issued committee pack, published-style report snapshot, submitted business case, recorded decision.
  insert into public.committee_packs (organisation_id, workspace_id, title, meeting_date, issued_at, issued_by)
  values (v_a, v_ws, 'GL11 issued pack', current_date, now(), pg_temp.c('a_admin'));
  insert into public.reports (organisation_id, workspace_id, title, scope_type, as_at)
  values (v_a, v_ws, 'GL11 report', 'custom', current_date) returning id into v_rep;
  insert into public.report_snapshots (organisation_id, workspace_id, report_id, block_instance_id, block_key, data)
  values (v_a, v_ws, v_rep, 'b1', 'summary', '{}');
  insert into public.business_cases (organisation_id, workspace_id, project_id, title)
  select v_a, p.workspace_id, p.id, 'GL11 case' from public.projects p where p.organisation_id = v_a limit 1
  returning id, workspace_id into v_bc, v_ws;
  insert into public.business_case_versions (organisation_id, workspace_id, business_case_id, version)
  values (v_a, v_ws, v_bc, 1) returning id into v_ver;
  update public.business_case_versions set status = 'submitted', submitted_at = now(), submitted_by = pg_temp.c('a_admin')
   where id = v_ver;
  select id into v_dec from public.decisions where organisation_id = v_a limit 1;
  insert into public.decision_options (organisation_id, workspace_id, decision_id, title)
  select organisation_id, workspace_id, id, 'GL11 option' from public.decisions where id = v_dec;
  update public.decisions set status = 'made', decision_date = current_date, rationale = 'GL11' where id = v_dec;
  insert into ctx values ('pack', (select id from public.committee_packs where title = 'GL11 issued pack')),
                         ('snapshot', (select id from public.report_snapshots where report_id = v_rep)),
                         ('bc_version', v_ver), ('decision', v_dec);
end $$;
select pg_temp.ok('setup: guarded rows exist in A',
  (select count(*) from ctx where k in ('pack', 'snapshot', 'bc_version', 'decision') and v is not null) = 4);

-- =====================================================================================
-- 1. A signed-in user can't create, fake or reach the purge bypass.
-- =====================================================================================
select pg_temp.as_user(pg_temp.c('a_admin'));
select pg_temp.raises('user can''t insert a marker',
  $$insert into private.privileged_ops (txid, backend_pid, kind, target_organisation_id)
    values (txid_current(), pg_backend_pid(), 'purge', pg_temp.c('org_a'))$$, '42501');
select pg_temp.raises('user can''t read the markers', 'select * from private.privileged_ops', '42501');
select pg_temp.raises('user can''t call the public purge', $$select public.purge_organisation(pg_temp.c('org_a'), false)$$, '42501');
select pg_temp.raises('user can''t call the private purge', $$select private.purge_organisation(pg_temp.c('org_a'), false)$$, '42501');
select pg_temp.raises('user can''t start the purge job', 'select private.run_organisation_purges()', '42501');
select pg_temp.raises('user can''t change the purge mode', $$update private.organisation_purge_settings set mode = 'on'$$, '42501');
select pg_temp.raises('user can''t switch triggers off', $$select set_config('session_replication_role', 'replica', true)$$, '42501');
select set_config('vpmo.purging', 'on', true), set_config('vpmo.seeding', 'on', true);
select pg_temp.ok('settings a client can set don''t open the bypass', not private.in_purge() and not private.in_closure());
select pg_temp.raises('even a dry run is service-role only', $$select public.purge_organisation(pg_temp.c('org_a'))$$, '42501');
-- A refused close_my_account leaves no marker behind.
select pg_temp.raises('a refused closure (FK still present)', $$select public.close_my_account('gl11.a.admin@example.com')$$,
  '55000', 'closure_not_enabled');
select pg_temp.as_owner();
select pg_temp.ok('no markers left', not exists (select 1 from private.privileged_ops));

-- Owner-level checks of the marker itself.
select pg_temp.ok('no marker: in_purge false', not private.in_purge());
select pg_temp.raises('no marker: an issued pack can''t be deleted, even by postgres',
  $$delete from public.committee_packs where id = pg_temp.c('pack')$$, '42501');
select pg_temp.raises('no marker: a snapshot can''t be deleted', $$delete from public.report_snapshots where id = pg_temp.c('snapshot')$$, '42501');
insert into private.privileged_ops (txid, backend_pid, kind) values (txid_current() - 1, pg_backend_pid(), 'purge');
select pg_temp.ok('a marker for another transaction doesn''t count', not private.in_purge());
delete from private.privileged_ops;
insert into private.privileged_ops (txid, backend_pid, kind) values (txid_current(), pg_backend_pid() + 1, 'purge');
select pg_temp.ok('a marker for another backend doesn''t count', not private.in_purge());
delete from private.privileged_ops;
insert into private.privileged_ops (txid, backend_pid, kind) values (txid_current(), pg_backend_pid(), 'closure');
select pg_temp.ok('a closure marker never satisfies in_purge', not private.in_purge() and private.in_closure());
select pg_temp.raises('a closure marker doesn''t unlock an issued pack',
  $$delete from public.committee_packs where id = pg_temp.c('pack')$$, '42501');
delete from private.privileged_ops;

-- =====================================================================================
-- 2. Integrity: profiles need an auth user; closed profiles can't join.
-- =====================================================================================
select pg_temp.raises('a profile without an auth user is refused',
  $$insert into public.profiles (id, email, display_name) values (gen_random_uuid(), 'x@example.com', 'X')$$, '23503', 'profile_without_user');

-- =====================================================================================
-- 3. Account closure.
-- =====================================================================================
select pg_temp.as_user(pg_temp.c('b_leaver'));
select pg_temp.raises('closure refused until profiles_id_fkey is dropped',
  $$select public.close_my_account('gl11.b.leaver@example.com')$$, '55000', 'closure_not_enabled');
select pg_temp.as_owner();
alter table public.profiles drop constraint profiles_id_fkey;  -- section D (rolled back with the test)

-- Leaver's own records: a private and a shared dashboard, an invite to their address, audit text.
insert into public.dashboards (organisation_id, owner_id, name, is_shared) values
  (pg_temp.c('org_b'), pg_temp.c('b_leaver'), 'GL11 private', false),
  (pg_temp.c('org_b'), pg_temp.c('b_leaver'), 'GL11 shared', true);
insert into public.organisation_invites (organisation_id, email, role, invited_by)
values (pg_temp.c('org_b'), 'gl11.b.leaver@example.com', 'viewer', pg_temp.c('b_admin'));
insert into public.audit_log (organisation_id, actor_id, action, entity_table, entity_id, detail)
values (pg_temp.c('org_b'), pg_temp.c('b_admin'), 'member.removed', 'organisation_members', pg_temp.c('b_leaver'),
        '{"email": "gl11.b.leaver@example.com", "note": "keep me"}');
insert into ctx values ('leaver_res', (select id from public.resources
                                        where organisation_id = pg_temp.c('org_b') and profile_id = pg_temp.c('b_leaver')));
-- Make B read-only: closure must still work there.
update public.organisation_subscriptions set trial_ends_at = now() - interval '1 day' where organisation_id = pg_temp.c('org_b');
select pg_temp.ok('B is read-only for the test', not private.organisation_is_writable(pg_temp.c('org_b')));

select pg_temp.as_user(pg_temp.c('b_admin2'), 601);
select pg_temp.raises('just over 10 minutes since sign-in: sign in again',
  $$select public.close_my_account('gl11.b.admin2@example.com')$$, '42501', 'reauth_required');
select pg_temp.as_user(pg_temp.c('b_admin2'), null);
select pg_temp.raises('no amr claim: sign in again', $$select public.close_my_account('gl11.b.admin2@example.com')$$, '42501', 'reauth_required');
select pg_temp.as_owner();
delete from public.organisation_members where organisation_id = pg_temp.c('org_b') and profile_id = pg_temp.c('b_admin2');
select pg_temp.as_user(pg_temp.c('b_admin'));
select pg_temp.raises('the last admin can''t close', $$select public.close_my_account('gl11.b.admin@example.com')$$, '42501', 'last_admin');
select pg_temp.as_user(pg_temp.c('b_leaver'));
select pg_temp.raises('wrong email', $$select public.close_my_account('someone@example.com')$$, '22023', 'email_mismatch');
select pg_temp.as_user(pg_temp.c('b_leaver'), 900);
select pg_temp.raises('sign-in 15 minutes ago is too old', $$select public.close_my_account('gl11.b.leaver@example.com')$$, '42501', 'reauth_required');

-- Recent sign-in, both paths (private.signed_in_at): the amr timestamp when there is one, else
-- the creation time of the JWT's own session.
select pg_temp.as_owner();
insert into auth.sessions (id, user_id, created_at) values
  ('e1100000-0000-4000-8000-0000000000f1', pg_temp.c('b_leaver'), now() - interval '2 minutes'),
  ('e1100000-0000-4000-8000-0000000000f2', pg_temp.c('b_leaver'), now() - interval '20 minutes'),
  ('e1100000-0000-4000-8000-0000000000f3', pg_temp.c('b_admin'), now() - interval '1 minute');
select pg_temp.ok('amr timestamp used when present', pg_temp.signed_in(pg_temp.c('b_leaver'),
  jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1700000000)))) = to_timestamp(1700000000));
select pg_temp.ok('amr timestamp wins over the session', pg_temp.signed_in(pg_temp.c('b_leaver'),
  jsonb_build_object('session_id', 'e1100000-0000-4000-8000-0000000000f1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', 1700000000)))) = to_timestamp(1700000000));
select pg_temp.ok('no amr timestamp: the session''s creation time', pg_temp.signed_in(pg_temp.c('b_leaver'),
  jsonb_build_object('session_id', 'e1100000-0000-4000-8000-0000000000f1', 'amr', jsonb_build_array(jsonb_build_object('method', 'oauth'))))
  = (select created_at from auth.sessions where id = 'e1100000-0000-4000-8000-0000000000f1'));
select pg_temp.ok('no amr at all: the session''s creation time', pg_temp.signed_in(pg_temp.c('b_leaver'),
  jsonb_build_object('session_id', 'e1100000-0000-4000-8000-0000000000f2'))
  = (select created_at from auth.sessions where id = 'e1100000-0000-4000-8000-0000000000f2'));
select pg_temp.ok('another user''s session doesn''t count', pg_temp.signed_in(pg_temp.c('b_leaver'),
  jsonb_build_object('session_id', 'e1100000-0000-4000-8000-0000000000f3', 'amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))) is null);
select pg_temp.ok('no timestamp and no session: unknown', pg_temp.signed_in(pg_temp.c('b_leaver'),
  jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'oauth')))) is null);
select pg_temp.ok('a malformed session id: unknown', pg_temp.signed_in(pg_temp.c('b_leaver'),
  jsonb_build_object('session_id', 'not-a-uuid')) is null);
select pg_temp.ok('an unknown session: unknown', pg_temp.signed_in(pg_temp.c('b_leaver'),
  jsonb_build_object('session_id', gen_random_uuid())) is null);

select pg_temp.as_oauth(pg_temp.c('b_leaver'), 'e1100000-0000-4000-8000-0000000000f2');
select pg_temp.raises('Microsoft-style sign-in 20 minutes ago: sign in again',
  $$select public.close_my_account('gl11.b.leaver@example.com')$$, '42501', 'reauth_required');
select pg_temp.as_oauth(pg_temp.c('b_leaver'), 'e1100000-0000-4000-8000-0000000000f3');
select pg_temp.raises('someone else''s session: sign in again',
  $$select public.close_my_account('gl11.b.leaver@example.com')$$, '42501', 'reauth_required');
-- The leaver closes through the session path (no amr timestamp), with B read-only.
select pg_temp.as_oauth(pg_temp.c('b_leaver'), 'e1100000-0000-4000-8000-0000000000f1');
select pg_temp.ok('the leaver closes their account (session path, B read-only)',
  (public.close_my_account(' GL11.B.Leaver@example.com ') ->> 'email') = 'gl11.b.leaver@example.com');
-- The second admin (no memberships left) closes through the amr path.
select pg_temp.as_user(pg_temp.c('b_admin2'));
select pg_temp.ok('the second admin closes their account (amr path)',
  (public.close_my_account('gl11.b.admin2@example.com') ->> 'organisations')::int = 0);
select pg_temp.as_owner();

select pg_temp.ok('no markers left after closure', not exists (select 1 from private.privileged_ops));
select pg_temp.ok('memberships gone (both organisations)',
  not exists (select 1 from public.organisation_members where profile_id = pg_temp.c('b_leaver'))
  and not exists (select 1 from public.workspace_members where profile_id = pg_temp.c('b_leaver')));
select pg_temp.ok('profile is a tombstone', exists (select 1 from public.profiles where id = pg_temp.c('b_leaver')
  and display_name = 'Former member' and email = '' and closed_at is not null and last_organisation_id is null));
select pg_temp.ok('auto-created resource anonymised and unlinked', exists (select 1 from public.resources
  where id = pg_temp.c('leaver_res') and name = 'Former member' and email is null and profile_id is null and not is_active));
select pg_temp.ok('private dashboard deleted, shared kept',
  not exists (select 1 from public.dashboards where name = 'GL11 private')
  and exists (select 1 from public.dashboards where name = 'GL11 shared' and owner_id = pg_temp.c('b_leaver')));
select pg_temp.ok('invite to their address revoked and its email removed',
  not exists (select 1 from public.organisation_invites where email = 'gl11.b.leaver@example.com')
  and exists (select 1 from public.organisation_invites where email like 'removed-%@removed.invalid' and revoked_at is not null));
select pg_temp.ok('email scrubbed from audit history, other text kept',
  not exists (select 1 from public.audit_log where detail::text like '%gl11.b.leaver@example.com%')
  and exists (select 1 from public.audit_log where detail ->> 'email' = '[removed]' and detail ->> 'note' = 'keep me'));
select pg_temp.ok('no audit row carries the old name for the anonymised resource',
  not exists (select 1 from public.audit_log where entity_id = pg_temp.c('leaver_res') and detail::text like '%GL11 B Leaver%'));
select pg_temp.ok('one closure audit row per organisation left',
  (select count(*) from public.audit_log where action = 'member.removed' and detail ->> 'reason' = 'account_closed'
     and entity_id = pg_temp.c('b_leaver')) = 2);
select pg_temp.ok('closure logged; auth deletion pending',
  exists (select 1 from private.account_closure_log where profile_id = pg_temp.c('b_leaver'))
  and pg_temp.c('b_leaver') in (select public.account_closures_pending()));
select pg_temp.raises('a closed profile can''t rejoin',
  $$insert into public.organisation_members (organisation_id, profile_id, role) values (pg_temp.c('org_b'), pg_temp.c('b_leaver'), 'viewer')$$,
  '42501', 'account_closed');
delete from auth.users where id in (pg_temp.c('b_leaver'), pg_temp.c('b_admin2'));
select pg_temp.ok('auth users deleted (sessions with them), tombstone profiles stay',
  (select count(*) from public.profiles where id in (pg_temp.c('b_leaver'), pg_temp.c('b_admin2')) and closed_at is not null) = 2
  and not exists (select 1 from auth.sessions where user_id = pg_temp.c('b_leaver'))
  and not exists (select 1 from public.account_closures_pending()));
update public.organisation_subscriptions set trial_ends_at = now() + interval '14 days' where organisation_id = pg_temp.c('org_b');

-- =====================================================================================
-- 4. Requesting and cancelling deletion.
-- =====================================================================================
select pg_temp.as_user(pg_temp.c('a_member'));
select pg_temp.raises('a contributor can''t ask', $$select public.request_organisation_deletion(pg_temp.c('org_a'), 'GL11 Org A')$$, '42501');
select pg_temp.as_user(pg_temp.c('a_admin'));
select pg_temp.raises('wrong name', $$select public.request_organisation_deletion(pg_temp.c('org_a'), 'GL11 Org')$$, '22023', 'name_mismatch');
select pg_temp.as_owner();
update public.organisations set is_demo = true where id = pg_temp.c('org_a');
select pg_temp.as_user(pg_temp.c('a_admin'));
select pg_temp.raises('demo refused', $$select public.request_organisation_deletion(pg_temp.c('org_a'), 'GL11 Org A')$$, '42501', 'demo_org');
select pg_temp.as_owner();
update public.organisations set is_demo = false where id = pg_temp.c('org_a');
select pg_temp.as_user(pg_temp.c('a_admin'));
select pg_temp.ok('admin asks; purge in 30 days', (select r between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour'
  from (select public.request_organisation_deletion(pg_temp.c('org_a'), 'GL11 Org A') r offset 0) x));
select pg_temp.raises('pending: writes refused', $$update public.portfolios set name = name || '!' where organisation_id = pg_temp.c('org_a')$$,
  'P0001', 'org_read_only');
select pg_temp.raises('asking twice', $$select public.request_organisation_deletion(pg_temp.c('org_a'), 'GL11 Org A')$$, '23505', 'deletion_pending');
select pg_temp.as_user(pg_temp.c('a_member'));
select pg_temp.ok('a member reads the date', (select purge_after from public.organisation_deletions
  where organisation_id = pg_temp.c('org_a')) is not null);
select pg_temp.raises('a member can''t read the service columns',
  $$select last_error from public.organisation_deletions$$, '42501');
select pg_temp.raises('a member can''t cancel', $$select public.cancel_organisation_deletion(pg_temp.c('org_a'))$$, '42501');
select pg_temp.raises('a member can''t write the table directly',
  $$update public.organisation_deletions set cancelled_at = now()$$, '42501');
select pg_temp.as_user(pg_temp.c('a_admin'));
select public.cancel_organisation_deletion(pg_temp.c('org_a'));
update public.portfolios set name = name where organisation_id = pg_temp.c('org_a');
select pg_temp.ok('cancelled: writable again', public.organisation_writable(pg_temp.c('org_a')));
select pg_temp.raises('cancel twice', $$select public.cancel_organisation_deletion(pg_temp.c('org_a'))$$, 'P0002', 'no_deletion');
select pg_temp.ok('ask again after a cancel', public.request_organisation_deletion(pg_temp.c('org_a'), 'GL11 Org A') > now());

-- =====================================================================================
-- 5. The purge.
-- =====================================================================================
select pg_temp.as_owner();
insert into counts select 'a_before', pg_temp.org_rows(pg_temp.c('org_a'));
insert into counts select 'b_mid', pg_temp.org_rows(pg_temp.c('org_b'));
select pg_temp.ok('dry run counts every row and changes nothing',
  (public.purge_organisation(pg_temp.c('org_a')) ->> 'total')::bigint = (select n from counts where k = 'a_before')
  and pg_temp.org_rows(pg_temp.c('org_a')) = (select n from counts where k = 'a_before'));
select pg_temp.raises('not due yet', $$select public.purge_organisation(pg_temp.c('org_a'), false)$$, '55000', 'purge_not_ready');
update public.organisation_deletions set purge_after = now() - interval '1 minute', requested_at = now() - interval '30 days'
 where organisation_id = pg_temp.c('org_a');
update public.organisation_deletions set purge_started_at = now() where organisation_id = pg_temp.c('org_a');
select pg_temp.raises('due and claimed, but Stripe and Storage not done', $$select public.purge_organisation(pg_temp.c('org_a'), false)$$,
  '55000', 'purge_not_ready');
select pg_temp.as_user(pg_temp.c('a_admin'));
select pg_temp.raises('can''t cancel once the purge has started', $$select public.cancel_organisation_deletion(pg_temp.c('org_a'))$$,
  '55000', 'purge_started');
select pg_temp.as_owner();
update public.organisation_deletions set stripe_done_at = now(), storage_done_at = now(), storage_counts = '{"documents": 0}'
 where organisation_id = pg_temp.c('org_a');
select pg_temp.ok('purge runs', (public.purge_organisation(pg_temp.c('org_a'), false) ->> 'dry_run')::boolean = false);
select pg_temp.ok('nothing left anywhere for A', pg_temp.org_rows(pg_temp.c('org_a')) = 0
  and not exists (select 1 from public.organisations where id = pg_temp.c('org_a')));
select pg_temp.ok('B untouched by the purge', pg_temp.org_rows(pg_temp.c('org_b')) = (select n from counts where k = 'b_mid')
  and exists (select 1 from public.organisations where id = pg_temp.c('org_b')));
select pg_temp.ok('members of A keep their accounts', exists (select 1 from public.profiles
  where id = pg_temp.c('a_member') and closed_at is null and last_organisation_id is null));
select pg_temp.ok('purge logged with ids and counts only', exists (select 1 from private.organisation_purge_log
  where purged_organisation_id = pg_temp.c('org_a') and row_counts ? 'public.committee_packs'));
select pg_temp.ok('no markers left after the purge', not exists (select 1 from private.privileged_ops));
select pg_temp.raises('purging B without a request is refused', $$select public.purge_organisation(pg_temp.c('org_b'), false)$$,
  '55000', 'purge_not_ready');

select 'account_closure: ' || n || ' checks passed' from passed;
rollback;
