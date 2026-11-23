-- NHS-7: partner (cross-organisation / ICS) programmes
-- (supabase/migrations/20261123133252_nhs_7_partner_programmes.sql, docs/sql/nhs-7-partner-programmes.sql).
-- Needs only the migrations (no seed): creates a host, a partner and an unrelated organisation,
-- runs inside a transaction and rolls everything back. Sharing is switched on only inside this
-- transaction (as the GL-10 fixture does). Each check raises on failure; the last line prints the
-- count passed. Cross-tenant cases for the new RPCs are in cross_tenant.sql.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/nhs_partner_programmes.sql
\set ON_ERROR_STOP 1
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;
create temp table tok (k text primary key, v text);
grant all on tok to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9700000-0000-4000-8000-000000000001', 'nhs7.hadmin@example.com', now(), '{}'),
  ('e9700000-0000-4000-8000-000000000002', 'nhs7.hviewer@example.com', now(), '{}'),
  ('e9700000-0000-4000-8000-000000000003', 'nhs7.padmin@example.com', now(), '{}'),
  ('e9700000-0000-4000-8000-000000000004', 'nhs7.pviewer@example.com', now(), '{}'),
  ('e9700000-0000-4000-8000-000000000005', 'nhs7.oadmin@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9700000-0000-4000-8000-000000000001', 'nhs7.hadmin@example.com', 'NHS7 Host Admin'),
  ('e9700000-0000-4000-8000-000000000002', 'nhs7.hviewer@example.com', 'NHS7 Host Viewer'),
  ('e9700000-0000-4000-8000-000000000003', 'nhs7.padmin@example.com', 'NHS7 Partner Admin'),
  ('e9700000-0000-4000-8000-000000000004', 'nhs7.pviewer@example.com', 'NHS7 Partner Viewer'),
  ('e9700000-0000-4000-8000-000000000005', 'nhs7.oadmin@example.com', 'NHS7 Other Admin')
on conflict (id) do nothing;
insert into ctx values ('hadmin', 'e9700000-0000-4000-8000-000000000001'),
  ('hviewer', 'e9700000-0000-4000-8000-000000000002'), ('padmin', 'e9700000-0000-4000-8000-000000000003'),
  ('pviewer', 'e9700000-0000-4000-8000-000000000004'), ('oadmin', 'e9700000-0000-4000-8000-000000000005');

create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true),
         set_config('request.jwt.claim.role', 'anon', true), set_config('role', 'anon', true); $$;
create function pg_temp.as_owner() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true),
         set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true); $$;
create function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update passed set n = n + 1;
end $$;
create function pg_temp.raises(name text, sql text, state text, hint text default null) returns void language plpgsql as $$
declare v_state text; v_hint text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    perform pg_temp.ok(name || ' [' || v_state || coalesce(' ' || v_hint, '') || ']',
                       v_state = state and (hint is null or v_hint = hint));
    return;
  end;
  raise exception 'FAIL: % (no error)', name;
end $$;
create function pg_temp.c(k text) returns uuid language sql stable as $$ select v from ctx where ctx.k = c.k $$;
grant execute on function pg_temp.c(text) to authenticated, anon;
create function pg_temp.t(k text) returns text language sql stable as $$ select v from tok where tok.k = t.k $$;
grant execute on function pg_temp.t(text) to authenticated, anon;
create function pg_temp.sharing(on_ boolean) returns void language sql security definer as $$
  update private.entity_sharing_settings set enabled = on_, changed_at = now(); $$;
create function pg_temp.share_access(prog uuid, org uuid) returns text language sql stable security definer as $$
  select access from public.entity_shares where entity_type = 'programme' and entity_id = prog and partner_organisation_id = org $$;

