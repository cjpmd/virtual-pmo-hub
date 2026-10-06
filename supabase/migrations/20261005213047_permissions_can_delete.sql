-- Stage 4c: permissions the UI uses to decide which buttons to show.
-- RLS still enforces every write; these only stop the UI offering actions that would fail.

-- project_permissions(): add can_delete alongside can_edit (replacing can_delete_records).
-- The return type changes, which needs a new function. The 4b version is renamed aside and
-- locked down rather than dropped (a drop needs interactive confirmation); drop
-- public.project_permissions_4b in a later clean-up.
alter function public.project_permissions(uuid) rename to project_permissions_4b;
revoke execute on function public.project_permissions_4b(uuid) from public, anon, authenticated;

create function public.project_permissions(p_project uuid)
returns table (can_edit boolean, can_delete boolean, can_manage_project boolean)
language sql stable security invoker set search_path = '' as $$
  select private.can_edit_project(p.id),
         private.has_workspace_role(p.workspace_id, 'manager'),
         private.has_workspace_role(p.workspace_id, 'manager')
  from public.projects p
  where p.id = p_project;
$$;
revoke execute on function public.project_permissions(uuid) from public, anon;
grant execute on function public.project_permissions(uuid) to authenticated, service_role;

-- my_workspace_roles(): the caller's effective role in each workspace they can see
-- (workspace membership, or an organisation role of pmo/admin, whichever is higher).
create function public.my_workspace_roles()
returns table (workspace_id uuid, organisation_id uuid, role public.app_role)
language sql stable security invoker set search_path = '' as $$
  select w.id, w.organisation_id, private.workspace_role(w.id)
  from public.workspaces w
  where private.workspace_role(w.id) is not null;
$$;
revoke execute on function public.my_workspace_roles() from public, anon;
grant execute on function public.my_workspace_roles() to authenticated, service_role;
