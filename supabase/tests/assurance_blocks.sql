-- NHS-1 part 2: board assurance report blocks and committee templates
-- (supabase/migrations/20261122190000_nhs_1b_assurance_blocks.sql). Needs only the migrations (no
-- seed): creates its own organisation, runs inside a transaction and rolls everything back. Each
-- check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/assurance_blocks.sql
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;
create temp table out (k text primary key, v jsonb);
grant all on out to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9200000-0000-4000-8000-000000000001', 'nhs1b.admin@example.com', now(), '{}'),
  ('e9200000-0000-4000-8000-000000000002', 'nhs1b.pmo@example.com', now(), '{}'),
  ('e9200000-0000-4000-8000-000000000005', 'nhs1b.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9200000-0000-4000-8000-000000000001', 'nhs1b.admin@example.com', 'NHS1b Admin'),
  ('e9200000-0000-4000-8000-000000000002', 'nhs1b.pmo@example.com', 'NHS1b PMO'),
  ('e9200000-0000-4000-8000-000000000005', 'nhs1b.outsider@example.com', 'NHS1b Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9200000-0000-4000-8000-000000000001'),
  ('pmo', 'e9200000-0000-4000-8000-000000000002'), ('outsider', 'e9200000-0000-4000-8000-000000000005');

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
create function pg_temp.input() returns jsonb language sql stable as $$
  select jsonb_build_object('organisation_id', pg_temp.c('org'), 'scope_type', 'portfolio', 'scope_entity_id', pg_temp.c('portfolio')) $$;
grant execute on function pg_temp.input() to authenticated, anon;
create function pg_temp.block(k text, cfg jsonb default '{}') returns jsonb language sql as $$
  select public.report_block_data(pg_temp.input(), jsonb_build_object('id', 'b', 'blockKey', k, 'config', cfg)) $$;
grant execute on function pg_temp.block(text, jsonb) to authenticated, anon;

-- An organisation with sample data, the NHS pack applied (board assurance on).
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS1b Org', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('org'));
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.as_owner();
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('org'), pg_temp.c('pmo'), 'pmo');
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into ctx select 'portfolio', id from public.portfolios where organisation_id = pg_temp.c('org') and is_sample limit 1;
insert into ctx select 'risk', r.id from public.risks r join public.projects p on p.id = r.project_id
  where r.organisation_id = pg_temp.c('org') order by r.ref limit 1;
select pg_temp.ok('fixture: module on, a sample portfolio and a project risk',
  private.module_enabled(pg_temp.c('org'), 'assurance') and pg_temp.c('portfolio') is not null and pg_temp.c('risk') is not null);

-- Strategic risks: SR-A 4×5 = 20 above its appetite of 8; SR-B 2×2 = 4 within 6; SR-C no appetite;
-- SR-D closed (never shown). SR-A has a review date before today.
select pg_temp.as_user(pg_temp.c('pmo'));
with ins as (
  insert into public.strategic_risks (organisation_id, title, current_likelihood, current_consequence, appetite_score,
    target_likelihood, target_consequence, review_date, gaps_in_control, assurance_rating)
  values (pg_temp.c('org'), 'Financial sustainability', 4, 5, 8, 2, 4, current_date - 3, 'No recurrent plan yet', 'limited')
  returning id)
insert into ctx select 'sra', id from ins;
with ins as (
  insert into public.strategic_risks (organisation_id, title, current_likelihood, current_consequence, appetite_score)
  values (pg_temp.c('org'), 'Workforce', 2, 2, 6) returning id)
insert into ctx select 'srb', id from ins;
with ins as (
  insert into public.strategic_risks (organisation_id, title, current_likelihood, current_consequence)
  values (pg_temp.c('org'), 'Digital resilience', 3, 3) returning id)
insert into ctx select 'src', id from ins;
with ins as (
  insert into public.strategic_risks (organisation_id, title, current_likelihood, current_consequence, status)
  values (pg_temp.c('org'), 'Closed one', 5, 5, 'closed') returning id)
insert into ctx select 'srd', id from ins;
insert into public.strategic_risk_actions (organisation_id, strategic_risk_id, title, due_date)
values (pg_temp.c('org'), pg_temp.c('sra'), 'Agree recurrent plan', current_date - 1);
insert into public.record_links (organisation_id, workspace_id, from_type, from_id, to_type, to_id, link_type)
values (pg_temp.c('org'), pg_temp.c('ws'), 'risk', pg_temp.c('risk'), 'strategic_risk', pg_temp.c('sra'), 'contributes_to_baf');

