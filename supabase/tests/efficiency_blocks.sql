-- NHS-4 part 4: efficiency report blocks and templates
-- (supabase/migrations/20261123220000_nhs_4c_efficiency_blocks.sql): summary with the gap to target,
-- breakdowns, schemes at risk, recurrent split, partner safety, outsiders, and a published pack.
-- Needs only the migrations (no seed); rolls back.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/efficiency_blocks.sql
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;
create temp table out (k text primary key, v jsonb);
grant all on out to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9600000-0000-4000-8000-000000000001', 'nhs4c.admin@example.com', now(), '{}'),
  ('e9600000-0000-4000-8000-000000000006', 'nhs4c.viewer@example.com', now(), '{}'),
  ('e9600000-0000-4000-8000-000000000009', 'nhs4c.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9600000-0000-4000-8000-000000000001', 'nhs4c.admin@example.com', 'NHS4c Admin'),
  ('e9600000-0000-4000-8000-000000000006', 'nhs4c.viewer@example.com', 'NHS4c Viewer'),
  ('e9600000-0000-4000-8000-000000000009', 'nhs4c.outsider@example.com', 'NHS4c Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9600000-0000-4000-8000-000000000001'),
  ('viewer', 'e9600000-0000-4000-8000-000000000006'), ('outsider', 'e9600000-0000-4000-8000-000000000009');

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
create function pg_temp.c(k text) returns uuid language sql stable as $$ select v from ctx where ctx.k = c.k $$;
grant execute on function pg_temp.c(text) to authenticated, anon;
create function pg_temp.o(k text) returns jsonb language sql stable as $$ select v from out where out.k = o.k $$;
grant execute on function pg_temp.o(text) to authenticated, anon;
create function pg_temp.block(k text, cfg jsonb default '{}') returns jsonb language sql as $$
  select public.report_block_data(jsonb_build_object('organisation_id', pg_temp.c('org'), 'scope_type', 'portfolio',
           'scope_entity_id', pg_temp.c('portfolio'), 'as_at', '2026-07-15'),
         jsonb_build_object('id', 'b', 'blockKey', k, 'config', cfg)) $$;
grant execute on function pg_temp.block(text, jsonb) to authenticated, anon;
create function pg_temp.n(j jsonb) returns numeric language sql immutable as $$ select (j #>> '{}')::numeric $$;

-- Organisation (NHS pack: April year, efficiency and impact assessments on) with sample data.
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS4c Blocks Org', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('org'));
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select public.set_efficiency_settings(pg_temp.c('org'), '{"requireAssessment": false, "requireFinanceValidation": false}');
select pg_temp.as_owner();
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into ctx select 'portfolio', id from public.portfolios where organisation_id = pg_temp.c('org') and is_sample limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values (pg_temp.c('org'), pg_temp.c('viewer'), 'viewer');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('viewer'), 'viewer') on conflict do nothing;
select pg_temp.ok('fixture: modules on, April year, a sample portfolio',
  private.module_enabled(pg_temp.c('org'), 'efficiency') and private.module_enabled(pg_temp.c('org'), 'impact_assessment')
  and private.org_financial_year_start(pg_temp.c('org')) = 4 and pg_temp.c('portfolio') is not null);

-- Schemes (financial year 2026, as at 15/07/2026, so April–June are "to date"):
--   s1 plan in progress, Surgery: plan 37,000 (32,000 recurrent), outturn 29,000 (forecast below plan)
--   s2 opportunity, Medicine: plan 5,000, on plan
--   s3 rejected: never counted
--   s4 in delivery, Surgery: plan 60,000, actual 20,000 against 60,000 to date, outturn 40,000
--   s5 on hold, Estates: plan 3,000
select pg_temp.as_user(pg_temp.c('admin'));
insert into public.efficiency_schemes (workspace_id, title, category, business_unit, confidence, stage) values
  (pg_temp.c('ws'), 'Agency reduction', 'agency_bank', 'Surgery', 'plans_in_progress', 'plan_in_progress'),
  (pg_temp.c('ws'), 'Medicines switch', 'medicines', 'Medicine', 'opportunity', 'opportunity'),
  (pg_temp.c('ws'), 'Rejected idea', null, 'Surgery', 'opportunity', 'rejected'),
  (pg_temp.c('ws'), 'Theatre productivity', 'clinical_productivity', 'Surgery', 'fully_developed_in_delivery', 'plan_in_progress'),
  (pg_temp.c('ws'), 'Estates rationalisation', 'estates', 'Estates', 'opportunity', 'idea');
