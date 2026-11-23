-- NHS-1: board assurance (strategic risks, score history, actions, BAF links)
-- (supabase/migrations/20261122170000_nhs_1_board_assurance.sql, docs/sql/nhs-1-board-assurance.sql). Needs only
-- the migrations (no seed): creates its own organisation, runs inside a transaction and rolls
-- everything back. Each check raises on failure; the last line prints the count passed.
-- Cross-tenant cases come from cross_tenant.sql's generic filler.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/board_assurance.sql
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;
create temp table snap (k text primary key, v text);
grant all on snap to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9100000-0000-4000-8000-000000000001', 'nhs1.admin@example.com', now(), '{}'),
  ('e9100000-0000-4000-8000-000000000002', 'nhs1.pmo@example.com', now(), '{}'),
  ('e9100000-0000-4000-8000-000000000003', 'nhs1.contrib@example.com', now(), '{}'),
  ('e9100000-0000-4000-8000-000000000004', 'nhs1.viewer@example.com', now(), '{}'),
  ('e9100000-0000-4000-8000-000000000005', 'nhs1.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9100000-0000-4000-8000-000000000001', 'nhs1.admin@example.com', 'NHS1 Admin'),
  ('e9100000-0000-4000-8000-000000000002', 'nhs1.pmo@example.com', 'NHS1 PMO'),
  ('e9100000-0000-4000-8000-000000000003', 'nhs1.contrib@example.com', 'NHS1 Contributor'),
  ('e9100000-0000-4000-8000-000000000004', 'nhs1.viewer@example.com', 'NHS1 Viewer'),
  ('e9100000-0000-4000-8000-000000000005', 'nhs1.outsider@example.com', 'NHS1 Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9100000-0000-4000-8000-000000000001'),
  ('pmo', 'e9100000-0000-4000-8000-000000000002'), ('contrib', 'e9100000-0000-4000-8000-000000000003'),
  ('viewer', 'e9100000-0000-4000-8000-000000000004'), ('outsider', 'e9100000-0000-4000-8000-000000000005');

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
create function pg_temp.settings() returns jsonb language sql stable security definer as $$
  select settings from public.organisations where id = pg_temp.c('org') $$;
create function pg_temp.roles() returns bigint language sql stable security definer as $$
  select count(*) from public.lookup_values where organisation_id = pg_temp.c('org') and list_key = 'governance_role' $$;
create function pg_temp.events() returns bigint language sql stable security definer as $$
  select count(*) from public.audit_log where organisation_id = pg_temp.c('org') and entity_table = 'organisations'
    and detail ->> 'event' = 'modules.changed' $$;
-- A fingerprint of the organisation's existing records: a pack must never change them.
create function pg_temp.records() returns text language sql stable security definer as $$
  select md5(concat_ws('|',
    (select string_agg(to_jsonb(r)::text, ',' order by r.id) from public.risks r where r.organisation_id = pg_temp.c('org')),
    (select string_agg(to_jsonb(p)::text, ',' order by p.id) from public.projects p where p.organisation_id = pg_temp.c('org')),
    (select string_agg(to_jsonb(b)::text, ',' order by b.id) from public.benefits b where b.organisation_id = pg_temp.c('org')),
    (select string_agg(to_jsonb(f)::text, ',' order by f.id) from public.financial_values f where f.organisation_id = pg_temp.c('org')),
    (select string_agg(l.list_key || ':' || l.value || ':' || l.label, ',' order by l.list_key, l.value)
       from public.lookup_values l where l.organisation_id = pg_temp.c('org') and l.list_key not in ('governance_role', 'risk_appetite', 'measure_unit')
         -- NHS-2: the module adds its categories beside the existing ones (benefit_categories.sql checks those are untouched).
         and not (l.list_key = 'benefit_category' and l.value in (select c.value from private.nhs_benefit_categories() c))),
    (select settings -> 'regional' from public.organisations where id = pg_temp.c('org')))) $$;
create function pg_temp.history(p_risk uuid) returns bigint language sql stable security definer as $$
  select count(*) from public.strategic_risk_scores where strategic_risk_id = p_risk $$;