-- Three organisations: the host (with sample data), a partner (with sample data) and another.
select pg_temp.as_user(pg_temp.c('hadmin'));
insert into ctx select 'host', public.create_organisation(p_name => 'NHS7 Host ICB', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('host'));
select pg_temp.as_user(pg_temp.c('padmin'));
insert into ctx select 'partner', public.create_organisation(p_name => 'NHS7 Partner Trust', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('partner'));
select pg_temp.as_user(pg_temp.c('oadmin'));
insert into ctx select 'other', public.create_organisation(p_name => 'NHS7 Other Trust', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('other'));
select pg_temp.as_owner();
insert into ctx select 'hws', id from public.workspaces where organisation_id = pg_temp.c('host') limit 1;
insert into ctx select 'pws', id from public.workspaces where organisation_id = pg_temp.c('partner') limit 1;
insert into ctx select 'hprog', id from public.programmes where organisation_id = pg_temp.c('host') limit 1;
insert into ctx select 'oprog', id from public.programmes where organisation_id = pg_temp.c('other') limit 1;
insert into ctx select 'pprog', id from public.programmes where organisation_id = pg_temp.c('partner') limit 1;
insert into ctx select 'hproj', id from public.projects where programme_id = pg_temp.c('hprog') and archived_at is null order by code limit 1;
insert into ctx select 'pproj', id from public.projects where organisation_id = pg_temp.c('partner') and archived_at is null order by code limit 1;
insert into ctx select 'oproj', id from public.projects where organisation_id = pg_temp.c('other') and archived_at is null order by code limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('host'), pg_temp.c('hviewer'), 'viewer'), (pg_temp.c('partner'), pg_temp.c('pviewer'), 'viewer');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('hws'), pg_temp.c('host'), pg_temp.c('hviewer'), 'viewer'),
  (pg_temp.c('pws'), pg_temp.c('partner'), pg_temp.c('pviewer'), 'viewer')
on conflict do nothing;
select pg_temp.ok('fixture: host programme has projects',
  (select count(*) from public.projects where programme_id = pg_temp.c('hprog') and archived_at is null) >= 1);

-- 1. Module off: nothing is offered.
select pg_temp.as_user(pg_temp.c('hadmin'));
select pg_temp.raises('module off: invite refused',
  $$select public.create_partner_invite(pg_temp.c('hprog'), 'nhs7.padmin@example.com', 'read')$$, 'P0001', 'module_off');
select pg_temp.ok('module off: overview is null for the host', public.shared_programme_overview(pg_temp.c('hprog')) is null);
select pg_temp.ok('module off: programme_partners still answers for host members',
  (public.programme_partners(pg_temp.c('hprog')) ->> 'module_on')::boolean = false);

-- 2. Module on, sharing paused (as shipped): invitations refused.
select public.set_organisation_module(pg_temp.c('host'), 'cross_org', true);
select pg_temp.raises('paused: invite refused',
  $$select public.create_partner_invite(pg_temp.c('hprog'), 'nhs7.padmin@example.com', 'read')$$, '42501', 'sharing_paused');
select pg_temp.ok('paused: programme_partners says so', (public.programme_partners(pg_temp.c('hprog')) ->> 'sharing_enabled')::boolean = false);
select pg_temp.ok('module on: host overview lists its projects',
  jsonb_array_length(public.shared_programme_overview(pg_temp.c('hprog')) -> 'projects')
    = (select count(*) from public.projects where programme_id = pg_temp.c('hprog') and archived_at is null));

-- 3. Sharing switched on inside this transaction only.
select pg_temp.as_owner();
select pg_temp.sharing(true);
select pg_temp.as_user(pg_temp.c('hviewer'));
select pg_temp.raises('host viewer can''t invite',
  $$select public.create_partner_invite(pg_temp.c('hprog'), 'nhs7.padmin@example.com', 'read')$$, '42501');
select pg_temp.as_user(pg_temp.c('padmin'));
select pg_temp.raises('partner admin can''t invite to the host programme',
  $$select public.create_partner_invite(pg_temp.c('hprog'), 'nhs7.padmin@example.com', 'read')$$, '42501');
select pg_temp.as_user(pg_temp.c('hadmin'));
select pg_temp.raises('invalid email refused',
  $$select public.create_partner_invite(pg_temp.c('hprog'), 'not-an-email', 'read')$$, '22023', 'invalid_email');
select pg_temp.raises('unknown access refused',
  $$select public.create_partner_invite(pg_temp.c('hprog'), 'nhs7.padmin@example.com', 'admin')$$, '22023');
insert into tok select 'first', public.create_partner_invite(pg_temp.c('hprog'), ' NHS7.PAdmin@example.com ', 'read') ->> 'token';
insert into tok select 'inv', public.create_partner_invite(pg_temp.c('hprog'), 'nhs7.padmin@example.com', 'contribute') ->> 'token';
select pg_temp.ok('a new invitation to the same address replaces the pending one',
  (select count(*) from public.partner_invites where programme_id = pg_temp.c('hprog') and accepted_at is null and revoked_at is null) = 1
  and (select email from public.partner_invites where programme_id = pg_temp.c('hprog') and revoked_at is null) = 'nhs7.padmin@example.com');
