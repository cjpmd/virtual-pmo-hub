-- NHS-1 part 4: the register matrix and the risk re-scoring tool
-- (supabase/migrations/20261123090000_nhs_1d_register_matrix.sql). Needs only the migrations
-- (no seed): creates its own organisation, runs inside a transaction and rolls everything back.
-- Each check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/register_matrix.sql
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;
create temp table out (k text primary key, v jsonb);
grant all on out to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9400000-0000-4000-8000-000000000001', 'nhs1d.admin@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000002', 'nhs1d.pmo@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000003', 'nhs1d.contrib@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000005', 'nhs1d.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9400000-0000-4000-8000-000000000001', 'nhs1d.admin@example.com', 'NHS1d Admin'),
  ('e9400000-0000-4000-8000-000000000002', 'nhs1d.pmo@example.com', 'NHS1d PMO'),
  ('e9400000-0000-4000-8000-000000000003', 'nhs1d.contrib@example.com', 'NHS1d Contributor'),
  ('e9400000-0000-4000-8000-000000000005', 'nhs1d.outsider@example.com', 'NHS1d Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9400000-0000-4000-8000-000000000001'),
  ('pmo', 'e9400000-0000-4000-8000-000000000002'), ('contrib', 'e9400000-0000-4000-8000-000000000003'),
  ('outsider', 'e9400000-0000-4000-8000-000000000005');

create function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true),
         set_config('role', 'authenticated', true); $$;
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
create function pg_temp.o(k text) returns jsonb language sql stable as $$ select v from out where out.k = o.k $$;
grant execute on function pg_temp.o(text) to authenticated, anon;
create function pg_temp.own_default() returns jsonb language sql stable security definer as $$
  select private.org_own_default_matrix(pg_temp.c('org')) $$;
grant execute on function pg_temp.own_default() to authenticated;
create function pg_temp.risk_settings() returns jsonb language sql stable security definer as $$
  select settings -> 'risk' from public.organisations where id = pg_temp.c('org') $$;
grant execute on function pg_temp.risk_settings() to authenticated;
create function pg_temp.audit_events(e text) returns bigint language sql stable security definer as $$
  select count(*) from public.audit_log where organisation_id = pg_temp.c('org') and detail ->> 'event' = e $$;
grant execute on function pg_temp.audit_events(text) to authenticated;
create function pg_temp.risk(r text) returns public.risks language sql stable security definer as $$
  select * from public.risks where organisation_id = pg_temp.c('org') and title = r $$;
grant execute on function pg_temp.risk(text) to authenticated;
create function pg_temp.items(titles text[]) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('id', c.risk_id, 'probability', c.proposed_probability,
                                      'impact', c.proposed_impact, 'updated_at', c.updated_at))
  from public.risk_rescore_candidates(pg_temp.c('org')) c where c.title = any (titles) $$;
grant execute on function pg_temp.items(text[]) to authenticated;

-- An organisation with sample data. Its risks: "Ten" (2 × 5, open), "Six" (2 × 3, open),
-- "Twelve" (3 × 4, open) and "Closed" (4 × 4, closed). All follow the default matrix.
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS1d Org', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('org'));
select pg_temp.as_owner();
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into ctx select 'project', id from public.projects where organisation_id = pg_temp.c('org') and is_sample limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('org'), pg_temp.c('pmo'), 'pmo'), (pg_temp.c('org'), pg_temp.c('contrib'), 'contributor');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('pmo'), 'pmo'),
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('contrib'), 'contributor')
on conflict (workspace_id, profile_id) do update set role = excluded.role;
delete from public.risks where organisation_id = pg_temp.c('org'); -- the sample risk: only this test's risks remain
insert into public.risks (organisation_id, workspace_id, project_id, title, probability, impact, status) values
  (pg_temp.c('org'), pg_temp.c('ws'), pg_temp.c('project'), 'Ten', 2, 5, 'open'),
  (pg_temp.c('org'), pg_temp.c('ws'), pg_temp.c('project'), 'Six', 2, 3, 'open'),
  (pg_temp.c('org'), pg_temp.c('ws'), pg_temp.c('project'), 'Twelve', 3, 4, 'open'),
  (pg_temp.c('org'), pg_temp.c('ws'), pg_temp.c('project'), 'Closed', 4, 4, 'closed');
