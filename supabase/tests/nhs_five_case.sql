-- NHS-5: Five Case Model business cases (supabase/migrations/20261123084500_nhs_5_five_case.sql,
-- docs/sql/nhs-5-five-case.sql). Needs only the migrations (no seed): creates its own organisation,
-- runs inside a transaction and rolls everything back. Each check raises on failure; the last line
-- prints the count passed. Cross-tenant cases are in cross_tenant.sql.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/nhs_five_case.sql
\set ON_ERROR_STOP 1
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;
create temp table snap (k text primary key, v text);
grant all on snap to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9500000-0000-4000-8000-000000000001', 'nhs5.admin@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000002', 'nhs5.pmo@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000003', 'nhs5.contrib@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000004', 'nhs5.viewer@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000005', 'nhs5.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9500000-0000-4000-8000-000000000001', 'nhs5.admin@example.com', 'NHS5 Admin'),
  ('e9500000-0000-4000-8000-000000000002', 'nhs5.pmo@example.com', 'NHS5 PMO'),
  ('e9500000-0000-4000-8000-000000000003', 'nhs5.contrib@example.com', 'NHS5 Contributor'),
  ('e9500000-0000-4000-8000-000000000004', 'nhs5.viewer@example.com', 'NHS5 Viewer'),
  ('e9500000-0000-4000-8000-000000000005', 'nhs5.outsider@example.com', 'NHS5 Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9500000-0000-4000-8000-000000000001'),
  ('pmo', 'e9500000-0000-4000-8000-000000000002'), ('contrib', 'e9500000-0000-4000-8000-000000000003'),
  ('viewer', 'e9500000-0000-4000-8000-000000000004'), ('outsider', 'e9500000-0000-4000-8000-000000000005');

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
create function pg_temp.vstatus(v uuid) returns text language sql stable security definer as $$
  select status::text from public.business_case_versions where id = v $$;
create function pg_temp.vstage(v uuid) returns text language sql stable security definer as $$
  select stage from public.business_case_versions where id = v $$;
create function pg_temp.gate(v uuid) returns uuid language sql stable security definer as $$
  select id from public.approval_gates where entity_type = 'business_case_version' and entity_id = v $$;
create function pg_temp.step(v uuid, n integer) returns uuid language sql stable security definer as $$
  select s.id from public.approval_steps s join public.approval_gates g on g.id = s.gate_id
  where g.entity_type = 'business_case_version' and g.entity_id = v and s.step_order = n $$;
create function pg_temp.count_in(t text, v uuid) returns bigint language plpgsql stable security definer as $$
declare n bigint; begin execute format('select count(*) from public.%I where version_id = $1', t) into n using v; return n; end $$;
-- Fill every required section and give the preferred option its costs.
create function pg_temp.complete(v uuid) returns void language sql as $$
  update public.business_case_sections set content = 'Done.' where version_id = v and is_required;
$$;

-- A public-sector organisation with sample projects; general pack.
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS5 Org', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('org'));
select pg_temp.as_owner();
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into ctx select 'p1', id from public.projects where organisation_id = pg_temp.c('org') order by code limit 1;
insert into ctx select 'p2', id from public.projects where organisation_id = pg_temp.c('org') order by code offset 1 limit 1;
insert into ctx select 'p3', id from public.projects where organisation_id = pg_temp.c('org') order by code offset 2 limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('org'), pg_temp.c('pmo'), 'pmo'), (pg_temp.c('org'), pg_temp.c('contrib'), 'contributor'),
  (pg_temp.c('org'), pg_temp.c('viewer'), 'viewer');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('contrib'), 'contributor'),
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('viewer'), 'viewer')
on conflict do nothing;
select pg_temp.ok('standard templates have set_key standard',
  (select count(*) from public.business_case_templates where organisation_id = pg_temp.c('org') and set_key = 'standard') = 5
  and not exists (select 1 from public.business_case_templates where organisation_id = pg_temp.c('org') and set_key <> 'standard'));

-- 1. Module off: nothing changes for an ordinary case, and five-case features are refused.
select pg_temp.as_user(pg_temp.c('admin'));
with x as (insert into public.business_cases (workspace_id, organisation_id, project_id, title)
  values (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('p1'), 'Standard case') returning id)
