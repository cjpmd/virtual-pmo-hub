-- Financials (Stage F2, docs/financials-and-business-cases.md): cost lines, monthly values,
-- budget baselines, month-end close, forecast history and the actuals import log; the
-- financial views; projects' budget / actual / forecast moved into them.
--
-- projects.budget / actual / forecast are no longer read: v_projects computes columns of the
-- same names from v_project_financials (budget = latest baseline, actual = actual to date,
-- forecast = estimate at completion). The columns themselves are dropped in a later migration,
-- once no client writes them.
--
-- RLS uses the array helpers only (no per-row helper calls). New private functions are revoked
-- from public and anon explicitly.

-- ---------------------------------------------------------------------------
-- Lookup lists: cost categories (seeded) and funding sources (empty, PMO-editable).
-- ---------------------------------------------------------------------------
insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
select o.id, 'cost_category', v.value, v.value, v.sort_order
from public.organisations o
cross join (values ('Staff', 1), ('Contractors', 2), ('Licences', 3), ('Hardware', 4), ('Other', 5)) v(value, sort_order)
on conflict (organisation_id, list_key, value) do nothing;

create or replace function private.seed_org_defaults(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    (p_org, 'business_unit', 'Academic Faculties', 'Academic Faculties', 7),
    (p_org, 'cost_category', 'Staff', 'Staff', 1),
    (p_org, 'cost_category', 'Contractors', 'Contractors', 2),
    (p_org, 'cost_category', 'Licences', 'Licences', 3),
    (p_org, 'cost_category', 'Hardware', 'Hardware', 4),
    (p_org, 'cost_category', 'Other', 'Other', 5)
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
$function$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.spend_type as enum ('capital', 'operating');
create type public.financial_kind as enum ('budget', 'actual', 'forecast');
create type public.baseline_source as enum ('initial', 'business_case', 'change_request', 'pmo_adjustment', 'migration');
create type public.forecast_capture_source as enum ('close', 'scheduled');
create type public.actuals_import_mode as enum ('replace', 'add');

-- ---------------------------------------------------------------------------
-- Cost lines
-- ---------------------------------------------------------------------------
create table public.cost_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  name text not null check (btrim(name) <> ''),
  category_id uuid not null,
  category_list text not null generated always as ('cost_category') stored,
  spend_type public.spend_type not null default 'operating',
  funding_source_id uuid,
  funding_source_list text not null generated always as ('funding_source') stored,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id),
  foreign key (category_id, organisation_id, category_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (funding_source_id, organisation_id, funding_source_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, project_id)
);
create unique index cost_lines_project_name_key on public.cost_lines (project_id, lower(btrim(name)));
create index cost_lines_workspace_idx on public.cost_lines (workspace_id, organisation_id);
create index cost_lines_project_workspace_idx on public.cost_lines (project_id, workspace_id);
create index cost_lines_category_idx on public.cost_lines (category_id, organisation_id, category_list);
create index cost_lines_funding_source_idx on public.cost_lines (funding_source_id, organisation_id, funding_source_list);
create index cost_lines_created_by_idx on public.cost_lines (created_by);

-- ---------------------------------------------------------------------------
-- Monthly values: one row per line, month and kind
-- ---------------------------------------------------------------------------
create table public.financial_values (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  cost_line_id uuid not null,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  kind public.financial_kind not null,
  amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id),
  foreign key (cost_line_id, project_id) references public.cost_lines (id, project_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (cost_line_id, period_month, kind)
);
create index financial_values_project_kind_month_idx on public.financial_values (project_id, kind, period_month);
create index financial_values_workspace_idx on public.financial_values (workspace_id, organisation_id);
create index financial_values_project_workspace_idx on public.financial_values (project_id, workspace_id);
create index financial_values_line_project_idx on public.financial_values (cost_line_id, project_id);
create index financial_values_created_by_idx on public.financial_values (created_by);

