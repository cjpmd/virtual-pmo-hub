-- RUNBOOK (19/10/2026): D2 follow-up - forum lookups retired, forums seeded for new
-- organisations, option history by title. Approved 19/10 as part of D2. Yours to run (contains
-- DROP and DELETE, which the MCP tools can't run).
--
-- When: now. Migrations 20261019160254_d2_0_milestone_type_approval and
-- 20261019160405_d2_forums_meetings are applied, and the app reads forum names from the forums
-- table (src/services/decisions.ts, pushed with this file) - so the lookup rows are no longer
-- read. Run Block A, send me the output; run Block B only if Block A shows 7 of 7.
--
-- What it changes (one transaction):
--   1. Drops the three foreign keys from decisions / decision_events to lookup_values
--      (forum ids are already checked against forums by the D2 migration's new keys), and the
--      three indexes that served them (the D2 migration adds (forum_id, organisation_id) ones).
--      The forum_list columns stay (a constant 'decision_forum'; dropping them would mean
--      rebuilding v_decisions). The app ignores them.
--   2. Deletes the 10 'decision_forum' lookup_values rows (5 per organisation). Their ids live
--      on as forums.id, so no decision changes.
--   3. private.seed_org_defaults: no decision_forum lookups; seeds the same five forums as
--      organisation-level forums (workspace_id null) instead.
--   4. update_pending_decision (item 2 of 19/10): 'edited' events record option changes by
--      title - {"options": {"renamed": [[old, new]], "added": [...], "removed": [...],
--      "pros_cons_changed": [...]}} with only the non-empty keys (before: [n_before, n_after]
--      counts) - and it accepts target_meeting_id (a planned meeting of the decision's forum,
--      else 22023 "Choose a planned meeting of the decision's forum."). Checked locally in
--      PGlite against stub tables (rename/remove/add, identical save = no event, pros-only
--      change, own-forum meeting, other forum's meeting = 22023, clearing).
--
-- Already dry-run by me (MCP, rolled back), before the organisation-level change: the seed on a
-- minimal forums table gave 5 forums, 0 decision_forum lookups, 54 other lookups, 6 phases /
-- 39 criteria / 4 benefit periods. Block A repeats it against the real D2 tables, plus the parts
-- I can't run (DROP, DELETE).
--
-- Test data: Block A uses only the outsider test organisation (UI Test DEC-003, Project Board
-- and ARB of that organisation) and a throwaway organisation, all rolled back.

-- ===== Block A: dry run (one transaction, rolled back; writes nothing) ======================
-- Expected: 7 rows, all ok = true, then ALL "7 of 7 ok" true. Paste me the output.

begin;

-- 1. Lookup keys for forums: dropped (forums keys added by d2_forums_meetings stay).
alter table public.decisions drop constraint decisions_forum_id_organisation_id_forum_list_fkey;
alter table public.decisions drop constraint decisions_decided_by_forum_fkey;
alter table public.decision_events drop constraint decision_events_forum_id_organisation_id_forum_list_fkey;
drop index public.decisions_forum_forum_list_idx;
drop index public.decisions_decided_by_forum_idx;
drop index public.decision_events_forum_idx;

-- 2. The old forum lookup rows (10: 5 per organisation; their ids are now forums.id).
delete from public.lookup_values where list_key = 'decision_forum';

-- 3. New organisations get forums, not forum lookups.
create or replace function private.seed_org_defaults(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase uuid;
  fy_month integer;
  fy_start date;
  q integer;
  q_start date;
  q_finish date;
begin
  insert into public.lookup_values (organisation_id, list_key, value, label, sort_order) values
    (p_org, 'team', 'Infrastructure', 'Infrastructure', 1),
    (p_org, 'team', 'Applications', 'Applications', 2),
    (p_org, 'team', 'Cyber Security', 'Cyber Security', 3),
    (p_org, 'team', 'Service Desk', 'Service Desk', 4),
    (p_org, 'team', 'PMO', 'PMO', 5),
    (p_org, 'benefit_category', 'Efficiency', 'Efficiency', 1),
    (p_org, 'benefit_category', 'Student experience', 'Student experience', 2),
    (p_org, 'benefit_category', 'Research', 'Research', 3),
    (p_org, 'benefit_category', 'Risk reduction', 'Risk reduction', 4),
    (p_org, 'benefit_category', 'Compliance', 'Compliance', 5),
    (p_org, 'benefit_category', 'Sustainability', 'Sustainability', 6),
    (p_org, 'benefit_category', 'Income', 'Income', 7),
    (p_org, 'lesson_category', 'Project Management', 'Project Management', 1),
    (p_org, 'lesson_category', 'Governance', 'Governance', 2),
    (p_org, 'lesson_category', 'Communication', 'Communication', 3),
    (p_org, 'lesson_category', 'Stakeholder Management', 'Stakeholder Management', 4),
    (p_org, 'lesson_category', 'People & Roles', 'People & Roles', 5),
    (p_org, 'lesson_category', 'Resource Management', 'Resource Management', 6),
    (p_org, 'lesson_category', 'Training', 'Training', 7),
    (p_org, 'lesson_category', 'Testing', 'Testing', 8),
    (p_org, 'lesson_category', 'Requirements', 'Requirements', 9),
    (p_org, 'lesson_category', 'Architecture', 'Architecture', 10),
    (p_org, 'lesson_category', 'Procurement', 'Procurement', 11),
    (p_org, 'lesson_category', 'Vendor Management', 'Vendor Management', 12),
    (p_org, 'lesson_category', 'Change Management & Adoption', 'Change Management & Adoption', 13),
    (p_org, 'lesson_category', 'Ways of Working', 'Ways of Working', 14),
    (p_org, 'lesson_category', 'Support & Handover', 'Support & Handover', 15),
    (p_org, 'project_type', 'Business system', 'Business system', 1),
    (p_org, 'project_type', 'Infrastructure', 'Infrastructure', 2),
    (p_org, 'project_type', 'Cyber', 'Cyber', 3),
    (p_org, 'project_type', 'Rollout', 'Rollout', 4),
    (p_org, 'project_type', 'Service improvement', 'Service improvement', 5),
    (p_org, 'project_type', 'AI', 'AI', 6),
    (p_org, 'project_type', 'Mobile app', 'Mobile app', 7),
    (p_org, 'project_type', 'Estate wide', 'Estate wide', 8),
    (p_org, 'project_type', 'Supplier delivered', 'Supplier delivered', 9),
    (p_org, 'change_type', 'Scope', 'Scope', 1),
    (p_org, 'change_type', 'Schedule', 'Schedule', 2),
    (p_org, 'change_type', 'Cost', 'Cost', 3),
    (p_org, 'collection_type', 'Governance', 'Governance', 1),
    (p_org, 'collection_type', 'Priority set', 'Priority set', 2),
    (p_org, 'collection_type', 'Funding stream', 'Funding stream', 3),
    (p_org, 'business_unit', 'Digital & Technology Services', 'Digital & Technology Services', 1),
    (p_org, 'business_unit', 'Student Services', 'Student Services', 2),
    (p_org, 'business_unit', 'Research Services', 'Research Services', 3),
    (p_org, 'business_unit', 'Estates & Campus Services', 'Estates & Campus Services', 4),
    (p_org, 'business_unit', 'Finance', 'Finance', 5),
    (p_org, 'business_unit', 'People Services', 'People Services', 6),
    (p_org, 'business_unit', 'Academic Faculties', 'Academic Faculties', 7),
    (p_org, 'cost_category', 'Staff', 'Staff', 1),
    (p_org, 'cost_category', 'Contractors', 'Contractors', 2),
    (p_org, 'cost_category', 'Licences', 'Licences', 3),
    (p_org, 'cost_category', 'Hardware', 'Hardware', 4),
    (p_org, 'cost_category', 'Other', 'Other', 5)
  on conflict (organisation_id, list_key, value) do nothing;

  -- Decision forums (D2): organisation-level forums (no workspace), replacing the old
  -- decision_forum lookup list.
  insert into public.forums (organisation_id, workspace_id, name, level, sort_order)
  select p_org, null, x.name, x.level::public.forum_level, x.ord
  from (values ('Project Board', 'project', 1), ('Programme Board', 'programme', 2),
      ('Digital Committee', 'organisation', 3), ('Architecture Review Board', 'organisation', 4),
      ('Change Advisory Board', 'organisation', 5)) x(name, level, ord)
  on conflict (organisation_id, workspace_id, name) do nothing;

  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 1 - Pre-Project / Idea', 'Phase 1', 'Capture the idea, confirm the problem statement and agree whether it is worth exploring.', 'GATE 1 - Idea approved to explore', 1) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Idea captured with problem statement and sponsor identified', '{small,medium,large}', 'Project request', null, 1),
    (p_org, v_phase, 'Initial tier assessment completed', '{small,medium,large}', 'Tiering assessment', null, 2),
    (p_org, v_phase, 'Strategic alignment confirmed against portfolio objectives', '{medium,large}', null, null, 3),
    (p_org, v_phase, 'Portfolio board noted the idea', '{large}', null, null, 4),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 5);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 2 - Feasibility & Development', 'Phase 2', 'Test feasibility, develop the case for change and secure funding.', 'GATE 2 - Ready to design', 2) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Options appraisal completed', '{medium,large}', 'Options appraisal', null, 1),
    (p_org, v_phase, 'Full business case approved', '{medium,large}', 'Business case', null, 2),
    (p_org, v_phase, 'Lightweight proposal approved by service owner (small projects only)', '{small}', 'One-page proposal', null, 3),
    (p_org, v_phase, 'Funding source confirmed', '{small,medium,large}', null, null, 4),
    (p_org, v_phase, 'Benefit profiles drafted with a named owner for each benefit', '{medium,large}', 'Benefits profile', 'benefit_profiles_owned', 5),
    (p_org, v_phase, 'Independent assurance review completed', '{large}', null, null, 6),
    (p_org, v_phase, 'Lessons from similar projects reviewed by the project manager', '{small,medium,large}', 'Lessons review', 'lessons_reviewed', 7),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 8);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 3 - Design & Procure', 'Phase 3', 'Agree the solution design, complete assurance and put contracts in place.', 'GATE 3 - Ready to build', 3) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Solution design signed off by architecture', '{small,medium,large}', 'Solution design', null, 1),
    (p_org, v_phase, 'Security and data protection assessments complete', '{small,medium,large}', 'DPIA / security assessment', null, 2),
    (p_org, v_phase, 'Procurement route agreed and supplier contracted', '{medium,large}', 'Contract', null, 3),
    (p_org, v_phase, 'Delivery plan baselined with milestones and resources', '{medium,large}', 'Delivery plan', null, 4),
    (p_org, v_phase, 'Accessibility requirements agreed', '{small,medium,large}', null, null, 5),
    (p_org, v_phase, 'Benefit baselines and target profiles agreed with measure owners', '{medium,large}', 'Benefit measure baselines', 'benefit_baselines', 6),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 7);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 4 - Build & Test', 'Phase 4', 'Build and configure the solution, then test it against agreed acceptance criteria.', 'GATE 4 - Ready to deploy', 4) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Build complete against agreed design', '{small,medium,large}', null, null, 1),
    (p_org, v_phase, 'Test results accepted, no outstanding critical defects', '{small,medium,large}', 'Test report', null, 2),
    (p_org, v_phase, 'User acceptance testing signed off by the business', '{medium,large}', 'UAT sign-off', null, 3),
    (p_org, v_phase, 'Operational readiness and support model agreed', '{medium,large}', 'Service acceptance', null, 4),
    (p_org, v_phase, 'Go-live and rollback plans rehearsed', '{large}', null, null, 5),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 6);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 5 - Deploy & Handover', 'Phase 5', 'Deploy into live service, train users and hand over to the service owner.', 'GATE 5 - Live and handed over', 5) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Deployment completed and verified in live service', '{small,medium,large}', null, null, 1),
    (p_org, v_phase, 'Training and communications delivered', '{small,medium,large}', null, null, 2),
    (p_org, v_phase, 'Documentation handed to the service desk', '{small,medium,large}', 'Support handover', null, 3),
    (p_org, v_phase, 'Early life support period agreed with the service owner', '{medium,large}', null, null, 4),
    (p_org, v_phase, 'Benefits measurement baseline captured', '{medium,large}', null, null, 5),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 6);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 6 - Close', 'Phase 6', 'Confirm outcomes, capture lessons and close the project formally.', 'GATE 6 - Closure approved', 6) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Lightweight closure note approved by sponsor (small projects only)', '{small}', 'Closure note', null, 1),
    (p_org, v_phase, 'Full closure report approved', '{medium,large}', 'Closure report', null, 2),
    (p_org, v_phase, 'Lessons learned captured and shared', '{small,medium,large}', 'Lessons learned log', null, 3),
    (p_org, v_phase, 'Final financial position reconciled', '{small,medium,large}', null, null, 4),
    (p_org, v_phase, 'Post-implementation review scheduled with benefit owners', '{medium,large}', null, null, 5),
    (p_org, v_phase, 'Benefits handover completed for every benefit still in realisation', '{small,medium,large}', 'Benefits handover', 'benefits_handover', 6),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 7);

  select coalesce((o.settings -> 'regional' ->> 'financialYearStartMonth')::integer, 8) into fy_month
  from public.organisations o where o.id = p_org;
  fy_start := make_date(extract(year from current_date)::integer, fy_month, 1);
  if fy_start > current_date then
    fy_start := (fy_start - interval '1 year')::date;
  end if;
  for q in 0..3 loop
    q_start := (fy_start + make_interval(months => q * 3))::date;
    q_finish := (q_start + interval '3 months' - interval '1 day')::date;
    insert into public.benefit_periods (organisation_id, label, start_date, finish_date)
    values (p_org, format('Q%s %s–%s', q + 1,
              case when extract(year from q_start) = extract(year from q_finish)
                   then to_char(q_start, 'FMMon') else to_char(q_start, 'FMMon YYYY') end,
              to_char(q_finish, 'FMMon YYYY')),
            q_start, q_finish)
    on conflict (organisation_id, label) do nothing;
  end loop;
