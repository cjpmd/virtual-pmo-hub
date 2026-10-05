-- Virtual PMO: private storage buckets. Paths are {organisation_id}/... for org-assets and
-- {organisation_id}/{workspace_id}/... for attachments and evidence.

insert into storage.buckets (id, name, public, file_size_limit)
values ('org-assets', 'org-assets', false, 5242880),
       ('attachments', 'attachments', false, 52428800),
       ('evidence', 'evidence', false, 52428800)
on conflict (id) do nothing;

create function private.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;
grant execute on function private.try_uuid(text) to authenticated, service_role;

-- The workspace folder must belong to the organisation folder.
create function private.storage_workspace(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id from public.workspaces w
  where w.id = private.try_uuid((storage.foldername(p_name))[2])
    and w.organisation_id = private.try_uuid((storage.foldername(p_name))[1]);
$$;
grant execute on function private.storage_workspace(text) to authenticated, service_role;

-- One policy per action (avoids multiple permissive policies).
create policy vpmo_objects_select on storage.objects for select to authenticated
  using (
    (bucket_id = 'org-assets' and private.is_org_member(private.try_uuid((storage.foldername(name))[1])))
    or (bucket_id in ('attachments', 'evidence') and private.is_workspace_member(private.storage_workspace(name))));
create policy vpmo_objects_insert on storage.objects for insert to authenticated
  with check (
    (bucket_id = 'org-assets' and private.has_org_role(private.try_uuid((storage.foldername(name))[1]), 'admin'))
    or (bucket_id in ('attachments', 'evidence') and private.has_workspace_role(private.storage_workspace(name), 'contributor')));
create policy vpmo_objects_update on storage.objects for update to authenticated
  using (
    (bucket_id = 'org-assets' and private.has_org_role(private.try_uuid((storage.foldername(name))[1]), 'admin'))
    or (bucket_id in ('attachments', 'evidence') and private.has_workspace_role(private.storage_workspace(name), 'contributor')))
  with check (
    (bucket_id = 'org-assets' and private.has_org_role(private.try_uuid((storage.foldername(name))[1]), 'admin'))
    or (bucket_id in ('attachments', 'evidence') and private.has_workspace_role(private.storage_workspace(name), 'contributor')));
create policy vpmo_objects_delete on storage.objects for delete to authenticated
  using (
    (bucket_id = 'org-assets' and private.has_org_role(private.try_uuid((storage.foldername(name))[1]), 'admin'))
    or (bucket_id in ('attachments', 'evidence') and private.has_workspace_role(private.storage_workspace(name), 'manager')));
