-- GL-2 Cron housekeeping (docs/go-live-plan.md; proposal and evidence in
-- docs/sql/gl-2-cron-housekeeping.sql, section A, approved 09/11/2026).
-- - private.prune_cron_history_batch: deletes one bounded batch of cron.job_run_details older
--   than 7 days, oldest runid first.
-- - vpmo-prune-cron-history: daily at 03:30 Europe/London (scheduled 02:30 and 03:30 UTC,
--   works only when London's hour is 3), committing after each batch, at most 50 batches.
-- - vpmo-health-refresh-queue: 5 seconds -> 10 seconds, command unchanged.
-- Additive: deletes nothing when applied. The backlog was cleared by hand on 09/11/2026.

create function private.prune_cron_history_batch(
  p_keep interval default interval '7 days',
  p_batch integer default 10000
)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
-- plpgsql so the migration also applies where pg_cron isn't installed (local Postgres).
declare
  v_deleted integer;
begin
  with doomed as (
    select d.runid
    from cron.job_run_details d
    where d.start_time < now() - p_keep
    order by d.runid
    limit greatest(p_batch, 1)
  ), gone as (
    delete from cron.job_run_details d
    using doomed
    where d.runid = doomed.runid
    returning 1
  )
  select count(*)::integer into v_deleted from gone;
  return v_deleted;
end;
$$;
revoke all on function private.prune_cron_history_batch(interval, integer) from public, anon, authenticated;

do $mig$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Daily prune, 03:30 Europe/London. Commits after each batch so no transaction is long;
    -- stops after 50 batches (500k rows) so a backlog can't keep it running for long.
    perform cron.schedule('vpmo-prune-cron-history', '30 2,3 * * *', $cmd$do $prune$
declare
  n integer;
  i integer := 0;
begin
  if extract(hour from now() at time zone 'Europe/London') <> 3 then
    return;
  end if;
  loop
    n := private.prune_cron_history_batch();
    commit;
    i := i + 1;
    exit when n = 0 or i >= 50;
  end loop;
end
$prune$$cmd$);

    -- Queue drain: 5 s -> 10 s (docs/sql/gl-2-cron-housekeeping.sql). Command unchanged.
    perform cron.alter_job(
      job_id := (select jobid from cron.job where jobname = 'vpmo-health-refresh-queue'),
      schedule := '10 seconds'
    );
  end if;
end $mig$;