end;
$$;
revoke all on function private.seed_org_defaults(uuid) from public, anon, authenticated;

-- 4. Option history by title, and the target meeting.
create or replace function public.update_pending_decision(
  p_decision_id uuid,
  p_decision jsonb default '{}'::jsonb,
  p_options jsonb default null,
  p_links jsonb default null,
  p_expected_updated_at timestamptz default null
)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.decisions;
  before_row jsonb;
  changed jsonb;
  o jsonb;
  keep uuid[] := '{}';
  n_before integer;
  n_after integer;
  kind text;
  tbl text;
  col text;
  ids uuid[];
  before_ids uuid[];
  new_id uuid;
  old_options jsonb;
  opt_changes jsonb := '{}'::jsonb;
  m public.meetings;
  links_changed jsonb := '{}'::jsonb;
  allowed text[] := array['title', 'context', 'decision_maker_id', 'forum_id', 'needed_by_date',
    'impact_scope', 'impact_scope_note', 'impact_cost', 'impact_cost_note', 'impact_time',
    'impact_time_note', 'impact_benefits', 'impact_benefits_note', 'evidence_link',
    'target_meeting_id'];
begin
  select * into d from public.decisions where id = p_decision_id for update;
  if d.id is null or not private.can_write_decision(d) then
    raise exception 'You can''t edit this decision.' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
  end if;
  if d.status <> 'pending' then
    raise exception '% is % and read-only. Supersede or reverse it to change it.', d.ref, d.status
      using errcode = '22023';
  end if;
  p_decision := coalesce(p_decision, '{}'::jsonb);
  if jsonb_typeof(p_decision) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_decision) k where not (k = any (allowed))) then
    raise exception 'Only a Pending decision''s content can be edited here.' using errcode = '22023';
  end if;
  if p_decision ? 'title' and length(btrim(coalesce(p_decision ->> 'title', ''))) = 0 then
    raise exception 'Give the decision a title.' using errcode = '22023';
  end if;
  if p_decision ? 'needed_by_date' and nullif(p_decision ->> 'needed_by_date', '') is null then
    raise exception 'Set a needed-by date.' using errcode = '22023';
  end if;

  -- A target meeting must be a planned meeting of the decision's forum.
  if p_decision ? 'target_meeting_id' and nullif(p_decision ->> 'target_meeting_id', '') is not null then
    select * into m from public.meetings where id = (p_decision ->> 'target_meeting_id')::uuid;
    if m.id is null or m.organisation_id <> d.organisation_id
      or m.forum_id is distinct from coalesce(nullif(p_decision ->> 'forum_id', '')::uuid, case when p_decision ? 'forum_id' then null else d.forum_id end)
      or m.status <> 'planned' then
      raise exception 'Choose a planned meeting of the decision''s forum.' using errcode = '22023';
    end if;
  end if;

  before_row := to_jsonb(d);
  update public.decisions set
    title = case when p_decision ? 'title' then btrim(p_decision ->> 'title') else title end,
    context = case when p_decision ? 'context' then nullif(btrim(coalesce(p_decision ->> 'context', '')), '') else context end,
    decision_maker_id = case when p_decision ? 'decision_maker_id' then nullif(p_decision ->> 'decision_maker_id', '')::uuid else decision_maker_id end,
    forum_id = case when p_decision ? 'forum_id' then nullif(p_decision ->> 'forum_id', '')::uuid else forum_id end,
    needed_by_date = case when p_decision ? 'needed_by_date' then (p_decision ->> 'needed_by_date')::date else needed_by_date end,
    impact_scope = case when p_decision ? 'impact_scope' then coalesce((p_decision ->> 'impact_scope')::boolean, false) else impact_scope end,
    impact_scope_note = case when p_decision ? 'impact_scope_note' then nullif(btrim(coalesce(p_decision ->> 'impact_scope_note', '')), '') else impact_scope_note end,
    impact_cost = case when p_decision ? 'impact_cost' then coalesce((p_decision ->> 'impact_cost')::boolean, false) else impact_cost end,
    impact_cost_note = case when p_decision ? 'impact_cost_note' then nullif(btrim(coalesce(p_decision ->> 'impact_cost_note', '')), '') else impact_cost_note end,
    impact_time = case when p_decision ? 'impact_time' then coalesce((p_decision ->> 'impact_time')::boolean, false) else impact_time end,
    impact_time_note = case when p_decision ? 'impact_time_note' then nullif(btrim(coalesce(p_decision ->> 'impact_time_note', '')), '') else impact_time_note end,
    impact_benefits = case when p_decision ? 'impact_benefits' then coalesce((p_decision ->> 'impact_benefits')::boolean, false) else impact_benefits end,
    impact_benefits_note = case when p_decision ? 'impact_benefits_note' then nullif(btrim(coalesce(p_decision ->> 'impact_benefits_note', '')), '') else impact_benefits_note end,
    evidence_link = case when p_decision ? 'evidence_link' then nullif(btrim(coalesce(p_decision ->> 'evidence_link', '')), '') else evidence_link end,
    target_meeting_id = case when p_decision ? 'target_meeting_id' then nullif(p_decision ->> 'target_meeting_id', '')::uuid else target_meeting_id end
  where id = d.id
  returning * into d;

  select coalesce(jsonb_object_agg(n.key, jsonb_build_array(b.value, n.value)), '{}'::jsonb) into changed
  from jsonb_each(to_jsonb(d)) n join jsonb_each(before_row) b on b.key = n.key
  where n.value is distinct from b.value
    and n.key not in ('updated_at', 'created_at', 'created_by', 'organisation_id', 'workspace_id', 'ref', 'forum_list');

  -- Options: update listed ones in place, add new ones, delete the unlisted.
  if p_options is not null then
    if jsonb_typeof(p_options) <> 'array'
      or (select count(*) from jsonb_array_elements(p_options) x where length(btrim(coalesce(x ->> 'title', ''))) > 0) < 2 then
      raise exception 'Add at least two options.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_options) x
      where nullif(x ->> 'id', '') is not null
        and not exists (select 1 from public.decision_options o where o.id = (x ->> 'id')::uuid and o.decision_id = d.id)) then
      raise exception 'An option doesn''t belong to this decision.' using errcode = '22023';
    end if;
    select coalesce(jsonb_object_agg(o.id::text, jsonb_build_object('title', o.title, 'pros', to_jsonb(o.pros), 'cons', to_jsonb(o.cons))), '{}'::jsonb)
      into old_options from public.decision_options o where o.decision_id = d.id;
    for o in select x from jsonb_array_elements(p_options) with ordinality as e(x, ord)
      where length(btrim(coalesce(x ->> 'title', ''))) > 0 order by ord loop
      if nullif(o ->> 'id', '') is not null then
        update public.decision_options set
          title = btrim(o ->> 'title'),
          pros = coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'pros', '[]')) v where btrim(v) <> ''), '{}'),
          cons = coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'cons', '[]')) v where btrim(v) <> ''), '{}'),
          sort_order = coalesce(array_length(keep, 1), 0)
        where id = (o ->> 'id')::uuid;
        keep := keep || (o ->> 'id')::uuid;
      else
        insert into public.decision_options (decision_id, title, pros, cons, sort_order)
        values (d.id, btrim(o ->> 'title'),
          coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'pros', '[]')) v where btrim(v) <> ''), '{}'),
          coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'cons', '[]')) v where btrim(v) <> ''), '{}'),
          coalesce(array_length(keep, 1), 0))
        returning id into new_id;
        keep := keep || new_id;
      end if;
    end loop;
    delete from public.decision_options where decision_id = d.id and not (id = any (keep));
    -- History by title: renamed [old, new], added, removed, and options whose pros or cons changed.
    select jsonb_strip_nulls(jsonb_build_object(
      'renamed', (select jsonb_agg(jsonb_build_array(old_options -> o.id::text ->> 'title', o.title) order by o.sort_order)
        from public.decision_options o where o.decision_id = d.id and old_options ? o.id::text
          and old_options -> o.id::text ->> 'title' <> o.title),
      'added', (select jsonb_agg(o.title order by o.sort_order)
        from public.decision_options o where o.decision_id = d.id and not (old_options ? o.id::text)),
      'removed', (select jsonb_agg(v ->> 'title' order by v ->> 'title')
        from jsonb_each(old_options) e(k, v) where not (k::uuid = any (keep))),
      'pros_cons_changed', (select jsonb_agg(o.title order by o.sort_order)
        from public.decision_options o where o.decision_id = d.id and old_options ? o.id::text
          and (old_options -> o.id::text -> 'pros' <> to_jsonb(o.pros) or old_options -> o.id::text -> 'cons' <> to_jsonb(o.cons)))))
      into opt_changes;
    if opt_changes <> '{}'::jsonb then
      changed := changed || jsonb_build_object('options', opt_changes);
    end if;
  end if;

  -- Links: each listed kind is set exactly.
  if p_links is not null then
    if jsonb_typeof(p_links) <> 'object' then
      raise exception 'Links must be an object of id lists.' using errcode = '22023';
    end if;
    for kind, tbl, col in
      select * from (values ('risk', 'decision_risks', 'risk_id'), ('issue', 'decision_issues', 'issue_id'),
        ('change', 'decision_change_requests', 'change_request_id'), ('dependency', 'decision_dependencies', 'dependency_id'),
        ('benefit', 'decision_benefits', 'benefit_id'), ('milestone', 'decision_milestones', 'milestone_id')) v(k, t, c)
    loop
      continue when not (p_links ? kind);
      ids := coalesce(array(select (v)::uuid from jsonb_array_elements_text(coalesce(p_links -> kind, '[]')) v), '{}');
      execute format('select coalesce(array_agg(%I order by %I), ''{}'') from public.%I where decision_id = $1', col, col, tbl)
        into before_ids using d.id;
      execute format('delete from public.%I where decision_id = $1 and not (%I = any ($2))', tbl, col) using d.id, ids;
      execute format(
        'insert into public.%I (decision_id, project_id, %I) select $1, $2, x from unnest($3::uuid[]) x
         where not exists (select 1 from public.%I l where l.decision_id = $1 and l.%I = x)', tbl, col, tbl, col)
        using d.id, d.project_id, ids;
      if before_ids is distinct from coalesce(array(select distinct x from unnest(ids) x order by x), '{}') then
        links_changed := links_changed || jsonb_build_object(kind, jsonb_build_array(cardinality(before_ids), cardinality(ids)));
      end if;
    end loop;
    if links_changed <> '{}'::jsonb then
      changed := changed || jsonb_build_object('links', links_changed);
    end if;
  end if;

  if changed <> '{}'::jsonb then
    insert into public.decision_events (decision_id, event_type, event_date, previous_needed_by, new_needed_by, changes, actor_id)
    values (d.id, 'edited', private.org_today(d.organisation_id),
      case when changed ? 'needed_by_date' then (before_row ->> 'needed_by_date')::date end,
      case when changed ? 'needed_by_date' then d.needed_by_date end,
      changed, (select auth.uid()));
  end if;
  return d;
end;
$$;
revoke all on function public.update_pending_decision(uuid, jsonb, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.update_pending_decision(uuid, jsonb, jsonb, jsonb, timestamptz) to authenticated;

-- Tests (as the outsider test user, admin of the outsider organisation)
create temp table r (n serial, chk text, expected text, got text, ok boolean);
create temp table ctx (k text primary key, id uuid);
grant all on r, ctx to authenticated;
grant all on sequence r_n_seq to authenticated;
select set_config('role', 'authenticated', true),
  set_config('request.jwt.claims', '{"sub":"3fa99177-dd44-4ecd-a278-a6f1c4e61b78","role":"authenticated"}', true);

do $$ declare o uuid; begin
  o := public.create_organisation('Runbook dry-run org');
  insert into r (chk, expected, got, ok)
  select '1 new organisation: organisation-level forums / decision_forum lookups', '5 / 0',
    (select count(*) from public.forums where organisation_id = o and workspace_id is null) || ' / ' ||
    (select count(*) from public.lookup_values where organisation_id = o and list_key = 'decision_forum'),
    (select count(*) from public.forums where organisation_id = o and workspace_id is null) = 5
    and (select count(*) from public.lookup_values where organisation_id = o and list_key = 'decision_forum') = 0;
exception when others then insert into r (chk, expected, got, ok) values ('1 new organisation', '5 / 0', sqlstate || ' ' || sqlerrm, false); end $$;

do $$ declare x public.decisions; v jsonb; begin
  select * into x from public.update_pending_decision('ba9de587-67af-41c6-9a9e-c4c9bc74f6b2', '{}'::jsonb,
    '[{"id":"41b72e51-defc-4e36-8149-11b4556a9c4c","title":"50 students (pilot)"},{"title":"100 students"}]'::jsonb, null, null);
  select e.changes -> 'options' into v from public.decision_events e
  where e.decision_id = x.id and e.event_type = 'edited' and e.created_at = now();
  insert into r (chk, expected, got, ok) values ('2 DEC-003 (UI Test): rename, add, remove an option',
    '{"added": ["100 students"], "removed": ["200 students"], "renamed": [["50 students", "50 students (pilot)"]]}',
    coalesce(v::text, 'no event'),
    v = '{"added": ["100 students"], "removed": ["200 students"], "renamed": [["50 students", "50 students (pilot)"]]}'::jsonb);
exception when others then insert into r (chk, expected, got, ok) values ('2 option history', 'renamed/added/removed', sqlstate || ' ' || sqlerrm, false); end $$;

do $$ declare n integer; begin
  perform public.update_pending_decision('ba9de587-67af-41c6-9a9e-c4c9bc74f6b2', '{}'::jsonb,
    (select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title) order by o.sort_order)
     from public.decision_options o where o.decision_id = 'ba9de587-67af-41c6-9a9e-c4c9bc74f6b2'), null, null);
  select count(*) into n from public.decision_events e
  where e.decision_id = 'ba9de587-67af-41c6-9a9e-c4c9bc74f6b2' and e.event_type = 'edited' and e.created_at = now();
  insert into r (chk, expected, got, ok) values ('3 the same options saved again', '1 edited event in this run (no new one)', n || ' edited event(s) in this run', n = 1);
