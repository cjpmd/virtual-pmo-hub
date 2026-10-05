-- Virtual PMO: project requests (with draft benefit profiles) and roadmaps.

create table public.project_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid not null,
  title text not null,
  status public.request_status not null default 'new',
  estimated_cost numeric(14,2) not null default 0,
  estimated_benefit numeric(14,2) not null default 0,
  priority public.priority not null default 'moderate',
  alignment smallint check (alignment between 0 and 100),
  themes text[] not null default '{}',
  whole_life_cost numeric(14,2),
  appraisal_years smallint check (appraisal_years > 0),
  requester_id uuid,
  sponsor_id uuid,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id),
  foreign key (requester_id, organisation_id) references public.resources (id, organisation_id) on delete set null (requester_id),
  foreign key (sponsor_id, organisation_id) references public.resources (id, organisation_id) on delete set null (sponsor_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, ref),
  unique (id, workspace_id)
);
create index project_requests_workspace_idx on public.project_requests (workspace_id, organisation_id);
create index project_requests_portfolio_idx on public.project_requests (portfolio_id, workspace_id);
create index project_requests_requester_idx on public.project_requests (requester_id, organisation_id);
create index project_requests_sponsor_idx on public.project_requests (sponsor_id, organisation_id);
create index project_requests_created_by_idx on public.project_requests (created_by);
create trigger project_requests_00_tenant_guard before insert or update on public.project_requests
  for each row execute function private.tenant_guard('portfolio_id', 'portfolios');
create trigger project_requests_ref before insert on public.project_requests
  for each row execute function private.assign_ref('REQ', 'organisation');
create trigger project_requests_updated_at before update on public.project_requests
  for each row execute function private.set_updated_at();
alter table public.project_requests enable row level security;
revoke all on public.project_requests from anon, authenticated;
grant select, insert, update, delete on public.project_requests to authenticated;
create policy project_requests_select on public.project_requests for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy project_requests_insert on public.project_requests for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'manager'));
create policy project_requests_update on public.project_requests for update to authenticated
  using (private.has_workspace_role(workspace_id, 'manager')) with check (private.has_workspace_role(workspace_id, 'manager'));
create policy project_requests_delete on public.project_requests for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.request_benefit_drafts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  request_id uuid not null,
  title text not null,
  classification public.benefit_classification not null,
  measure text,
  baseline text,
  target text,
  annual_value numeric(14,2) not null default 0,
  years_counted smallint not null default 5,
  sort_order integer not null default 0,
  owner_id uuid,
  strategic_objective_id uuid,
  category_id uuid not null,
  category_list text not null generated always as ('benefit_category') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (request_id, workspace_id) references public.project_requests (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (strategic_objective_id, workspace_id) references public.strategic_objectives (id, workspace_id) on delete set null (strategic_objective_id),
  foreign key (category_id, organisation_id, category_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index request_benefit_drafts_workspace_idx on public.request_benefit_drafts (workspace_id, organisation_id);
create index request_benefit_drafts_organisation_idx on public.request_benefit_drafts (organisation_id);
create index request_benefit_drafts_request_idx on public.request_benefit_drafts (request_id, workspace_id);
create index request_benefit_drafts_owner_idx on public.request_benefit_drafts (owner_id, organisation_id);
create index request_benefit_drafts_strategic_objective_idx on public.request_benefit_drafts (strategic_objective_id, workspace_id);
create index request_benefit_drafts_category_category_list_idx on public.request_benefit_drafts (category_id, organisation_id, category_list);
create index request_benefit_drafts_created_by_idx on public.request_benefit_drafts (created_by);
create trigger request_benefit_drafts_00_tenant_guard before insert or update on public.request_benefit_drafts
  for each row execute function private.tenant_guard('request_id', 'project_requests');
create trigger request_benefit_drafts_updated_at before update on public.request_benefit_drafts
  for each row execute function private.set_updated_at();
alter table public.request_benefit_drafts enable row level security;
revoke all on public.request_benefit_drafts from anon, authenticated;
grant select, insert, update, delete on public.request_benefit_drafts to authenticated;
create policy request_benefit_drafts_select on public.request_benefit_drafts for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy request_benefit_drafts_insert on public.request_benefit_drafts for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'manager'));
create policy request_benefit_drafts_update on public.request_benefit_drafts for update to authenticated
  using (private.has_workspace_role(workspace_id, 'manager')) with check (private.has_workspace_role(workspace_id, 'manager'));
