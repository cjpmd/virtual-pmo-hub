-- GL-16: large report packs overflow to Storage (docs/sql/gl-16-pack-overflow.sql). Needs
-- supabase/seed/reports_demo.sql. Runs in one transaction that is rolled back; each check raises on
-- failure. Never run it on production.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/report_overflow.sql
\set ON_ERROR_STOP 1
begin;

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_role(p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  execute format('set local role %I', p_role);
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon, service_role;
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
create temp table t (k text primary key, v text);
grant all on t to authenticated, anon, service_role;
create function pg_temp.v(p_k text) returns text language sql stable as $$ select v from t where k = p_k $$;
create function pg_temp.id(p_k text) returns uuid language sql stable as $$ select v::uuid from t where k = p_k $$;
grant execute on function pg_temp.v(text), pg_temp.id(text) to authenticated, anon, service_role;

-- Users from the seed: PMO of the demo organisation, a partner-organisation user, and an outsider.
insert into t values ('pmo', 'd0000000-0000-4000-8000-000000000001'), ('partner', 'd0000000-0000-4000-8000-000000000007'),
  ('project', 'd0000000-0000-4000-8000-000000001001'), ('partner_org', 'd0000000-0000-4000-8000-000000000200');
insert into t select 'outsider', m.profile_id from public.organisation_members m
  where m.organisation_id not in ('d0000000-0000-4000-8000-000000000100', 'd0000000-0000-4000-8000-000000000200') limit 1;
select pg_temp.ok('setup: an outsider from a third organisation', pg_temp.v('outsider') is not null);

-- A test-only block (rolled back with the test) returning a payload of config.bytes bytes. Real blocks
-- are private.rb_<key>(ctx, config); narratives are capped at 64 KB, so none reaches 256 KB here.
create function private.rb_gl_test_big(ctx jsonb, config jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('rows', (select jsonb_agg(jsonb_build_object('n', i, 'text', 'Row ' || i || ' of a large pack, café'))
    from generate_series(1, greatest(1, (config ->> 'bytes')::int / 45)) i)) $$;

-- An ad hoc pack: a small summary, a ~300 KB block, and a ~300 KB block hidden from partners.
select pg_temp.as_user(pg_temp.id('pmo'));
insert into t select 'rep', public.create_report(jsonb_build_object('scope_type', 'project', 'scope_entity_id', pg_temp.v('project'),
  'title', 'GL16 overflow', 'ad_hoc', true, 'blocks', jsonb_build_array(
    jsonb_build_object('id', 'small', 'blockKey', 'executive_summary', 'config', '{}'::jsonb, 'placement', 'report'),
    jsonb_build_object('id', 'big', 'blockKey', 'gl_test_big', 'config', '{"bytes": 300000}'::jsonb, 'placement', 'report'),
    jsonb_build_object('id', 'big_hidden', 'blockKey', 'gl_test_big', 'config', '{"bytes": 300000}'::jsonb, 'placement', 'report',
                       'hideFromPartners', true))));
insert into public.report_narratives (report_id, block_instance_id, body) values
  (pg_temp.id('rep'), 'small', '{"format":"markdown","text":"Small"}');
select pg_temp.ok('the pack publishes', (public.publish_report(pg_temp.id('rep')) ->> 'overflow_bytes')::bigint > 2 * 262144);
select pg_temp.as_postgres();
insert into t select 'big', id from public.report_snapshots where report_id = pg_temp.id('rep') and block_instance_id = 'big';
insert into t select 'big_hidden', id from public.report_snapshots where report_id = pg_temp.id('rep') and block_instance_id = 'big_hidden';
insert into t select 'org', organisation_id from public.reports where id = pg_temp.id('rep');

select pg_temp.ok('the small block stays inline', exists (select 1 from public.report_snapshots where report_id = pg_temp.id('rep')
  and block_instance_id = 'small' and not overflowed and data ->> 'narrative' is not null));
select pg_temp.ok('the large blocks overflow: JSON null data, a hash and a size',
  (select count(*) from public.report_snapshots where report_id = pg_temp.id('rep') and overflowed and data = 'null'::jsonb
     and octet_length(payload_sha256) = 32 and payload_bytes > 262144) = 2);
select pg_temp.ok('their payloads are staged, hashing to the published hash',
  (select count(*) from private.report_snapshot_staging g join public.report_snapshots s on s.id = g.snapshot_id
   where g.report_id = pg_temp.id('rep') and extensions.digest(g.data::text, 'sha256') = s.payload_sha256) = 2);
select pg_temp.ok('the meta row is inline', exists (select 1 from public.report_snapshots where report_id = pg_temp.id('rep')
  and block_instance_id = '__meta' and not overflowed));
select pg_temp.raises('the overflow columns can''t be changed',
  $$update public.report_snapshots set overflowed = false, payload_sha256 = null where id = pg_temp.id('big')$$, '42501');

-- Share the pack with the partner organisation (new shares are paused by the GL-10 follow-up;
-- allowed here inside this rolled-back transaction).
do $$ begin
  if to_regclass('private.entity_sharing_settings') is not null then
    execute 'update private.entity_sharing_settings set enabled = true';
  end if;
end $$;
insert into public.entity_shares (organisation_id, workspace_id, entity_type, entity_id, partner_organisation_id)
select organisation_id, workspace_id, 'report', id, pg_temp.id('partner_org') from public.reports where id = pg_temp.id('rep');

-- Reads while staged.
select pg_temp.as_user(pg_temp.id('pmo'));
select pg_temp.ok('PMO reads the staged payload, as hashed',
  (select extensions.digest(public.report_snapshot_staged_payload(pg_temp.id('big')), 'sha256'))
  = (select payload_sha256 from public.report_snapshots where id = pg_temp.id('big')));
select pg_temp.as_user(pg_temp.id('partner'));
select pg_temp.ok('the partner reads the shared block''s staged payload', public.report_snapshot_staged_payload(pg_temp.id('big')) is not null);
select pg_temp.ok('but not the block hidden from partners', public.report_snapshot_staged_payload(pg_temp.id('big_hidden')) is null);
select pg_temp.as_user(pg_temp.id('outsider'));
select pg_temp.ok('an outsider reads nothing', public.report_snapshot_staged_payload(pg_temp.id('big')) is null);
select pg_temp.raises('signed-in users can''t list staged payloads', $$select * from public.report_snapshot_staged(null)$$, '42501');
select pg_temp.raises('or complete a move', $$select public.complete_snapshot_overflow(pg_temp.id('big'), 'x', 'y')$$, '42501');
select pg_temp.raises('or fail one', $$select public.fail_snapshot_overflow(pg_temp.id('big'), 'x')$$, '42501');
select pg_temp.raises('or read by token', $$select * from public.report_overflow_by_token(pg_temp.id('rep'), 'x', array[pg_temp.id('big')])$$, '42501');
select pg_temp.as_role('anon');
select pg_temp.raises('anon can''t read staged payloads', $$select public.report_snapshot_staged_payload(pg_temp.id('big'))$$, '42501');
select pg_temp.as_postgres();

-- The print token path.
select pg_temp.as_role('service_role');
insert into t select 'token', public.issue_report_print_token(pg_temp.id('rep'));
select pg_temp.as_postgres();
select pg_temp.as_role('anon');
select pg_temp.ok('the token read flags overflowed rows with their hash',
  (select count(*) from jsonb_array_elements(public.report_snapshot_by_token(pg_temp.id('rep'), pg_temp.v('token')) -> 'snapshots') e
   where (e ->> 'overflowed')::boolean and length(e ->> 'sha256') = 64 and e -> 'data' = 'null'::jsonb and e ->> 'id' is not null) = 2);
select pg_temp.as_postgres();
select pg_temp.as_role('service_role');
select pg_temp.ok('by token, staged: the payload',
  (select count(*) from public.report_overflow_by_token(pg_temp.id('rep'), pg_temp.v('token'), array[pg_temp.id('big'), pg_temp.id('big_hidden')])
   where payload is not null and storage_path is null) = 2);
select pg_temp.ok('by token, a wrong token: nothing',
  not exists (select 1 from public.report_overflow_by_token(pg_temp.id('rep'), 'wrong', array[pg_temp.id('big')])));
select pg_temp.ok('by token, an inline snapshot isn''t served',
  not exists (select 1 from public.report_overflow_by_token(pg_temp.id('rep'), pg_temp.v('token'),
    array[(select id from public.report_snapshots where report_id = pg_temp.id('rep') and block_instance_id = 'small')])));

-- Moving to Storage (service role).
select pg_temp.ok('staged list: two rows, paths <org>/<report>/<snapshot>.json, payload hashing to sha256',
  (select count(*) from public.report_snapshot_staged(pg_temp.id('rep')) s
   where s.storage_path = pg_temp.v('org') || '/' || pg_temp.v('rep') || '/' || s.snapshot_id || '.json'
     and encode(extensions.digest(s.payload, 'sha256'), 'hex') = s.sha256) = 2);
select pg_temp.ok('a failure is counted', public.fail_snapshot_overflow(pg_temp.id('big'), 'test') = 1);
select pg_temp.raises('a wrong hash is refused',
  format($$select public.complete_snapshot_overflow(%L, %L, %L)$$, pg_temp.v('big'),
         pg_temp.v('org') || '/' || pg_temp.v('rep') || '/' || pg_temp.v('big') || '.json', repeat('0', 64)), '22023', 'hash_mismatch');
select pg_temp.raises('a wrong path is refused',
  format($$select public.complete_snapshot_overflow(%L, 'elsewhere.json', (select sha256 from public.report_snapshot_staged(%L) where snapshot_id = %L))$$,
         pg_temp.v('big'), pg_temp.v('rep'), pg_temp.v('big')), '22023', 'bad_path');
select public.complete_snapshot_overflow(s.snapshot_id, s.storage_path, s.sha256) from public.report_snapshot_staged(pg_temp.id('rep')) s;
select pg_temp.as_postgres();
insert into storage.objects (bucket_id, name)
select 'report-snapshots', storage_path from public.report_snapshot_objects where report_id = pg_temp.id('rep');
select pg_temp.ok('both recorded and unstaged',
  (select count(*) from public.report_snapshot_objects where report_id = pg_temp.id('rep')) = 2
  and not exists (select 1 from private.report_snapshot_staging where report_id = pg_temp.id('rep')));
select pg_temp.as_role('service_role');
select pg_temp.raises('a move completes once', format($$select public.complete_snapshot_overflow(%L, 'x', 'y')$$, pg_temp.v('big')), 'P0002', 'not_staged');
select pg_temp.ok('by token, moved: the object path',
  (select count(*) from public.report_overflow_by_token(pg_temp.id('rep'), pg_temp.v('token'), array[pg_temp.id('big')])
   where storage_path is not null and payload is null) = 1);
select pg_temp.as_postgres();
select pg_temp.raises('object rows can''t be changed',
  $$update public.report_snapshot_objects set storage_path = 'x' where snapshot_id = pg_temp.id('big')$$, '42501');

-- Reads once moved: the object row and the bucket follow the snapshot's own visibility.
select pg_temp.as_user(pg_temp.id('pmo'));
select pg_temp.ok('PMO sees both objects (row and file)',
  (select count(*) from public.report_snapshot_objects where report_id = pg_temp.id('rep')) = 2
  and (select count(*) from storage.objects where bucket_id = 'report-snapshots' and name like pg_temp.v('org') || '/' || pg_temp.v('rep') || '/%') = 2);
select pg_temp.ok('the staged read returns nothing once moved', public.report_snapshot_staged_payload(pg_temp.id('big')) is null);
select pg_temp.as_user(pg_temp.id('partner'));
select pg_temp.ok('the partner sees the shared block''s object, not the hidden one',
  (select array_agg(snapshot_id) from public.report_snapshot_objects where report_id = pg_temp.id('rep')) = array[pg_temp.id('big')]
  and (select array_agg(name) from storage.objects where bucket_id = 'report-snapshots' and name like '%/' || pg_temp.v('rep') || '/%')
      = array[pg_temp.v('org') || '/' || pg_temp.v('rep') || '/' || pg_temp.v('big') || '.json']);
select pg_temp.as_user(pg_temp.id('outsider'));
select pg_temp.ok('an outsider sees neither',
  not exists (select 1 from public.report_snapshot_objects where report_id = pg_temp.id('rep'))
  and not exists (select 1 from storage.objects where bucket_id = 'report-snapshots' and name like '%/' || pg_temp.v('rep') || '/%'));
select pg_temp.raises('nobody signed in can upload to the bucket',
  format($$insert into storage.objects (bucket_id, name) values ('report-snapshots', %L)$$,
         pg_temp.v('org') || '/' || pg_temp.v('rep') || '/' || gen_random_uuid() || '.json'), '42501');
select pg_temp.as_postgres();

-- Limits: one block over 50 MB is refused, and nothing is published.
select pg_temp.as_user(pg_temp.id('pmo'));
insert into t select 'rep2', public.create_report(jsonb_build_object('scope_type', 'project', 'scope_entity_id', pg_temp.v('project'),
  'title', 'GL16 too large', 'ad_hoc', true, 'blocks', jsonb_build_array(
    jsonb_build_object('id', 'huge', 'blockKey', 'gl_test_big', 'config', '{"bytes": 53000000}'::jsonb, 'placement', 'report'))));
select pg_temp.raises('a block over 50 MB is refused', $$select public.publish_report(pg_temp.id('rep2'))$$, '54000');
select pg_temp.as_postgres();
select pg_temp.ok('and nothing of it was kept', not exists (select 1 from public.report_snapshots where report_id = pg_temp.id('rep2'))
  and (select status from public.reports where id = pg_temp.id('rep2')) = 'draft');

select 'report_overflow: ' || n || ' checks passed' from passed;
rollback;