select pg_temp.ok('fixture: no risk has its own matrix and no organisation default exists',
  not exists (select 1 from public.risks where organisation_id = pg_temp.c('org') and risk_matrix_id is not null)
  and pg_temp.own_default() is null);

-- 1. Without an organisation default nothing changes: settings.risk edits stay as written.
select pg_temp.as_user(pg_temp.c('admin'));
update public.organisations set settings = jsonb_set(settings, '{risk}', coalesce(settings -> 'risk', '{}') || jsonb_build_object(
  'appetiteThreshold', 12, 'bands',
  '[{"id":"b1","label":"Low","minScore":1,"colour":"#2e7d52"},{"id":"b2","label":"High","minScore":9,"colour":"#b3261e"}]'::jsonb))
 where id = pg_temp.c('org');
select pg_temp.ok('no default: custom bands kept', (pg_temp.risk_settings() -> 'bands' -> 1 ->> 'minScore') = '9');
update public.organisations set settings = jsonb_set(settings, '{risk}', '{"appetiteThreshold": 12}')
 where id = pg_temp.c('org');

-- 2. The guard: an incompatible organisation matrix can't be default; a 5 × 5 product one can.
select pg_temp.raises('a 3 × 3 organisation matrix can''t be the default',
  $$insert into public.risk_matrices (organisation_id, key, name, likelihood_levels, consequence_levels, bands, is_default)
    values (pg_temp.c('org'), 'three', 'Three', '[{"value":1,"label":"L"},{"value":2,"label":"M"},{"value":3,"label":"H"}]',
            '[{"value":1,"label":"L"},{"value":2,"label":"M"},{"value":3,"label":"H"}]',
            '[{"min":1,"max":9,"key":"all","label":"All"}]', true)$$, '23514', 'org_matrix_default');
select pg_temp.raises('a 3 × 3 matrix can''t be the register matrix',
  $$select public.set_register_risk_matrix(pg_temp.c('org'), 'nope')$$, '23503');

-- 3. Only admins change the register matrix.
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.raises('PMO can''t change the register matrix',
  $$select public.set_register_risk_matrix(pg_temp.c('org'), 'nhs_5x5')$$, '42501');
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.raises('an outsider can''t change the register matrix',
  $$select public.set_register_risk_matrix(pg_temp.c('org'), 'nhs_5x5')$$, '42501');

-- 4. Admin switches the register to the NHS 5×5.
select pg_temp.as_user(pg_temp.c('admin'));
insert into out select 'switch', public.set_register_risk_matrix(pg_temp.c('org'), 'nhs_5x5');
select pg_temp.ok('switch reports a change and stamps the existing risks',
  (pg_temp.o('switch') ->> 'changed')::boolean
  and (pg_temp.o('switch') ->> 'stamped')::integer = (select count(*) from public.risks where organisation_id = pg_temp.c('org')));
select pg_temp.ok('the NHS 5×5 is copied into the organisation as its default',
  (pg_temp.own_default() ->> 'key') = 'nhs_5x5'
  and (private.org_risk_matrix(pg_temp.c('org')) ->> 'organisation_id')::uuid = pg_temp.c('org'));
select pg_temp.ok('the system NHS 5×5 is unchanged', (select not is_default from public.risk_matrices
  where organisation_id is null and key = 'nhs_5x5'));
select pg_temp.ok('existing risks keep the old (system default) matrix', not exists (
  select 1 from public.risks r where r.organisation_id = pg_temp.c('org')
    and r.risk_matrix_id is distinct from (select id from public.risk_matrices where organisation_id is null and key = 'default')));
select pg_temp.ok('existing risks keep their score and band', public.risk_score((pg_temp.risk('Ten')).id) = 10
  and public.risk_band((pg_temp.risk('Ten')).id) ->> 'label' = 'Elevated');
select pg_temp.ok('settings.risk follows the matrix: labels, bands, key', pg_temp.risk_settings() ->> 'matrixKey' = 'nhs_5x5'
  and pg_temp.risk_settings() -> 'impactLabels' ->> 4 = 'Catastrophic'
  and jsonb_array_length(pg_temp.risk_settings() -> 'bands') = 4
  and pg_temp.risk_settings() -> 'bands' -> 3 ->> 'minScore' = '15'
  and pg_temp.risk_settings() -> 'bands' -> 1 ->> 'label' = 'Moderate');
