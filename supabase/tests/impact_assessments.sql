-- NHS-3: impact assessments (QIA / EqIA), sign-off and the delivery gate
-- (supabase/migrations/20261123140000_nhs_3_impact_assessments.sql). Needs only the migrations
-- (no seed): creates its own organisation, runs inside a transaction and rolls everything back.
-- Each check raises on failure; the last line prints the count passed.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/impact_assessments.sql
begin;

create temp table passed (n integer);
insert into passed values (0);
grant all on passed to authenticated, anon;
create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated, anon;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('e9400000-0000-4000-8000-000000000001', 'nhs3.admin@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000002', 'nhs3.pmo@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000003', 'nhs3.contrib@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000004', 'nhs3.md@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000005', 'nhs3.cn@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000006', 'nhs3.viewer@example.com', now(), '{}'),
  ('e9400000-0000-4000-8000-000000000009', 'nhs3.outsider@example.com', now(), '{}');
insert into public.profiles (id, email, display_name) values
  ('e9400000-0000-4000-8000-000000000001', 'nhs3.admin@example.com', 'NHS3 Admin'),
  ('e9400000-0000-4000-8000-000000000002', 'nhs3.pmo@example.com', 'NHS3 PMO'),
  ('e9400000-0000-4000-8000-000000000003', 'nhs3.contrib@example.com', 'NHS3 Contributor'),
  ('e9400000-0000-4000-8000-000000000004', 'nhs3.md@example.com', 'NHS3 Medical Director'),
  ('e9400000-0000-4000-8000-000000000005', 'nhs3.cn@example.com', 'NHS3 Chief Nurse'),
  ('e9400000-0000-4000-8000-000000000006', 'nhs3.viewer@example.com', 'NHS3 Viewer'),
  ('e9400000-0000-4000-8000-000000000009', 'nhs3.outsider@example.com', 'NHS3 Outsider')
on conflict (id) do nothing;
insert into ctx values ('admin', 'e9400000-0000-4000-8000-000000000001'),
  ('pmo', 'e9400000-0000-4000-8000-000000000002'), ('contrib', 'e9400000-0000-4000-8000-000000000003'),
  ('md', 'e9400000-0000-4000-8000-000000000004'), ('cn', 'e9400000-0000-4000-8000-000000000005'),
  ('viewer', 'e9400000-0000-4000-8000-000000000006'), ('outsider', 'e9400000-0000-4000-8000-000000000009');

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
insert into ctx select 'org', public.create_organisation(p_name => 'NHS3 Org', p_sector => 'public_sector');
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

-- 1. Module off: nobody can start an assessment.
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.raises('module off: contributor can''t create an assessment',
  $$insert into public.impact_assessments (entity_type, entity_id) values ('project', pg_temp.c('pa'))$$, '42501');

-- 2. NHS pack on. A contributor starts a draft on project A.
select pg_temp.as_user(pg_temp.c('admin'));
select public.apply_sector_pack(pg_temp.c('org'), 'nhs');
select pg_temp.ok('template: NHS default with five domains, eleven equality items, MD then CN',
  (select jsonb_array_length(t -> 'domains') = 5 and jsonb_array_length(t -> 'equality') = 11
     and t -> 'signoff' = '["medical_director", "chief_nurse"]'::jsonb
   from (select public.impact_assessment_template(pg_temp.c('org')) t) x));
select pg_temp.as_user(pg_temp.c('contrib'));
insert into public.impact_assessments (entity_type, entity_id, status, version)
values ('project', pg_temp.c('pa'), 'approved', 7);
insert into ctx select 'ia', id from public.impact_assessments where entity_id = pg_temp.c('pa');
select pg_temp.ok('draft: status and version can''t be set by the client; workspace and template stamped',
  (select status = 'draft' and version = 0 and workspace_id = pg_temp.c('ws') and organisation_id = pg_temp.c('org')
     and template_version = 1 and title = 'Impact assessment: Ward reconfiguration' and project_id = pg_temp.c('pa')
   from public.impact_assessments where id = pg_temp.c('ia')));
select pg_temp.raises('one assessment per target',
  $$insert into public.impact_assessments (entity_type, entity_id) values ('project', pg_temp.c('pa'))$$, '23505');
select pg_temp.raises('unknown target type refused',
  $$insert into public.impact_assessments (entity_type, entity_id) values ('benefit', pg_temp.c('pa'))$$, '22023');
