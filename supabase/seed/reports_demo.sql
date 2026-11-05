-- Report builder demo and test fixtures (spec §19). One organisation ("Reports Demo Trust"), a
-- partner organisation and an outsider organisation; one portfolio, two programmes, ten
-- projects each built to trip one exception rule (§7.3), two forums with meetings.
-- Dates are relative to the day it runs, so the fixtures stay valid. Idempotent per
-- organisation: it refuses to run twice (slug reports-demo). Run as postgres / service role:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed/reports_demo.sql
-- Never run against production unless you want a demo organisation there.
--
-- Fixed ids (used by supabase/tests/reports_*.sql and e2e/reports.e2e.ts):
--   users   …0001 pmo, …0002 admin, …0003 chair, …0004 pm, …0005 viewer, …0006 outsider, …0007 partner
--   org     d0000000-0000-4000-8000-000000000100 (demo), …0200 (partner), …0300 (outsider)
--   forums  …0501 Digital Care Programme Board, …0502 Transformation Portfolio Board
--   projects d0000000-0000-4000-8000-0000000010NN, NN = 01..10
begin;

do $$
declare
  org uuid := 'd0000000-0000-4000-8000-000000000100';
  partner uuid := 'd0000000-0000-4000-8000-000000000200';
  outsider_org uuid := 'd0000000-0000-4000-8000-000000000300';
  ws uuid := 'd0000000-0000-4000-8000-000000000101';
  ws_partner uuid := 'd0000000-0000-4000-8000-000000000201';
  ws_out uuid := 'd0000000-0000-4000-8000-000000000301';
  pf uuid := 'd0000000-0000-4000-8000-000000000400';
  pg_digital uuid := 'd0000000-0000-4000-8000-000000000401';
  pg_estates uuid := 'd0000000-0000-4000-8000-000000000402';
  f_prog uuid := 'd0000000-0000-4000-8000-000000000501';
  f_port uuid := 'd0000000-0000-4000-8000-000000000502';
  u_pmo uuid := 'd0000000-0000-4000-8000-000000000001';
  u_admin uuid := 'd0000000-0000-4000-8000-000000000002';
  u_chair uuid := 'd0000000-0000-4000-8000-000000000003';
  u_pm uuid := 'd0000000-0000-4000-8000-000000000004';
  u_viewer uuid := 'd0000000-0000-4000-8000-000000000005';
  u_out uuid := 'd0000000-0000-4000-8000-000000000006';
  u_partner uuid := 'd0000000-0000-4000-8000-000000000007';
  r_pmo uuid; r_chair uuid; r_pm uuid; r_viewer uuid; r_admin uuid;
  today date := current_date;
  phases uuid[];
  p uuid;
  i integer;
  cl uuid;
  pid uuid[] := array[]::uuid[];
  m date;
