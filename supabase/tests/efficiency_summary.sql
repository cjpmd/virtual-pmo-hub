-- NHS-4 part 2: the efficiency year summary (supabase/migrations/20261123200000_nhs_4b_efficiency_summary.sql):
-- in-year effect, risk-adjusted value, forecast outturn, full-year effect, carry-forward, targets and
-- the month / unit / category / stage breakdowns. Needs only the migrations (no seed); rolls back.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/efficiency_summary.sql
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
insert into ctx select 'org', public.create_organisation(p_name => 'NHS4 Summary Org', p_sector => 'public_sector');
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


-- Module on (NHS pack), three schemes: one planned / forecast / actual, one opportunity with a
-- stored full-year effect, one rejected (never counted).
select pg_temp.as_user(pg_temp.c('admin'));
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.as_user(pg_temp.c('manager'));
insert into public.efficiency_schemes (workspace_id, title, category, business_unit, scheme_lead_id, finance_lead_id, confidence, stage)
values (pg_temp.c('ws'), 'Agency reduction', 'agency_bank', 'Surgery', pg_temp.res(pg_temp.c('lead')),
        pg_temp.res(pg_temp.c('finance')), 'plans_in_progress', 'plan_in_progress');
insert into public.efficiency_schemes (workspace_id, title, category, business_unit, confidence, stage, full_year_effect)
values (pg_temp.c('ws'), 'Medicines switch', 'medicines', 'Medicine', 'opportunity', 'opportunity', 70000);
insert into public.efficiency_schemes (workspace_id, title, business_unit, stage, confidence)
values (pg_temp.c('ws'), 'Rejected idea', 'Surgery', 'rejected', 'opportunity');
insert into ctx select 's1', id from public.efficiency_schemes where title = 'Agency reduction';
insert into ctx select 's2', id from public.efficiency_schemes where title = 'Medicines switch';
insert into ctx select 's3', id from public.efficiency_schemes where title = 'Rejected idea';
insert into public.efficiency_values (scheme_id, month, kind, recurrent, non_recurrent) values
  (pg_temp.c('s1'), '2026-04-01', 'plan', 10000, 0), (pg_temp.c('s1'), '2026-05-01', 'plan', 10000, 5000),
  (pg_temp.c('s1'), '2027-03-01', 'plan', 12000, 0), (pg_temp.c('s1'), '2026-05-01', 'forecast', 8000, 0),
  (pg_temp.c('s1'), '2026-04-01', 'actual', 9000, 0), (pg_temp.c('s1'), '2027-04-01', 'plan', 12000, 0),
  (pg_temp.c('s2'), '2026-06-01', 'plan', 5000, 0),
  (pg_temp.c('s3'), '2026-04-01', 'plan', 100000, 0);
select pg_temp.as_user(pg_temp.c('admin'));
insert into public.efficiency_targets (workspace_id, financial_year, amount) values (pg_temp.c('ws'), 2026, 500000);
insert into public.efficiency_targets (workspace_id, financial_year, business_unit, amount) values
  (pg_temp.c('ws'), 2026, 'Surgery', 120000), (pg_temp.c('ws'), 2026, 'Estates', 30000);

create temp table summary (s jsonb);
grant all on summary to authenticated;
select pg_temp.as_user(pg_temp.c('viewer'));
insert into summary select public.efficiency_summary(pg_temp.c('org'), 2026);
select pg_temp.as_owner();
create function pg_temp.t(k text) returns numeric language sql stable as $$ select (s -> 'totals' ->> k)::numeric from summary $$;