exception when others then insert into r (chk, expected, got, ok) values ('3 identical save', 'no new event', sqlstate || ' ' || sqlerrm, false); end $$;

do $$ declare m public.meetings; begin
  insert into public.meetings (forum_id, meeting_date) values ('8d187d52-f432-4b0d-898a-aa2272c50738', '2026-11-05') returning * into m;
  insert into ctx values ('pb', m.id);
  insert into public.meetings (forum_id, meeting_date) values ('949da09e-5e81-4cf3-944a-95b7deec08a9', '2026-11-06') returning * into m;
  insert into ctx values ('arb', m.id);
  perform public.update_pending_decision('ba9de587-67af-41c6-9a9e-c4c9bc74f6b2',
    jsonb_build_object('target_meeting_id', (select id from ctx where k = 'pb')), null, null, null);
  insert into r (chk, expected, got, ok)
  select '4 DEC-003 targets its forum''s meeting (Project Board 05/11)', 'ok; papers 31/10; logged',
    'ok; papers ' || to_char(v.target_papers_deadline, 'DD/MM') || '; ' ||
    case when exists (select 1 from public.decision_events e where e.decision_id = v.id and e.created_at = now()
      and e.changes ? 'target_meeting_id') then 'logged' else 'not logged' end,
    v.target_papers_deadline = '2026-10-31' and exists (select 1 from public.decision_events e
      where e.decision_id = v.id and e.created_at = now() and e.changes ? 'target_meeting_id')
  from public.v_decisions v where v.id = 'ba9de587-67af-41c6-9a9e-c4c9bc74f6b2';