select pg_temp.raises('contributor can''t assess a programme (managers and above)',
  $$insert into public.impact_assessments (entity_type, entity_id) values ('programme', pg_temp.c('prog'))$$, '42501');

-- 3. Submitting needs complete answers and assigned roles.
select pg_temp.raises('incomplete screening refused',
  $$select public.submit_impact_assessment(pg_temp.c('ia'))$$, '22023', 'impact_assessment_incomplete');
update public.impact_assessments set
  screening = pg_temp.neutral('domains', '{"workforce": {"impact": "negative", "consequence": 2, "likelihood": 2}}'),
  equality = pg_temp.neutral('equality')
where id = pg_temp.c('ia');
select pg_temp.ok('screening: score 4, no full assessment needed',
  (select screening_max_score = 4 and not full_required from public.impact_assessments where id = pg_temp.c('ia')));
update public.impact_assessments set screening = screening || '{"workforce": {"impact": "negative", "consequence": "x", "likelihood": 9}}'
where id = pg_temp.c('ia');
select pg_temp.ok('bad levels score 0 and don''t fail the save',
  (select screening_max_score = 0 from public.impact_assessments where id = pg_temp.c('ia')));
select pg_temp.raises('bad levels can''t be submitted',
  $$select public.submit_impact_assessment(pg_temp.c('ia'))$$, '22023', 'impact_assessment_incomplete');
update public.impact_assessments set screening = screening || '{"workforce": {"impact": "negative", "consequence": 2, "likelihood": 2}}'
where id = pg_temp.c('ia');
select pg_temp.raises('nobody holds the sign-off roles yet',
  $$select public.submit_impact_assessment(pg_temp.c('ia'))$$, '22023', 'governance_role_unassigned');
select pg_temp.as_user(pg_temp.c('pmo'));
insert into public.governance_role_holders (organisation_id, role_key, profile_id) values
  (pg_temp.c('org'), 'medical_director', pg_temp.c('md')), (pg_temp.c('org'), 'chief_nurse', pg_temp.c('cn'));
select pg_temp.as_user(pg_temp.c('viewer'));
select pg_temp.raises('viewer can''t submit',
  $$select public.submit_impact_assessment(pg_temp.c('ia'))$$, '42501');
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.raises('a stale updated_at is refused',
  $$select public.submit_impact_assessment(pg_temp.c('ia'), now() - interval '1 day')$$, '40001');
select public.submit_impact_assessment(pg_temp.c('ia'));
select pg_temp.ok('submitted: in review, version 1, two steps in order, review date in six months',
  (select v.status = 'in_review' and v.version = 1 and v.steps_total = 2
     and v.steps -> 0 ->> 'role' = 'medical_director' and v.steps -> 1 ->> 'role' = 'chief_nurse'
     and v.steps -> 0 ->> 'role_label' = 'Medical Director' and v.review_date = (current_date + interval '6 months')::date
   from public.v_impact_assessments v where v.id = pg_temp.c('ia')));

-- 4. Locked while in review; the sign-off can't be edited by hand.
select pg_temp.raises('answers locked in review',
  $$update public.impact_assessments set summary = 'x' where id = pg_temp.c('ia')$$, '42501', 'impact_assessment_locked');
select pg_temp.raises('a step can''t be removed by hand',
  $$delete from public.approval_steps where id = pg_temp.step(pg_temp.c('ia'), 'chief_nurse')$$, '42501', 'module_gate_locked');
select pg_temp.raises('a step can''t be added by hand',
  $$insert into public.approval_steps (organisation_id, workspace_id, gate_id, step_order, required_role)
    select organisation_id, workspace_id, gate_id, 9, 'Anyone' from public.impact_assessments where id = pg_temp.c('ia')$$,
  '42501', 'module_gate_locked');
select pg_temp.raises('the gate can''t be waived by hand',
  $$update public.approval_gates set status = 'waived'
    where id = (select gate_id from public.impact_assessments where id = pg_temp.c('ia'))$$, '42501', 'module_gate_locked');
select pg_temp.raises('a non-holder can''t decide',
  $$select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'medical_director'), 'approved')$$,
  '42501', 'governance_role_required');

-- 5. The Medical Director returns it for revision.
select pg_temp.as_user(pg_temp.c('md'));
select pg_temp.raises('returning needs a reason',
  $$select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'medical_director'), 'returned')$$, '22023');
