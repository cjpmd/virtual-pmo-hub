-- GL-11b: full organisation export (docs/design/account-closure.md §2.5, docs/sql/gl-11b-organisation-export.sql).
-- The edge function export-organisation reads every organisation table as the service role and
-- writes one JSON file per table plus a manifest into a zip in the private bucket "exports"
-- (exports/<org>/<timestamp>.zip), then returns a 24-hour signed URL. Zips are removed after 7
-- days (the edge function's cleanup mode, called daily by vpmo-export-cleanup).
-- Works while the organisation is read-only or pending deletion: the only write is the audit
-- row, and audit_log is exempt from the read-only trigger.
-- Additive only: one bucket, four functions and one cron job. No new audit action (the audit
-- row reuses 'update' with detail.event, so audit_log_action_check is untouched); no data changes.

-- 1. The bucket. Private, zips only, 500 MB per object. No storage.objects policy names it, so
--    signed-in users can't list, read or write it; only the service role (the edge function)
--    uploads and signs URLs. private.purge_organisation's Storage check and purge-organisations'
--    Storage walk cover it like every bucket (paths start with the organisation id).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 524288000, array['application/zip'])
on conflict (id) do nothing;

-- 2. Audit: no new action. audit_log.action is a fixed list and widening it means dropping its
--    check constraint, so (as GL-11 did for deletion requests) an export is recorded as
--    action 'update' on 'organisations' with detail.event = 'organisation.exported'.

