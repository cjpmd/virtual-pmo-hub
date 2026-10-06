-- RLS matrix: what each kind of user can read and write, table by table. Run it before and
-- after a policy change and diff the output; any difference is a change in who can do what.
-- Everything runs in one transaction that is rolled back.
--   psql "$DB_URL" -At -f supabase/tests/rls_matrix.sql > before.txt   (then after.txt, diff)
--
-- Users (throwaway, created here) in the demo organisation's workspace:
--   org_viewer      organisation viewer, no workspace membership
--   ws_viewer       organisation viewer, workspace viewer
--   ws_contributor  organisation viewer, workspace contributor
--   ws_manager      organisation viewer, workspace manager
--   org_pmo         organisation PMO (acts in every workspace)
--   org_admin       organisation admin
--   outsider        admin of a different organisation
-- For every public table with RLS, each user gets: visible rows; rows an UPDATE touches;
-- rows a DELETE removes; and whether copying an existing row back in passes RLS
-- (23505 unique violation = passed RLS, 42501 = refused by RLS). Each write is undone.
begin;

create temp table rls_users (label text primary key, id uuid not null);
create temp table rls_samples (table_name text primary key, row_json jsonb);
create temp table rls_result (label text, table_name text, op text, outcome text);
grant select on rls_users, rls_samples to authenticated;
grant insert on rls_result to authenticated;

do $$
declare
  demo_org uuid := (select id from public.organisations where slug = 'demo-university');
  ws uuid := (select id from public.workspaces where organisation_id = demo_org order by created_at limit 1);
  other_org uuid;
  u record;
  t record;
begin
  if demo_org is null then raise exception 'Seed the demo organisation first'; end if;
  insert into public.organisations (name, slug) values ('RLS Matrix Other', 'rls-matrix-' || substr(md5(random()::text), 1, 8))
  returning id into other_org;

  insert into rls_users values
    ('org_viewer', gen_random_uuid()), ('ws_viewer', gen_random_uuid()), ('ws_contributor', gen_random_uuid()),
    ('ws_manager', gen_random_uuid()), ('org_pmo', gen_random_uuid()), ('org_admin', gen_random_uuid()),
    ('outsider', gen_random_uuid());
  for u in select * from rls_users loop
    insert into auth.users (id, email, raw_user_meta_data)
    values (u.id, 'rls-' || u.label || '-' || u.id || '@example.invalid', json_build_object('full_name', 'RLS ' || u.label));
  end loop;
  insert into public.organisation_members (organisation_id, profile_id, role)
  select demo_org, id, case label when 'org_pmo' then 'pmo' when 'org_admin' then 'admin' else 'viewer' end::public.app_role
  from rls_users where label <> 'outsider';
  insert into public.organisation_members (organisation_id, profile_id, role)
  select other_org, id, 'admin' from rls_users where label = 'outsider';
  insert into public.workspace_members (workspace_id, profile_id, organisation_id, role)
  select ws, id, demo_org, case label when 'ws_viewer' then 'viewer' when 'ws_contributor' then 'contributor' else 'manager' end::public.app_role
  from rls_users where label in ('ws_viewer', 'ws_contributor', 'ws_manager');
  -- Joining an organisation creates the member's own resource, so "own resource" rules apply.

  -- One sample row per table (from the demo organisation where the table has one).
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format(
      'insert into rls_samples select %L, to_jsonb(x) from public.%I x %s limit 1', t.relname, t.relname,
      case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.relname and column_name = 'organisation_id')
           then format('where organisation_id = %L', demo_org) else '' end);
  end loop;
end $$;

-- The checks, run once per user under the authenticated role.
create function pg_temp.rls_check(p_label text) returns void language plpgsql as $f$
declare
  t record;
  n bigint;
  outcome text;
  cols text;
  set_col text;
  sample jsonb;
  uid uuid := (select id from rls_users where label = p_label);
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity order by 1
  loop
    -- Read
    begin
      execute format('select count(*) from public.%I', t.relname) into n;
      outcome := n::text;
    exception when others then outcome := 'err ' || sqlstate;
    end;
    insert into rls_result values (p_label, t.relname, 'select', outcome);

    -- Update: set a column to itself (fires triggers, changes nothing), then undo.
    select a.attname into set_col from pg_attribute a
    where a.attrelid = ('public.' || quote_ident(t.relname))::regclass and a.attnum > 0 and not a.attisdropped
      and a.attgenerated = '' order by (a.attname = 'updated_at') desc, a.attnum limit 1;
    begin
      execute format('with w as (update public.%I set %I = %I returning 1) select count(*) from w', t.relname, set_col, set_col) into n;
      raise exception using errcode = 'P0099', message = n::text;
    exception
      when sqlstate 'P0099' then outcome := sqlerrm;
      when others then outcome := 'err ' || sqlstate;
    end;
    insert into rls_result values (p_label, t.relname, 'update', outcome);

    -- Delete, then undo.
    begin
      execute format('with w as (delete from public.%I returning 1) select count(*) from w', t.relname) into n;
      raise exception using errcode = 'P0099', message = n::text;
    exception
      when sqlstate 'P0099' then outcome := sqlerrm;
      when others then outcome := 'err ' || sqlstate;
    end;
    insert into rls_result values (p_label, t.relname, 'delete', outcome);

    -- Insert a copy of an existing row: 23505 means RLS let it through, 42501 means refused.
    select row_json into sample from rls_samples where table_name = t.relname;
    if sample is null then
      outcome := 'no sample';
    else
      select string_agg(quote_ident(a.attname), ', ') into cols from pg_attribute a
      where a.attrelid = ('public.' || quote_ident(t.relname))::regclass and a.attnum > 0 and not a.attisdropped
        and a.attgenerated = '' and a.attidentity = '';
      begin
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                       t.relname, cols, cols, t.relname) using sample;
        raise exception using errcode = 'P0099', message = 'inserted';
      exception
        when sqlstate 'P0099' then outcome := sqlerrm;
        when others then outcome := 'err ' || sqlstate;
      end;
    end if;
    insert into rls_result values (p_label, t.relname, 'insert', outcome);
  end loop;
  reset role;
end;
$f$;

select pg_temp.rls_check(label) from rls_users order by label;

select label || ' ' || table_name || ' ' || op || ' ' || outcome from rls_result order by table_name, op, label;

rollback;
