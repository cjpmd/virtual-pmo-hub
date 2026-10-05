-- What the signed-in user may do on one project, so the UI can show or hide edit controls.
-- It mirrors the RLS policies (same private helpers); RLS still enforces every write.
-- SECURITY INVOKER: a project the caller cannot see returns no row.
create function public.project_permissions(p_project uuid)
returns table (can_edit boolean, can_delete_records boolean, can_manage_project boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    private.can_edit_project(p.id),
    private.has_workspace_role(p.workspace_id, 'manager'),
    private.has_workspace_role(p.workspace_id, 'manager')
  from public.projects p
  where p.id = p_project;
$$;

revoke execute on function public.project_permissions(uuid) from public, anon;
grant execute on function public.project_permissions(uuid) to authenticated, service_role;
