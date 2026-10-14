-- Part 1 APPLIED 2026-10-13 (20261013183902_advisor_fk_indexes_health_current). Part 2: APPLIED
-- 14/10/2026 in the SQL editor (20261014105143_drain_health_refresh_search_path). Advisor fixes after Stage 2 (approved 2026-10-13: "apply without a stop if clean").
--
-- Part 1  Covering indexes for the workspace foreign keys on the three *_health_current tables
--         (performance advisor: unindexed_foreign_keys). Applied via apply_migration.
-- Part 2  Pinned search_path for the health refresh drain (security advisor:
--         function_search_path_mutable on private.drain_health_refresh_queue). It is the only
--         function from B without one; every other B function already has set search_path = ''.
--
-- Why Part 2 is not just "alter procedure ... set search_path = ''":
--   PostgreSQL does not allow COMMIT inside a procedure that has a SET clause ("invalid
--   transaction termination"). The drain commits after taking each organisation off the queue,
--   so writers only ever wait for that short delete, and again after each refresh. Pinning the
--   procedure's search_path would break the 5-second job.
--   Instead the queue step moves into a function with a pinned search_path
--   (private.claim_health_refresh), the loop with its two COMMITs moves into the cron job as a
--   DO block (a DO block is not a function, so it has no search_path to pin, and it only calls
--   the two pinned functions), and the procedure is dropped. Behaviour is unchanged: same order,
--   same skip-locked claim, same commit points.
--
-- Part 2 contains DELETE / DROP, which the MCP tools hang on, so it is run in the SQL editor
-- (see the dry run at the end), then recorded in supabase_migrations.schema_migrations.

-- ---- Part 1 (migration: advisor_fk_indexes_health_current) ------------------------------------
create index if not exists project_health_current_project_workspace_idx
  on public.project_health_current (project_id, workspace_id);
create index if not exists programme_health_current_programme_workspace_idx
  on public.programme_health_current (programme_id, workspace_id);
create index if not exists portfolio_health_current_portfolio_workspace_idx
  on public.portfolio_health_current (portfolio_id, workspace_id);

-- ---- Part 2 (migration: drain_health_refresh_search_path; SQL editor) -------------------------
-- Takes the oldest queued organisation off the queue and returns it (null when the queue is
-- empty). Skip-locked, so two overlapping runs never take the same organisation.
create or replace function private.claim_health_refresh()
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.health_refresh_queue q
  where q.organisation_id = (
    select organisation_id from private.health_refresh_queue
    order by queued_at limit 1 for update skip locked)
  returning q.organisation_id;
$$;
revoke all on function private.claim_health_refresh() from public, anon, authenticated;

-- Same job name, so cron.schedule updates the existing job in place.
select cron.schedule('vpmo-health-refresh-queue', '5 seconds', $cmd$do $drain$
declare
  o uuid;
begin
  loop
    o := private.claim_health_refresh();
    exit when o is null;
    commit;
    perform private.refresh_health_current(o);
    commit;
  end loop;
end
$drain$$cmd$);

drop procedure private.drain_health_refresh_queue();

-- ---- Part 2 dry run (SQL editor, rolled back) ---------------------------------------------------
-- begin;
--   <Part 2 statements above, without the cron.schedule call>
--   insert into private.health_refresh_queue (organisation_id)
--     values ('98e086a1-6b01-521a-92e9-21dac759c8f4') on conflict do nothing;
--   select private.claim_health_refresh() as claimed;       -- expect 98e086a1-...
--   select private.claim_health_refresh() as second_claim;  -- expect null
--   select count(*) as old_proc from pg_proc where proname = 'drain_health_refresh_queue'; -- 0
-- rollback;
--
-- After applying: the job's next runs in cron.job_run_details should read 'succeeded', and an
-- organisation put on the queue should be gone within ~5 seconds.