select pg_temp.ok('year and start month', (select (s ->> 'year')::int = 2026 and (s ->> 'startMonth')::int = 4 from summary));
select pg_temp.ok('rejected scheme not counted (2 schemes)', pg_temp.t('schemes') = 2);
select pg_temp.ok('in-year plan = sum of the year''s months (next year''s April left out)', pg_temp.t('plan') = 42000);
select pg_temp.ok('recurrent in-year plan', pg_temp.t('planRecurrent') = 37000);
select pg_temp.ok('risk-adjusted = plan × confidence weight (0.5 and 0.2)', pg_temp.t('riskAdjusted') = 19500);
select pg_temp.ok('forecast outturn = actual, else forecast, else plan', pg_temp.t('forecastOutturn') = 34000);
select pg_temp.ok('actual', pg_temp.t('actual') = 9000);
select pg_temp.ok('full-year effect: stored, else run rate', pg_temp.t('fullYearEffect') = 70000 + round((12000 + 12000 + 10000) / 3.0 * 12, 2));
select pg_temp.ok('carry-forward = last month''s recurrent plan × 12', pg_temp.t('carryForward') = 144000);
select pg_temp.ok('target: the whole-workspace target', pg_temp.t('target') = 500000);
select pg_temp.ok('twelve months, April to March', (select jsonb_array_length(s -> 'months') = 12
  and s -> 'months' -> 0 ->> 'month' = '2026-04-01' and s -> 'months' -> 11 ->> 'month' = '2027-03-01' from summary));
select pg_temp.ok('months: actual reported flag and cumulative values', (select
  (s -> 'months' -> 0 ->> 'hasActual')::boolean and not (s -> 'months' -> 1 ->> 'hasActual')::boolean
  and (s -> 'months' -> 1 ->> 'cumPlan')::numeric = 25000
  and (s -> 'months' -> 11 ->> 'cumPlan')::numeric = 42000
  and (s -> 'months' -> 11 ->> 'cumForecastOutturn')::numeric = 34000
  and (s -> 'months' -> 11 ->> 'cumActual')::numeric = 9000 from summary));
select pg_temp.ok('by unit: targets per unit, a unit with a target and no schemes listed', (select
  jsonb_agg(jsonb_build_array(u ->> 'key', (u ->> 'schemes')::int, (u ->> 'target')::numeric, (u ->> 'plan')::numeric)
            order by u ->> 'key')
  = '[["Estates", 0, 30000, 0], ["Medicine", 1, null, 5000], ["Surgery", 1, 120000, 37000]]'::jsonb
  from summary, jsonb_array_elements(s -> 'byUnit') u));
select pg_temp.ok('by category', (select jsonb_agg(jsonb_build_array(c ->> 'key', (c ->> 'plan')::numeric) order by c ->> 'key')
  = '[["agency_bank", 37000], ["medicines", 5000]]'::jsonb from summary, jsonb_array_elements(s -> 'byCategory') c));
select pg_temp.ok('by stage in pipeline order', (select jsonb_agg(st ->> 'stage')
  = '["opportunity", "plan_in_progress"]'::jsonb from summary, jsonb_array_elements(s -> 'byStage') st));

-- Unit targets only: the workspace target is their sum.
delete from public.efficiency_targets where workspace_id = pg_temp.c('ws') and business_unit is null;
select pg_temp.as_user(pg_temp.c('viewer'));
select pg_temp.ok('no whole-workspace target: sum of the unit targets',
  (public.efficiency_summary(pg_temp.c('org'), 2026) -> 'totals' ->> 'target')::numeric = 150000);
select pg_temp.ok('default year is the current financial year', (public.efficiency_summary(pg_temp.c('org')) ->> 'year')::int
  = private.financial_year_of(current_date, 4));
select pg_temp.ok('a year without values: live schemes counted, zero values and full-year effect', (select (s -> 'totals' ->> 'plan')::numeric = 0
  and (s -> 'totals' ->> 'schemes')::int = 2 and (s -> 'totals' ->> 'fullYearEffect')::numeric = 0 and jsonb_array_length(s -> 'months') = 12 and s -> 'totals' -> 'target' = 'null'
  from public.efficiency_summary(pg_temp.c('org'), 2030) s));
select pg_temp.ok('workspace filter', (public.efficiency_summary(pg_temp.c('org'), 2026, gen_random_uuid()) -> 'totals' ->> 'plan')::numeric = 0);
select pg_temp.raises('year out of range', $$select public.efficiency_summary(pg_temp.c('org'), 1990)$$, '22023');
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('outsider: null', public.efficiency_summary(pg_temp.c('org'), 2026) is null);
select pg_temp.as_owner();
set local role anon;
select pg_temp.raises('anon can''t call it', $$select public.efficiency_summary(pg_temp.c('org'), 2026)$$, '42501');
reset role;

select 'efficiency_summary: ' || n || ' checks passed' from passed;
rollback;
