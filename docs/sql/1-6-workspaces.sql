-- PROPOSAL (work package 1.6), not applied. Workspace archiving and the guards around it.
-- To be applied, after approval, as one new migration: <timestamp>_1_6_workspaces.
--
-- Decisions (yours, 22/10/2026):
--   * Archived = read-only and still visible (an "Archived" badge in the UI).
--   * Membership is managed by organisation admins and the workspace's own admins (the existing
--     workspace_members policies already allow both; unchanged).
--   * The organisation's last active workspace can't be archived or deleted.
--
-- How "read-only" works: the two helpers every workspace write rule relies on treat an archived
-- workspace as read-only:
--   * private.workspace_role(ws) caps the role at 'viewer' in an archived workspace, so every
--     has_workspace_role(ws, 'contributor' or higher) check is false there, while
--     is_workspace_member / viewer reads are unchanged;
--   * private.my_workspace_ids(min_role) leaves archived workspaces out whenever min_role is
--     above 'viewer' (the write checks), and keeps them for 'viewer' (the read checks).
-- my_editable_project_ids, can_write, can_edit_project, can_write_decision, can_manage_forum,
-- can_upload_document, the record / defer / reverse / supersede / withdraw decision RPCs and
-- save / submit status report all build on these, so they follow without changes.
--
-- Write paths that don't go through a role (found by auditing every SECURITY DEFINER function
-- and every insert / update / delete policy on tables with workspace_id) get an explicit check:
--   * can_record_decision: the decision maker / forum chair path;
--   * is_forum_chair: chairs of a workspace forum (meetings, decisions);
--   * can_edit_programme_note: the programme manager path;
--   * can_respond_to_offer and the work_item_offers_update policy: issued-to / issued-by;
--   * my_authored_request_ids: request authors (business cases and their versions, sections,
--     options and benefits; document uploads). It is used only by write policies.
-- Deliberately unchanged: personal preferences (dashboards, saved_views, user_favourites),
-- organisation-level data (lookups, settings, resource leave, organisation-level forums), and
-- deleting one's own incomplete document upload.
--
-- Not affected: background jobs (pg_cron health refresh, nightly snapshots, forecast history)
-- and triggers run as the definer and don't use these helpers, so archived workspaces keep
-- being computed. Tested on a live-shaped copy (see the 1.6 report).
--
-- my_workspace_roles() gains an "archived" column (it must be dropped and recreated to change
-- its result; grants are restored as they are today).

-- ===== Tested on a live-shaped copy (22/10/2026) ============================================
-- The live schema (generated from the live catalogue: the repo migrations can't rebuild it, see
-- below) and all live data (8,388 rows), in a throwaway local Postgres 16. Live is Postgres 17.
--
-- Behaviour (42 checks pass): with the demo workspace archived (records kept) and a second,
-- empty workspace added:
--   * reads unchanged (PMO and member see the same projects as before);
--   * my_workspace_roles shows viewer + archived; PMO can't update a project, add a risk, create
--     a portfolio or save a status report; the member can't update a work item;
--   * the decision maker, forum chair, programme manager, offer recipient and request author
--     paths are all closed while archived, and all open again after unarchiving;
--   * PMO can't archive (admins only); archived_by is stamped; the last active workspace can't
--     be archived or deleted; a workspace holding records can't be deleted (foreign keys);
--     membership can't be changed in an archived workspace (it is read-only); an empty
--     workspace can be deleted.
-- Background jobs with the workspace archived: refresh_health_current, the nightly
-- capture_health_snapshots and full_health_refresh_and_check all run and still compute the
-- archived workspace (refreshed rows and snapshots written; the check found 0 mismatches).
-- Archived workspaces keep being computed, by design: their read-only reports stay current.
-- The status_reports_snapshot trigger is unchanged by archiving (users can't submit there).
-- Found, not changed: it skips the snapshot when no one is signed in and vpmo.seeding is unset
-- (NULL logic in its guard), so system-written submissions don't snapshot. Worth a fix later.
--
-- Timings: median of 3 rounds x 25 runs (local, ms), and 10-call averages on live (ms):
--                                          local before  local after  change   live before
--   refresh_health_current(demo org) [job]      200.36       204.50    +2.1%       405.0
--   get_project_overview(DLM) as PMO             17.89        19.31    +7.9%        21.4
--   get_project_overview(CYB) as PMO             19.38        19.14    -1.2%        21.3
--   get_portfolio_overview(DTS) as PMO           39.91        32.49   -18.6%        62.3
--   v_projects list as PMO                        2.61         2.03   -22.2%         4.8
--   get_project_overview(DLM) as member          19.50        19.80    +1.5%        21.6
--   get_portfolio_overview(DTS) as member        34.68        32.60    -6.0%        63.5
--   v_projects list as member                     1.86         1.89    +1.6%         5.5
--   my_editable_project_ids() as member           1.37         1.16   -15.3%         0.5
-- Nothing is more than ~20% slower; local run-to-run noise is about +/-20%. Live "after" is
-- measured the same way once applied.
--
-- Found while building the copy: supabase/migrations/20261012120035_health_current_b.sql is
-- corrupted (line 7 reads `create table public.project_health_current" to`, followed by pasted
-- notes), so the repo migrations can't recreate the live database. Live is correct (it was
-- applied by hand in the SQL editor). Needs its own small fix: replace the file's body with the
-- live definitions. Not part of 1.6.

-- ===== Migration 1_6_workspaces ==============================================================

-- 1. Archive columns
alter table public.workspaces
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;
create index workspaces_archived_by_idx on public.workspaces (archived_by);

