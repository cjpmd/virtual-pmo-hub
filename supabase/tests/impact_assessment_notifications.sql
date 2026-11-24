-- NHS-3 part 3: sign-off notifications and report blocks for impact assessments
-- (supabase/migrations/20261123160000_nhs_3b_assessment_notifications_blocks.sql). Needs only the
-- migrations (no seed): creates its own organisation, runs inside a transaction and rolls
-- everything back. Each check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/impact_assessment_notifications.sql
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9500000-0000-4000-8000-000000000001', 'nhs3n.admin@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000002', 'nhs3n.pmo@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000003', 'nhs3n.contrib@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000004', 'nhs3n.md@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000005', 'nhs3n.cn@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000006', 'nhs3n.viewer@example.com', now(), '{}'),
  ('e9500000-0000-4000-8000-000000000009', 'nhs3n.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9500000-0000-4000-8000-000000000001', 'nhs3n.admin@example.com', 'NHS3N Admin'),
  ('e9500000-0000-4000-8000-000000000002', 'nhs3n.pmo@example.com', 'NHS3N PMO'),
  ('e9500000-0000-4000-8000-000000000003', 'nhs3n.contrib@example.com', 'NHS3N Contributor'),
  ('e9500000-0000-4000-8000-000000000004', 'nhs3n.md@example.com', 'NHS3N Medical Director'),
  ('e9500000-0000-4000-8000-000000000005', 'nhs3n.cn@example.com', 'NHS3N Chief Nurse'),
  ('e9500000-0000-4000-8000-000000000006', 'nhs3n.viewer@example.com', 'NHS3N Viewer'),
  ('e9500000-0000-4000-8000-000000000009', 'nhs3n.outsider@example.com', 'NHS3N Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9500000-0000-4000-8000-000000000001'),
  ('pmo', 'e9500000-0000-4000-8000-000000000002'), ('contrib', 'e9500000-0000-4000-8000-000000000003'),
  ('md', 'e9500000-0000-4000-8000-000000000004'), ('cn', 'e9500000-0000-4000-8000-000000000005'),
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
-- Answers: every domain / characteristic neutral, with overrides.
create function pg_temp.neutral(list text, overrides jsonb default '{}') returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(d ->> 'key', jsonb_build_object('impact', 'neutral', 'description', 'No change expected')), '{}')
         || overrides
  from jsonb_array_elements(private.impact_assessment_default_template('nhs') -> list) d $$;
grant execute on function pg_temp.neutral(text, jsonb) to authenticated, anon;
create function pg_temp.status(id uuid) returns text language sql stable security definer as $$
  select status from public.impact_assessments where impact_assessments.id = status.id $$;
grant execute on function pg_temp.status(uuid) to authenticated, anon;
create function pg_temp.step(id uuid, role text) returns uuid language sql stable security definer as $$
  select s.id from public.approval_steps s join public.impact_assessments a on a.gate_id = s.gate_id
  where a.id = step.id and s.governance_role = role $$;
grant execute on function pg_temp.step(uuid, text) to authenticated, anon;
create function pg_temp.phase(n integer) returns uuid language sql stable security definer as $$
  select l.id from public.lifecycle_phases l where l.organisation_id = pg_temp.c('org') order by l.sort_order offset n - 1 limit 1 $$;
grant execute on function pg_temp.phase(integer) to authenticated, anon;

-- Organisation with sample data; members; NHS pack not yet applied.
select pg_temp.as_user(pg_temp.c('admin'));
insert into ctx select 'org', public.create_organisation(p_name => 'NHS3N Org', p_sector => 'public_sector');
select public.seed_sample_data(pg_temp.c('org'));
select pg_temp.as_owner();
insert into ctx select 'ws', id from public.workspaces where organisation_id = pg_temp.c('org') limit 1;
insert into ctx select 'portfolio', id from public.portfolios where organisation_id = pg_temp.c('org') and is_sample limit 1;
insert into ctx select 'prog', id from public.programmes where organisation_id = pg_temp.c('org') and is_sample limit 1;
insert into public.organisation_members (organisation_id, profile_id, role) values
  (pg_temp.c('org'), pg_temp.c('pmo'), 'pmo'), (pg_temp.c('org'), pg_temp.c('contrib'), 'contributor'),
  (pg_temp.c('org'), pg_temp.c('md'), 'contributor'), (pg_temp.c('org'), pg_temp.c('cn'), 'contributor'),
  (pg_temp.c('org'), pg_temp.c('viewer'), 'viewer');
