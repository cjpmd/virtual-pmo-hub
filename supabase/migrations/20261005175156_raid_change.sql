-- Virtual PMO: risks, issues, assumptions and change requests. Each sits at exactly one of
-- portfolio, programme or project level.

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid,
  programme_id uuid,
  project_id uuid,
  title text not null,
  description text,
  probability smallint not null check (probability between 1 and 5),
  impact smallint not null check (impact between 1 and 5),
  score smallint generated always as (probability * impact) stored,
  response public.risk_response not null default 'reduce',
  status public.open_closed not null default 'open',
  review_date date,
  closed_at timestamptz,
  owner_id uuid,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id) on delete cascade,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, ref),
  unique (id, workspace_id),
  check (num_nonnulls(portfolio_id, programme_id, project_id) = 1)
);
create index risks_workspace_idx on public.risks (workspace_id, organisation_id);
create index risks_portfolio_idx on public.risks (portfolio_id, workspace_id);
create index risks_programme_idx on public.risks (programme_id, workspace_id);
create index risks_project_idx on public.risks (project_id, workspace_id);
create index risks_owner_idx on public.risks (owner_id, organisation_id);
create index risks_created_by_idx on public.risks (created_by);
create trigger risks_00_tenant_guard before insert or update on public.risks
  for each row execute function private.tenant_guard('project_id', 'projects', 'programme_id', 'programmes', 'portfolio_id', 'portfolios');
create trigger risks_ref before insert on public.risks
  for each row execute function private.assign_ref('RSK', 'organisation');
create trigger risks_updated_at before update on public.risks
  for each row execute function private.set_updated_at();
alter table public.risks enable row level security;
revoke all on public.risks from anon, authenticated;
grant select, insert, update, delete on public.risks to authenticated;
create policy risks_select on public.risks for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy risks_insert on public.risks for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy risks_update on public.risks for update to authenticated
  using (private.can_write(workspace_id, project_id)) with check (private.can_write(workspace_id, project_id));
create policy risks_delete on public.risks for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid,
  programme_id uuid,
  project_id uuid,
  title text not null,
  description text,
  severity public.issue_severity not null default 'medium',
  status public.open_closed not null default 'open',
  due_date date,
  closed_at timestamptz,
  owner_id uuid,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id) on delete cascade,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, ref),
  unique (id, workspace_id),
  check (num_nonnulls(portfolio_id, programme_id, project_id) = 1)
);
create index issues_workspace_idx on public.issues (workspace_id, organisation_id);
create index issues_portfolio_idx on public.issues (portfolio_id, workspace_id);
create index issues_programme_idx on public.issues (programme_id, workspace_id);
create index issues_project_idx on public.issues (project_id, workspace_id);
create index issues_owner_idx on public.issues (owner_id, organisation_id);
create index issues_created_by_idx on public.issues (created_by);
create trigger issues_00_tenant_guard before insert or update on public.issues
  for each row execute function private.tenant_guard('project_id', 'projects', 'programme_id', 'programmes', 'portfolio_id', 'portfolios');
create trigger issues_ref before insert on public.issues
  for each row execute function private.assign_ref('ISS', 'organisation');
create trigger issues_updated_at before update on public.issues
  for each row execute function private.set_updated_at();
alter table public.issues enable row level security;
revoke all on public.issues from anon, authenticated;
grant select, insert, update, delete on public.issues to authenticated;
create policy issues_select on public.issues for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy issues_insert on public.issues for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy issues_update on public.issues for update to authenticated
  using (private.can_write(workspace_id, project_id)) with check (private.can_write(workspace_id, project_id));