-- 1. baf_summary
insert into out select 'summary', pg_temp.block('baf_summary');
select pg_temp.ok('summary: three open strategic risks', (pg_temp.o('summary') ->> 'total')::int = 3);
select pg_temp.ok('summary: on the NHS 5×5', pg_temp.o('summary') -> 'matrix' ->> 'name' ilike '%5%5%'
  and (pg_temp.o('summary') ->> 'on_other_matrix')::int = 0);
select pg_temp.ok('summary: 25 cells', jsonb_array_length(pg_temp.o('summary') -> 'cells') = 25);
select pg_temp.ok('summary: the 4×5 cell holds SR-A',
  (select (c ->> 'count')::int = 1 and c -> 'refs' ? (select ref from public.strategic_risks where id = pg_temp.c('sra'))
   from jsonb_array_elements(pg_temp.o('summary') -> 'cells') c where (c ->> 'l')::int = 4 and (c ->> 'c')::int = 5));
select pg_temp.ok('summary: closed risk not counted',
  (select sum((c ->> 'count')::int) from jsonb_array_elements(pg_temp.o('summary') -> 'cells') c) = 3);
select pg_temp.ok('summary: counts', pg_temp.o('summary') -> 'counts' = jsonb_build_object(
  'above_appetite', 1, 'review_overdue', 1, 'low_assurance', 1, 'no_rating', 2, 'overdue_actions', 1));
select pg_temp.ok('summary: rows by score, SR-A first with its band and assurance',
  (pg_temp.o('summary') -> 'rows' -> 0 ->> 'id')::uuid = pg_temp.c('sra')
  and pg_temp.o('summary') -> 'rows' -> 0 ->> 'band' = 'Extreme'
  and pg_temp.o('summary') -> 'rows' -> 0 ->> 'assurance' = 'Limited assurance'
  and (pg_temp.o('summary') -> 'rows' -> 0 ->> 'target_score')::int = 8);
select pg_temp.ok('summary: limit applies', jsonb_array_length(pg_temp.block('baf_summary', '{"limit":1}') -> 'rows') = 1);

-- 2. baf_above_appetite
insert into out select 'appetite', pg_temp.block('baf_above_appetite');
select pg_temp.ok('appetite: one above, one without an appetite',
  (pg_temp.o('appetite') ->> 'count')::int = 1 and (pg_temp.o('appetite') ->> 'no_appetite')::int = 1
  and (pg_temp.o('appetite') ->> 'total_open')::int = 3);
select pg_temp.ok('appetite: gap 12, gaps in control and overdue action shown',
  (pg_temp.o('appetite') -> 'rows' -> 0 ->> 'gap')::int = 12
  and pg_temp.o('appetite') -> 'rows' -> 0 ->> 'gaps_in_control' = 'No recurrent plan yet'
  and (pg_temp.o('appetite') -> 'rows' -> 0 ->> 'overdue_actions')::int = 1);
select pg_temp.ok('appetite: show_gaps false hides the gaps',
  pg_temp.block('baf_above_appetite', '{"show_gaps":false}') -> 'rows' -> 0 -> 'gaps_in_control' = 'null'::jsonb);

-- 3. baf_linkage
insert into out select 'linkage', pg_temp.block('baf_linkage');
select pg_temp.ok('linkage: the project risk sits under SR-A',
  (pg_temp.o('linkage') ->> 'linked_total')::int = 1
  and (pg_temp.o('linkage') -> 'groups' -> 0 ->> 'id')::uuid = pg_temp.c('sra')
  and (pg_temp.o('linkage') -> 'groups' -> 0 -> 'risks' -> 0 ->> 'id')::uuid = pg_temp.c('risk')
  and pg_temp.o('linkage') -> 'groups' -> 0 -> 'risks' -> 0 ->> 'project_code' is not null);
select pg_temp.ok('linkage: the other two are unlinked', jsonb_array_length(pg_temp.o('linkage') -> 'unlinked') = 2);
-- A custom scope without the risk's project: in_scope_only hides it, the whole-organisation view shows it.
select pg_temp.as_owner();
insert into ctx select 'other_project', p.id from public.projects p
  where p.organisation_id = pg_temp.c('org') and p.id <> (select project_id from public.risks where id = pg_temp.c('risk')) limit 1;
