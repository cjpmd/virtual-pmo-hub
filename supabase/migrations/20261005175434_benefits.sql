-- Virtual PMO: benefits. Portfolio-scoped, optionally assigned to a programme in the same
-- portfolio (review C); benefit_projects records contribution/attribution.

create table public.benefits (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid not null,
  programme_id uuid,
  title text not null,
  description text,
  type public.benefit_type not null default 'benefit',
  classification public.benefit_classification not null,
  beneficiaries text[] not null default '{}',
  status public.benefit_status not null default 'identified',
  confidence public.confidence not null default 'medium',
  eligibility_confirmed boolean not null default false,
  eligibility_confirmed_date date,
  planned_total_value numeric(14,2) not null default 0,
  dependency_notes text[] not null default '{}',
  owner_id uuid,
  sro_id uuid,
  eligibility_confirmed_by_id uuid,
  category_id uuid not null,
  category_list text not null generated always as ('benefit_category') stored,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id),
  foreign key (programme_id, portfolio_id) references public.programmes (id, portfolio_id) on delete set null (programme_id),
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (sro_id, organisation_id) references public.resources (id, organisation_id) on delete set null (sro_id),
  foreign key (eligibility_confirmed_by_id, organisation_id) references public.resources (id, organisation_id) on delete set null (eligibility_confirmed_by_id),
  foreign key (category_id, organisation_id, category_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, ref),
  unique (id, workspace_id)
);
create index benefits_workspace_idx on public.benefits (workspace_id, organisation_id);
create index benefits_portfolio_idx on public.benefits (portfolio_id, workspace_id);
create index benefits_programme_portfolio_idx on public.benefits (programme_id, portfolio_id);
create index benefits_owner_idx on public.benefits (owner_id, organisation_id);
create index benefits_sro_idx on public.benefits (sro_id, organisation_id);
create index benefits_eligibility_confirmed_by_idx on public.benefits (eligibility_confirmed_by_id, organisation_id);
create index benefits_category_category_list_idx on public.benefits (category_id, organisation_id, category_list);
create index benefits_created_by_idx on public.benefits (created_by);
create trigger benefits_00_tenant_guard before insert or update on public.benefits
  for each row execute function private.tenant_guard('portfolio_id', 'portfolios');
create trigger benefits_ref before insert on public.benefits
  for each row execute function private.assign_ref('BEN', 'organisation');
create trigger benefits_updated_at before update on public.benefits
  for each row execute function private.set_updated_at();
alter table public.benefits enable row level security;
revoke all on public.benefits from anon, authenticated;
grant select, insert, update, delete on public.benefits to authenticated;
create policy benefits_select on public.benefits for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy benefits_insert on public.benefits for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefits_update on public.benefits for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefits_delete on public.benefits for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.benefit_objectives (
  organisation_id uuid not null,
  workspace_id uuid not null,
  benefit_id uuid not null,
  strategic_objective_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (benefit_id, workspace_id) references public.benefits (id, workspace_id) on delete cascade,
  foreign key (strategic_objective_id, workspace_id) references public.strategic_objectives (id, workspace_id) on delete cascade,
  primary key (benefit_id, strategic_objective_id)
);
create index benefit_objectives_workspace_idx on public.benefit_objectives (workspace_id, organisation_id);
create index benefit_objectives_organisation_idx on public.benefit_objectives (organisation_id);
create index benefit_objectives_benefit_idx on public.benefit_objectives (benefit_id, workspace_id);
create index benefit_objectives_strategic_objective_idx on public.benefit_objectives (strategic_objective_id, workspace_id);
create trigger benefit_objectives_00_tenant_guard before insert or update on public.benefit_objectives
  for each row execute function private.tenant_guard('benefit_id', 'benefits');
alter table public.benefit_objectives enable row level security;
revoke all on public.benefit_objectives from anon, authenticated;
grant select, insert, delete on public.benefit_objectives to authenticated;
create policy benefit_objectives_select on public.benefit_objectives for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy benefit_objectives_insert on public.benefit_objectives for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_objectives_delete on public.benefit_objectives for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor'));

