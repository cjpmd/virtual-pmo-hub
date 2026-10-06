-- Snapshot of the three health views, as several users through RLS and as the owner.
-- Run before and after changing a view definition and diff: any difference is a change in
-- the health the app shows. Rolled back.
--   psql "$DB_URL" -At -f supabase/tests/health_views_snapshot.sql > before.txt
begin;
create temp table snap_users (label text, id uuid);
insert into snap_users
select 'member-' || m.role || '-' || row_number() over (partition by m.role order by m.profile_id), m.profile_id
from (select distinct on (profile_id) profile_id, role from public.organisation_members order by profile_id, role desc) m;
grant select on snap_users to authenticated;

create function pg_temp.snap(p_label text) returns setof text language plpgsql as $f$
declare uid uuid := (select id from snap_users where label = p_label);
begin
  if uid is not null then
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
  return query select p_label || ' project ' || (to_jsonb(h) - 'project_id')::text || ' ' || h.project_id from public.v_project_health h order by h.project_id;
  return query select p_label || ' programme ' || (to_jsonb(h) - 'programme_id')::text || ' ' || h.programme_id from public.v_programme_health h order by h.programme_id;
  return query select p_label || ' portfolio ' || (to_jsonb(h) - 'portfolio_id')::text || ' ' || h.portfolio_id from public.v_portfolio_health h order by h.portfolio_id;
  if uid is not null then reset role; end if;
end $f$;

select pg_temp.snap('owner');
select pg_temp.snap(label) from snap_users order by label;
rollback;
