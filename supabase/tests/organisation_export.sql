-- GL-11b full organisation export tests (docs/sql/gl-11b-organisation-export.sql).
-- Needs only the migrations (no seed): creates two organisations with sample data, runs inside a
-- transaction and rolls everything back. Each check raises on failure; the last line prints the
-- count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/organisation_export.sql
\set ON_ERROR_STOP 1
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

insert into auth.users (id, email, email_confirmed_at) values
  ('e11b0000-0000-4000-8000-000000000001', 'gl11b.a.admin@example.com', now()),
  ('e11b0000-0000-4000-8000-000000000002', 'gl11b.a.member@example.com', now()),
  ('e11b0000-0000-4000-8000-000000000003', 'gl11b.b.admin@example.com', now());
insert into public.profiles (id, email, display_name) values
  ('e11b0000-0000-4000-8000-000000000001', 'gl11b.a.admin@example.com', 'GL11b A Admin'),
  ('e11b0000-0000-4000-8000-000000000002', 'gl11b.a.member@example.com', 'GL11b A Member'),
  ('e11b0000-0000-4000-8000-000000000003', 'gl11b.b.admin@example.com', 'GL11b B Admin')
on conflict (id) do nothing;
insert into ctx values
  ('a_admin', 'e11b0000-0000-4000-8000-000000000001'), ('a_member', 'e11b0000-0000-4000-8000-000000000002'),
  ('b_admin', 'e11b0000-0000-4000-8000-000000000003');

create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
create function pg_temp.as_role(r text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('role', r)::text, true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', r, true),
         set_config('role', r, true); $$;
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
grant execute on function pg_temp.c(text) to authenticated, service_role, anon;
grant execute on function pg_temp.ok(text, boolean) to authenticated, service_role, anon;
grant execute on function pg_temp.raises(text, text, text, text) to authenticated, service_role, anon;
grant all on passed to service_role, anon;
grant all on ctx to service_role, anon;

do $$
declare v_a uuid; v_b uuid;
begin
  perform pg_temp.as_user(pg_temp.c('a_admin'));
  v_a := public.create_organisation(p_name => 'GL11b Org A', p_sector => 'general');
  perform public.seed_sample_data(v_a);
  perform pg_temp.as_user(pg_temp.c('b_admin'));
  v_b := public.create_organisation(p_name => 'GL11b Org B', p_sector => 'general');
  perform public.seed_sample_data(v_b);
  perform pg_temp.as_owner();
  insert into ctx values ('org_a', v_a), ('org_b', v_b);
  insert into public.organisation_members (organisation_id, profile_id, role)
  values (v_a, pg_temp.c('a_member'), 'contributor');
  insert into public.organisation_invites (organisation_id, email, role, token_hash, expires_at, invited_by)
  values (v_a, 'gl11b.invitee@example.com', 'viewer', sha256('gl11b-secret'), now() + interval '7 days', pg_temp.c('a_admin'));
end $$;

-- =====================================================================================
-- 1. Coverage: every public table with organisation_id, plus organisations and profiles.
select pg_temp.ok('every public organisation table is exported',
  (select count(*) from private.organisation_export_tables())
  = (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped)) + 2);
select pg_temp.ok('private tables are not exported',
  not exists (select 1 from private.organisation_export_tables() t where t.table_name in ('health_refresh_queue', 'health_check_log')));
select pg_temp.ok('every exported table has a stable order (primary key)',
  not exists (select 1 from private.organisation_export_tables() t where t.order_by = array['ctid']));

