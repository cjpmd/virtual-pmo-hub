# SQL editor runbook (14/10/2026)

Run in the Supabase SQL editor (project `xvdlmtkzfmbcegkmampz`), one block at a time, in order.
These contain DELETE / DROP, which the MCP tool cannot run. Ids are exact; nothing matches by text.

Ids used:

| What | Id |
|---|---|
| Demo organisation | `98e086a1-6b01-521a-92e9-21dac759c8f4` |
| CAIG test justification | `39641248-0c7d-404c-93cb-1ea40d4dc5ea` |
| ZZT test project (outsider org) | `65ef4f47-8173-4b0a-8db2-462387d7ae6a` |
| ZZ test portfolio (outsider org) | `05a911b6-b465-46ce-9445-6a44ae480bff` |
| Outsider organisation | `a98e388d-97fb-4a5a-a83e-f9ee88dbaaaf` |

---

## Job 1. Drain fix (pinned search_path)

From Part 2 of `docs/sql/advisor-fixes-drain-search-path-fk-indexes.sql`. Done in two applies:
first the new function and cron command (C1), then, once the cron runs are confirmed
successful (D1), the old procedure is dropped (C2). If D1 shows failures, run the fallback (F).

### 1A. Check before

```sql
select
  (select count(*) from pg_proc where proname = 'claim_health_refresh')       as new_fn,   -- expect 0
  (select count(*) from pg_proc where proname = 'drain_health_refresh_queue') as old_proc, -- expect 1
  (select command from cron.job where jobname = 'vpmo-health-refresh-queue')  as command;  -- expect: call private.drain_health_refresh_queue()
```

### 1B. Dry run (rolled back)

```sql
begin;
create or replace function private.claim_health_refresh()
returns uuid language sql volatile security definer set search_path = '' as $$
  delete from private.health_refresh_queue q
  where q.organisation_id = (
    select organisation_id from private.health_refresh_queue
    order by queued_at limit 1 for update skip locked)
  returning q.organisation_id;
$$;
insert into private.health_refresh_queue (organisation_id)
  values ('98e086a1-6b01-521a-92e9-21dac759c8f4') on conflict do nothing;
select private.claim_health_refresh() as claimed;  -- expect 98e086a1-6b01-521a-92e9-21dac759c8f4
rollback;
```

Expected: one row, `claimed = 98e086a1-6b01-521a-92e9-21dac759c8f4`. After the rollback, 1A
still shows `new_fn = 0`.

### 1C1. Apply: new function and cron command

```sql
begin;
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
commit;
```

### 1D1. Check after C1 (wait about 30 seconds first)

```sql
-- Last runs of the refresh job: expect 5 rows, all 'succeeded', start times about 5 s apart,
-- and command starting "do $drain$".
select d.status, d.start_time, left(d.command, 12) as command, d.return_message
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'vpmo-health-refresh-queue'
order by d.start_time desc
limit 5;
```

```sql
-- computed_at advancing: note the value, queue the demo organisation, wait about 10 seconds,
-- run the select again. Expect a later computed_at and an empty queue.
select max(computed_at) as computed_at,
       (select count(*) from private.health_refresh_queue) as queued
from public.project_health_current
where organisation_id = '98e086a1-6b01-521a-92e9-21dac759c8f4';

insert into private.health_refresh_queue (organisation_id)
values ('98e086a1-6b01-521a-92e9-21dac759c8f4') on conflict do nothing;
```

### 1C2. Apply: drop the old procedure (only when 1D1 is all 'succeeded')

```sql
drop procedure private.drain_health_refresh_queue();
```

### 1D2. Check after C2

```sql
select
  (select count(*) from pg_proc where proname = 'claim_health_refresh')       as new_fn,   -- expect 1
  (select count(*) from pg_proc where proname = 'drain_health_refresh_queue') as old_proc, -- expect 0
  (select left(command, 12) from cron.job where jobname = 'vpmo-health-refresh-queue') as command; -- expect: do $drain$
```