-- Stamps who archived, and keeps one active workspace per organisation.
create function private.workspace_lifecycle_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.archived_at is distinct from old.archived_at then
      new.archived_by := case when new.archived_at is null then null else (select auth.uid()) end;
    end if;
    if old.archived_at is null and new.archived_at is not null and not exists (
      select 1 from public.workspaces w
      where w.organisation_id = old.organisation_id and w.id <> old.id and w.archived_at is null
    ) then
      raise exception 'An organisation must keep at least one active workspace' using errcode = '42501';
    end if;
    return new;
  end if;
  -- DELETE: an empty workspace only (records block it through their foreign keys), and never
  -- the last active one, unless the organisation itself is being removed.
  if old.archived_at is null and not exists (
    select 1 from public.workspaces w
    where w.organisation_id = old.organisation_id and w.id <> old.id and w.archived_at is null
  ) and exists (select 1 from public.organisations o where o.id = old.organisation_id) then
    raise exception 'An organisation must keep at least one active workspace' using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function private.workspace_lifecycle_guard() from public, anon;
create trigger workspaces_10_lifecycle_guard before update or delete on public.workspaces
  for each row execute function private.workspace_lifecycle_guard();

-- 2. Is a workspace active (not archived)? True for null (organisation-level rows).
create function private.workspace_is_active(p_ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_ws is null or not exists (
    select 1 from public.workspaces w where w.id = p_ws and w.archived_at is not null
  );
$$;
revoke all on function private.workspace_is_active(uuid) from public, anon;
grant execute on function private.workspace_is_active(uuid) to authenticated, service_role;

-- 3. The role helpers: an archived workspace is read-only.
create or replace function private.workspace_role(p_ws uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when max(r) is null then null
    when exists (select 1 from public.workspaces w where w.id = p_ws and w.archived_at is not null)
      then least(max(r), 'viewer'::public.app_role)
    else max(r)
  end
  from (
    select wm.role as r from public.workspace_members wm
    where wm.workspace_id = p_ws and wm.profile_id = (select auth.uid())
    union all
    select om.role from public.workspaces w
    join public.organisation_members om on om.organisation_id = w.organisation_id
    where w.id = p_ws and om.profile_id = (select auth.uid()) and om.role >= 'pmo'
  ) roles;
$$;

create or replace function private.my_workspace_ids(min_role public.app_role default 'viewer')
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.workspace_id), '{}')
  from (
    select wm.workspace_id from public.workspace_members wm
    where wm.profile_id = (select auth.uid()) and wm.role >= min_role
    union all
    select w.id from public.workspaces w
    join public.organisation_members om on om.organisation_id = w.organisation_id
    where om.profile_id = (select auth.uid()) and om.role >= 'pmo' and om.role >= min_role
  ) x
  where min_role = 'viewer'
     or not exists (select 1 from public.workspaces a where a.id = x.workspace_id and a.archived_at is not null);
$$;

-- 4. Write paths that don't go through a role.
create or replace function private.can_record_decision(p_decision public.decisions)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_decision.workspace_id = any (private.my_workspace_ids('pmo'))
    or (
      p_decision.workspace_id = any (private.my_workspace_ids())
      and private.workspace_is_active(p_decision.workspace_id)
      and (
        exists (
          select 1 from public.resources r
          where r.id = p_decision.decision_maker_id and r.profile_id = (select auth.uid())
        )
        or private.is_forum_chair(p_decision.forum_id)
      )
    );
$$;

create or replace function private.is_forum_chair(p_forum_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.forums f
    join public.resources r on r.id = f.chair_resource_id and r.organisation_id = f.organisation_id
    where f.id = p_forum_id and f.active and r.profile_id = (select auth.uid())
      and private.workspace_is_active(f.workspace_id)
  );
$$;

create or replace function private.can_edit_programme_note(p_programme uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.archived_at is null
       and (p.workspace_id = any (private.my_workspace_ids('pmo'))
            or (p.manager_id = any (private.my_resource_ids())
                and p.workspace_id = any (private.my_workspace_ids())
                and private.workspace_is_active(p.workspace_id)))
    from public.programmes p
    where p.id = p_programme
  ), false);
$$;

create or replace function private.can_respond_to_offer(p_ws uuid, p_issued_to uuid, p_issued_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.workspace_is_active(p_ws)
     and (private.is_own_resource(p_issued_to) or private.is_own_resource(p_issued_by)
          or private.has_workspace_role(p_ws, 'pmo'));
$$;

alter policy work_item_offers_update on public.work_item_offers
  using ((response is null)
    and (select private.workspace_is_active(workspace_id))
    and ((issued_to = any ((select private.my_resource_ids())::uuid[]))
      or (issued_by = any ((select private.my_resource_ids())::uuid[]))
      or (workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]))))
  with check ((select private.workspace_is_active(workspace_id))
    and ((issued_to = any ((select private.my_resource_ids())::uuid[]))
      or (issued_by = any ((select private.my_resource_ids())::uuid[]))
      or (workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]))));

create or replace function private.my_authored_request_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.id), '{}')
  from public.project_requests r
  where (r.created_by = (select auth.uid()) or r.requester_id = any (private.my_resource_ids()))
    and private.workspace_is_active(r.workspace_id);
$$;

-- 5. my_workspace_roles(): the role in each workspace (viewer in an archived one) and whether
-- it is archived, for the UI's controls and badges.
drop function public.my_workspace_roles();
create function public.my_workspace_roles()
returns table (workspace_id uuid, organisation_id uuid, role public.app_role, archived boolean)
language sql
stable
set search_path = ''
as $$
  select w.id, w.organisation_id, private.workspace_role(w.id), w.archived_at is not null
  from public.workspaces w
  where private.workspace_role(w.id) is not null;
$$;
revoke all on function public.my_workspace_roles() from public;
grant execute on function public.my_workspace_roles() to authenticated, service_role;
