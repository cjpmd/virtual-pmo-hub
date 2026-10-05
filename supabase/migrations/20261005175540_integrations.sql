-- Virtual PMO: Microsoft 365 / Planner integration state. Shapes follow data/integrations.ts.
-- No tokens or secrets are stored here; those belong in Vault and edge functions.

create table public.ms_connections (
  organisation_id uuid not null,
  tenant_name text,
  tenant_domain text,
  status public.ms_connection_status not null default 'not_connected',
  connected_by_id uuid references public.profiles (id) on delete set null,
  connected_on date,
  environments text[] not null default '{}',
  admin_request_sent_to text,
  directory_synced_at timestamptz,
  directory_people integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  primary key (organisation_id)
);
create index ms_connections_created_by_idx on public.ms_connections (created_by);
create index ms_connections_connected_by_idx on public.ms_connections (connected_by_id);
create trigger ms_connections_updated_at before update on public.ms_connections
  for each row execute function private.set_updated_at();
alter table public.ms_connections enable row level security;
revoke all on public.ms_connections from anon, authenticated;
grant select, insert, update, delete on public.ms_connections to authenticated;
create policy ms_connections_select on public.ms_connections for select to authenticated
  using (private.is_org_member(organisation_id));
create policy ms_connections_insert on public.ms_connections for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy ms_connections_update on public.ms_connections for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy ms_connections_delete on public.ms_connections for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

create table public.project_plan_links (
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  plan_id text not null,
  kind public.plan_kind not null,
  last_sync_at timestamptz,
  mode public.sync_mode not null default 'polling',
  health public.sync_health not null default 'healthy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null,
  primary key (project_id)
);
create index project_plan_links_workspace_idx on public.project_plan_links (workspace_id, organisation_id);
create index project_plan_links_organisation_idx on public.project_plan_links (organisation_id);
create index project_plan_links_project_idx on public.project_plan_links (project_id, workspace_id);
create index project_plan_links_created_by_idx on public.project_plan_links (created_by);
create trigger project_plan_links_00_tenant_guard before insert or update on public.project_plan_links
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger project_plan_links_updated_at before update on public.project_plan_links
  for each row execute function private.set_updated_at();
alter table public.project_plan_links enable row level security;
revoke all on public.project_plan_links from anon, authenticated;
grant select, insert, update, delete on public.project_plan_links to authenticated;
create policy project_plan_links_select on public.project_plan_links for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy project_plan_links_insert on public.project_plan_links for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy project_plan_links_update on public.project_plan_links for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy project_plan_links_delete on public.project_plan_links for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.sync_outbox (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  change text not null,
  queued_by_id uuid references public.profiles (id) on delete set null,
  queued_at timestamptz not null default now(),
  status public.outbox_status not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index sync_outbox_workspace_idx on public.sync_outbox (workspace_id, organisation_id);
create index sync_outbox_organisation_idx on public.sync_outbox (organisation_id);
create index sync_outbox_project_idx on public.sync_outbox (project_id, workspace_id);
create index sync_outbox_created_by_idx on public.sync_outbox (created_by);
create index sync_outbox_queued_by_idx on public.sync_outbox (queued_by_id);
create trigger sync_outbox_00_tenant_guard before insert or update on public.sync_outbox
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger sync_outbox_updated_at before update on public.sync_outbox
  for each row execute function private.set_updated_at();
alter table public.sync_outbox enable row level security;
revoke all on public.sync_outbox from anon, authenticated;
grant select, insert, update, delete on public.sync_outbox to authenticated;
create policy sync_outbox_select on public.sync_outbox for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy sync_outbox_insert on public.sync_outbox for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy sync_outbox_update on public.sync_outbox for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy sync_outbox_delete on public.sync_outbox for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  task text not null,
  field text not null,
  planner_value text,
  our_value text,
  changed_in_planner_by text,
  occurred_at timestamptz not null default now(),
  resolution public.conflict_resolution,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index sync_conflicts_workspace_idx on public.sync_conflicts (workspace_id, organisation_id);
create index sync_conflicts_organisation_idx on public.sync_conflicts (organisation_id);
create index sync_conflicts_project_idx on public.sync_conflicts (project_id, workspace_id);
create index sync_conflicts_created_by_idx on public.sync_conflicts (created_by);
create trigger sync_conflicts_00_tenant_guard before insert or update on public.sync_conflicts
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger sync_conflicts_updated_at before update on public.sync_conflicts
  for each row execute function private.set_updated_at();
alter table public.sync_conflicts enable row level security;
revoke all on public.sync_conflicts from anon, authenticated;
grant select, insert, update, delete on public.sync_conflicts to authenticated;
create policy sync_conflicts_select on public.sync_conflicts for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy sync_conflicts_insert on public.sync_conflicts for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy sync_conflicts_update on public.sync_conflicts for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy sync_conflicts_delete on public.sync_conflicts for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid,
  kind public.sync_log_kind not null,
  message text not null,
  occurred_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create index sync_log_workspace_idx on public.sync_log (workspace_id, organisation_id);
create index sync_log_organisation_idx on public.sync_log (organisation_id);
create index sync_log_project_idx on public.sync_log (project_id, workspace_id);
create index sync_log_workspace_occurred_at_idx on public.sync_log (workspace_id, occurred_at);
create trigger sync_log_00_tenant_guard before insert or update on public.sync_log
  for each row execute function private.tenant_guard('project_id', 'projects', 'workspace_id', 'workspaces');
alter table public.sync_log enable row level security;
revoke all on public.sync_log from anon, authenticated;
grant select, insert on public.sync_log to authenticated;
create policy sync_log_select on public.sync_log for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy sync_log_insert on public.sync_log for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create trigger ms_connections_00_tenant_guard before update on public.ms_connections
  for each row execute function private.tenant_guard();
