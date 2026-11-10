-- GL-10 cross-tenant suite: organisation A's data can't be read or written by organisation B's
-- users, and the other way round. Runs against a seeded database (the local Postgres:
-- supabase/tests/local/run.sh migrate && run.sh seed && run.sh cross) inside one transaction that
-- is rolled back. Never run it on production.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/cross_tenant.sql
--
-- Organisation A is the seeded organisation with the most projects; B is created here through
-- create_organisation and seed_sample_data. Each has an admin, a contributor and a viewer.
-- Every table, view and function is listed from the catalogue, so new ones are covered:
--   1. Coverage: a generic filler (plus a few hand-written rows) gives both organisations at
--      least one row in every RLS table with organisation_id; the suite fails if one stays empty.
--   2. Tables and views: B's users (and anon) see none of A's rows, update and delete none, and
--      can't insert a copy of one; A's users likewise against B.
--   3. Functions: one case per public function signed-in users can run (a case is missing →
--      failure), called as B's admin with A's ids. It must fail or return nothing, leave A's
--      data unchanged and give B no membership in A.
--   4. Storage objects and report print tokens.
-- Both organisations are made writable first (active subscription, trial end in the future) and
-- checked with private.organisation_is_writable, so GL-4's read-only trigger can't produce a
-- false pass; a refusal with hint org_read_only anywhere fails the run as a setup error.
-- Output: one line per finding (LEAK, REVIEW or SETUP), then a summary; any finding fails.
\set ON_ERROR_STOP 1
begin;

-- ---------------------------------------------------------------------------------------------
-- Setup
-- ---------------------------------------------------------------------------------------------
create temp table ct_users (label text primary key, org text not null, id uuid not null, org_role public.app_role not null);
insert into ct_users values
  ('a_admin',       'A', 'c1000000-0000-4000-8000-0000000000a1', 'admin'),
  ('a_contributor', 'A', 'c1000000-0000-4000-8000-0000000000a2', 'contributor'),
  ('a_viewer',      'A', 'c1000000-0000-4000-8000-0000000000a3', 'viewer'),
  ('b_admin',       'B', 'c1000000-0000-4000-8000-0000000000b1', 'admin'),
  ('b_contributor', 'B', 'c1000000-0000-4000-8000-0000000000b2', 'contributor'),
  ('b_viewer',      'B', 'c1000000-0000-4000-8000-0000000000b3', 'viewer');
create temp table ct_orgs (label text primary key, id uuid, ws uuid);
-- Placeholders for the function cases ({a_org}, {a_project}, ...), filled in after the fixture.
create temp table ct_ctx (key text primary key, value text);
create temp table ct_result (actor text, target text, object text, op text, outcome text, verdict text);
create temp table ct_samples (org text, rel text, row_json jsonb, primary key (org, rel));
create temp table ct_xid_probe (n int);  -- see the blind update check
grant select on ct_users, ct_orgs, ct_ctx, ct_samples to authenticated, anon;
grant insert on ct_result, ct_orgs, ct_xid_probe to authenticated, anon;
grant select on ct_xid_probe to authenticated, anon;  -- insert ... returning xmin

insert into ct_orgs (label, id)
select 'A', p.organisation_id from public.projects p group by 1, p.organisation_id order by count(*) desc limit 1;
do $$ begin
  if (select id from ct_orgs where label = 'A') is null then raise exception 'Seed the database first'; end if;
end $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select id, 'gl10-' || replace(label, '_', '-') || '@example.invalid', now(), json_build_object('full_name', 'GL10 ' || label)
from ct_users;
insert into public.profiles (id, email, display_name)
select id, 'gl10-' || replace(label, '_', '-') || '@example.invalid', 'GL10 ' || label from ct_users
on conflict (id) do nothing;

-- Session helpers. ct_as signs in as a fixture user (or anon); ct_as_postgres is the owner,
-- with the organisation's admin as auth.uid() so triggers that stamp the user still work.
create function pg_temp.ct_as(p_label text) returns void language plpgsql as $$
begin
  if p_label = 'anon' then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true),
            set_config('request.jwt.claim.sub', '', true),
            set_config('request.jwt.claim.role', 'anon', true),
            set_config('role', 'anon', true);
  else
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true),
            set_config('request.jwt.claim.sub', u.id::text, true),
            set_config('request.jwt.claim.role', 'authenticated', true),
            set_config('role', 'authenticated', true)
    from ct_users u where u.label = p_label;
  end if;
end $$;
create function pg_temp.ct_as_postgres(p_sub uuid default null) returns void language sql as $$
  select set_config('role', 'postgres', true),
         set_config('request.jwt.claims', case when p_sub is null then '' else json_build_object('sub', p_sub, 'role', 'authenticated')::text end, true),
         set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true),
         set_config('request.jwt.claim.role', '', true); $$;
create function pg_temp.ct_org(p_label text) returns uuid language sql stable as $$
  select id from ct_orgs where label = p_label $$;

-- Organisation A: not a demo, with the three fixture users.
update public.organisations set is_demo = false where id = pg_temp.ct_org('A');
update ct_orgs set ws = (select w.id from public.workspaces w where w.organisation_id = pg_temp.ct_org('A')
                         and w.archived_at is null order by w.created_at limit 1) where label = 'A';
insert into public.organisation_members (organisation_id, profile_id, role)
select pg_temp.ct_org('A'), id, org_role from ct_users where org = 'A';
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role)
select w.id, w.organisation_id, u.id, u.org_role from public.workspaces w, ct_users u
where w.organisation_id = pg_temp.ct_org('A') and u.org = 'A'
on conflict do nothing;

-- Organisation B: created by its admin, like a real sign-up.
select pg_temp.ct_as('b_admin');
insert into ct_orgs (label, id) select 'B', public.create_organisation(p_name => 'GL10 Organisation B', p_sector => 'general');
select pg_temp.ct_as_postgres();
update public.organisations set is_demo = false where id = pg_temp.ct_org('B');
update ct_orgs set ws = (select w.id from public.workspaces w where w.organisation_id = pg_temp.ct_org('B') order by w.created_at limit 1) where label = 'B';
insert into public.organisation_members (organisation_id, profile_id, role)
select pg_temp.ct_org('B'), id, org_role from ct_users where org = 'B' and label <> 'b_admin';
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role)
select o.ws, o.id, u.id, u.org_role from ct_orgs o, ct_users u where o.label = 'B' and u.org = 'B' and u.label <> 'b_admin';

-- Both organisations writable: an active subscription and a trial end in the future.
insert into public.organisation_subscriptions (organisation_id, plan, status, trial_ends_at, current_period_end)
select id, 'standard', 'active', now() + interval '30 days', now() + interval '30 days' from ct_orgs
on conflict (organisation_id) do update set plan = 'standard', status = 'active', trial_ends_at = excluded.trial_ends_at,
  current_period_end = excluded.current_period_end, cancel_at_period_end = false;
do $$ declare o record; begin
  for o in select * from ct_orgs loop
    if private.organisation_is_writable(o.id) is not true then
      raise exception 'SETUP: organisation % is not writable, so read-only refusals would hide RLS', o.label;
    end if;
  end loop;
end $$;

-- B's sample data, seeded by its admin.
select pg_temp.ct_as('b_admin');
select public.seed_sample_data(pg_temp.ct_org('B')) is not null as b_sample_seeded;
select pg_temp.ct_as_postgres();

-- ---------------------------------------------------------------------------------------------
-- 1. Coverage: at least one row of each organisation in every RLS table with organisation_id
-- ---------------------------------------------------------------------------------------------
-- The generic filler. For each RLS table where the organisation has no row, it builds one:
-- organisation_id is the organisation's, every foreign key it needs points at one of the
-- organisation's existing rows (composite keys first, so workspace and project stay consistent;
-- generated list columns such as type_list are matched), and other required columns get a value
-- from a CHECK constraint (col = ANY (ARRAY[...])), the enum's first label, or a plain default
-- for the type. It runs in passes until nothing more fills, so parents come before children.
-- Runs as the owner (RLS off) with the organisation's admin as auth.uid(); triggers still fire.
create temp table ct_fill_errors (org uuid, rel text, error text, primary key (org, rel));
create function pg_temp.ct_value_for(p_rel regclass, p_att int2, p_attempt int) returns text
language plpgsql as $$
declare
  v_name text; v_type oid; v_typname text; v_def text; v_m text[];
