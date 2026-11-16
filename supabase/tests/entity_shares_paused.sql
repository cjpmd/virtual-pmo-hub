-- GL-10 follow-up: new partner shares are paused (docs/sql/gl-10-pause-entity-shares.sql). Needs
-- supabase/seed/reports_demo.sql (its partner share). Runs in one transaction that is rolled back.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/entity_shares_paused.sql
\set ON_ERROR_STOP 1
begin;
create temp table passed (n integer);
insert into passed values (0);
create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update passed set n = n + 1;
end $$;
create function pg_temp.raises(name text, sql text, state text, hint text default null) returns void language plpgsql as $$
declare v_state text; v_hint text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    perform pg_temp.ok(name || ' [' || v_state || coalesce(' ' || v_hint, '') || ']', v_state = state and (hint is null or v_hint = hint));
    return;
  end;
  raise exception 'FAIL: % (no error)', name;
end $$;

create temp table t as
select s.id as share_id, s.organisation_id, s.workspace_id, s.entity_type, s.entity_id, s.partner_organisation_id
from public.entity_shares s order by s.created_at limit 1;
grant select on t to service_role;
select pg_temp.ok('setup: the seed''s share exists', (select count(*) from t) = 1);

select pg_temp.ok('shipped paused', (select enabled from private.entity_sharing_settings) is false);
select pg_temp.raises('a new share is refused, even as the owner',
  $$insert into public.entity_shares (organisation_id, workspace_id, entity_type, entity_id, partner_organisation_id)
    select organisation_id, workspace_id, 'project', (select p.id from public.projects p where p.organisation_id = t.organisation_id limit 1),
      partner_organisation_id from t$$, '42501', 'sharing_paused');
select pg_temp.raises('and as the service role',
  $$select set_config('role', 'service_role', true);
    insert into public.entity_shares (organisation_id, workspace_id, entity_type, entity_id, partner_organisation_id)
    select organisation_id, workspace_id, 'project', (select p.id from public.projects p where p.organisation_id = t.organisation_id limit 1),
      partner_organisation_id from t$$, '42501', 'sharing_paused');
reset role;

-- Existing shares are unchanged: still there, still give the partner the shared pack (reports_phase3
-- checks the content), and can still be edited or revoked.
select pg_temp.ok('existing shares stay', (select count(*) from public.entity_shares) >= 1);
with u as (update public.entity_shares set hidden_block_keys = hidden_block_keys where id = (select share_id from t) returning 1)
select pg_temp.ok('an existing share can be updated', (select count(*) from u) = 1);
delete from public.entity_shares where id = (select share_id from t);
select pg_temp.ok('and revoked', not exists (select 1 from public.entity_shares where id = (select share_id from t)));

select pg_temp.ok('nobody signed in can read or change the switch',
  not has_table_privilege('authenticated', 'private.entity_sharing_settings', 'select')
  and not has_table_privilege('authenticated', 'private.entity_sharing_settings', 'update')
  and not has_table_privilege('anon', 'private.entity_sharing_settings', 'select'));

-- Turned back on (by hand, in the SQL editor), shares can be created again.
update private.entity_sharing_settings set enabled = true, changed_at = now();
with i as (insert into public.entity_shares (organisation_id, workspace_id, entity_type, entity_id, partner_organisation_id)
  select organisation_id, workspace_id, entity_type, entity_id, partner_organisation_id from t returning 1)
select pg_temp.ok('with the switch on, a share can be created again', (select count(*) from i) = 1);

select 'entity_shares_paused: ' || n || ' checks passed' from passed;
rollback;