exception when others then insert into r (chk, expected, got, ok) values ('4 target meeting', 'ok', sqlstate || ' ' || sqlerrm, false); end $$;

do $$ begin
  perform public.update_pending_decision('ba9de587-67af-41c6-9a9e-c4c9bc74f6b2',
    jsonb_build_object('target_meeting_id', (select id from ctx where k = 'arb')), null, null, null);
  insert into r (chk, expected, got, ok) values ('5 DEC-003 targets an ARB meeting', 'refused 22023', 'NOT refused', false);
exception when others then insert into r (chk, expected, got, ok) values ('5 DEC-003 targets an ARB meeting', 'refused 22023', sqlstate, sqlstate = '22023'); end $$;
reset role;

insert into r (chk, expected, got, ok)
select '6 decision_forum lookups left / FKs to lookup_values', '0 / 0',
  (select count(*) from public.lookup_values where list_key = 'decision_forum') || ' / ' ||
  (select count(*) from pg_constraint where confrelid = 'public.lookup_values'::regclass
     and conrelid in ('public.decisions'::regclass, 'public.decision_events'::regclass)),
  (select count(*) from public.lookup_values where list_key = 'decision_forum') = 0
  and (select count(*) from pg_constraint where confrelid = 'public.lookup_values'::regclass
     and conrelid in ('public.decisions'::regclass, 'public.decision_events'::regclass)) = 0;
