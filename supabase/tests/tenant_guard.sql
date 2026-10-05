-- Tenant-guard tests (review A). Runs against a seeded database inside a transaction and
-- rolls everything back. Each check raises on failure; success prints a notice.
--   psql "$DB_URL" -f supabase/tests/tenant_guard.sql
begin;

do $$
declare
  demo_org uuid := (select id from public.organisations where slug = 'demo-university');
  demo_portfolio uuid := (select id from public.portfolios where organisation_id = demo_org limit 1);
  demo_project uuid := (select id from public.projects where organisation_id = demo_org order by name limit 1);
  other_org uuid;
  other_ws uuid;
  other_resource uuid;
  other_portfolio uuid;
  other_phase uuid;
  other_project uuid;
  spoofed_org uuid;
  passed integer := 0;
begin
  if demo_org is null then raise exception 'Seed the demo organisation first'; end if;

  insert into public.organisations (name, slug) values ('Tenant Test University', 'tenant-test-' || substr(md5(random()::text), 1, 8)) returning id into other_org;
  insert into public.workspaces (organisation_id, name) values (other_org, 'Other') returning id into other_ws;
  insert into public.resources (organisation_id, name) values (other_org, 'Outside Sponsor') returning id into other_resource;
  insert into public.portfolios (workspace_id, name) values (other_ws, 'Other portfolio') returning id into other_portfolio;
  insert into public.lifecycle_phases (organisation_id, name, short_name, sort_order) values (other_org, 'Other phase', 'P1', 1) returning id into other_phase;

  -- 1. A project whose sponsor_id belongs to another organisation must fail.
  begin
    insert into public.projects (portfolio_id, name, sponsor_id) values (demo_portfolio, 'Cross-org sponsor', other_resource);
    raise exception 'FAIL: project accepted a sponsor from another organisation';
  exception when foreign_key_violation then passed := passed + 1;
  end;

  -- 2. Same for an org-level reference (lifecycle phase from another organisation).
  begin
    insert into public.projects (portfolio_id, name, phase_id) values (demo_portfolio, 'Cross-org phase', other_phase);
    raise exception 'FAIL: project accepted a lifecycle phase from another organisation';
  exception when foreign_key_violation then passed := passed + 1;
  end;

  -- 3. A risk owner from another organisation must fail.
  begin
    insert into public.risks (project_id, title, probability, impact, owner_id) values (demo_project, 'Cross-org owner', 2, 2, other_resource);
    raise exception 'FAIL: risk accepted an owner from another organisation';
  exception when foreign_key_violation then passed := passed + 1;
  end;

  -- 4. Supplying another tenant's organisation_id/workspace_id is overwritten from the parent.
  insert into public.issues (project_id, title, organisation_id, workspace_id)
  values (demo_project, 'Spoofed tenant', other_org, other_ws) returning organisation_id into spoofed_org;
  if spoofed_org <> demo_org then
    raise exception 'FAIL: tenant columns were not taken from the parent project';
  end if;
  passed := passed + 1;

  -- 5. Tenant columns are immutable.
  begin
    update public.portfolios set workspace_id = other_ws where id = demo_portfolio;
    raise exception 'FAIL: portfolio moved to another workspace';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- 6. A dependency cannot join two tenants.
  insert into public.projects (portfolio_id, name) values (other_portfolio, 'Other project') returning id into other_project;
  begin
    insert into public.dependencies (giver_project_id, receiver_project_id, description, required_by_date)
    values (demo_project, other_project, 'Cross-tenant dependency', current_date);
    raise exception 'FAIL: dependency spanned two organisations';
  exception when foreign_key_violation then passed := passed + 1;
  end;

  raise notice 'tenant_guard: % checks passed', passed;
end $$;

rollback;
