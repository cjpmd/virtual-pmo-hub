-- NHS-2: NHS benefit categories, measure units, default classifications, notional unit values and
-- the cash / non-cash split in the benefits blocks
-- (supabase/migrations/20261123100000_nhs_2_benefit_categories.sql). Needs only the migrations (no
-- seed): creates its own organisation, runs inside a transaction and rolls everything back.
-- Each check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/benefit_categories.sql
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9400000-0000-4000-8000-000000000001', 'nhs2.admin@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000003', 'nhs2.contrib@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9400000-0000-4000-8000-000000000001', 'nhs2.admin@example.com', 'NHS2 Admin'),
  ('e9400000-0000-4000-8000-000000000003', 'nhs2.contrib@example.com', 'NHS2 Contributor')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9400000-0000-4000-8000-000000000001'),
  ('contrib', 'e9400000-0000-4000-8000-000000000003');

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
create function pg_temp.raises(name text, sql text, state text) returns void language plpgsql as $$
declare v_state text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    perform pg_temp.ok(name || ' [' || v_state || ']', v_state = state);
    return;
  end;
  raise exception 'FAIL: % (no error)', name;
end $$;
create function pg_temp.c(k text) returns uuid language sql stable as $$ select v from ctx where ctx.k = c.k $$;
grant execute on function pg_temp.c(text) to authenticated, anon;
create function pg_temp.lookups(list text) returns bigint language sql stable security definer as $$
  select count(*) from public.lookup_values where organisation_id = pg_temp.c('org') and list_key = list $$;
create function pg_temp.map() returns jsonb language sql stable security definer as $$
  select settings -> 'benefits' -> 'categoryClassification' from public.organisations where id = pg_temp.c('org') $$;
create function pg_temp.block(key text, cfg jsonb default '{}') returns jsonb language sql as $$
  select public.report_block_data(
    jsonb_build_object('organisation_id', pg_temp.c('org'), 'scope_type', 'project',
                       'scope_entity_id', pg_temp.c('project'), 'as_at', current_date),
    jsonb_build_object('id', 'b', 'blockKey', key, 'config', cfg)) $$;
grant execute on function pg_temp.block(text, jsonb) to authenticated, anon;

-- A General organisation with sample data. The module is off.
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS2 Org', p_sector => 'general');
select public.seed_sample_data(pg_temp.c('org'));
select pg_temp.as_owner();
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into ctx select 'portfolio', id from public.portfolios where organisation_id = pg_temp.c('org') and is_sample limit 1;
insert into ctx select 'project', id from public.projects where organisation_id = pg_temp.c('org') and is_sample
  order by code limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('org'), pg_temp.c('contrib'), 'contributor');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('contrib'), 'contributor')
on conflict do nothing;
select pg_temp.ok('fixture: a sample project in a portfolio', pg_temp.c('project') is not null);

-- 1. Module off: no NHS categories, no unit presets, no map.
select pg_temp.ok('module off: no NHS categories', (select count(*) from public.lookup_values
  where organisation_id = pg_temp.c('org') and list_key = 'benefit_category' and value = 'bed_days_saved') = 0);
select pg_temp.ok('module off: no measure units', pg_temp.lookups('measure_unit') = 0);
select pg_temp.ok('module off: no classification map', pg_temp.map() is null);

-- The organisation already has its own "Bed days saved" (renamed) and a mapping it chose.
insert into public.lookup_values (organisation_id, list_key, value, label, sort_order, is_active)
values (pg_temp.c('org'), 'benefit_category', 'bed_days_saved', 'Beds freed', 50, false);
update public.organisations set settings = jsonb_set(settings, '{benefits,categoryClassification}',
  '{"patient_safety":"non_cash_releasing"}') where id = pg_temp.c('org');
create temp table before_cats as
  select value, label, is_active from public.lookup_values
  where organisation_id = pg_temp.c('org') and list_key = 'benefit_category';

