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

\ir lib/ct_fixture.sql


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
union all select 'a_org_name', (select replace(name, '''', '''''') from public.organisations where id = pg_temp.ct_org('A'))
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
  -- GL-11. The name is A's real one (read as the owner) so only the admin check can refuse it.
  ('request_organisation_deletion(uuid,text)', $c$select public.request_organisation_deletion('{a_org}', '{a_org_name}')$c$, 'empty', null),
  ('cancel_organisation_deletion(uuid)', $c$select public.cancel_organisation_deletion('{a_org}')$c$, 'empty', null),
  ('close_my_account(text)', $c$select public.close_my_account('gl10-a-admin@example.invalid')$c$, 'empty',
   'takes no ids: closes only the caller''s own account, and only with the caller''s own email'),
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