-- ---------------------------------------------------------------------------
-- Budget baselines: append-only; the latest version is the current budget
-- ---------------------------------------------------------------------------
create table public.budget_baselines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  version integer not null,
  total numeric(14,2) not null check (total >= 0),
  source public.baseline_source not null,
  -- The foreign key to business case versions arrives with business cases (Stage F4).
  business_case_version_id uuid,
  change_request_id uuid,
  reason text,
  approved_at timestamptz not null default now(),
  approved_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id),
  foreign key (change_request_id, workspace_id) references public.change_requests (id, workspace_id),
  foreign key (approved_by) references public.profiles (id) on delete set null,
  unique (project_id, version),
  unique (change_request_id),
  check ((source = 'change_request') = (change_request_id is not null)),
  check ((source = 'business_case') = (business_case_version_id is not null)),
  check (source <> 'pmo_adjustment' or btrim(coalesce(reason, '')) <> '')
);
create index budget_baselines_project_version_idx on public.budget_baselines (project_id, version desc);
create index budget_baselines_workspace_idx on public.budget_baselines (workspace_id, organisation_id);
create index budget_baselines_project_workspace_idx on public.budget_baselines (project_id, workspace_id);
create index budget_baselines_change_request_idx on public.budget_baselines (change_request_id, workspace_id);
create index budget_baselines_approved_by_idx on public.budget_baselines (approved_by);

-- ---------------------------------------------------------------------------
-- Month-end close (organisation-wide)
-- ---------------------------------------------------------------------------
create table public.financial_periods (
  organisation_id uuid not null references public.organisations (id),
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references public.profiles (id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organisation_id, period_month)
);
create index financial_periods_closed_idx on public.financial_periods (organisation_id, period_month desc) where closed_at is not null;
create index financial_periods_closed_by_idx on public.financial_periods (closed_by);
create index financial_periods_reopened_by_idx on public.financial_periods (reopened_by);

-- ---------------------------------------------------------------------------
-- Forecast history: one row per project and reporting month, append-only
-- ---------------------------------------------------------------------------
create table public.financial_forecast_history (
  project_id uuid not null,
  reporting_month date not null check (reporting_month = date_trunc('month', reporting_month)::date),
  organisation_id uuid not null,
  workspace_id uuid not null,
  budget numeric(14,2) not null,
  actual_to_date numeric(14,2) not null,
  forecast_remaining numeric(14,2) not null,
  eac numeric(14,2) not null,
  has_baseline boolean not null,
  source public.forecast_capture_source not null,
  captured_at timestamptz not null default now(),
  primary key (project_id, reporting_month),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id)
);
create index financial_forecast_history_workspace_idx on public.financial_forecast_history (workspace_id, organisation_id);
create index financial_forecast_history_project_workspace_idx on public.financial_forecast_history (project_id, workspace_id);

-- ---------------------------------------------------------------------------
-- Actuals import log (the import itself arrives with the Financials screens, Stage F3)
-- ---------------------------------------------------------------------------
create table public.actuals_imports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  file_name text not null,
  mode public.actuals_import_mode not null,
  row_count integer not null check (row_count >= 0),
  total numeric(14,2) not null,
  imported_by uuid default auth.uid(),
  imported_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (imported_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id)
);
create index actuals_imports_workspace_idx on public.actuals_imports (workspace_id, organisation_id, imported_at desc);
create index actuals_imports_imported_by_idx on public.actuals_imports (imported_by);

create table public.actuals_import_rows (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  import_id uuid not null,
  row_number integer not null,
  project_id uuid not null,
  cost_line_id uuid not null,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  amount numeric(14,2) not null,
  reference text,
  foreign key (import_id, workspace_id) references public.actuals_imports (id, workspace_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id),
  foreign key (cost_line_id, project_id) references public.cost_lines (id, project_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  unique (import_id, row_number)
);
create index actuals_import_rows_import_idx on public.actuals_import_rows (import_id, workspace_id);
create index actuals_import_rows_project_idx on public.actuals_import_rows (project_id, workspace_id);
create index actuals_import_rows_line_idx on public.actuals_import_rows (cost_line_id, project_id);
create index actuals_import_rows_workspace_idx on public.actuals_import_rows (workspace_id, organisation_id);

-- ---------------------------------------------------------------------------
-- Tenant guards, updated_at, audit
-- ---------------------------------------------------------------------------
create trigger cost_lines_00_tenant_guard before insert or update on public.cost_lines
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger financial_values_00_tenant_guard before insert or update on public.financial_values
  for each row execute function private.tenant_guard('cost_line_id', 'cost_lines');
create trigger budget_baselines_00_tenant_guard before insert on public.budget_baselines
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger actuals_imports_00_tenant_guard before insert on public.actuals_imports
  for each row execute function private.tenant_guard('workspace_id', 'workspaces');
create trigger actuals_import_rows_00_tenant_guard before insert on public.actuals_import_rows
  for each row execute function private.tenant_guard('import_id', 'actuals_imports');

create trigger cost_lines_updated_at before update on public.cost_lines
  for each row execute function private.set_updated_at();
create trigger financial_values_updated_at before update on public.financial_values
  for each row execute function private.set_updated_at();
create trigger financial_periods_updated_at before update on public.financial_periods
  for each row execute function private.set_updated_at();

create trigger cost_lines_audit after insert or update or delete on public.cost_lines
  for each row execute function private.audit_row_change();
create trigger financial_values_audit after insert or update or delete on public.financial_values
  for each row execute function private.audit_row_change();
create trigger budget_baselines_audit after insert on public.budget_baselines
  for each row execute function private.audit_row_change();
create trigger financial_periods_audit after insert or update on public.financial_periods
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Cut-off: months up to and including it use actuals, later months use forecast. The latest
-- closed month, or the month before the organisation's current month when none is closed.
-- ---------------------------------------------------------------------------
create function private.financial_cutoff(p_org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select max(fp.period_month) from public.financial_periods fp
     where fp.organisation_id = p_org and fp.closed_at is not null),
    (date_trunc('month', private.org_today(p_org)) - interval '1 month')::date);