create table public.benefit_projects (
  organisation_id uuid not null,
  workspace_id uuid not null,
  benefit_id uuid not null,
  project_id uuid not null,
  attribution_percent numeric(5,2) not null default 100 check (attribution_percent between 0 and 100),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (benefit_id, workspace_id) references public.benefits (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  primary key (benefit_id, project_id)
);
create index benefit_projects_workspace_idx on public.benefit_projects (workspace_id, organisation_id);
create index benefit_projects_organisation_idx on public.benefit_projects (organisation_id);
create index benefit_projects_benefit_idx on public.benefit_projects (benefit_id, workspace_id);
create index benefit_projects_project_idx on public.benefit_projects (project_id, workspace_id);
create trigger benefit_projects_00_tenant_guard before insert or update on public.benefit_projects
  for each row execute function private.tenant_guard('benefit_id', 'benefits');
alter table public.benefit_projects enable row level security;
revoke all on public.benefit_projects from anon, authenticated;
grant select, insert, update, delete on public.benefit_projects to authenticated;
create policy benefit_projects_select on public.benefit_projects for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy benefit_projects_insert on public.benefit_projects for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_projects_update on public.benefit_projects for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_projects_delete on public.benefit_projects for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor'));

create table public.benefit_measures (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  benefit_id uuid not null,
  name text not null,
  unit text,
  measurement_method text,
  data_source text,
  frequency public.measure_frequency not null default 'quarterly',
  data_provider text,
  baseline_value numeric not null default 0,
  baseline_date date,
  next_due_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (benefit_id, workspace_id) references public.benefits (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id)
);
create index benefit_measures_workspace_idx on public.benefit_measures (workspace_id, organisation_id);
create index benefit_measures_organisation_idx on public.benefit_measures (organisation_id);
create index benefit_measures_benefit_idx on public.benefit_measures (benefit_id, workspace_id);
create index benefit_measures_created_by_idx on public.benefit_measures (created_by);
create trigger benefit_measures_00_tenant_guard before insert or update on public.benefit_measures
  for each row execute function private.tenant_guard('benefit_id', 'benefits');
create trigger benefit_measures_updated_at before update on public.benefit_measures
  for each row execute function private.set_updated_at();
alter table public.benefit_measures enable row level security;
revoke all on public.benefit_measures from anon, authenticated;
grant select, insert, update, delete on public.benefit_measures to authenticated;
create policy benefit_measures_select on public.benefit_measures for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy benefit_measures_insert on public.benefit_measures for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_measures_update on public.benefit_measures for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_measures_delete on public.benefit_measures for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.benefit_measure_targets (
  organisation_id uuid not null,
  workspace_id uuid not null,
  measure_id uuid not null,
  value numeric not null,
  period_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (measure_id, workspace_id) references public.benefit_measures (id, workspace_id) on delete cascade,
  foreign key (period_id, organisation_id) references public.benefit_periods (id, organisation_id) on delete restrict,
  primary key (measure_id, period_id)
);
create index benefit_measure_targets_workspace_idx on public.benefit_measure_targets (workspace_id, organisation_id);
create index benefit_measure_targets_organisation_idx on public.benefit_measure_targets (organisation_id);
create index benefit_measure_targets_measure_idx on public.benefit_measure_targets (measure_id, workspace_id);
create index benefit_measure_targets_period_idx on public.benefit_measure_targets (period_id, organisation_id);
create trigger benefit_measure_targets_00_tenant_guard before insert or update on public.benefit_measure_targets
  for each row execute function private.tenant_guard('measure_id', 'benefit_measures');
alter table public.benefit_measure_targets enable row level security;
revoke all on public.benefit_measure_targets from anon, authenticated;
grant select, insert, update, delete on public.benefit_measure_targets to authenticated;
create policy benefit_measure_targets_select on public.benefit_measure_targets for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy benefit_measure_targets_insert on public.benefit_measure_targets for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_measure_targets_update on public.benefit_measure_targets for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_measure_targets_delete on public.benefit_measure_targets for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor'));

create table public.benefit_measurements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  measure_id uuid not null,
  actual_value numeric not null,
  evidence text,
  evidence_path text,
  notes text,
  submitted_date date,
  validated_date date,
  query_note text,
  status public.measurement_status not null default 'submitted',
  submitted_by_id uuid,
  validated_by_id uuid,
  period_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (measure_id, workspace_id) references public.benefit_measures (id, workspace_id) on delete cascade,
  foreign key (submitted_by_id, organisation_id) references public.resources (id, organisation_id) on delete set null (submitted_by_id),
  foreign key (validated_by_id, organisation_id) references public.resources (id, organisation_id) on delete set null (validated_by_id),
  foreign key (period_id, organisation_id) references public.benefit_periods (id, organisation_id) on delete restrict,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index benefit_measurements_workspace_idx on public.benefit_measurements (workspace_id, organisation_id);
create index benefit_measurements_organisation_idx on public.benefit_measurements (organisation_id);
create index benefit_measurements_measure_idx on public.benefit_measurements (measure_id, workspace_id);
create index benefit_measurements_submitted_by_idx on public.benefit_measurements (submitted_by_id, organisation_id);
create index benefit_measurements_validated_by_idx on public.benefit_measurements (validated_by_id, organisation_id);
create index benefit_measurements_period_idx on public.benefit_measurements (period_id, organisation_id);
create index benefit_measurements_created_by_idx on public.benefit_measurements (created_by);
create index benefit_measurements_measure_period_idx on public.benefit_measurements (measure_id, period_id);
create trigger benefit_measurements_00_tenant_guard before insert or update on public.benefit_measurements
  for each row execute function private.tenant_guard('measure_id', 'benefit_measures');
create trigger benefit_measurements_updated_at before update on public.benefit_measurements
  for each row execute function private.set_updated_at();
alter table public.benefit_measurements enable row level security;
revoke all on public.benefit_measurements from anon, authenticated;
grant select, insert, update, delete on public.benefit_measurements to authenticated;
create policy benefit_measurements_select on public.benefit_measurements for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy benefit_measurements_insert on public.benefit_measurements for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_measurements_update on public.benefit_measurements for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_measurements_delete on public.benefit_measurements for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.benefit_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  benefit_id uuid not null,
  review_date date not null,
  type public.benefit_review_type not null default 'scheduled',
  findings text,
  lessons_learned text,
  reviewer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (benefit_id, workspace_id) references public.benefits (id, workspace_id) on delete cascade,
  foreign key (reviewer_id, organisation_id) references public.resources (id, organisation_id) on delete set null (reviewer_id),
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index benefit_reviews_workspace_idx on public.benefit_reviews (workspace_id, organisation_id);
create index benefit_reviews_organisation_idx on public.benefit_reviews (organisation_id);
create index benefit_reviews_benefit_idx on public.benefit_reviews (benefit_id, workspace_id);
create index benefit_reviews_reviewer_idx on public.benefit_reviews (reviewer_id, organisation_id);
create index benefit_reviews_created_by_idx on public.benefit_reviews (created_by);
create trigger benefit_reviews_00_tenant_guard before insert or update on public.benefit_reviews
  for each row execute function private.tenant_guard('benefit_id', 'benefits');
create trigger benefit_reviews_updated_at before update on public.benefit_reviews
  for each row execute function private.set_updated_at();
alter table public.benefit_reviews enable row level security;
revoke all on public.benefit_reviews from anon, authenticated;
grant select, insert, update, delete on public.benefit_reviews to authenticated;
create policy benefit_reviews_select on public.benefit_reviews for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy benefit_reviews_insert on public.benefit_reviews for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_reviews_update on public.benefit_reviews for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_reviews_delete on public.benefit_reviews for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.benefit_handovers (
  organisation_id uuid not null,
  workspace_id uuid not null,
  benefit_id uuid not null,
  bau_service text,
  frequency public.measure_frequency not null default 'quarterly',
  next_review_date date,
  post_implementation_review_date date,
  confirmed_date date,
  bau_owner_id uuid,
  confirmed_by_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (benefit_id, workspace_id) references public.benefits (id, workspace_id) on delete cascade,
  foreign key (bau_owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (bau_owner_id),
  foreign key (confirmed_by_id, organisation_id) references public.resources (id, organisation_id) on delete set null (confirmed_by_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  primary key (benefit_id)
);
create index benefit_handovers_workspace_idx on public.benefit_handovers (workspace_id, organisation_id);
create index benefit_handovers_organisation_idx on public.benefit_handovers (organisation_id);
create index benefit_handovers_benefit_idx on public.benefit_handovers (benefit_id, workspace_id);
create index benefit_handovers_bau_owner_idx on public.benefit_handovers (bau_owner_id, organisation_id);
create index benefit_handovers_confirmed_by_idx on public.benefit_handovers (confirmed_by_id, organisation_id);
create index benefit_handovers_created_by_idx on public.benefit_handovers (created_by);
create trigger benefit_handovers_00_tenant_guard before insert or update on public.benefit_handovers
  for each row execute function private.tenant_guard('benefit_id', 'benefits');
create trigger benefit_handovers_updated_at before update on public.benefit_handovers
  for each row execute function private.set_updated_at();
alter table public.benefit_handovers enable row level security;
revoke all on public.benefit_handovers from anon, authenticated;
grant select, insert, update, delete on public.benefit_handovers to authenticated;
create policy benefit_handovers_select on public.benefit_handovers for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy benefit_handovers_insert on public.benefit_handovers for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_handovers_update on public.benefit_handovers for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_handovers_delete on public.benefit_handovers for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.capabilities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  programme_id uuid not null,
  title text not null,
  description text,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id)
);
create index capabilities_workspace_idx on public.capabilities (workspace_id, organisation_id);
create index capabilities_organisation_idx on public.capabilities (organisation_id);
create index capabilities_programme_idx on public.capabilities (programme_id, workspace_id);
create index capabilities_owner_idx on public.capabilities (owner_id, organisation_id);
create index capabilities_created_by_idx on public.capabilities (created_by);
create trigger capabilities_00_tenant_guard before insert or update on public.capabilities
  for each row execute function private.tenant_guard('programme_id', 'programmes');
create trigger capabilities_updated_at before update on public.capabilities
  for each row execute function private.set_updated_at();
alter table public.capabilities enable row level security;
revoke all on public.capabilities from anon, authenticated;
grant select, insert, update, delete on public.capabilities to authenticated;
create policy capabilities_select on public.capabilities for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy capabilities_insert on public.capabilities for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy capabilities_update on public.capabilities for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy capabilities_delete on public.capabilities for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.capability_projects (
  organisation_id uuid not null,
  workspace_id uuid not null,
  capability_id uuid not null,
  project_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (capability_id, workspace_id) references public.capabilities (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  primary key (capability_id, project_id)
);
create index capability_projects_workspace_idx on public.capability_projects (workspace_id, organisation_id);
create index capability_projects_organisation_idx on public.capability_projects (organisation_id);
create index capability_projects_capability_idx on public.capability_projects (capability_id, workspace_id);
create index capability_projects_project_idx on public.capability_projects (project_id, workspace_id);
create trigger capability_projects_00_tenant_guard before insert or update on public.capability_projects
  for each row execute function private.tenant_guard('capability_id', 'capabilities');
alter table public.capability_projects enable row level security;
revoke all on public.capability_projects from anon, authenticated;
grant select, insert, delete on public.capability_projects to authenticated;
create policy capability_projects_select on public.capability_projects for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy capability_projects_insert on public.capability_projects for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy capability_projects_delete on public.capability_projects for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor'));

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  programme_id uuid not null,
  title text not null,
  description text,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id)
);
create index outcomes_workspace_idx on public.outcomes (workspace_id, organisation_id);
create index outcomes_organisation_idx on public.outcomes (organisation_id);
create index outcomes_programme_idx on public.outcomes (programme_id, workspace_id);
create index outcomes_owner_idx on public.outcomes (owner_id, organisation_id);
create index outcomes_created_by_idx on public.outcomes (created_by);
create trigger outcomes_00_tenant_guard before insert or update on public.outcomes
  for each row execute function private.tenant_guard('programme_id', 'programmes');
