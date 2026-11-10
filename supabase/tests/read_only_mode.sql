-- GL-4 read-only mode tests (docs/sql/gl-4-read-only.sql). Runs against a seeded database (the
-- local Postgres: supabase/tests/local/run.sh migrate && run.sh seed) inside a transaction and
-- rolls everything back. Each check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/read_only_mode.sql
\set ON_ERROR_STOP 1
begin;

-- Fixture: the seeded organisation's admin, two paid members, a workspace, two outsiders.
create temp table ctx as
select m.organisation_id as org, m.profile_id as uid,
  (select array_agg(m2.profile_id order by m2.profile_id) from public.organisation_members m2
   where m2.organisation_id = m.organisation_id and m2.role in ('pmo', 'contributor', 'manager')) as others,
  (select w.id from public.workspaces w where w.organisation_id = m.organisation_id order by w.created_at limit 1) as ws,
  (select p.id from public.projects p where p.organisation_id = m.organisation_id order by p.created_at limit 1) as project
from public.organisation_members m where m.role = 'admin' order by m.created_at limit 1;
grant select on ctx to authenticated;
create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated;

do $$ begin
  if (select org from ctx) is null then raise exception 'Seed the database first'; end if;
  if coalesce(array_length((select others from ctx), 1), 0) < 2 then raise exception 'The seed needs two paid members besides the admin'; end if;
end $$;

update public.organisations set is_demo = false where id = (select org from ctx);
insert into auth.users (id, email, email_confirmed_at) values
  ('e0000000-0000-4000-8000-000000000001', 'gl4.viewer@example.com', now()),
  ('e0000000-0000-4000-8000-000000000002', 'gl4.asker@example.com', now()),
  ('e0000000-0000-4000-8000-000000000003', 'gl4.joiner@example.com', now())
on conflict do nothing;
insert into public.profiles (id, email, display_name) values
  ('e0000000-0000-4000-8000-000000000001', 'gl4.viewer@example.com', 'GL4 Viewer'),
  ('e0000000-0000-4000-8000-000000000002', 'gl4.asker@example.com', 'GL4 Asker'),
  ('e0000000-0000-4000-8000-000000000003', 'gl4.joiner@example.com', 'GL4 Joiner')
on conflict (id) do nothing;
insert into public.organisation_join_requests (organisation_id, profile_id, email, matched_by)
select org, p, e, 'email_domain' from ctx, (values
  ('e0000000-0000-4000-8000-000000000002'::uuid, 'gl4.asker@example.com'),
  ('e0000000-0000-4000-8000-000000000003'::uuid, 'gl4.joiner@example.com')) v(p, e);

-- Helpers. as_user signs in as a profile (direct writes and definer RPCs both see the sub);
-- as_system is pg_cron or the service role (no sub). set_sub changes the subscription row.
create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
create function pg_temp.as_system() returns void language sql as $$
  select set_config('role', 'postgres', true),
         set_config('request.jwt.claims', '{"role":"service_role"}', true),
         set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'service_role', true); $$;
create function pg_temp.set_sub(p_status text, p_trial_ends timestamptz, p_period_end timestamptz default null)
returns void language sql as $$
  update public.organisation_subscriptions
  set plan = case when p_status is null then 'trial' else 'standard' end, status = p_status,
      trial_ends_at = p_trial_ends, current_period_end = p_period_end
  where organisation_id = (select org from ctx); $$;
-- Sets only status_changed_at (the status trigger keeps an explicit value).
create function pg_temp.set_changed(p_at timestamptz) returns void language sql as $$
  update public.organisation_subscriptions set status_changed_at = p_at
  where organisation_id = (select org from ctx); $$;
create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update passed set n = n + 1;
end $$;
-- Runs sql and expects the read-only refusal (P0001, hint org_read_only).
create function pg_temp.refused(name text, sql text) returns void language plpgsql as $$
declare v_hint text;
begin
  begin
    execute sql;
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint = 'org_read_only' then update passed set n = n + 1; return; end if;
    raise exception 'FAIL: % refused with another P0001 (%): %', name, v_hint, sqlerrm;
  end;
  raise exception 'FAIL: % was allowed', name;
end $$;
create function pg_temp.allowed(name text, sql text) returns void language plpgsql as $$
begin
  execute sql;
  update passed set n = n + 1;
exception when others then raise exception 'FAIL: % was refused: %', name, sqlerrm;
end $$;
create function pg_temp.writable() returns boolean language sql as $$
  select private.organisation_is_writable((select org from ctx)); $$;

insert into public.organisation_subscriptions (organisation_id, plan, trial_ends_at)
select org, 'trial', now() + interval '7 days' from ctx
on conflict (organisation_id) do nothing;