select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'medical_director'), 'returned', 'Add the staffing plan');
select pg_temp.ok('returned: back to draft, gate rejected, decision kept',
  pg_temp.status(pg_temp.c('ia')) = 'draft'
  and (select g.status = 'rejected' from public.approval_gates g join public.impact_assessments a on a.gate_id = g.id
       where a.id = pg_temp.c('ia'))
  and (select count(*) = 1 from public.impact_assessment_decisions d
       where d.assessment_id = pg_temp.c('ia') and d.decision = 'returned' and d.governance_role = 'medical_director'));

-- 6. Resubmitted; approved with conditions by both.
select pg_temp.as_user(pg_temp.c('contrib'));
update public.impact_assessments set summary = 'Staffing plan added' where id = pg_temp.c('ia');
select public.submit_impact_assessment(pg_temp.c('ia'));
select pg_temp.ok('resubmitted as version 2 with a new gate',
  (select version = 2 and status = 'in_review' from public.impact_assessments where id = pg_temp.c('ia'))
  and (select count(*) = 2 from public.approval_gates where entity_type = 'impact_assessment' and entity_id = pg_temp.c('ia')));
select pg_temp.as_user(pg_temp.c('md'));
select pg_temp.raises('conditions required for a conditional approval',
  $$select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'medical_director'), 'approved_with_conditions')$$, '22023');
select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'medical_director'), 'approved_with_conditions',
  null, 'Review agency use monthly');
select pg_temp.ok('one approval: still in review', pg_temp.status(pg_temp.c('ia')) = 'in_review');
select pg_temp.as_user(pg_temp.c('cn'));
select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'chief_nurse'), 'approved');
select pg_temp.ok('both approved: approved, with conditions',
  (select v.status = 'approved' and v.has_conditions and v.steps_approved = 2 and v.approved_at is not null
   from public.v_impact_assessments v where v.id = pg_temp.c('ia')));