insert into ctx select 's' || n, id from (values (1, 'Agency reduction'), (2, 'Medicines switch'), (3, 'Rejected idea'),
  (4, 'Theatre productivity'), (5, 'Estates rationalisation')) v(n, t) join public.efficiency_schemes s on s.title = v.t
  and s.organisation_id = pg_temp.c('org');
insert into public.efficiency_values (scheme_id, month, kind, recurrent, non_recurrent) values
  (pg_temp.c('s1'), '2026-04-01', 'plan', 10000, 0), (pg_temp.c('s1'), '2026-05-01', 'plan', 10000, 5000),
  (pg_temp.c('s1'), '2027-03-01', 'plan', 12000, 0), (pg_temp.c('s1'), '2026-05-01', 'forecast', 8000, 0),
  (pg_temp.c('s1'), '2026-04-01', 'actual', 9000, 0),
  (pg_temp.c('s2'), '2026-06-01', 'plan', 5000, 0),
  (pg_temp.c('s3'), '2026-04-01', 'plan', 100000, 0),
  (pg_temp.c('s4'), '2026-04-01', 'plan', 20000, 0), (pg_temp.c('s4'), '2026-05-01', 'plan', 20000, 0),
  (pg_temp.c('s4'), '2026-06-01', 'plan', 20000, 0),
  (pg_temp.c('s4'), '2026-04-01', 'actual', 10000, 0), (pg_temp.c('s4'), '2026-05-01', 'actual', 10000, 0),
  (pg_temp.c('s5'), '2026-09-01', 'plan', 3000, 0);
update public.efficiency_schemes set delivery_plan = 'Theatre lists', stage = 'in_delivery' where id = pg_temp.c('s4');
update public.efficiency_schemes set stage = 'on_hold' where id = pg_temp.c('s5');
insert into public.efficiency_targets (workspace_id, financial_year, amount) values (pg_temp.c('ws'), 2026, 500000);
insert into public.efficiency_targets (workspace_id, financial_year, business_unit, amount) values
  (pg_temp.c('ws'), 2026, 'Surgery', 120000), (pg_temp.c('ws'), 2026, 'Estates', 30000);
-- Assessments are required again from now on (the stage move above happened without one).
select public.set_efficiency_settings(pg_temp.c('org'), '{"requireAssessment": true}');
select pg_temp.ok('fixture: s4 in delivery, s5 on hold',
  (select stage from public.efficiency_schemes where id = pg_temp.c('s4')) = 'in_delivery'
  and (select stage from public.efficiency_schemes where id = pg_temp.c('s5')) = 'on_hold');

-- 1. Blocks as a workspace viewer (RLS applies).
select pg_temp.as_user(pg_temp.c('viewer'));
insert into out select 'summary', pg_temp.block('efficiency_summary');
insert into out select 'units', pg_temp.block('efficiency_breakdown');
insert into out select 'categories', pg_temp.block('efficiency_breakdown', '{"group_by": "category"}');
insert into out select 'stages', pg_temp.block('efficiency_breakdown', '{"group_by": "stage"}');
insert into out select 'risk', pg_temp.block('efficiency_schemes_at_risk');
insert into out select 'risk_loose', pg_temp.block('efficiency_schemes_at_risk', '{"tolerance_pct": 50}');
insert into out select 'recurrent', pg_temp.block('efficiency_recurrent');
insert into out select 'nomonths', pg_temp.block('efficiency_summary', '{"show_months": false}');
select pg_temp.as_owner();

