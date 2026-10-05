-- Virtual PMO: organisation onboarding. create_organisation() is the only way a client
-- creates an organisation; it sets up the caller as admin and copies default lists,
-- lifecycle and benefit periods. join_demo_organisation() lets named demo admins in.

-- Default lists, lifecycle (from data/lifecycle.ts) and the current financial year's
-- benefit periods. Safe to call once per organisation.
create function private.seed_org_defaults(p_org uuid)
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
    (p_org, 'decision_forum', 'Project Board', 'Project Board', 1),
    (p_org, 'decision_forum', 'Programme Board', 'Programme Board', 2),
    (p_org, 'decision_forum', 'Digital Committee', 'Digital Committee', 3),
    (p_org, 'decision_forum', 'Architecture Review Board', 'Architecture Review Board', 4),
    (p_org, 'decision_forum', 'Change Advisory Board', 'Change Advisory Board', 5),
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
    (p_org, 'business_unit', 'Academic Faculties', 'Academic Faculties', 7)
  on conflict (organisation_id, list_key, value) do nothing;

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
grant execute on function private.seed_org_defaults(uuid) to service_role;

create function public.create_organisation(
  p_name text,
  p_slug text default null,
  p_region text default 'uk',
  p_currency text default 'GBP',
  p_fy_start_month integer default 8,
  p_workspace_name text default 'Main workspace'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_ws uuid;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Sign in to create an organisation' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Organisation name is required' using errcode = '22023';
  end if;
  if p_fy_start_month not between 1 and 12 then
    raise exception 'Financial year start month must be 1-12' using errcode = '22023';
  end if;
  v_slug := coalesce(nullif(btrim(p_slug), ''), trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')));
  v_slug := left(v_slug, 50);
  if exists (select 1 from public.organisations o where o.slug = v_slug) then
    v_slug := left(v_slug, 44) || '-' || substr(md5(random()::text), 1, 5);
  end if;

  insert into public.organisations (name, short_name, slug, region, settings, created_by)
  values (btrim(p_name), btrim(p_name), v_slug, p_region,
          jsonb_set(jsonb_set(private.default_org_settings(), '{regional,baseCurrency}', to_jsonb(upper(p_currency))),
                    '{regional,financialYearStartMonth}', to_jsonb(p_fy_start_month)),
          v_uid)
  returning id into v_org;
  insert into public.organisation_subscriptions (organisation_id) values (v_org);
  insert into public.organisation_members (organisation_id, profile_id, role, created_by) values (v_org, v_uid, 'admin', v_uid);
  insert into public.workspaces (organisation_id, name, created_by) values (v_org, coalesce(nullif(btrim(p_workspace_name), ''), 'Main workspace'), v_uid)
  returning id into v_ws;
  insert into public.workspace_members (workspace_id, profile_id, organisation_id, role, created_by) values (v_ws, v_uid, v_org, 'admin', v_uid);
  perform private.seed_org_defaults(v_org);
  update public.profiles set last_organisation_id = v_org where id = v_uid;
  return v_org;
end;
$$;
revoke all on function public.create_organisation(text, text, text, text, integer, text) from public, anon;
grant execute on function public.create_organisation(text, text, text, text, integer, text) to authenticated;

-- Demo access: a signed-in user whose email is listed in a demo organisation's
-- settings.demoAdmins becomes its admin. Does nothing for non-demo organisations.
create function public.join_demo_organisation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_org uuid;
begin
  select lower(p.email) into v_email from public.profiles p where p.id = v_uid;
  select o.id into v_org from public.organisations o
  where o.is_demo and coalesce(o.settings -> 'demoAdmins', '[]'::jsonb) ? v_email
  order by o.created_at limit 1;
  if v_org is null then
    raise exception 'No demo organisation is available for this account' using errcode = '42501';
  end if;
  insert into public.organisation_members (organisation_id, profile_id, role, created_by)
  values (v_org, v_uid, 'admin', v_uid)
  on conflict (organisation_id, profile_id) do update set role = 'admin';
  update public.profiles set last_organisation_id = v_org where id = v_uid;
  return v_org;
end;
$$;
revoke all on function public.join_demo_organisation() from public, anon;
grant execute on function public.join_demo_organisation() to authenticated;