-- An existing public-sector organisation with sample data (projects, risks).
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS1 Org', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('org'));
select pg_temp.as_owner();
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('org'), pg_temp.c('pmo'), 'pmo'), (pg_temp.c('org'), pg_temp.c('contrib'), 'contributor'),
  (pg_temp.c('org'), pg_temp.c('viewer'), 'viewer');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('contrib'), 'contributor')
on conflict do nothing;
insert into ctx select 'contrib_resource', id from public.resources
  where organisation_id = pg_temp.c('org') and profile_id = pg_temp.c('contrib');
insert into ctx select 'risk', id from public.risks where organisation_id = pg_temp.c('org') order by ref limit 1;
insert into ctx select 'issue', id from public.issues where organisation_id = pg_temp.c('org') order by ref limit 1;
insert into ctx select 'objective', null;
insert into snap select 'records', pg_temp.records();
select pg_temp.ok('fixture has a risk, an issue and the contributor''s resource',
  pg_temp.c('risk') is not null and pg_temp.c('issue') is not null and pg_temp.c('contrib_resource') is not null);

-- 1. Module off: nothing can be written.
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.raises('module off: PMO can''t add a strategic risk',
  $$insert into public.strategic_risks (organisation_id, title, current_likelihood, current_consequence)
    values (pg_temp.c('org'), 'Off', 3, 3)$$, '42501');

-- 2. Applying the NHS pack seeds the appetite list and the NHS 5×5 for the BAF; nothing existing changes.
select pg_temp.as_user(pg_temp.c('admin'));
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.ok('BAF matrix set to the NHS 5×5', pg_temp.settings() -> 'assurance' ->> 'matrixKey' = 'nhs_5x5');
select pg_temp.ok('six appetite levels seeded', (select count(*) from public.lookup_values
  where organisation_id = pg_temp.c('org') and list_key = 'risk_appetite') = 6);
select pg_temp.ok('existing risks, projects, lists and financial year unchanged', pg_temp.records() = (select v from snap where k = 'records'));
select pg_temp.ok('project risks keep no matrix (register scoring unchanged)',
  not exists (select 1 from public.risks where organisation_id = pg_temp.c('org') and risk_matrix_id is not null));
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.ok('applying twice adds nothing', (select count(*) from public.lookup_values
  where organisation_id = pg_temp.c('org') and list_key = 'risk_appetite') = 6);
select public.set_organisation_module(pg_temp.c('org'), 'assurance', false);
update public.organisations set settings = jsonb_set(settings, '{assurance}', '{"matrixKey":"default"}') where id = pg_temp.c('org');
select public.set_organisation_module(pg_temp.c('org'), 'assurance', true);
select pg_temp.ok('a chosen matrix is never overwritten', pg_temp.settings() -> 'assurance' ->> 'matrixKey' = 'default');
update public.organisations set settings = jsonb_set(settings, '{assurance}', '{"matrixKey":"nhs_5x5"}') where id = pg_temp.c('org');

-- 3. PMO adds a strategic risk: matrix, scheme and ref stamped, history started.
select pg_temp.as_user(pg_temp.c('pmo'));
with x as (
  insert into public.strategic_risks (organisation_id, title, current_likelihood, current_consequence,
    initial_likelihood, initial_consequence, target_likelihood, target_consequence, appetite_score, risk_appetite,
    executive_lead_id)
  values (pg_temp.c('org'), 'Unable to recover elective activity', 4, 4, 5, 4, 2, 3, 12, 'cautious', pg_temp.c('contrib_resource'))
  returning id)
insert into ctx select 'sr', id from x;
select pg_temp.ok('ref uses BAF', (select ref like 'BAF%' from public.strategic_risks where id = pg_temp.c('sr')));
select pg_temp.ok('stamped with the NHS 5×5', (select v.risk_matrix_key = 'nhs_5x5' from public.v_strategic_risks v where v.id = pg_temp.c('sr')));
select pg_temp.ok('stamped with the NHS assurance scheme', (select s.key = 'nhs_assurance' from public.strategic_risks r
  join public.rating_schemes s on s.id = r.rating_scheme_id where r.id = pg_temp.c('sr')));
select pg_temp.ok('scores and band', (select v.current_score = 16 and v.initial_score = 20 and v.target_score = 6
  and v.current_band ->> 'key' = 'extreme' from public.v_strategic_risks v where v.id = pg_temp.c('sr')));