-- 1. The writable rule for every subscription state.
select pg_temp.set_sub(null, now() + interval '1 day');
select pg_temp.ok('trial running is writable', pg_temp.writable());
select pg_temp.set_sub(null, now() - interval '1 second');
select pg_temp.ok('expired trial is read-only', not pg_temp.writable());
select pg_temp.set_sub('active', null, now() + interval '20 days');
select pg_temp.ok('active is writable', pg_temp.writable());
select pg_temp.set_sub('trialing', null, now() + interval '20 days');
select pg_temp.ok('Stripe trialing is writable', pg_temp.writable());
select pg_temp.set_sub('canceled', null, now() - interval '1 day');
select pg_temp.ok('canceled is read-only', not pg_temp.writable());
select pg_temp.set_sub('unpaid', null, now() - interval '1 day');
select pg_temp.ok('unpaid is read-only', not pg_temp.writable());
-- GL-6: the 14 days run from when the payment failed (status_changed_at), not from the
-- period end, which Stripe has already moved to the end of the unpaid period.
select pg_temp.set_sub('past_due', null, now() + interval '20 days');
select pg_temp.ok('past_due stamps status_changed_at',
  (select status_changed_at > now() - interval '1 minute' from public.organisation_subscriptions where organisation_id = (select org from ctx)));
select pg_temp.set_changed(now() - interval '13 days');
select pg_temp.ok('past_due inside 14 days is writable', pg_temp.writable());
select pg_temp.set_changed(now() - interval '15 days');
select pg_temp.ok('past_due beyond 14 days is read-only, even with the period end ahead', not pg_temp.writable());
select pg_temp.set_changed(null);
select pg_temp.set_sub('past_due', null, now() - interval '13 days');
select pg_temp.ok('past_due with no failure time falls back to the period end', pg_temp.writable());
select pg_temp.set_sub('past_due', null, null);
select pg_temp.ok('past_due with neither is read-only', not pg_temp.writable());
select pg_temp.set_sub('canceled', now() + interval '5 days');
select pg_temp.ok('canceled ends a running trial too', not pg_temp.writable());
select pg_temp.ok('no subscription row is writable', private.organisation_is_writable(gen_random_uuid()));
update public.organisation_subscriptions set plan = 'demo', status = null, trial_ends_at = null
where organisation_id = (select org from ctx);
select pg_temp.ok('demo plan is writable', pg_temp.writable());
do $$ begin
  update public.organisation_subscriptions set plan = 'trial', trial_ends_at = null where organisation_id = (select org from ctx);
  raise exception 'FAIL: a trial without an end date was accepted';
exception when check_violation then update passed set n = n + 1;
end $$;

-- 2. Read-only (expired trial): user writes refused, direct and through definer RPCs.
select pg_temp.set_sub(null, now() - interval '1 day');
select pg_temp.as_user(uid) from ctx;
select pg_temp.refused('direct update', 'update public.projects set name = name where id = (select project from ctx)');
select pg_temp.refused('direct insert (lessons)', 'insert into public.lessons (project_id, type, summary, category_id) select project, ''success'', ''x'', (select id from public.lookup_values where organisation_id = ctx.org and list_key = ''lesson_category'' limit 1) from ctx');
select pg_temp.refused('settings update (organisations)', 'update public.organisations set name = name where id = (select org from ctx)');
select pg_temp.refused('definer RPC: paid invite', format('select public.create_invites(%L, ''[{"email":"gl4.paid@example.com","role":"contributor"}]'', array[%L]::uuid[])', (select org from ctx), (select ws from ctx)));
select pg_temp.refused('definer RPC: promote to a paid role', format('select public.change_member_role(%L, %L, ''contributor'')', (select org from ctx), (select others[1] from ctx)));
select pg_temp.refused('storage upload by a member', format('insert into storage.objects (bucket_id, name) values (''attachments'', %L)', (select org || '/' || ws || '/gl4.txt' from ctx)));

-- 3. Reads and exports keep working.
select pg_temp.ok('reads still work', (select count(*) from public.projects where organisation_id = (select org from ctx)) > 0);
select pg_temp.ok('views still read', (select count(*) >= 0 from public.v_projects));
select pg_temp.ok('organisation_writable() reports false', public.organisation_writable((select org from ctx)) = false);

-- 4. Getting under the seat count, and free viewers.
select pg_temp.allowed('demote to viewer', format('select public.change_member_role(%L, %L, ''viewer'')', (select org from ctx), (select others[1] from ctx)));
select pg_temp.allowed('remove a member (cascades to workspace_members and resources)', format('select public.remove_member(%L, %L)', (select org from ctx), (select others[2] from ctx)));
select pg_temp.ok('viewer invite created', (public.create_invites((select org from ctx), '[{"email":"gl4.viewer@example.com","role":"viewer"}]', array[(select ws from ctx)])) -> 0 ->> 'outcome' = 'created');
select pg_temp.allowed('resend a viewer invite', format('select public.resend_invite(%L)', (select id from public.organisation_invites where email = 'gl4.viewer@example.com')));
select pg_temp.allowed('decline a join request', format('select public.decide_join_request(%L, false)', (select id from public.organisation_join_requests where email = 'gl4.asker@example.com')));
select pg_temp.refused('approve a join request with a paid role', format('select public.decide_join_request(%L, true, ''contributor'', array[%L]::uuid[])', (select id from public.organisation_join_requests where email = 'gl4.joiner@example.com'), (select ws from ctx)));
select pg_temp.allowed('approve a join request as viewer', format('select public.decide_join_request(%L, true, ''viewer'', array[%L]::uuid[])', (select id from public.organisation_join_requests where email = 'gl4.joiner@example.com'), (select ws from ctx)));
select pg_temp.ok('approved joiner is a viewer', (select role from public.organisation_members m, ctx where m.organisation_id = ctx.org and m.profile_id = 'e0000000-0000-4000-8000-000000000003') = 'viewer');