create trigger outcomes_updated_at before update on public.outcomes
  for each row execute function private.set_updated_at();
alter table public.outcomes enable row level security;
revoke all on public.outcomes from anon, authenticated;
grant select, insert, update, delete on public.outcomes to authenticated;
create policy outcomes_select on public.outcomes for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy outcomes_insert on public.outcomes for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy outcomes_update on public.outcomes for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy outcomes_delete on public.outcomes for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.outcome_capabilities (
  organisation_id uuid not null,
  workspace_id uuid not null,
  outcome_id uuid not null,
  capability_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (outcome_id, workspace_id) references public.outcomes (id, workspace_id) on delete cascade,
  foreign key (capability_id, workspace_id) references public.capabilities (id, workspace_id) on delete cascade,
  primary key (outcome_id, capability_id)
);
create index outcome_capabilities_workspace_idx on public.outcome_capabilities (workspace_id, organisation_id);
create index outcome_capabilities_organisation_idx on public.outcome_capabilities (organisation_id);
create index outcome_capabilities_outcome_idx on public.outcome_capabilities (outcome_id, workspace_id);
create index outcome_capabilities_capability_idx on public.outcome_capabilities (capability_id, workspace_id);
create trigger outcome_capabilities_00_tenant_guard before insert or update on public.outcome_capabilities
  for each row execute function private.tenant_guard('outcome_id', 'outcomes');