$$;
revoke all on function private.financial_cutoff(uuid) from public, anon;
grant execute on function private.financial_cutoff(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Closed months are locked for every kind of value.
-- ---------------------------------------------------------------------------
create function private.financial_values_closed_month()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  months date[] := case tg_op
    when 'INSERT' then array[new.period_month]
    when 'DELETE' then array[old.period_month]
    else array[old.period_month, new.period_month] end;
  org uuid := coalesce(new.organisation_id, old.organisation_id);
  closed date;
begin
  select fp.period_month into closed from public.financial_periods fp
  where fp.organisation_id = org and fp.period_month = any (months) and fp.closed_at is not null
  order by fp.period_month limit 1;
  if closed is not null then
    raise exception '% is closed. Ask the PMO to reopen it.', to_char(closed, 'FMMonth YYYY') using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.financial_values_closed_month() from public, anon, authenticated;
create trigger financial_values_10_closed_month before insert or update or delete on public.financial_values
  for each row execute function private.financial_values_closed_month();

-- ---------------------------------------------------------------------------
-- Baselines: numbered, stamped and checked against their source. Never updated or deleted
-- (no grant), so this runs on insert only.
-- ---------------------------------------------------------------------------
create function private.budget_baseline_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  prev_version integer;
  prev_total numeric;
  cr record;
begin
  select b.version, b.total into prev_version, prev_total
  from public.budget_baselines b where b.project_id = new.project_id
  order by b.version desc limit 1;
  new.version := coalesce(prev_version, 0) + 1;
  new.approved_at := now();
  if uid is not null then
    new.approved_by := uid;
  end if;

  if new.source = 'migration' then
    if uid is not null then
      raise exception 'Migration baselines are created by the system only.' using errcode = '42501';
    end if;
  elsif new.source = 'initial' then
    if prev_version is not null then
      raise exception 'This project already has a budget baseline. Change it through an approved change request or a PMO adjustment.' using errcode = 'P0001';
    end if;
    if uid is not null and not (new.workspace_id = any (private.my_workspace_ids('manager'))) then
      raise exception 'Only a manager or the PMO can set the first budget baseline.' using errcode = '42501';
    end if;
  elsif new.source = 'business_case' then
    -- Business cases arrive in Stage F4, which replaces this branch with the real checks.
    raise exception 'Budget baselines from business cases are not available yet.' using errcode = 'P0001';
  elsif new.source = 'change_request' then
    select c.project_id, c.status, c.cost_impact into cr from public.change_requests c where c.id = new.change_request_id;
    if cr.project_id is distinct from new.project_id then
      raise exception 'That change request belongs to a different project.' using errcode = 'P0001';
    end if;
    if cr.status <> 'approved' then
      raise exception 'Only an approved change request can change the budget baseline.' using errcode = 'P0001';
    end if;
    if prev_version is null then
      raise exception 'The project has no budget baseline to change yet.' using errcode = 'P0001';
    end if;
    if new.total <> prev_total + coalesce(cr.cost_impact, 0) then
      raise exception 'The new baseline must be % (current % plus the change''s cost impact %).',
        prev_total + coalesce(cr.cost_impact, 0), prev_total, coalesce(cr.cost_impact, 0) using errcode = 'P0001';
    end if;
  elsif new.source = 'pmo_adjustment' then
    if uid is not null and not (new.workspace_id = any (private.my_workspace_ids('pmo'))) then
      raise exception 'Only the PMO can adjust a budget baseline directly.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.budget_baseline_guard() from public, anon, authenticated;
create trigger budget_baselines_10_guard before insert on public.budget_baselines
  for each row execute function private.budget_baseline_guard();

-- ---------------------------------------------------------------------------
-- Forecast history capture (security definer: reads every project in the organisation).
-- ---------------------------------------------------------------------------
create function private.capture_forecast_history(p_org uuid, p_month date, p_source public.forecast_capture_source)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.financial_forecast_history
    (project_id, reporting_month, organisation_id, workspace_id, budget, actual_to_date, forecast_remaining, eac, has_baseline, source)
  select f.project_id, p_month, f.organisation_id, f.workspace_id, f.budget, f.actual_to_date, f.forecast_remaining, f.eac,
    f.has_baseline, p_source
  from public.v_project_financials f
  where f.organisation_id = p_org
  on conflict (project_id, reporting_month) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.capture_forecast_history(uuid, date, public.forecast_capture_source) from public, anon, authenticated;
grant execute on function private.capture_forecast_history(uuid, date, public.forecast_capture_source) to service_role;

-- Monthly job: the previous month for every organisation, for projects without a row yet.
create function private.capture_scheduled_forecast_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  total integer := 0;
begin
  for o in select id from public.organisations loop
    total := total + private.capture_forecast_history(
      o.id, (date_trunc('month', private.org_today(o.id)) - interval '1 month')::date, 'scheduled');
  end loop;
  return total;
end;
$$;
revoke all on function private.capture_scheduled_forecast_history() from public, anon, authenticated;
grant execute on function private.capture_scheduled_forecast_history() to service_role;

-- ---------------------------------------------------------------------------
-- Month-end close: in order, never the current or a future month; reopen only the latest
-- closed month, with a reason. Closing captures forecast history for the month.
-- ---------------------------------------------------------------------------
create function private.financial_period_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  closing boolean := new.closed_at is not null and (tg_op = 'INSERT' or old.closed_at is null);
  reopening boolean := tg_op = 'UPDATE' and old.closed_at is not null and new.closed_at is null;
  latest date;
begin
  if tg_op = 'UPDATE' and new.period_month <> old.period_month then
    raise exception 'A financial period''s month can''t change.' using errcode = 'P0001';
  end if;
  select max(fp.period_month) into latest from public.financial_periods fp
  where fp.organisation_id = new.organisation_id and fp.closed_at is not null;
  if closing then
    if new.period_month >= date_trunc('month', private.org_today(new.organisation_id))::date then
      raise exception 'Only a month that has ended can be closed.' using errcode = 'P0001';
    end if;
    if latest is not null and new.period_month <> (latest + interval '1 month')::date then
      raise exception 'Close months in order: the next month to close is %.',
        to_char((latest + interval '1 month')::date, 'FMMonth YYYY') using errcode = 'P0001';
    end if;
    new.closed_at := now();
    new.closed_by := uid;
  elsif reopening then
    if new.period_month <> latest then
      raise exception 'Only the latest closed month (%) can be reopened.', to_char(latest, 'FMMonth YYYY') using errcode = 'P0001';
    end if;
    if btrim(coalesce(new.reopen_reason, '')) = '' then
      raise exception 'Give a reason for reopening the month.' using errcode = 'P0001';
    end if;
    new.reopened_at := now();
    new.reopened_by := uid;
  elsif tg_op = 'INSERT' then
    new.closed_by := null;
  end if;
  return new;
end;
$$;
revoke all on function private.financial_period_guard() from public, anon, authenticated;
create trigger financial_periods_10_guard before insert or update on public.financial_periods
  for each row execute function private.financial_period_guard();

create function private.financial_period_capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.closed_at is not null and (tg_op = 'INSERT' or old.closed_at is null) then
    perform private.capture_forecast_history(new.organisation_id, new.period_month, 'close');
  end if;
  return null;
end;
$$;
revoke all on function private.financial_period_capture() from public, anon, authenticated;
create trigger financial_periods_20_capture after insert or update on public.financial_periods
  for each row execute function private.financial_period_capture();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vpmo-financial-forecast-history', '7 2 1 * *', 'select private.capture_scheduled_forecast_history()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS (array helpers only)
--   read: workspace members (organisation members for financial_periods)
--   cost lines: add and edit by anyone who can edit the project; delete by PMO
--   values: forecast by anyone who can edit the project; budget and actual by PMO
--   baselines: insert by manager or PMO (the guard narrows by source); never updated or deleted
--   periods: organisation PMO; forecast history: written by the system only
--   imports: PMO
-- ---------------------------------------------------------------------------
alter table public.cost_lines enable row level security;
alter table public.financial_values enable row level security;
alter table public.budget_baselines enable row level security;
alter table public.financial_periods enable row level security;
alter table public.financial_forecast_history enable row level security;
alter table public.actuals_imports enable row level security;
alter table public.actuals_import_rows enable row level security;

revoke all on public.cost_lines, public.financial_values, public.budget_baselines, public.financial_periods,
  public.financial_forecast_history, public.actuals_imports, public.actuals_import_rows from anon, authenticated;
grant select, insert, update, delete on public.cost_lines, public.financial_values to authenticated;
grant select, insert on public.budget_baselines, public.actuals_imports, public.actuals_import_rows to authenticated;
grant select, insert, update on public.financial_periods to authenticated;
grant select on public.financial_forecast_history to authenticated;

create policy cost_lines_select on public.cost_lines for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy cost_lines_insert on public.cost_lines for insert to authenticated
  with check (project_id = any ((select private.my_editable_project_ids())::uuid[]));
create policy cost_lines_update on public.cost_lines for update to authenticated
  using (project_id = any ((select private.my_editable_project_ids())::uuid[]))
  with check (project_id = any ((select private.my_editable_project_ids())::uuid[]));
create policy cost_lines_delete on public.cost_lines for delete to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]));