select pg_temp.raises('a decided step can''t be decided again',
  $$select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ia'), 'chief_nurse'), 'rejected', 'no')$$, '22023');

-- 7. The delivery gate (phase 3).
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.raises('only admins set the gate',
  $$select public.set_impact_assessment_gate(pg_temp.c('org'), pg_temp.phase(3))$$, '42501');
-- Project B reaches phase 4 before the gate is switched on. (Moving projects needs a workspace
-- manager or above, so the PMO does it.)
select pg_temp.as_user(pg_temp.c('pmo'));
update public.projects set phase_id = pg_temp.phase(4) where id = pg_temp.c('pb');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('the gate phase must be the organisation''s',
  $$select public.set_impact_assessment_gate(pg_temp.c('org'), gen_random_uuid())$$, '22023');
select public.set_impact_assessment_gate(pg_temp.c('org'), pg_temp.phase(3));
select pg_temp.as_user(pg_temp.c('pmo'));
update public.projects set phase_id = pg_temp.phase(3) where id = pg_temp.c('pa');
select pg_temp.ok('A (approved) moves into the gate phase',
  (select phase_id = pg_temp.phase(3) from public.projects where id = pg_temp.c('pa')));
update public.projects set phase_id = pg_temp.phase(5) where id = pg_temp.c('pb');
select pg_temp.ok('B, already past the gate, moves on without an assessment',
  (select phase_id = pg_temp.phase(5) from public.projects where id = pg_temp.c('pb')));
select pg_temp.ok('gaps: B listed as missing, A not',
  (select count(*) = 1 from public.impact_assessment_gaps(pg_temp.c('org')) g where g.project_id = pg_temp.c('pb') and g.status = 'missing')
  and not exists (select 1 from public.impact_assessment_gaps(pg_temp.c('org')) g where g.project_id = pg_temp.c('pa')));
select pg_temp.raises('a new project can''t start in the gate phase',
  $$insert into public.projects (workspace_id, portfolio_id, name, phase_id)
    values (pg_temp.c('ws'), pg_temp.c('portfolio'), 'Late starter', pg_temp.phase(3))$$, 'P0001', 'impact_assessment_required');
insert into public.projects (workspace_id, portfolio_id, name, phase_id)
values (pg_temp.c('ws'), pg_temp.c('portfolio'), 'Early starter', pg_temp.phase(2));
select pg_temp.raises('an unassessed project can''t move into the gate phase',
  $$update public.projects set phase_id = pg_temp.phase(3) where name = 'Early starter' and organisation_id = pg_temp.c('org')$$,
  'P0001', 'impact_assessment_required');
select pg_temp.raises('nor jump past it',
  $$update public.projects set phase_id = pg_temp.phase(5) where name = 'Early starter' and organisation_id = pg_temp.c('org')$$,
  'P0001', 'impact_assessment_required');

-- 8. A material change re-blocks the gate.
update public.projects set phase_id = pg_temp.phase(2) where id = pg_temp.c('pa');
select pg_temp.raises('a material change needs a description',
  $$select public.flag_impact_assessment_change(pg_temp.c('ia'), ' ')$$, '22023');
select public.flag_impact_assessment_change(pg_temp.c('ia'), 'Scope extended to a second ward');
select pg_temp.ok('flagged: re-assessment required', pg_temp.status(pg_temp.c('ia')) = 'reassessment_required');
select pg_temp.raises('A can''t re-enter the gate phase until re-approved',
  $$update public.projects set phase_id = pg_temp.phase(3) where id = pg_temp.c('pa')$$, 'P0001', 'impact_assessment_required');
update public.impact_assessments set summary = 'Second ward assessed' where id = pg_temp.c('ia');
select pg_temp.ok('answers editable again after the flag',
  (select summary = 'Second ward assessed' from public.impact_assessments where id = pg_temp.c('ia')));

-- 9. Templates: admins change them; existing assessments keep theirs.
select pg_temp.raises('only admins change the template',
  $$select public.set_impact_assessment_template(pg_temp.c('org'), private.impact_assessment_default_template('nhs'))$$, '42501');
select pg_temp.as_user(pg_temp.c('admin'));
select pg_temp.raises('a template without sign-off is refused',
  $$select public.set_impact_assessment_template(pg_temp.c('org'),
      private.impact_assessment_default_template('nhs') || '{"signoff": []}')$$, '22023');
select pg_temp.raises('a text threshold is refused',
  $$select public.set_impact_assessment_template(pg_temp.c('org'),
      private.impact_assessment_default_template('nhs') || '{"fullAssessmentMinScore": "high"}')$$, '22023');
select pg_temp.raises('duplicate domain keys are refused',
  $$select public.set_impact_assessment_template(pg_temp.c('org'), private.impact_assessment_default_template('nhs')
      || jsonb_build_object('domains', '[{"key":"a","label":"A"},{"key":"a","label":"B"}]'::jsonb))$$, '22023');
select public.set_impact_assessment_template(pg_temp.c('org'), private.impact_assessment_default_template('nhs')
  || '{"fullAssessmentMinScore": 4, "fullSignoff": ["head_of_pmo"]}');
select pg_temp.ok('template version 2 with the new threshold',
  (select (t ->> 'version')::int = 2 and (t ->> 'fullAssessmentMinScore')::int = 4
   from (select public.impact_assessment_template(pg_temp.c('org')) t) x));
select pg_temp.ok('existing assessment keeps version 1 and its threshold (still no full assessment)',
  (select template_version = 1 and not full_required from public.impact_assessments where id = pg_temp.c('ia')));

-- 10. A full assessment on the programme (PMO), under template 2.
select pg_temp.as_user(pg_temp.c('pmo'));
insert into public.impact_assessments (entity_type, entity_id, screening, equality) values ('programme', pg_temp.c('prog'),
  pg_temp.neutral('domains', '{"patient_safety": {"impact": "negative", "consequence": 2, "likelihood": 2}}'),
  pg_temp.neutral('equality', '{"disability": {"impact": "negative"}}'));
insert into ctx select 'ib', id from public.impact_assessments where entity_id = pg_temp.c('prog');
select pg_temp.ok('programme assessment: template 2, score 4 reaches the new threshold',
  (select template_version = 2 and full_required and screening_max_score = 4 and programme_id = pg_temp.c('prog')
   from public.impact_assessments where id = pg_temp.c('ib')));
select pg_temp.raises('the full assessment must be completed',
  $$select public.submit_impact_assessment(pg_temp.c('ib'))$$, '22023', 'impact_assessment_incomplete');
update public.impact_assessments set
  quality = pg_temp.neutral('domains', '{"patient_safety": {"impact": "negative", "description": "Fewer beds overnight",
             "consequence": 2, "likelihood": 2, "mitigations": "Escalation beds", "indicators": ["Falls"]}}'),
  equality = pg_temp.neutral('equality', '{"disability": {"impact": "negative", "evidence": "Access survey",
             "mitigation": "Step-free route"}}')