select pg_temp.ok('above appetite', (select v.above_appetite from public.v_strategic_risks v where v.id = pg_temp.c('sr')));
select pg_temp.ok('trend new, one history row', (select v.trend = 'new' from public.v_strategic_risks v where v.id = pg_temp.c('sr'))
  and pg_temp.history(pg_temp.c('sr')) = 1);

-- 4. Rescoring adds history and a trend; other edits don't.
update public.strategic_risks set current_likelihood = 3, current_consequence = 3 where id = pg_temp.c('sr');
select pg_temp.ok('trend down from 16', (select v.trend = 'down' and v.previous_score = 16 and v.current_score = 9
  and v.current_band ->> 'key' = 'high' and not v.above_appetite from public.v_strategic_risks v where v.id = pg_temp.c('sr')));
update public.strategic_risks set gaps_in_control = 'No weekend theatre lists' where id = pg_temp.c('sr');
select pg_temp.ok('a text edit adds no history', pg_temp.history(pg_temp.c('sr')) = 2);
select pg_temp.raises('scores must fit the matrix',
  $$update public.strategic_risks set current_likelihood = 6 where id = pg_temp.c('sr')$$, '23514');
select pg_temp.raises('the rating must be one of the scheme''s levels',
  $$update public.strategic_risks set assurance_rating = 'excellent' where id = pg_temp.c('sr')$$, '23514');
update public.strategic_risks set assurance_rating = 'limited' where id = pg_temp.c('sr');
select pg_temp.ok('assurance label from the scheme', (select v.assurance_label = 'Limited assurance'
  from public.v_strategic_risks v where v.id = pg_temp.c('sr')));
select pg_temp.raises('history is written only by the trigger',
  $$insert into public.strategic_risk_scores (organisation_id, strategic_risk_id, likelihood, consequence)
    values (pg_temp.c('org'), pg_temp.c('sr'), 1, 1)$$, '42501');
select pg_temp.raises('no deleting a strategic risk',
  $$delete from public.strategic_risks where id = pg_temp.c('sr')$$, '42501');
update public.strategic_risks set status = 'closed' where id = pg_temp.c('sr');
select pg_temp.ok('closing stamps closed_at', (select closed_at is not null from public.strategic_risks where id = pg_temp.c('sr')));
update public.strategic_risks set status = 'open' where id = pg_temp.c('sr');
select pg_temp.ok('reopening clears it', (select closed_at is null from public.strategic_risks where id = pg_temp.c('sr')));

-- 5. Changing the organisation's matrix never rescores an existing entry.
select pg_temp.as_user(pg_temp.c('admin'));
update public.organisations set settings = jsonb_set(settings, '{assurance}', '{"matrixKey":"default"}') where id = pg_temp.c('org');
select pg_temp.ok('existing entry keeps the NHS 5×5', (select v.risk_matrix_key = 'nhs_5x5' and v.current_band ->> 'key' = 'high'
  from public.v_strategic_risks v where v.id = pg_temp.c('sr')));
with x as (
  insert into public.strategic_risks (organisation_id, title, current_likelihood, current_consequence)
  values (pg_temp.c('org'), 'Workforce supply', 3, 3) returning id)
insert into ctx select 'sr2', id from x;
select pg_temp.ok('a new entry uses the newly chosen matrix', (select v.risk_matrix_key = 'default'
  from public.v_strategic_risks v where v.id = pg_temp.c('sr2')));

-- 6. Roles: contributors and viewers read; only PMO / admin write; outsiders see nothing.
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.raises('a contributor can''t add a strategic risk',
  $$insert into public.strategic_risks (organisation_id, title, current_likelihood, current_consequence)
    values (pg_temp.c('org'), 'No', 2, 2)$$, '42501');
update public.strategic_risks set title = 'Changed' where id = pg_temp.c('sr');
select pg_temp.ok('a contributor''s update changes nothing', (select title from public.strategic_risks where id = pg_temp.c('sr'))
  = 'Unable to recover elective activity');
select pg_temp.as_user(pg_temp.c('viewer'));
select pg_temp.ok('a viewer reads the register', (select count(*) from public.v_strategic_risks) = 2
  and (select count(*) from public.strategic_risk_scores) = 3);
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('an outsider sees nothing', (select count(*) from public.v_strategic_risks) = 0
  and (select count(*) from public.strategic_risk_scores) = 0);