begin
  select a.attname, a.atttypid, format_type(a.atttypid, a.atttypmod) into v_name, v_type, v_typname
  from pg_attribute a where a.attrelid = p_rel and a.attnum = p_att;
  if v_typname in ('jsonb', 'json') then
    if exists (select 1 from pg_constraint c where c.conrelid = p_rel and c.contype = 'c' and p_att = any (c.conkey)
               and pg_get_constraintdef(c.oid) like '%''array''%') then return '''[]''::' || v_typname; end if;
    return '''{}''::' || v_typname;
  end if;
  if v_typname in ('text', 'citext', 'extensions.citext') and v_name like '%email%' then return quote_literal('gl10-' || p_attempt || '@example.com'); end if;
  if v_typname in ('text', 'citext', 'extensions.citext') and (v_name like '%domain%' or v_name = 'value') then return quote_literal('gl10-' || p_attempt || '.example.com'); end if;
  if v_typname not in ('jsonb', 'uuid') and v_name like '%currency%' then return '''EUR'''; end if;
  -- A value from a check constraint on this column: col = ANY (ARRAY['a'::text, ...]) or col = 'a'.
  for v_def in select pg_get_constraintdef(c.oid) from pg_constraint c
               where c.conrelid = p_rel and c.contype = 'c' and p_att = any (c.conkey) loop
    v_m := regexp_match(v_def, '\m' || v_name || '\M\)?(?:::text)? = ANY \(\(?ARRAY\[''([^'']*)''');
    if v_m is not null then return quote_literal(v_m[1]) || '::' || v_typname; end if;
    v_m := regexp_match(v_def, '\m' || v_name || '\M\)?(?:::text)? = ''([^'']*)''');
    if v_m is not null then return quote_literal(v_m[1]) || '::' || v_typname; end if;
  end loop;
  if exists (select 1 from pg_type t where t.oid = v_type and t.typtype = 'e') then
    return quote_literal((select e.enumlabel from pg_enum e where e.enumtypid = v_type order by e.enumsortorder limit 1)) || '::' || v_typname;
  end if;
  if v_typname like '%[]' then return '''{}''::' || v_typname; end if;
  return case
    when v_typname = 'uuid' then 'gen_random_uuid()'
    when v_typname in ('text', 'citext', 'extensions.citext') or v_typname like 'character%' then quote_literal('GL10 ' || v_name || ' ' || p_attempt)
    when v_typname in ('integer', 'smallint', 'bigint') or v_typname like 'numeric%' or v_typname in ('real', 'double precision') then '1'
    when v_typname = 'boolean' then 'false'
    when v_typname = 'date' then 'date_trunc(''month'', current_date)::date'
    when v_typname like 'timestamp%' then 'now()'
    when v_typname in ('jsonb', 'json') then '''{}''::' || v_typname
    when v_typname = 'interval' then '''1 day''::interval'
    when v_typname = 'bytea' then 'extensions.digest(gen_random_uuid()::text, ''sha256'')'
    when v_typname = 'inet' then '''127.0.0.1''::inet'
    else null end;
end $$;

-- Returns null on success, else the error.
create function pg_temp.ct_fill_one(p_org uuid, p_rel regclass, p_attempt int) returns text
language plpgsql as $$
declare
  v_vals jsonb := '{}';   -- column name -> SQL expression
  fk record; v_where text; v_sel text; v_row jsonb; i int; v_col text; v_refcol text;
  a record; v_cols text; v_exprs text; v_ref_has_org boolean;
begin
  v_vals := jsonb_build_object('organisation_id', quote_literal(p_org) || '::uuid');
  -- Foreign keys: composite ones first, so organisation_id / workspace_id stay consistent.
  for fk in
    select c.conkey, c.confkey, c.confrelid::regclass as ref, c.confrelid
    from pg_constraint c where c.conrelid = p_rel and c.contype = 'f' and c.confrelid <> p_rel
    order by array_length(c.conkey, 1) desc, c.conname
  loop
    -- Fill only when a column is required, or the FK is a tenant column.
    if p_attempt < 3 and not exists (select 1 from pg_attribute pa where pa.attrelid = p_rel and pa.attnum = any (fk.conkey)
                   and ((pa.attnotnull and not pa.atthasdef) or pa.attname in ('workspace_id')))
       and not (array_length(fk.conkey, 1) > 1 and exists (select 1 from pg_attribute pa where pa.attrelid = p_rel and pa.attnum = any (fk.conkey) and pa.attnotnull and not pa.atthasdef and pa.attname <> 'organisation_id')) then
      continue;
    end if;
    v_ref_has_org := exists (select 1 from pg_attribute pa where pa.attrelid = fk.confrelid and pa.attname = 'organisation_id' and not pa.attisdropped);
    v_where := 'true';
    if v_ref_has_org then v_where := format('r.organisation_id = %L', p_org); end if;
    if fk.ref = 'public.organisations'::regclass then v_where := format('r.id = %L', p_org); end if;
    if fk.ref in ('public.profiles'::regclass, 'auth.users'::regclass) then
      v_where := format('r.id in (select m.profile_id from public.organisation_members m where m.organisation_id = %L)', p_org);
    end if;
    v_sel := '';
    for i in 1 .. array_length(fk.conkey, 1) loop
      v_col := (select attname from pg_attribute where attrelid = p_rel and attnum = fk.conkey[i]);
      v_refcol := (select attname from pg_attribute where attrelid = fk.confrelid and attnum = fk.confkey[i]);
      v_sel := v_sel || format('%s%L, r.%I', case when i > 1 then ', ' else '' end, v_col, v_refcol);
      if (select attgenerated from pg_attribute where attrelid = p_rel and attname = v_col) <> '' then
        v_where := v_where || format(' and r.%I = (%s)', v_refcol,
          (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d where d.adrelid = p_rel and d.adnum = fk.conkey[i]));
      end if;
      if v_vals ? v_col and v_col <> 'organisation_id' then
        v_where := v_where || format(' and r.%I = %s', v_refcol, v_vals ->> v_col);
      end if;
    end loop;
    execute format('select jsonb_build_object(%s) from %s r where %s order by r.ctid offset %s limit 1',
                   v_sel, fk.ref, v_where, p_attempt % 3) into v_row;
    if v_row is null then
      execute format('select jsonb_build_object(%s) from %s r where %s order by r.ctid limit 1', v_sel, fk.ref, v_where) into v_row;
    end if;
    if v_row is null then return 'no parent in ' || fk.ref::text; end if;
    for v_col in select jsonb_object_keys(v_row) loop
      if (not (v_vals ? v_col) or v_col = 'organisation_id')
         and (select attgenerated from pg_attribute where attrelid = p_rel and attname = v_col) = '' then
        v_vals := v_vals || jsonb_build_object(v_col, quote_nullable(v_row ->> v_col) || '::' ||
          (select format_type(atttypid, atttypmod) from pg_attribute where attrelid = p_rel and attname = v_col));
      end if;
    end loop;
  end loop;
  -- Remaining required columns.
  for a in select attname, attnum from pg_attribute where attrelid = p_rel and attnum > 0 and not attisdropped
           and attnotnull and not atthasdef and attgenerated = '' and attidentity = '' loop
    if not (v_vals ? a.attname) then
      v_vals := v_vals || jsonb_build_object(a.attname, pg_temp.ct_value_for(p_rel, a.attnum, p_attempt));
      if v_vals ->> a.attname is null then return 'no value for ' || a.attname; end if;
    end if;
  end loop;
  select string_agg(quote_ident(k), ', '), string_agg(v, ', ') into v_cols, v_exprs from jsonb_each_text(v_vals) e(k, v);
  begin
    execute format('insert into %s (%s) values (%s)', p_rel, v_cols, v_exprs);
  exception when others then return sqlstate || ' ' || sqlerrm;
  end;
  return null;
end $$;

create function pg_temp.ct_has_rows(p_org uuid, p_rel regclass) returns boolean language plpgsql as $$
declare b boolean;
begin
  execute format('select exists (select 1 from %s where organisation_id = %L)', p_rel, p_org) into b;
  return b;
end $$;

-- Passes until nothing more fills. Returns the tables still empty with their last error.
create function pg_temp.ct_fill(p_org uuid) returns table (table_name text, error text)
language plpgsql as $$
declare t record; progress boolean := true; pass int := 0; err text; k int;
begin
  while progress and pass < 12 loop
    progress := false; pass := pass + 1;
    for t in select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
               and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped)
             order by c.relname loop
      continue when pg_temp.ct_has_rows(p_org, t.rel);
      for k in 0 .. 5 loop
        err := pg_temp.ct_fill_one(p_org, t.rel, k);
        exit when err is null;
      end loop;
      if err is null then progress := true; delete from ct_fill_errors e where e.org = p_org and e.rel = t.rel::text;
      else insert into ct_fill_errors values (p_org, t.rel::text, err) on conflict (org, rel) do update set error = excluded.error;
      end if;
    end loop;
  end loop;
  return query select e.rel, e.error from ct_fill_errors e where e.org = p_org and not pg_temp.ct_has_rows(p_org, e.rel::regclass) order by 1;
end $$;