begin
  if exists (select 1 from public.organisations where slug = 'reports-demo') then
    raise notice 'reports-demo already seeded';
    return;
  end if;

  -- People (auth.users → profiles by trigger)
  -- GoTrue (hosted Supabase) requires several fields to be non-null that Postgres would leave
  -- null by default: instance_id, timestamps, token strings, email_change, raw_app_meta_data.
  insert into auth.users (
    id, email, raw_user_meta_data, email_confirmed_at, confirmed_at, aud, role,
    instance_id, created_at, updated_at, last_sign_in_at,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    phone_change_token, reauthentication_token, email_change, phone_change,
    raw_app_meta_data
  ) values
    (u_pmo, 'pmo@reports-demo.test', '{"full_name":"Priya PMO"}', now(), now(), 'authenticated', 'authenticated',
      '00000000-0000-0000-0000-000000000000', now(), now(), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'),
    (u_admin, 'admin@reports-demo.test', '{"full_name":"Adam Admin"}', now(), now(), 'authenticated', 'authenticated',
      '00000000-0000-0000-0000-000000000000', now(), now(), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'),
    (u_chair, 'chair@reports-demo.test', '{"full_name":"Chloe Chair"}', now(), now(), 'authenticated', 'authenticated',
      '00000000-0000-0000-0000-000000000000', now(), now(), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'),
    (u_pm, 'pm@reports-demo.test', '{"full_name":"Pete Manager"}', now(), now(), 'authenticated', 'authenticated',
      '00000000-0000-0000-0000-000000000000', now(), now(), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'),
    (u_viewer, 'viewer@reports-demo.test', '{"full_name":"Vera Viewer"}', now(), now(), 'authenticated', 'authenticated',
      '00000000-0000-0000-0000-000000000000', now(), now(), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'),
    (u_out, 'outsider@other-org.test', '{"full_name":"Olly Outsider"}', now(), now(), 'authenticated', 'authenticated',
      '00000000-0000-0000-0000-000000000000', now(), now(), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'),
    (u_partner, 'partner@partner-org.test', '{"full_name":"Pia Partner"}', now(), now(), 'authenticated', 'authenticated',
      '00000000-0000-0000-0000-000000000000', now(), now(), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}')
  on conflict (id) do nothing;
  -- auth.identities: needed for GoTrue email/password login
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  select gen_random_uuid(), u.email, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  from auth.users u
  where u.id in (u_pmo, u_admin, u_chair, u_pm, u_viewer, u_out, u_partner)
  on conflict do nothing;
  insert into public.profiles (id, display_name, email)
  select id, raw_user_meta_data ->> 'full_name', email from auth.users
  where id in (u_pmo, u_admin, u_chair, u_pm, u_viewer, u_out, u_partner)
  on conflict (id) do nothing;

  -- Organisations
  insert into public.organisations (id, name, short_name, slug, region, settings, is_demo) values
    (org, 'Reports Demo Trust', 'RDT', 'reports-demo', 'uk', private.default_org_settings(), true),
    (partner, 'Partner Health Board', 'PHB', 'reports-demo-partner', 'uk', private.default_org_settings(), true),
    (outsider_org, 'Outsider Org', 'OUT', 'reports-demo-outsider', 'uk', private.default_org_settings(), true);
  perform private.seed_org_defaults(org);
  insert into public.organisation_subscriptions (organisation_id, plan, trial_ends_at)
  select o, 'trial', now() + interval '14 days' from unnest(array[org, partner, outsider_org]) o;
  insert into public.workspaces (id, organisation_id, name) values
    (ws, org, 'Delivery'), (ws_partner, partner, 'Partner delivery'), (ws_out, outsider_org, 'Outsider workspace');
  insert into public.organisation_members (organisation_id, profile_id, role) values
    (org, u_pmo, 'pmo'), (org, u_admin, 'admin'), (org, u_chair, 'contributor'), (org, u_pm, 'contributor'),
    (org, u_viewer, 'viewer'), (outsider_org, u_out, 'admin'), (partner, u_partner, 'viewer');
  insert into public.workspace_members (workspace_id, profile_id, organisation_id, role) values
    (ws, u_chair, org, 'contributor'), (ws, u_pm, org, 'contributor'), (ws, u_viewer, org, 'viewer'),
    (ws_out, u_out, outsider_org, 'admin'), (ws_partner, u_partner, partner, 'viewer');

  -- Resources (linked to profiles; membership may already have created them)
  for p in select unnest(array[u_pmo, u_admin, u_chair, u_pm, u_viewer]) loop
    insert into public.resources (organisation_id, profile_id, name, email, is_bookable)
    select org, pr.id, pr.display_name, pr.email, true from public.profiles pr where pr.id = p
    on conflict (organisation_id, profile_id) do nothing;
  end loop;
  select id into r_pmo from public.resources where organisation_id = org and profile_id = u_pmo;
  select id into r_admin from public.resources where organisation_id = org and profile_id = u_admin;
  select id into r_chair from public.resources where organisation_id = org and profile_id = u_chair;
  select id into r_pm from public.resources where organisation_id = org and profile_id = u_pm;
  select id into r_viewer from public.resources where organisation_id = org and profile_id = u_viewer;

  select array_agg(id order by sort_order) into phases from public.lifecycle_phases where organisation_id = org;

  -- Hierarchy
  insert into public.portfolios (id, organisation_id, workspace_id, name, description, owner_id)
  values (pf, org, ws, 'Transformation Portfolio', 'Demo portfolio for report packs', r_pmo);
  insert into public.programmes (id, organisation_id, workspace_id, portfolio_id, name, start_date, finish_date, manager_id, sponsor_id) values
    (pg_digital, org, ws, pf, 'Digital Care', today - 300, today + 400, r_chair, r_admin),
    (pg_estates, org, ws, pf, 'Estates & Facilities', today - 200, today + 500, r_pmo, r_admin);

  for i in 1..10 loop
    p := ('d0000000-0000-4000-8000-0000000010' || lpad(i::text, 2, '0'))::uuid;
    pid := pid || p;
    insert into public.projects (id, organisation_id, workspace_id, programme_id, name, code, tier, state, priority,
      start_date, finish_date, baseline_finish_date, manager_id, sponsor_id, phase_id, reporting_cadence)
    values (p, org, ws, case when i in (7, 8, 10) then pg_estates else pg_digital end,
      (array['Electronic Patient Record','Patient Portal','Virtual Wards','Clinical Messaging','Digital Pathology',
             'Theatre Scheduling','Car Park Rebuild','Energy Retrofit','New Outpatients Wing','Wayfinding Signage'])[i],
      'RD' || lpad(i::text, 2, '0'),
      (array['large','medium','medium','small','medium','large','medium','large','large','small'])[i]::public.project_tier,
      'active', 'high', today - 240, today + 300, today + 300,
      case when i = 1 then r_pm else r_chair end, r_admin, phases[3], 'monthly');

    -- Budget baseline 1,000,000 and phased forecast/actuals on one cost line.
    insert into public.budget_baselines (organisation_id, workspace_id, project_id, version, total, source)
    values (org, ws, p, 1, 1000000, 'initial');
    insert into public.cost_lines (organisation_id, workspace_id, project_id, name, spend_type, category_id, funding_source_id)
    values (org, ws, p, 'Delivery', 'capital',
      (select id from public.lookup_values where organisation_id = org and list_key = 'cost_category' order by sort_order limit 1),
      (select id from public.lookup_values where organisation_id = org and list_key = 'funding_source' order by sort_order limit 1))
    returning id into cl;
    -- Actuals 300k over the last 3 closed months; forecast remaining varies by project.
    for m in select generate_series(date_trunc('month', today)::date - interval '3 month', date_trunc('month', today)::date - interval '1 month', interval '1 month')::date loop
      insert into public.financial_values (organisation_id, workspace_id, project_id, cost_line_id, period_month, kind, amount)
      values (org, ws, p, cl, m, 'actual', 100000);
    end loop;
    insert into public.financial_values (organisation_id, workspace_id, project_id, cost_line_id, period_month, kind, amount)
    values (org, ws, p, cl, date_trunc('month', today)::date + interval '1 month', 'forecast',
      case i when 1 then 950000 when 5 then 780000 else 690000 end);  -- RD01 +25%, RD05 +8%, others −1%

    -- Milestones: one delivered, one upcoming on time.
    insert into public.milestones (organisation_id, workspace_id, project_id, title, type, baseline_date, forecast_date, actual_date, owner_id)
    values (org, ws, p, 'Design signed off', 'delivery', today - 90, today - 92, today - 92, r_pm),
           (org, ws, p, 'Build complete', 'delivery', today + 60, today + 60, null, r_pm);

    -- Health snapshots weekly for 12 weeks, green unless overridden below.
    insert into public.health_snapshots (organisation_id, workspace_id, project_id, snapshot_date, overall, schedule, financial, effort, issue, benefit, source, is_synthetic)
    select org, ws, p, d::date, 'green', 'green', 'green', 'green', 'green', 'not_set', 'seed', true
    from generate_series(today - 84, today - 1, interval '7 day') d;

    -- A submitted highlight report three weeks ago, declared green.
    insert into public.status_reports (organisation_id, workspace_id, project_id, reporting_date, overall, schedule, financial, effort, issue,
      declared_benefit, comments, accomplished, planned, status, submitted_at, submitter_id, source,
      evidenced_overall, evidenced_schedule, evidenced_financial, evidenced_effort, evidenced_issue, evidenced_benefit)
    values (org, ws, p, today - 21, 'green', 'green', 'green', 'green', 'green', 'not_set',
      'Progressing to plan. Supplier mobilised and design assurance complete.',
      'Completed design sign-off; onboarded supplier team.', 'Start build; confirm test environments.',
      'submitted', now() - interval '21 days', r_pm, 'seed', 'green', 'green', 'green', 'green', 'green', 'not_set');
  end loop;

  -- RD01 Electronic Patient Record: evidenced red (25% forecast overspend) — "Evidenced red", budget rule.
  -- RD02 Patient Portal: worsened since last report — an elevated risk now (amber), green a month ago.
  insert into public.risks (organisation_id, workspace_id, project_id, title, probability, impact, response, status, owner_id, review_date)
  values (org, ws, pid[2], 'Identity provider contract may lapse', 4, 3, 'reduce', 'open', r_pm, today + 14);
  -- RD03 Virtual Wards: report better than evidence for 6 weeks (declared green, evidenced amber).
  update public.health_snapshots set overall = 'amber', schedule = 'amber' where project_id = pid[3] and snapshot_date >= today - 45;
  update public.status_reports set reporting_date = today - 60, submitted_at = now() - interval '60 days' where project_id = pid[3];
  insert into public.milestones (organisation_id, workspace_id, project_id, title, type, baseline_date, forecast_date, owner_id)
  values (org, ws, pid[3], 'Remote monitoring live', 'delivery', today - 10, today + 25, r_pm);
  -- RD04 Clinical Messaging: schedule slip 40 days.
  insert into public.milestones (organisation_id, workspace_id, project_id, title, type, baseline_date, forecast_date, owner_id)
  values (org, ws, pid[4], 'Go-live', 'delivery', today + 20, today + 60, r_pm);
  -- RD05 Digital Pathology: budget variance +8%.
  -- RD06 Theatre Scheduling: decision required from the programme board (below).
  -- RD07 Car Park Rebuild: escalated to the portfolio board (escalation columns arrive in Phase 2).
  insert into public.issues (organisation_id, workspace_id, project_id, title, severity, status, owner_id)
  values (org, ws, pid[7], 'Planning condition dispute with council', 'high', 'open', r_chair);
  -- RD08 Energy Retrofit: stage gate due in 12 days.
  insert into public.milestones (organisation_id, workspace_id, project_id, title, type, baseline_date, forecast_date, phase_id, owner_id)
  values (org, ws, pid[8], 'Gate 4: ready to deploy', 'gate', today + 12, today + 12, phases[3], r_chair);
  -- RD09 (Digital Care), RD10 (Estates): clean.
  insert into public.risks (organisation_id, workspace_id, project_id, title, probability, impact, response, status, owner_id)
  values (org, ws, pid[9], 'Steel price volatility', 2, 2, 'accept', 'open', r_chair),
         (org, ws, pid[1], 'Data migration defects', 5, 4, 'reduce', 'open', r_pm),
         (org, ws, pid[1], 'Clinical safety sign-off delayed', 3, 4, 'reduce', 'open', r_pm);
  insert into public.change_requests (organisation_id, workspace_id, project_id, title, cost_impact, schedule_impact_days, status, type_id)
  select org, ws, x.p, x.t, x.c, x.d, x.s::public.change_status,
    (select id from public.lookup_values where organisation_id = org and list_key = 'change_type' order by sort_order limit 1)
  from (values (pid[1], 'Add maternity module', 120000, 30, 'proposed'),
               (pid[4], 'Defer GP integration to phase 2', -40000, -10, 'approved')) x(p, t, c, d, s);

  -- Forums
  insert into public.forums (id, organisation_id, workspace_id, name, level, forum_type, chair_resource_id, cadence, papers_deadline_days,
    scope_type, scope_entity_id, tolerances, description)
  values
    (f_prog, org, ws, 'Digital Care Programme Board', 'programme', 'programme_board', r_chair, 'monthly', 7, 'programme', pg_digital,
     '{"divergence_days":{"op":">","value":14},"max_milestone_slip_days":{"op":">","value":14},"budget_variance_pct":{"op":">","value":5},"days_to_next_gate":{"op":"<=","value":30}}',
     'Monthly board for the Digital Care programme.'),
    (f_port, org, ws, 'Transformation Portfolio Board', 'portfolio', 'portfolio_board', r_admin, 'monthly', 7, 'portfolio', pf,
     '{"divergence_days":{"op":">","value":14},"max_milestone_slip_days":{"op":">","value":30},"budget_variance_pct":{"op":">","value":10},"days_to_next_gate":{"op":"<=","value":30}}',
     'Quarterly portfolio board.');
  update public.forums set default_template_id = (select id from public.report_templates where is_system and name = 'Programme Board') where id = f_prog;
  update public.forums set default_template_id = (select id from public.report_templates where is_system and name = 'Portfolio Board / Committee') where id = f_port;
  insert into public.forum_members (organisation_id, workspace_id, forum_id, resource_id, role) values
    (org, ws, f_prog, r_chair, 'chair'), (org, ws, f_prog, r_pmo, 'secretary'), (org, ws, f_prog, r_viewer, 'member'),
    (org, ws, f_prog, r_pm, 'contributor'), (org, ws, f_port, r_admin, 'chair'), (org, ws, f_port, r_pmo, 'secretary'),
    (org, ws, f_port, r_viewer, 'observer');
  insert into public.meetings (id, organisation_id, workspace_id, forum_id, meeting_date, papers_deadline, status) values
    ('d0000000-0000-4000-8000-000000000601', org, ws, f_prog, today - 28, today - 35, 'held'),
    ('d0000000-0000-4000-8000-000000000602', org, ws, f_prog, today + 5, today - 1, 'planned'),
    ('d0000000-0000-4000-8000-000000000603', org, ws, f_prog, today + 33, today + 26, 'planned'),
    ('d0000000-0000-4000-8000-000000000604', org, ws, f_port, today + 12, today + 5, 'planned');

  -- RD06: a pending decision asked of the programme board.
  insert into public.decisions (id, organisation_id, workspace_id, project_id, title, context, needed_by_date, status, forum_id, target_meeting_id, decision_maker_id)
  values ('d0000000-0000-4000-8000-000000000701', org, ws, pid[6], 'Choose the theatre scheduling supplier',
    'Two compliant bids. Option A is cheaper; option B integrates with the existing PAS.', today + 10, 'pending', f_prog,
    'd0000000-0000-4000-8000-000000000602', r_chair);
  insert into public.decision_options (organisation_id, workspace_id, decision_id, project_id, title, pros, cons, sort_order) values
    (org, ws, 'd0000000-0000-4000-8000-000000000701', pid[6], 'Supplier A', array['£80k cheaper'], array['Custom PAS interface'], 1),
    (org, ws, 'd0000000-0000-4000-8000-000000000701', pid[6], 'Supplier B (recommended)', array['Native PAS integration'], array['Higher licence cost'], 2);

  -- Partner share: the partner organisation reads the Digital Care programme's published packs.
  insert into public.entity_shares (organisation_id, workspace_id, entity_type, entity_id, partner_organisation_id, hidden_block_keys)
  values (org, ws, 'programme', pg_digital, partner, '{budget_movers}');

  -- Phase 2 fixtures --------------------------------------------------------------------
  -- RD07: the planning issue is escalated to the portfolio board.
  update public.issues set escalated_to_forum_id = f_port where project_id = pid[7];
  -- RD04 waits on RD03's remote monitoring milestone (at risk: the giver slipped past need-by).
  insert into public.dependencies (organisation_id, workspace_id, giver_milestone_id, receiver_project_id, type, description, required_by_date, criticality, validation)
  select org, ws, m.id, pid[4], 'sequencing', 'Messaging needs remote monitoring live first', today + 5, 'high', 'confirmed'
  from public.milestones m where m.project_id = pid[3] and m.title = 'Remote monitoring live';
  insert into public.dependencies (organisation_id, workspace_id, giver_external_name, receiver_project_id, type, description, required_by_date, criticality, validation)
  values (org, ws, 'NHS England API', pid[2], 'external', 'National login API onboarding', today + 45, 'medium', 'confirmed');
  -- People: the PM is over-allocated across RD01 and RD02; one unfilled placeholder role.
  insert into public.resource_assignments (organisation_id, workspace_id, project_id, resource_id, role, start_date, finish_date, hours_per_week)
  values (org, ws, pid[1], r_pm, 'Project manager', today - 60, today + 120, 30),
         (org, ws, pid[2], r_pm, 'Project manager', today - 30, today + 90, 20),
         (org, ws, pid[1], r_chair, 'Clinical lead', today - 60, today + 120, 8);
  insert into public.resources (organisation_id, name, is_placeholder, placeholder_role, needs_staffing, is_bookable)
  values (org, 'Integration architect (TBC)', true, 'Integration architect', true, true) returning id into p;
  insert into public.resource_assignments (organisation_id, workspace_id, project_id, resource_id, role, start_date, finish_date, hours_per_week)
  values (org, ws, pid[1], p, 'Integration architect', today, today + 120, 22);
  -- A benefit on RD01, and a request in the portfolio pipeline.
  insert into public.benefits (organisation_id, workspace_id, portfolio_id, programme_id, title, classification, planned_total_value, category_id)
  select org, ws, pf, pg_digital, 'Reduced paper records storage', 'cash_releasing', 450000,
    (select id from public.lookup_values where organisation_id = org and list_key like '%benefit%categor%' order by sort_order limit 1)
  returning id into p;
  insert into public.benefit_projects (organisation_id, workspace_id, benefit_id, project_id, attribution_percent) values (org, ws, p, pid[1], 100);
  insert into public.project_requests (organisation_id, workspace_id, portfolio_id, title, status, estimated_cost, priority)
  values (org, ws, pf, 'Robotic process automation pilot', 'in_review', 250000, 'high');
  -- RD01 work items: 12 created over six months, 7 done, for the burn-up.
  insert into public.work_items (organisation_id, workspace_id, project_id, title, status, created_at)
  select org, ws, pid[1], 'Work package ' || n, case when n <= 7 then 'done' else 'in_progress' end::public.work_item_status,
    now() - make_interval(days => 180 - n * 12)
  from generate_series(1, 12) n;
  update public.work_items set done_at = created_at + interval '20 days' where project_id = pid[1] and status = 'done';
  -- RD01: a clinical safety approval gate with two steps, one approved.
  insert into public.approval_gates (organisation_id, workspace_id, project_id, entity_type, entity_id, gate_type, name, due_date)
  values (org, ws, pid[1], 'project', pid[1], 'dcb0160', 'Clinical safety case sign-off', today + 20) returning id into p;
  insert into public.approval_steps (organisation_id, workspace_id, gate_id, step_order, required_role, decision, decided_at, approver_id)
  values (org, ws, p, 1, 'Clinical safety officer', 'approved', now() - interval '3 days', u_chair),
         (org, ws, p, 2, 'Medical director', null, null, null);
  -- An open action from the last programme board, overdue.
  insert into public.forum_actions (organisation_id, workspace_id, forum_id, meeting_id, project_id, title, owner_id, due_date)
  values (org, ws, f_prog, 'd0000000-0000-4000-8000-000000000601', pid[3], 'Recovery plan for remote monitoring', r_pm, today - 3);

  perform private.refresh_health_current(org);

  -- One previous published programme board pack (for the held meeting five weeks ago), so the
  -- next pack shows "changes since last". The data is wound back to how it stood then (RD04's
  -- go-live 5 days late, RD05 on budget, RD02's risk low), the pack is published as the PMO
  -- through the real RPCs, then the data moves on to today's position.
  if to_regprocedure('public.publish_report(uuid)') is not null then
    update public.milestones set forecast_date = today + 25 where project_id = pid[4] and title = 'Go-live';
    update public.financial_values set amount = 690000 where project_id = pid[5] and kind = 'forecast';
    update public.risks set probability = 1 where project_id = pid[2];
    perform private.refresh_health_current(org);
    perform set_config('request.jwt.claims', json_build_object('sub', u_pmo, 'role', 'authenticated')::text, true);
    p := public.create_report(jsonb_build_object('forum_id', f_prog, 'meeting_id', 'd0000000-0000-4000-8000-000000000601',
      'title', 'Digital Care Programme Board — previous pack', 'as_at', today - 35));
    insert into public.report_narratives (report_id, block_instance_id, body)
    values (p, 'exec', '{"format":"markdown","text":"Programme broadly on track. Virtual Wards remote monitoring is the main watch item."}');
    update public.reports set status = 'approved', approved_at = now() - interval '36 days', overall_rating = 'amber',
      overall_rating_rationale = 'Two projects need attention; no decisions outstanding.' where id = p;
    perform public.publish_report(p);
    update public.reports set published_at = now() - interval '35 days' where id = p;
    perform set_config('request.jwt.claims', '', true);
    update public.milestones set forecast_date = today + 60 where project_id = pid[4] and title = 'Go-live';
    update public.financial_values set amount = 780000 where project_id = pid[5] and kind = 'forecast';
    update public.risks set probability = 4 where project_id = pid[2];
  end if;
  -- The last fortnight's snapshots show today's position (packs as at a recent papers deadline
  -- read evidenced health from them).
  perform private.capture_health_snapshots(org, today - 7);
  perform private.capture_health_snapshots(org, today - 1);
  perform private.refresh_health_current(org);
end $$;

commit;