insert into public.workspace_members (workspace_id, organisation_id, profile_id, role) values
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('contrib'), 'contributor'),
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('md'), 'contributor'),
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('cn'), 'contributor'),
  (pg_temp.c('ws'), pg_temp.c('org'), pg_temp.c('viewer'), 'viewer')
on conflict do nothing;
-- Two real (not sample) projects in phase 1.
insert into public.projects (workspace_id, portfolio_id, name, phase_id) values
  (pg_temp.c('ws'), pg_temp.c('portfolio'), 'Ward reconfiguration', pg_temp.phase(1)),
  (pg_temp.c('ws'), pg_temp.c('portfolio'), 'Outpatient redesign', pg_temp.phase(1));
insert into ctx select 'pa', id from public.projects where name = 'Ward reconfiguration' and organisation_id = pg_temp.c('org');
insert into ctx select 'pb', id from public.projects where name = 'Outpatient redesign' and organisation_id = pg_temp.c('org');
select pg_temp.ok('fixture: two projects, a programme, at least four phases',
  pg_temp.c('pa') is not null and pg_temp.c('pb') is not null and pg_temp.c('prog') is not null and pg_temp.phase(4) is not null);

-- Notifications helpers (as the owner, so RLS doesn't hide other people's rows).
create function pg_temp.open_n(who uuid, k text) returns integer language sql stable security definer as $$
  select count(*)::int from public.notifications n where n.recipient_id = who and n.kind = k
    and n.organisation_id = pg_temp.c('org') and n.resolved_at is null $$;
grant execute on function pg_temp.open_n(uuid, text) to authenticated, anon;
create function pg_temp.last_text(who uuid, k text) returns text language sql stable security definer as $$
  select n.text from public.notifications n where n.recipient_id = who and n.kind = k
    and n.organisation_id = pg_temp.c('org') and n.resolved_at is null order by n.created_at desc limit 1 $$;
grant execute on function pg_temp.last_text(uuid, text) to authenticated, anon;
create function pg_temp.rctx() returns jsonb language sql stable as $$
  select jsonb_build_object('organisation_id', pg_temp.c('org'), 'as_at', current_date + 400, 'scope_type', 'custom',
    'project_ids', jsonb_build_array(pg_temp.c('pa'), pg_temp.c('pb')), 'matrix', null) $$;

-- 1. NHS pack on; roles held. The viewer also holds Chief Nurse (can't decide: never notified).
select pg_temp.as_user(pg_temp.c('admin'));
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.as_user(pg_temp.c('pmo'));
insert into public.governance_role_holders (organisation_id, role_key, profile_id) values
  (pg_temp.c('org'), 'medical_director', pg_temp.c('md')), (pg_temp.c('org'), 'chief_nurse', pg_temp.c('cn')),
  (pg_temp.c('org'), 'chief_nurse', pg_temp.c('viewer'));

-- 2. A contributor submits; both approvers are told.
select pg_temp.as_user(pg_temp.c('contrib'));
insert into public.impact_assessments (entity_type, entity_id, screening, quality, equality) values ('project', pg_temp.c('pa'),
  pg_temp.neutral('domains', '{"workforce": {"impact": "negative", "consequence": 2, "likelihood": 3, "note": "Rota gaps"}}'),
  pg_temp.neutral('domains', '{"workforce": {"impact": "negative", "consequence": 2, "likelihood": 3,
    "description": "Rota gaps on nights", "mitigations": "Bank staff cover"}}'),
  pg_temp.neutral('equality', '{"age": {"impact": "negative", "evidence": "Older patients travel further",
    "mitigation": "Patient transport"}}'));