-- 2. Preview (p_apply false) lists what would be added and changes nothing.
create temp table preview as select private.seed_module_defaults(pg_temp.c('org'), 'benefit_categories_nhs', 'general', false) as items;
select pg_temp.ok('preview: 11 categories (one exists), 8 units and the map',
  (select count(*) filter (where i ->> 'list' = 'benefit_category') = 11
      and count(*) filter (where i ->> 'list' = 'measure_unit') = 8
      and count(*) filter (where i ->> 'setting' = 'benefits.categoryClassification') = 1
   from preview, jsonb_array_elements(items) i));
select pg_temp.ok('preview: map leaves out the key the organisation set',
  (select not (i -> 'value' ? 'patient_safety') and (i -> 'value' ->> 'bed_days_saved') = 'non_cash_releasing'
   from preview, jsonb_array_elements(items) i where i ->> 'setting' = 'benefits.categoryClassification'));
select pg_temp.ok('preview changes nothing', pg_temp.lookups('measure_unit') = 0
  and pg_temp.map() = '{"patient_safety":"non_cash_releasing"}');

-- 3. An admin switches the module on.
select pg_temp.as_user(pg_temp.c('admin'));
select public.set_organisation_module(pg_temp.c('org'), 'benefit_categories_nhs', true);
select pg_temp.as_owner();
select pg_temp.ok('on: all 12 NHS categories present', (select count(*) from public.lookup_values l
  join private.nhs_benefit_categories() c on c.value = l.value
  where l.organisation_id = pg_temp.c('org') and l.list_key = 'benefit_category') = 12);
select pg_temp.ok('on: the existing category keeps its label and stays inactive', (select label = 'Beds freed' and not is_active
  from public.lookup_values where organisation_id = pg_temp.c('org') and list_key = 'benefit_category' and value = 'bed_days_saved'));
select pg_temp.ok('on: the general categories are untouched', not exists (
  select 1 from before_cats b join public.lookup_values l on l.organisation_id = pg_temp.c('org')
    and l.list_key = 'benefit_category' and l.value = b.value
  where l.label is distinct from b.label or l.is_active is distinct from b.is_active));
select pg_temp.ok('on: 8 measure units', pg_temp.lookups('measure_unit') = 8);
select pg_temp.ok('on: cash-releasing efficiency maps to cash_releasing',
  pg_temp.map() ->> 'cash_releasing_efficiency' = 'cash_releasing');
select pg_temp.ok('on: bed days saved maps to non_cash_releasing', pg_temp.map() ->> 'bed_days_saved' = 'non_cash_releasing');
select pg_temp.ok('on: the organisation''s own mapping is kept', pg_temp.map() ->> 'patient_safety' = 'non_cash_releasing');
select pg_temp.ok('on: map holds the 12 categories', (select count(*) from jsonb_object_keys(pg_temp.map())) = 12);
select pg_temp.ok('on: other settings untouched', (select settings ->> 'sector' = 'general'
  from public.organisations where id = pg_temp.c('org')));

-- 4. Idempotent: off and on again adds nothing.
select pg_temp.as_user(pg_temp.c('admin'));
select public.set_organisation_module(pg_temp.c('org'), 'benefit_categories_nhs', false);
select public.set_organisation_module(pg_temp.c('org'), 'benefit_categories_nhs', true);
select pg_temp.as_owner();
select pg_temp.ok('idempotent: nothing more to seed',
  private.seed_module_defaults(pg_temp.c('org'), 'benefit_categories_nhs', 'general', false) = '[]'::jsonb);
select pg_temp.ok('idempotent: still 8 units', pg_temp.lookups('measure_unit') = 8);

-- 5. Notional unit value on a measure (core).
select pg_temp.as_user(pg_temp.c('contrib'));
insert into ctx select 'cash_cat', id from public.lookup_values
  where organisation_id = pg_temp.c('org') and list_key = 'benefit_category' and value = 'cash_releasing_efficiency';
insert into ctx select 'time_cat', id from public.lookup_values
  where organisation_id = pg_temp.c('org') and list_key = 'benefit_category' and value = 'staff_time_released';
with ins as (insert into public.benefits (title, portfolio_id, category_id, classification, planned_total_value)
  values ('Agency spend down', pg_temp.c('portfolio'), pg_temp.c('cash_cat'), 'cash_releasing', 120000) returning id)
