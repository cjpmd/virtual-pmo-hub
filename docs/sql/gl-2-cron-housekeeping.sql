-- GL-2 Cron housekeeping (docs/go-live-plan.md). PROPOSAL: not applied.
--
-- Evidence (live project xvdlmtkzfmbcegkmampz, read-only, 09/11/2026)
-- ---------------------------------------------------------------------
-- cron.job_run_details: 484,307 rows, 156 MB, oldest 06/10/2026. 363,772 rows are older than
--   7 days. 17,252 rows in the last 24 h. 483,800 of the rows (89 MB of command and message
--   text alone) are job 6, vpmo-health-refresh-queue. Every other job together: ~500 rows.
--   Owned by supabase_admin; postgres can DELETE but can't VACUUM FULL it, so the file won't
--   shrink: autovacuum makes the freed space reusable and the size then stays flat.
--   Only index: the primary key on runid (increasing), so batches walk runid from the oldest.
-- net._http_response: 0 rows, 32 kB. pg_net 0.20.4 already purges it (pg_net.ttl = 6 hours),
--   so nothing is proposed for it.
-- cron settings: cron.timezone = GMT (schedules are UTC), cron.log_run = on,
--   cron.use_background_workers = off (every run opens a libpq connection to localhost).
--   These are server settings we can't change from SQL on Supabase.
--
-- Queue drain (job 6, last 7 days): 120,098 runs, average 3.9 ms, p99 24 ms, max 11.1 s
--   (two runs over 10 s, on 05/11 and 03/11, the same hours as its only failures: "job startup
--   timeout", i.e. pg_cron couldn't get a connection, as in the 21/10 capacity stalls).
--   Duration buckets: 112,382 runs < 10 ms (empty queue), 6,581 at 10–25 ms, 686 at 25–50 ms,
--   449 over 50 ms, 25 over 500 ms. So about 94% of runs find nothing to do.
--   Queue now: 0 rows.
--
-- What writes to private.health_refresh_queue: one row per organisation (primary key, on
--   conflict do nothing), from private.health_current_enqueue(), an AFTER trigger
--   (*_zz_health_enqueue) on 25 tables: benefit_measure_targets, benefit_measurements,
--   benefit_measures, benefit_periods, benefit_projects, benefit_reviews, benefits,
--   budget_baselines, capabilities, capability_projects, divergence_justifications,
--   financial_periods, financial_values, health_snapshots, issues, lifecycle_phases,
--   milestones, organisations, portfolios, programmes, projects, risks, status_reports,
--   work_item_checklist_items, work_items (same list as src/services/health-pending.ts).
--   private.claim_health_refresh() pops one organisation; the job's DO block refreshes it.
--
-- How fast health must appear: only the writer waits. After a write to one of those tables the
--   client shows "Updating health…" and polls max(computed_at) every 2 s until it moves
--   (hooks/use-health-refresh.ts); nobody else is told. Copy says "a few seconds".
--   Wait after a write = time to the next run (uniform 0..interval) + refresh (p99 ~25 ms) +
--   up to 2 s for the poll to notice:
--     interval   runs/day   rows kept (7 d)   wait: mean / worst    connections/day
--      5 s        17,280       ~121k (~39 MB)     ~3.5 s / ~7 s         17,280
--     10 s         8,640        ~60k (~20 MB)     ~6 s  / ~12 s          8,640
--     15 s         5,760        ~40k (~13 MB)     ~8.5 s / ~17 s         5,760
--     30 s         2,880        ~20k  (~7 MB)     ~16 s / ~32 s          2,880
--   (rows-kept sizes scale from today's ~330 bytes per job-6 row.)
--
-- Recommendation: 10 seconds. Pruning alone stops the growth; the interval only trades
--   writer latency against background load. At 10 s the "Updating health…" wait stays within
--   "a few seconds" for most writes (worst case ~12 s), and pg_cron opens half as many
--   connections, which matters on the current compute (the 21/10 stalls and the startup
--   timeouts above). 15 s is acceptable if you'd rather favour load; 30 s feels broken to a
--   person waiting on the spinner. I'm not proposing a trigger-driven schedule: pg_cron 1.6
--   has no one-shot sub-minute jobs, every run is logged whether or not it does work (so
--   "skip when empty" saves no rows), and pg_net or dynamic cron.schedule from a trigger
--   would put cron/HTTP work inside every user write.
--
-- Prune time: pg_cron schedules in GMT and has no per-job time zone, so the job is scheduled
--   at 02:30 and 03:30 UTC and only works when it's 03:xx in Europe/London (as
--   vpmo-health-refresh-london-midnight does for midnight). That's 03:30 London all year,
--   clear of the 02:15, 02:40 and Sunday 03:45 jobs.
--
-- Additive only. The migration deletes nothing when applied; the scheduled job deletes run
-- history older than 7 days from its first 03:30 run. The one-off backlog delete is in its own
-- section at the end, for you to run in the SQL editor.

-- =============================================================================================
-- Section A: migration (supabase/migrations/<timestamp>_gl_2_cron_housekeeping.sql)
-- =============================================================================================

-- One bounded batch of run history older than p_keep, oldest first (walks the runid primary
-- key, so it stops after p_batch matches). Returns the number of rows deleted. Each batch is its
-- own short statement; row locks are only on the old rows being removed, so pg_cron's inserts
-- of new runs never wait on it. Caller's rights: only the cron job (postgres) and the SQL
-- editor call it.
create function private.prune_cron_history_batch(
  p_keep interval default interval '7 days',
  p_batch integer default 10000
)
returns integer
language sql
volatile
set search_path = ''
as $$
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
  select count(*)::integer from gone;
$$;
revoke all on function private.prune_cron_history_batch(interval, integer) from public, anon, authenticated;

do $$
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

    -- Queue drain: 5 s -> 10 s (see the recommendation above). Command unchanged.
    perform cron.alter_job(
      job_id := (select jobid from cron.job where jobname = 'vpmo-health-refresh-queue'),
      schedule := '10 seconds'
    );
  end if;
end $$;

-- =============================================================================================
-- Section B: one-off backlog delete. Run by hand in the SQL editor, NOT part of the migration.
-- =============================================================================================
-- Run AFTER section A is applied (it uses the function). Deletes the ~364k rows older than
-- 7 days in batches of 50,000. Run the select repeatedly until it returns 0 (about 8 runs);
-- each is a separate short transaction. If you skip this, the first 03:30 job clears it
-- instead (50 batches of 10,000 cover the backlog).
--
--   select private.prune_cron_history_batch(p_batch => 50000);
--
-- Then check:
--
--   select count(*) as rows,
--          min(start_time) as oldest,
--          pg_size_pretty(pg_total_relation_size('cron.job_run_details')) as size
--   from cron.job_run_details;
--
-- Expect oldest within 7 days. The size won't drop (no VACUUM FULL: the table is owned by
-- supabase_admin); it should stay roughly flat from here as freed space is reused.

-- =============================================================================================
-- Rollback (if wanted): additive, no data involved.
-- =============================================================================================
--   select cron.unschedule('vpmo-prune-cron-history');
--   select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'vpmo-health-refresh-queue'),
--                         schedule := '5 seconds');
--   (the function can stay; removing it would need a drop.)
