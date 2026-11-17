-- An admin for each perf tenant (GL-17b refreshes each organisation as one of its admins; an
-- organisation without one is skipped). b1700000-…-000000000001 is tenant 1's admin, also used for
-- the signed-in reads. Safe to run after every seed.
insert into auth.users (id, email, raw_user_meta_data)
select ('b1700000-0000-4000-8000-00000000000' || n)::uuid, 'gl17-t' || n || '@perf.test', json_build_object('full_name', 'GL17 Admin T' || n)
from generate_series(1, 5) n on conflict do nothing;
insert into public.profiles (id, display_name, email)
select ('b1700000-0000-4000-8000-00000000000' || n)::uuid, 'GL17 Admin T' || n, 'gl17-t' || n || '@perf.test'
from generate_series(1, 5) n on conflict (id) do nothing;
insert into public.organisation_members (organisation_id, profile_id, role)
select o.id, ('b1700000-0000-4000-8000-00000000000' || n)::uuid, 'admin'
from generate_series(1, 5) n join public.organisations o on o.slug = 'perf-test-university-t' || n
on conflict do nothing;
