-- GL-22 Collection management: who can create, edit and delete collections and their projects,
-- archive / restore, the delete guard (reports and forums scoped to a collection) and read-only
-- organisations. Needs supabase/seed/reports_demo.sql. Rolled back.
--   supabase/tests/local/run.sh migrate && run.sh seed &&
--   psql -v ON_ERROR_STOP=1 -At -d vpmo -f supabase/tests/collections.sql
begin;

create or replace function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function pg_temp.pid(n int) returns uuid language sql immutable as $$
  select ('d0000000-0000-4000-8000-0000000010' || lpad(n::text, 2, '0'))::uuid $$;
-- Runs a statement and returns the error's hint ('' when it has none), or null when it succeeds.
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
declare
  v_hint text;
  v_state text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate;
  return coalesce(nullif(v_hint, ''), v_state);
end $$;

do $$
declare
  org constant uuid := 'd0000000-0000-4000-8000-000000000100';
  ws constant uuid := 'd0000000-0000-4000-8000-000000000101';
  u_pmo constant uuid := 'd0000000-0000-4000-8000-000000000001';
  u_admin constant uuid := 'd0000000-0000-4000-8000-000000000002';
  u_contrib constant uuid := 'd0000000-0000-4000-8000-000000000003';
  u_viewer constant uuid := 'd0000000-0000-4000-8000-000000000005';
  u_out constant uuid := 'd0000000-0000-4000-8000-000000000006';
  t_fund uuid;
  t_gov uuid;
  coll uuid;
  coll2 uuid;
  coll3 uuid;
  rep uuid;
  forum uuid;
  n int;
  e text;
  checks int := 0;