select pg_temp.ok('token is 64 characters', length(pg_temp.t('inv')) = 64);
select pg_temp.raises('token_hash not readable', $$select token_hash from public.partner_invites$$, '42501');
select pg_temp.ok('host admin sees the pending invitation',
  jsonb_array_length(public.programme_partners(pg_temp.c('hprog')) -> 'invites') = 1);
select pg_temp.as_user(pg_temp.c('hviewer'));
select pg_temp.ok('host viewer doesn''t see invitations',
  jsonb_array_length(public.programme_partners(pg_temp.c('hprog')) -> 'invites') = 0
  and not exists (select 1 from public.partner_invites));

-- 4. Preview.
select pg_temp.as_user(pg_temp.c('padmin'));
select pg_temp.ok('preview: unknown token', public.partner_invite_preview('x' || repeat('0', 40)) ->> 'status' = 'not_found');
select pg_temp.ok('preview: replaced token is revoked', public.partner_invite_preview(pg_temp.t('first')) ->> 'status' = 'revoked');
select pg_temp.ok('preview: pending, names host and programme, offers the partner org with its module off',
  (select x ->> 'status' = 'pending' and x ->> 'host_organisation' = 'NHS7 Host ICB' and x ->> 'access' = 'contribute'
     and x -> 'organisations' @> jsonb_build_array(jsonb_build_object('id', pg_temp.c('partner'), 'module_on', false))
   from (select public.partner_invite_preview(pg_temp.t('inv')) x) s));
select pg_temp.as_user(pg_temp.c('oadmin'));
select pg_temp.ok('preview: someone else gets wrong_email and no details',
  public.partner_invite_preview(pg_temp.t('inv')) = '{"status": "wrong_email"}'::jsonb);
select pg_temp.raises('accept: wrong email refused',
  $$select public.accept_partner_invite(pg_temp.t('inv'), pg_temp.c('other'))$$, 'P0001', 'invite_wrong_email');
select pg_temp.as_anon();
select pg_temp.raises('anon can''t preview', $$select public.partner_invite_preview(pg_temp.t('inv'))$$, '42501');

-- 5. Accept.
select pg_temp.as_user(pg_temp.c('padmin'));
select pg_temp.raises('accept: partner module off refused',
  $$select public.accept_partner_invite(pg_temp.t('inv'), pg_temp.c('partner'))$$, 'P0001', 'module_off');
select public.set_organisation_module(pg_temp.c('partner'), 'cross_org', true);
select pg_temp.raises('accept: for the host organisation refused (not its admin)',
  $$select public.accept_partner_invite(pg_temp.t('inv'), pg_temp.c('host'))$$, '42501');
select pg_temp.raises('accept: for an organisation the person doesn''t admin',
  $$select public.accept_partner_invite(pg_temp.t('inv'), pg_temp.c('other'))$$, '42501');
select pg_temp.as_user(pg_temp.c('pviewer'));
select pg_temp.raises('accept: partner viewer (not admin, wrong email) refused',
  $$select public.accept_partner_invite(pg_temp.t('inv'), pg_temp.c('partner'))$$, 'P0001', 'invite_wrong_email');
select pg_temp.as_user(pg_temp.c('padmin'));
insert into ctx select 'share', (public.accept_partner_invite(pg_temp.t('inv'), pg_temp.c('partner')) ->> 'share_id')::uuid;
select pg_temp.ok('accept: share created with contribute access',
  pg_temp.share_access(pg_temp.c('hprog'), pg_temp.c('partner')) = 'contribute');
select pg_temp.raises('accept: second use refused',
  $$select public.accept_partner_invite(pg_temp.t('inv'), pg_temp.c('partner'))$$, 'P0001', 'invite_used');
select pg_temp.as_owner();
select pg_temp.ok('accept: audited for both organisations',
  (select count(*) from public.audit_log where entity_table = 'entity_shares' and entity_id = pg_temp.c('share')
     and organisation_id in (pg_temp.c('host'), pg_temp.c('partner'))) = 2);
select pg_temp.ok('accept: no data moved (host projects still the host''s)',
  (select organisation_id from public.projects where id = pg_temp.c('hproj')) = pg_temp.c('host'));

