-- GL-8 Sector choice and financial-year defaults — PROPOSAL, not applied.
--
-- Read from production (10/11/2026): public.create_organisation(text,text,text,text,integer,text)
-- matches migration 20261028112834_auth_email_microsoft; private.seed_org_defaults(uuid) matches
-- 20261019170000_d2_forum_lookups_and_option_history (the lists below) and
-- 20261006133131_financials (the lifecycle). private.default_org_settings() holds the
-- university optimism-bias categories.
--
-- Design
-- - organisations.settings.sector: 'university' | 'public_sector' | 'general'. Existing
--   organisations are backfilled to 'university' (that's what they were seeded with). Missing
--   sector is read as 'university' everywhere, so scripts/seed-perf-org.sql and
--   scripts/generate-seed.ts keep working unchanged.
-- - private.sector_org_settings(sector): default_org_settings() plus the sector's optimism
--   bias categories, financial-year month, tier wording (settings.tiers, the key the client
--   already reads) and the sector itself. default_org_settings() is unchanged (column default).
-- - public.create_organisation gains a NEW overload with a required p_sector and
--   p_fy_start_month defaulting to the sector's month. The old six-argument signature stays as
--   a thin wrapper (sector 'university', as today). No ambiguity: p_sector has no default, so a
--   call that names p_sector only matches the new one and a call that doesn't only the old one
--   (PostgREST and SQL named notation). Nothing is dropped. If you later want the old signature
--   gone, that's a separate `drop function` for the SQL editor; not proposed now.
-- - private.seed_org_defaults(uuid): same signature; reads the sector from the organisation
--   and seeds teams, benefit categories, project types, business units and forums by sector.
--   Lessons, change types, collection types, cost categories, lifecycle phases, gate criteria
--   and benefit periods are the same for every sector (lifecycle copied verbatim from live).
-- - No new table, no destructive statement. One additive check constraint.

-- ---------------------------------------------------------------------------------------------
-- 1. Sector on organisations.settings
-- ---------------------------------------------------------------------------------------------

update public.organisations
   set settings = settings || jsonb_build_object('sector', 'university')
 where not (settings ? 'sector');

alter table public.organisations
  add constraint organisations_settings_sector_check
  check (settings -> 'sector' is null
         or settings ->> 'sector' in ('university', 'public_sector', 'general'))
  not valid;
alter table public.organisations validate constraint organisations_settings_sector_check;

-- ---------------------------------------------------------------------------------------------
-- 2. Settings by sector
-- ---------------------------------------------------------------------------------------------

create function private.sector_org_settings(p_sector text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sector text := coalesce(p_sector, 'university');
  v_scope text := case when v_sector = 'university' then 'university-wide' else 'organisation-wide' end;
  v_wide text := case when v_sector = 'university' then 'institution-wide' else 'organisation-wide' end;
  v_pair text[] := case v_sector
    when 'public_sector' then array['Service quality', 'Public outcomes']
    when 'general' then array['Customer experience', 'Employee experience']
    else array['Student experience', 'Research'] end;
  v_fy integer := case v_sector when 'public_sector' then 4 when 'general' then 1 else 8 end;
  s jsonb := private.default_org_settings();
begin
  if v_sector not in ('university', 'public_sector', 'general') then
    raise exception 'Unknown sector %', v_sector using errcode = '22023';
  end if;
  s := jsonb_set(s, '{regional,financialYearStartMonth}', to_jsonb(v_fy));
  s := jsonb_set(s, '{benefits,optimismBias}', jsonb_build_array(
    jsonb_build_object('category', 'Efficiency', 'percentage', 20),
    jsonb_build_object('category', 'Income', 'percentage', 30),
    jsonb_build_object('category', v_pair[1], 'percentage', 25),
    jsonb_build_object('category', v_pair[2], 'percentage', 25),
    jsonb_build_object('category', 'Risk reduction', 'percentage', 15),
    jsonb_build_object('category', 'Compliance', 'percentage', 10),
    jsonb_build_object('category', 'Sustainability', 'percentage', 15)));
  -- Same shape and text as data/lifecycle.ts defaultTierDefinitions (university wording when
  -- the sector is university, "organisation-wide" otherwise).
  s := s || jsonb_build_object(
    'sector', v_sector,
    'tiers', jsonb_build_array(
      jsonb_build_object('tier', 'Small',
        'description', 'Low complexity, single team, minimal change to live services. Light governance: no Phase 2 business case and a short closure note.',
        'guideline', 'Under £50k, under 3 months, one team affected'),
      jsonb_build_object('tier', 'Medium',
        'description', 'Moderate complexity across more than one team, with supplier or data change. Full business case, baselined plan and formal closure report.',
        'guideline', '£50k–£250k, 3–12 months, several teams affected'),
      jsonb_build_object('tier', 'Large',
        'description', format('High complexity, %s impact or significant spend. Adds independent assurance, rehearsed go-live and portfolio board oversight.', v_wide),
        'guideline', format('Over £250k, over 12 months, %s impact', v_scope))));
  return s;
end;
$$;
revoke execute on function private.sector_org_settings(text) from public, anon;

-- ---------------------------------------------------------------------------------------------
-- 3. create_organisation with a sector (new overload) and the old signature as a wrapper
-- ---------------------------------------------------------------------------------------------

create function public.create_organisation(
  p_name text,
  p_sector text,
  p_slug text default null,
  p_region text default 'uk',
  p_currency text default 'GBP',
  p_fy_start_month integer default null,
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
  v_fy integer;
begin
  if v_uid is null then
    raise exception 'Sign in to create an organisation' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Organisation name is required' using errcode = '22023';
  end if;
  if p_sector is null or p_sector not in ('university', 'public_sector', 'general') then
    raise exception 'Choose University, Public sector or General' using errcode = '22023';
  end if;
  v_fy := coalesce(p_fy_start_month, case p_sector when 'public_sector' then 4 when 'general' then 1 else 8 end);
  if v_fy not between 1 and 12 then
    raise exception 'Financial year start month must be 1-12' using errcode = '22023';
  end if;
  v_slug := coalesce(nullif(btrim(p_slug), ''), trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')));
  v_slug := left(v_slug, 50);
  if exists (select 1 from public.organisations o where o.slug = v_slug) then
    v_slug := left(v_slug, 44) || '-' || substr(md5(random()::text), 1, 5);
  end if;

  insert into public.organisations (name, short_name, slug, region, settings, created_by)
  values (btrim(p_name), btrim(p_name), v_slug, p_region,
          jsonb_set(jsonb_set(private.sector_org_settings(p_sector), '{regional,baseCurrency}', to_jsonb(upper(p_currency))),
                    '{regional,financialYearStartMonth}', to_jsonb(v_fy)),
          v_uid)
  returning id into v_org;
  insert into public.organisation_subscriptions (organisation_id, plan, trial_ends_at)
  values (v_org, 'trial', now() + interval '14 days');
  insert into public.organisation_members (organisation_id, profile_id, role, created_by) values (v_org, v_uid, 'admin', v_uid);
  insert into public.workspaces (organisation_id, name, created_by) values (v_org, coalesce(nullif(btrim(p_workspace_name), ''), 'Main workspace'), v_uid)
  returning id into v_ws;
  insert into public.workspace_members (workspace_id, profile_id, organisation_id, role, created_by) values (v_ws, v_uid, v_org, 'admin', v_uid);
  perform private.seed_org_defaults(v_org);
  update public.profiles set last_organisation_id = v_org where id = v_uid;
  return v_org;
end;
$$;
revoke execute on function public.create_organisation(text, text, text, text, text, integer, text) from public, anon;
grant execute on function public.create_organisation(text, text, text, text, text, integer, text) to authenticated;

-- The old signature keeps working for any caller that doesn't send a sector: university, as
-- today. Invoker rights: it only forwards to the definer function above. create or replace keeps
-- its grants (authenticated only).
create or replace function public.create_organisation(
  p_name text,
  p_slug text default null,
  p_region text default 'uk',
  p_currency text default 'GBP',
  p_fy_start_month integer default 8,
  p_workspace_name text default 'Main workspace'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.create_organisation(
    p_name => p_name, p_sector => 'university', p_slug => p_slug, p_region => p_region,
    p_currency => p_currency, p_fy_start_month => p_fy_start_month,
    p_workspace_name => p_workspace_name);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. seed_org_defaults by sector (same signature)
-- ---------------------------------------------------------------------------------------------

create or replace function private.seed_org_defaults(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sector text;
  v_phase uuid;
  fy_month integer;
  fy_start date;
  q integer;
  q_start date;
  q_finish date;
begin
  select coalesce(o.settings ->> 'sector', 'university') into v_sector
  from public.organisations o where o.id = p_org;
  v_sector := coalesce(v_sector, 'university');

  -- Rows tagged 'all' go to every sector; 'neutral' to public sector and general.
  insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
  select p_org, x.list_key, x.value, x.value, x.ord
  from (values
    ('university', 'team', 'Infrastructure', 1),
    ('university', 'team', 'Applications', 2),
    ('university', 'team', 'Cyber Security', 3),
    ('university', 'team', 'Service Desk', 4),
    ('university', 'team', 'PMO', 5),
    ('neutral', 'team', 'Technology', 1),
    ('neutral', 'team', 'Operations', 2),
    ('neutral', 'team', 'Change & Transformation', 3),
    ('neutral', 'team', 'Finance', 4),
    ('neutral', 'team', 'PMO', 5),

    ('all', 'benefit_category', 'Efficiency', 1),
    ('university', 'benefit_category', 'Student experience', 2),
    ('university', 'benefit_category', 'Research', 3),
    ('public_sector', 'benefit_category', 'Service quality', 2),
    ('public_sector', 'benefit_category', 'Public outcomes', 3),
    ('general', 'benefit_category', 'Customer experience', 2),
    ('general', 'benefit_category', 'Employee experience', 3),
    ('all', 'benefit_category', 'Risk reduction', 4),
    ('all', 'benefit_category', 'Compliance', 5),
    ('all', 'benefit_category', 'Sustainability', 6),
    ('all', 'benefit_category', 'Income', 7),

    ('all', 'lesson_category', 'Project Management', 1),
    ('all', 'lesson_category', 'Governance', 2),
    ('all', 'lesson_category', 'Communication', 3),
    ('all', 'lesson_category', 'Stakeholder Management', 4),
    ('all', 'lesson_category', 'People & Roles', 5),
    ('all', 'lesson_category', 'Resource Management', 6),
    ('all', 'lesson_category', 'Training', 7),
    ('all', 'lesson_category', 'Testing', 8),
    ('all', 'lesson_category', 'Requirements', 9),
    ('all', 'lesson_category', 'Architecture', 10),
    ('all', 'lesson_category', 'Procurement', 11),
    ('all', 'lesson_category', 'Vendor Management', 12),
    ('all', 'lesson_category', 'Change Management & Adoption', 13),
    ('all', 'lesson_category', 'Ways of Working', 14),
    ('all', 'lesson_category', 'Support & Handover', 15),

    ('all', 'project_type', 'Business system', 1),
    ('all', 'project_type', 'Infrastructure', 2),
    ('all', 'project_type', 'Cyber', 3),
    ('all', 'project_type', 'Rollout', 4),
    ('all', 'project_type', 'Service improvement', 5),
    ('university', 'project_type', 'AI', 6),
    ('university', 'project_type', 'Mobile app', 7),
    ('university', 'project_type', 'Estate wide', 8),
    ('university', 'project_type', 'Supplier delivered', 9),
    ('neutral', 'project_type', 'Process change', 6),
    ('neutral', 'project_type', 'Organisational change', 7),
    ('neutral', 'project_type', 'AI', 8),
    ('neutral', 'project_type', 'Supplier delivered', 9),

    ('all', 'change_type', 'Scope', 1),
    ('all', 'change_type', 'Schedule', 2),
    ('all', 'change_type', 'Cost', 3),
    ('all', 'collection_type', 'Governance', 1),
    ('all', 'collection_type', 'Priority set', 2),
    ('all', 'collection_type', 'Funding stream', 3),

    ('university', 'business_unit', 'Digital & Technology Services', 1),
    ('university', 'business_unit', 'Student Services', 2),
    ('university', 'business_unit', 'Research Services', 3),
    ('university', 'business_unit', 'Estates & Campus Services', 4),
    ('university', 'business_unit', 'Finance', 5),
    ('university', 'business_unit', 'People Services', 6),
    ('university', 'business_unit', 'Academic Faculties', 7),
    ('public_sector', 'business_unit', 'Digital & Technology', 1),
    ('public_sector', 'business_unit', 'Corporate Services', 2),
    ('public_sector', 'business_unit', 'Operational Services', 3),
    ('public_sector', 'business_unit', 'Customer Services', 4),
    ('public_sector', 'business_unit', 'Finance', 5),
    ('public_sector', 'business_unit', 'People & HR', 6),
    ('public_sector', 'business_unit', 'Policy & Strategy', 7),
    ('general', 'business_unit', 'Technology', 1),
    ('general', 'business_unit', 'Operations', 2),
    ('general', 'business_unit', 'Product', 3),
    ('general', 'business_unit', 'Sales & Marketing', 4),
    ('general', 'business_unit', 'Customer Service', 5),
    ('general', 'business_unit', 'Finance', 6),
    ('general', 'business_unit', 'People & HR', 7),

    ('all', 'cost_category', 'Staff', 1),
    ('all', 'cost_category', 'Contractors', 2),
    ('all', 'cost_category', 'Licences', 3),
    ('all', 'cost_category', 'Hardware', 4),
    ('all', 'cost_category', 'Other', 5)
  ) x(sector, list_key, value, ord)
  where x.sector in (v_sector, 'all') or (x.sector = 'neutral' and v_sector <> 'university')
  on conflict (organisation_id, list_key, value) do nothing;

  -- Decision forums (D2): organisation-level forums (no workspace).
  insert into public.forums (organisation_id, workspace_id, name, level, sort_order)
  select p_org, null, x.name, x.level::public.forum_level, x.ord
  from (values
    ('all', 'Project Board', 'project', 1),
    ('all', 'Programme Board', 'programme', 2),
    ('university', 'Digital Committee', 'organisation', 3),
    ('university', 'Architecture Review Board', 'organisation', 4),
    ('public_sector', 'Portfolio Board', 'organisation', 3),
    ('public_sector', 'Design Authority', 'organisation', 4),
    ('general', 'Portfolio Board', 'organisation', 3),
    ('general', 'Architecture Review Board', 'organisation', 4),
    ('all', 'Change Advisory Board', 'organisation', 5)
  ) x(sector, name, level, ord)
  where x.sector in (v_sector, 'all')
  on conflict (organisation_id, workspace_id, name) do nothing;

  -- Lifecycle: unchanged, every sector (copied verbatim from live).
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
-- create or replace keeps the existing revokes on seed_org_defaults.

-- ---------------------------------------------------------------------------------------------
-- Checks to run after applying (local Postgres first, then production read-only)
-- ---------------------------------------------------------------------------------------------
-- select name, settings ->> 'sector' from public.organisations;           -- all 'university'
-- select oid::regprocedure from pg_proc where proname = 'create_organisation';  -- two overloads
-- As a signed-in test user (local only): create_organisation(p_name => 'G', p_sector => 'general')
--   then lookup_values / forums / settings -> 'tiers' / financialYearStartMonth = 1, and no
--   'Student', 'Research', 'Academic', 'Campus' or 'university' in any seeded label.