insert into ctx select 'ia', id from public.impact_assessments where entity_id = pg_temp.c('pa');
select pg_temp.ok('a draft raises nothing', pg_temp.open_n(pg_temp.c('md'), 'assessment_signoff') = 0);
select public.submit_impact_assessment(pg_temp.c('ia'));
select pg_temp.ok('submitted: Medical Director and Chief Nurse each have one sign-off notification',
  pg_temp.open_n(pg_temp.c('md'), 'assessment_signoff') = 1 and pg_temp.open_n(pg_temp.c('cn'), 'assessment_signoff') = 1);
select pg_temp.ok('a viewer holding the role isn''t told (can''t decide)', pg_temp.open_n(pg_temp.c('viewer'), 'assessment_signoff') = 0);
select pg_temp.ok('the submitter isn''t told', pg_temp.open_n(pg_temp.c('contrib'), 'assessment_signoff') = 0);
select pg_temp.as_user(pg_temp.c('md'));
select pg_temp.ok('the approver reads it (RLS): text, link to Plan › Gates, entity is the step',
  (select count(*) = 1 from public.notifications n where n.kind = 'assessment_signoff'
     and n.text = '“Impact assessment: Ward reconfiguration” is waiting for your sign-off as Medical Director.'
     and n.link like '/portfolio/projects/%?tab=plan&sub=gates' and n.entity_type = 'approval_step'
     and n.entity_id = pg_temp.step(pg_temp.c('ia'), 'medical_director')));
select pg_temp.as_user(pg_temp.c('cn'));
select pg_temp.ok('nobody reads another person''s notifications',
  (select count(*) from public.notifications n where n.recipient_id <> pg_temp.c('cn')) = 0);

-- 3. A deputy assigned while it waits is told; an organisation PMO counts as able to decide.
select pg_temp.as_user(pg_temp.c('pmo'));
insert into public.governance_role_holders (organisation_id, role_key, profile_id, is_deputy) values
  (pg_temp.c('org'), 'medical_director', pg_temp.c('pmo'), true);
select pg_temp.ok('new deputy notified', pg_temp.open_n(pg_temp.c('pmo'), 'assessment_signoff') = 1);
delete from public.governance_role_holders where organisation_id = pg_temp.c('org') and role_key = 'medical_director'
  and profile_id = pg_temp.c('pmo');
select pg_temp.ok('role removed: the deputy''s notification is resolved', pg_temp.open_n(pg_temp.c('pmo'), 'assessment_signoff') = 0);

-- 4. Decisions resolve each step's notifications; the outcome goes to the submitter.
select pg_temp.as_user(pg_temp.c('md'));
select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'medical_director'), 'approved_with_conditions',
  null, 'Monthly rota review');
select pg_temp.ok('MD decided: MD resolved, CN still open',
  pg_temp.open_n(pg_temp.c('md'), 'assessment_signoff') = 0 and pg_temp.open_n(pg_temp.c('cn'), 'assessment_signoff') = 1);
select pg_temp.ok('an intermediate approval tells nobody', pg_temp.open_n(pg_temp.c('contrib'), 'assessment_decided') = 0);
select pg_temp.as_user(pg_temp.c('cn'));
select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'chief_nurse'), 'approved');
select pg_temp.ok('approved: CN resolved; submitter told it was approved with conditions',
  pg_temp.open_n(pg_temp.c('cn'), 'assessment_signoff') = 0 and pg_temp.open_n(pg_temp.c('contrib'), 'assessment_decided') = 1
  and pg_temp.last_text(pg_temp.c('contrib'), 'assessment_decided') = '“Impact assessment: Ward reconfiguration” was approved with conditions.');
select pg_temp.ok('the decider isn''t told of their own decision', pg_temp.open_n(pg_temp.c('cn'), 'assessment_decided') = 0);

