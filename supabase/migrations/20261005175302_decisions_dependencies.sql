-- Virtual PMO: decisions (options, actions, links) and dependencies (giver/receiver ends
-- as explicit nullable columns, never polymorphic type+id).

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid,
  programme_id uuid,
  project_id uuid,
  title text not null,
  context text,
  chosen_option_id uuid,
  rationale text,
  needed_by_date date,
  decision_date date,
  status public.decision_status not null default 'pending',
  impact_scope boolean not null default false,
  impact_scope_note text,
  impact_cost boolean not null default false,
  impact_cost_note text,
  impact_time boolean not null default false,
  impact_time_note text,
  impact_benefits boolean not null default false,
  impact_benefits_note text,
  evidence_link text,
  supersedes_id uuid,
  decision_maker_id uuid,
  forum_id uuid,
  forum_list text not null generated always as ('decision_forum') stored,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id) on delete cascade,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (decision_maker_id, organisation_id) references public.resources (id, organisation_id) on delete set null (decision_maker_id),
  foreign key (forum_id, organisation_id, forum_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, ref),
  unique (id, workspace_id),
  check (num_nonnulls(portfolio_id, programme_id, project_id) = 1),
  check (supersedes_id <> id),
  foreign key (supersedes_id, workspace_id) references public.decisions (id, workspace_id) on delete set null (supersedes_id)
);
create index decisions_workspace_idx on public.decisions (workspace_id, organisation_id);
create index decisions_portfolio_idx on public.decisions (portfolio_id, workspace_id);
create index decisions_programme_idx on public.decisions (programme_id, workspace_id);
create index decisions_project_idx on public.decisions (project_id, workspace_id);
create index decisions_decision_maker_idx on public.decisions (decision_maker_id, organisation_id);
create index decisions_forum_forum_list_idx on public.decisions (forum_id, organisation_id, forum_list);
create index decisions_created_by_idx on public.decisions (created_by);
create index decisions_supersedes_idx on public.decisions (supersedes_id, workspace_id);
create trigger decisions_00_tenant_guard before insert or update on public.decisions
  for each row execute function private.tenant_guard('project_id', 'projects', 'programme_id', 'programmes', 'portfolio_id', 'portfolios');
create trigger decisions_ref before insert on public.decisions
  for each row execute function private.assign_ref('DEC', 'organisation');
create trigger decisions_updated_at before update on public.decisions
  for each row execute function private.set_updated_at();
alter table public.decisions enable row level security;
revoke all on public.decisions from anon, authenticated;
grant select, insert, update, delete on public.decisions to authenticated;
create policy decisions_select on public.decisions for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy decisions_insert on public.decisions for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy decisions_update on public.decisions for update to authenticated
  using (private.can_write(workspace_id, project_id)) with check (private.can_write(workspace_id, project_id));
create policy decisions_delete on public.decisions for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.decision_options (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  decision_id uuid not null,
  project_id uuid,
  title text not null,
  pros text[] not null default '{}',
  cons text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, decision_id)
);
create index decision_options_workspace_idx on public.decision_options (workspace_id, organisation_id);
create index decision_options_organisation_idx on public.decision_options (organisation_id);
create index decision_options_decision_idx on public.decision_options (decision_id, workspace_id);
create index decision_options_project_idx on public.decision_options (project_id, workspace_id);
create index decision_options_created_by_idx on public.decision_options (created_by);
create trigger decision_options_00_tenant_guard before insert or update on public.decision_options
  for each row execute function private.tenant_guard('decision_id', 'decisions');
create trigger decision_options_updated_at before update on public.decision_options
  for each row execute function private.set_updated_at();
alter table public.decision_options enable row level security;
revoke all on public.decision_options from anon, authenticated;
grant select, insert, update, delete on public.decision_options to authenticated;
create policy decision_options_select on public.decision_options for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy decision_options_insert on public.decision_options for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy decision_options_update on public.decision_options for update to authenticated
  using (private.can_write(workspace_id, project_id)) with check (private.can_write(workspace_id, project_id));
create policy decision_options_delete on public.decision_options for delete to authenticated
  using (private.can_write(workspace_id, project_id));