select pg_temp.ok('appetite threshold kept', pg_temp.risk_settings() ->> 'appetiteThreshold' = '12');
select pg_temp.ok('the change is audited', pg_temp.audit_events('risk.register_matrix_changed') = 1);
insert into out select 'again', public.set_register_risk_matrix(pg_temp.c('org'), 'nhs_5x5');
select pg_temp.ok('choosing the same matrix again changes nothing',
  not (pg_temp.o('again') ->> 'changed')::boolean and pg_temp.audit_events('risk.register_matrix_changed') = 1);

-- 5. A new risk follows the register matrix.
insert into public.risks (organisation_id, workspace_id, project_id, title, probability, impact)
values (pg_temp.c('org'), pg_temp.c('ws'), pg_temp.c('project'), 'New', 2, 5);
select pg_temp.ok('a new risk scores on the NHS 5×5 (10 = High)', (pg_temp.risk('New')).risk_matrix_id is null
  and public.risk_band((pg_temp.risk('New')).id) ->> 'label' = 'High');

-- 6. Settings › Risk writes can't drift from the matrix; the appetite threshold stays editable.
update public.organisations set settings = jsonb_set(jsonb_set(settings, '{risk,bands}',
  '[{"id":"x","label":"Anything","minScore":1,"colour":"#000000"}]'), '{risk,appetiteThreshold}', '9')
 where id = pg_temp.c('org');
select pg_temp.ok('bands re-applied from the matrix, appetite saved',
  jsonb_array_length(pg_temp.risk_settings() -> 'bands') = 4 and pg_temp.risk_settings() ->> 'appetiteThreshold' = '9');
-- Editing the default matrix's bands flows into settings.
update public.risk_matrices set bands = jsonb_set(bands, '{3,label}', '"Severe"')
 where organisation_id = pg_temp.c('org') and key = 'nhs_5x5';
select pg_temp.ok('editing the default matrix updates settings.risk', pg_temp.risk_settings() -> 'bands' -> 3 ->> 'label' = 'Severe');

-- 7. Re-scoring candidates: open risks on another matrix, with proposals.
select pg_temp.ok('candidates: the three open stamped risks (not closed, not new)',
  (select array_agg(title order by title) from public.risk_rescore_candidates(pg_temp.c('org'))) = array['Six', 'Ten', 'Twelve']);
select pg_temp.ok('proposal keeps the levels on a 5 × 5 and shows the new band',
  (select c.proposed_probability = 2 and c.proposed_impact = 5 and c.proposed_score = 10 and c.band_label = 'Elevated'
     and c.proposed_band_label = 'High' and c.band_changes and c.to_matrix_key = 'nhs_5x5' and c.from_matrix_key = 'default'
   from public.risk_rescore_candidates(pg_temp.c('org')) c where c.title = 'Ten'));
select pg_temp.ok('level mapping scales between sizes', private.map_matrix_level(3, 3, 5) = 5
  and private.map_matrix_level(1, 3, 5) = 1 and private.map_matrix_level(2, 3, 5) = 3 and private.map_matrix_level(4, 5, 3) = 3);
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('an outsider sees no candidates', (select count(*) from public.risk_rescore_candidates(pg_temp.c('org'))) = 0);

-- 8. Accepting re-scores.
select pg_temp.as_user(pg_temp.c('contrib'));
insert into out select 'items_ten', pg_temp.items(array['Ten']);
select pg_temp.raises('a contributor can''t re-score', $$select public.rescore_risks(pg_temp.c('org'), pg_temp.o('items_ten'))$$, '42501');
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.raises('an outsider can''t re-score', $$select public.rescore_risks(pg_temp.c('org'), pg_temp.o('items_ten'))$$, '42501');
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.raises('an empty list is refused', $$select public.rescore_risks(pg_temp.c('org'), '[]')$$, '22023');
select pg_temp.raises('a level outside 1–5 is refused', $$select public.rescore_risks(pg_temp.c('org'),
  jsonb_build_array(jsonb_build_object('id', (pg_temp.risk('Ten')).id, 'probability', 6, 'impact', 1)))$$, '23514');