-- 5. Flagged and resubmitted: a new round; returned for revision replaces the earlier outcome.
select pg_temp.as_user(pg_temp.c('contrib'));
select public.flag_impact_assessment_change(pg_temp.c('ia'), 'Second site added');
select public.submit_impact_assessment(pg_temp.c('ia'));
select pg_temp.ok('resubmitted: approvers told again for the new steps',
  pg_temp.open_n(pg_temp.c('md'), 'assessment_signoff') = 1 and pg_temp.open_n(pg_temp.c('cn'), 'assessment_signoff') = 1);
select pg_temp.as_user(pg_temp.c('cn'));
select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'chief_nurse'), 'returned', 'Assess the second site');
select pg_temp.ok('returned: every sign-off notification resolved',
  pg_temp.open_n(pg_temp.c('md'), 'assessment_signoff') = 0 and pg_temp.open_n(pg_temp.c('cn'), 'assessment_signoff') = 0);
select pg_temp.ok('submitter told it was returned; the earlier outcome is resolved',
  pg_temp.open_n(pg_temp.c('contrib'), 'assessment_decided') = 1
  and pg_temp.last_text(pg_temp.c('contrib'), 'assessment_decided') like '%was returned for revision.');

-- 6. Report blocks (as the contributor, under RLS; the draft is left out of negative impacts).
select pg_temp.ok('status block: one draft, sign-off 0 of 2, gate off, no gaps',
  (select (b -> 'counts' ->> 'draft')::int = 1 and (b ->> 'total')::int = 1 and not (b ->> 'gate_on')::boolean
     and jsonb_array_length(b -> 'gaps') = 0 and b -> 'rows' -> 0 ->> 'status' = 'draft'
   from (select private.rb_impact_assessment_status(pg_temp.rctx(), '{}') b) x));
select pg_temp.ok('negative impacts: drafts left out by default',
  (select (b ->> 'assessments')::int = 0 from (select private.rb_impact_negative_impacts(pg_temp.rctx(), '{}') b) x));
select pg_temp.ok('negative impacts with drafts: full-assessment workforce score 6 with mitigations, age with evidence, none unmitigated',
  (select (b ->> 'quality_count')::int = 1 and (b ->> 'equality_count')::int = 1 and (b ->> 'unmitigated')::int = 0
     and (b -> 'quality' -> 0 ->> 'score')::int = 6 and b -> 'quality' -> 0 ->> 'description' = 'Rota gaps on nights'
     and b -> 'quality' -> 0 ->> 'mitigations' = 'Bank staff cover'
     and b -> 'equality' -> 0 ->> 'characteristic' = 'Age'
   from (select private.rb_impact_negative_impacts(pg_temp.rctx(), '{"include_drafts": true}') b) x));
select pg_temp.ok('min_score leaves out lower quality impacts',
  (select (b ->> 'quality_count')::int = 0
   from (select private.rb_impact_negative_impacts(pg_temp.rctx(), '{"include_drafts": true, "min_score": 8}') b) x));
select public.submit_impact_assessment(pg_temp.c('ia'));
select pg_temp.ok('awaiting block: one assessment, both roles pending, waited 400 days at the as-at date',
  (select (b ->> 'count')::int = 1 and jsonb_array_length(b -> 'rows' -> 0 -> 'pending_roles') = 2
     and (b -> 'rows' -> 0 ->> 'days_waiting')::int = 400
   from (select private.rb_impact_assessments_awaiting(pg_temp.rctx(), '{}') b) x));
-- B reaches phase 4 before the gate (phase 3) is switched on.
select pg_temp.as_owner();
update public.projects set phase_id = pg_temp.phase(4) where id = pg_temp.c('pb');
select pg_temp.as_user(pg_temp.c('admin'));
select public.set_impact_assessment_gate(pg_temp.c('org'), pg_temp.phase(3));
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.ok('status block: gate on, B listed as missing, A in review',
  (select (b ->> 'gate_on')::boolean and jsonb_array_length(b -> 'gaps') = 1 and b -> 'gaps' -> 0 ->> 'name' = 'Outpatient redesign'
     and (b -> 'counts' ->> 'in_review')::int = 1
   from (select private.rb_impact_assessment_status(pg_temp.rctx(), '{}') b) x));