create policy financial_values_select on public.financial_values for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy financial_values_insert on public.financial_values for insert to authenticated
  with check (case kind when 'forecast' then project_id = any ((select private.my_editable_project_ids())::uuid[])
                        else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end);
create policy financial_values_update on public.financial_values for update to authenticated
  using (case kind when 'forecast' then project_id = any ((select private.my_editable_project_ids())::uuid[])
                   else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end)
  with check (case kind when 'forecast' then project_id = any ((select private.my_editable_project_ids())::uuid[])
                        else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end);
create policy financial_values_delete on public.financial_values for delete to authenticated
  using (case kind when 'forecast' then project_id = any ((select private.my_editable_project_ids())::uuid[])
                   else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end);

create policy budget_baselines_select on public.budget_baselines for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy budget_baselines_insert on public.budget_baselines for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[]));

create policy financial_periods_select on public.financial_periods for select to authenticated
  using (organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy financial_periods_insert on public.financial_periods for insert to authenticated
  with check (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[]));
create policy financial_periods_update on public.financial_periods for update to authenticated
  using (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[]))
  with check (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[]));

create policy financial_forecast_history_select on public.financial_forecast_history for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));

create policy actuals_imports_select on public.actuals_imports for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy actuals_imports_insert on public.actuals_imports for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]));
create policy actuals_import_rows_select on public.actuals_import_rows for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy actuals_import_rows_insert on public.actuals_import_rows for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]));