where id = pg_temp.c('ib');
select pg_temp.raises('the full route adds Head of PMO, who has no holder yet',
  $$select public.submit_impact_assessment(pg_temp.c('ib'))$$, '22023', 'governance_role_unassigned');
insert into public.governance_role_holders (organisation_id, role_key, profile_id) values
  (pg_temp.c('org'), 'head_of_pmo', pg_temp.c('pmo'));
select public.submit_impact_assessment(pg_temp.c('ib'));
select pg_temp.ok('full assessment: three steps', (select steps_total = 3 and negative_equality = 1 and negative_domains = 1
  from public.v_impact_assessments where id = pg_temp.c('ib')));
select pg_temp.as_user(pg_temp.c('md'));
select public.decide_impact_assessment(pg_temp.step(pg_temp.c('ib'), 'medical_director'), 'rejected', 'Mitigation too weak');
select pg_temp.ok('rejected by one approver: rejected', pg_temp.status(pg_temp.c('ib')) = 'rejected');
select pg_temp.as_user(pg_temp.c('pmo'));
update public.impact_assessments set summary = 'Stronger mitigation' where id = pg_temp.c('ib');
select pg_temp.ok('a rejected assessment can be revised', (select summary = 'Stronger mitigation'
  from public.impact_assessments where id = pg_temp.c('ib')));

-- 11. Outsiders and module off.
select pg_temp.as_user(pg_temp.c('outsider'));
select pg_temp.ok('outsider sees nothing', (select count(*) from public.impact_assessments) = 0
  and (select count(*) from public.v_impact_assessments) = 0 and (select count(*) from public.impact_assessment_decisions) = 0
  and public.impact_assessment_template(pg_temp.c('org')) is null
  and (select count(*) from public.impact_assessment_gaps(pg_temp.c('org'))) = 0);
select pg_temp.raises('outsider can''t submit', $$select public.submit_impact_assessment(pg_temp.c('ib'))$$, '42501');
select pg_temp.raises('outsider can''t flag', $$select public.flag_impact_assessment_change(pg_temp.c('ia'), 'x')$$, '42501');
select pg_temp.raises('outsider can''t assess A''s project',
  $$insert into public.impact_assessments (entity_type, entity_id) values ('project', pg_temp.c('pb'))$$, '23503');
select pg_temp.as_user(pg_temp.c('admin'));
select public.set_organisation_module(pg_temp.c('org'), 'impact_assessment', false);
select pg_temp.as_user(pg_temp.c('contrib'));
select pg_temp.ok('module off: assessments still readable', (select count(*) from public.impact_assessments) = 2);
update public.impact_assessments set summary = 'off' where id = pg_temp.c('ia');
select pg_temp.ok('module off: edits change nothing', (select summary = 'Second ward assessed'
  from public.impact_assessments where id = pg_temp.c('ia')));
select pg_temp.raises('module off: no submit', $$select public.submit_impact_assessment(pg_temp.c('ia'))$$, '42501');
select pg_temp.as_user(pg_temp.c('pmo'));
update public.projects set phase_id = pg_temp.phase(3) where id = pg_temp.c('pa');
select pg_temp.ok('module off: the gate is off too', (select phase_id = pg_temp.phase(3) from public.projects where id = pg_temp.c('pa')));

-- 12. Housekeeping.
select pg_temp.as_owner();
select pg_temp.ok('audited', (select count(*) > 0 from public.audit_log where entity_table = 'impact_assessments'
  and organisation_id = pg_temp.c('org')));
select pg_temp.ok('read-only triggers present', (select count(*) = 2 from pg_trigger where tgname = 'zz_org_read_only'
  and tgrelid in ('public.impact_assessments'::regclass, 'public.impact_assessment_decisions'::regclass)));
select pg_temp.ok('view is security invoker', (select reloptions @> '{security_invoker=true}' from pg_class
  where oid = 'public.v_impact_assessments'::regclass));
select pg_temp.ok('decisions can''t be written by clients', not has_table_privilege('authenticated',
  'public.impact_assessment_decisions', 'insert'));

select 'impact_assessments: ' || n || ' checks passed' from passed;
rollback;