insert into ctx select 'cash_b', id from ins;
with ins as (insert into public.benefits (title, portfolio_id, category_id, classification, planned_total_value)
  values ('Nurse time released', pg_temp.c('portfolio'), pg_temp.c('time_cat'), 'non_cash_releasing', 45000) returning id)
insert into ctx select 'time_b', id from ins;
with ins as (insert into public.benefits (title, portfolio_id, category_id, classification, planned_total_value, type)
  values ('Extra travel', pg_temp.c('portfolio'), pg_temp.c('time_cat'), 'non_cash_releasing', -5000, 'disbenefit') returning id)
insert into ctx select 'dis_b', id from ins;
insert into public.benefit_projects (benefit_id, project_id) values
  (pg_temp.c('cash_b'), pg_temp.c('project')), (pg_temp.c('time_b'), pg_temp.c('project')), (pg_temp.c('dis_b'), pg_temp.c('project'));
with ins as (insert into public.benefit_measures (benefit_id, name, unit, notional_unit_value)
  values (pg_temp.c('time_b'), 'Nursing hours released', 'Staff hours', 32.50) returning id, notional_unit_value)
insert into ctx select 'measure', id from ins where notional_unit_value = 32.50;
select pg_temp.ok('contributor records a notional value per unit', pg_temp.c('measure') is not null);
select pg_temp.raises('a negative notional value is refused',
  $$update public.benefit_measures set notional_unit_value = -1 where id = pg_temp.c('measure')$$, '23514');
update public.benefit_measures set notional_unit_value = null where id = pg_temp.c('measure');
select pg_temp.ok('the notional value can be cleared', (select notional_unit_value is null
  from public.benefit_measures where id = pg_temp.c('measure')));

-- 6. Blocks: cash and non-cash stay apart.
create temp table blk as select pg_temp.block('benefits_by_category') as b, pg_temp.block('benefits_value') as v;
grant all on blk to authenticated;
select pg_temp.ok('by category: cash planned is the cash-releasing benefit only', (select (b ->> 'cash_planned')::numeric = 120000 from blk));
select pg_temp.ok('by category: non-cash planned excludes the disbenefit', (select (b ->> 'non_cash_planned')::numeric = 45000 from blk));
select pg_temp.ok('by category: two categories, one disbenefit', (select (b ->> 'category_count')::integer = 2
  and (b ->> 'disbenefits')::integer = 1 and (b ->> 'benefits')::integer = 2 from blk));
select pg_temp.ok('by category: largest category first, with its classification count', (select
  b -> 'categories' -> 0 ->> 'name' = 'Cash-releasing efficiency'
  and (b -> 'categories' -> 0 -> 'by_classification' ->> 'cash_releasing')::integer = 1
  and (b -> 'categories' -> 1 ->> 'non_cash_planned')::numeric = 45000
  and (b -> 'categories' -> 1 ->> 'cash_planned')::numeric = 0 from blk));
select pg_temp.ok('by category: limit', (select jsonb_array_length(pg_temp.block('benefits_by_category', '{"limit":1}') -> 'categories') = 1));
select pg_temp.ok('benefits_value: non-cash totals beside cash', (select (v ->> 'cash_releasing_planned')::numeric = 120000
  and (v ->> 'non_cash_planned')::numeric = 45000 and (v ->> 'planned')::numeric = 165000 from blk));

-- 7. Not callable directly.
select pg_temp.raises('the seeder is closed to signed-in users',
  $$select private.seed_module_defaults(pg_temp.c('org'), 'benefit_categories_nhs', 'general', true)$$, '42501');
select pg_temp.as_owner();
select pg_temp.ok('seed sets closed to anon', not has_function_privilege('anon', 'private.nhs_benefit_categories()', 'execute')
  and not has_function_privilege('anon', 'private.measure_unit_presets()', 'execute')
  and not has_function_privilege('anon', 'private.rb_benefits_by_category(jsonb, jsonb)', 'execute'));

select 'benefit_categories: ' || n || ' checks passed' from passed;
rollback;