-- ---------------------------------------------------------------------------
-- Views. Per project, each figure is one indexed lookup (lateral), so a single-project
-- query stays cheap and a full list grows linearly. No per-row helper calls in RLS.
-- ---------------------------------------------------------------------------
create view public.v_project_financials with (security_invoker = true) as
select
  p.id as project_id,
  p.organisation_id,
  p.workspace_id,
  p.programme_id,
  coalesce(p.portfolio_id, pr.portfolio_id) as effective_portfolio_id,
  bl.version is not null as has_baseline,
  coalesce(bl.total, 0)::numeric(14,2) as budget,
  bl.version as baseline_version,
  coalesce(v.budget_phased, 0)::numeric(14,2) as budget_phased,
  (coalesce(bl.total, 0) - coalesce(v.budget_phased, 0))::numeric(14,2) as phasing_gap,
  c.actuals_through,
  coalesce(v.actual_to_date, 0)::numeric(14,2) as actual_to_date,
  coalesce(v.actual_open, 0)::numeric(14,2) as actual_open_months,
  coalesce(v.forecast_remaining, 0)::numeric(14,2) as forecast_remaining,
  (coalesce(v.actual_to_date, 0) + coalesce(v.forecast_remaining, 0))::numeric(14,2) as eac,
  (coalesce(bl.total, 0) - coalesce(v.actual_to_date, 0) - coalesce(v.forecast_remaining, 0))::numeric(14,2) as variance,
  case when bl.total > 0
    then round((coalesce(v.actual_to_date, 0) + coalesce(v.forecast_remaining, 0) - bl.total) / bl.total * 100, 1)
  end as variance_percent,
  ov.first_month is not null as open_month_overrun,
  ov.first_month as overrun_month