alter table public.outcome_capabilities enable row level security;
revoke all on public.outcome_capabilities from anon, authenticated;
grant select, insert, delete on public.outcome_capabilities to authenticated;
create policy outcome_capabilities_select on public.outcome_capabilities for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy outcome_capabilities_insert on public.outcome_capabilities for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy outcome_capabilities_delete on public.outcome_capabilities for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor'));

create table public.outcome_benefits (
  organisation_id uuid not null,
  workspace_id uuid not null,
  outcome_id uuid not null,
  benefit_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (outcome_id, workspace_id) references public.outcomes (id, workspace_id) on delete cascade,
  foreign key (benefit_id, workspace_id) references public.benefits (id, workspace_id) on delete cascade,
  primary key (outcome_id, benefit_id)
);
create index outcome_benefits_workspace_idx on public.outcome_benefits (workspace_id, organisation_id);
create index outcome_benefits_organisation_idx on public.outcome_benefits (organisation_id);
create index outcome_benefits_outcome_idx on public.outcome_benefits (outcome_id, workspace_id);
create index outcome_benefits_benefit_idx on public.outcome_benefits (benefit_id, workspace_id);
create trigger outcome_benefits_00_tenant_guard before insert or update on public.outcome_benefits
  for each row execute function private.tenant_guard('outcome_id', 'outcomes');