-- Rows the generic filler can't build (check constraints, cross-row rules). %1$L is the
-- organisation. Each runs only when its table is still empty for the organisation.
create function pg_temp.ct_fill_hand(p_org uuid) returns void language plpgsql as $$
declare r record;
begin
  for r in select * from (values
    ('assumptions', $s$insert into public.assumptions (organisation_id, workspace_id, project_id, assumption, ref)
       select organisation_id, workspace_id, id, 'GL10 assumption', 'GL10-A1' from public.projects where organisation_id = %1$L order by created_at limit 1$s$),
    ('business_cases', $s$insert into public.business_cases (organisation_id, workspace_id, project_id, title)
       select organisation_id, workspace_id, id, 'GL10 business case' from public.projects p where organisation_id = %1$L
       and not exists (select 1 from public.business_cases b where b.project_id = p.id) order by created_at limit 1$s$),
    ('dependency_map_layouts', $s$insert into public.dependency_map_layouts (organisation_id, positions) values (%1$L, '{}')$s$),
    ('outcome_indicators', $s$insert into public.outcome_indicators (organisation_id, workspace_id, outcome_id, name, baseline_value, baseline_date, target_value, target_date)
       select organisation_id, workspace_id, id, 'GL10 indicator', 0, current_date, 10, current_date + 365 from public.outcomes where organisation_id = %1$L limit 1$s$),
    ('rating_schemes', $s$insert into public.rating_schemes (organisation_id, key, name, levels)
       values (%1$L, 'gl10_scale', 'GL10 scale', '[{"key":"g","label":"Green"},{"key":"r","label":"Red"}]')$s$),
    ('risk_matrices', $s$insert into public.risk_matrices (organisation_id, key, name, likelihood_levels, consequence_levels, bands)
       values (%1$L, 'gl10_matrix', 'GL10 matrix', '[1,2,3]', '[1,2,3]', '[{"key":"low","min":1,"max":9}]')$s$),
    ('record_links', $s$insert into public.record_links (organisation_id, workspace_id, from_type, from_id, to_type, to_id, link_type)
       select a.organisation_id, a.workspace_id, 'project', a.id, 'project', b.id, 'related' from public.projects a
       join public.projects b on b.workspace_id = a.workspace_id and b.id <> a.id where a.organisation_id = %1$L limit 1$s$),
    ('saved_views', $s$insert into public.saved_views (organisation_id, board_key, owner_id, name, config)
       select %1$L, 'gl10', profile_id, 'GL10 view', '{}' from public.organisation_members where organisation_id = %1$L and role = 'admin' limit 1$s$),
    ('user_favourites', $s$insert into public.user_favourites (organisation_id, profile_id, project_id)
       select %1$L, m.profile_id, p.id from public.organisation_members m, public.projects p
       where m.organisation_id = %1$L and m.role = 'admin' and p.organisation_id = %1$L limit 1$s$),
    ('work_item_links', $s$insert into public.work_item_links (organisation_id, workspace_id, project_id, predecessor_id, successor_id)
       select a.organisation_id, a.workspace_id, a.project_id, a.id, b.id from public.work_items a
       join public.work_items b on b.project_id = a.project_id and b.id <> a.id where a.organisation_id = %1$L limit 1$s$),
    ('status_report_decisions', $s$insert into public.status_report_decisions (organisation_id, workspace_id, project_id, status_report_id, decision_id)
       select sr.organisation_id, sr.workspace_id, sr.project_id, sr.id, d.id from public.status_reports sr
       join public.decisions d on d.project_id = sr.project_id where sr.organisation_id = %1$L limit 1$s$),
    ('documents', $s$insert into public.documents (organisation_id, workspace_id, scope, project_id, file_name, mime_type, size_bytes, storage_path)
       select organisation_id, workspace_id, 'project', id, 'gl10.pdf', 'application/pdf', 1, organisation_id || '/' || workspace_id || '/projects/' || id || '/gl10.pdf'
       from public.projects where organisation_id = %1$L order by created_at limit 1$s$),
    ('roadmap_items', $s$insert into public.roadmap_items (organisation_id, workspace_id, roadmap_id, row_id, title)
       select r.organisation_id, r.workspace_id, r.roadmap_id, r.id, 'GL10 item' from public.roadmap_rows r where r.organisation_id = %1$L limit 1$s$),
    ('resource_skills', $s$with s as (
         insert into public.lookup_values (organisation_id, list_key, value, label) values (%1$L, 'skill', 'gl10', 'GL10 skill') returning id)
       insert into public.resource_skills (organisation_id, resource_id, level, skill_id)
       select %1$L, r.id, 1, s.id from public.resources r, s where r.organisation_id = %1$L limit 1$s$),
    ('approval_gates', $s$insert into public.approval_gates (organisation_id, workspace_id, project_id, entity_type, entity_id, gate_type, name)
       select organisation_id, workspace_id, id, 'project', id, 'gl10_gate', 'GL10 gate' from public.projects where organisation_id = %1$L order by created_at limit 1$s$),
    ('change_requests', $s$with ins as (
         insert into public.lookup_values (organisation_id, list_key, value, label)
         select %1$L, 'change_type', 'gl10', 'GL10 change' where not exists (
           select 1 from public.lookup_values where organisation_id = %1$L and list_key = 'change_type') returning id),
       t as (select id from public.lookup_values where organisation_id = %1$L and list_key = 'change_type' union all select id from ins)
       insert into public.change_requests (organisation_id, workspace_id, project_id, title, type_id, ref)
       select p.organisation_id, p.workspace_id, p.id, 'GL10 change', (select id from t limit 1), 'GL10-CR1'
       from public.projects p where p.organisation_id = %1$L order by created_at limit 1$s$),
    ('cost_lines', $s$with ins as (
         insert into public.lookup_values (organisation_id, list_key, value, label)
         select %1$L, 'cost_category', 'gl10', 'GL10 cost' where not exists (
           select 1 from public.lookup_values where organisation_id = %1$L and list_key = 'cost_category') returning id),
       t as (select id from public.lookup_values where organisation_id = %1$L and list_key = 'cost_category' union all select id from ins)
       insert into public.cost_lines (organisation_id, workspace_id, project_id, name, category_id)
       select p.organisation_id, p.workspace_id, p.id, 'GL10 cost line', (select id from t limit 1)
       from public.projects p where p.organisation_id = %1$L order by created_at limit 1$s$),
    ('budget_baselines', $s$insert into public.budget_baselines (organisation_id, workspace_id, project_id, version, total, source, reason)
       select p.organisation_id, p.workspace_id, p.id, coalesce((select max(b.version) from public.budget_baselines b where b.project_id = p.id), 0) + 1,
         1000, 'pmo_adjustment', 'GL10 baseline' from public.projects p where p.organisation_id = %1$L order by created_at limit 1$s$),
    ('reports', $s$insert into public.reports (organisation_id, workspace_id, title, scope_type, scope_entity_id, as_at)
       select organisation_id, workspace_id, 'GL10 report', 'project', id, current_date from public.projects
       where organisation_id = %1$L order by created_at limit 1$s$),
    ('dependencies', $s$insert into public.dependencies (organisation_id, workspace_id, giver_project_id, receiver_project_id, description, required_by_date, ref)
       select a.organisation_id, a.workspace_id, a.id, b.id, 'GL10 dependency', current_date + 30, 'GL10-D1' from public.projects a
       join public.projects b on b.workspace_id = a.workspace_id and b.id <> a.id where a.organisation_id = %1$L limit 1$s$),
    -- Shared with a third organisation, never the other one under test (sharing is a deliberate
    -- cross-organisation grant and would show up as a leak).
    ('entity_shares', $s$insert into public.entity_shares (organisation_id, workspace_id, entity_type, entity_id, partner_organisation_id)
       select p.organisation_id, p.workspace_id, 'project', p.id,
         (select o.id from public.organisations o where o.id not in (select id from ct_orgs) order by o.created_at limit 1)
       from public.projects p where p.organisation_id = %1$L order by created_at limit 1$s$),
    ('gate_checklist_ticks', $s$with ins as (
         insert into public.milestones (organisation_id, workspace_id, project_id, title, type, phase_id, baseline_date, forecast_date, ref)
         select p.organisation_id, p.workspace_id, p.id, 'GL10 gate', 'gate', p.phase_id, current_date, current_date, 'GL10-M1'
         from public.projects p where p.organisation_id = %1$L and p.phase_id is not null
           and not exists (select 1 from public.milestones m2 join public.projects p2 on p2.id = m2.project_id
                           where p2.organisation_id = %1$L and m2.type = 'gate' and m2.phase_id = p2.phase_id)
         order by p.created_at limit 1 returning id, project_id),
       m as (
         select m.id, m.project_id from public.milestones m join public.projects p on p.id = m.project_id
         where p.organisation_id = %1$L and m.type = 'gate' and m.phase_id = p.phase_id
         union all select id, project_id from ins)
       insert into public.gate_checklist_ticks (organisation_id, workspace_id, project_id, milestone_id, criterion_id)
       select p.organisation_id, p.workspace_id, p.id, m.id, (select c.id from public.gate_criteria c where c.organisation_id = %1$L limit 1)
       from m join public.projects p on p.id = m.project_id limit 1$s$)
  ) v(rel, stmt) loop
    continue when pg_temp.ct_has_rows(p_org, ('public.' || r.rel)::regclass);
    begin
      execute format(r.stmt, p_org);
    exception when others then
      insert into ct_fill_errors values (p_org, 'public.' || r.rel, 'hand: ' || sqlstate || ' ' || sqlerrm)
      on conflict (org, rel) do update set error = excluded.error;
    end;
  end loop;
end $$;

-- Fill both organisations (as the owner, with the organisation's admin as auth.uid()).
do $$ declare o record; begin
  for o in select ct_orgs.label, ct_orgs.id, u.id as admin_id from ct_orgs join ct_users u on u.org = ct_orgs.label and u.org_role = 'admin' loop
    perform pg_temp.ct_as_postgres(o.admin_id);
    perform pg_temp.ct_fill_hand(o.id);
    perform pg_temp.ct_fill(o.id);
    perform pg_temp.ct_fill_hand(o.id);
    perform pg_temp.ct_fill(o.id);
  end loop;
  perform pg_temp.ct_as_postgres();
end $$;

create temp view ct_tables as
select c.oid::regclass as rel, c.relname::text as name, c.relkind = 'v' as is_view
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and ((c.relkind = 'r' and c.relrowsecurity) or c.relkind = 'v')
  and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped);
grant select on ct_tables to authenticated, anon;

-- Coverage meta-check: every RLS table holds a row of each organisation.
do $$ declare missing text; begin
  select string_agg(o.label || ' ' || t.name || coalesce(' (' || e.error || ')', ''), E'\n  ' order by t.name, o.label) into missing
  from ct_tables t cross join ct_orgs o
  left join ct_fill_errors e on e.org = o.id and e.rel = t.rel::text
  where not t.is_view and not pg_temp.ct_has_rows(o.id, t.rel);
  if missing is not null then
    raise exception E'COVERAGE: no fixture row for\n  %\nAdd a hand-written row in pg_temp.ct_fill_hand.', missing;
  end if;
end $$;

-- One sample row per table and organisation, for the insert checks.
do $$ declare t record; o record; begin
  for t in select * from ct_tables where not is_view loop
    for o in select * from ct_orgs loop
      execute format('insert into ct_samples select %L, %L, to_jsonb(x) from %s x where organisation_id = %L limit 1',
                     o.label, t.name, t.rel, o.id);
    end loop;
  end loop;
