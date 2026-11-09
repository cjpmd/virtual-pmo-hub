CREATE OR REPLACE FUNCTION public.join_demo_as_viewer()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select o.id into v_org from public.organisations o
  where o.is_demo order by o.created_at limit 1;
  if v_org is null then
    raise exception 'No demo organisation is available' using errcode = 'P0002';
  end if;
  insert into public.organisation_members (organisation_id, profile_id, role)
  values (v_org, v_uid, 'viewer')
  on conflict (organisation_id, profile_id) do nothing;
  insert into public.workspace_members (workspace_id, organisation_id, profile_id, role)
  select w.id, v_org, v_uid, 'viewer'
  from public.workspaces w where w.organisation_id = v_org
  on conflict (workspace_id, profile_id) do nothing;
  update public.profiles set last_organisation_id = v_org where id = v_uid;
  return v_org;
end;
$$;
REVOKE EXECUTE ON FUNCTION public.join_demo_as_viewer() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_demo_as_viewer() TO authenticated;