select pg_temp.as_user(pg_temp.c('pmo'));
insert into out select 'linkage_custom', public.report_block_data(jsonb_build_object('organisation_id', pg_temp.c('org'),
  'scope_type', 'custom', 'scope_items', jsonb_build_array(jsonb_build_object('entity_type', 'project', 'entity_id', pg_temp.c('other_project')))),
  '{"id":"b","blockKey":"baf_linkage","config":{}}');
select pg_temp.ok('linkage: out-of-scope risk hidden by default', (pg_temp.o('linkage_custom') ->> 'linked_total')::int = 0
  and jsonb_array_length(pg_temp.o('linkage_custom') -> 'unlinked') = 3);
select pg_temp.ok('linkage: in_scope_only false shows it', (public.report_block_data(jsonb_build_object('organisation_id', pg_temp.c('org'),
  'scope_type', 'custom', 'scope_items', jsonb_build_array(jsonb_build_object('entity_type', 'project', 'entity_id', pg_temp.c('other_project')))),
  '{"id":"b","blockKey":"baf_linkage","config":{"in_scope_only":false}}') ->> 'linked_total')::int = 1);

-- 4. Another organisation's user, passing this organisation's id, sees nothing.
select pg_temp.as_user(pg_temp.c('outsider'));
create function pg_temp.outsider_total(k text, field text) returns integer language plpgsql as $$
begin
  return (pg_temp.block(k) ->> field)::integer;
exception when others then return 0;
end $$;
select pg_temp.ok('outsider: no strategic risks in any block',
  coalesce(pg_temp.outsider_total('baf_summary', 'total'), 0) = 0
  and coalesce(pg_temp.outsider_total('baf_above_appetite', 'total_open'), 0) = 0
  and coalesce(pg_temp.outsider_total('baf_linkage', 'linked_total'), 0) = 0);

-- 5. Templates and partner safety.
select pg_temp.as_owner();
select pg_temp.ok('five committee templates, system rows with the assurance scheme',
  (select count(*) from public.report_templates where is_system and rating_scheme_key = 'nhs_assurance' and risk_matrix_key is null
   and name in ('Trust Board', 'Finance & Performance Committee', 'Quality Committee', 'Audit & Risk Committee',
                'Executive Management / PMO Board')) = 5);
select pg_temp.ok('every committee template block has a data function',
  not exists (select 1 from public.report_templates t, jsonb_array_elements(t.blocks) b
              where t.is_system and t.rating_scheme_key = 'nhs_assurance'
                and to_regprocedure('private.rb_' || (b ->> 'blockKey') || '(jsonb,jsonb)') is null));
select pg_temp.ok('committee templates carry selection rules',
  not exists (select 1 from public.report_templates where is_system and rating_scheme_key = 'nhs_assurance' and selection_rules = '{}'));
select pg_temp.ok('BAF blocks are partner-unsafe',
  private.partner_unsafe_blocks() @> array['baf_summary', 'baf_above_appetite', 'baf_linkage', 'resource_summary', 'data_quality']);
select pg_temp.ok('block functions closed to anon',
  not has_function_privilege('anon', 'private.rb_baf_summary(jsonb,jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.rb_baf_rows(jsonb)', 'execute'));

-- 6. A Trust Board pack published from the template stores the BAF, hidden from partners.
select pg_temp.as_user(pg_temp.c('pmo'));
insert into ctx select 'report', public.create_report(jsonb_build_object('scope_type', 'portfolio',
  'scope_entity_id', pg_temp.c('portfolio'), 'title', 'Board pack',
  'template_id', (select id from public.report_templates where is_system and name = 'Trust Board')));
select public.publish_report(pg_temp.c('report'));
select pg_temp.as_owner();
select pg_temp.ok('published pack: BAF snapshot with three risks, hidden from partners',
  (select (s.data ->> 'total')::int = 3 and s.hidden_from_partners from public.report_snapshots s
   where s.report_id = pg_temp.c('report') and s.block_key = 'baf_summary'));
select pg_temp.ok('published pack: above-appetite snapshot hidden from partners',
  (select s.hidden_from_partners and (s.data ->> 'count')::int = 1 from public.report_snapshots s
   where s.report_id = pg_temp.c('report') and s.block_key = 'baf_above_appetite'));
select pg_temp.ok('published pack: report uses the assurance scheme',
  (select s.key from public.reports r join public.rating_schemes s on s.id = r.rating_scheme_id where r.id = pg_temp.c('report'))
  = 'nhs_assurance');

select 'assurance_blocks: ' || n || ' checks passed' from passed;
rollback;