-- 6. Partner reads: the roll-up only, nothing through table RLS.
select pg_temp.as_user(pg_temp.c('pviewer'));
select pg_temp.ok('partner viewer: programme in shared_programmes',
  (select x -> 0 ->> 'programme_id' = pg_temp.c('hprog')::text and x -> 0 ->> 'access' = 'contribute'
   from (select public.shared_programmes() x) s));
select pg_temp.ok('partner viewer: overview with host projects and its share',
  (select x -> 'viewer' ->> 'access' = 'contribute' and not (x -> 'viewer' ->> 'is_host')::boolean
     and jsonb_array_length(x -> 'projects') >= 1 and x -> 'programme' ->> 'organisation' = 'NHS7 Host ICB'
     and jsonb_array_length(x -> 'organisations') = 2
   from (select public.shared_programme_overview(pg_temp.c('hprog')) x) s));
select pg_temp.ok('partner viewer: host tables still not readable',
  not exists (select 1 from public.programmes where organisation_id = pg_temp.c('host'))
  and not exists (select 1 from public.projects where organisation_id = pg_temp.c('host'))
  and not exists (select 1 from public.risks where organisation_id = pg_temp.c('host'))
  and not exists (select 1 from public.benefits where organisation_id = pg_temp.c('host'))
  and not exists (select 1 from public.project_health_current where organisation_id = pg_temp.c('host')));
select pg_temp.ok('partner viewer: programme_partners (host view) is null', public.programme_partners(pg_temp.c('hprog')) is null);
select pg_temp.ok('partner viewer: unshared programmes not visible', public.shared_programme_overview(pg_temp.c('oprog')) is null);
select pg_temp.as_user(pg_temp.c('oadmin'));
select pg_temp.ok('other organisation: overview null, list empty',
  public.shared_programme_overview(pg_temp.c('hprog')) is null and public.shared_programmes() = '[]'::jsonb);

-- 7. Contributions.
select pg_temp.as_user(pg_temp.c('pviewer'));
select pg_temp.raises('partner viewer can''t contribute',
  $$select public.contribute_project(pg_temp.c('pproj'), pg_temp.c('hprog'))$$, '42501');
select pg_temp.as_user(pg_temp.c('padmin'));
select pg_temp.raises('partner admin can''t contribute the host''s project',
  $$select public.contribute_project(pg_temp.c('hproj'), pg_temp.c('hprog'))$$, '42501');
select pg_temp.raises('partner admin can''t contribute to an unshared programme',
  $$select public.contribute_project(pg_temp.c('pproj'), pg_temp.c('oprog'))$$,
  '42501', 'not_shared');
insert into ctx select 'contrib', public.contribute_project(pg_temp.c('pproj'), pg_temp.c('hprog'));
select pg_temp.raises('duplicate contribution refused',
  $$select public.contribute_project(pg_temp.c('pproj'), pg_temp.c('hprog'))$$, '23505', 'already_contributed');
select pg_temp.ok('partner sees its contribution row', exists (select 1 from public.programme_contributions where id = pg_temp.c('contrib')));
select pg_temp.as_user(pg_temp.c('oadmin'));
select pg_temp.raises('other organisation can''t contribute',
  $$select public.contribute_project(pg_temp.c('oproj'), pg_temp.c('hprog'))$$, '42501', 'not_shared');
select pg_temp.ok('other organisation can''t read the contribution', not exists (select 1 from public.programme_contributions));

select pg_temp.as_user(pg_temp.c('hviewer'));
select pg_temp.ok('host viewer: contributed project in the roll-up, read-only, named by organisation',
  (select jsonb_array_length(x -> 'contributed_projects') = 1
     and x -> 'contributed_projects' -> 0 ->> 'id' = pg_temp.c('pproj')::text
     and x -> 'contributed_projects' -> 0 ->> 'organisation' = 'NHS7 Partner Trust'
   from (select public.shared_programme_overview(pg_temp.c('hprog')) x) s));
select pg_temp.ok('host viewer: contribution row and partner project not readable directly',
  not exists (select 1 from public.programme_contributions)
  and not exists (select 1 from public.projects where id = pg_temp.c('pproj')));
select pg_temp.ok('host viewer: programme_partners lists the share and the contribution',
  (select jsonb_array_length(x -> 'shares') = 1 and jsonb_array_length(x -> 'contributions') = 1
     and (x -> 'contributions' -> 0 ->> 'active')::boolean and not (x ->> 'can_manage')::boolean
   from (select public.programme_partners(pg_temp.c('hprog')) x) s));
