-- Health refresh drain with a pinned search_path (security advisor: function_search_path_mutable).
-- Applied in the SQL editor on 14/10/2026 (docs/sql/sql-editor-runbook.md, job 1); proposal and
-- reasoning in docs/sql/advisor-fixes-drain-search-path-fk-indexes.sql. A SET clause would forbid
-- COMMIT in a procedure, so the claim step is a pinned function and the commit loop is the cron
-- job's DO block.
create or replace function private.claim_health_refresh()
returns uuid language sql volatile security definer set search_path = '' as $$
  delete from private.health_refresh_queue q
  where q.organisation_id = (
    select organisation_id from private.health_refresh_queue
    order by queued_at limit 1 for update skip locked)
  returning q.organisation_id;
$$;
revoke all on function private.claim_health_refresh() from public, anon, authenticated;

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
