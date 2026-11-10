-- GL-11 full-coverage purge test. Reuses GL-10's fixture (lib/ct_fixture.sql): organisations A
-- and B each get a row in every RLS table with organisation_id, plus storage objects in every
-- bucket. Then B is deleted through the real path (request, due, claimed, Stripe and Storage done,
-- purge) and the test checks that B has no row left in any table (public and private) or in
-- Storage, and that A is untouched: the same row count and the same checksum of its rows in
-- every table, and the same storage objects. Runs on the seeded local Postgres inside one
-- transaction that is rolled back. Never run it on production.
--   supabase/tests/local/run.sh migrate && run.sh seed && run.sh purge
\set ON_ERROR_STOP 1
begin;

\ir lib/ct_fixture.sql

create temp table pt_passed (n integer);
insert into pt_passed values (0);
create function pg_temp.pt_ok(name text, cond boolean) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  update pt_passed set n = n + 1;
end $$;
create function pg_temp.pt_raises(name text, sql text, state text, hint text default null) returns void language plpgsql as $$
declare v_state text; v_hint text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint;
    perform pg_temp.pt_ok(name || ' [' || v_state || coalesce(' ' || v_hint, '') || ']',
                          v_state = state and (hint is null or v_hint = hint));
    return;
  end;
  raise exception 'FAIL: % (no error)', name;
end $$;

-- Every table (public and private) with organisation_id, as the purge finds them.
create temp view pt_tables as
select format('%I.%I', n.nspname, c.relname) as rel
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped
where n.nspname in ('public', 'private') and c.relkind = 'r';

-- One line per table: row count and an order-independent checksum of the rows' full text.
create function pg_temp.pt_snapshot(p_org uuid) returns table (rel text, n bigint, checksum text) language plpgsql as $$
declare t record; v_n bigint; v_sum text;
begin
  for t in select * from pt_tables order by 1 loop
    execute format('select count(*), md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from %s x where organisation_id = $1',
                   E'\n', '', t.rel) into v_n, v_sum using p_org;
    rel := t.rel; n := v_n; checksum := v_sum;
    return next;
  end loop;
  -- Storage objects under the organisation's folder (bucket, path and metadata).
  select count(*), md5(coalesce(string_agg(s.bucket_id || ':' || s.name || ':' || coalesce(s.metadata::text, ''), E'\n'
                                           order by s.bucket_id, s.name), ''))
    into v_n, v_sum from storage.objects s where s.name like p_org::text || '/%';
  rel := 'storage.objects'; n := v_n; checksum := v_sum;
  return next;
end $$;

-- Storage objects in every bucket for both organisations (as cross_tenant.sql places them).
insert into storage.objects (bucket_id, name)
select b.bucket_id, b.name from ct_orgs o, lateral (values
  ('org-assets',  o.id || '/logo.png'),
  ('attachments', o.id || '/' || o.ws || '/gl11/attachment.pdf'),
  ('evidence',    o.id || '/' || o.ws || '/gl11/evidence.pdf'),
  ('documents',   (select d.storage_path from public.documents d where d.organisation_id = o.id order by d.created_at limit 1)),
  ('report-pdfs', o.id || '/' || (select r.id from public.reports r where r.organisation_id = o.id order by r.created_at limit 1) || '.pdf')
) b(bucket_id, name)
where b.name is not null
on conflict do nothing;

-- The fixture fills RLS tables; private tables with organisation_id get a row here.
insert into private.health_check_log (run, organisation_id, mismatches) select 'gl11', id, 0 from ct_orgs;
select pg_temp.pt_ok('every table with organisation_id (public and private) has rows for A and B', not exists (
  select 1 from (select rel from pt_tables offset 0) t cross join ct_orgs o where not pg_temp.ct_has_rows(o.id, t.rel::regclass)));

