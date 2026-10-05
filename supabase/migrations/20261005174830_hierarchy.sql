-- Virtual PMO: hierarchy. workspaces -> portfolios -> programmes (optional) -> projects.
-- No client deletes (review B): archive with archived_at, or close with state.

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  name text not null,
  description text,
  budget numeric(14,2) not null default 0,
  state public.entity_state not null default 'active',
  closed_reason text,
  health_override public.health,
  health_override_reason text,
  archived_at timestamptz,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id),
  check (health_override is null or health_override_reason is not null)
);
create index portfolios_workspace_idx on public.portfolios (workspace_id, organisation_id);
create index portfolios_organisation_idx on public.portfolios (organisation_id);
create index portfolios_owner_idx on public.portfolios (owner_id, organisation_id);
create index portfolios_created_by_idx on public.portfolios (created_by);
create trigger portfolios_00_tenant_guard before insert or update on public.portfolios
  for each row execute function private.tenant_guard('workspace_id', 'workspaces');
create trigger portfolios_updated_at before update on public.portfolios
  for each row execute function private.set_updated_at();
alter table public.portfolios enable row level security;
revoke all on public.portfolios from anon, authenticated;
grant select, insert, update on public.portfolios to authenticated;
create policy portfolios_select on public.portfolios for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy portfolios_insert on public.portfolios for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy portfolios_update on public.portfolios for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid not null,
  name text not null,
  description text,
  start_date date,
  finish_date date,
  budget numeric(14,2) not null default 0,
  value_statement text,
  state public.entity_state not null default 'active',
  closed_reason text,
  health_override public.health,
  health_override_reason text,
  archived_at timestamptz,
  manager_id uuid,
  project_manager_id uuid,
  project_officer_id uuid,
  sponsor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id),
  foreign key (manager_id, organisation_id) references public.resources (id, organisation_id) on delete set null (manager_id),
  foreign key (project_manager_id, organisation_id) references public.resources (id, organisation_id) on delete set null (project_manager_id),
  foreign key (project_officer_id, organisation_id) references public.resources (id, organisation_id) on delete set null (project_officer_id),
  foreign key (sponsor_id, organisation_id) references public.resources (id, organisation_id) on delete set null (sponsor_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id),
  unique (id, portfolio_id),
  check (finish_date is null or start_date is null or finish_date >= start_date),
  check (health_override is null or health_override_reason is not null)
);
create index programmes_workspace_idx on public.programmes (workspace_id, organisation_id);
create index programmes_organisation_idx on public.programmes (organisation_id);
create index programmes_portfolio_idx on public.programmes (portfolio_id, workspace_id);
create index programmes_manager_idx on public.programmes (manager_id, organisation_id);
create index programmes_project_manager_idx on public.programmes (project_manager_id, organisation_id);
create index programmes_project_officer_idx on public.programmes (project_officer_id, organisation_id);
create index programmes_sponsor_idx on public.programmes (sponsor_id, organisation_id);
create index programmes_created_by_idx on public.programmes (created_by);
create trigger programmes_00_tenant_guard before insert or update on public.programmes
  for each row execute function private.tenant_guard('portfolio_id', 'portfolios');
create trigger programmes_updated_at before update on public.programmes
  for each row execute function private.set_updated_at();