-- 3. What is exported. Every public base table with organisation_id (generated from the catalog,
--    as private.purge_organisation does, so new tables are included without a change here), plus
--    the organisation row itself and the profiles of its current members (names and emails: the
--    organisation is the controller). Rows are ordered by primary key so pages are stable.
--    Left out: secrets (columns named token_hash, e.g. organisation_invites), private tables
--    (health_refresh_queue, health_check_log: internal job state), the webhook event tables (no
--    organisation) and auth data.
create function private.organisation_export_tables()
returns table (table_name text, order_by text[], omit text[])
language sql
stable
security definer
set search_path to ''
as $$
  select c.relname::text,
    coalesce((select array_agg(a.attname::text order by k.ord)
              from pg_index i
              cross join lateral unnest(i.indkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
              where i.indrelid = c.oid and i.indisprimary), array['ctid']),
    coalesce((select array_agg(a.attname::text order by a.attnum) from pg_attribute a
              where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                and a.attname in ('token_hash')), '{}')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (c.relname in ('organisations', 'profiles')
         or exists (select 1 from pg_attribute a where a.attrelid = c.oid
                    and a.attname = 'organisation_id' and not a.attisdropped))
  order by c.relname;
$$;
revoke execute on function private.organisation_export_tables() from public, anon, authenticated, service_role;

-- The WHERE clause for a table: the organisation row itself, its current members' profiles, or
-- organisation_id. Table names come only from private.organisation_export_tables().
create function private.organisation_export_filter(p_table text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case p_table
    when 'organisations' then 'x.id = $1'
    when 'profiles' then 'x.id in (select m.profile_id from public.organisation_members m where m.organisation_id = $1)'
    else 'x.organisation_id = $1' end;
$$;
revoke execute on function private.organisation_export_filter(text) from public, anon, authenticated, service_role;

-- 4. The plan: tables with their row counts, the schema version and what is left out. Service role.
create function public.organisation_export_plan(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  t record;
  v_n bigint;
  v_tables jsonb := '[]'::jsonb;
  v_version text;
begin
  if not exists (select 1 from public.organisations o where o.id = p_organisation_id) then
    raise exception 'No such organisation.' using errcode = 'P0002', hint = 'no_organisation';
  end if;
  for t in select * from private.organisation_export_tables() loop
    execute format('select count(*) from public.%I x where %s', t.table_name,
                   private.organisation_export_filter(t.table_name))
      into v_n using p_organisation_id;
    v_tables := v_tables || jsonb_build_object('table', t.table_name, 'rows', v_n,
                                               'order_by', to_jsonb(t.order_by), 'omitted_columns', to_jsonb(t.omit));
  end loop;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select max(version) from supabase_migrations.schema_migrations' into v_version;
  end if;
  return jsonb_build_object(
    'organisation_id', p_organisation_id,
    'schema_version', v_version,
    'generated_at', now(),
    'tables', v_tables,
    'not_exported', jsonb_build_array(
      'Secrets: token_hash columns (invitation tokens)',
      'Private job tables (health_refresh_queue, health_check_log)',
      'Webhook event logs (stripe_webhook_events, resend_webhook_events)',
      'Sign-in data (auth schema)',
      'Storage files: listed in storage_objects, not included'));
end;
$$;

revoke execute on function public.organisation_export_plan(uuid) from public, anon, authenticated;
grant execute on function public.organisation_export_plan(uuid) to service_role;

-- 5. One page of one table, as a JSON array of rows (secrets removed). Service role.
create function public.organisation_export_rows(p_organisation_id uuid, p_table text, p_offset integer default 0, p_limit integer default 1000)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  t record;
  v_rows jsonb;
begin
  select * into t from private.organisation_export_tables() e where e.table_name = p_table;
  if t.table_name is null then
    raise exception 'Not an exported table: %', p_table using errcode = '22023', hint = 'not_exported';
  end if;
  if p_offset < 0 or p_limit < 1 or p_limit > 5000 then
    raise exception 'Page out of range.' using errcode = '22023', hint = 'bad_page';
  end if;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) from (select * from public.%I x where %s order by %s offset $3 limit $4) x',
    t.table_name, private.organisation_export_filter(t.table_name),
    (select string_agg(format('x.%I', c), ', ') from unnest(t.order_by) c))
    into v_rows using p_organisation_id, t.omit, p_offset, p_limit;
  return v_rows;
end;
$$;
revoke execute on function public.organisation_export_rows(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.organisation_export_rows(uuid, text, integer, integer) to service_role;

-- 6. Start an export, as the signed-in admin (the edge function calls this with the caller's
--    JWT before any service-role read). Admins of the organisation only; works while read-only
--    or pending deletion. One export every 2 minutes per organisation. Records the audit row.
create function public.start_organisation_export(p_organisation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not (p_organisation_id = any (private.my_org_ids('admin'))) then
    raise exception 'Only organisation admins can export all data.' using errcode = '42501', hint = 'not_admin';
  end if;
  if exists (select 1 from public.audit_log a
             where a.organisation_id = p_organisation_id and a.action = 'update'
               and a.entity_table = 'organisations' and a.entity_id = p_organisation_id
               and a.detail ->> 'event' = 'organisation.exported'
               and a.created_at > now() - interval '2 minutes') then
    raise exception 'An export was started in the last two minutes. Please wait and try again.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.audit_log (organisation_id, actor_id, action, entity_table, entity_id, detail)
  values (p_organisation_id, v_uid, 'update', 'organisations', p_organisation_id,
          jsonb_build_object('event', 'organisation.exported', 'value', 'Full data export (zip)'));
  return now();
end;
$$;
revoke execute on function public.start_organisation_export(uuid) from public, anon;
grant execute on function public.start_organisation_export(uuid) to authenticated;

-- 7. The daily clean-up: calls export-organisation in cleanup mode, which removes zips older
--    than 7 days through the Storage API (Storage objects can't be deleted in SQL). Dynamic SQL
--    so it compiles where pg_net or Vault aren't installed (local). One-off on production, run by
--    you in the SQL editor after deploying export-organisation:
--      select vault.create_secret('https://xvdlmtkzfmbcegkmampz.supabase.co/functions/v1/export-organisation', 'organisation_export_url');
--    The service role key is read from the existing report_notify_service_key secret.
create function private.run_export_cleanup()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_key text;
  v_request bigint;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'organisation_export_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'report_notify_service_key';
  if v_url is null or v_key is null then
    raise warning 'export-organisation: Vault secrets organisation_export_url / report_notify_service_key are not set';
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 60000)'
    into v_request
    using v_url, jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
          '{"mode":"cleanup"}'::jsonb;
  return v_request;
end;
$$;
revoke execute on function private.run_export_cleanup() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vpmo-export-cleanup', '40 3 * * *', 'select private.run_export_cleanup()');
  end if;
end $$;
