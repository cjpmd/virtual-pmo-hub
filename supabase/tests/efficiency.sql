-- NHS-4 part 1: efficiency / savings schemes (CIP): RLS, stage rules, finance validation, actuals,
-- targets, views and scheme impact assessments (supabase/migrations/20261123190000_nhs_4_efficiency.sql).
-- Needs only the migrations (no seed): creates its own organisation, runs inside a transaction and
-- rolls everything back. Each check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/efficiency.sql
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9500000-0000-4000-8000-000000000001', 'nhs4.admin@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000002', 'nhs4.manager@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000003', 'nhs4.lead@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000004', 'nhs4.finance@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000005', 'nhs4.contrib@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000006', 'nhs4.viewer@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000009', 'nhs4.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9500000-0000-4000-8000-000000000001', 'nhs4.admin@example.com', 'NHS4 Admin'),
  ('e9500000-0000-4000-8000-000000000002', 'nhs4.manager@example.com', 'NHS4 Manager'),
  ('e9500000-0000-4000-8000-000000000003', 'nhs4.lead@example.com', 'NHS4 Scheme lead'),
  ('e9500000-0000-4000-8000-000000000004', 'nhs4.finance@example.com', 'NHS4 Finance lead'),
  ('e9500000-0000-4000-8000-000000000005', 'nhs4.contrib@example.com', 'NHS4 Contributor'),
  ('e9500000-0000-4000-8000-000000000006', 'nhs4.viewer@example.com', 'NHS4 Viewer'),
  ('e9500000-0000-4000-8000-000000000009', 'nhs4.outsider@example.com', 'NHS4 Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9500000-0000-4000-8000-000000000001'),
  ('manager', 'e9500000-0000-4000-8000-000000000002'), ('lead', 'e9500000-0000-4000-8000-000000000003'),
  ('finance', 'e9500000-0000-4000-8000-000000000004'), ('contrib', 'e9500000-0000-4000-8000-000000000005'),
  ('viewer', 'e9500000-0000-4000-8000-000000000006'), ('outsider', 'e9500000-0000-4000-8000-000000000009');

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
declare v_state text; v_hint text; v_msg text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
    if not (v_state = state and (hint is null or v_hint = hint)) then
      raise exception 'FAIL: % [% % %]', name, v_state, v_hint, v_msg;
    end if;
    update passed set n = n + 1;
    return;
  end;
  raise exception 'FAIL: % (no error)', name;
end $$;
create function pg_temp.c(k text) returns uuid language sql stable as $$ select v from ctx where ctx.k = c.k $$;
grant execute on function pg_temp.c(text) to authenticated, anon;
create function pg_temp.stage(id uuid) returns text language sql stable security definer as $$
  select stage from public.efficiency_schemes s where s.id = stage.id $$;
grant execute on function pg_temp.stage(uuid) to authenticated, anon;
create function pg_temp.res(p uuid) returns uuid language sql stable security definer as $$
  select r.id from public.resources r where r.profile_id = p and r.organisation_id = pg_temp.c('org') $$;
grant execute on function pg_temp.res(uuid) to authenticated, anon;

-- Organisation (April year) and members.
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS4 Org', p_sector => 'public_sector');
select pg_temp.as_owner();
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('org'), pg_temp.c('manager'), 'manager'), (pg_temp.c('org'), pg_temp.c('lead'), 'contributor'),
  (pg_temp.c('org'), pg_temp.c('finance'), 'contributor'), (pg_temp.c('org'), pg_temp.c('contrib'), 'contributor'),
  (pg_temp.c('org'), pg_temp.c('viewer'), 'viewer');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('manager'), 'manager'),
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('lead'), 'contributor'),
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('finance'), 'contributor'),
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('contrib'), 'contributor'),
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('viewer'), 'viewer')
on conflict do nothing;
select pg_temp.ok('fixture: resources for the lead and finance lead', pg_temp.res(pg_temp.c('lead')) is not null
  and pg_temp.res(pg_temp.c('finance')) is not null);
select pg_temp.ok('financial year starts in April', private.org_financial_year_start(pg_temp.c('org')) = 4);

-- 1. Module off: no schemes.
select pg_temp.as_user(pg_temp.c('manager'));
select pg_temp.raises('module off: manager can''t create a scheme',
  $$insert into public.efficiency_schemes (workspace_id, title) values (pg_temp.c('ws'), 'X')$$, '42501');