insert into ctx select 'c1', id from x;
insert into ctx select 'c1v1', public.start_business_case_version(pg_temp.c('c1'));
select pg_temp.ok('standard case: five standard sections', pg_temp.count_in('business_case_sections', pg_temp.c('c1v1')) = 5);
select pg_temp.ok('standard case: single stage, 3.5% discount',
  (select stage = 'single' and discount_rate = 3.5 and appraisal_years = 10 from public.business_case_versions where id = pg_temp.c('c1v1')));
select pg_temp.raises('module off: five-case template set refused',
  $$insert into public.business_cases (workspace_id, organisation_id, project_id, title, template_set)
    values (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('p2'), 'X', 'five_case')$$, 'P0001', 'module_off');
select pg_temp.raises('module off: stage refused',
  $$update public.business_case_versions set stage = 'soc' where id = pg_temp.c('c1v1')$$, 'P0001', 'module_off');
select pg_temp.raises('module off: start_business_case_stage refused',
  $$select public.start_business_case_stage(pg_temp.c('c1'), 'soc')$$, 'P0001', 'module_off');
select pg_temp.raises('module off: objectives not writable',
  $$insert into public.business_case_objectives (version_id, kind, title) values (pg_temp.c('c1v1'), 'spending_objective', 'X')$$, '42501');
select pg_temp.raises('module off: routes not editable',
  $$select public.set_business_case_approval_routes(pg_temp.c('org'), '{}')$$, 'P0001', 'module_off');
with x as (insert into public.business_case_options (version_id, name, whole_life_cost, delivery_cost, is_preferred)
  values (pg_temp.c('c1v1'), 'Do it', 100000, 80000, true) returning id)
insert into ctx select 'c1o1', id from x;
select pg_temp.complete(pg_temp.c('c1v1'));
select public.submit_business_case(pg_temp.c('c1v1'));
select pg_temp.ok('module off: submit opens no gate', pg_temp.gate(pg_temp.c('c1v1')) is null
  and pg_temp.vstatus(pg_temp.c('c1v1')) = 'submitted');

-- 2. Switching the module on seeds the set, labels and routes, once.
select public.set_organisation_module(pg_temp.c('org'), 'five_case', true);
select pg_temp.as_owner();
select pg_temp.ok('five-case set seeded (14 sections, 5 cases)',
  (select count(*) = 14 and count(distinct case_group) = 5 from public.business_case_templates
   where organisation_id = pg_temp.c('org') and set_key = 'five_case'));
select pg_temp.ok('general routes seeded for every stage',
  (select settings -> 'fiveCase' -> 'approvalRoutes' from public.organisations where id = pg_temp.c('org'))
    ?& array['single', 'soc', 'obc', 'fbc']);
update public.business_case_templates set title = 'Our context' where organisation_id = pg_temp.c('org') and key = 'fc_strategic_context';
select pg_temp.as_user(pg_temp.c('admin'));
select public.set_organisation_module(pg_temp.c('org'), 'five_case', false);
select public.set_organisation_module(pg_temp.c('org'), 'five_case', true);
select pg_temp.as_owner();
select pg_temp.ok('switching off and on keeps edits and adds nothing',
  (select count(*) from public.business_case_templates where organisation_id = pg_temp.c('org') and set_key = 'five_case') = 14
  and exists (select 1 from public.business_case_templates where organisation_id = pg_temp.c('org')
              and key = 'fc_strategic_context' and title = 'Our context'));

-- 3. Approval routes.
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.raises('PMO can''t set routes', $$select public.set_business_case_approval_routes(pg_temp.c('org'), '{}')$$, '42501');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('unknown stage',
  $$select public.set_business_case_approval_routes(pg_temp.c('org'), '{"xyz": []}')$$, '22023');
select pg_temp.raises('unknown governance role',
  $$select public.set_business_case_approval_routes(pg_temp.c('org'), '{"soc": [{"name": "Board", "governanceRole": "astronaut"}]}')$$, '22023');
select pg_temp.raises('negative threshold',
  $$select public.set_business_case_approval_routes(pg_temp.c('org'),
    '{"soc": [{"name": "Board", "governanceRole": "finance_lead", "minValue": -1}]}')$$, '22023');