alter table public.programmes enable row level security;
revoke all on public.programmes from anon, authenticated;
grant select, insert, update on public.programmes to authenticated;
create policy programmes_select on public.programmes for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy programmes_insert on public.programmes for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'manager'));
create policy programmes_update on public.programmes for update to authenticated
  using (private.has_workspace_role(workspace_id, 'manager')) with check (private.has_workspace_role(workspace_id, 'manager'));

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  programme_id uuid,
  portfolio_id uuid,
  name text not null,
  code text not null check (code ~ '^[A-Z0-9]{2,10}$'),
  tier public.project_tier not null default 'medium',
  state public.project_state not null default 'proposed',
  priority public.priority not null default 'moderate',
  start_date date,
  finish_date date,
  baseline_finish_date date,
  budget numeric(14,2) not null default 0,
  actual numeric(14,2) not null default 0,
  forecast numeric(14,2) not null default 0,
  business_case text,
  benefits_summary text,
  task_source public.task_source not null default 'native',
  health_override public.health,
  health_override_reason text,
  closed_reason text,
  archived_at timestamptz,
  converted_from_request_id uuid,
  manager_id uuid,
  project_officer_id uuid,
  sponsor_id uuid,
  phase_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id),
  foreign key (manager_id, organisation_id) references public.resources (id, organisation_id) on delete set null (manager_id),
  foreign key (project_officer_id, organisation_id) references public.resources (id, organisation_id) on delete set null (project_officer_id),
  foreign key (sponsor_id, organisation_id) references public.resources (id, organisation_id) on delete set null (sponsor_id),
  foreign key (phase_id, organisation_id) references public.lifecycle_phases (id, organisation_id) on delete set null (phase_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id),
  unique (organisation_id, code),
  check (num_nonnulls(programme_id, portfolio_id) = 1),
  check (finish_date is null or start_date is null or finish_date >= start_date),
  check (health_override is null or health_override_reason is not null)
);
create index projects_workspace_idx on public.projects (workspace_id, organisation_id);
create index projects_programme_idx on public.projects (programme_id, workspace_id);
create index projects_portfolio_idx on public.projects (portfolio_id, workspace_id);
create index projects_manager_idx on public.projects (manager_id, organisation_id);
create index projects_project_officer_idx on public.projects (project_officer_id, organisation_id);
create index projects_sponsor_idx on public.projects (sponsor_id, organisation_id);
create index projects_phase_idx on public.projects (phase_id, organisation_id);
create index projects_created_by_idx on public.projects (created_by);
create trigger projects_00_tenant_guard before insert or update on public.projects
  for each row execute function private.tenant_guard('programme_id', 'programmes', 'portfolio_id', 'portfolios');
create trigger projects_updated_at before update on public.projects
  for each row execute function private.set_updated_at();
alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;
grant select, insert, update on public.projects to authenticated;
create policy projects_select on public.projects for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy projects_insert on public.projects for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'manager'));
create policy projects_update on public.projects for update to authenticated
  using (private.has_workspace_role(workspace_id, 'manager')) with check (private.has_workspace_role(workspace_id, 'manager'));

create table public.strategic_objectives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  portfolio_id uuid not null,
  title text not null,
  description text,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id)
);
create index strategic_objectives_workspace_idx on public.strategic_objectives (workspace_id, organisation_id);
create index strategic_objectives_organisation_idx on public.strategic_objectives (organisation_id);
create index strategic_objectives_portfolio_idx on public.strategic_objectives (portfolio_id, workspace_id);
create index strategic_objectives_owner_idx on public.strategic_objectives (owner_id, organisation_id);
create index strategic_objectives_created_by_idx on public.strategic_objectives (created_by);
create trigger strategic_objectives_00_tenant_guard before insert or update on public.strategic_objectives
  for each row execute function private.tenant_guard('portfolio_id', 'portfolios');
create trigger strategic_objectives_updated_at before update on public.strategic_objectives
  for each row execute function private.set_updated_at();
alter table public.strategic_objectives enable row level security;
revoke all on public.strategic_objectives from anon, authenticated;
grant select, insert, update, delete on public.strategic_objectives to authenticated;
create policy strategic_objectives_select on public.strategic_objectives for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy strategic_objectives_insert on public.strategic_objectives for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy strategic_objectives_update on public.strategic_objectives for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy strategic_objectives_delete on public.strategic_objectives for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  name text not null,
  pot_amount numeric(14,2),
  type_id uuid not null,
  type_list text not null generated always as ('collection_type') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (type_id, organisation_id, type_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id)
);
create index collections_workspace_idx on public.collections (workspace_id, organisation_id);
create index collections_organisation_idx on public.collections (organisation_id);
create index collections_type_type_list_idx on public.collections (type_id, organisation_id, type_list);
create index collections_created_by_idx on public.collections (created_by);
create trigger collections_00_tenant_guard before insert or update on public.collections
  for each row execute function private.tenant_guard('workspace_id', 'workspaces');
create trigger collections_updated_at before update on public.collections
  for each row execute function private.set_updated_at();