create policy issues_delete on public.issues for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.assumptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid,
  programme_id uuid,
  project_id uuid,
  assumption text not null,
  rationale text,
  validation_date date,
  status public.assumption_status not null default 'open',
  notes text,
  owner_id uuid,
  raised_issue_id uuid,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id) on delete cascade,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (raised_issue_id, workspace_id) references public.issues (id, workspace_id) on delete set null (raised_issue_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, ref),
  check (num_nonnulls(portfolio_id, programme_id, project_id) = 1)
);
create index assumptions_workspace_idx on public.assumptions (workspace_id, organisation_id);
create index assumptions_portfolio_idx on public.assumptions (portfolio_id, workspace_id);
create index assumptions_programme_idx on public.assumptions (programme_id, workspace_id);
create index assumptions_project_idx on public.assumptions (project_id, workspace_id);
create index assumptions_owner_idx on public.assumptions (owner_id, organisation_id);
create index assumptions_raised_issue_idx on public.assumptions (raised_issue_id, workspace_id);
create index assumptions_created_by_idx on public.assumptions (created_by);
create trigger assumptions_00_tenant_guard before insert or update on public.assumptions
  for each row execute function private.tenant_guard('project_id', 'projects', 'programme_id', 'programmes', 'portfolio_id', 'portfolios');
create trigger assumptions_ref before insert on public.assumptions
  for each row execute function private.assign_ref('ASM', 'organisation');
create trigger assumptions_updated_at before update on public.assumptions
  for each row execute function private.set_updated_at();
alter table public.assumptions enable row level security;
revoke all on public.assumptions from anon, authenticated;
grant select, insert, update, delete on public.assumptions to authenticated;
create policy assumptions_select on public.assumptions for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy assumptions_insert on public.assumptions for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy assumptions_update on public.assumptions for update to authenticated
  using (private.can_write(workspace_id, project_id)) with check (private.can_write(workspace_id, project_id));
create policy assumptions_delete on public.assumptions for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid,
  programme_id uuid,
  project_id uuid,
  title text not null,
  cost_impact numeric(14,2) not null default 0,
  schedule_impact_days integer not null default 0,
  status public.change_status not null default 'proposed',
  requested_by_id uuid,
  type_id uuid not null,
  type_list text not null generated always as ('change_type') stored,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id) on delete cascade,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (requested_by_id, organisation_id) references public.resources (id, organisation_id) on delete set null (requested_by_id),
  foreign key (type_id, organisation_id, type_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id),
  check (num_nonnulls(portfolio_id, programme_id, project_id) = 1)
);
create unique index change_requests_project_ref_idx on public.change_requests (project_id, ref) where project_id is not null;
create unique index change_requests_org_ref_idx on public.change_requests (organisation_id, ref) where project_id is null;
create index change_requests_organisation_idx on public.change_requests (organisation_id);
create index change_requests_workspace_idx on public.change_requests (workspace_id, organisation_id);
create index change_requests_portfolio_idx on public.change_requests (portfolio_id, workspace_id);
create index change_requests_programme_idx on public.change_requests (programme_id, workspace_id);
create index change_requests_project_idx on public.change_requests (project_id, workspace_id);
create index change_requests_requested_by_idx on public.change_requests (requested_by_id, organisation_id);
create index change_requests_type_type_list_idx on public.change_requests (type_id, organisation_id, type_list);
create index change_requests_created_by_idx on public.change_requests (created_by);
create trigger change_requests_00_tenant_guard before insert or update on public.change_requests
  for each row execute function private.tenant_guard('project_id', 'projects', 'programme_id', 'programmes', 'portfolio_id', 'portfolios');
create trigger change_requests_ref before insert on public.change_requests
  for each row execute function private.assign_ref('CR', 'project_or_organisation');
create trigger change_requests_updated_at before update on public.change_requests
  for each row execute function private.set_updated_at();
alter table public.change_requests enable row level security;
revoke all on public.change_requests from anon, authenticated;
grant select, insert, update, delete on public.change_requests to authenticated;
create policy change_requests_select on public.change_requests for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy change_requests_insert on public.change_requests for insert to authenticated
  with check (private.can_write(workspace_id, project_id));
create policy change_requests_update on public.change_requests for update to authenticated
  using (private.can_write(workspace_id, project_id)) with check (private.can_write(workspace_id, project_id));
create policy change_requests_delete on public.change_requests for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));