select pg_temp.ok('summary: year 2026 from the as-at date, April start, GBP',
  (pg_temp.o('summary') ->> 'year')::int = 2026 and (pg_temp.o('summary') ->> 'start_month')::int = 4
  and pg_temp.o('summary') ->> 'currency' = 'GBP' and (pg_temp.o('summary') ->> 'whole_organisation')::boolean);
select pg_temp.ok('summary: four live schemes, rejected left out', (pg_temp.o('summary') ->> 'schemes')::int = 4);
select pg_temp.ok('summary: plan, recurrent plan, actual',
  pg_temp.n(pg_temp.o('summary') -> 'plan') = 105000 and pg_temp.n(pg_temp.o('summary') -> 'plan_recurrent') = 100000
  and pg_temp.n(pg_temp.o('summary') -> 'actual') = 29000);
select pg_temp.ok('summary: forecast outturn (29,000 + 5,000 + 40,000 + 3,000)',
  pg_temp.n(pg_temp.o('summary') -> 'forecast_outturn') = 77000);
select pg_temp.ok('summary: risk-adjusted (37,000 × 0.5 + 5,000 × 0.2 + 60,000 × 1 + 3,000 × 0.2)',
  pg_temp.n(pg_temp.o('summary') -> 'risk_adjusted') = 80100);
select pg_temp.ok('summary: gap to target for plan, risk-adjusted and forecast',
  pg_temp.n(pg_temp.o('summary') -> 'target') = 500000
  and pg_temp.n(pg_temp.o('summary') -> 'gap' -> 'plan') = 395000
  and pg_temp.n(pg_temp.o('summary') -> 'gap' -> 'risk_adjusted') = 419900
  and pg_temp.n(pg_temp.o('summary') -> 'gap' -> 'forecast_outturn') = 423000);
select pg_temp.ok('summary: to date = April to June (plan 90,000, actual 29,000, two months reported)',
  pg_temp.o('summary') -> 'to_date' = '{"months": 3, "months_reported": 2, "plan": 90000, "actual": 29000, "variance": -61000}'::jsonb);
select pg_temp.ok('summary: twelve cumulative months',
  jsonb_array_length(pg_temp.o('summary') -> 'months') = 12
  and pg_temp.n(pg_temp.o('summary') -> 'months' -> 11 -> 'cum_plan') = 105000
  and pg_temp.n(pg_temp.o('summary') -> 'months' -> 11 -> 'cum_forecast_outturn') = 77000);
select pg_temp.ok('summary: show_months false leaves the months out', pg_temp.o('nomonths') -> 'months' = '[]'::jsonb);

select pg_temp.ok('by unit: targets, plans and gaps (Estates, Medicine, Surgery)',
  (select jsonb_agg(jsonb_build_array(r ->> 'label', pg_temp.n(r -> 'target'), pg_temp.n(r -> 'plan'), pg_temp.n(r -> 'gap_plan'))
                    order by r ->> 'label')
   from jsonb_array_elements(pg_temp.o('units') -> 'rows') r)
  = '[["Estates", 30000, 3000, 27000], ["Medicine", null, 5000, null], ["Surgery", 120000, 97000, 23000]]'::jsonb);
select pg_temp.ok('by category: labels from the organisation''s list',
  (select jsonb_agg(r ->> 'label' order by r ->> 'label') from jsonb_array_elements(pg_temp.o('categories') -> 'rows') r)
  = '["Agency and bank", "Clinical productivity", "Estates and facilities", "Medicines"]'::jsonb
  and pg_temp.o('categories') ->> 'group_by' = 'category');
select pg_temp.ok('by stage: pipeline order, on hold last',
  (select jsonb_agg(r ->> 'key') from jsonb_array_elements(pg_temp.o('stages') -> 'rows') r)
  = '["opportunity", "plan_in_progress", "in_delivery", "on_hold"]'::jsonb);