from public.projects p
left join public.programmes pr on pr.id = p.programme_id
cross join lateral (
  select coalesce(
    (select max(fp.period_month) from public.financial_periods fp
     where fp.organisation_id = p.organisation_id and fp.closed_at is not null),
    (date_trunc('month', private.org_today(p.organisation_id)) - interval '1 month')::date) as actuals_through
) c
left join lateral (
  select b.version, b.total from public.budget_baselines b
  where b.project_id = p.id order by b.version desc limit 1
) bl on true
left join lateral (
  select
    sum(fv.amount) filter (where fv.kind = 'budget') as budget_phased,
    sum(fv.amount) filter (where fv.kind = 'actual' and fv.period_month <= c.actuals_through) as actual_to_date,
    sum(fv.amount) filter (where fv.kind = 'actual' and fv.period_month > c.actuals_through) as actual_open,
    sum(fv.amount) filter (where fv.kind = 'forecast' and fv.period_month > c.actuals_through) as forecast_remaining
  from public.financial_values fv where fv.project_id = p.id
) v on true
left join lateral (
  -- An actual in an open month above that line's forecast for the month: EAC may be understated.
  select min(a.period_month) as first_month
  from public.financial_values a
  left join public.financial_values f
    on f.cost_line_id = a.cost_line_id and f.period_month = a.period_month and f.kind = 'forecast'
  where a.project_id = p.id and a.kind = 'actual' and a.period_month > c.actuals_through
    and a.amount > coalesce(f.amount, 0)
) ov on true
where p.archived_at is null;

-- Programmes and portfolios: sums over their projects; "allocated" is the envelope on the
-- programme or portfolio itself, shown next to what has been baselined.
create view public.v_programme_financials with (security_invoker = true) as
with sums as materialized (
  select f.programme_id, count(*) as project_count, count(*) filter (where f.has_baseline) as baselined_count,
    sum(f.budget) as budget, sum(f.actual_to_date) as actual_to_date, sum(f.actual_open_months) as actual_open_months,
    sum(f.forecast_remaining) as forecast_remaining, sum(f.eac) as eac, bool_or(f.open_month_overrun) as open_month_overrun
  from public.v_project_financials f
  where f.programme_id is not null
  group by f.programme_id
)
select
  pr.id as programme_id,
  pr.organisation_id,
  pr.workspace_id,
  pr.portfolio_id,
  pr.budget as allocated,
  coalesce(s.project_count, 0)::integer as project_count,
  coalesce(s.baselined_count, 0)::integer as baselined_count,
  coalesce(s.budget, 0)::numeric(14,2) as budget,
  coalesce(s.actual_to_date, 0)::numeric(14,2) as actual_to_date,
  coalesce(s.actual_open_months, 0)::numeric(14,2) as actual_open_months,
  coalesce(s.forecast_remaining, 0)::numeric(14,2) as forecast_remaining,
  coalesce(s.eac, 0)::numeric(14,2) as eac,
  (coalesce(s.budget, 0) - coalesce(s.eac, 0))::numeric(14,2) as variance,
  case when s.budget > 0 then round((s.eac - s.budget) / s.budget * 100, 1) end as variance_percent,
  coalesce(s.open_month_overrun, false) as open_month_overrun
from public.programmes pr
left join sums s on s.programme_id = pr.id
where pr.archived_at is null;