create table public.decision_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  decision_id uuid not null,
  project_id uuid,
  description text not null,
  due_date date,
  status public.action_status not null default 'open',
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index decision_actions_workspace_idx on public.decision_actions (workspace_id, organisation_id);
create index decision_actions_organisation_idx on public.decision_actions (organisation_id);
create index decision_actions_decision_idx on public.decision_actions (decision_id, workspace_id);
create index decision_actions_project_idx on public.decision_actions (project_id, workspace_id);
create index decision_actions_owner_idx on public.decision_actions (owner_id, organisation_id);
create index decision_actions_created_by_idx on public.decision_actions (created_by);
create trigger decision_actions_00_tenant_guard before insert or update on public.decision_actions
  for each row execute function private.tenant_guard('decision_id', 'decisions');
create trigger decision_actions_updated_at before update on public.decision_actions
  for each row execute function private.set_updated_at();
alter table public.decision_actions enable row level security;
revoke all on public.decision_actions from anon, authenticated;
grant select, insert, update, delete on public.decision_actions to authenticated;
create policy decision_actions_select on public.decision_actions for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy decision_actions_insert on public.decision_actions for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy decision_actions_update on public.decision_actions for update to authenticated
  using (private.can_write(workspace_id, project_id)) with check (private.can_write(workspace_id, project_id));
create policy decision_actions_delete on public.decision_actions for delete to authenticated
  using (private.can_write(workspace_id, project_id));

create table public.decision_risks (
  organisation_id uuid not null,
  workspace_id uuid not null,
  decision_id uuid not null,
  project_id uuid,
  risk_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (risk_id, workspace_id) references public.risks (id, workspace_id) on delete cascade,
  primary key (decision_id, risk_id)
);
create index decision_risks_workspace_idx on public.decision_risks (workspace_id, organisation_id);
create index decision_risks_organisation_idx on public.decision_risks (organisation_id);
create index decision_risks_decision_idx on public.decision_risks (decision_id, workspace_id);
create index decision_risks_project_idx on public.decision_risks (project_id, workspace_id);
create index decision_risks_risk_idx on public.decision_risks (risk_id, workspace_id);
create trigger decision_risks_00_tenant_guard before insert or update on public.decision_risks
  for each row execute function private.tenant_guard('decision_id', 'decisions');
alter table public.decision_risks enable row level security;
revoke all on public.decision_risks from anon, authenticated;
grant select, insert, delete on public.decision_risks to authenticated;
create policy decision_risks_select on public.decision_risks for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy decision_risks_insert on public.decision_risks for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy decision_risks_delete on public.decision_risks for delete to authenticated
  using (private.can_write(workspace_id, project_id));

create table public.decision_issues (
  organisation_id uuid not null,
  workspace_id uuid not null,
  decision_id uuid not null,
  project_id uuid,
  issue_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade,
  primary key (decision_id, issue_id)
);
create index decision_issues_workspace_idx on public.decision_issues (workspace_id, organisation_id);
create index decision_issues_organisation_idx on public.decision_issues (organisation_id);
create index decision_issues_decision_idx on public.decision_issues (decision_id, workspace_id);
create index decision_issues_project_idx on public.decision_issues (project_id, workspace_id);
create index decision_issues_issue_idx on public.decision_issues (issue_id, workspace_id);
create trigger decision_issues_00_tenant_guard before insert or update on public.decision_issues
  for each row execute function private.tenant_guard('decision_id', 'decisions');
alter table public.decision_issues enable row level security;
revoke all on public.decision_issues from anon, authenticated;
grant select, insert, delete on public.decision_issues to authenticated;
create policy decision_issues_select on public.decision_issues for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy decision_issues_insert on public.decision_issues for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy decision_issues_delete on public.decision_issues for delete to authenticated
  using (private.can_write(workspace_id, project_id));

create table public.decision_change_requests (
  organisation_id uuid not null,
  workspace_id uuid not null,
  decision_id uuid not null,
  project_id uuid,
  change_request_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (change_request_id, workspace_id) references public.change_requests (id, workspace_id) on delete cascade,
  primary key (decision_id, change_request_id)
);
create index decision_change_requests_workspace_idx on public.decision_change_requests (workspace_id, organisation_id);
create index decision_change_requests_organisation_idx on public.decision_change_requests (organisation_id);
create index decision_change_requests_decision_idx on public.decision_change_requests (decision_id, workspace_id);
create index decision_change_requests_project_idx on public.decision_change_requests (project_id, workspace_id);
create index decision_change_requests_change_request_idx on public.decision_change_requests (change_request_id, workspace_id);
create trigger decision_change_requests_00_tenant_guard before insert or update on public.decision_change_requests
  for each row execute function private.tenant_guard('decision_id', 'decisions');
