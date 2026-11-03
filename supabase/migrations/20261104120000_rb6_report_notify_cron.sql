-- Report builder (RB-39a, amended): the report-notify edge function is called by pg_cron +
-- pg_net every 15 minutes, with the URL and the service role key read from Supabase Vault —
-- no key in SQL or in the migration. One-off, per project (docs/report-builder-handover.md):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/report-notify', 'report_notify_url');
--   select vault.create_secret('<service role key>', 'report_notify_service_key');
-- Without both secrets (or without pg_net / Vault, e.g. a plain local Postgres) the job does
-- nothing. It only calls the function when a notice is waiting. Additive only.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- Dynamic SQL so the function compiles where pg_net or Vault aren't installed.
create function private.trigger_report_notify()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
  v_request bigint;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  if not exists (select 1 from public.report_notifications where sent_at is null) then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'report_notify_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_key using 'report_notify_service_key';
  if v_url is null or v_key is null then
    raise warning 'report-notify: Vault secrets report_notify_url / report_notify_service_key are not set';
    return null;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 10000)'
    into v_request
    using v_url, jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'), '{}'::jsonb;
  return v_request;
end;
$$;
revoke all on function private.trigger_report_notify() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vpmo-report-notify', '*/15 * * * *', 'select private.trigger_report_notify()');
  end if;
end $$;
