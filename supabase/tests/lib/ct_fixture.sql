-- Shared GL-10 fixture: users, organisations A (the seeded one with most projects) and B (created
-- here), both writable, and the generic filler that gives each a row in every RLS table with
-- organisation_id (section 1 of cross_tenant.sql). Included with \ir by cross_tenant.sql and
-- organisation_purge.sql, inside their own transaction. Never run it on production.

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
    -- GL-11: a cancelled request (a pending one would make the organisation read-only).
    ('organisation_deletions', $s$insert into public.organisation_deletions (organisation_id, requested_at, purge_after, cancelled_at)
       values (%1$L, now() - interval '2 days', now() + interval '28 days', now() - interval '1 day')$s$),
    ('assumptions',$s$insert into public.assumptions (organisation_id, workspace_id, project_id, assumption, ref)
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