select pg_temp.ok('a scope without the project shows nothing',
  (select (b ->> 'total')::int = 0 from (select private.rb_impact_assessment_status(
     pg_temp.rctx() || jsonb_build_object('project_ids', jsonb_build_array(pg_temp.c('pb'))), '{}') b) x));
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('outsider: blocks see nothing (RLS)',
  (select (private.rb_impact_assessment_status(pg_temp.rctx(), '{}') ->> 'total')::int = 0
     and (private.rb_impact_assessments_awaiting(pg_temp.rctx(), '{}') ->> 'count')::int = 0));
select pg_temp.as_owner();
select pg_temp.ok('the three blocks are partner-unsafe',
  private.partner_unsafe_blocks() @> array['impact_assessment_status', 'impact_assessments_awaiting', 'impact_negative_impacts']);

-- 7. Settings: an organisation can switch the event off; people narrow it per channel.
select pg_temp.as_user(pg_temp.c('md'));
select public.set_my_notification_preferences('{"email": {"assessment_signoff": false}, "inApp": {"assessment_decided": true}}');
select pg_temp.ok('personal preference stored for the new kinds',
  (select preferences -> 'notifications' -> 'email' -> 'assessment_signoff' = 'false'::jsonb from public.profiles where id = pg_temp.c('md')));
select pg_temp.raises('unknown kinds still refused',
  $$select public.set_my_notification_preferences('{"email": {"bogus": false}}')$$, '22023');
select pg_temp.as_owner();
update public.organisations set settings = jsonb_set(settings, '{notifications}',
  coalesce(settings -> 'notifications', '{}') || '{"events": {"Impact assessment awaiting my sign-off": false}}')
where id = pg_temp.c('org');
update public.notifications set resolved_at = now() where organisation_id = pg_temp.c('org');
delete from public.governance_role_holders where organisation_id = pg_temp.c('org') and profile_id = pg_temp.c('md');
insert into public.governance_role_holders (organisation_id, role_key, profile_id) values
  (pg_temp.c('org'), 'medical_director', pg_temp.c('md'));
select pg_temp.ok('event switched off: nothing raised', pg_temp.open_n(pg_temp.c('md'), 'assessment_signoff') = 0);

-- 8. Module off: nothing new is raised, and a failing notification never fails the decision.
update public.organisations set settings = jsonb_set(settings, '{notifications,events}', '{}') where id = pg_temp.c('org');
update public.organisations set settings = jsonb_set(settings, '{modules,impact_assessment}', 'false') where id = pg_temp.c('org');
delete from public.governance_role_holders where organisation_id = pg_temp.c('org') and profile_id = pg_temp.c('md');
insert into public.governance_role_holders (organisation_id, role_key, profile_id) values
  (pg_temp.c('org'), 'medical_director', pg_temp.c('md'));
select pg_temp.ok('module off: nothing raised', pg_temp.open_n(pg_temp.c('md'), 'assessment_signoff') = 0);

-- 9. Deleting an assessment resolves what's left (as the owner; clients can't delete).
update public.organisations set settings = jsonb_set(settings, '{modules,impact_assessment}', 'true') where id = pg_temp.c('org');
select private.sync_impact_assessment_signoff(pg_temp.c('ia'));
select pg_temp.ok('module back on: sync raises again', pg_temp.open_n(pg_temp.c('md'), 'assessment_signoff') = 1);
delete from public.impact_assessments where id = pg_temp.c('ia');
select pg_temp.ok('deleted: resolved', pg_temp.open_n(pg_temp.c('md'), 'assessment_signoff') = 0);

select 'impact_assessment_notifications: ' || n || ' checks passed' from passed;
rollback;
