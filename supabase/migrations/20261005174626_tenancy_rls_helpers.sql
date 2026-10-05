-- Virtual PMO: role helpers, tenant guard, and RLS for the tenancy tables.
-- Helpers are security definer (they read membership tables the caller may not see),
-- stable, and pinned to an empty search_path.

create function private.org_role(p_org uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.organisation_members m
  where m.organisation_id = p_org and m.profile_id = (select auth.uid());
$$;

create function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.org_role(p_org) is not null;
$$;

create function private.has_org_role(p_org uuid, p_min public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.org_role(p_org) >= p_min, false);
$$;

-- Effective workspace role: the workspace membership role, raised to the organisation
-- role when that is pmo or admin (org pmo/admin act in every workspace).
create function private.workspace_role(p_ws uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select max(r) from (
    select wm.role as r from public.workspace_members wm
    where wm.workspace_id = p_ws and wm.profile_id = (select auth.uid())
    union all
    select om.role from public.workspaces w
    join public.organisation_members om on om.organisation_id = w.organisation_id
    where w.id = p_ws and om.profile_id = (select auth.uid()) and om.role >= 'pmo'
  ) roles;
$$;

create function private.is_workspace_member(p_ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.workspace_role(p_ws) is not null;
$$;

create function private.has_workspace_role(p_ws uuid, p_min public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.workspace_role(p_ws) >= p_min, false);
$$;

-- True when the caller shares an organisation with the given profile (to show names).
create function private.shares_org_with(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisation_members mine
    join public.organisation_members theirs on theirs.organisation_id = mine.organisation_id
    where mine.profile_id = (select auth.uid()) and theirs.profile_id = p_profile
  );
$$;

-- "Today" in the organisation's time zone. Every derived status uses this. A session may
-- pin it with `set vpmo.today = 'YYYY-MM-DD'` (used by the health parity test; PostgREST
-- clients cannot set session settings).
create function private.org_today(p_org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('vpmo.today', true), '')::date,
    (select (now() at time zone coalesce(o.settings -> 'regional' ->> 'timeZone', 'Europe/London'))::date
     from public.organisations o where o.id = p_org));
$$;

revoke all on all functions in schema private from public, anon;
-- Functions created later in `private` are not executable by default; each migration grants
-- what callers need explicitly.
alter default privileges in schema private revoke execute on functions from public;
grant execute on function private.next_ref(uuid, text), private.working_days_between(date, date),
  private.default_org_settings(), private.valid_org_settings(jsonb)
  to authenticated, service_role;
grant execute on function private.org_role(uuid), private.is_org_member(uuid), private.has_org_role(uuid, public.app_role),
  private.workspace_role(uuid), private.is_workspace_member(uuid), private.has_workspace_role(uuid, public.app_role),
  private.shares_org_with(uuid), private.org_today(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tenant guard. Fills organisation_id / workspace_id (and project_id where the
-- table has one) from the parent row, and refuses to let them change.
-- Trigger arguments are (column, parent_table) pairs in priority order; the
-- first non-null column wins. With no arguments the row's own organisation_id
-- is kept and only immutability is enforced.
-- ---------------------------------------------------------------------------
create function private.tenant_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  j jsonb := to_jsonb(new);
  parent jsonb;
  patch jsonb := '{}'::jsonb;
  i integer := 0;
  col text;
  tbl text;
begin
  while i < tg_nargs loop
    col := tg_argv[i];
    tbl := tg_argv[i + 1];
    i := i + 2;
    continue when j ->> col is null;
    execute format('select to_jsonb(p) from public.%I p where p.id = $1', tbl) into parent using (j ->> col)::uuid;
    if parent is null then
      raise exception '% % not found or not visible', tbl, j ->> col using errcode = '23503';
    end if;
    patch := jsonb_build_object('organisation_id', parent -> 'organisation_id');
    if j ? 'workspace_id' then
      patch := patch || jsonb_build_object('workspace_id',
        case when tbl = 'workspaces' then parent -> 'id' else parent -> 'workspace_id' end);
    end if;
    -- Copy project_id only from a parent that has one (children of project-scoped rows);
    -- link tables such as collection_projects keep their own project_id.
    if j ? 'project_id' and col <> 'project_id' and (tbl = 'projects' or parent ? 'project_id') then
      patch := patch || jsonb_build_object('project_id',
        case when tbl = 'projects' then parent -> 'id' else parent -> 'project_id' end);
    end if;
    exit;
  end loop;

  if patch <> '{}'::jsonb then
    new := jsonb_populate_record(new, patch);
    j := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    if (j -> 'organisation_id') is distinct from (to_jsonb(old) -> 'organisation_id')
       or (j -> 'workspace_id') is distinct from (to_jsonb(old) -> 'workspace_id') then
      raise exception 'organisation_id and workspace_id are immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS for tenancy tables. Supabase grants everything on new tables by default, so
-- privileges are reset to exactly what each table needs before the policies.
-- ---------------------------------------------------------------------------
revoke all on public.organisations, public.profiles, public.organisation_subscriptions,
  public.organisation_members, public.workspaces, public.workspace_members from anon, authenticated;
grant select, update on public.organisations to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.organisation_subscriptions to authenticated;
grant select, insert, update, delete on public.organisation_members, public.workspaces, public.workspace_members to authenticated;

create policy organisations_select on public.organisations for select to authenticated
  using (private.is_org_member(id));
create policy organisations_update on public.organisations for update to authenticated
  using (private.has_org_role(id, 'admin')) with check (private.has_org_role(id, 'admin'));

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy organisation_subscriptions_select on public.organisation_subscriptions for select to authenticated
  using (private.has_org_role(organisation_id, 'admin'));

create policy organisation_members_select on public.organisation_members for select to authenticated
  using (private.is_org_member(organisation_id));
create policy organisation_members_insert on public.organisation_members for insert to authenticated
  with check (private.has_org_role(organisation_id, 'admin'));
create policy organisation_members_update on public.organisation_members for update to authenticated
  using (private.has_org_role(organisation_id, 'admin')) with check (private.has_org_role(organisation_id, 'admin'));
create policy organisation_members_delete on public.organisation_members for delete to authenticated
  using (private.has_org_role(organisation_id, 'admin'));

create policy workspaces_select on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (private.has_org_role(organisation_id, 'admin'));
create policy workspaces_update on public.workspaces for update to authenticated
  using (private.has_org_role(organisation_id, 'admin')) with check (private.has_org_role(organisation_id, 'admin'));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (private.has_org_role(organisation_id, 'admin'));

create policy workspace_members_select on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy workspace_members_insert on public.workspace_members for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'admin'));
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (private.has_workspace_role(workspace_id, 'admin')) with check (private.has_workspace_role(workspace_id, 'admin'));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'admin'));