create policy request_benefit_drafts_delete on public.request_benefit_drafts for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid,
  name text not null,
  description text,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id),
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id)
);
create index roadmaps_workspace_idx on public.roadmaps (workspace_id, organisation_id);
create index roadmaps_organisation_idx on public.roadmaps (organisation_id);
create index roadmaps_portfolio_idx on public.roadmaps (portfolio_id, workspace_id);
create index roadmaps_owner_idx on public.roadmaps (owner_id, organisation_id);
create index roadmaps_created_by_idx on public.roadmaps (created_by);
create trigger roadmaps_00_tenant_guard before insert or update on public.roadmaps
  for each row execute function private.tenant_guard('portfolio_id', 'portfolios', 'workspace_id', 'workspaces');
create trigger roadmaps_updated_at before update on public.roadmaps
  for each row execute function private.set_updated_at();
alter table public.roadmaps enable row level security;
revoke all on public.roadmaps from anon, authenticated;
grant select, insert, update, delete on public.roadmaps to authenticated;
create policy roadmaps_select on public.roadmaps for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy roadmaps_insert on public.roadmaps for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmaps_update on public.roadmaps for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmaps_delete on public.roadmaps for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.roadmap_rows (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  roadmap_id uuid not null,
  programme_id uuid,
  collection_id uuid,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (roadmap_id, workspace_id) references public.roadmaps (id, workspace_id) on delete cascade,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete set null (programme_id),
  foreign key (collection_id, workspace_id) references public.collections (id, workspace_id) on delete set null (collection_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, roadmap_id)
);
create index roadmap_rows_workspace_idx on public.roadmap_rows (workspace_id, organisation_id);
create index roadmap_rows_organisation_idx on public.roadmap_rows (organisation_id);
create index roadmap_rows_roadmap_idx on public.roadmap_rows (roadmap_id, workspace_id);
create index roadmap_rows_programme_idx on public.roadmap_rows (programme_id, workspace_id);
create index roadmap_rows_collection_idx on public.roadmap_rows (collection_id, workspace_id);
create index roadmap_rows_created_by_idx on public.roadmap_rows (created_by);
create trigger roadmap_rows_00_tenant_guard before insert or update on public.roadmap_rows
  for each row execute function private.tenant_guard('roadmap_id', 'roadmaps');
create trigger roadmap_rows_updated_at before update on public.roadmap_rows
  for each row execute function private.set_updated_at();
alter table public.roadmap_rows enable row level security;
revoke all on public.roadmap_rows from anon, authenticated;
grant select, insert, update, delete on public.roadmap_rows to authenticated;
create policy roadmap_rows_select on public.roadmap_rows for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy roadmap_rows_insert on public.roadmap_rows for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmap_rows_update on public.roadmap_rows for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmap_rows_delete on public.roadmap_rows for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  roadmap_id uuid not null,
  row_id uuid not null,
  project_id uuid,
  title text,
  start_date date,
  finish_date date,
  progress smallint check (progress between 0 and 100),
  health public.health,
  priority public.priority,
  sort_order integer not null default 0,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (roadmap_id, workspace_id) references public.roadmaps (id, workspace_id) on delete cascade,
  foreign key (row_id, roadmap_id) references public.roadmap_rows (id, roadmap_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id),
  check ((project_id is not null and title is null and start_date is null and finish_date is null and progress is null and health is null and owner_id is null and priority is null) or (project_id is null and title is not null)),
  check (finish_date is null or start_date is null or finish_date >= start_date)
);
create index roadmap_items_workspace_idx on public.roadmap_items (workspace_id, organisation_id);
create index roadmap_items_organisation_idx on public.roadmap_items (organisation_id);
create index roadmap_items_roadmap_idx on public.roadmap_items (roadmap_id, workspace_id);
create index roadmap_items_row_roadmap_idx on public.roadmap_items (row_id, roadmap_id);
create index roadmap_items_project_idx on public.roadmap_items (project_id, workspace_id);
create index roadmap_items_owner_idx on public.roadmap_items (owner_id, organisation_id);
create index roadmap_items_created_by_idx on public.roadmap_items (created_by);
create trigger roadmap_items_00_tenant_guard before insert or update on public.roadmap_items
  for each row execute function private.tenant_guard('roadmap_id', 'roadmaps');