begin
  select id into t_fund from public.lookup_values where organisation_id = org and list_key = 'collection_type' and label = 'Funding stream';
  select id into t_gov from public.lookup_values where organisation_id = org and list_key = 'collection_type' and label = 'Governance';
  assert t_fund is not null and t_gov is not null, 'SETUP collection types';
  assert private.organisation_is_writable(org), 'SETUP organisation writable';

  -- 1. Create: PMO and admin yes; contributor, viewer and outsider no.
  perform pg_temp.as_user(u_pmo);
  insert into public.collections (organisation_id, workspace_id, name, type_id, pot_amount, archived_by)
  values (org, ws, 'GL-22 Fund', t_fund, 1000000, u_admin) returning id into coll;
  assert (select archived_by is null and archived_at is null from public.collections where id = coll),
    'archived_by is never taken from the client';
  perform pg_temp.as_user(u_admin);
  insert into public.collections (organisation_id, workspace_id, name, type_id)
  values (org, ws, 'GL-22 Board', t_gov) returning id into coll2;
  checks := checks + 2;
  foreach e in array array[u_contrib::text, u_viewer::text, u_out::text] loop
    perform pg_temp.as_user(e::uuid);
    assert pg_temp.err(format($s$insert into public.collections (organisation_id, workspace_id, name, type_id)
      values (%L, %L, 'Nope', %L)$s$, org, ws, t_gov)) in ('42501', '23503'), 'only PMO / admin create (' || e || ')';
    checks := checks + 1;
  end loop;

  -- 2. Name and amounts.
  perform pg_temp.as_user(u_pmo);
  assert pg_temp.err(format($s$insert into public.collections (organisation_id, workspace_id, name, type_id)
    values (%L, %L, '  ', %L)$s$, org, ws, t_gov)) = '23514', 'blank name refused';
  assert pg_temp.err(format('update public.collections set pot_amount = -1 where id = %L', coll)) = '23514',
    'negative pot refused';
  checks := checks + 2;

  -- 3. Projects and awards: PMO adds, edits, removes; others can't.
  insert into public.collection_projects (organisation_id, workspace_id, collection_id, project_id, award_amount)
  values (org, ws, coll, pg_temp.pid(1), 250000), (org, ws, coll, pg_temp.pid(2), null);
  update public.collection_projects set award_amount = 300000 where collection_id = coll and project_id = pg_temp.pid(2);
  assert (select award_amount from public.collection_projects where collection_id = coll and project_id = pg_temp.pid(2)) = 300000,
    'PMO sets an award';
  assert pg_temp.err(format('update public.collection_projects set award_amount = -5 where collection_id = %L', coll)) = '23514',
    'negative award refused';
  checks := checks + 2;
  perform pg_temp.as_user(u_contrib);
  assert pg_temp.err(format($s$insert into public.collection_projects (organisation_id, workspace_id, collection_id, project_id)
    values (%L, %L, %L, %L)$s$, org, ws, coll, pg_temp.pid(3))) = '42501', 'contributor can''t add a project';
  update public.collection_projects set award_amount = 1 where collection_id = coll;
  get diagnostics n = row_count;
  assert n = 0, 'contributor can''t change an award';
  delete from public.collection_projects where collection_id = coll;
  get diagnostics n = row_count;
  assert n = 0, 'contributor can''t remove a project';
  update public.collections set name = 'Renamed' where id = coll;
  get diagnostics n = row_count;
  assert n = 0, 'contributor can''t edit a collection';
  delete from public.collections where id = coll;
  get diagnostics n = row_count;
  assert n = 0, 'contributor can''t delete a collection';
  assert (select count(*) from public.collections where id = coll) = 1, 'contributor still reads the collection';
  checks := checks + 6;
  perform pg_temp.as_user(u_viewer);
  assert (select count(*) from public.collection_projects where collection_id = coll) = 2, 'viewer reads the projects';
  checks := checks + 1;

  -- 4. Archive: read-only until restored.
  perform pg_temp.as_user(u_pmo);
  insert into public.collection_projects (organisation_id, workspace_id, collection_id, project_id)
  values (org, ws, coll2, pg_temp.pid(4));
  update public.collections set archived_at = now(), archived_by = u_admin where id = coll;
  assert (select archived_by from public.collections where id = coll) = u_pmo, 'archived_by is the archiver';
  assert pg_temp.err(format('update public.collections set name = %L where id = %L', 'Renamed', coll)) = 'collection_archived',
    'archived collection can''t be renamed';
  assert pg_temp.err(format('update public.collections set archived_at = now() where id = %L', coll)) = 'collection_archived',
    'archived collection can''t be re-archived';
  assert pg_temp.err(format($s$insert into public.collection_projects (organisation_id, workspace_id, collection_id, project_id)
    values (%L, %L, %L, %L)$s$, org, ws, coll, pg_temp.pid(3))) = 'collection_archived', 'can''t add to an archived collection';
  assert pg_temp.err(format('update public.collection_projects set award_amount = 1 where collection_id = %L', coll)) = 'collection_archived',
    'can''t change an award in an archived collection';
  assert pg_temp.err(format('delete from public.collection_projects where collection_id = %L', coll)) = 'collection_archived',
    'can''t remove from an archived collection';
  assert pg_temp.err(format($s$update public.collection_projects set collection_id = %L
    where collection_id = %L and project_id = %L$s$, coll, coll2, pg_temp.pid(4))) = 'collection_archived',
    'can''t move a link into an archived collection';
  checks := checks + 7;
  -- Restore (with a rename in the same update).
  update public.collections set archived_at = null, name = 'GL-22 Fund (restored)' where id = coll;
  assert (select archived_at is null and archived_by is null and name = 'GL-22 Fund (restored)'
    from public.collections where id = coll), 'restore clears the archive and allows edits';
  insert into public.collection_projects (organisation_id, workspace_id, collection_id, project_id)
  values (org, ws, coll, pg_temp.pid(3));
  checks := checks + 1;
  -- Archiving in the insert itself records the inserter.
  insert into public.collections (organisation_id, workspace_id, name, type_id, archived_at, archived_by)
  values (org, ws, 'GL-22 Archived at birth', t_gov, now(), u_admin) returning id into coll3;
  assert (select archived_by from public.collections where id = coll3) = u_pmo, 'insert records the archiver';
  checks := checks + 1;

  -- 5. Delete guard: a forum or any report scoped to the collection blocks delete.
  perform pg_temp.as_postgres();
  insert into public.forums (organisation_id, workspace_id, name, level, forum_type, scope_type, scope_entity_id)
  values (org, ws, 'GL-22 committee', 'portfolio', 'committee', 'collection', coll) returning id into forum;
  perform pg_temp.as_user(u_pmo);
  assert pg_temp.err(format('delete from public.collections where id = %L', coll)) = 'collection_in_use',
    'a forum scoped to the collection blocks delete';
  perform pg_temp.as_postgres();
  delete from public.forums where id = forum;
  perform pg_temp.as_user(u_pmo);
  rep := public.create_report(jsonb_build_object('scope_type', 'collection', 'scope_entity_id', coll, 'title', 'GL-22 draft'));
  assert pg_temp.err(format('delete from public.collections where id = %L', coll)) = 'collection_in_use',
    'a draft report scoped to the collection blocks delete';
  -- Published (the guard is SECURITY DEFINER, so it counts reports whatever the caller can read;
  -- the outsider check only shows the report is not world-readable).
  perform pg_temp.as_postgres();
  update public.reports set status = 'published', published_at = now() where id = rep;
  perform pg_temp.as_user(u_out);
  assert (select count(*) from public.reports where id = rep) = 0, 'SETUP outsider can''t see the report';
  perform pg_temp.as_postgres();
  assert (select count(*) from public.collections where id = coll) = 1, 'collection still there';
  perform pg_temp.as_user(u_pmo);
  assert pg_temp.err(format('delete from public.collections where id = %L', coll)) = 'collection_in_use',
    'a published report scoped to the collection blocks delete';
  -- Archiving is the way out, and still works.
  update public.collections set archived_at = now() where id = coll;
  assert (select archived_at is not null from public.collections where id = coll), 'in-use collection can be archived';
  checks := checks + 4;

  -- 6. Delete without reports: links cascade, even from an archived collection.
  insert into public.collection_projects (organisation_id, workspace_id, collection_id, project_id)
  values (org, ws, coll2, pg_temp.pid(1)), (org, ws, coll2, pg_temp.pid(2));
  update public.collections set archived_at = now() where id = coll2;
  delete from public.collections where id = coll2;
  get diagnostics n = row_count;
  assert n = 1, 'PMO deletes an unused (archived) collection';
  perform pg_temp.as_postgres();
  assert (select count(*) from public.collection_projects where collection_id = coll2) = 0, 'its project links cascade';
  checks := checks + 2;

  -- 7. Read-only organisation: no writes, reads still work.
  update public.organisation_subscriptions set plan = 'trial', status = null, trial_ends_at = now() - interval '1 day'
  where organisation_id = org;
  assert not private.organisation_is_writable(org), 'SETUP organisation read-only';
  perform pg_temp.as_user(u_pmo);
  assert pg_temp.err(format($s$insert into public.collections (organisation_id, workspace_id, name, type_id)
    values (%L, %L, 'Late', %L)$s$, org, ws, t_gov)) = 'org_read_only', 'read-only: no new collection';
  assert pg_temp.err(format('update public.collections set archived_at = null where id = %L', coll)) = 'org_read_only',
    'read-only: no restore';
  assert pg_temp.err(format('delete from public.collections where id = %L', coll3)) = 'org_read_only',
    'read-only: no delete';
  assert (select count(*) from public.collections where organisation_id = org) >= 2, 'read-only: reads still work';
  checks := checks + 4;

  raise notice 'collections: % checks passed', checks;
end $$;

rollback;