select pg_temp.ok('routes saved and normalised',
  public.set_business_case_approval_routes(pg_temp.c('org'), '{
    "soc": [{"name": " Finance lead ", "governanceRole": "finance_lead"}],
    "obc": [{"name": "Finance lead", "governanceRole": "finance_lead", "minValue": null},
            {"name": "Investment board", "governanceRole": "head_of_pmo", "minValue": 1000000}],
    "fbc": [{"name": "Finance lead", "governanceRole": "finance_lead"}],
    "single": []}') -> 'soc' -> 0 ->> 'name' = 'Finance lead');

-- 4. A Five Case Model case: sections from the set, stages, lists and appraisal years.
with x as (insert into public.business_cases (workspace_id, organisation_id, project_id, title, template_set)
  values (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('p2'), 'New outpatients hub', 'five_case') returning id)
insert into ctx select 'c2', id from x;
select pg_temp.raises('unknown template set refused',
  $$insert into public.business_cases (workspace_id, organisation_id, project_id, title, template_set)
    values (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('p3'), 'X', 'nonexistent')$$, '22023');
insert into ctx select 'c2v1', public.start_business_case_stage(pg_temp.c('c2'), 'soc');
select pg_temp.ok('first version takes the five-case sections', pg_temp.count_in('business_case_sections', pg_temp.c('c2v1')) = 14);
select pg_temp.ok('first version is an SOC', pg_temp.vstage(pg_temp.c('c2v1')) = 'soc');
select pg_temp.raises('template set fixed once a version exists',
  $$update public.business_cases set template_set = 'standard' where id = pg_temp.c('c2')$$, '22023');
insert into public.business_case_objectives (version_id, kind, title, measure, sort_order) values
  (pg_temp.c('c2v1'), 'spending_objective', 'Cut outpatient waits', 'Median wait in weeks', 1),
  (pg_temp.c('c2v1'), 'critical_success_factor', 'Affordable within the capital plan', null, 2);
select pg_temp.raises('objective kind checked',
  $$insert into public.business_case_objectives (version_id, kind, title) values (pg_temp.c('c2v1'), 'wish', 'X')$$, '23514');
with x as (insert into public.business_case_options (version_id, name, list_stage, shortlist_note)
  values (pg_temp.c('c2v1'), 'Do nothing', 'long', 'Discounted: does not meet the objectives') returning id)
insert into ctx select 'c2bau', id from x;
select pg_temp.raises('a long-list option can''t be preferred',
  $$update public.business_case_options set is_preferred = true where id = pg_temp.c('c2bau')$$, '23514');
with x as (insert into public.business_case_options (version_id, name, whole_life_cost, delivery_cost,
  is_preferred, optimism_bias_pct) values (pg_temp.c('c2v1'), 'New build', 500000, 400000, true, 24) returning id)
insert into ctx select 'c2o', id from x;
insert into public.business_case_option_years (version_id, option_id, year_index, capital_cost, revenue_cost, cash_benefit, non_cash_benefit)
values (pg_temp.c('c2v1'), pg_temp.c('c2o'), 0, 400000, 0, 0, 0),
       (pg_temp.c('c2v1'), pg_temp.c('c2o'), 1, 0, 20000, 60000, 30000);
select pg_temp.raises('one row per option and year',
  $$insert into public.business_case_option_years (version_id, option_id, year_index) values (pg_temp.c('c2v1'), pg_temp.c('c2o'), 1)$$, '23505');
select pg_temp.raises('option and version must match',
  $$insert into public.business_case_option_years (version_id, option_id, year_index) values (pg_temp.c('c2v1'), pg_temp.c('c1o1'), 2)$$, '23503');
select pg_temp.as_user(pg_temp.c('viewer'));
select pg_temp.ok('viewers read the objectives', (select count(*) from public.business_case_objectives) = 2);
select pg_temp.raises('viewers can''t add objectives',
  $$insert into public.business_case_objectives (version_id, kind, title) values (pg_temp.c('c2v1'), 'spending_objective', 'X')$$, '42501');

-- 5. Submit opens the SOC route's gate; only the governance role holder decides it.
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.complete(pg_temp.c('c2v1'));
select public.submit_business_case(pg_temp.c('c2v1'));
select pg_temp.ok('submit opens a gate with the route''s one step',
  pg_temp.gate(pg_temp.c('c2v1')) is not null and pg_temp.step(pg_temp.c('c2v1'), 1) is not null
  and pg_temp.step(pg_temp.c('c2v1'), 2) is null);
select pg_temp.ok('the step names the governance role',
  (select governance_role = 'finance_lead' and required_role = 'Finance lead' from public.approval_steps
   where id = pg_temp.step(pg_temp.c('c2v1'), 1)));
select pg_temp.raises('submitted: objectives frozen',
  $$update public.business_case_objectives set title = 'Changed' where version_id = pg_temp.c('c2v1')$$, '42501');
select pg_temp.raises('submitted: appraisal years frozen',
  $$delete from public.business_case_option_years where version_id = pg_temp.c('c2v1')$$, '42501');
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.raises('a contributor can''t delete a route step',
  $$delete from public.approval_steps where id = pg_temp.step(pg_temp.c('c2v1'), 1)$$, '42501', 'business_case_gate');
select pg_temp.raises('a contributor can''t add a step',
  $$insert into public.approval_steps (gate_id, step_order, required_role) values (pg_temp.gate(pg_temp.c('c2v1')), 5, 'Me')$$,
  '42501', 'business_case_gate');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('an admin can''t approve the gate directly',
  $$update public.approval_gates set status = 'approved' where id = pg_temp.gate(pg_temp.c('c2v1'))$$, '42501', 'business_case_gate');
select pg_temp.raises('an admin can''t create a business case gate',
  $$insert into public.approval_gates (workspace_id, organisation_id, entity_type, entity_id, gate_type, name)
    values (pg_temp.c('ws'), pg_temp.c('org'), 'business_case_version', pg_temp.c('c2v1'), 'business_case', 'X')$$,
  '42501', 'business_case_gate');
select pg_temp.raises('the step needs the finance lead',
  $$select public.decide_approval_step(pg_temp.step(pg_temp.c('c2v1'), 1), 'approved')$$, '42501', 'governance_role_required');
select pg_temp.raises('the version can''t be approved by a direct update',
  $$update public.business_case_versions set status = 'approved' where id = pg_temp.c('c2v1')$$, '42501');
insert into public.governance_role_holders (organisation_id, role_key, profile_id)
values (pg_temp.c('org'), 'finance_lead', pg_temp.c('contrib'));
select pg_temp.as_user(pg_temp.c('contrib'));
select public.decide_approval_step(pg_temp.step(pg_temp.c('c2v1'), 1), 'approved', 'Fine');
select pg_temp.ok('approving the last step approves the SOC', pg_temp.vstatus(pg_temp.c('c2v1')) = 'approved'
  and (select decided_at is not null and recorded_by = pg_temp.c('contrib') from public.business_case_versions where id = pg_temp.c('c2v1')));

-- 6. The next stage carries the content forward; stages only move one step at a time.
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('can''t jump from an approved SOC to an FBC',
  $$select public.start_business_case_stage(pg_temp.c('c2'), 'fbc')$$, '22023', 'business_case_stage');
insert into ctx select 'c2v2', public.start_business_case_stage(pg_temp.c('c2'), 'obc');
select pg_temp.ok('OBC version started', pg_temp.vstage(pg_temp.c('c2v2')) = 'obc' and pg_temp.vstatus(pg_temp.c('c2v2')) = 'draft');
select pg_temp.ok('objectives carried forward', pg_temp.count_in('business_case_objectives', pg_temp.c('c2v2')) = 2);
select pg_temp.ok('appraisal years carried forward to the new options',
  pg_temp.count_in('business_case_option_years', pg_temp.c('c2v2')) = 2
  and (select count(*) from public.business_case_option_years y join public.business_case_options o on o.id = y.option_id
       where y.version_id = pg_temp.c('c2v2') and o.version_id = pg_temp.c('c2v2') and o.name = 'New build') = 2);
select pg_temp.ok('option list fields carried forward',
  (select list_stage = 'long' and shortlist_note like 'Discounted%' from public.business_case_options
   where version_id = pg_temp.c('c2v2') and name = 'Do nothing')
  and (select optimism_bias_pct = 24 from public.business_case_options where version_id = pg_temp.c('c2v2') and name = 'New build'));
select pg_temp.raises('a staged case can''t become single-stage',
  $$update public.business_case_versions set stage = 'single' where id = pg_temp.c('c2v2')$$, '22023', 'business_case_stage');

-- 7. A threshold step applies only at or above its value; a rejection rejects the version.
select pg_temp.complete(pg_temp.c('c2v2'));
select public.submit_business_case(pg_temp.c('c2v2'));
select pg_temp.ok('below the threshold: one step', pg_temp.step(pg_temp.c('c2v2'), 1) is not null and pg_temp.step(pg_temp.c('c2v2'), 2) is null);
select pg_temp.as_user(pg_temp.c('contrib'));
select public.decide_approval_step(pg_temp.step(pg_temp.c('c2v2'), 1), 'rejected', 'Return for revision');
select pg_temp.ok('rejecting the step rejects the version', pg_temp.vstatus(pg_temp.c('c2v2')) = 'rejected');
select pg_temp.ok('the approved SOC stays approved', pg_temp.vstatus(pg_temp.c('c2v1')) = 'approved');
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'c2v3', public.start_business_case_version(pg_temp.c('c2'));
select pg_temp.ok('revising keeps the OBC stage', pg_temp.vstage(pg_temp.c('c2v3')) = 'obc');
update public.business_case_options set whole_life_cost = 2500000 where version_id = pg_temp.c('c2v3') and is_preferred;
select pg_temp.complete(pg_temp.c('c2v3'));
select public.submit_business_case(pg_temp.c('c2v3'));
select pg_temp.ok('at the threshold: the board step is added',
  (select required_role from public.approval_steps where id = pg_temp.step(pg_temp.c('c2v3'), 2)) = 'Investment board');
insert into public.governance_role_holders (organisation_id, role_key, profile_id)
values (pg_temp.c('org'), 'head_of_pmo', pg_temp.c('contrib'));
select pg_temp.as_user(pg_temp.c('contrib'));
select public.decide_approval_step(pg_temp.step(pg_temp.c('c2v3'), 1), 'approved');
select pg_temp.ok('one of two steps: still submitted', pg_temp.vstatus(pg_temp.c('c2v3')) = 'submitted');
select public.decide_approval_step(pg_temp.step(pg_temp.c('c2v3'), 2), 'approved');
select pg_temp.ok('both steps: the OBC is approved', pg_temp.vstatus(pg_temp.c('c2v3')) = 'approved');

-- 8. A second approval of the same stage supersedes the first.
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'c2v4', public.start_business_case_version(pg_temp.c('c2'));
select pg_temp.complete(pg_temp.c('c2v4'));
select public.submit_business_case(pg_temp.c('c2v4'));
select pg_temp.as_user(pg_temp.c('contrib'));
select public.decide_approval_step(pg_temp.step(pg_temp.c('c2v4'), 1), 'approved');
select public.decide_approval_step(pg_temp.step(pg_temp.c('c2v4'), 2), 'approved');
select pg_temp.ok('the newer OBC supersedes the older', pg_temp.vstatus(pg_temp.c('c2v4')) = 'approved'
  and pg_temp.vstatus(pg_temp.c('c2v3')) = 'superseded' and pg_temp.vstatus(pg_temp.c('c2v1')) = 'approved');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('can''t go back to an SOC after an approved OBC',
  $$select public.start_business_case_stage(pg_temp.c('c2'), 'soc')$$, '22023', 'business_case_stage');

-- 9. Module off: a staged case can still be revised; the five-case extras stay on the earlier version.
select public.set_organisation_module(pg_temp.c('org'), 'five_case', false);
insert into ctx select 'c2v5', public.start_business_case_version(pg_temp.c('c2'));
select pg_temp.ok('module off: revision keeps the stage', pg_temp.vstage(pg_temp.c('c2v5')) = 'obc');
select pg_temp.ok('module off: objectives not copied, earlier ones kept',
  pg_temp.count_in('business_case_objectives', pg_temp.c('c2v5')) = 0
  and pg_temp.count_in('business_case_objectives', pg_temp.c('c2v4')) = 2);
select pg_temp.as_owner();
update public.business_case_sections set content = 'x' where version_id = pg_temp.c('c2v5') and is_required;
select pg_temp.as_user(pg_temp.c('admin'));
select public.submit_business_case(pg_temp.c('c2v5'));
select pg_temp.ok('module off: submit opens no gate', pg_temp.gate(pg_temp.c('c2v5')) is null);

-- 10. NHS pack routes.
select pg_temp.as_owner();
select pg_temp.ok('NHS default routes name NHS roles and the ICB threshold',
  private.five_case_default_routes('nhs') -> 'obc' -> 2 ->> 'governanceRole' = 'head_of_pmo'
  and (private.five_case_default_routes('nhs') -> 'obc' -> 2 ->> 'minValue')::numeric = 15000000);

-- 11. Financial case: an approved business case version sets the project's budget baseline
--     (20261123091727_nhs_5_five_case_baseline).
select pg_temp.as_user(pg_temp.c('admin'));
select public.set_organisation_module(pg_temp.c('org'), 'five_case', true);
select public.set_business_case_approval_routes(pg_temp.c('org'),
  '{"single": [{"name": "Finance lead", "governanceRole": "finance_lead"}]}');
with x as (insert into public.business_cases (workspace_id, organisation_id, project_id, title)
  values (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('p3'), 'Single-stage case') returning id)
insert into ctx select 'c3', id from x;
insert into ctx select 'c3v1', public.start_business_case_version(pg_temp.c('c3'));
update public.business_case_versions set funding_requested = 250000 where id = pg_temp.c('c3v1');
insert into public.business_case_options (version_id, name, whole_life_cost, delivery_cost, is_preferred)
  values (pg_temp.c('c3v1'), 'Do it', 300000, 250000, true);
select pg_temp.complete(pg_temp.c('c3v1'));
select pg_temp.raises('baseline: a draft case can''t set it',
  $$insert into public.budget_baselines (project_id, total, source, business_case_version_id)
    values (pg_temp.c('p3'), 250000, 'business_case', pg_temp.c('c3v1'))$$, 'P0001');
select public.submit_business_case(pg_temp.c('c3v1'));
select pg_temp.as_user(pg_temp.c('contrib'));
select public.decide_approval_step(pg_temp.step(pg_temp.c('c3v1'), 1), 'approved');
select pg_temp.ok('single-stage case approved', pg_temp.vstatus(pg_temp.c('c3v1')) = 'approved');
select pg_temp.raises('baseline: a contributor can''t set it',
  $$insert into public.budget_baselines (project_id, total, source, business_case_version_id)
    values (pg_temp.c('p3'), 250000, 'business_case', pg_temp.c('c3v1'))$$, '42501');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('baseline: another project''s case refused',
  $$insert into public.budget_baselines (project_id, total, source, business_case_version_id)
    values (pg_temp.c('p2'), 250000, 'business_case', pg_temp.c('c3v1'))$$, 'P0001');
select pg_temp.raises('baseline: an SOC is indicative',
  $$insert into public.budget_baselines (project_id, total, source, business_case_version_id)
    values (pg_temp.c('p2'), 1, 'business_case', pg_temp.c('c2v1'))$$, 'P0001');
select pg_temp.raises('baseline: a superseded version refused',
  $$insert into public.budget_baselines (project_id, total, source, business_case_version_id)
    values (pg_temp.c('p2'), 1, 'business_case', pg_temp.c('c2v3'))$$, 'P0001');
select pg_temp.raises('baseline: a total other than the delivery cost needs a reason',
  $$insert into public.budget_baselines (project_id, total, source, business_case_version_id)
    values (pg_temp.c('p3'), 300000, 'business_case', pg_temp.c('c3v1'))$$, 'P0001');
select pg_temp.raises('baseline: initial refused once the project has an approved case',
  $$insert into public.budget_baselines (project_id, total, source) values (pg_temp.c('p3'), 1, 'initial')$$, 'P0001');
insert into public.budget_baselines (project_id, total, source, business_case_version_id)
  values (pg_temp.c('p3'), 250000, 'business_case', pg_temp.c('c3v1'));
select pg_temp.ok('baseline set from the approved case',
  (select version = 1 and total = 250000 and approved_by = pg_temp.c('admin') and workspace_id = pg_temp.c('ws')
   from public.budget_baselines where business_case_version_id = pg_temp.c('c3v1')));
select pg_temp.raises('baseline: each version once',
  $$insert into public.budget_baselines (project_id, total, source, business_case_version_id)
    values (pg_temp.c('p3'), 250000, 'business_case', pg_temp.c('c3v1'))$$, 'P0001');
select pg_temp.raises('baseline: a version id that doesn''t exist',
  $$insert into public.budget_baselines (project_id, total, source, business_case_version_id)
    values (pg_temp.c('p3'), 1, 'business_case', gen_random_uuid())$$, 'P0001');
insert into public.budget_baselines (project_id, total, source, business_case_version_id, reason)
  values (pg_temp.c('p2'), 420000, 'business_case', pg_temp.c('c2v4'), 'Construction inflation since approval');
select pg_temp.ok('baseline: the PMO can set a different total with a reason',
  (select total = 420000 from public.budget_baselines where business_case_version_id = pg_temp.c('c2v4')));

select 'nhs_five_case: ' || n || ' checks passed' from passed;
rollback;