### 1F. Fallback (only if 1D1 shows 'failed' runs, and only BEFORE C2)

Never run this after 1C2: the old procedure no longer exists, so every run fails. (On
14/10/2026 it was run after C2; every run failed from 10:53 to 10:56 UTC until the C1 cron
command was restored. Queued refreshes then ran: 0 mismatches.)

```sql
select cron.schedule('vpmo-health-refresh-queue', '5 seconds', 'call private.drain_health_refresh_queue()');
```

---

## Job 2. CAIG test justification

The audit log shows this row (`39641248-0c7d-404c-93cb-1ea40d4dc5ea`, "Test (Stage 1 header
check) …", on CAIG) was already deleted on 12/10/2026 at 11:58 UTC. The blocks below confirm
that; the delete is harmless if it is already gone (0 rows).

### 2A. Check before

```sql
select id, project_id, created_at, left(text, 60) as text
from public.divergence_justifications
where id = '39641248-0c7d-404c-93cb-1ea40d4dc5ea';  -- expect 0 rows (already deleted)
```

### 2C. Apply (only if 2A returned a row)

```sql
delete from public.divergence_justifications
where id = '39641248-0c7d-404c-93cb-1ea40d4dc5ea';  -- expect DELETE 1 (or DELETE 0 if already gone)
```

### 2D. Check after

```sql
select count(*) as remaining
from public.divergence_justifications
where id = '39641248-0c7d-404c-93cb-1ea40d4dc5ea';  -- expect 0
```

---

## Job 3. ZZT test project and the test portfolio (outsider organisation)

Tables touched: `public.projects` (1 row) and `public.portfolios` (1 row). Checked on 14/10:
of the 52 foreign keys that reference projects or portfolios, only `projects.portfolio_id`
points at either id. No milestones, tasks, reports, risks, financials, snapshots, favourites or
stored health rows exist for ZZT. The delete fires the usual triggers: `audit_log` gets 2
'delete' rows, and the outsider organisation is queued for a health refresh.
The 4 existing `audit_log` rows for these ids (insert and archive) are kept as the audit trail.

### 3A. Check before

```sql
select 'project' as kind, id, code as name, archived_at is not null as archived
from public.projects where id = '65ef4f47-8173-4b0a-8db2-462387d7ae6a'
union all
select 'portfolio', id, name, archived_at is not null
from public.portfolios where id = '05a911b6-b465-46ce-9445-6a44ae480bff';
-- expect 2 rows: project ZZT archived = true; portfolio "ZZ Test portfolio, delete me" archived = true
```

### 3B. Dry run (rolled back)

```sql
begin;
delete from public.projects   where id = '65ef4f47-8173-4b0a-8db2-462387d7ae6a';  -- expect DELETE 1
delete from public.portfolios where id = '05a911b6-b465-46ce-9445-6a44ae480bff';  -- expect DELETE 1
rollback;
```

Expected: both deletes report 1 row and no foreign-key error. After the rollback, 3A still
returns 2 rows.

### 3C. Apply

```sql
begin;
delete from public.projects   where id = '65ef4f47-8173-4b0a-8db2-462387d7ae6a';
delete from public.portfolios where id = '05a911b6-b465-46ce-9445-6a44ae480bff';
commit;
```

### 3D. Check after

```sql
select
  (select count(*) from public.projects   where id = '65ef4f47-8173-4b0a-8db2-462387d7ae6a') as project,   -- expect 0
  (select count(*) from public.portfolios where id = '05a911b6-b465-46ce-9445-6a44ae480bff') as portfolio, -- expect 0
  (select count(*) from public.projects   where organisation_id = 'a98e388d-97fb-4a5a-a83e-f9ee88dbaaaf') as outsider_projects; -- expect 0
```

---

When all three are done, tell me: I will check the drain runs and computed_at again, rerun the
security advisor, and confirm ZZT and the CAIG justification are gone.