create view public.v_portfolio_financials with (security_invoker = true) as
with sums as materialized (
  select f.effective_portfolio_id as portfolio_id, count(*) as project_count, count(*) filter (where f.has_baseline) as baselined_count,
    sum(f.budget) as budget, sum(f.actual_to_date) as actual_to_date, sum(f.actual_open_months) as actual_open_months,
    sum(f.forecast_remaining) as forecast_remaining, sum(f.eac) as eac, bool_or(f.open_month_overrun) as open_month_overrun
  from public.v_project_financials f
  group by f.effective_portfolio_id
)
select
  pf.id as portfolio_id,
  pf.organisation_id,
  pf.workspace_id,
  pf.budget as allocated,
  coalesce(s.project_count, 0)::integer as project_count,
  coalesce(s.baselined_count, 0)::integer as baselined_count,
  coalesce(s.budget, 0)::numeric(14,2) as budget,
  coalesce(s.actual_to_date, 0)::numeric(14,2) as actual_to_date,
  coalesce(s.actual_open_months, 0)::numeric(14,2) as actual_open_months,
  coalesce(s.forecast_remaining, 0)::numeric(14,2) as forecast_remaining,
  coalesce(s.eac, 0)::numeric(14,2) as eac,
  (coalesce(s.budget, 0) - coalesce(s.eac, 0))::numeric(14,2) as variance,
  case when s.budget > 0 then round((s.eac - s.budget) / s.budget * 100, 1) end as variance_percent,
  coalesce(s.open_month_overrun, false) as open_month_overrun
from public.portfolios pf
left join sums s on s.portfolio_id = pf.id
where pf.archived_at is null;

-- v_projects keeps its columns; budget / actual / forecast now come from the financials
-- (latest baseline, actual to date, estimate at completion). has_baseline is new, at the end.
create or replace view public.v_projects with (security_invoker = true) as
select
  p.id, p.organisation_id, p.workspace_id, p.programme_id, p.portfolio_id, p.name, p.code, p.tier, p.state, p.priority,
  p.start_date, p.finish_date, p.baseline_finish_date,
  coalesce(f.budget, 0)::numeric(14,2) as budget,
  coalesce(f.actual_to_date, 0)::numeric(14,2) as actual,
  coalesce(f.eac, 0)::numeric(14,2) as forecast,
  p.business_case, p.benefits_summary, p.task_source, p.health_override, p.health_override_reason, p.closed_reason,
  p.archived_at, p.converted_from_request_id, p.manager_id, p.project_officer_id, p.sponsor_id, p.phase_id,
  p.created_at, p.updated_at, p.created_by,
  coalesce(p.portfolio_id, pr.portfolio_id) as effective_portfolio_id,
  coalesce(ph.phase_index, 0) as phase_index,
  ph.phase_count,
  coalesce(f.has_baseline, false) as has_baseline
from public.projects p
left join public.programmes pr on pr.id = p.programme_id
left join lateral (
  select x.phase_index, x.phase_count
  from (
    select lp.id, (row_number() over (order by lp.sort_order) - 1)::integer as phase_index, count(*) over ()::integer as phase_count
    from public.lifecycle_phases lp where lp.organisation_id = p.organisation_id
  ) x
  where x.id = p.phase_id
) ph on true
left join public.v_project_financials f on f.project_id = p.id
where p.archived_at is null;

