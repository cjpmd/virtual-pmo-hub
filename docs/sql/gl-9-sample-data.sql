-- GL-9 Start with sample data. PROPOSAL, not applied. Waiting for approval.
--
-- Design
-- - Marking: a plain flag, is_sample boolean not null default false, on the ten tables the
--   sample writes: portfolios, programmes, projects, work_items, milestones, risks, issues,
--   decisions, benefits, status_reports. (benefit_projects is a link row and follows its
--   benefit.) A flag rather than a tag table: one column the screens can filter and chip on
--   without a join, and adding a column with a constant default is metadata-only in Postgres 16
--   (no table rewrite). Nothing else reads it, so no view, policy or health rule changes.
--   The v_* views are not redefined: the client finds sample projects with one small query
--   (projects where is_sample) and chips by id, so v_projects stays exactly as it is.
-- - public.seed_sample_data(p_org): SECURITY DEFINER, caller must be an admin of the
--   organisation (explicit check), refused if the organisation already has active (unarchived)
--   sample data. Seeds into the organisation's first active workspace. Writes go through the
--   normal triggers (tenant guard, refs, project codes, health enqueue, audit, and the GL-4
--   read-only trigger, so a read-only organisation can't add sample data).
-- - Content (dates relative to today, so it always looks current; wording by sector from GL-8):
--     1 portfolio "Sample portfolio", 1 programme, 5 projects (4 in the programme, 1 straight
--     under the portfolio as a proposed idea), across phases 1–5, tiers small/medium/large;
--     4 tasks on each of projects 1–4 (done, in progress, not started; one blocked and overdue
--     on project 3); 2 milestones on each of projects 1–4 (a gate already met, and go-live; go-live
--     slipped 30 days on project 2); 1 risk (project 2); 1 issue (project 3, past due);
--     1 pending decision (programme, needed in 14 days); 1 benefit (programme, the sector's
--     first sector-specific benefit category, linked 100% to project 1); submitted status
--     reports on projects 1–3 (green, amber, red) dated 3 days ago. Project 4 has no report,
--     so the "no report yet" state shows too. Owners, managers and the report submitter are the
--     admin's own linked resource (null if they have none). No people, resources, members or
--     invites are created, so seat counts (private.paid_seat_count counts members and
--     invitations only) and everything billed are unaffected. No financials (budget lives in
--     budget_baselines and is left empty).
--   Status reports use source 'seed' (the existing value for non-user reports).
-- - public.remove_sample_data(p_org): SECURITY DEFINER, admin only. Archives (never deletes):
--     portfolios, programmes, projects -> archived_at = now() (the existing archive, which every
--       health view and project list already honours);
--     risks, issues still open -> status closed, closed_at = now();
--     decisions still pending -> withdrawn;
--     benefits -> closed.
--   These registers (risks, issues, v_decisions, benefits) don't hide rows under an archived
--   parent, so closing them is what takes them out of the open lists. Tasks, milestones and
--   status reports are left as they are under the archived projects (see open question 1).
--   Re-running it is a no-op. After removal, seed_sample_data can be run again.
-- - Both RPCs: execute revoked from public and anon, granted to authenticated.
-- - Additive only: no drop, delete or truncate.

-- ---------------------------------------------------------------------------------------------
-- 1. The flag
-- ---------------------------------------------------------------------------------------------

alter table public.portfolios     add column is_sample boolean not null default false;
alter table public.programmes     add column is_sample boolean not null default false;
alter table public.projects       add column is_sample boolean not null default false;
alter table public.work_items     add column is_sample boolean not null default false;
alter table public.milestones     add column is_sample boolean not null default false;
alter table public.risks          add column is_sample boolean not null default false;
alter table public.issues         add column is_sample boolean not null default false;
alter table public.decisions      add column is_sample boolean not null default false;
alter table public.benefits       add column is_sample boolean not null default false;
alter table public.status_reports add column is_sample boolean not null default false;

-- Small partial indexes for the remove RPC and the client's "which projects are sample" read.
create index portfolios_sample_idx on public.portfolios (organisation_id) where is_sample;
create index programmes_sample_idx on public.programmes (organisation_id) where is_sample;
create index projects_sample_idx   on public.projects   (organisation_id) where is_sample;
create index risks_sample_idx      on public.risks      (organisation_id) where is_sample;
create index issues_sample_idx     on public.issues     (organisation_id) where is_sample;
create index decisions_sample_idx  on public.decisions  (organisation_id) where is_sample;
create index benefits_sample_idx   on public.benefits   (organisation_id) where is_sample;

-- ---------------------------------------------------------------------------------------------
-- 2. seed_sample_data
-- ---------------------------------------------------------------------------------------------

create function public.seed_sample_data(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_today date := current_date;
  v_sector text;
  v_ws uuid;
  v_res uuid;
  v_phases uuid[];
  v_category uuid;
  v_portfolio uuid;
  v_programme uuid;
  v_projects uuid[] := '{}';
  v_project uuid;
  v_benefit uuid;
  p record;
begin
  if v_uid is null then
    raise exception 'Sign in to add sample data' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organisation_members m
                 where m.organisation_id = p_org and m.profile_id = v_uid and m.role = 'admin') then
    raise exception 'Only an organisation admin can add sample data' using errcode = '42501';
  end if;
  if exists (select 1 from public.portfolios where organisation_id = p_org and is_sample and archived_at is null) then
    raise exception 'This organisation already has sample data' using errcode = 'P0001', hint = 'sample_exists';
  end if;

  select coalesce(o.settings ->> 'sector', 'university') into v_sector from public.organisations o where o.id = p_org;
  select w.id into v_ws from public.workspaces w
   where w.organisation_id = p_org and w.archived_at is null order by w.created_at, w.id limit 1;
  if v_ws is null then
    raise exception 'The organisation has no active workspace' using errcode = 'P0001';
  end if;
  select r.id into v_res from public.resources r where r.organisation_id = p_org and r.profile_id = v_uid limit 1;
  select array_agg(l.id order by l.sort_order) into v_phases from public.lifecycle_phases l where l.organisation_id = p_org;
  select l.id into v_category from public.lookup_values l
   where l.organisation_id = p_org and l.list_key = 'benefit_category'
   order by (l.value = case v_sector when 'public_sector' then 'Service quality'
                                     when 'general' then 'Customer experience'
                                     else 'Student experience' end) desc, l.sort_order
   limit 1;

  insert into public.portfolios (organisation_id, workspace_id, name, description, owner_id, is_sample)
  values (p_org, v_ws, 'Sample portfolio',
          'Example records to show how ORMO PMO works. Remove them in Settings › Data.', v_res, true)
  returning id into v_portfolio;

  insert into public.programmes (organisation_id, workspace_id, portfolio_id, name, description,
                                 manager_id, sponsor_id, start_date, finish_date, is_sample)
  values (p_org, v_ws, v_portfolio,
          case v_sector when 'public_sector' then 'Digital public services'
                        when 'general' then 'Customer experience' else 'Digital student journey' end,
          'Sample programme.', v_res, v_res, v_today - 240, v_today + 365, true)
  returning id into v_programme;

  -- n, names by sector, tier, phase (1-based), state, priority, start, finish, baseline slip
  for p in
    select * from (values
      (1, 'Student records upgrade', 'Online payments portal', 'Customer self-service portal',
          'medium', 4, 'active', 'high', -150, 120, 0),
      (2, 'Timetabling system replacement', 'Case management replacement', 'CRM replacement',
          'large', 3, 'active', 'critical', -200, 300, 45),
      (3, 'Campus Wi-Fi refresh', 'Network refresh', 'Network refresh',
          'medium', 5, 'active', 'moderate', -240, 30, 0),
      (4, 'Research data storage', 'Records digitisation', 'Finance system upgrade',
          'small', 2, 'active', 'moderate', -60, 150, 0),
      (5, 'Library self-service kiosks', 'Contact centre telephony', 'Office move',
          'small', 1, 'proposed', 'low', 30, 200, 0)
    ) v(n, uni, pub, gen, tier, phase, state, priority, s, f, slip)
    order by n
  loop
    insert into public.projects (organisation_id, workspace_id, programme_id, portfolio_id, name, code,
                                 manager_id, sponsor_id, tier, phase_id, state, priority,
                                 start_date, finish_date, baseline_finish_date, is_sample)
    values (p_org, v_ws,
            case when p.n < 5 then v_programme end, case when p.n = 5 then v_portfolio end,
            case v_sector when 'public_sector' then p.pub when 'general' then p.gen else p.uni end,
            '', v_res, v_res, p.tier::public.project_tier, v_phases[least(p.phase, cardinality(v_phases))],
            p.state::public.project_state, p.priority::public.priority,
            v_today + p.s, v_today + p.f, v_today + p.f - p.slip, true)
    returning id into v_project;
    v_projects := v_projects || v_project;

    if p.n < 5 then
      insert into public.work_items (organisation_id, workspace_id, project_id, title, item_type, status,
                                     priority, start_date, finish_date, baseline_finish_date,
                                     percent_complete, backlog_rank, is_sample)
      select p_org, v_ws, v_project, t.title, 'task', t.status::public.work_item_status, 'moderate',
             v_today + t.s, v_today + t.f, v_today + t.f, t.pct, t.n, true
      from (values
        (1, 'Confirm requirements', 'done', -100, -70, 100),
        (2, 'Configure and build', 'in_progress', -60, 30, 50),
        (3, case when p.n = 3 then 'Install equipment' else 'Test with users' end,
            case when p.n = 3 then 'blocked' else 'not_started' end,
            case when p.n = 3 then -30 else 20 end, case when p.n = 3 then -5 else 60 end, 0),
        (4, 'Prepare go-live', 'not_started', 50, 80, 0)
      ) t(n, title, status, s, f, pct);

      insert into public.milestones (organisation_id, workspace_id, project_id, title, type, owner_id,
                                     baseline_date, forecast_date, actual_date, is_sample)
      values
        (p_org, v_ws, v_project, 'Design approved', 'gate', v_res, v_today - 60, v_today - 60, v_today - 58, true),
        (p_org, v_ws, v_project, 'Go live', 'delivery', v_res, v_today + 90,
         v_today + 90 + case when p.n = 2 then 30 else 0 end, null, true);
    end if;
  end loop;

  insert into public.risks (organisation_id, workspace_id, project_id, title, description, owner_id,
                            probability, impact, response, review_date, is_sample)
  values (p_org, v_ws, v_projects[2], 'Supplier staff may not be available for data migration',
          'The supplier has flagged competing commitments in the migration window.', v_res,
          3, 4, 'reduce', v_today + 14, true);

  insert into public.issues (organisation_id, workspace_id, project_id, title, description, owner_id,
                             severity, due_date, is_sample)
  values (p_org, v_ws, v_projects[3], 'Equipment delivery delayed',
          'The supplier has missed the agreed delivery date; installation is on hold.', v_res,
          'high', v_today - 3, true);

  insert into public.decisions (organisation_id, workspace_id, programme_id, title, context,
                                needed_by_date, is_sample)
  values (p_org, v_ws, v_programme, 'Approve a phased rollout',
          'Rolling out in two phases lowers risk but adds about six weeks.', v_today + 14, true);

  insert into public.benefits (organisation_id, workspace_id, portfolio_id, programme_id, title, description,
                               type, classification, category_id, owner_id, sro_id, status,
                               planned_total_value, realisation_start_date, is_sample)
  values (p_org, v_ws, v_portfolio, v_programme,
          case v_sector when 'public_sector' then 'Faster resolution of customer requests'
                        when 'general' then 'Fewer customer service contacts'
                        else 'Quicker enrolment for students' end,
          'Sample benefit.', 'benefit', 'non_cash_releasing', v_category, v_res, v_res, 'planned',
          120000, v_today + 150, true)
  returning id into v_benefit;
  insert into public.benefit_projects (organisation_id, workspace_id, benefit_id, project_id, attribution_percent)
  values (p_org, v_ws, v_benefit, v_projects[1], 100);

  insert into public.status_reports (organisation_id, workspace_id, project_id, reporting_date, status,
                                     submitted_at, submitter_id, source, overall, schedule, financial,
                                     effort, issue, declared_benefit, accomplished, planned,
                                     decisions_needed, is_sample)
  select p_org, v_ws, v_projects[r.n], v_today - 3, 'submitted', now(), v_res, 'seed',
         r.rag::public.health, r.sched::public.health, 'green', r.rag::public.health,
         r.iss::public.health, 'green', r.done, r.next, r.ask, true
  from (values
    (1, 'green', 'green', 'green', 'Build complete for the first release.', 'Start user testing.', null),
    (2, 'amber', 'amber', 'green', 'Design signed off.', 'Agree the migration window with the supplier.',
        'Approve a phased rollout.'),
    (3, 'red', 'red', 'red', 'Site surveys finished.', 'Re-plan installation once equipment arrives.',
        'Agree a revised go-live date.')
  ) r(n, rag, sched, iss, done, next, ask);

  return jsonb_build_object('portfolio_id', v_portfolio, 'programme_id', v_programme,
                            'project_ids', to_jsonb(v_projects));
end;
$$;
revoke execute on function public.seed_sample_data(uuid) from public, anon;
grant execute on function public.seed_sample_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. remove_sample_data (archives, never deletes)
-- ---------------------------------------------------------------------------------------------

create function public.remove_sample_data(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_projects integer;
begin
  if v_uid is null then
    raise exception 'Sign in to remove sample data' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organisation_members m
                 where m.organisation_id = p_org and m.profile_id = v_uid and m.role = 'admin') then
    raise exception 'Only an organisation admin can remove sample data' using errcode = '42501';
  end if;

  update public.projects set archived_at = now()
   where organisation_id = p_org and is_sample and archived_at is null;
  get diagnostics v_projects = row_count;
  update public.programmes set archived_at = now()
   where organisation_id = p_org and is_sample and archived_at is null;
  update public.portfolios set archived_at = now()
   where organisation_id = p_org and is_sample and archived_at is null;
  update public.risks set status = 'closed', closed_at = now()
   where organisation_id = p_org and is_sample and status = 'open';
  update public.issues set status = 'closed', closed_at = now()
   where organisation_id = p_org and is_sample and status = 'open';
  update public.decisions set status = 'withdrawn'
   where organisation_id = p_org and is_sample and status = 'pending';
  update public.benefits set status = 'closed'
   where organisation_id = p_org and is_sample and status <> 'closed';

  return jsonb_build_object('projects_archived', v_projects);
end;
$$;
revoke execute on function public.remove_sample_data(uuid) from public, anon;
grant execute on function public.remove_sample_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Checks after applying (local Postgres first; production read-only)
-- ---------------------------------------------------------------------------------------------
-- As a new admin (local): create_organisation(p_name => 'G', p_sector => 'general'), then
--   seed_sample_data(org): 1 portfolio, 1 programme, 5 projects, 16 tasks, 8 milestones, 1 risk,
--   1 issue, 1 decision, 1 benefit, 3 submitted reports, all is_sample; no 'Student', 'Campus',
--   'Research' or 'Library' in any name. A second call raises hint 'sample_exists'.
-- As a contributor: both RPCs raise 42501. As an outsider admin with another org's id: 42501.
-- remove_sample_data: all three hierarchy levels archived, risk/issue closed, decision withdrawn,
--   benefit closed; row counts unchanged (nothing deleted); a second call is a no-op; seeding
--   again then works.
-- Read-only organisation (GL-4): seed_sample_data refused with hint 'org_read_only'.
-- select private.paid_seat_count(org) is the same before and after seeding.