-- 2. NHS pack on: categories seeded, scheme created by a manager.
select pg_temp.as_user(pg_temp.c('admin'));
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.ok('NHS categories seeded (8)', (select count(*) from public.lookup_values
  where organisation_id = pg_temp.c('org') and list_key = 'efficiency_category') = 8);
select pg_temp.as_owner();
select pg_temp.ok('seeding again adds nothing',
  private.seed_module_defaults(pg_temp.c('org'), 'efficiency', 'nhs', false) = '[]'::jsonb);
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.ok('defaults: weights and both rules on', (select (s ->> 'requireAssessment')::boolean
  and (s ->> 'requireFinanceValidation')::boolean and (s -> 'confidenceWeights' ->> 'plans_in_progress')::numeric = 0.5
  from public.efficiency_settings(pg_temp.c('org')) s));

select pg_temp.as_user(pg_temp.c('manager'));
insert into public.efficiency_schemes (workspace_id, title, category, business_unit, scheme_lead_id, finance_lead_id,
                                       confidence, finance_validated_at)
values (pg_temp.c('ws'), 'Agency reduction', 'agency_bank', 'Surgery', pg_temp.res(pg_temp.c('lead')),
        pg_temp.res(pg_temp.c('finance')), 'plans_in_progress', now());
insert into ctx select 's1', id from public.efficiency_schemes where title = 'Agency reduction';
select pg_temp.ok('scheme: ref EFF-n, stage idea, client can''t pre-validate', (select ref like 'EFF-%' and stage = 'idea'
  and finance_validated_at is null and organisation_id = pg_temp.c('org') from public.efficiency_schemes where id = pg_temp.c('s1')));
select pg_temp.raises('a manager can''t create a scheme straight into delivery',
  $$insert into public.efficiency_schemes (workspace_id, title, stage) values (pg_temp.c('ws'), 'Y', 'in_delivery')$$,
  'P0001', 'efficiency_stage_blocked');

-- 3. Permissions.
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.raises('contributor can''t create a scheme',
  $$insert into public.efficiency_schemes (workspace_id, title) values (pg_temp.c('ws'), 'Z')$$, '42501');
update public.efficiency_schemes set title = 'Hijack' where id = pg_temp.c('s1');
select pg_temp.ok('contributor reads the scheme but can''t edit it', (select title from public.efficiency_schemes
  where id = pg_temp.c('s1')) = 'Agency reduction');
select pg_temp.raises('contributor (not a lead) can''t add values',
  $$insert into public.efficiency_values (scheme_id, month, kind, recurrent) values (pg_temp.c('s1'), '2026-04-01', 'plan', 1)$$, '42501');
select pg_temp.as_user(pg_temp.c('viewer'));
select pg_temp.ok('viewer reads the scheme', exists (select 1 from public.efficiency_schemes where id = pg_temp.c('s1')));
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('outsider sees nothing', not exists (select 1 from public.efficiency_schemes where id = pg_temp.c('s1'))
  and not exists (select 1 from public.v_efficiency_schemes where id = pg_temp.c('s1')));
select pg_temp.as_user(pg_temp.c('lead'));
insert into public.efficiency_values (scheme_id, month, kind, recurrent, non_recurrent) values
  (pg_temp.c('s1'), '2026-04-01', 'plan', 10000, 0), (pg_temp.c('s1'), '2026-05-01', 'plan', 10000, 5000),
  (pg_temp.c('s1'), '2026-06-01', 'plan', 13000, 0), (pg_temp.c('s1'), '2027-04-01', 'plan', 13000, 0);
select pg_temp.ok('scheme lead adds planned values; organisation and workspace from the scheme',
  (select count(*) = 4 and bool_and(workspace_id = pg_temp.c('ws')) from public.efficiency_values where scheme_id = pg_temp.c('s1')));
select pg_temp.raises('scheme lead can''t validate the plan',
  $$select public.validate_efficiency_scheme(pg_temp.c('s1'))$$, '42501');

-- 4. Stage rules.
select pg_temp.as_user(pg_temp.c('manager'));
update public.efficiency_schemes set stage = 'plan_in_progress' where id = pg_temp.c('s1');
select pg_temp.ok('early stages are free', pg_temp.stage(pg_temp.c('s1')) = 'plan_in_progress');
select pg_temp.ok('stage check lists the plan', public.efficiency_stage_check(pg_temp.c('s1'), 'fully_developed') = array['a delivery plan']);
select pg_temp.raises('fully developed needs a delivery plan',
  $$update public.efficiency_schemes set stage = 'fully_developed' where id = pg_temp.c('s1')$$, 'P0001', 'efficiency_stage_blocked');