-- 7. Actions: PMO adds; the owner updates their own; viewers can't.
select pg_temp.as_user(pg_temp.c('pmo'));
with x as (
  insert into public.strategic_risk_actions (organisation_id, strategic_risk_id, title, owner_id, due_date)
  values (pg_temp.c('org'), pg_temp.c('sr'), 'Agree weekend lists', pg_temp.c('contrib_resource'), current_date - 1)
  returning id)
insert into ctx select 'action', id from x;
select pg_temp.ok('open and overdue action counted', (select v.open_action_count = 1 and v.overdue_action_count = 1
  from public.v_strategic_risks v where v.id = pg_temp.c('sr')));
select pg_temp.as_user(pg_temp.c('contrib'));
update public.strategic_risk_actions set status = 'complete' where id = pg_temp.c('action');
select pg_temp.ok('the owner completes their action', (select status = 'complete' and completed_at is not null
  from public.strategic_risk_actions where id = pg_temp.c('action')));
select pg_temp.raises('an action stays with its strategic risk',
  $$update public.strategic_risk_actions set strategic_risk_id = pg_temp.c('sr2') where id = pg_temp.c('action')$$, '42501');
select pg_temp.as_user(pg_temp.c('viewer'));
update public.strategic_risk_actions set status = 'cancelled' where id = pg_temp.c('action');
select pg_temp.ok('a viewer''s update changes nothing', (select status from public.strategic_risk_actions
  where id = pg_temp.c('action')) = 'complete');

-- 8. Linking a project risk to the BAF.
select pg_temp.as_user(pg_temp.c('contrib'));
insert into public.record_links (organisation_id, workspace_id, from_type, from_id, to_type, to_id, link_type)
select r.organisation_id, r.workspace_id, 'risk', r.id, 'strategic_risk', pg_temp.c('sr'), 'contributes_to_baf'
from public.risks r where r.id = pg_temp.c('risk');
select pg_temp.ok('linked risk counted', (select v.linked_risk_count = 1 from public.v_strategic_risks v where v.id = pg_temp.c('sr')));
select pg_temp.raises('only a risk can contribute',
  $$insert into public.record_links (organisation_id, workspace_id, from_type, from_id, to_type, to_id, link_type)
    select i.organisation_id, i.workspace_id, 'issue', i.id, 'strategic_risk', pg_temp.c('sr'), 'contributes_to_baf'
    from public.issues i where i.id = pg_temp.c('issue')$$, '23514');
select pg_temp.raises('the strategic risk must exist in the organisation',
  $$insert into public.record_links (organisation_id, workspace_id, from_type, from_id, to_type, to_id, link_type)
    select r.organisation_id, r.workspace_id, 'risk', r.id, 'strategic_risk', gen_random_uuid(), 'contributes_to_baf'
    from public.risks r where r.id = pg_temp.c('risk')$$, '23503');

-- 9. Switching the module off keeps the data readable and stops writes.
select pg_temp.as_user(pg_temp.c('admin'));
select public.set_organisation_module(pg_temp.c('org'), 'assurance', false);
select pg_temp.as_user(pg_temp.c('pmo'));
select pg_temp.ok('data kept when switched off', (select count(*) from public.v_strategic_risks) = 2);
select pg_temp.raises('module off: no edits',
  $$update public.strategic_risks set title = 'Off' where id = pg_temp.c('sr')$$, '42501');
select pg_temp.raises('module off: no new actions',
  $$insert into public.strategic_risk_actions (organisation_id, strategic_risk_id, title)
    values (pg_temp.c('org'), pg_temp.c('sr'), 'Off')$$, '42501');
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.raises('module off: no new links',
  $$insert into public.record_links (organisation_id, workspace_id, from_type, from_id, to_type, to_id, link_type)
    select r.organisation_id, r.workspace_id, 'risk', r.id, 'strategic_risk', pg_temp.c('sr2'), 'contributes_to_baf'
    from public.risks r where r.id = pg_temp.c('risk')$$, 'P0001', 'module_off');

select pg_temp.as_owner();
select 'board_assurance: ' || n || ' checks passed' from passed;
rollback;