select pg_temp.as_owner();
select pg_temp.ok('contributions don''t change the host programme''s stored health rows',
  not exists (select 1 from public.project_health_current where project_id = pg_temp.c('pproj') and organisation_id <> pg_temp.c('partner')));

-- 7b. Report block partner_contributions (NHS-7 part 2) and the ICS template.
select pg_temp.as_user(pg_temp.c('hviewer'));
select pg_temp.ok('block: host member sees both organisations and the contributed project',
  (select jsonb_array_length(x -> 'organisations') = 2 and jsonb_array_length(x -> 'projects') = 1
     and x -> 'projects' -> 0 ->> 'organisation' = 'NHS7 Partner Trust'
     and (select (o ->> 'projects')::integer from jsonb_array_elements(x -> 'organisations') o where o ->> 'role' = 'partner') = 1
   from (select private.rb_partner_contributions(jsonb_build_object('scope_type', 'programme', 'scope_entity_id', pg_temp.c('hprog')), '{}') x) s));
select pg_temp.ok('block: other scopes say programme only',
  (private.rb_partner_contributions(jsonb_build_object('scope_type', 'project', 'scope_entity_id', pg_temp.c('hproj')), '{}')
     ->> 'programme_scope_only')::boolean);
select pg_temp.as_user(pg_temp.c('oadmin'));
select pg_temp.ok('block: an outsider gets nothing',
  (select (x ->> 'unavailable')::boolean and jsonb_array_length(x -> 'projects') = 0
   from (select private.rb_partner_contributions(jsonb_build_object('scope_type', 'programme', 'scope_entity_id', pg_temp.c('hprog')), '{}') x) s));
select pg_temp.as_anon();
select pg_temp.raises('block: anon can''t run it',
  $$select private.rb_partner_contributions(jsonb_build_object('scope_type', 'programme', 'scope_entity_id', pg_temp.c('hprog')), '{}')$$, '42501');
select pg_temp.as_owner();
select pg_temp.ok('ICS template: one system row with the block',
  (select count(*) from public.report_templates where is_system and name = 'ICS system programme board'
     and blocks @> '[{"blockKey":"partner_contributions"}]') = 1);
select pg_temp.ok('block is partner-safe (not in the unsafe list)',
  not ('partner_contributions' = any (private.partner_unsafe_blocks())));

-- 8. Access changes hide and restore contributions.
select pg_temp.as_user(pg_temp.c('padmin'));
select pg_temp.raises('partner can''t change the share''s access',
  $$select public.set_programme_share_access(pg_temp.c('share'), 'read')$$, 'P0002');
select pg_temp.as_user(pg_temp.c('hadmin'));
select public.set_programme_share_access(pg_temp.c('share'), 'read');
select pg_temp.ok('read access: contribution hidden',
  jsonb_array_length(public.shared_programme_overview(pg_temp.c('hprog')) -> 'contributed_projects') = 0);
select pg_temp.as_user(pg_temp.c('padmin'));
select pg_temp.raises('read access: contributing refused',
  $$select public.contribute_project((select id from public.projects where organisation_id = pg_temp.c('partner') and id <> pg_temp.c('pproj') and archived_at is null limit 1), pg_temp.c('hprog'))$$,
  '42501', 'not_shared');
select pg_temp.as_user(pg_temp.c('hadmin'));
select public.set_programme_share_access(pg_temp.c('share'), 'contribute');
select pg_temp.ok('contribute again: contribution back',
  jsonb_array_length(public.shared_programme_overview(pg_temp.c('hprog')) -> 'contributed_projects') = 1);
select pg_temp.as_user(pg_temp.c('padmin'));
select public.set_organisation_module(pg_temp.c('partner'), 'cross_org', false);
select pg_temp.as_user(pg_temp.c('hadmin'));
select pg_temp.ok('partner module off: contribution hidden from the host',
  jsonb_array_length(public.shared_programme_overview(pg_temp.c('hprog')) -> 'contributed_projects') = 0
  and not (public.programme_partners(pg_temp.c('hprog')) -> 'contributions' -> 0 ->> 'active')::boolean);