select pg_temp.ok('at risk: s4, s1 and s5, largest shortfall first',
  (select jsonb_agg(r ->> 'title') from jsonb_array_elements(pg_temp.o('risk') -> 'rows') r)
  = '["Theatre productivity", "Agency reduction", "Estates rationalisation"]'::jsonb
  and (pg_temp.o('risk') ->> 'count')::int = 3 and pg_temp.n(pg_temp.o('risk') -> 'shortfall') = 28000);
select pg_temp.ok('at risk: s4 reasons (forecast, actual to date, no approved assessment)',
  (select r -> 'reasons' from jsonb_array_elements(pg_temp.o('risk') -> 'rows') r where r ->> 'title' = 'Theatre productivity')
  = '["forecast_below_plan", "actual_below_plan", "assessment_not_approved"]'::jsonb);
select pg_temp.ok('at risk: s1 forecast below plan, s5 on hold',
  (select r -> 'reasons' from jsonb_array_elements(pg_temp.o('risk') -> 'rows') r where r ->> 'title' = 'Agency reduction')
  = '["forecast_below_plan"]'::jsonb
  and (select r -> 'reasons' from jsonb_array_elements(pg_temp.o('risk') -> 'rows') r where r ->> 'title' = 'Estates rationalisation')
  = '["on_hold"]'::jsonb);
select pg_temp.ok('at risk: to-date figures and unit label', (select pg_temp.n(r -> 'plan_to_date') = 60000
  and pg_temp.n(r -> 'actual_to_date') = 20000 and r ->> 'unit' = 'Surgery' and r ->> 'ref' like 'EFF-%'
  from jsonb_array_elements(pg_temp.o('risk') -> 'rows') r where r ->> 'title' = 'Theatre productivity'));
select pg_temp.ok('at risk: a 50% tolerance leaves s1 out (29,000 ≥ 18,500)',
  not exists (select 1 from jsonb_array_elements(pg_temp.o('risk_loose') -> 'rows') r where r ->> 'title' = 'Agency reduction')
  and (pg_temp.o('risk_loose') ->> 'tolerance_pct')::numeric = 50);

select pg_temp.ok('recurrent: plan split and share',
  pg_temp.o('recurrent') -> 'plan' = '{"recurrent": 100000, "non_recurrent": 5000}'::jsonb
  and pg_temp.n(pg_temp.o('recurrent') -> 'recurrent_pct') = 95.2);
select pg_temp.ok('recurrent: outturn and actual split',
  pg_temp.o('recurrent') -> 'forecast_outturn' = '{"recurrent": 77000, "non_recurrent": 0}'::jsonb
  and pg_temp.o('recurrent') -> 'actual' = '{"recurrent": 29000, "non_recurrent": 0}'::jsonb);
select pg_temp.ok('recurrent: full-year effect and carry-forward from the summary',
  pg_temp.n(pg_temp.o('recurrent') -> 'carry_forward') = 144000 and pg_temp.n(pg_temp.o('recurrent') -> 'full_year_effect') > 0);
select pg_temp.ok('recurrent: a row per category with values', jsonb_array_length(pg_temp.o('recurrent') -> 'rows') = 4);

-- 2. Workspace filter, other years, public.efficiency_summary unchanged.
select pg_temp.as_user(pg_temp.c('viewer'));
select pg_temp.ok('whole_organisation false with no report workspace: still the organisation',
  pg_temp.n(pg_temp.block('efficiency_summary', '{"whole_organisation": false}') -> 'plan') = 105000);
select pg_temp.ok('workspace filter (another workspace): nothing counted',
  pg_temp.n(private.rb_efficiency_summary(jsonb_build_object('organisation_id', pg_temp.c('org'), 'as_at', '2026-07-15',
    'workspace_id', gen_random_uuid(), 'currency', 'GBP'), '{"whole_organisation": false}') -> 'plan') = 0);