update public.efficiency_schemes set delivery_plan = 'Convert agency shifts to bank', stage = 'fully_developed' where id = pg_temp.c('s1');
select pg_temp.ok('fully developed with plan and values', pg_temp.stage(pg_temp.c('s1')) = 'fully_developed');
select pg_temp.ok('stage check before delivery: finance and assessment',
  public.efficiency_stage_check(pg_temp.c('s1'), 'in_delivery') = array['finance validation', 'an approved impact assessment']);
select pg_temp.raises('in delivery needs finance validation and an assessment',
  $$update public.efficiency_schemes set stage = 'in_delivery' where id = pg_temp.c('s1')$$, 'P0001', 'efficiency_stage_blocked');
select pg_temp.raises('client can''t set finance validation directly',
  $$update public.efficiency_schemes set finance_validated_at = now() where id = pg_temp.c('s1')$$, '42501');

select pg_temp.as_user(pg_temp.c('finance'));
select public.validate_efficiency_scheme(pg_temp.c('s1'), true, 'Checked against ledger');
select pg_temp.ok('finance lead validates', (select finance_validated_at is not null and finance_validated_by = pg_temp.c('finance')
  from public.efficiency_schemes where id = pg_temp.c('s1')));

-- Scheme impact assessment (NHS-3): a manager starts it; the owner marks it approved for this test.
select pg_temp.as_user(pg_temp.c('manager'));
select pg_temp.raises('still needs the assessment',
  $$update public.efficiency_schemes set stage = 'in_delivery' where id = pg_temp.c('s1')$$, 'P0001', 'efficiency_stage_blocked');
insert into public.impact_assessments (entity_type, entity_id) values ('efficiency_scheme', pg_temp.c('s1'));
select pg_temp.ok('scheme assessment: scheme link, workspace and title', (select efficiency_scheme_id = pg_temp.c('s1')
  and workspace_id = pg_temp.c('ws') and title like 'Impact assessment: EFF-%' and project_id is null
  from public.impact_assessments where entity_id = pg_temp.c('s1')));
select pg_temp.ok('register view names the scheme', (select target_name like 'EFF-% Agency reduction' and efficiency_scheme_id = pg_temp.c('s1')
  from public.v_impact_assessments where entity_id = pg_temp.c('s1')));
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.raises('contributor can''t assess a scheme',
  $$insert into public.impact_assessments (entity_type, entity_id) values ('efficiency_scheme', pg_temp.c('s1'))$$, '42501');
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.raises('outsider can''t assess another organisation''s scheme',
  $$insert into public.impact_assessments (entity_type, entity_id) values ('efficiency_scheme', pg_temp.c('s1'))$$, '23503');
select pg_temp.as_owner();
update public.impact_assessments set status = 'approved', approved_at = now() where entity_id = pg_temp.c('s1');
select pg_temp.as_user(pg_temp.c('manager'));
update public.efficiency_schemes set stage = 'in_delivery', confidence = 'fully_developed_in_delivery' where id = pg_temp.c('s1');
select pg_temp.ok('in delivery once validated and assessed', pg_temp.stage(pg_temp.c('s1')) = 'in_delivery');
update public.efficiency_schemes set stage = 'on_hold' where id = pg_temp.c('s1');
select pg_temp.as_owner();
update public.impact_assessments set status = 'reassessment_required' where entity_id = pg_temp.c('s1');
select pg_temp.as_user(pg_temp.c('manager'));
select pg_temp.raises('back from hold needs a current approved assessment',
  $$update public.efficiency_schemes set stage = 'in_delivery' where id = pg_temp.c('s1')$$, 'P0001', 'efficiency_stage_blocked');
update public.efficiency_schemes set stage = 'fully_developed' where id = pg_temp.c('s1');
select pg_temp.ok('back to fully developed is free', pg_temp.stage(pg_temp.c('s1')) = 'fully_developed');

-- Rules can be relaxed by an admin; the assessment rule also follows the module.
select pg_temp.raises('manager can''t change the rules',
  $$select public.set_efficiency_settings(pg_temp.c('org'), '{"requireAssessment": false}')$$, '42501');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('weights must be 0–1',
  $$select public.set_efficiency_settings(pg_temp.c('org'), '{"confidenceWeights": {"opportunity": 2}}')$$, '22023');