select pg_temp.raises('a closed risk is refused', $$select public.rescore_risks(pg_temp.c('org'),
  jsonb_build_array(jsonb_build_object('id', (pg_temp.risk('Closed')).id, 'probability', 1, 'impact', 1)))$$, '22023');
select pg_temp.raises('a stale proposal is refused', $$select public.rescore_risks(pg_temp.c('org'),
  jsonb_build_array(jsonb_build_object('id', (pg_temp.risk('Ten')).id, 'probability', 2, 'impact', 5,
                                       'updated_at', now() - interval '1 day')))$$, '40001');
select pg_temp.ok('PMO accepts one re-score', public.rescore_risks(pg_temp.c('org'), pg_temp.o('items_ten')) = 1);
select pg_temp.ok('the re-scored risk follows the register matrix (High)', (pg_temp.risk('Ten')).risk_matrix_id is null
  and public.risk_band((pg_temp.risk('Ten')).id) ->> 'label' = 'High');
select pg_temp.ok('it leaves the candidate list', not exists (select 1 from public.risk_rescore_candidates(pg_temp.c('org')) where title = 'Ten'));
select pg_temp.ok('PMO accepts the rest in bulk', public.rescore_risks(pg_temp.c('org'), pg_temp.items(array['Six', 'Twelve'])) = 2);
select pg_temp.ok('no candidates left', (select count(*) from public.risk_rescore_candidates(pg_temp.c('org'))) = 0);
select pg_temp.ok('each acceptance is audited', pg_temp.audit_events('risk.rescored') = 3);
select pg_temp.ok('the closed risk keeps its old matrix', (pg_temp.risk('Closed')).risk_matrix_id is not null);

-- 9. Back to the standard matrix: risks on the NHS register are stamped with it.
select pg_temp.as_user(pg_temp.c('admin'));
insert into out select 'back', public.set_register_risk_matrix(pg_temp.c('org'), 'default');
select pg_temp.ok('back to the system default: no organisation default remains',
  pg_temp.own_default() is null and (pg_temp.o('back') ->> 'stamped')::integer = 4);
select pg_temp.ok('settings.risk follows the system default again', pg_temp.risk_settings() ->> 'matrixKey' = 'default'
  and jsonb_array_length(pg_temp.risk_settings() -> 'bands') = 3 and pg_temp.risk_settings() ->> 'appetiteThreshold' = '9');
select pg_temp.ok('risks scored on the NHS register keep the NHS matrix (High)',
  public.risk_band((pg_temp.risk('Ten')).id) ->> 'label' = 'High');
select pg_temp.ok('they are candidates again', (select count(*) from public.risk_rescore_candidates(pg_temp.c('org'))) = 4);
-- Without an organisation default, settings edits are free again.
update public.organisations set settings = jsonb_set(settings, '{risk,bands}',
  '[{"id":"x","label":"Anything","minScore":1,"colour":"#000000"}]') where id = pg_temp.c('org');
select pg_temp.ok('no default: settings edits stay as written', jsonb_array_length(pg_temp.risk_settings() -> 'bands') = 1);

-- 10. Read-only organisations: nothing changes.
select pg_temp.as_owner();
update public.organisation_subscriptions set trial_ends_at = now() - interval '1 day'
 where organisation_id = pg_temp.c('org');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('read-only: the register matrix can''t change',
  $$select public.set_register_risk_matrix(pg_temp.c('org'), 'nhs_5x5')$$, 'P0001', 'org_read_only');
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.raises('read-only: no re-scoring', $$select public.rescore_risks(pg_temp.c('org'), pg_temp.items(array['Ten']))$$,
  'P0001', 'org_read_only');

-- 11. Grants.
select pg_temp.as_owner();
select pg_temp.ok('anon can''t run the RPCs', not has_function_privilege('anon', 'public.set_register_risk_matrix(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.rescore_risks(uuid,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.risk_rescore_candidates(uuid)', 'execute'));
select pg_temp.ok('private sync helpers are closed to authenticated',
  not has_function_privilege('authenticated', 'private.sync_register_risk_settings(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.org_own_default_matrix(uuid)', 'execute'));

select 'register_matrix: ' || n || ' checks passed' from passed;
rollback;