alter table public.outcome_benefits enable row level security;
revoke all on public.outcome_benefits from anon, authenticated;
grant select, insert, delete on public.outcome_benefits to authenticated;
create policy outcome_benefits_select on public.outcome_benefits for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy outcome_benefits_insert on public.outcome_benefits for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy outcome_benefits_delete on public.outcome_benefits for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor'));

create table public.benefit_maps (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  programme_id uuid not null,
  name text not null,
  description text,
  layout jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index benefit_maps_workspace_idx on public.benefit_maps (workspace_id, organisation_id);
create index benefit_maps_organisation_idx on public.benefit_maps (organisation_id);
create index benefit_maps_programme_idx on public.benefit_maps (programme_id, workspace_id);
create index benefit_maps_created_by_idx on public.benefit_maps (created_by);
create trigger benefit_maps_00_tenant_guard before insert or update on public.benefit_maps
  for each row execute function private.tenant_guard('programme_id', 'programmes');
create trigger benefit_maps_updated_at before update on public.benefit_maps
  for each row execute function private.set_updated_at();
alter table public.benefit_maps enable row level security;
revoke all on public.benefit_maps from anon, authenticated;
grant select, insert, update, delete on public.benefit_maps to authenticated;
create policy benefit_maps_select on public.benefit_maps for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy benefit_maps_insert on public.benefit_maps for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_maps_update on public.benefit_maps for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy benefit_maps_delete on public.benefit_maps for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.decision_benefits (
  organisation_id uuid not null,
  workspace_id uuid not null,
  decision_id uuid not null,
  project_id uuid,
  benefit_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (benefit_id, workspace_id) references public.benefits (id, workspace_id) on delete cascade,
  primary key (decision_id, benefit_id)
);
create index decision_benefits_workspace_idx on public.decision_benefits (workspace_id, organisation_id);
create index decision_benefits_organisation_idx on public.decision_benefits (organisation_id);
create index decision_benefits_decision_idx on public.decision_benefits (decision_id, workspace_id);
create index decision_benefits_project_idx on public.decision_benefits (project_id, workspace_id);
create index decision_benefits_benefit_idx on public.decision_benefits (benefit_id, workspace_id);
create trigger decision_benefits_00_tenant_guard before insert or update on public.decision_benefits
  for each row execute function private.tenant_guard('decision_id', 'decisions');
alter table public.decision_benefits enable row level security;
revoke all on public.decision_benefits from anon, authenticated;
grant select, insert, delete on public.decision_benefits to authenticated;
create policy decision_benefits_select on public.decision_benefits for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy decision_benefits_insert on public.decision_benefits for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy decision_benefits_delete on public.decision_benefits for delete to authenticated
  using (private.can_write(workspace_id, project_id));

-- Validating or querying a measurement is a PMO action.
create function private.benefit_measurement_validation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.status in ('validated', 'queried')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and not private.has_workspace_role(new.workspace_id, 'pmo') then
    raise exception 'Only PMO can validate or query a measurement' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger benefit_measurements_10_validation before insert or update on public.benefit_measurements
  for each row execute function private.benefit_measurement_validation();
