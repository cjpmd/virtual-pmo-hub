-- Work package 0.1: make the dedicated end-to-end test user a member of the demo organisation.
-- Data change only (no schema change, so no migration). Run once, after approval, as the
-- service role in the Supabase SQL editor.
--
-- Role: pmo. An organisation pmo role gives PMO rights in every workspace
-- (private.workspace_role), so the Boards spec can check forum edit controls and make one
-- reverted write, while organisation-admin-only controls stay hidden.

insert into public.organisation_members (organisation_id, profile_id, role)
select o.id, p.id, 'pmo'
from public.organisations o
cross join public.profiles p
where o.is_demo
  and lower(p.email) = 'cmcdonald002@dundee.ac.uk'
order by o.created_at
limit 1
on conflict (organisation_id, profile_id) do update set role = excluded.role;

update public.profiles p
set last_organisation_id = (
  select o.id from public.organisations o where o.is_demo order by o.created_at limit 1
)
where lower(p.email) = 'cmcdonald002@dundee.ac.uk';
