-- A member of tenant 1 only, for the signed-in reads.
insert into auth.users (id, email, raw_user_meta_data) values ('b1700000-0000-4000-8000-000000000001', 'gl17@perf.test', '{"full_name":"GL17 Admin"}') on conflict do nothing;
insert into public.profiles (id, display_name, email) values ('b1700000-0000-4000-8000-000000000001', 'GL17 Admin', 'gl17@perf.test') on conflict (id) do nothing;
insert into public.organisation_members (organisation_id, profile_id, role)
select id, 'b1700000-0000-4000-8000-000000000001', 'admin' from public.organisations where slug = 'perf-test-university-t1' on conflict do nothing;