-- 2. Rows: only the organisation's own, counts match the plan, pages join up, secrets left out.
do $$
declare t record; v_plan jsonb; v_rows jsonb; v_n bigint; v_page jsonb; v_all jsonb; v_off integer;
begin
  v_plan := public.organisation_export_plan(pg_temp.c('org_a'));
  perform pg_temp.ok('plan lists every table', jsonb_array_length(v_plan -> 'tables') = (select count(*) from private.organisation_export_tables()));
  perform pg_temp.ok('plan has rows for A', (select sum((x ->> 'rows')::bigint) from jsonb_array_elements(v_plan -> 'tables') x) > 50);
  for t in select x ->> 'table' as name, (x ->> 'rows')::bigint as n from jsonb_array_elements(v_plan -> 'tables') x loop
    v_rows := public.organisation_export_rows(pg_temp.c('org_a'), t.name, 0, 5000);
    if jsonb_array_length(v_rows) <> t.n then
      raise exception 'FAIL: % exported % rows, plan says %', t.name, jsonb_array_length(v_rows), t.n;
    end if;
    if t.name not in ('organisations', 'profiles') and exists (
         select 1 from jsonb_array_elements(v_rows) r where r ->> 'organisation_id' is distinct from pg_temp.c('org_a')::text) then
      raise exception 'FAIL: % exported another organisation''s row', t.name;
    end if;
  end loop;
  perform pg_temp.ok('every table: rows match the plan and belong to A', true);

  -- B's rows never appear in A's export.
  select count(*) into v_n from jsonb_array_elements(public.organisation_export_rows(pg_temp.c('org_a'), 'projects', 0, 5000)) r
   where (r ->> 'id')::uuid in (select id from public.projects where organisation_id = pg_temp.c('org_b'));
  perform pg_temp.ok('no B project in A''s export', v_n = 0);

  -- Pages of 2 join up to the whole table with no duplicates.
  v_all := '[]'; v_off := 0;
  loop
    v_page := public.organisation_export_rows(pg_temp.c('org_a'), 'work_items', v_off, 2);
    exit when jsonb_array_length(v_page) = 0;
    v_all := v_all || v_page; v_off := v_off + 2;
  end loop;
  perform pg_temp.ok('paged work_items = whole table',
    jsonb_array_length(v_all) = (select count(*) from public.work_items where organisation_id = pg_temp.c('org_a'))
    and (select count(distinct r ->> 'id') from jsonb_array_elements(v_all) r) = jsonb_array_length(v_all)
    and jsonb_array_length(v_all) > 2);

  v_rows := public.organisation_export_rows(pg_temp.c('org_a'), 'organisation_invites', 0, 100);
  perform pg_temp.ok('invite exported without token_hash',
    jsonb_array_length(v_rows) = 1 and not (v_rows -> 0 ? 'token_hash') and v_rows -> 0 ->> 'email' = 'gl11b.invitee@example.com');
  v_rows := public.organisation_export_rows(pg_temp.c('org_a'), 'profiles', 0, 100);
  perform pg_temp.ok('profiles: A''s two members, with emails, not B''s admin',
    jsonb_array_length(v_rows) = 2
    and exists (select 1 from jsonb_array_elements(v_rows) r where r ->> 'email' = 'gl11b.a.member@example.com')
    and not exists (select 1 from jsonb_array_elements(v_rows) r where r ->> 'email' = 'gl11b.b.admin@example.com'));
  v_rows := public.organisation_export_rows(pg_temp.c('org_a'), 'organisations', 0, 100);
  perform pg_temp.ok('organisations: A''s row only', jsonb_array_length(v_rows) = 1 and v_rows -> 0 ->> 'id' = pg_temp.c('org_a')::text);
end $$;

select pg_temp.raises('a table outside the list is refused',
  format('select public.organisation_export_rows(%L, %L)', pg_temp.c('org_a'), 'stripe_webhook_events'), '22023', 'not_exported');
select pg_temp.raises('an injected table name is refused',
  format('select public.organisation_export_rows(%L, %L)', pg_temp.c('org_a'), 'projects x; select 1 --'), '22023', 'not_exported');
select pg_temp.raises('a page over 5,000 is refused',
  format('select public.organisation_export_rows(%L, %L, 0, 5001)', pg_temp.c('org_a'), 'projects'), '22023', 'bad_page');
select pg_temp.raises('plan for an unknown organisation',
  'select public.organisation_export_plan(gen_random_uuid())', 'P0002', 'no_organisation');