select pg_temp.as_user(pg_temp.c('padmin'));
select public.set_organisation_module(pg_temp.c('partner'), 'cross_org', true);
select pg_temp.as_user(pg_temp.c('hadmin'));
select public.set_organisation_module(pg_temp.c('host'), 'cross_org', false);
select pg_temp.as_user(pg_temp.c('pviewer'));
select pg_temp.ok('host module off: partner loses the roll-up', public.shared_programme_overview(pg_temp.c('hprog')) is null);
select pg_temp.as_user(pg_temp.c('hadmin'));
select public.set_organisation_module(pg_temp.c('host'), 'cross_org', true);

-- 9. Withdraw and revoke.
insert into tok select 'inv2', public.create_partner_invite(pg_temp.c('hprog'), 'nhs7.oadmin@example.com', 'read') ->> 'token';
select public.revoke_partner_invite((select id from public.partner_invites where email = 'nhs7.oadmin@example.com'));
select pg_temp.as_user(pg_temp.c('oadmin'));
select public.set_organisation_module(pg_temp.c('other'), 'cross_org', true);
select pg_temp.raises('revoked invitation refused',
  $$select public.accept_partner_invite(pg_temp.t('inv2'), pg_temp.c('other'))$$, 'P0001', 'invite_revoked');
select pg_temp.raises('other organisation can''t withdraw the contribution',
  $$select public.withdraw_contribution(pg_temp.c('contrib'))$$, 'P0002');
select pg_temp.raises('other organisation can''t revoke the share',
  $$select public.revoke_programme_share(pg_temp.c('share'))$$, 'P0002');

select pg_temp.as_user(pg_temp.c('padmin'));
select public.revoke_programme_share(pg_temp.c('share'));
select pg_temp.as_user(pg_temp.c('pviewer'));
select pg_temp.ok('partner left: roll-up gone at once, list empty',
  public.shared_programme_overview(pg_temp.c('hprog')) is null and public.shared_programmes() = '[]'::jsonb);
select pg_temp.ok('partner left: contribution row kept with the partner',
  exists (select 1 from public.programme_contributions where id = pg_temp.c('contrib') and withdrawn_at is null));
select pg_temp.as_user(pg_temp.c('hviewer'));
select pg_temp.ok('partner left: host no longer sees the contributed project',
  jsonb_array_length(public.shared_programme_overview(pg_temp.c('hprog')) -> 'contributed_projects') = 0
  and jsonb_array_length(public.programme_partners(pg_temp.c('hprog')) -> 'shares') = 0);
select pg_temp.as_user(pg_temp.c('hadmin'));
select public.withdraw_contribution(pg_temp.c('contrib'));
select pg_temp.as_user(pg_temp.c('padmin'));
select pg_temp.ok('host withdrew the contribution: kept, marked withdrawn',
  (select withdrawn_at is not null and withdrawn_by = pg_temp.c('hadmin') from public.programme_contributions where id = pg_temp.c('contrib')));

-- 10. Pausing again stops new shares but leaves the pause switch untouched otherwise.
select pg_temp.as_user(pg_temp.c('hadmin'));
insert into tok select 'inv3', public.create_partner_invite(pg_temp.c('hprog'), 'nhs7.padmin@example.com', 'read') ->> 'token';
select pg_temp.as_owner();
select pg_temp.sharing(false);
select pg_temp.as_user(pg_temp.c('padmin'));
select pg_temp.ok('paused: preview says paused', public.partner_invite_preview(pg_temp.t('inv3')) ->> 'status' = 'paused');
select pg_temp.raises('paused: accept refused',
  $$select public.accept_partner_invite(pg_temp.t('inv3'), pg_temp.c('partner'))$$, '42501', 'sharing_paused');
select pg_temp.as_owner();
select pg_temp.ok('paused: no share created', pg_temp.share_access(pg_temp.c('hprog'), pg_temp.c('partner')) is null);

-- 11. anon is closed out of every RPC.
select pg_temp.as_anon();
select pg_temp.raises('anon: shared_programmes', $$select public.shared_programmes()$$, '42501');
select pg_temp.raises('anon: overview', $$select public.shared_programme_overview(pg_temp.c('hprog'))$$, '42501');
select pg_temp.raises('anon: contribute', $$select public.contribute_project(pg_temp.c('pproj'), pg_temp.c('hprog'))$$, '42501');

select pg_temp.as_owner();
select 'nhs_partner_programmes: ' || n || ' checks passed' from passed;
rollback;
