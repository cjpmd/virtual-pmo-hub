-- Benefits pathway rules (Stage BP2), as the browser sends them: capability acceptance (role,
-- stored evidence, reversal by PMO only), documents and the documents bucket, forecast history,
-- outcome status and indicator validation, the realisation start rule, the acceptance grace
-- setting, the settings check, and cross-organisation isolation. Creates throwaway users and a
-- second organisation; one transaction ending in an exception, so nothing is kept (the final
-- message carries the results).
--   psql "$DB_URL" -f supabase/tests/benefits_pathway.sql
create function pg_temp.act(p_user uuid) returns void language plpgsql as $f$
begin
  if p_user is null then
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claim.sub', p_user::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;
end $f$;

-- The SQLSTATE the statement raised, or 'ok'.
create function pg_temp.try(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $f$;

do $$
declare
  demo_org uuid := (select id from public.organisations where slug = 'demo-university');
  ws uuid := (select id from public.workspaces where organisation_id = demo_org order by created_at limit 1);
  cap uuid := (select id from public.capabilities where organisation_id = demo_org and title = 'Rehearsed business continuity plans');
  bct uuid := (select id from public.projects where organisation_id = demo_org and code = 'BCT');
  outcome uuid := (select id from public.outcomes where organisation_id = demo_org and title = 'Colleagues spend less time on repetitive admin');
  indicator uuid;
  ben uuid := (select id from public.benefits where organisation_id = demo_org and ref = 'BEN-014');
  owner_res uuid := (select id from public.resources where organisation_id = demo_org order by name limit 1);
  contributor uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  pmo uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  other_org uuid;
  other_ws uuid;
  other_portfolio uuid;
  other_programme uuid;
  other_cap uuid;
  other_outcome uuid;
  other_res uuid;
  doc uuid;
  doc_path text;
  m uuid;
  got text;
  n integer;
  h text;
  results text[] := '{}';
  failures integer := 0;
begin
  if demo_org is null or cap is null then raise exception 'Seed the demo organisation first'; end if;

  insert into auth.users (id, email, raw_user_meta_data) values
    (contributor, 'bp-contributor-' || contributor || '@example.invalid', '{"full_name":"BP Contributor"}'),
    (manager, 'bp-manager-' || manager || '@example.invalid', '{"full_name":"BP Manager"}'),
    (pmo, 'bp-pmo-' || pmo || '@example.invalid', '{"full_name":"BP PMO"}'),
    (outsider, 'bp-outsider-' || outsider || '@example.invalid', '{"full_name":"BP Outsider"}');
  insert into public.organisation_members (organisation_id, profile_id, role) values
    (demo_org, contributor, 'viewer'), (demo_org, manager, 'viewer'), (demo_org, pmo, 'pmo');
  insert into public.workspace_members (workspace_id, profile_id, organisation_id, role) values
    (ws, contributor, demo_org, 'contributor'), (ws, manager, demo_org, 'manager');

  -- A second organisation with its own capability and outcome.
  insert into public.organisations (name, slug) values ('Pathway Other', 'bp-other-' || substr(md5(random()::text), 1, 8)) returning id into other_org;
  insert into public.organisation_members (organisation_id, profile_id, role) values (other_org, outsider, 'admin');
  insert into public.workspaces (organisation_id, name) values (other_org, 'Other') returning id into other_ws;
  insert into public.portfolios (workspace_id, name) values (other_ws, 'Other portfolio') returning id into other_portfolio;
  insert into public.programmes (portfolio_id, name) values (other_portfolio, 'Other programme') returning id into other_programme;
  insert into public.capabilities (programme_id, title) values (other_programme, 'Other capability') returning id into other_cap;
  insert into public.outcomes (programme_id, title) values (other_programme, 'Other outcome') returning id into other_outcome;
  insert into public.resources (organisation_id, name) values (other_org, 'Other owner') returning id into other_res;

  -- ======== Acceptance ========
  select rag::text into h from public.v_capability_health where capability_id = cap;
  if h = 'red' then results := array_append(results, 'delivered past target, not accepted -> red: ok');
  else failures := failures + 1; results := array_append(results, format('delivered past target: FAIL (%s)', h)); end if;

  perform pg_temp.act(contributor);
  got := pg_temp.try(format($q$update public.capabilities set status = 'accepted', accepted_at = delivered_date, accepted_by_id = %L where id = %L$q$, owner_res, cap));
  if got = '42501' then results := array_append(results, 'contributor cannot record acceptance: ok');
  else failures := failures + 1; results := array_append(results, format('contributor acceptance: FAIL (%s)', got)); end if;

  perform pg_temp.act(manager);
  got := pg_temp.try(format($q$update public.capabilities set status = 'accepted', accepted_at = delivered_date, accepted_by_id = %L where id = %L$q$, owner_res, cap));
  if got = '23514' then results := array_append(results, 'acceptance without evidence rejected: ok');
  else failures := failures + 1; results := array_append(results, format('no evidence: FAIL (%s)', got)); end if;

  -- A documents row alone (no stored object) is not evidence.
  insert into public.documents (scope, capability_id, file_name, mime_type, size_bytes)
  values ('capability', cap, 'BC exercise sign-off.pdf', 'application/pdf', 2048)
  returning id, storage_path into doc, doc_path;
  if doc_path = format('%s/%s/capability/%s/%s/BC exercise sign-off.pdf', demo_org, ws, cap, doc) then
    results := array_append(results, 'document storage path set by the trigger: ok');
  else failures := failures + 1; results := array_append(results, format('storage path: FAIL (%s)', doc_path)); end if;
  got := pg_temp.try(format($q$update public.capabilities set status = 'accepted', accepted_at = delivered_date, accepted_by_id = %L where id = %L$q$, owner_res, cap));
  if got = '23514' then results := array_append(results, 'documents row without a stored object is not evidence: ok');
  else failures := failures + 1; results := array_append(results, format('row without object: FAIL (%s)', got)); end if;

  -- Upload: only to the path of a visible documents row.
  got := pg_temp.try(format($q$insert into storage.objects (bucket_id, name) values ('documents', %L)$q$,
    format('%s/%s/capability/%s/%s/sneaky.pdf', demo_org, ws, cap, gen_random_uuid())));
  if got = '42501' then results := array_append(results, 'upload to a path with no documents row refused: ok');
  else failures := failures + 1; results := array_append(results, format('upload without row: FAIL (%s)', got)); end if;
  got := pg_temp.try(format($q$insert into storage.objects (bucket_id, name) values ('documents', %L)$q$, doc_path));
  if got = 'ok' then results := array_append(results, 'manager uploads to the documents row path: ok');
  else failures := failures + 1; results := array_append(results, format('upload: FAIL (%s)', got)); end if;

  got := pg_temp.try(format($q$update public.capabilities set status = 'accepted', accepted_at = delivered_date where id = %L$q$, cap));
  if got = '23514' then results := array_append(results, 'acceptance without accepted_by rejected: ok');
  else failures := failures + 1; results := array_append(results, format('no accepted_by: FAIL (%s)', got)); end if;
  got := pg_temp.try(format($q$update public.capabilities set status = 'accepted', accepted_at = delivered_date, accepted_by_id = %L where id = %L$q$, owner_res, cap));
  if got = 'ok' then results := array_append(results, 'manager accepts with stored evidence: ok');
  else failures := failures + 1; results := array_append(results, format('manager acceptance: FAIL (%s)', got)); end if;
  select rag::text into h from public.v_capability_health where capability_id = cap;
  select benefit::text into got from public.v_project_health where project_id = bct;
  if h = 'green' and got = 'green' then results := array_append(results, 'accepted -> capability green, BCT benefit green: ok');
  else failures := failures + 1; results := array_append(results, format('after acceptance: FAIL (%s, %s)', h, got)); end if;

  got := pg_temp.try(format($q$update public.documents set file_name = 'renamed.pdf' where id = %L$q$, doc));
  if got = '42501' then results := array_append(results, 'documents are immutable (archive only): ok');
  else failures := failures + 1; results := array_append(results, format('document update: FAIL (%s)', got)); end if;
  got := pg_temp.try(format($q$delete from storage.objects where bucket_id = 'documents' and name = %L$q$, doc_path));
  select count(*) into n from storage.objects where bucket_id = 'documents' and name = doc_path;
  if n = 1 then results := array_append(results, 'stored evidence cannot be deleted: ok');
  else failures := failures + 1; results := array_append(results, 'evidence delete: FAIL'); end if;

  -- Reversal: PMO only, and audited.
  got := pg_temp.try(format($q$update public.capabilities set status = 'delivered', accepted_at = null, accepted_by_id = null where id = %L$q$, cap));
  if got = '42501' then results := array_append(results, 'manager cannot reverse an acceptance: ok');
  else failures := failures + 1; results := array_append(results, format('manager reversal: FAIL (%s)', got)); end if;
  perform pg_temp.act(pmo);
  got := pg_temp.try(format($q$update public.capabilities set status = 'delivered', accepted_at = null, accepted_by_id = null where id = %L$q$, cap));
  perform pg_temp.act(null);
  select count(*) into n from public.audit_log
  where entity_table = 'capabilities' and entity_id = cap and actor_id = pmo and detail -> 'status' ->> 'from' = 'accepted';
  if got = 'ok' and n = 1 then results := array_append(results, 'PMO reverses an acceptance, audited: ok');
  else failures := failures + 1; results := array_append(results, format('PMO reversal: FAIL (%s, %s)', got, n)); end if;

  -- An archived document no longer counts.
  perform pg_temp.act(manager);
  update public.documents set archived_at = now() where id = doc;
  got := pg_temp.try(format($q$update public.capabilities set status = 'accepted', accepted_at = delivered_date, accepted_by_id = %L where id = %L$q$, owner_res, cap));
  if got = '23514' then results := array_append(results, 'archived evidence does not count: ok');
  else failures := failures + 1; results := array_append(results, format('archived evidence: FAIL (%s)', got)); end if;

  -- ======== Forecast history ========
  update public.capabilities set forecast_date = forecast_date + 7 where id = cap;
  perform pg_temp.act(contributor);
  select count(*) into n from public.capability_forecast_history
  where capability_id = cap and reporting_date = private.org_today(demo_org)
    and forecast_date = (select forecast_date from public.capabilities where id = cap);
  got := pg_temp.try(format($q$insert into public.capability_forecast_history (capability_id, reporting_date, forecast_date) values (%L, current_date - 400, current_date)$q$, cap));
  if n = 1 and got = '42501' then results := array_append(results, 'forecast change recorded by trigger; no client writes: ok');
  else failures := failures + 1; results := array_append(results, format('forecast history: FAIL (%s, %s)', n, got)); end if;

  -- ======== Acceptance grace ========
  perform pg_temp.act(null);
  update public.organisations set settings = jsonb_set(settings, '{health,acceptanceGraceDays}', '30') where id = demo_org;
  select rag::text || ' / ' || reason into h from public.v_capability_health where capability_id = cap;
  if h = 'amber / Awaiting acceptance' then results := array_append(results, 'within the acceptance grace -> amber, Awaiting acceptance: ok');
  else failures := failures + 1; results := array_append(results, format('grace: FAIL (%s)', h)); end if;
  update public.organisations set settings = jsonb_set(settings, '{health,acceptanceGraceDays}', '0') where id = demo_org;
  got := pg_temp.try(format($q$update public.organisations set settings = settings #- '{health,capabilitySlipAmberDays}' where id = %L$q$, demo_org));
  if got = '23514' then results := array_append(results, 'settings without a health threshold rejected: ok');
  else failures := failures + 1; results := array_append(results, format('missing threshold: FAIL (%s)', got)); end if;

  -- ======== Outcomes and indicators ========
  perform pg_temp.act(contributor);
  got := pg_temp.try(format($q$update public.outcomes set status = 'achieved', achieved_date = current_date where id = %L$q$, outcome));
  if got = '42501' then results := array_append(results, 'contributor cannot set achieved: ok');
  else failures := failures + 1; results := array_append(results, format('contributor achieved: FAIL (%s)', got)); end if;
  insert into public.outcome_indicators (outcome_id, name, unit, baseline_value, baseline_date, target_value, target_date)
  values (outcome, 'Test indicator', '%', 0, current_date - 100, 100, current_date + 100) returning id into indicator;
  insert into public.outcome_indicator_measurements (indicator_id, measured_on, actual_value) values (indicator, current_date - 10, 10) returning id into m;
  got := pg_temp.try(format($q$update public.outcome_indicator_measurements set status = 'validated' where id = %L$q$, m));
  if got = '42501' then results := array_append(results, 'contributor cannot validate an indicator measurement: ok');
  else failures := failures + 1; results := array_append(results, format('contributor validate: FAIL (%s)', got)); end if;
  -- 10 against an expected 45 (90 of 200 days): 35% behind -> red; the outcome is now indicator-driven.
  select ih.rag::text || ' ' || round(ih.shortfall_percent) into h from public.v_outcome_indicator_health ih where ih.indicator_id = indicator;
  select oh.rag::text || ' ' || oh.indicator_driven into got from public.v_outcome_health oh where oh.outcome_id = outcome;
  if h = 'red 35' and got = 'red true' then results := array_append(results, 'submitted measurement counts: 35% behind -> red, outcome indicator-driven: ok');
  else failures := failures + 1; results := array_append(results, format('trajectory: FAIL (%s, %s)', h, got)); end if;
  perform pg_temp.act(pmo);
  update public.outcome_indicator_measurements set status = 'queried', query_note = 'Wrong period' where id = m;
  select oh.rag::text || ' ' || oh.indicator_driven into got from public.v_outcome_health oh where oh.outcome_id = outcome;
  if got = 'amber false' then results := array_append(results, 'queried measurement never counts (back to capabilities): ok');
  else failures := failures + 1; results := array_append(results, format('queried: FAIL (%s)', got)); end if;
  got := pg_temp.try(format($q$update public.outcomes set status = 'achieved', achieved_date = current_date where id = %L$q$, outcome));
  select oh.rag::text || ' ' || oh.is_complete into h from public.v_outcome_health oh where oh.outcome_id = outcome;
  if got = 'ok' and h = 'green true' then results := array_append(results, 'PMO sets achieved -> green, complete: ok');
  else failures := failures + 1; results := array_append(results, format('PMO achieved: FAIL (%s, %s)', got, h)); end if;

  -- ======== Realisation start ========
  perform pg_temp.act(manager);
  got := pg_temp.try(format($q$update public.benefits set status = 'in_realisation', realisation_start_date = null where id = %L$q$, ben));
  if got = '23514' then results := array_append(results, 'moving into realisation needs a start date: ok');
  else failures := failures + 1; results := array_append(results, format('realisation start: FAIL (%s)', got)); end if;
  update public.benefits set status = 'in_realisation', realisation_start_date = private.org_today(demo_org) where id = ben;
  select phase into h from public.v_benefit_readiness where benefit_id = ben;
  if h = 'realisation' then results := array_append(results, 'start date reached -> realisation phase: ok');
  else failures := failures + 1; results := array_append(results, format('phase: FAIL (%s)', h)); end if;

  -- ======== Cross-organisation ========
  perform pg_temp.act(outsider);
  select (select count(*) from public.capabilities where organisation_id = demo_org)
       + (select count(*) from public.outcomes where organisation_id = demo_org)
       + (select count(*) from public.outcome_indicators where organisation_id = demo_org)
       + (select count(*) from public.outcome_indicator_measurements where organisation_id = demo_org)
       + (select count(*) from public.documents where organisation_id = demo_org)
       + (select count(*) from public.capability_forecast_history where organisation_id = demo_org)
       + (select count(*) from public.pathway_snapshots where organisation_id = demo_org)
       + (select count(*) from public.v_capability_health where organisation_id = demo_org)
       + (select count(*) from public.v_outcome_health where organisation_id = demo_org)
       + (select count(*) from public.v_outcome_indicator_health where organisation_id = demo_org)
       + (select count(*) from public.v_benefit_readiness where organisation_id = demo_org)
       + (select count(*) from storage.objects where bucket_id = 'documents' and name like demo_org || '/%')
    into n;
  if n = 0 then results := array_append(results, 'outsider sees no pathway rows, views or documents of the demo organisation: ok');
  else failures := failures + 1; results := array_append(results, format('outsider reads: FAIL (%s rows)', n)); end if;
  update public.capabilities set title = 'hijacked' where id = cap;
  get diagnostics n = row_count;
  got := pg_temp.try(format($q$insert into public.documents (scope, capability_id, file_name, mime_type, size_bytes) values ('capability', %L, 'x.pdf', 'application/pdf', 1)$q$, cap));
  h := pg_temp.try(format($q$insert into storage.objects (bucket_id, name) values ('documents', %L)$q$, doc_path || '.copy'));
  if n = 0 and got in ('23503', '42501') and h = '42501' then results := array_append(results, 'outsider cannot update a capability, attach or upload evidence: ok');
  else failures := failures + 1; results := array_append(results, format('outsider writes: FAIL (%s, %s, %s)', n, got, h)); end if;
  perform pg_temp.act(manager);
  update public.capabilities set title = 'hijacked' where id = other_cap;
  get diagnostics n = row_count;
  if n = 0 then results := array_append(results, 'demo manager cannot touch another organisation''s capability: ok');
  else failures := failures + 1; results := array_append(results, 'manager cross-org update: FAIL'); end if;

  -- Tenant guard and composite keys, as the owner (RLS bypassed): links never cross organisations.
  perform pg_temp.act(null);
  got := pg_temp.try(format($q$insert into public.capability_projects (capability_id, project_id) values (%L, %L)$q$, other_cap, bct));
  h := pg_temp.try(format($q$insert into public.outcome_capabilities (outcome_id, capability_id) values (%L, %L)$q$, other_outcome, cap));
  if got = '23503' and h = '23503' then results := array_append(results, 'capability/outcome links across organisations rejected: ok');
  else failures := failures + 1; results := array_append(results, format('cross-org links: FAIL (%s, %s)', got, h)); end if;
  -- (seed mode skips the evidence check, so the foreign key is what's tested)
  perform set_config('vpmo.seeding', 'on', true);
  got := pg_temp.try(format($q$update public.capabilities set status = 'accepted', delivered_date = current_date, accepted_at = current_date, target_date = current_date, accepted_by_id = %L where id = %L$q$, other_res, cap));
  perform set_config('vpmo.seeding', '', true);
  if got = '23503' then results := array_append(results, 'accepted_by from another organisation rejected: ok');
  else failures := failures + 1; results := array_append(results, format('cross-org accepted_by: FAIL (%s)', got)); end if;
  insert into public.outcome_indicators (outcome_id, name, baseline_value, baseline_date, target_value, target_date, organisation_id, workspace_id)
  values (other_outcome, 'Spoofed', 0, current_date, 1, current_date + 1, demo_org, ws) returning id into indicator;
  insert into public.documents (scope, capability_id, file_name, mime_type, size_bytes, organisation_id, workspace_id)
  values ('capability', other_cap, 'spoofed.pdf', 'application/pdf', 1, demo_org, ws) returning storage_path into doc_path;
  select count(*) into n from public.outcome_indicators where id = indicator and organisation_id = other_org and workspace_id = other_ws;
  if n = 1 and doc_path like other_org || '/' || other_ws || '/%' then
    results := array_append(results, 'spoofed organisation_id/workspace_id overwritten from the parent (indicator, document path): ok');
  else failures := failures + 1; results := array_append(results, format('spoofing: FAIL (%s, %s)', n, doc_path)); end if;

  raise exception 'BENEFITS_PATHWAY_RESULT: % failure(s) | %', failures, array_to_string(results, ' | ');
end $$;
