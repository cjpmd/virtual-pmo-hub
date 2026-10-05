-- Virtual PMO: project delivery. Milestones (status is computed, never stored), forecast
-- history (append-only), team roles, capacity bookings and status reports.

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  title text not null,
  type public.milestone_type not null default 'delivery',
  baseline_date date not null,
  forecast_date date not null,
  actual_date date,
  report_to_committee boolean not null default false,
  owner_id uuid,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (project_id, ref),
  unique (id, workspace_id),
  unique (id, project_id)
);
create index milestones_workspace_idx on public.milestones (workspace_id, organisation_id);
create index milestones_organisation_idx on public.milestones (organisation_id);
create index milestones_project_idx on public.milestones (project_id, workspace_id);
create index milestones_owner_idx on public.milestones (owner_id, organisation_id);
create index milestones_created_by_idx on public.milestones (created_by);
create trigger milestones_00_tenant_guard before insert or update on public.milestones
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger milestones_ref before insert on public.milestones
  for each row execute function private.assign_ref('MS', 'project');
create trigger milestones_updated_at before update on public.milestones
  for each row execute function private.set_updated_at();
alter table public.milestones enable row level security;
revoke all on public.milestones from anon, authenticated;
grant select, insert, update, delete on public.milestones to authenticated;
create policy milestones_select on public.milestones for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy milestones_insert on public.milestones for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy milestones_update on public.milestones for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy milestones_delete on public.milestones for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.milestone_forecast_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  milestone_id uuid not null,
  reporting_date date not null,
  forecast_date date not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete restrict,
  foreign key (milestone_id, project_id) references public.milestones (id, project_id) on delete restrict
);
create index milestone_forecast_history_workspace_idx on public.milestone_forecast_history (workspace_id, organisation_id);
create index milestone_forecast_history_organisation_idx on public.milestone_forecast_history (organisation_id);
create index milestone_forecast_history_project_idx on public.milestone_forecast_history (project_id, workspace_id);
create index milestone_forecast_history_milestone_project_idx on public.milestone_forecast_history (milestone_id, project_id);
create index milestone_forecast_history_created_by_idx on public.milestone_forecast_history (created_by);
create trigger milestone_forecast_history_00_tenant_guard before insert or update on public.milestone_forecast_history
  for each row execute function private.tenant_guard('milestone_id', 'milestones');
alter table public.milestone_forecast_history enable row level security;
revoke all on public.milestone_forecast_history from anon, authenticated;
grant select on public.milestone_forecast_history to authenticated;
create policy milestone_forecast_history_select on public.milestone_forecast_history for select to authenticated
  using (private.is_workspace_member(workspace_id));

create table public.project_team_members (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  role public.project_role not null,
  start_date date,
  finish_date date,
  allocated_effort_hours numeric(8,2) not null default 0 check (allocated_effort_hours >= 0),
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (resource_id, organisation_id) references public.resources (id, organisation_id) on delete restrict,
  foreign key (created_by) references public.profiles (id) on delete set null,
  check (finish_date is null or start_date is null or finish_date >= start_date)
);
create index project_team_members_workspace_idx on public.project_team_members (workspace_id, organisation_id);
create index project_team_members_organisation_idx on public.project_team_members (organisation_id);
create index project_team_members_project_idx on public.project_team_members (project_id, workspace_id);
create index project_team_members_resource_idx on public.project_team_members (resource_id, organisation_id);
create index project_team_members_created_by_idx on public.project_team_members (created_by);
create trigger project_team_members_00_tenant_guard before insert or update on public.project_team_members
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger project_team_members_updated_at before update on public.project_team_members
  for each row execute function private.set_updated_at();
alter table public.project_team_members enable row level security;
revoke all on public.project_team_members from anon, authenticated;
grant select, insert, update, delete on public.project_team_members to authenticated;
create policy project_team_members_select on public.project_team_members for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy project_team_members_insert on public.project_team_members for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy project_team_members_update on public.project_team_members for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy project_team_members_delete on public.project_team_members for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.resource_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  work_item_id uuid,
  role text,
  start_date date not null,
  finish_date date not null,
  hours_per_week numeric(5,2) not null check (hours_per_week >= 0),
  booking_type public.booking_type not null default 'soft',
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (resource_id, organisation_id) references public.resources (id, organisation_id) on delete restrict,
  foreign key (created_by) references public.profiles (id) on delete set null,
  check (finish_date >= start_date)
);
create index resource_assignments_workspace_idx on public.resource_assignments (workspace_id, organisation_id);
create index resource_assignments_organisation_idx on public.resource_assignments (organisation_id);
create index resource_assignments_project_idx on public.resource_assignments (project_id, workspace_id);
create index resource_assignments_resource_idx on public.resource_assignments (resource_id, organisation_id);
create index resource_assignments_created_by_idx on public.resource_assignments (created_by);
create trigger resource_assignments_00_tenant_guard before insert or update on public.resource_assignments
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger resource_assignments_updated_at before update on public.resource_assignments
  for each row execute function private.set_updated_at();