-- The service role issues the token (send-invite), then the invitee accepts.
select pg_temp.as_system();
select pg_temp.ok('service role issues the invite token', public.issue_invite_token((select id from public.organisation_invites where email = 'gl4.viewer@example.com'), sha256(convert_to('gl4token' || repeat('x', 40), 'UTF8')), null) is not null);
select pg_temp.as_user('e0000000-0000-4000-8000-000000000001');
select pg_temp.ok('accept a viewer invite', public.accept_invite('gl4token' || repeat('x', 40)) ->> 'status' = 'joined');
select pg_temp.as_system();
select pg_temp.ok('new viewer has a member row and a resource',
  (select role from public.organisation_members m, ctx where m.organisation_id = ctx.org and m.profile_id = 'e0000000-0000-4000-8000-000000000001') = 'viewer'
  and exists (select 1 from public.resources r, ctx where r.organisation_id = ctx.org and r.profile_id = 'e0000000-0000-4000-8000-000000000001'));
-- Revoke a paid invite made before the lapse (pending paid invites count as seats).
select pg_temp.as_system();
insert into public.organisation_invites (organisation_id, email, role, invited_by, expires_at)
select org, 'gl4.paid.old@example.com', 'contributor', uid, now() + interval '5 days' from ctx;
select pg_temp.as_user(uid) from ctx;
select pg_temp.allowed('revoke a paid invite', format('select public.revoke_invite(%L)', (select id from public.organisation_invites where email = 'gl4.paid.old@example.com')));

-- 5. System writes still work (cron, service role).
select pg_temp.as_system();
select pg_temp.allowed('system update', 'update public.projects set name = name where id = (select project from ctx)');
reset role;

-- 6. An outsider's upload gets a plain RLS refusal, never the read-only message.
select pg_temp.as_user('e0000000-0000-4000-8000-000000000002');
do $$ begin
  insert into storage.objects (bucket_id, name) select 'attachments', org || '/' || ws || '/gl4-outsider.txt' from ctx;
  raise exception 'FAIL: outsider upload allowed';
exception
  when insufficient_privilege then update passed set n = n + 1;
  when sqlstate 'P0001' then raise exception 'FAIL: outsider was told the organisation is read-only';
end $$;
do $$ begin
  perform public.organisation_writable((select org from ctx));
  raise exception 'FAIL: outsider could ask whether the organisation is writable';
exception when insufficient_privilege then update passed set n = n + 1;
end $$;

-- 7. Resubscribing restores writes, uploads included.
select pg_temp.as_system();
select pg_temp.set_sub('active', null, now() + interval '30 days');
select pg_temp.as_user(uid) from ctx;
select pg_temp.allowed('update after resubscribing', 'update public.projects set name = name where id = (select project from ctx)');
select pg_temp.allowed('promote after resubscribing', format('select public.change_member_role(%L, %L, ''contributor'')', (select org from ctx), (select others[1] from ctx)));
select pg_temp.allowed('upload after resubscribing', format('insert into storage.objects (bucket_id, name) values (''attachments'', %L)', (select org || '/' || ws || '/gl4-after.txt' from ctx)));
reset role;

-- 8. Coverage: every public table with organisation_id has the trigger, except the exempt ones,
--    so a new tenant table can't be missed. organisations has it too (on its id).
select pg_temp.ok('every organisation table has zz_org_read_only (missing: ' || coalesce((
  select string_agg(c.relname, ', ') from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    and c.relname not in ('organisation_subscriptions', 'audit_log', 'user_favourites')
    and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'zz_org_read_only')), 'none') || ')',
  not exists (
  select 1 from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    and c.relname not in ('organisation_subscriptions', 'audit_log', 'user_favourites')
    and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'zz_org_read_only')));
select pg_temp.ok('organisations has zz_org_read_only',
  exists (select 1 from pg_trigger where tgrelid = 'public.organisations'::regclass and tgname = 'zz_org_read_only'));
select pg_temp.ok('scheduled packs skip read-only organisations',
  pg_get_functiondef('private.create_scheduled_packs()'::regprocedure) like '%organisation_is_writable(f.organisation_id)%');
select pg_temp.ok('private helpers not executable by clients',
  not has_function_privilege('authenticated', 'private.organisation_is_writable(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.assert_org_writable(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.organisation_writable(uuid)', 'execute'));

select 'read_only_mode: ' || n || ' checks passed' from passed;
rollback;