end $$;

-- Every RLS table without organisation_id is known and checked below.
do $$ declare extra text; begin
  select string_agg(c.relname, ', ') into extra from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped)
    and c.relname not in ('organisations', 'profiles', 'stripe_webhook_events', 'resend_webhook_events');
  if extra is not null then raise exception 'COVERAGE: public tables without organisation_id that have no case: %', extra; end if;
  select string_agg(c.relname, ', ') into extra from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if extra is not null then raise exception 'LEAK: public tables without RLS: %', extra; end if;
  select string_agg(c.relname, ', ') into extra from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v' and not coalesce(c.reloptions::text like '%security_invoker=true%', false);
  if extra is not null then raise exception 'LEAK: views that bypass RLS (not security_invoker): %', extra; end if;
  select string_agg(c.relname, ', ') into extra from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped);
  if extra is not null then raise exception 'COVERAGE: views without organisation_id that have no case: %', extra; end if;
  select string_agg(c.relname, ', ') into extra from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relkind in ('r', 'v', 'm')
    and (has_table_privilege('authenticated', c.oid, 'select') or has_table_privilege('anon', c.oid, 'select'));
  if extra is not null then raise exception 'LEAK: private tables readable by authenticated or anon: %', extra; end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Tables and views

-- Errors PostgreSQL raises after the RLS WITH CHECK on insert (ExecInsert checks RLS, then the
-- table's NOT NULL / CHECK constraints, then unique, exclusion and foreign keys): seeing one
-- means RLS accepted the row. Triggers can raise the same codes, so the message is matched too.
create function pg_temp.ct_after_rls(p_state text, p_msg text) returns boolean language sql immutable as $$
  select p_state = '23505' or p_state = '23P01'
      or (p_state = '23503' and p_msg like '%violates foreign key constraint%')
      or (p_state = '23514' and p_msg like 'new row for relation % violates check constraint %')
      or (p_state = '23502' and p_msg like '%violates not-null constraint%') $$;

create function pg_temp.ct_table_checks(p_actor text, p_target text) returns void language plpgsql as $$
declare
  t record; n bigint; v_n0 bigint; v_outcome text; v_verdict text; v_col text; v_cols text; v_sample jsonb; v_min jsonb; v_xid text;
  v_state text; v_hint text; v_msg text;
  v_org uuid := pg_temp.ct_org(p_target);
  v_own uuid := pg_temp.ct_org((select org from ct_users where label = p_actor));  -- null for anon
begin
  perform pg_temp.ct_as(p_actor);
  for t in select * from ct_tables order by name loop
    -- Read
    begin
      execute format('select count(*) from %s where organisation_id = %L', t.rel, v_org) into n;
      v_outcome := n::text; v_verdict := case when n = 0 then 'ok' else 'LEAK' end;
    exception when others then v_outcome := 'refused ' || sqlstate; v_verdict := 'ok';
    end;
    insert into ct_result values (p_actor, p_target, t.name, 'select', v_outcome, v_verdict);
    continue when t.is_view;

    -- Update: set a column to itself on the target's rows (then undo). Any row touched, or any
    -- row-level error (the row was visible to the update), is a finding.
    select a.attname into v_col from pg_attribute a
    where a.attrelid = t.rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
    order by (a.attname = 'updated_at') desc, a.attnum limit 1;
    begin
      execute format('with w as (update %s set %I = %I where organisation_id = %L returning 1) select count(*) from w',
                     t.rel, v_col, v_col, v_org) into n;
      raise exception using errcode = 'P0099', message = n::text;
    exception
      when sqlstate 'P0099' then v_outcome := sqlerrm; v_verdict := case when sqlerrm = '0' then 'ok' else 'LEAK' end;
      when others then
        get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
        v_outcome := 'err ' || v_state || ' ' || v_msg;
        v_verdict := case when v_state = 'P0001' and v_hint = 'org_read_only' then 'SETUP'
                          when v_state = '42501' and v_msg = 'permission denied for table ' || t.name then 'ok' else 'REVIEW' end;
    end;
    insert into ct_result values (p_actor, p_target, t.name, 'update', v_outcome, v_verdict);

    -- Delete (then undo).
    begin
      execute format('with w as (delete from %s where organisation_id = %L returning 1) select count(*) from w', t.rel, v_org) into n;
      raise exception using errcode = 'P0099', message = n::text;
    exception
      when sqlstate 'P0099' then v_outcome := sqlerrm; v_verdict := case when sqlerrm = '0' then 'ok' else 'LEAK' end;
      when others then
        get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
        v_outcome := 'err ' || v_state || ' ' || v_msg;
        v_verdict := case when v_state = 'P0001' and v_hint = 'org_read_only' then 'SETUP'
                          when v_state = '42501' and v_msg = 'permission denied for table ' || t.name then 'ok' else 'REVIEW' end;
    end;
    insert into ct_result values (p_actor, p_target, t.name, 'delete', v_outcome, v_verdict);

    -- Insert a copy of one of the target's rows. Success, or an error PostgreSQL raises only after
    -- the RLS check (ct_after_rls), means RLS let it through. 42501 is RLS or a missing grant;
    -- any other error (the tenant guard's 23503 "not found or not visible", for one) is a BEFORE
    -- trigger refusing ahead of RLS: recorded as ok-trigger, not a leak, since nothing was written.
    select row_json into v_sample from ct_samples where org = p_target and rel = t.name;
    select string_agg(quote_ident(a.attname), ', ') into v_cols from pg_attribute a
    where a.attrelid = t.rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity = '';
    begin
      execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1)', t.rel, v_cols, v_cols, t.rel) using v_sample;
      raise exception using errcode = 'P0099', message = 'inserted';
    exception
      when sqlstate 'P0099' then v_outcome := 'inserted'; v_verdict := 'LEAK';
      when others then
        get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
        v_outcome := 'err ' || v_state || case when v_state in ('42501') then '' else ' ' || v_msg end;
        v_verdict := case when v_state = 'P0001' and v_hint = 'org_read_only' then 'SETUP'
                          when pg_temp.ct_after_rls(v_state, v_msg) then 'LEAK'
                          when v_state = '42501' then 'ok' else 'ok-trigger' end;
    end;
    insert into ct_result values (p_actor, p_target, t.name, 'insert', v_outcome, v_verdict);

    -- Insert again with every nullable parent link cleared (organisation and workspace kept), so
    -- the tenant guard has no parent to refuse and RLS decides.
    select v_sample || coalesce(jsonb_object_agg(a.attname, null), '{}') into v_min from pg_attribute a
    where a.attrelid = t.rel and a.attnum > 0 and not a.attisdropped and not a.attnotnull
      and a.attname not in ('organisation_id', 'workspace_id')
      and exists (select 1 from pg_constraint c where c.conrelid = t.rel and c.contype = 'f' and a.attnum = any (c.conkey));
    if v_min is distinct from v_sample then
      begin
        execute format('insert into %s (%s) select %s from jsonb_populate_record(null::%s, $1)', t.rel, v_cols, v_cols, t.rel) using v_min;
        raise exception using errcode = 'P0099', message = 'inserted';
      exception
        when sqlstate 'P0099' then v_outcome := 'inserted'; v_verdict := 'LEAK';
        when others then
          get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
          v_outcome := 'err ' || v_state || case when v_state in ('42501') then '' else ' ' || v_msg end;
          v_verdict := case when v_state = 'P0001' and v_hint = 'org_read_only' then 'SETUP'
                            when pg_temp.ct_after_rls(v_state, v_msg) then 'LEAK'
                            when v_state = '42501' then 'ok' else 'ok-trigger' end;
      end;
      insert into ct_result values (p_actor, p_target, t.name, 'insert, no parents', v_outcome, v_verdict);
    end if;

    -- Blind update: no WHERE clause and nothing read from the rows, so only the UPDATE policy
    -- applies (a filtered update also applies the SELECT policy). The actor's own rows are removed
    -- first, as for the blind delete below; rows of another organisation it touched carry this
    -- subtransaction's xid (found with a probe row). Any such row, or any error, is a finding.
    select a.attname into v_col from pg_attribute a
    where a.attrelid = t.rel and a.attnum > 0 and not a.attisdropped and a.atthasdef and a.attgenerated = '' and a.attidentity = ''
      and not exists (select 1 from pg_index i where i.indrelid = t.rel and i.indisunique and a.attnum = any (i.indkey))
    order by (a.attname = 'updated_at') desc, (a.attname = 'created_at') desc, a.attnum limit 1;
    if v_col is null then
      insert into ct_result values (p_actor, p_target, t.name, 'update, blind', 'no column with a default', 'ok');
    else
      begin
        perform pg_temp.ct_as_postgres();
        perform set_config('session_replication_role', 'replica', true);
        execute format('delete from %s where organisation_id = %L', t.rel, v_own);
        perform set_config('session_replication_role', 'origin', true);
        perform pg_temp.ct_as(p_actor);
        insert into ct_xid_probe values (1) returning xmin::text into v_xid;
        execute format('update %s set %I = default', t.rel, v_col);
        perform pg_temp.ct_as_postgres();
        execute format('select count(*) from %s where organisation_id is distinct from %L and xmin::text = %L', t.rel, v_own, v_xid) into n;
        raise exception using errcode = 'P0099', message = n::text;
      exception
        when sqlstate 'P0099' then v_outcome := sqlerrm; v_verdict := case when sqlerrm = '0' then 'ok' else 'LEAK' end;
        when others then
          get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
          v_outcome := 'err ' || v_state || ' ' || v_msg;
          v_verdict := case when v_state = 'P0001' and v_hint = 'org_read_only' then 'SETUP'
                            when v_state = '42501' and v_msg = 'permission denied for table ' || t.name then 'ok' else 'REVIEW' end;
      end;
      insert into ct_result values (p_actor, p_target, t.name, 'update, blind', v_outcome, v_verdict);
    end if;

    -- Blind delete: no WHERE clause (a WHERE, even on ctid, applies the SELECT policy). The
    -- actor's own rows would make it fail (restricting foreign keys, guards), so the owner first
    -- removes them with triggers and foreign keys off (session_replication_role = replica); all
    -- of it is undone. Any row of another organisation deleted, or any error, is a finding.
    begin
      perform pg_temp.ct_as_postgres();
      perform set_config('session_replication_role', 'replica', true);
      execute format('delete from %s where organisation_id = %L', t.rel, v_own);
      perform set_config('session_replication_role', 'origin', true);
      execute format('select count(*) from %s where organisation_id is distinct from %L', t.rel, v_own) into v_n0;
      perform pg_temp.ct_as(p_actor);
      execute format('delete from %s', t.rel);
      perform pg_temp.ct_as_postgres();
      execute format('select count(*) from %s where organisation_id is distinct from %L', t.rel, v_own) into n;
      raise exception using errcode = 'P0099', message = (v_n0 - n)::text;
    exception
      when sqlstate 'P0099' then v_outcome := sqlerrm; v_verdict := case when sqlerrm = '0' then 'ok' else 'LEAK' end;
      when others then
        get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
        v_outcome := 'err ' || v_state || ' ' || v_msg;
        v_verdict := case when v_state = 'P0001' and v_hint = 'org_read_only' then 'SETUP'
                          when v_state = '42501' and v_msg = 'permission denied for table ' || t.name then 'ok' else 'REVIEW' end;
    end;
    insert into ct_result values (p_actor, p_target, t.name, 'delete, blind', v_outcome, v_verdict);
  end loop;

  -- Tables without organisation_id.
  begin
    execute format('select count(*) from public.organisations where id = %L', v_org) into n;
    v_outcome := n::text; v_verdict := case when n = 0 then 'ok' else 'LEAK' end;
  exception when others then v_outcome := 'refused ' || sqlstate; v_verdict := 'ok';
  end;
  insert into ct_result values (p_actor, p_target, 'organisations', 'select', v_outcome, v_verdict);
  begin
    execute format('with w as (update public.organisations set name = name where id = %L returning 1) select count(*) from w', v_org) into n;
    raise exception using errcode = 'P0099', message = n::text;
  exception
    when sqlstate 'P0099' then v_outcome := sqlerrm; v_verdict := case when sqlerrm = '0' then 'ok' else 'LEAK' end;
    when others then v_outcome := 'err ' || sqlstate; v_verdict := case when sqlstate = '42501' then 'ok' else 'REVIEW' end;
  end;
  insert into ct_result values (p_actor, p_target, 'organisations', 'update', v_outcome, v_verdict);
  begin
    execute format('with w as (delete from public.organisations where id = %L returning 1) select count(*) from w', v_org) into n;
    raise exception using errcode = 'P0099', message = n::text;
  exception
    when sqlstate 'P0099' then v_outcome := sqlerrm; v_verdict := case when sqlerrm = '0' then 'ok' else 'LEAK' end;
    when others then v_outcome := 'err ' || sqlstate; v_verdict := case when sqlstate = '42501' then 'ok' else 'REVIEW' end;
  end;
  insert into ct_result values (p_actor, p_target, 'organisations', 'delete', v_outcome, v_verdict);

  -- Profiles of the target's fixture users (members of the target organisation only).
  begin
    select count(*) into n from public.profiles where id in (select id from ct_users where org = p_target);
    v_outcome := n::text; v_verdict := case when n = 0 then 'ok' else 'LEAK' end;
  exception when others then v_outcome := 'refused ' || sqlstate; v_verdict := 'ok';
  end;
  insert into ct_result values (p_actor, p_target, 'profiles', 'select', v_outcome, v_verdict);
  begin
    with w as (update public.profiles set display_name = display_name where id in (select id from ct_users where org = p_target) returning 1)
    select count(*) into n from w;
    raise exception using errcode = 'P0099', message = n::text;
  exception
    when sqlstate 'P0099' then v_outcome := sqlerrm; v_verdict := case when sqlerrm = '0' then 'ok' else 'LEAK' end;
    when others then v_outcome := 'err ' || sqlstate; v_verdict := case when sqlstate = '42501' then 'ok' else 'REVIEW' end;
  end;
  insert into ct_result values (p_actor, p_target, 'profiles', 'update', v_outcome, v_verdict);

  -- Webhook event tables: service role only.
  for t in select unnest(array['stripe_webhook_events', 'resend_webhook_events']) as name loop
    begin
      execute format('select count(*) from public.%I', t.name) into n;
      v_outcome := n::text; v_verdict := case when n = 0 then 'ok' else 'LEAK' end;
    exception when others then v_outcome := 'refused ' || sqlstate; v_verdict := 'ok';
    end;
    insert into ct_result values (p_actor, p_target, t.name, 'select', v_outcome, v_verdict);
  end loop;
  perform pg_temp.ct_as_postgres();
end $$;

-- Webhook tables get a row each, so "sees none" means something.
insert into public.stripe_webhook_events (id, type) values ('evt_gl10', 'gl10.test') on conflict do nothing;
insert into public.resend_webhook_events (id, type) values ('gl10', 'gl10.test') on conflict do nothing;

-- Controls: each organisation's users do see their own projects.
do $$ declare u record; n bigint; begin
  for u in select * from ct_users loop
    perform pg_temp.ct_as(u.label);
    select count(*) into n from public.projects where organisation_id = pg_temp.ct_org(u.org);
    perform pg_temp.ct_as_postgres();
    if n = 0 then raise exception 'SETUP: % sees none of its own organisation''s projects', u.label; end if;
  end loop;
end $$;

select pg_temp.ct_table_checks(a, 'A') from unnest(array['b_admin', 'b_contributor', 'b_viewer', 'anon']) a;
select pg_temp.ct_table_checks(a, 'B') from unnest(array['a_admin', 'a_contributor', 'a_viewer']) a;

-- ---------------------------------------------------------------------------------------------
-- 3. Storage objects and report print tokens
-- ---------------------------------------------------------------------------------------------
create temp table ct_objects (org text, bucket_id text, name text);
grant select on ct_objects to authenticated, anon;
insert into ct_objects
select o.label, b.bucket_id, b.name from ct_orgs o, lateral (values
  ('org-assets',  o.id || '/logo.png'),
  ('attachments', o.id || '/' || o.ws || '/gl10/attachment.pdf'),
  ('evidence',    o.id || '/' || o.ws || '/gl10/evidence.pdf'),
  ('documents',   (select d.storage_path from public.documents d where d.organisation_id = o.id order by d.created_at limit 1)),
  ('report-pdfs', o.id || '/' || (select r.id from public.reports r where r.organisation_id = o.id order by r.created_at limit 1) || '.pdf')  -- as report-pdf stores it
) b(bucket_id, name);
insert into storage.objects (bucket_id, name) select bucket_id, name from ct_objects;

create function pg_temp.ct_storage_checks(p_actor text, p_target text) returns void language plpgsql as $$
declare o record; n bigint; v_outcome text; v_verdict text; v_state text; v_hint text;
begin
  perform pg_temp.ct_as(p_actor);
  for o in select * from ct_objects where org = p_target order by bucket_id loop
    begin
      select count(*) into n from storage.objects s where s.bucket_id = o.bucket_id and s.name = o.name;
      v_outcome := n::text; v_verdict := case when n = 0 then 'ok' else 'LEAK' end;
    exception when others then v_outcome := 'refused ' || sqlstate; v_verdict := 'ok';
    end;
    insert into ct_result values (p_actor, p_target, 'storage:' || o.bucket_id, 'select', v_outcome, v_verdict);
    begin
      with w as (update storage.objects s set name = s.name where s.bucket_id = o.bucket_id and s.name = o.name returning 1)
      select count(*) into n from w;
      raise exception using errcode = 'P0099', message = n::text;
    exception
      when sqlstate 'P0099' then v_outcome := sqlerrm; v_verdict := case when sqlerrm = '0' then 'ok' else 'LEAK' end;
      when others then
        get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
        v_outcome := 'err ' || v_state; v_verdict := case when v_hint = 'org_read_only' then 'SETUP' when v_state = '42501' then 'ok' else 'REVIEW' end;
    end;
    insert into ct_result values (p_actor, p_target, 'storage:' || o.bucket_id, 'update', v_outcome, v_verdict);
    begin
      with w as (delete from storage.objects s where s.bucket_id = o.bucket_id and s.name = o.name returning 1)
      select count(*) into n from w;
      raise exception using errcode = 'P0099', message = n::text;
    exception
      when sqlstate 'P0099' then v_outcome := sqlerrm; v_verdict := case when sqlerrm = '0' then 'ok' else 'LEAK' end;
      when others then
        get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
        v_outcome := 'err ' || v_state; v_verdict := case when v_hint = 'org_read_only' then 'SETUP' when v_state = '42501' then 'ok' else 'REVIEW' end;
    end;
    insert into ct_result values (p_actor, p_target, 'storage:' || o.bucket_id, 'delete', v_outcome, v_verdict);
    -- Upload into the target's folder (a new name next to the existing object).
    begin
      insert into storage.objects (bucket_id, name) values (o.bucket_id, regexp_replace(o.name, '[^/]*$', 'gl10-upload.pdf'));
      raise exception using errcode = 'P0099', message = 'inserted';
    exception
      when sqlstate 'P0099' then v_outcome := 'inserted'; v_verdict := 'LEAK';
      when others then
        get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
        v_outcome := 'err ' || v_state; v_verdict := case when v_hint = 'org_read_only' then 'SETUP' when v_state = '42501' then 'ok' else 'REVIEW' end;
    end;
    insert into ct_result values (p_actor, p_target, 'storage:' || o.bucket_id, 'insert', v_outcome, v_verdict);
    -- The documents bucket accepts an upload only to a documents row's own path: try A's.
    if o.bucket_id = 'documents' then
      begin
        delete from storage.objects s where s.bucket_id = o.bucket_id and s.name = o.name;  -- invisible: no-op
        insert into storage.objects (bucket_id, name) values (o.bucket_id, o.name);
        raise exception using errcode = 'P0099', message = 'inserted';
      exception
        when sqlstate 'P0099' then v_outcome := 'inserted'; v_verdict := 'LEAK';
        when others then
          get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
          v_outcome := 'err ' || v_state; v_verdict := case when v_hint = 'org_read_only' then 'SETUP' when v_state = '42501' then 'ok' else 'REVIEW' end;
      end;
      insert into ct_result values (p_actor, p_target, 'storage:documents', 'insert at document path', v_outcome, v_verdict);
    end if;
  end loop;
  perform pg_temp.ct_as_postgres();
end $$;

-- Controls: each organisation's admin sees its own objects (all but report-pdfs, which need a
-- report the admin can view: also true here).
do $$ declare o record; n bigint; begin
  for o in select ct_orgs.label, u.label as admin from ct_orgs join ct_users u on u.org = ct_orgs.label and u.org_role = 'admin' loop
    perform pg_temp.ct_as(o.admin);
    select count(*) into n from storage.objects s join ct_objects c on c.bucket_id = s.bucket_id and c.name = s.name where c.org = o.label;
    perform pg_temp.ct_as_postgres();
    if n < 4 then raise exception 'SETUP: % sees only % of its own 5 storage objects', o.admin, n; end if;
  end loop;