alter table public.decision_change_requests enable row level security;
revoke all on public.decision_change_requests from anon, authenticated;
grant select, insert, delete on public.decision_change_requests to authenticated;
create policy decision_change_requests_select on public.decision_change_requests for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy decision_change_requests_insert on public.decision_change_requests for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy decision_change_requests_delete on public.decision_change_requests for delete to authenticated
  using (private.can_write(workspace_id, project_id));

create table public.dependencies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  giver_programme_id uuid,
  giver_project_id uuid,
  giver_milestone_id uuid,
  receiver_programme_id uuid,
  receiver_project_id uuid,
  receiver_milestone_id uuid,
  giver_external_name text,
  receiver_external_name text,
  type public.dependency_type not null default 'sequencing',
  description text not null,
  required_by_date date not null,
  criticality public.criticality not null default 'medium',
  validation public.dependency_validation not null default 'proposed',
  giver_accepted boolean not null default false,
  receiver_accepted boolean not null default false,
  health_override public.health,
  health_override_reason text,
  raised_date date not null default current_date,
  giver_owner_id uuid,
  receiver_owner_id uuid,
  raised_by_id uuid,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (giver_programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (giver_project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (giver_milestone_id, workspace_id) references public.milestones (id, workspace_id) on delete cascade,
  foreign key (receiver_programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (receiver_project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (receiver_milestone_id, workspace_id) references public.milestones (id, workspace_id) on delete cascade,
  foreign key (giver_owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (giver_owner_id),
  foreign key (receiver_owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (receiver_owner_id),
  foreign key (raised_by_id, organisation_id) references public.resources (id, organisation_id) on delete set null (raised_by_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, ref),
  unique (id, workspace_id),
  check (num_nonnulls(giver_programme_id, giver_project_id, giver_milestone_id, giver_external_name) = 1),
  check (num_nonnulls(receiver_programme_id, receiver_project_id, receiver_milestone_id, receiver_external_name) = 1),
  check (health_override is null or health_override_reason is not null)
);
create index dependencies_workspace_idx on public.dependencies (workspace_id, organisation_id);
create index dependencies_giver_programme_idx on public.dependencies (giver_programme_id, workspace_id);
create index dependencies_giver_project_idx on public.dependencies (giver_project_id, workspace_id);
create index dependencies_giver_milestone_idx on public.dependencies (giver_milestone_id, workspace_id);
create index dependencies_receiver_programme_idx on public.dependencies (receiver_programme_id, workspace_id);
create index dependencies_receiver_project_idx on public.dependencies (receiver_project_id, workspace_id);
create index dependencies_receiver_milestone_idx on public.dependencies (receiver_milestone_id, workspace_id);
create index dependencies_giver_owner_idx on public.dependencies (giver_owner_id, organisation_id);
create index dependencies_receiver_owner_idx on public.dependencies (receiver_owner_id, organisation_id);
create index dependencies_raised_by_idx on public.dependencies (raised_by_id, organisation_id);
create index dependencies_created_by_idx on public.dependencies (created_by);
create trigger dependencies_00_tenant_guard before insert or update on public.dependencies
  for each row execute function private.tenant_guard('giver_project_id', 'projects', 'giver_programme_id', 'programmes', 'giver_milestone_id', 'milestones', 'receiver_project_id', 'projects', 'receiver_programme_id', 'programmes', 'receiver_milestone_id', 'milestones', 'workspace_id', 'workspaces');
create trigger dependencies_ref before insert on public.dependencies
  for each row execute function private.assign_ref('DEP', 'organisation');
create trigger dependencies_updated_at before update on public.dependencies
  for each row execute function private.set_updated_at();
alter table public.dependencies enable row level security;
revoke all on public.dependencies from anon, authenticated;
grant select, insert, update, delete on public.dependencies to authenticated;
create policy dependencies_select on public.dependencies for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy dependencies_insert on public.dependencies for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy dependencies_update on public.dependencies for update to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor')) with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy dependencies_delete on public.dependencies for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.dependency_risks (
  organisation_id uuid not null,
  workspace_id uuid not null,
  dependency_id uuid not null,
  risk_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (dependency_id, workspace_id) references public.dependencies (id, workspace_id) on delete cascade,
  foreign key (risk_id, workspace_id) references public.risks (id, workspace_id) on delete cascade,
  primary key (dependency_id, risk_id)
);
create index dependency_risks_workspace_idx on public.dependency_risks (workspace_id, organisation_id);
create index dependency_risks_organisation_idx on public.dependency_risks (organisation_id);
create index dependency_risks_dependency_idx on public.dependency_risks (dependency_id, workspace_id);
create index dependency_risks_risk_idx on public.dependency_risks (risk_id, workspace_id);
create trigger dependency_risks_00_tenant_guard before insert or update on public.dependency_risks
  for each row execute function private.tenant_guard('dependency_id', 'dependencies');
alter table public.dependency_risks enable row level security;
revoke all on public.dependency_risks from anon, authenticated;
grant select, insert, delete on public.dependency_risks to authenticated;
create policy dependency_risks_select on public.dependency_risks for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy dependency_risks_insert on public.dependency_risks for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy dependency_risks_delete on public.dependency_risks for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor'));

create table public.dependency_issues (
  organisation_id uuid not null,
  workspace_id uuid not null,
  dependency_id uuid not null,
  issue_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (dependency_id, workspace_id) references public.dependencies (id, workspace_id) on delete cascade,
  foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete cascade,
  primary key (dependency_id, issue_id)
);
create index dependency_issues_workspace_idx on public.dependency_issues (workspace_id, organisation_id);
create index dependency_issues_organisation_idx on public.dependency_issues (organisation_id);
create index dependency_issues_dependency_idx on public.dependency_issues (dependency_id, workspace_id);
create index dependency_issues_issue_idx on public.dependency_issues (issue_id, workspace_id);
create trigger dependency_issues_00_tenant_guard before insert or update on public.dependency_issues
  for each row execute function private.tenant_guard('dependency_id', 'dependencies');
alter table public.dependency_issues enable row level security;
revoke all on public.dependency_issues from anon, authenticated;
grant select, insert, delete on public.dependency_issues to authenticated;
create policy dependency_issues_select on public.dependency_issues for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy dependency_issues_insert on public.dependency_issues for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'contributor'));
create policy dependency_issues_delete on public.dependency_issues for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'contributor'));