insert into r (chk, expected, got, ok)
select '7 decisions with a forum not in forums', '0', count(*)::text, count(*) = 0
from public.decisions d where (d.forum_id is not null and not exists (select 1 from public.forums f where f.id = d.forum_id))
  or (d.decided_by_forum_id is not null and not exists (select 1 from public.forums f where f.id = d.decided_by_forum_id));

select n, chk, expected, got, ok from r
union all select 99, 'ALL', '', count(*) filter (where ok) || ' of ' || count(*) || ' ok', bool_and(ok) from r
order by 1;
rollback;

-- ===== Block B: apply ========================================================================
-- Run only after Block A shows 7 of 7. Expected: COMMIT, no errors.
-- 19/10: the chat copy of Block B was an outline, so only the schema_migrations insert ran
-- (Block A 7/7; Block C then showed 10 | 3 | ... | false | true). Run Block B2 (this block
-- without the insert at the end, which is already recorded); it was printed in full in chat.

begin;

-- 1. Lookup keys for forums: dropped (forums keys added by d2_forums_meetings stay).
alter table public.decisions drop constraint decisions_forum_id_organisation_id_forum_list_fkey;
alter table public.decisions drop constraint decisions_decided_by_forum_fkey;
alter table public.decision_events drop constraint decision_events_forum_id_organisation_id_forum_list_fkey;
drop index public.decisions_forum_forum_list_idx;
drop index public.decisions_decided_by_forum_idx;
drop index public.decision_events_forum_idx;

-- 2. The old forum lookup rows (10: 5 per organisation; their ids are now forums.id).
delete from public.lookup_values where list_key = 'decision_forum';