-- Coverage: B has a row in every RLS table (the fixture's guarantee), and objects in all five buckets.
select pg_temp.pt_ok('B has a row in every RLS table with organisation_id', not exists (
  select 1 from (select rel from ct_tables where not is_view offset 0) t where not pg_temp.ct_has_rows(pg_temp.ct_org('B'), t.rel)));
select pg_temp.pt_ok('B has storage objects in all five buckets', (select count(distinct bucket_id) from storage.objects
  where name like pg_temp.ct_org('B')::text || '/%') = 5);

create temp table pt_a_before as select * from pg_temp.pt_snapshot(pg_temp.ct_org('A'));

-- Ask for B's deletion as B's admin (the real RPC), then make it due and claimed with Stripe done.
select pg_temp.ct_as('b_admin');
select public.request_organisation_deletion(pg_temp.ct_org('B'), (select name from public.organisations where id = pg_temp.ct_org('B'))) is not null as requested;
select pg_temp.ct_as_postgres();
update public.organisation_deletions
   set requested_at = now() - interval '31 days', purge_after = now() - interval '1 day',
       purge_started_at = now(), stripe_done_at = now(), storage_done_at = now()
 where organisation_id = pg_temp.ct_org('B');
-- B's snapshot after the request (the request itself writes B's request row and an audit row).
create temp table pt_b_before as select * from pg_temp.pt_snapshot(pg_temp.ct_org('B'));
select pg_temp.pt_ok('A and B both have rows in at least 140 tables', (select count(*) from pt_a_before where n > 0) >= 140
  and (select count(*) from pt_b_before where n > 0) >= 140);

select pg_temp.pt_ok('dry run counts B''s rows and objects, changes nothing',
  (select (r ->> 'total')::bigint = (select sum(n) from pt_b_before where rel <> 'storage.objects')
      and (r ->> 'storage_objects')::bigint = (select n from pt_b_before where rel = 'storage.objects')
   from (select public.purge_organisation(pg_temp.ct_org('B')) r offset 0) x)
  and not exists (select 1 from pg_temp.pt_snapshot(pg_temp.ct_org('B')) s join pt_b_before b using (rel)
                  where s.n <> b.n or s.checksum <> b.checksum));
select pg_temp.pt_raises('refused while B''s storage objects remain',
  format('select public.purge_organisation(%L, false)', pg_temp.ct_org('B')), '55000', 'storage_not_empty');

-- What purge-organisations does through the Storage API (the local shim allows the SQL delete).
delete from storage.objects where name like pg_temp.ct_org('B')::text || '/%';

select pg_temp.pt_ok('B purged', (public.purge_organisation(pg_temp.ct_org('B'), false) ->> 'dry_run')::boolean = false);

-- B: nothing left anywhere.
select pg_temp.pt_ok('B: zero rows in every table and no storage objects (left: ' || coalesce((
  select string_agg(rel || '=' || n, ', ') from pg_temp.pt_snapshot(pg_temp.ct_org('B')) where n > 0), 'none') || ')',
  not exists (select 1 from pg_temp.pt_snapshot(pg_temp.ct_org('B')) where n > 0));
select pg_temp.pt_ok('B: organisation row gone', not exists (select 1 from public.organisations where id = pg_temp.ct_org('B')));
select pg_temp.pt_ok('B: purge logged', exists (select 1 from private.organisation_purge_log where purged_organisation_id = pg_temp.ct_org('B')));
select pg_temp.pt_ok('B''s users keep their accounts', (select count(*) from public.profiles p join ct_users u on u.id = p.id
  where u.org = 'B' and p.closed_at is null) = 3);

-- A: identical row counts and checksums in every table, and the same storage objects.
select pg_temp.pt_ok('A unchanged (differs: ' || coalesce((
  select string_agg(b.rel || ' ' || b.n || '->' || s.n, ', ') from pt_a_before b join pg_temp.pt_snapshot(pg_temp.ct_org('A')) s using (rel)
  where s.n <> b.n or s.checksum <> b.checksum), 'none') || ')',
  not exists (select 1 from pt_a_before b join pg_temp.pt_snapshot(pg_temp.ct_org('A')) s using (rel)
              where s.n <> b.n or s.checksum <> b.checksum));
select pg_temp.pt_ok('A: same table list (none added or lost)',
  (select count(*) from pg_temp.pt_snapshot(pg_temp.ct_org('A'))) = (select count(*) from pt_a_before));
select pg_temp.pt_ok('no markers left', not exists (select 1 from private.privileged_ops));

select 'organisation_purge: ' || n || ' checks passed; B had rows in '
       || (select count(*) from pt_b_before where n > 0) || ' tables (' || (select sum(n) from pt_b_before) || ' rows and objects)' from pt_passed;
rollback;