alter table public.collections enable row level security;
revoke all on public.collections from anon, authenticated;
grant select, insert, update, delete on public.collections to authenticated;
create policy collections_select on public.collections for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy collections_insert on public.collections for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy collections_update on public.collections for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy collections_delete on public.collections for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.collection_projects (
  organisation_id uuid not null,
  workspace_id uuid not null,
  collection_id uuid not null,
  project_id uuid not null,
  award_amount numeric(14,2),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (collection_id, workspace_id) references public.collections (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  primary key (collection_id, project_id)
);
create index collection_projects_workspace_idx on public.collection_projects (workspace_id, organisation_id);
create index collection_projects_organisation_idx on public.collection_projects (organisation_id);
create index collection_projects_collection_idx on public.collection_projects (collection_id, workspace_id);
create index collection_projects_project_idx on public.collection_projects (project_id, workspace_id);
create trigger collection_projects_00_tenant_guard before insert or update on public.collection_projects
  for each row execute function private.tenant_guard('collection_id', 'collections');
alter table public.collection_projects enable row level security;
revoke all on public.collection_projects from anon, authenticated;
grant select, insert, update, delete on public.collection_projects to authenticated;
create policy collection_projects_select on public.collection_projects for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy collection_projects_insert on public.collection_projects for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy collection_projects_update on public.collection_projects for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy collection_projects_delete on public.collection_projects for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo'));

create table public.user_favourites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  programme_id uuid references public.programmes (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (organisation_id) references public.organisations (id),
  unique nulls not distinct (profile_id, programme_id, project_id),
  check (num_nonnulls(programme_id, project_id) = 1)
);
create index user_favourites_organisation_idx on public.user_favourites (organisation_id);
create index user_favourites_programme_idx on public.user_favourites (programme_id);
create index user_favourites_project_idx on public.user_favourites (project_id);
create trigger user_favourites_00_tenant_guard before insert or update on public.user_favourites
  for each row execute function private.tenant_guard('project_id', 'projects', 'programme_id', 'programmes');
alter table public.user_favourites enable row level security;
revoke all on public.user_favourites from anon, authenticated;
grant select, insert, delete on public.user_favourites to authenticated;
create policy user_favourites_select on public.user_favourites for select to authenticated
  using (profile_id = (select auth.uid()));
create policy user_favourites_insert on public.user_favourites for insert to authenticated
  with check (profile_id = (select auth.uid()) and private.is_org_member(organisation_id));
create policy user_favourites_delete on public.user_favourites for delete to authenticated
  using (profile_id = (select auth.uid()));

-- Every project-scoped write policy calls this (review E). Today: workspace contributor on a
-- non-archived project. Per-project membership can narrow it later without touching policies.
create function private.can_edit_project(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.has_workspace_role(p.workspace_id, 'contributor')
    from public.projects p where p.id = p_project and p.archived_at is null
  ), false);
$$;

-- Registers can sit at portfolio, programme or project level: project rows defer to
-- can_edit_project, the rest need workspace contributor.
create function private.can_write(p_ws uuid, p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_project is null then private.has_workspace_role(p_ws, 'contributor')
              else private.can_edit_project(p_project) end;
$$;
grant execute on function private.can_edit_project(uuid), private.can_write(uuid, uuid) to authenticated, service_role;

-- Project codes: generated from the name's initials when not supplied (so existing
-- screens that don't know about codes keep working), uppercase, and PMO-only to change.
create function private.suggest_project_code(p_org uuid, p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  words text[] := regexp_split_to_array(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 ]', ' ', 'g')), '\s+');
  base text := '';
  w text;
  candidate text;
  n integer := 1;
begin
  foreach w in array words loop
    if w <> '' then base := base || left(w, 1); end if;
  end loop;
  if length(base) < 3 then
    base := left(regexp_replace(upper(coalesce(p_name, 'PRJ')), '[^A-Z0-9]', '', 'g') || 'PRJ', 3);
  end if;
  base := left(base, 6);
  candidate := base;
  while exists (select 1 from public.projects p where p.organisation_id = p_org and p.code = candidate) loop
    n := n + 1;
    candidate := left(base, 10 - length(n::text)) || n::text;
  end loop;
  return candidate;
end;
$$;

create function private.project_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.code := coalesce(upper(nullif(btrim(new.code), '')), private.suggest_project_code(new.organisation_id, new.name));
  elsif new.code is distinct from old.code then
    new.code := upper(btrim(new.code));
    if (select auth.uid()) is not null and not private.has_workspace_role(new.workspace_id, 'pmo') then
      raise exception 'Only PMO can change a project code' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
grant execute on function private.suggest_project_code(uuid, text) to authenticated, service_role;

-- Named to sort after projects_00_tenant_guard so organisation_id is already set.
create trigger projects_10_code before insert or update on public.projects
  for each row execute function private.project_code();