-- 3. New organisations get forums, not forum lookups.
create or replace function private.seed_org_defaults(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase uuid;
  fy_month integer;
  fy_start date;
  q integer;
  q_start date;
  q_finish date;
begin
  insert into public.lookup_values (organisation_id, list_key, value, label, sort_order) values
    (p_org, 'team', 'Infrastructure', 'Infrastructure', 1),
    (p_org, 'team', 'Applications', 'Applications', 2),
    (p_org, 'team', 'Cyber Security', 'Cyber Security', 3),
    (p_org, 'team', 'Service Desk', 'Service Desk', 4),
    (p_org, 'team', 'PMO', 'PMO', 5),
    (p_org, 'benefit_category', 'Efficiency', 'Efficiency', 1),
    (p_org, 'benefit_category', 'Student experience', 'Student experience', 2),
    (p_org, 'benefit_category', 'Research', 'Research', 3),
    (p_org, 'benefit_category', 'Risk reduction', 'Risk reduction', 4),
    (p_org, 'benefit_category', 'Compliance', 'Compliance', 5),
    (p_org, 'benefit_category', 'Sustainability', 'Sustainability', 6),
    (p_org, 'benefit_category', 'Income', 'Income', 7),
    (p_org, 'lesson_category', 'Project Management', 'Project Management', 1),
    (p_org, 'lesson_category', 'Governance', 'Governance', 2),
    (p_org, 'lesson_category', 'Communication', 'Communication', 3),
    (p_org, 'lesson_category', 'Stakeholder Management', 'Stakeholder Management', 4),
    (p_org, 'lesson_category', 'People & Roles', 'People & Roles', 5),
    (p_org, 'lesson_category', 'Resource Management', 'Resource Management', 6),
    (p_org, 'lesson_category', 'Training', 'Training', 7),
    (p_org, 'lesson_category', 'Testing', 'Testing', 8),
    (p_org, 'lesson_category', 'Requirements', 'Requirements', 9),
    (p_org, 'lesson_category', 'Architecture', 'Architecture', 10),
    (p_org, 'lesson_category', 'Procurement', 'Procurement', 11),
    (p_org, 'lesson_category', 'Vendor Management', 'Vendor Management', 12),
    (p_org, 'lesson_category', 'Change Management & Adoption', 'Change Management & Adoption', 13),
    (p_org, 'lesson_category', 'Ways of Working', 'Ways of Working', 14),
    (p_org, 'lesson_category', 'Support & Handover', 'Support & Handover', 15),
    (p_org, 'project_type', 'Business system', 'Business system', 1),
    (p_org, 'project_type', 'Infrastructure', 'Infrastructure', 2),
    (p_org, 'project_type', 'Cyber', 'Cyber', 3),
    (p_org, 'project_type', 'Rollout', 'Rollout', 4),
    (p_org, 'project_type', 'Service improvement', 'Service improvement', 5),
    (p_org, 'project_type', 'AI', 'AI', 6),
    (p_org, 'project_type', 'Mobile app', 'Mobile app', 7),
    (p_org, 'project_type', 'Estate wide', 'Estate wide', 8),
    (p_org, 'project_type', 'Supplier delivered', 'Supplier delivered', 9),
    (p_org, 'change_type', 'Scope', 'Scope', 1),
    (p_org, 'change_type', 'Schedule', 'Schedule', 2),
    (p_org, 'change_type', 'Cost', 'Cost', 3),
    (p_org, 'collection_type', 'Governance', 'Governance', 1),
    (p_org, 'collection_type', 'Priority set', 'Priority set', 2),
    (p_org, 'collection_type', 'Funding stream', 'Funding stream', 3),
    (p_org, 'business_unit', 'Digital & Technology Services', 'Digital & Technology Services', 1),
    (p_org, 'business_unit', 'Student Services', 'Student Services', 2),
    (p_org, 'business_unit', 'Research Services', 'Research Services', 3),
    (p_org, 'business_unit', 'Estates & Campus Services', 'Estates & Campus Services', 4),
    (p_org, 'business_unit', 'Finance', 'Finance', 5),
    (p_org, 'business_unit', 'People Services', 'People Services', 6),
    (p_org, 'business_unit', 'Academic Faculties', 'Academic Faculties', 7),
    (p_org, 'cost_category', 'Staff', 'Staff', 1),
    (p_org, 'cost_category', 'Contractors', 'Contractors', 2),
    (p_org, 'cost_category', 'Licences', 'Licences', 3),
    (p_org, 'cost_category', 'Hardware', 'Hardware', 4),
    (p_org, 'cost_category', 'Other', 'Other', 5)
  on conflict (organisation_id, list_key, value) do nothing;

  -- Decision forums (D2): organisation-level forums (no workspace), replacing the old
  -- decision_forum lookup list.
  insert into public.forums (organisation_id, workspace_id, name, level, sort_order)
  select p_org, null, x.name, x.level::public.forum_level, x.ord
  from (values ('Project Board', 'project', 1), ('Programme Board', 'programme', 2),
      ('Digital Committee', 'organisation', 3), ('Architecture Review Board', 'organisation', 4),
      ('Change Advisory Board', 'organisation', 5)) x(name, level, ord)
  on conflict (organisation_id, workspace_id, name) do nothing;

  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 1 - Pre-Project / Idea', 'Phase 1', 'Capture the idea, confirm the problem statement and agree whether it is worth exploring.', 'GATE 1 - Idea approved to explore', 1) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Idea captured with problem statement and sponsor identified', '{small,medium,large}', 'Project request', null, 1),
    (p_org, v_phase, 'Initial tier assessment completed', '{small,medium,large}', 'Tiering assessment', null, 2),
    (p_org, v_phase, 'Strategic alignment confirmed against portfolio objectives', '{medium,large}', null, null, 3),
    (p_org, v_phase, 'Portfolio board noted the idea', '{large}', null, null, 4),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 5);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 2 - Feasibility & Development', 'Phase 2', 'Test feasibility, develop the case for change and secure funding.', 'GATE 2 - Ready to design', 2) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Options appraisal completed', '{medium,large}', 'Options appraisal', null, 1),
    (p_org, v_phase, 'Full business case approved', '{medium,large}', 'Business case', null, 2),
    (p_org, v_phase, 'Lightweight proposal approved by service owner (small projects only)', '{small}', 'One-page proposal', null, 3),
    (p_org, v_phase, 'Funding source confirmed', '{small,medium,large}', null, null, 4),
    (p_org, v_phase, 'Benefit profiles drafted with a named owner for each benefit', '{medium,large}', 'Benefits profile', 'benefit_profiles_owned', 5),
    (p_org, v_phase, 'Independent assurance review completed', '{large}', null, null, 6),
    (p_org, v_phase, 'Lessons from similar projects reviewed by the project manager', '{small,medium,large}', 'Lessons review', 'lessons_reviewed', 7),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 8);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 3 - Design & Procure', 'Phase 3', 'Agree the solution design, complete assurance and put contracts in place.', 'GATE 3 - Ready to build', 3) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Solution design signed off by architecture', '{small,medium,large}', 'Solution design', null, 1),
    (p_org, v_phase, 'Security and data protection assessments complete', '{small,medium,large}', 'DPIA / security assessment', null, 2),
    (p_org, v_phase, 'Procurement route agreed and supplier contracted', '{medium,large}', 'Contract', null, 3),
    (p_org, v_phase, 'Delivery plan baselined with milestones and resources', '{medium,large}', 'Delivery plan', null, 4),
    (p_org, v_phase, 'Accessibility requirements agreed', '{small,medium,large}', null, null, 5),
    (p_org, v_phase, 'Benefit baselines and target profiles agreed with measure owners', '{medium,large}', 'Benefit measure baselines', 'benefit_baselines', 6),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 7);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 4 - Build & Test', 'Phase 4', 'Build and configure the solution, then test it against agreed acceptance criteria.', 'GATE 4 - Ready to deploy', 4) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Build complete against agreed design', '{small,medium,large}', null, null, 1),
    (p_org, v_phase, 'Test results accepted, no outstanding critical defects', '{small,medium,large}', 'Test report', null, 2),
    (p_org, v_phase, 'User acceptance testing signed off by the business', '{medium,large}', 'UAT sign-off', null, 3),
    (p_org, v_phase, 'Operational readiness and support model agreed', '{medium,large}', 'Service acceptance', null, 4),
    (p_org, v_phase, 'Go-live and rollback plans rehearsed', '{large}', null, null, 5),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 6);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 5 - Deploy & Handover', 'Phase 5', 'Deploy into live service, train users and hand over to the service owner.', 'GATE 5 - Live and handed over', 5) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Deployment completed and verified in live service', '{small,medium,large}', null, null, 1),
    (p_org, v_phase, 'Training and communications delivered', '{small,medium,large}', null, null, 2),
    (p_org, v_phase, 'Documentation handed to the service desk', '{small,medium,large}', 'Support handover', null, 3),
    (p_org, v_phase, 'Early life support period agreed with the service owner', '{medium,large}', null, null, 4),
    (p_org, v_phase, 'Benefits measurement baseline captured', '{medium,large}', null, null, 5),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 6);
  insert into public.lifecycle_phases (organisation_id, name, short_name, description, gate_name, sort_order)
    values (p_org, 'Phase 6 - Close', 'Phase 6', 'Confirm outcomes, capture lessons and close the project formally.', 'GATE 6 - Closure approved', 6) returning id into v_phase;
  insert into public.gate_criteria (organisation_id, phase_id, label, tiers, document, check_key, sort_order) values
    (p_org, v_phase, 'Lightweight closure note approved by sponsor (small projects only)', '{small}', 'Closure note', null, 1),
    (p_org, v_phase, 'Full closure report approved', '{medium,large}', 'Closure report', null, 2),
    (p_org, v_phase, 'Lessons learned captured and shared', '{small,medium,large}', 'Lessons learned log', null, 3),
    (p_org, v_phase, 'Final financial position reconciled', '{small,medium,large}', null, null, 4),
    (p_org, v_phase, 'Post-implementation review scheduled with benefit owners', '{medium,large}', null, null, 5),
    (p_org, v_phase, 'Benefits handover completed for every benefit still in realisation', '{small,medium,large}', 'Benefits handover', 'benefits_handover', 6),
    (p_org, v_phase, 'Phase lessons review completed', '{small,medium,large}', 'Phase lessons review', 'phase_lessons_review', 7);

  select coalesce((o.settings -> 'regional' ->> 'financialYearStartMonth')::integer, 8) into fy_month
  from public.organisations o where o.id = p_org;
  fy_start := make_date(extract(year from current_date)::integer, fy_month, 1);
  if fy_start > current_date then
    fy_start := (fy_start - interval '1 year')::date;
  end if;
  for q in 0..3 loop
    q_start := (fy_start + make_interval(months => q * 3))::date;
    q_finish := (q_start + interval '3 months' - interval '1 day')::date;
    insert into public.benefit_periods (organisation_id, label, start_date, finish_date)
    values (p_org, format('Q%s %s–%s', q + 1,
              case when extract(year from q_start) = extract(year from q_finish)
                   then to_char(q_start, 'FMMon') else to_char(q_start, 'FMMon YYYY') end,
              to_char(q_finish, 'FMMon YYYY')),
            q_start, q_finish)
    on conflict (organisation_id, label) do nothing;
  end loop;