select pg_temp.ok('as at a later year: that year''s figures',
  (private.rb_efficiency_summary(jsonb_build_object('organisation_id', pg_temp.c('org'), 'as_at', '2027-05-01'), '{}') ->> 'year')::int = 2027);
select pg_temp.ok('public.efficiency_summary: same totals as before',
  (public.efficiency_summary(pg_temp.c('org'), 2026) -> 'totals' ->> 'plan')::numeric = 105000);

-- 3. Outsiders, anon and partners.
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('outsider: no block data', coalesce(private.rb_efficiency_summary(jsonb_build_object('organisation_id', pg_temp.c('org'),
  'as_at', '2026-07-15'), '{}'), '{}'::jsonb) = '{}'::jsonb
  and coalesce(private.rb_efficiency_schemes_at_risk(jsonb_build_object('organisation_id', pg_temp.c('org'), 'as_at', '2026-07-15'), '{}'), '{}'::jsonb) = '{}'::jsonb
  and coalesce(private.rb_efficiency_breakdown(jsonb_build_object('organisation_id', pg_temp.c('org'), 'as_at', '2026-07-15'), '{}'), '{}'::jsonb) = '{}'::jsonb
  and coalesce(private.rb_efficiency_recurrent(jsonb_build_object('organisation_id', pg_temp.c('org'), 'as_at', '2026-07-15'), '{}'), '{}'::jsonb) = '{}'::jsonb);
select pg_temp.ok('outsider: public.efficiency_summary still null', public.efficiency_summary(pg_temp.c('org'), 2026) is null);
select pg_temp.as_owner();
select pg_temp.ok('blocks partner-unsafe', private.partner_unsafe_blocks() @> array['efficiency_summary', 'efficiency_breakdown',
  'efficiency_schemes_at_risk', 'efficiency_recurrent', 'impact_assessment_status', 'baf_summary']);
select pg_temp.ok('block functions closed to anon',
  not has_function_privilege('anon', 'private.rb_efficiency_summary(jsonb,jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.rb_efficiency_frame(jsonb,jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.efficiency_year_summary(uuid,integer,uuid)', 'execute'));

-- 4. Templates.
select pg_temp.ok('two templates, each once, with the efficiency blocks',
  (select count(*) from public.report_templates where is_system and name in
     ('Finance & Performance Committee with efficiency programme', 'Efficiency programme report')) = 2
  and (select blocks @> '[{"blockKey": "efficiency_summary"}, {"blockKey": "efficiency_schemes_at_risk"}]'
       from public.report_templates where is_system and name = 'Efficiency programme report'));
select pg_temp.ok('NHS-1 Finance & Performance template unchanged (no efficiency blocks)',
  not (select blocks @> '[{"blockKey": "efficiency_summary"}]' from public.report_templates
       where is_system and name = 'Finance & Performance Committee'));

-- 5. A pack published from the template stores the efficiency figures, hidden from partners.
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'report', public.create_report(jsonb_build_object('scope_type', 'portfolio',
  'scope_entity_id', pg_temp.c('portfolio'), 'title', 'Efficiency pack',
  'template_id', (select id from public.report_templates where is_system and name = 'Efficiency programme report')));
select public.publish_report(pg_temp.c('report'));
select pg_temp.as_owner();
select pg_temp.ok('published pack: summary snapshot hidden from partners, with the live schemes',
  (select s.hidden_from_partners and (s.data ->> 'schemes')::int = 4 from public.report_snapshots s
   where s.report_id = pg_temp.c('report') and s.block_key = 'efficiency_summary'));
select pg_temp.ok('published pack: three breakdowns, at-risk and recurrent snapshots, all hidden from partners',
  (select count(*) = 5 and bool_and(s.hidden_from_partners) from public.report_snapshots s
   where s.report_id = pg_temp.c('report') and s.block_key in ('efficiency_breakdown', 'efficiency_schemes_at_risk', 'efficiency_recurrent')));

select 'efficiency_blocks: ' || n || ' checks passed' from passed;
rollback;
