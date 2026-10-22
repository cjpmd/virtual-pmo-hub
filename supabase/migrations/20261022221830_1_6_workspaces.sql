-- Work package 1.6: workspace archiving (docs/sql/1-6-workspaces.sql).


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