create trigger roadmap_items_updated_at before update on public.roadmap_items
  for each row execute function private.set_updated_at();
alter table public.roadmap_items enable row level security;
revoke all on public.roadmap_items from anon, authenticated;
grant select, insert, update, delete on public.roadmap_items to authenticated;
create policy roadmap_items_select on public.roadmap_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy roadmap_items_insert on public.roadmap_items for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmap_items_update on public.roadmap_items for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmap_items_delete on public.roadmap_items for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.roadmap_item_collections (
  organisation_id uuid not null,
  workspace_id uuid not null,
  roadmap_item_id uuid not null,
  collection_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (roadmap_item_id, workspace_id) references public.roadmap_items (id, workspace_id) on delete cascade,
  foreign key (collection_id, workspace_id) references public.collections (id, workspace_id) on delete cascade,
  primary key (roadmap_item_id, collection_id)
);
create index roadmap_item_collections_workspace_idx on public.roadmap_item_collections (workspace_id, organisation_id);
create index roadmap_item_collections_organisation_idx on public.roadmap_item_collections (organisation_id);
create index roadmap_item_collections_roadmap_item_idx on public.roadmap_item_collections (roadmap_item_id, workspace_id);
create index roadmap_item_collections_collection_idx on public.roadmap_item_collections (collection_id, workspace_id);
create trigger roadmap_item_collections_00_tenant_guard before insert or update on public.roadmap_item_collections
  for each row execute function private.tenant_guard('roadmap_item_id', 'roadmap_items');
alter table public.roadmap_item_collections enable row level security;
revoke all on public.roadmap_item_collections from anon, authenticated;
grant select, insert, update, delete on public.roadmap_item_collections to authenticated;
create policy roadmap_item_collections_select on public.roadmap_item_collections for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy roadmap_item_collections_insert on public.roadmap_item_collections for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmap_item_collections_update on public.roadmap_item_collections for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmap_item_collections_delete on public.roadmap_item_collections for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.roadmap_key_dates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  roadmap_id uuid not null,
  title text not null,
  date date not null,
  milestone_id uuid,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (roadmap_id, workspace_id) references public.roadmaps (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index roadmap_key_dates_workspace_idx on public.roadmap_key_dates (workspace_id, organisation_id);
create index roadmap_key_dates_organisation_idx on public.roadmap_key_dates (organisation_id);
create index roadmap_key_dates_roadmap_idx on public.roadmap_key_dates (roadmap_id, workspace_id);
create index roadmap_key_dates_owner_idx on public.roadmap_key_dates (owner_id, organisation_id);
create index roadmap_key_dates_created_by_idx on public.roadmap_key_dates (created_by);
create trigger roadmap_key_dates_00_tenant_guard before insert or update on public.roadmap_key_dates
  for each row execute function private.tenant_guard('roadmap_id', 'roadmaps');
create trigger roadmap_key_dates_updated_at before update on public.roadmap_key_dates
  for each row execute function private.set_updated_at();
alter table public.roadmap_key_dates enable row level security;
revoke all on public.roadmap_key_dates from anon, authenticated;
grant select, insert, update, delete on public.roadmap_key_dates to authenticated;
create policy roadmap_key_dates_select on public.roadmap_key_dates for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy roadmap_key_dates_insert on public.roadmap_key_dates for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmap_key_dates_update on public.roadmap_key_dates for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy roadmap_key_dates_delete on public.roadmap_key_dates for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

alter table public.projects
  add constraint projects_converted_from_request_fkey foreign key (converted_from_request_id, workspace_id)
  references public.project_requests (id, workspace_id) on delete set null (converted_from_request_id);
create index projects_converted_from_request_idx on public.projects (converted_from_request_id, workspace_id);