-- Financial health: estimate at completion (v_projects.forecast) against the current baseline
-- (v_projects.budget), with the same tolerances; not_set when the project has no baseline.
-- Otherwise identical to health_views_single_pass.
create or replace view public.v_project_health with (security_invoker = true) as
with base as (
  select p.*, o.settings, private.org_today(p.organisation_id) as today,
    s.task_count, s.overdue_count
  from public.v_projects p
  join public.organisations o on o.id = p.organisation_id
  join public.v_project_task_stats s on s.project_id = p.id
),
benefit_flags as materialized (
  select b.id,
    r.benefit_id is not null and (b.confidence = 'low' or coalesce(r.behind_profile, false)) as is_red,
    coalesce(r.measurement_overdue, false) as is_overdue,
    (b.status = 'identified' or not b.eligibility_confirmed) as is_unvalidated
  from public.benefits b
  left join public.v_benefit_realisation r on r.benefit_id = b.id
),
project_benefits as materialized (
  select bp.project_id, count(*) as linked,
    coalesce(bool_or(f.is_red), false) as any_red,
    coalesce(bool_or(f.is_overdue), false) as any_overdue,
    coalesce(bool_or(f.is_unvalidated), false) as any_unvalidated
  from public.benefit_projects bp
  left join benefit_flags f on f.id = bp.benefit_id
  group by bp.project_id
),
dims as materialized (
  select
    base.id,
    case
      when exists (select 1 from public.v_milestones m where m.project_id = base.id and m.status = 'overdue') then 'red'::public.health
      when (base.baseline_finish_date - base.start_date) > 0
        and (base.finish_date - base.baseline_finish_date)::numeric / (base.baseline_finish_date - base.start_date)
            > private.health_threshold(base.settings, 'scheduleSlipPercent') / 100 then 'red'::public.health
      when base.task_count > 0
        and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueAtRiskPercent') / 100 then 'amber'::public.health
      else 'green'::public.health
    end as schedule,
    case
      when not base.has_baseline then 'not_set'::public.health
      when base.forecast > base.budget * (1 + private.health_threshold(base.settings, 'financialOffTrackPercent') / 100) then 'red'::public.health
      when base.forecast > base.budget * (1 + private.health_threshold(base.settings, 'financialAtRiskPercent') / 100) then 'amber'::public.health
      else 'green'::public.health
    end as financial,
    case
      when base.task_count > 0 and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueOffTrackPercent') / 100 then 'red'::public.health
      when base.task_count > 0 and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueAtRiskPercent') / 100 then 'amber'::public.health
      else 'green'::public.health
    end as effort,
    case
      when exists (select 1 from public.issues i where i.project_id = base.id and i.status = 'open' and i.severity = 'high')
        or exists (select 1 from public.risks r where r.project_id = base.id and r.status = 'open'
                   and r.score >= private.health_threshold(base.settings, 'riskScoreOffTrack')) then 'red'::public.health
      when exists (select 1 from public.issues i where i.project_id = base.id and i.status = 'open')
        or exists (select 1 from public.risks r where r.project_id = base.id and r.status = 'open'
                   and r.score >= private.health_threshold(base.settings, 'riskScoreAtRisk')) then 'amber'::public.health
      else 'green'::public.health
    end as issue,
    case
      when coalesce(pb.linked, 0) = 0 then 'not_set'::public.health
      when pb.any_red then 'red'::public.health
      when pb.any_overdue or (base.phase_index >= 2 and pb.any_unvalidated) then 'amber'::public.health
      else 'green'::public.health
    end as benefit
  from base
  left join project_benefits pb on pb.project_id = base.id
)
select
  base.id as project_id,
  base.organisation_id,
  base.workspace_id,
  base.programme_id,
  base.effective_portfolio_id,
  dims.schedule, dims.financial, dims.effort, dims.issue, dims.benefit,
  greatest(dims.schedule, dims.financial, dims.effort, dims.issue, dims.benefit) as computed_overall,
  coalesce(base.health_override, greatest(dims.schedule, dims.financial, dims.effort, dims.issue, dims.benefit)) as overall,
  base.health_override is not null as is_overridden,
  base.finish_date as forecast_finish_date,
  'declared'::text as forecast_basis
from base join dims on dims.id = base.id;

-- ---------------------------------------------------------------------------
-- Data move: each project's budget / actual / forecast becomes
--   * baseline v1 (source migration) = budget, when the budget is above 0;
--   * one line "Migrated balance" (Other, operating) with
--     an actual = actual in the cut-off month, and
--     a forecast = forecast - actual in the month after the cut-off.
-- EAC = actual + (forecast - actual) = forecast, so financial health is unchanged for every
-- project with a budget. Projects with a budget of 0 have no baseline: financial = not_set.
-- ---------------------------------------------------------------------------
insert into public.budget_baselines (project_id, total, source)
select p.id, p.budget, 'migration'
from public.projects p
where p.budget > 0;

insert into public.cost_lines (project_id, name, category_id, spend_type)
select p.id, 'Migrated balance', lv.id, 'operating'
from public.projects p
join public.lookup_values lv on lv.organisation_id = p.organisation_id and lv.list_key = 'cost_category' and lv.value = 'Other'
where p.actual <> 0 or p.forecast <> p.actual;

insert into public.financial_values (cost_line_id, period_month, kind, amount)
select cl.id, m.month, m.kind, m.amount
from public.projects p
join public.cost_lines cl on cl.project_id = p.id and cl.name = 'Migrated balance'
cross join lateral (select private.financial_cutoff(p.organisation_id) as cutoff) c
cross join lateral (values
  (c.cutoff, 'actual'::public.financial_kind, p.actual),
  ((c.cutoff + interval '1 month')::date, 'forecast'::public.financial_kind, p.forecast - p.actual)
) m(month, kind, amount)
where m.amount <> 0;