select public.set_efficiency_settings(pg_temp.c('org'), '{"requireAssessment": false, "confidenceWeights": {"opportunity": 0.1}}');
select pg_temp.ok('settings saved and merged', (select (s ->> 'requireAssessment')::boolean = false
  and (s -> 'confidenceWeights' ->> 'opportunity')::numeric = 0.1
  and (s -> 'confidenceWeights' ->> 'plans_in_progress')::numeric = 0.5 from public.efficiency_settings(pg_temp.c('org')) s));
select pg_temp.as_user(pg_temp.c('manager'));
update public.efficiency_schemes set stage = 'in_delivery' where id = pg_temp.c('s1');
select pg_temp.ok('assessment rule off: delivery allowed', pg_temp.stage(pg_temp.c('s1')) = 'in_delivery');

-- 5. Actuals and validation.
select pg_temp.as_user(pg_temp.c('lead'));
insert into public.efficiency_values (scheme_id, month, kind, recurrent, validated_at)
values (pg_temp.c('s1'), '2026-04-01', 'actual', 9000, now());
select pg_temp.ok('client can''t pre-validate an actual', (select validated_at is null from public.efficiency_values
  where scheme_id = pg_temp.c('s1') and kind = 'actual'));
select pg_temp.raises('scheme lead can''t validate actuals', $$select public.validate_efficiency_actuals(pg_temp.c('s1'))$$, '42501');
select pg_temp.as_user(pg_temp.c('finance'));
select pg_temp.ok('finance lead validates one actual', public.validate_efficiency_actuals(pg_temp.c('s1')) = 1);
select pg_temp.as_user(pg_temp.c('lead'));
update public.efficiency_values set recurrent = 9500 where scheme_id = pg_temp.c('s1') and kind = 'actual';
select pg_temp.ok('changing a validated actual clears validation', (select validated_at is null from public.efficiency_values
  where scheme_id = pg_temp.c('s1') and kind = 'actual'));
select pg_temp.raises('a value can''t change month', $$update public.efficiency_values set month = '2026-07-01'
  where scheme_id = pg_temp.c('s1') and kind = 'actual'$$, '42501');

-- 6. Views and run rate.
select pg_temp.ok('view: this year''s plan (in-year) and risk-adjusted value',
  (select (financial_year <> 2026 or (plan_in_year = 38000 and plan_recurrent_in_year = 33000
            and risk_adjusted_in_year = 38000 and actual_in_year = 9500))
     and assessment_status = 'reassessment_required' and scheme_lead_name is not null
   from public.v_efficiency_schemes where id = pg_temp.c('s1')));
select pg_temp.ok('values view: financial years April to March', (select array_agg(financial_year order by month, kind)
  from public.v_efficiency_values where scheme_id = pg_temp.c('s1')) = array[2026, 2026, 2026, 2026, 2027]);
select pg_temp.ok('run-rate FYE = average of the last three planned recurrent months × 12',
  public.efficiency_run_rate_fye(pg_temp.c('s1')) = round((13000 + 13000 + 10000) / 3.0 * 12, 2));

-- 7. Targets: PMO / admin only.
select pg_temp.as_user(pg_temp.c('manager'));
select pg_temp.raises('manager can''t set a target',
  $$insert into public.efficiency_targets (workspace_id, financial_year, amount) values (pg_temp.c('ws'), 2026, 100)$$, '42501');
select pg_temp.as_user(pg_temp.c('admin'));
insert into public.efficiency_targets (workspace_id, financial_year, amount) values (pg_temp.c('ws'), 2026, 500000);
insert into public.efficiency_targets (workspace_id, financial_year, business_unit, amount) values (pg_temp.c('ws'), 2026, 'Surgery', 120000);
select pg_temp.raises('one workspace-wide target per year',
  $$insert into public.efficiency_targets (workspace_id, financial_year, amount) values (pg_temp.c('ws'), 2026, 1)$$, '23505');

-- 8. Module off: data stays readable, writes refused.
select public.set_organisation_module(pg_temp.c('org'), 'efficiency', false);
select pg_temp.as_user(pg_temp.c('manager'));
select pg_temp.ok('module off: still readable', exists (select 1 from public.v_efficiency_schemes where id = pg_temp.c('s1')));
select pg_temp.raises('module off: edits refused',
  $$update public.efficiency_schemes set title = 'Off' where id = pg_temp.c('s1')$$, '42501');
select pg_temp.as_user(pg_temp.c('finance'));
select pg_temp.raises('module off: validation refused', $$select public.validate_efficiency_actuals(pg_temp.c('s1'))$$, '42501');

select pg_temp.as_owner();
select 'efficiency: ' || n || ' checks passed' from passed;
rollback;