end $$;

select pg_temp.ct_storage_checks(a, 'A') from unnest(array['b_admin', 'b_contributor', 'b_viewer', 'anon']) a;
select pg_temp.ct_storage_checks(a, 'B') from unnest(array['a_admin', 'a_contributor', 'a_viewer']) a;

-- Print tokens: one live token for a report of each organisation.
insert into private.report_print_tokens (token_hash, report_id, expires_at)
select extensions.digest('gl10-token-' || o.label, 'sha256'), r.id, now() + interval '1 hour'
from ct_orgs o cross join lateral (select r.id from public.reports r where r.organisation_id = o.id order by r.created_at limit 1) r;

-- ---------------------------------------------------------------------------------------------
-- 4. Functions: one case per public function signed-in users can run
-- ---------------------------------------------------------------------------------------------
-- Placeholders. The function cases use A's records (B's admin calls them); {b_*} are B's own.
insert into ct_ctx
select 'a_org', id::text from ct_orgs where label = 'A'
union all select 'a_ws', ws::text from ct_orgs where label = 'A'
union all select 'b_org', id::text from ct_orgs where label = 'B'
union all select 'a_slug', (select slug from public.organisations where id = pg_temp.ct_org('A'))
union all select 'a_member', (select id::text from ct_users where label = 'a_contributor')
union all select 'a_project', (select id::text from public.projects where organisation_id = pg_temp.ct_org('A') and archived_at is null order by created_at limit 1)
union all select 'a_programme', (select id::text from public.programmes where organisation_id = pg_temp.ct_org('A') order by created_at limit 1)
union all select 'a_portfolio', (select id::text from public.portfolios where organisation_id = pg_temp.ct_org('A') order by created_at limit 1)
union all select 'a_report', (select id::text from public.reports where organisation_id = pg_temp.ct_org('A') order by created_at limit 1)
union all select 'b_report', (select id::text from public.reports where organisation_id = pg_temp.ct_org('B') order by created_at limit 1)
union all select 'a_forum', (select id::text from public.forums where organisation_id = pg_temp.ct_org('A') order by created_at limit 1)
union all select 'a_step', (select id::text from public.approval_steps where organisation_id = pg_temp.ct_org('A') order by (decision is null) desc, created_at limit 1)
union all select 'a_narrative', (select id::text from public.report_narratives where organisation_id = pg_temp.ct_org('A') limit 1)
union all select 'a_domain', (select id::text from public.organisation_join_domains where organisation_id = pg_temp.ct_org('A') limit 1)
union all select 'a_join_request', (select id::text from public.organisation_join_requests where organisation_id = pg_temp.ct_org('A') limit 1)
union all select 'a_invite', (select id::text from public.organisation_invites where organisation_id = pg_temp.ct_org('A') limit 1)
union all select 'a_decision', (select id::text from public.decisions where organisation_id = pg_temp.ct_org('A') order by (status::text = 'pending') desc, created_at limit 1)
union all select 'a_option', (select o.id::text from public.decision_options o join public.decisions d on d.id = o.decision_id
                              where d.organisation_id = pg_temp.ct_org('A') order by (d.status::text = 'pending') desc, d.created_at limit 1)