create table public.decision_dependencies (
  organisation_id uuid not null,
  workspace_id uuid not null,
  decision_id uuid not null,
  project_id uuid,
  dependency_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (dependency_id, workspace_id) references public.dependencies (id, workspace_id) on delete cascade,
  primary key (decision_id, dependency_id)
);
create index decision_dependencies_workspace_idx on public.decision_dependencies (workspace_id, organisation_id);
create index decision_dependencies_organisation_idx on public.decision_dependencies (organisation_id);
create index decision_dependencies_decision_idx on public.decision_dependencies (decision_id, workspace_id);
create index decision_dependencies_project_idx on public.decision_dependencies (project_id, workspace_id);
create index decision_dependencies_dependency_idx on public.decision_dependencies (dependency_id, workspace_id);
create trigger decision_dependencies_00_tenant_guard before insert or update on public.decision_dependencies
  for each row execute function private.tenant_guard('decision_id', 'decisions');
alter table public.decision_dependencies enable row level security;
revoke all on public.decision_dependencies from anon, authenticated;
grant select, insert, delete on public.decision_dependencies to authenticated;
create policy decision_dependencies_select on public.decision_dependencies for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy decision_dependencies_insert on public.decision_dependencies for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy decision_dependencies_delete on public.decision_dependencies for delete to authenticated
  using (private.can_write(workspace_id, project_id));

alter table public.decisions
  add constraint decisions_chosen_option_fkey foreign key (chosen_option_id, id)
  references public.decision_options (id, decision_id) on delete set null (chosen_option_id);
create index decisions_chosen_option_idx on public.decisions (chosen_option_id, id);