-- 3. Who can run what.
select pg_temp.ok('authenticated can''t read the plan or rows',
  not has_function_privilege('authenticated', 'public.organisation_export_plan(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.organisation_export_rows(uuid, text, integer, integer)', 'execute'));
select pg_temp.ok('anon can''t run any export function',
  not has_function_privilege('anon', 'public.organisation_export_plan(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.organisation_export_rows(uuid, text, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.start_organisation_export(uuid)', 'execute'));
select pg_temp.ok('service role reads the plan and rows; private helpers closed to everyone else',
  has_function_privilege('service_role', 'public.organisation_export_plan(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.organisation_export_rows(uuid, text, integer, integer)', 'execute')
  and not has_function_privilege('service_role', 'private.organisation_export_tables()', 'execute')
  and not has_function_privilege('authenticated', 'private.organisation_export_tables()', 'execute')
  and not has_function_privilege('authenticated', 'private.organisation_export_filter(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.run_export_cleanup()', 'execute'));
select pg_temp.ok('the exports bucket is private', (select not public from storage.buckets where id = 'exports'));
select pg_temp.ok('no storage policy names the exports bucket',
  not exists (select 1 from pg_policy where polrelid = 'storage.objects'::regclass
              and (coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '')) like '%exports%'));

-- start_organisation_export: admins of the organisation only.
select pg_temp.as_user(pg_temp.c('a_member'));
select pg_temp.raises('a contributor can''t start an export',
  format('select public.start_organisation_export(%L)', pg_temp.c('org_a')), '42501', 'not_admin');
select pg_temp.as_user(pg_temp.c('b_admin'));
select pg_temp.raises('another organisation''s admin can''t start an export',
  format('select public.start_organisation_export(%L)', pg_temp.c('org_a')), '42501', 'not_admin');
select pg_temp.as_role('service_role');
select pg_temp.raises('no signed-in user: refused',
  format('select public.start_organisation_export(%L)', pg_temp.c('org_a')), '42501', 'not_admin');
select pg_temp.as_owner();

-- Read-only (trial ended) and pending deletion: the admin can still export.
update public.organisation_subscriptions set plan = 'trial', status = null, trial_ends_at = now() - interval '1 day'
 where organisation_id = pg_temp.c('org_a');
select pg_temp.ok('setup: A is read-only', private.organisation_is_writable(pg_temp.c('org_a')) = false);
select pg_temp.as_user(pg_temp.c('a_admin'));
select pg_temp.ok('the admin starts an export while read-only', public.start_organisation_export(pg_temp.c('org_a')) is not null);
select pg_temp.raises('a second export within two minutes is refused',
  format('select public.start_organisation_export(%L)', pg_temp.c('org_a')), 'P0001', 'rate_limited');
select pg_temp.as_owner();
select pg_temp.ok('the export is audited',
  (select count(*) from public.audit_log where organisation_id = pg_temp.c('org_a') and action = 'update'
     and entity_table = 'organisations' and detail ->> 'event' = 'organisation.exported'
     and actor_id = pg_temp.c('a_admin') and entity_id = pg_temp.c('org_a')) = 1);
update public.audit_log set created_at = now() - interval '3 minutes'
 where organisation_id = pg_temp.c('org_a') and detail ->> 'event' = 'organisation.exported';
select pg_temp.as_user(pg_temp.c('a_admin'));
select public.request_organisation_deletion(pg_temp.c('org_a'), 'GL11b Org A');
select pg_temp.ok('the admin starts an export while deletion is pending', public.start_organisation_export(pg_temp.c('org_a')) is not null);
select pg_temp.as_owner();

-- The cleanup job is a no-op where pg_net / Vault are missing (local).
select pg_temp.ok('run_export_cleanup without pg_net returns null',
  to_regnamespace('net') is not null or private.run_export_cleanup() is null);

select 'organisation_export: ' || n || ' checks passed' from passed;
rollback;