alter table public.resource_assignments enable row level security;
revoke all on public.resource_assignments from anon, authenticated;
grant select, insert, update, delete on public.resource_assignments to authenticated;
create policy resource_assignments_select on public.resource_assignments for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy resource_assignments_insert on public.resource_assignments for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy resource_assignments_update on public.resource_assignments for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy resource_assignments_delete on public.resource_assignments for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.status_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  reporting_date date not null,
  overall public.health not null default 'not_set',
  schedule public.health not null default 'not_set',
  financial public.health not null default 'not_set',
  effort public.health not null default 'not_set',
  issue public.health not null default 'not_set',
  accomplished text,
  planned text,
  comments text,
  override_reasons jsonb not null default '{}',
  ai_draft jsonb,
  evidenced_overall public.health,
  evidenced_schedule public.health,
  evidenced_financial public.health,
  evidenced_effort public.health,
  evidenced_issue public.health,
  evidenced_benefit public.health,
  submitter_id uuid,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (submitter_id, organisation_id) references public.resources (id, organisation_id) on delete set null (submitter_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (project_id, ref)
);
create index status_reports_workspace_idx on public.status_reports (workspace_id, organisation_id);
create index status_reports_organisation_idx on public.status_reports (organisation_id);
create index status_reports_project_idx on public.status_reports (project_id, workspace_id);
create index status_reports_submitter_idx on public.status_reports (submitter_id, organisation_id);
create index status_reports_created_by_idx on public.status_reports (created_by);
create trigger status_reports_00_tenant_guard before insert or update on public.status_reports
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger status_reports_ref before insert on public.status_reports
  for each row execute function private.assign_ref('SR', 'project');
create trigger status_reports_updated_at before update on public.status_reports
  for each row execute function private.set_updated_at();
alter table public.status_reports enable row level security;
revoke all on public.status_reports from anon, authenticated;
grant select, insert, update, delete on public.status_reports to authenticated;
create policy status_reports_select on public.status_reports for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy status_reports_insert on public.status_reports for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy status_reports_update on public.status_reports for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy status_reports_delete on public.status_reports for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

alter table public.roadmap_key_dates
  add constraint roadmap_key_dates_milestone_fkey foreign key (milestone_id, workspace_id)
  references public.milestones (id, workspace_id) on delete set null (milestone_id);
create index roadmap_key_dates_milestone_idx on public.roadmap_key_dates (milestone_id, workspace_id);

-- Forecast history is written only here: one row whenever a milestone's forecast changes.
create function private.record_milestone_forecast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.forecast_date is distinct from old.forecast_date then
    insert into public.milestone_forecast_history (milestone_id, project_id, reporting_date, forecast_date)
    values (new.id, new.project_id, private.org_today(new.organisation_id), new.forecast_date)
    on conflict (milestone_id, reporting_date) do update set forecast_date = excluded.forecast_date;
  end if;
  return new;
end;
$$;
create unique index milestone_forecast_history_day_idx on public.milestone_forecast_history (milestone_id, reporting_date);
create trigger milestones_forecast_history after insert or update of forecast_date on public.milestones
  for each row execute function private.record_milestone_forecast();

-- Evidenced health is captured from v_project_health when a report is submitted, then
-- frozen (review E). Client-supplied evidenced values are ignored; seed/service writes
-- (no auth.uid()) may supply historic values.
create function private.capture_evidenced_health()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
begin
  if tg_op = 'UPDATE' then
    new.evidenced_overall := old.evidenced_overall; new.evidenced_schedule := old.evidenced_schedule;
    new.evidenced_financial := old.evidenced_financial; new.evidenced_effort := old.evidenced_effort;
    new.evidenced_issue := old.evidenced_issue; new.evidenced_benefit := old.evidenced_benefit;
    return new;
  end if;
  if (select auth.uid()) is null and new.evidenced_overall is not null then
    return new;
  end if;
  select v.overall, v.schedule, v.financial, v.effort, v.issue, v.benefit into h
  from public.v_project_health v where v.project_id = new.project_id;
  new.evidenced_overall := h.overall; new.evidenced_schedule := h.schedule; new.evidenced_financial := h.financial;
  new.evidenced_effort := h.effort; new.evidenced_issue := h.issue; new.evidenced_benefit := h.benefit;
  return new;
end;
$$;
create trigger status_reports_20_evidenced before insert or update on public.status_reports
  for each row execute function private.capture_evidenced_health();