end;
$$;
revoke all on function private.seed_org_defaults(uuid) from public, anon, authenticated;

-- 4. Option history by title, and the target meeting.
create or replace function public.update_pending_decision(
  p_decision_id uuid,
  p_decision jsonb default '{}'::jsonb,
  p_options jsonb default null,
  p_links jsonb default null,
  p_expected_updated_at timestamptz default null
)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.decisions;
  before_row jsonb;
  changed jsonb;
  o jsonb;
  keep uuid[] := '{}';
  n_before integer;
  n_after integer;
  kind text;
  tbl text;
  col text;
  ids uuid[];
  before_ids uuid[];
  new_id uuid;
  old_options jsonb;
  opt_changes jsonb := '{}'::jsonb;
  m public.meetings;
  links_changed jsonb := '{}'::jsonb;
  allowed text[] := array['title', 'context', 'decision_maker_id', 'forum_id', 'needed_by_date',
    'impact_scope', 'impact_scope_note', 'impact_cost', 'impact_cost_note', 'impact_time',
    'impact_time_note', 'impact_benefits', 'impact_benefits_note', 'evidence_link',
    'target_meeting_id'];
begin
  select * into d from public.decisions where id = p_decision_id for update;
  if d.id is null or not private.can_write_decision(d) then
    raise exception 'You can''t edit this decision.' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
  end if;
  if d.status <> 'pending' then
    raise exception '% is % and read-only. Supersede or reverse it to change it.', d.ref, d.status
      using errcode = '22023';
  end if;
  p_decision := coalesce(p_decision, '{}'::jsonb);
  if jsonb_typeof(p_decision) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_decision) k where not (k = any (allowed))) then
    raise exception 'Only a Pending decision''s content can be edited here.' using errcode = '22023';
  end if;
  if p_decision ? 'title' and length(btrim(coalesce(p_decision ->> 'title', ''))) = 0 then
    raise exception 'Give the decision a title.' using errcode = '22023';
  end if;
  if p_decision ? 'needed_by_date' and nullif(p_decision ->> 'needed_by_date', '') is null then
    raise exception 'Set a needed-by date.' using errcode = '22023';
  end if;

  -- A target meeting must be a planned meeting of the decision's forum.
  if p_decision ? 'target_meeting_id' and nullif(p_decision ->> 'target_meeting_id', '') is not null then
    select * into m from public.meetings where id = (p_decision ->> 'target_meeting_id')::uuid;
    if m.id is null or m.organisation_id <> d.organisation_id
      or m.forum_id is distinct from coalesce(nullif(p_decision ->> 'forum_id', '')::uuid, case when p_decision ? 'forum_id' then null else d.forum_id end)
      or m.status <> 'planned' then
      raise exception 'Choose a planned meeting of the decision''s forum.' using errcode = '22023';
    end if;
  end if;

  before_row := to_jsonb(d);
  update public.decisions set
    title = case when p_decision ? 'title' then btrim(p_decision ->> 'title') else title end,
    context = case when p_decision ? 'context' then nullif(btrim(coalesce(p_decision ->> 'context', '')), '') else context end,
    decision_maker_id = case when p_decision ? 'decision_maker_id' then nullif(p_decision ->> 'decision_maker_id', '')::uuid else decision_maker_id end,
    forum_id = case when p_decision ? 'forum_id' then nullif(p_decision ->> 'forum_id', '')::uuid else forum_id end,
    needed_by_date = case when p_decision ? 'needed_by_date' then (p_decision ->> 'needed_by_date')::date else needed_by_date end,
    impact_scope = case when p_decision ? 'impact_scope' then coalesce((p_decision ->> 'impact_scope')::boolean, false) else impact_scope end,
    impact_scope_note = case when p_decision ? 'impact_scope_note' then nullif(btrim(coalesce(p_decision ->> 'impact_scope_note', '')), '') else impact_scope_note end,
    impact_cost = case when p_decision ? 'impact_cost' then coalesce((p_decision ->> 'impact_cost')::boolean, false) else impact_cost end,
    impact_cost_note = case when p_decision ? 'impact_cost_note' then nullif(btrim(coalesce(p_decision ->> 'impact_cost_note', '')), '') else impact_cost_note end,
    impact_time = case when p_decision ? 'impact_time' then coalesce((p_decision ->> 'impact_time')::boolean, false) else impact_time end,
    impact_time_note = case when p_decision ? 'impact_time_note' then nullif(btrim(coalesce(p_decision ->> 'impact_time_note', '')), '') else impact_time_note end,
    impact_benefits = case when p_decision ? 'impact_benefits' then coalesce((p_decision ->> 'impact_benefits')::boolean, false) else impact_benefits end,
    impact_benefits_note = case when p_decision ? 'impact_benefits_note' then nullif(btrim(coalesce(p_decision ->> 'impact_benefits_note', '')), '') else impact_benefits_note end,
    evidence_link = case when p_decision ? 'evidence_link' then nullif(btrim(coalesce(p_decision ->> 'evidence_link', '')), '') else evidence_link end,
    target_meeting_id = case when p_decision ? 'target_meeting_id' then nullif(p_decision ->> 'target_meeting_id', '')::uuid else target_meeting_id end
  where id = d.id
  returning * into d;

  select coalesce(jsonb_object_agg(n.key, jsonb_build_array(b.value, n.value)), '{}'::jsonb) into changed
  from jsonb_each(to_jsonb(d)) n join jsonb_each(before_row) b on b.key = n.key
  where n.value is distinct from b.value
    and n.key not in ('updated_at', 'created_at', 'created_by', 'organisation_id', 'workspace_id', 'ref', 'forum_list');

  -- Options: update listed ones in place, add new ones, delete the unlisted.
  if p_options is not null then
    if jsonb_typeof(p_options) <> 'array'
      or (select count(*) from jsonb_array_elements(p_options) x where length(btrim(coalesce(x ->> 'title', ''))) > 0) < 2 then
      raise exception 'Add at least two options.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_options) x
      where nullif(x ->> 'id', '') is not null
        and not exists (select 1 from public.decision_options o where o.id = (x ->> 'id')::uuid and o.decision_id = d.id)) then
      raise exception 'An option doesn''t belong to this decision.' using errcode = '22023';
    end if;
    select coalesce(jsonb_object_agg(o.id::text, jsonb_build_object('title', o.title, 'pros', to_jsonb(o.pros), 'cons', to_jsonb(o.cons))), '{}'::jsonb)
      into old_options from public.decision_options o where o.decision_id = d.id;
    for o in select x from jsonb_array_elements(p_options) with ordinality as e(x, ord)
      where length(btrim(coalesce(x ->> 'title', ''))) > 0 order by ord loop
      if nullif(o ->> 'id', '') is not null then
        update public.decision_options set
          title = btrim(o ->> 'title'),
          pros = coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'pros', '[]')) v where btrim(v) <> ''), '{}'),
          cons = coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'cons', '[]')) v where btrim(v) <> ''), '{}'),
          sort_order = coalesce(array_length(keep, 1), 0)
        where id = (o ->> 'id')::uuid;
        keep := keep || (o ->> 'id')::uuid;
      else
        insert into public.decision_options (decision_id, title, pros, cons, sort_order)
        values (d.id, btrim(o ->> 'title'),
          coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'pros', '[]')) v where btrim(v) <> ''), '{}'),
          coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'cons', '[]')) v where btrim(v) <> ''), '{}'),
          coalesce(array_length(keep, 1), 0))
        returning id into new_id;
        keep := keep || new_id;
      end if;
    end loop;
    delete from public.decision_options where decision_id = d.id and not (id = any (keep));
    -- History by title: renamed [old, new], added, removed, and options whose pros or cons changed.
    select jsonb_strip_nulls(jsonb_build_object(
      'renamed', (select jsonb_agg(jsonb_build_array(old_options -> o.id::text ->> 'title', o.title) order by o.sort_order)
        from public.decision_options o where o.decision_id = d.id and old_options ? o.id::text
          and old_options -> o.id::text ->> 'title' <> o.title),
      'added', (select jsonb_agg(o.title order by o.sort_order)
        from public.decision_options o where o.decision_id = d.id and not (old_options ? o.id::text)),
      'removed', (select jsonb_agg(v ->> 'title' order by v ->> 'title')
        from jsonb_each(old_options) e(k, v) where not (k::uuid = any (keep))),
      'pros_cons_changed', (select jsonb_agg(o.title order by o.sort_order)
        from public.decision_options o where o.decision_id = d.id and old_options ? o.id::text
          and (old_options -> o.id::text -> 'pros' <> to_jsonb(o.pros) or old_options -> o.id::text -> 'cons' <> to_jsonb(o.cons)))))
      into opt_changes;
    if opt_changes <> '{}'::jsonb then
      changed := changed || jsonb_build_object('options', opt_changes);
    end if;
  end if;

  -- Links: each listed kind is set exactly.
  if p_links is not null then
    if jsonb_typeof(p_links) <> 'object' then
      raise exception 'Links must be an object of id lists.' using errcode = '22023';
    end if;
    for kind, tbl, col in
      select * from (values ('risk', 'decision_risks', 'risk_id'), ('issue', 'decision_issues', 'issue_id'),
        ('change', 'decision_change_requests', 'change_request_id'), ('dependency', 'decision_dependencies', 'dependency_id'),
        ('benefit', 'decision_benefits', 'benefit_id'), ('milestone', 'decision_milestones', 'milestone_id')) v(k, t, c)
    loop
      continue when not (p_links ? kind);
      ids := coalesce(array(select (v)::uuid from jsonb_array_elements_text(coalesce(p_links -> kind, '[]')) v), '{}');
      execute format('select coalesce(array_agg(%I order by %I), ''{}'') from public.%I where decision_id = $1', col, col, tbl)
        into before_ids using d.id;
      execute format('delete from public.%I where decision_id = $1 and not (%I = any ($2))', tbl, col) using d.id, ids;
      execute format(
        'insert into public.%I (decision_id, project_id, %I) select $1, $2, x from unnest($3::uuid[]) x
         where not exists (select 1 from public.%I l where l.decision_id = $1 and l.%I = x)', tbl, col, tbl, col)
        using d.id, d.project_id, ids;
      if before_ids is distinct from coalesce(array(select distinct x from unnest(ids) x order by x), '{}') then
        links_changed := links_changed || jsonb_build_object(kind, jsonb_build_array(cardinality(before_ids), cardinality(ids)));
      end if;
    end loop;
    if links_changed <> '{}'::jsonb then
      changed := changed || jsonb_build_object('links', links_changed);
    end if;
  end if;

  if changed <> '{}'::jsonb then
    insert into public.decision_events (decision_id, event_type, event_date, previous_needed_by, new_needed_by, changes, actor_id)
    values (d.id, 'edited', private.org_today(d.organisation_id),
      case when changed ? 'needed_by_date' then (before_row ->> 'needed_by_date')::date end,
      case when changed ? 'needed_by_date' then d.needed_by_date end,
      changed, (select auth.uid()));
  end if;
  return d;
end;
$$;
revoke all on function public.update_pending_decision(uuid, jsonb, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.update_pending_decision(uuid, jsonb, jsonb, jsonb, timestamptz) to authenticated;

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261019170000', 'd2_forum_lookups_and_option_history',
  array['-- applied from docs/sql/runbook-d2.sql, Block B']);
commit;

-- ===== Block C: checks after applying (read-only) ===========================================
-- Expected: 0 | 0 | true | true | false | false | true | true

select
  (select count(*) from public.lookup_values where list_key = 'decision_forum') as forum_lookups,
  (select count(*) from pg_constraint where confrelid = 'public.lookup_values'::regclass
     and conrelid in ('public.decisions'::regclass, 'public.decision_events'::regclass)) as lookup_fks,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
  has_function_privilege('anon', p.oid, 'execute') as anon,
  has_function_privilege('authenticated', 'private.seed_org_defaults(uuid)'::regprocedure, 'execute') as seed_authenticated,
  position('public.forums' in pg_get_functiondef('private.seed_org_defaults(uuid)'::regprocedure)) > 0 as seed_makes_forums,
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261019170000') as migration_recorded
from pg_proc p where p.oid = 'public.update_pending_decision(uuid, jsonb, jsonb, jsonb, timestamptz)'::regprocedure;