union all select 'a_risk', (select id::text from public.risks where organisation_id = pg_temp.ct_org('A') limit 1)
union all select 'a_business_case', (select id::text from public.business_cases where organisation_id = pg_temp.ct_org('A') limit 1)
union all select 'a_bc_version', (select id::text from public.business_case_versions where organisation_id = pg_temp.ct_org('A') limit 1)
union all select 'a_request', (select id::text from public.project_requests where organisation_id = pg_temp.ct_org('A') limit 1)
union all select 'a_status_report', (select id::text from public.status_reports where organisation_id = pg_temp.ct_org('A') limit 1)
union all select 'a_phases', (select 'array[' || string_agg(quote_literal(id) || '::uuid', ', ' order by sort_order) || ']'
                              from public.lifecycle_phases where organisation_id = pg_temp.ct_org('A'))
union all select 'month', quote_literal(date_trunc('month', current_date)::date);
do $$ declare missing text; begin
  select string_agg(key, ', ') into missing from ct_ctx where value is null;
  if missing is not null then raise exception 'SETUP: no fixture record for %', missing; end if;
end $$;

-- The report inputs used by the report_* preview functions (A's scope, given explicitly).
insert into ct_ctx values ('a_input', quote_literal(json_build_object(
  'organisation_id', pg_temp.ct_org('A'), 'scope_type', 'project',
  'scope_entity_id', (select value from ct_ctx where key = 'a_project'),
  'forum_id', (select value from ct_ctx where key = 'a_forum'))::text) || '::jsonb');

-- Cases. expect:
--   empty  the call must raise, or return nothing (null, false, 0, '', [] or {}, recursively)
--   own    it may return data, but nothing of A's except ids it was given (see ct_markers)
--   like_unknown  it may return a non-empty default, but exactly the same as when every A id in
--          the call is replaced by a random uuid: A's records are indistinguishable from none
-- Whatever it returns, A's data must be unchanged afterwards (ct_fingerprint) and B's users must
-- have no membership in A. One function may have several cases.
create temp table ct_cases (fn text not null, call text not null, expect text not null default 'empty' check (expect in ('empty', 'own', 'like_unknown')), note text);
insert into ct_cases (fn, call, expect, note) values
  ('accept_invite(text)', $c$select public.accept_invite('gl10-not-a-token')$c$, 'empty', null),
  ('acknowledge_ai_draft(uuid)', $c$select public.acknowledge_ai_draft('{a_narrative}')$c$, 'empty', null),
  ('add_join_domain(uuid,text)', $c$select public.add_join_domain('{a_org}', 'email_domain')$c$, 'empty', null),
  ('add_meeting_action(uuid,text,uuid,date,uuid)', $c$select public.add_meeting_action('{a_report}', 'GL10 action', null, current_date, '{a_project}')$c$, 'empty', null),
  ('ai_drafts_today(uuid)', $c$select public.ai_drafts_today('{a_report}')$c$, 'empty', null),
  ('approve_report(uuid)', $c$select public.approve_report('{a_report}')$c$, 'empty', null),
  ('change_member_role(uuid,uuid,app_role)', $c$select public.change_member_role('{a_org}', '{a_member}', 'admin')$c$, 'empty', null),
  ('close_financial_period(uuid,date)', $c$select public.close_financial_period('{a_org}', {month})$c$, 'empty', null),
  ('commit_actuals_import(uuid,text,actuals_import_mode,jsonb)', $c$select public.commit_actuals_import('{a_ws}', 'gl10.csv', 'add', '[]')$c$, 'empty', null),
  ('convert_request_to_project(uuid,jsonb)', $c$select public.convert_request_to_project('{a_request}', '{}')$c$, 'empty', null),
  ('create_invites(uuid,jsonb,uuid[])', $c$select public.create_invites('{a_org}', '[{"email":"gl10-invitee@example.invalid","role":"admin"}]', null)$c$, 'empty', null),
  ('create_organisation(text,text,text,text,text,integer,text)', $c$select public.create_organisation(p_name => 'GL10 Clash', p_sector => 'general', p_slug => '{a_slug}')$c$, 'own',
     'creates a new organisation for the caller; must not join A even with A''s slug'),
  ('create_organisation(text,text,text,text,text,integer,text)', $c$select public.create_organisation(p_name => 'GL10 Clash', p_sector => 'general', p_workspace_name => 'GL10')$c$, 'own', null),
  ('create_organisation(text,text,text,text,integer,text)', $c$select public.create_organisation('GL10 Clash', '{a_slug}', 'uk', 'GBP', 4, 'GL10')$c$, 'own',
     'the six-argument wrapper'),
  ('create_report(jsonb)', $c$select public.create_report(jsonb_build_object('forum_id', '{a_forum}', 'title', 'GL10'))$c$, 'empty', null),
  ('create_report(jsonb)', $c$select public.create_report(jsonb_build_object('scope_type', 'project', 'scope_entity_id', '{a_project}', 'title', 'GL10'))$c$, 'empty', null),
  ('decide_approval_step(uuid,text,text)', $c$select public.decide_approval_step('{a_step}', 'approved', 'GL10')$c$, 'empty', null),
  ('decide_join_request(uuid,boolean,app_role,uuid[])', $c$select public.decide_join_request('{a_join_request}', true, 'admin', null)$c$, 'empty', null),
  ('defer_decision(uuid,date,text,date,uuid,timestamp with time zone)', $c$select public.defer_decision('{a_decision}', current_date + 30, 'GL10', null, null, null)$c$, 'empty', null),
  ('find_joinable_organisations()', $c$select * from public.find_joinable_organisations()$c$, 'own', 'the caller''s own matches; A has no matching domain'),
  ('get_invite_preview(text)', $c$select public.get_invite_preview('gl10-not-a-token')$c$, 'own', 'an unknown token gives {"status":"not_found"}'),
  ('get_portfolio_overview(uuid,uuid,text,uuid)', $c$select public.get_portfolio_overview('{a_ws}', null, '12m', null)$c$, 'like_unknown', 'empty lists plus a constant redRiskMinScore'),
  ('get_portfolio_overview(uuid,uuid,text,uuid)', $c$select public.get_portfolio_overview('{a_ws}', '{a_programme}', '12m', '{a_portfolio}')$c$, 'like_unknown', null),
  ('get_project_overview(uuid)', $c$select public.get_project_overview('{a_project}')$c$, 'empty', null),
  ('get_seat_usage(uuid)', $c$select public.get_seat_usage('{a_org}')$c$, 'empty', null),
  ('join_demo_as_viewer()', $c$select public.join_demo_as_viewer()$c$, 'own', 'joins a demo organisation, never A (not a demo)'),
  ('list_organisation_members(uuid)', $c$select * from public.list_organisation_members('{a_org}')$c$, 'empty', null),
  ('my_system_drafted_packs()', $c$select * from public.my_system_drafted_packs()$c$, 'own', null),
  ('my_workspace_roles()', $c$select * from public.my_workspace_roles()$c$, 'own', null),
  ('organisation_writable(uuid)', $c$select public.organisation_writable('{a_org}')$c$, 'empty', null),
  ('project_metrics(uuid[],date,uuid,uuid)', $c$select * from public.project_metrics(array['{a_project}'::uuid], current_date, '{a_forum}', null)$c$, 'empty', null),
  ('project_permissions(uuid)', $c$select * from public.project_permissions('{a_project}')$c$, 'empty', null),
  ('publish_report(uuid)', $c$select public.publish_report('{a_report}')$c$, 'empty', null),
  ('record_ai_draft(uuid,text,text,text)', $c$select public.record_ai_draft('{a_report}', 'exec', 'GL10 draft', 'gl10-model')$c$, 'empty', null),
  ('record_billing_request(uuid,text,jsonb)', $c$select public.record_billing_request('{a_org}', 'portal', '{}')$c$, 'empty', null),
  ('record_decision(uuid,uuid,text,date,uuid,uuid,jsonb,timestamp with time zone)', $c$select public.record_decision('{a_decision}', '{a_option}', 'GL10', current_date, null, null, '[]', null)$c$, 'empty', null),
  ('record_meeting_decision(uuid,uuid,uuid,text,jsonb)', $c$select public.record_meeting_decision('{a_report}', '{a_decision}', '{a_option}', 'approved', '[]')$c$, 'empty', null),
  ('refresh_report_selection(uuid)', $c$select public.refresh_report_selection('{a_report}')$c$, 'empty', null),
  ('remove_join_domain(uuid)', $c$select public.remove_join_domain('{a_domain}')$c$, 'empty', null),
  ('remove_member(uuid,uuid)', $c$select public.remove_member('{a_org}', '{a_member}')$c$, 'empty', null),
  ('remove_sample_data(uuid)', $c$select public.remove_sample_data('{a_org}')$c$, 'empty', null),
  ('reopen_financial_period(uuid,date,text)', $c$select public.reopen_financial_period('{a_org}', {month}, 'GL10')$c$, 'empty', null),
  ('reorder_lifecycle_phases(uuid,uuid[])', $c$select public.reorder_lifecycle_phases('{a_org}', {a_phases})$c$, 'empty', null),
  ('reorder_report_inclusions(uuid,uuid[])', $c$select public.reorder_report_inclusions('{a_report}', array['{a_project}'::uuid])$c$, 'empty', null),
  ('report_block_data(jsonb,jsonb,uuid)', $c$select public.report_block_data({a_input}, '{"id":"s","blockKey":"project_summary","config":{}}', '{a_project}')$c$, 'own',
     'echoes the ids it was given'),
  ('report_block_data(jsonb,jsonb,uuid)', $c$select public.report_block_data(jsonb_build_object('report_id', '{a_report}'), '{"id":"o","blockKey":"overall_status","config":{}}', null)$c$, 'empty', null),
  ('report_blocks_data(jsonb,jsonb)', $c$select public.report_blocks_data({a_input}, '[{"kind":"scope_metrics"},{"kind":"block","block":{"id":"o","blockKey":"overall_status","config":{}}}]')$c$, 'own',
     'echoes the ids it was given'),
  ('report_context(jsonb)', $c$select public.report_context(jsonb_build_object('report_id', '{a_report}'))$c$, 'empty', null),
  ('report_context(jsonb)', $c$select public.report_context({a_input})$c$, 'own', 'echoes the ids it was given'),
  ('report_permissions(uuid)', $c$select public.report_permissions('{a_report}')$c$, 'like_unknown', 'is_partner is true for any report outside the caller''s organisations'),
  ('report_scope_metrics(jsonb)', $c$select public.report_scope_metrics({a_input})$c$, 'own', 'echoes the ids it was given'),
  ('report_snapshot_by_token(uuid,text)', $c$select public.report_snapshot_by_token('{a_report}', 'gl10-token-B')$c$, 'empty', 'B''s own live token'),
  ('report_snapshot_by_token(uuid,text)', $c$select public.report_snapshot_by_token('{a_report}', '')$c$, 'empty', null),
  ('report_snapshot_by_token(uuid,text)', $c$select public.report_snapshot_by_token('{a_report}', null)$c$, 'empty', null),
  ('request_to_join(uuid,text)', $c$select public.request_to_join('{a_org}', 'GL10')$c$, 'empty', 'A has no join domain matching B''s users'),
  ('resend_invite(uuid)', $c$select public.resend_invite('{a_invite}')$c$, 'empty', null),
  ('return_report(uuid,text)', $c$select public.return_report('{a_report}', 'GL10')$c$, 'empty', null),
  ('reverse_decision(uuid,text,date,timestamp with time zone)', $c$select public.reverse_decision('{a_decision}', 'GL10', current_date, null)$c$, 'empty', null),
  ('revoke_invite(uuid)', $c$select public.revoke_invite('{a_invite}')$c$, 'empty', null),
  ('risk_band(uuid)', $c$select public.risk_band('{a_risk}')$c$, 'empty', null),
  ('risk_score(uuid)', $c$select public.risk_score('{a_risk}')$c$, 'empty', null),
  ('save_report_as_template(uuid,text,text)', $c$select public.save_report_as_template('{a_report}', 'GL10 template', null)$c$, 'empty', null),
  ('save_status_report_draft(uuid,jsonb,uuid[],uuid,timestamp with time zone)', $c$select public.save_status_report_draft('{a_project}', '{"summary":"GL10"}', null, null, null)$c$, 'empty', null),
  ('save_status_report_draft(uuid,jsonb,uuid[],uuid,timestamp with time zone)', $c$select public.save_status_report_draft('{a_project}', '{"summary":"GL10"}', null, '{a_status_report}', null)$c$, 'empty', null),
  ('seed_sample_data(uuid)', $c$select public.seed_sample_data('{a_org}')$c$, 'empty', null),
  ('set_join_requests_enabled(uuid,boolean)', $c$select public.set_join_requests_enabled('{a_org}', true)$c$, 'empty', null),
  ('set_report_inclusion(uuid,uuid,text)', $c$select public.set_report_inclusion('{a_report}', '{a_project}', 'pinned')$c$, 'empty', null),
  ('start_business_case_version(uuid)', $c$select public.start_business_case_version('{a_business_case}')$c$, 'empty', null),
  ('submit_business_case(uuid)', $c$select public.submit_business_case('{a_bc_version}')$c$, 'empty', null),
  ('submit_report(uuid)', $c$select public.submit_report('{a_report}')$c$, 'empty', null),
  ('submit_status_report(uuid,jsonb,uuid[],uuid,timestamp with time zone)', $c$select public.submit_status_report('{a_project}', '{"summary":"GL10"}', null, null, null)$c$, 'empty', null),
  ('supersede_decision(uuid,date,timestamp with time zone)', $c$select public.supersede_decision('{a_decision}', current_date + 30, null)$c$, 'empty', null),
  ('update_pending_decision(uuid,jsonb,jsonb,jsonb,timestamp with time zone)', $c$select public.update_pending_decision('{a_decision}', '{"title":"GL10"}', null, null, null)$c$, 'empty', null),
  ('update_report_to_template(uuid)', $c$select public.update_report_to_template('{a_report}')$c$, 'empty', null),
  ('withdraw_decision(uuid,text,timestamp with time zone)', $c$select public.withdraw_decision('{a_decision}', 'GL10', null)$c$, 'empty', null),
  ('withdraw_join_request(uuid)', $c$select public.withdraw_join_request('{a_join_request}')$c$, 'empty', null),
  ('withdraw_report(uuid,text)', $c$select public.withdraw_report('{a_report}', 'GL10')$c$, 'empty', null);

-- Meta-check: every public function authenticated can run has a case, and no case is stale.
create temp view ct_functions as
select p.oid, p.proname || '(' || coalesce((select string_agg(format_type(t, null), ',' order by i)
       from unnest(p.proargtypes::oid[]) with ordinality u(t, i)), '') || ')' as fn
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('authenticated', p.oid, 'execute');
do $$ declare missing text; stale text; anon_fns text; begin
  select string_agg(f.fn, E'\n  ' order by f.fn) into missing from ct_functions f where not exists (select 1 from ct_cases c where c.fn = f.fn);
  select string_agg(distinct c.fn, E'\n  ') into stale from ct_cases c where not exists (select 1 from ct_functions f where f.fn = c.fn);
  if missing is not null then raise exception E'COVERAGE: public functions authenticated can run with no cross-tenant case:\n  %', missing; end if;
  if stale is not null then raise exception E'COVERAGE: cases for functions that no longer exist:\n  %', stale; end if;
  -- anon may run only the two token entry points; a new one needs a case and a review.
  select string_agg(p.proname, ', ') into anon_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('get_invite_preview', 'report_snapshot_by_token');
  if anon_fns is not null then raise exception 'COVERAGE: public functions anon can run, not reviewed: %', anon_fns; end if;
end $$;

-- A's data, hashed table by table (the owner reads it, bypassing RLS).
create function pg_temp.ct_fingerprint() returns text language plpgsql as $$
declare t record; h text; acc text := '';
begin
  for t in select rel, name from ct_tables where not is_view order by name loop
    execute format('select md5(coalesce(string_agg(x::text, ''|'' order by x::text), '''')) from %s x where organisation_id = %L', t.rel, pg_temp.ct_org('A')) into h;
    acc := acc || t.name || ':' || h || ',';
  end loop;
  select acc || 'org:' || md5(o::text) into acc from public.organisations o where o.id = pg_temp.ct_org('A');
  select acc || 'storage:' || md5(coalesce(string_agg(s.name, '|' order by s.name), '')) into acc
  from storage.objects s where s.name like pg_temp.ct_org('A') || '/%';
  return md5(acc);
end $$;

-- Values that identify A's records: every id in A's rows, A's name and slug.
create temp table ct_markers (marker text primary key);
do $$ declare t record; begin
  for t in select rel from ct_tables c where not is_view
           and exists (select 1 from pg_attribute a where a.attrelid = c.rel and a.attname = 'id' and a.atttypid = 'uuid'::regtype) loop
    execute format('insert into ct_markers select id::text from %s where organisation_id = %L on conflict do nothing', t.rel, pg_temp.ct_org('A'));
  end loop;
  insert into ct_markers select name from public.organisations where id = pg_temp.ct_org('A') on conflict do nothing;
  insert into ct_markers select slug from public.organisations where id = pg_temp.ct_org('A') on conflict do nothing;
end $$;

-- True for null, false, 0, '', [] and {}, and for arrays and objects made only of those.
create function pg_temp.ct_empty(j jsonb) returns boolean language plpgsql immutable as $$
begin
  return case jsonb_typeof(j)
    when 'null' then true when 'boolean' then j = 'false'::jsonb when 'number' then j = '0'::jsonb
    when 'string' then j = '""'::jsonb
    when 'array' then not exists (select 1 from jsonb_array_elements(j) e where not pg_temp.ct_empty(e))
    when 'object' then not exists (select 1 from jsonb_each(j) e where not pg_temp.ct_empty(e.value))
    else j is null end;
end $$;

create function pg_temp.ct_run_cases() returns void language plpgsql as $$
declare
  c record; v_call text; v_call2 text; k record; v_before text; v_after text; v_res jsonb; v_res2 jsonb; v_outcome text; v_verdict text;
  v_state text; v_hint text; v_msg text; v_found text; v_member boolean;
begin
  v_before := pg_temp.ct_fingerprint();
  for c in select * from ct_cases order by fn, call loop
    v_call := c.call;
    for k in select * from ct_ctx loop v_call := replace(v_call, '{' || k.key || '}', k.value); end loop;
    v_res := null; v_res2 := null; v_found := null;
    -- The same call with every A id replaced by a random uuid, for like_unknown.
    v_call2 := v_call;
    for k in select * from ct_ctx where key like 'a\_%' and value ~ '^[0-9a-f-]{36}$' loop
      v_call2 := replace(v_call2, k.value, gen_random_uuid()::text);
    end loop;
    begin
      perform pg_temp.ct_as('b_admin');
      begin
        execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from (%s) x', v_call) into v_res;
        v_outcome := 'returned ' || left(v_res::text, 300);
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
        v_outcome := 'err ' || v_state || ' ' || left(v_msg, 120);
      end;
      if c.expect = 'like_unknown' then
        begin
          execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from (%s) x', v_call2) into v_res2;
        exception when others then v_res2 := null;
        end;
      end if;
      perform pg_temp.ct_as_postgres();
      v_after := pg_temp.ct_fingerprint();
      v_member := exists (select 1 from public.organisation_members m join ct_users u on u.id = m.profile_id
                          where m.organisation_id = pg_temp.ct_org('A') and u.org = 'B')
               or exists (select 1 from public.workspace_members m join ct_users u on u.id = m.profile_id
                          where m.organisation_id = pg_temp.ct_org('A') and u.org = 'B');
      if v_res is not null then
        select string_agg(m.marker, ', ') into v_found from ct_markers m
        where position(m.marker in v_res::text) > 0 and position(m.marker in v_call) = 0;
      end if;
      v_verdict := case
        when v_state = 'P0001' and v_hint = 'org_read_only' then 'SETUP'
        when v_after is distinct from v_before then 'LEAK'
        when v_member then 'LEAK'
        when v_res is null then 'ok'
        when v_found is not null then 'LEAK'
        when c.expect = 'empty' and not pg_temp.ct_empty(v_res) then 'LEAK'
        when c.expect = 'like_unknown' and v_res is distinct from v_res2 then 'LEAK'
        else 'ok' end;
      if v_after is distinct from v_before then v_outcome := v_outcome || ' [changed A''s data]'; end if;
      if v_member then v_outcome := v_outcome || ' [B member of A]'; end if;
      if c.expect = 'like_unknown' and v_res is distinct from v_res2 then v_outcome := v_outcome || ' [differs from unknown ids: ' || left(coalesce(v_res2::text, 'error'), 200) || ']'; end if;
      if v_found is not null then v_outcome := v_outcome || ' [A ids: ' || left(v_found, 200) || ']'; end if;
      raise exception using errcode = 'P0099';  -- undo the call
    exception when sqlstate 'P0099' then null;
    end;
    v_state := null; v_hint := null;
    insert into ct_result values ('b_admin', 'A', c.fn, left(v_call, 200), v_outcome, v_verdict);
  end loop;
end $$;

-- Controls: the detectors work. A's admin gets A's project overview (not empty, contains A ids),
-- and A's own print token opens A's snapshot.
do $$ declare v jsonb; begin
  perform pg_temp.ct_as('a_admin');
  v := public.get_project_overview((select value from ct_ctx where key = 'a_project')::uuid);
  perform pg_temp.ct_as_postgres();
  if pg_temp.ct_empty(v) then raise exception 'SETUP: A''s admin gets an empty project overview, so "empty" proves nothing'; end if;
  perform pg_temp.ct_as('anon');
  v := public.report_snapshot_by_token((select value from ct_ctx where key = 'a_report')::uuid, 'gl10-token-A');
  perform pg_temp.ct_as_postgres();
  if v is null then raise exception 'SETUP: A''s own print token does not open A''s report'; end if;
end $$;

select pg_temp.ct_run_cases();

-- anon with the print tokens: B's token, a wrong token and no token never open A's report.
do $$ declare v jsonb; tok text; begin
  foreach tok in array array['gl10-token-B', 'gl10-wrong', ''] loop
    perform pg_temp.ct_as('anon');
    v := public.report_snapshot_by_token((select value from ct_ctx where key = 'a_report')::uuid, tok);
    perform pg_temp.ct_as_postgres();
    insert into ct_result values ('anon', 'A', 'report_snapshot_by_token(uuid,text)', 'token ' || quote_literal(tok),
      coalesce(left(v::text, 100), 'null'), case when v is null then 'ok' else 'LEAK' end);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Results
-- ---------------------------------------------------------------------------------------------
select verdict || ' ' || actor || ' -> ' || target || ' ' || object || ' ' || op || ': ' || outcome
from ct_result where verdict not in ('ok', 'ok-trigger') order by verdict, object, op, actor;
select 'summary: ' || string_agg(verdict || ' ' || n, ', ' order by verdict)
from (select verdict, count(*) n from ct_result group by verdict) s;
select 'inserts refused by a trigger before RLS (sqlstate count): ' || coalesce(string_agg(state || ' ' || n, ', ' order by n desc), 'none')
from (select split_part(outcome, ' ', 2) as state, count(*) n from ct_result where verdict = 'ok-trigger' group by 1) s;
do $$ declare n bigint; begin
  select count(*) into n from ct_result where verdict in ('LEAK', 'REVIEW', 'SETUP');
  if n > 0 then raise exception 'cross_tenant: % finding(s), listed above', n; end if;
  raise notice 'cross_tenant: % checks passed', (select count(*) from ct_result);
end $$;

rollback;
