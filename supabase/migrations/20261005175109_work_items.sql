-- Virtual PMO: one work_items table for every task, whatever view shows it (Planner-style
-- tasks, agile items, issued tasks). Clients never hard-delete: "delete" sets deleted_at.
-- Sprints arrive in a later phase as sprint_id with a composite FK to sprints (id, project_id).

create table public.project_buckets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, project_id),
  unique (project_id, name)
);
create index project_buckets_workspace_idx on public.project_buckets (workspace_id, organisation_id);
create index project_buckets_organisation_idx on public.project_buckets (organisation_id);
create index project_buckets_project_idx on public.project_buckets (project_id, workspace_id);
create index project_buckets_created_by_idx on public.project_buckets (created_by);
create trigger project_buckets_00_tenant_guard before insert or update on public.project_buckets
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger project_buckets_updated_at before update on public.project_buckets
  for each row execute function private.set_updated_at();
alter table public.project_buckets enable row level security;
revoke all on public.project_buckets from anon, authenticated;
grant select, insert, update, delete on public.project_buckets to authenticated;
create policy project_buckets_select on public.project_buckets for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy project_buckets_insert on public.project_buckets for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy project_buckets_update on public.project_buckets for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy project_buckets_delete on public.project_buckets for delete to authenticated
  using (private.can_edit_project(project_id));

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  bucket_id uuid,
  parent_id uuid,
  milestone_id uuid,
  title text not null,
  description text,
  item_type public.work_item_type not null default 'task',
  status public.work_item_status not null default 'not_started',
  status_category public.status_category not null generated always as (case status
      when 'issued' then 'todo'::public.status_category when 'not_started' then 'todo'::public.status_category
      when 'in_progress' then 'in_progress'::public.status_category when 'blocked' then 'in_progress'::public.status_category
      else 'done'::public.status_category end) stored,
  priority public.priority not null default 'moderate',
  start_date date,
  finish_date date,
  baseline_finish_date date,
  percent_complete smallint check (percent_complete between 0 and 100),
  story_points numeric(6,2) check (story_points >= 0),
  estimated_effort_hours numeric(8,2) check (estimated_effort_hours >= 0),
  effort_completed_hours numeric(8,2) check (effort_completed_hours >= 0),
  labels text[] not null default '{}',
  backlog_rank numeric not null default 0,
  done_at timestamptz,
  deleted_at timestamptz,
  external_source public.external_source,
  external_id text,
  external_etag text,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (bucket_id, project_id) references public.project_buckets (id, project_id) on delete set null (bucket_id),
  foreign key (parent_id, project_id) references public.work_items (id, project_id) on delete set null (parent_id),
  foreign key (milestone_id, project_id) references public.milestones (id, project_id) on delete set null (milestone_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (project_id, ref),
  unique (id, workspace_id),
  unique (id, project_id),
  unique (project_id, external_source, external_id),
  check ((external_source is null) = (external_id is null)),
  check (id <> parent_id),
  check (finish_date is null or start_date is null or finish_date >= start_date)
);
create index work_items_workspace_idx on public.work_items (workspace_id, organisation_id);
create index work_items_organisation_idx on public.work_items (organisation_id);
create index work_items_project_idx on public.work_items (project_id, workspace_id);
create index work_items_bucket_project_idx on public.work_items (bucket_id, project_id);
create index work_items_parent_project_idx on public.work_items (parent_id, project_id);
create index work_items_milestone_project_idx on public.work_items (milestone_id, project_id);
create index work_items_created_by_idx on public.work_items (created_by);
create index work_items_project_status_category_idx on public.work_items (project_id, status_category);
create index work_items_project_finish_date_idx on public.work_items (project_id, finish_date);
create trigger work_items_00_tenant_guard before insert or update on public.work_items
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger work_items_ref before insert on public.work_items
  for each row execute function private.assign_ref('TSK', 'project');
create trigger work_items_updated_at before update on public.work_items
  for each row execute function private.set_updated_at();
alter table public.work_items enable row level security;
revoke all on public.work_items from anon, authenticated;
grant select, insert, update on public.work_items to authenticated;
create policy work_items_select on public.work_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy work_items_insert on public.work_items for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy work_items_update on public.work_items for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));

create table public.work_item_assignees (
  organisation_id uuid not null,
  workspace_id uuid not null,
  work_item_id uuid not null,
  project_id uuid not null,
  resource_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (work_item_id, project_id) references public.work_items (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (resource_id, organisation_id) references public.resources (id, organisation_id) on delete restrict,
  primary key (work_item_id, resource_id)
);
create index work_item_assignees_workspace_idx on public.work_item_assignees (workspace_id, organisation_id);
create index work_item_assignees_organisation_idx on public.work_item_assignees (organisation_id);
create index work_item_assignees_work_item_project_idx on public.work_item_assignees (work_item_id, project_id);
create index work_item_assignees_project_idx on public.work_item_assignees (project_id, workspace_id);
create index work_item_assignees_resource_idx on public.work_item_assignees (resource_id, organisation_id);
create trigger work_item_assignees_00_tenant_guard before insert or update on public.work_item_assignees
  for each row execute function private.tenant_guard('work_item_id', 'work_items');
alter table public.work_item_assignees enable row level security;
revoke all on public.work_item_assignees from anon, authenticated;
grant select, insert, delete on public.work_item_assignees to authenticated;
create policy work_item_assignees_select on public.work_item_assignees for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy work_item_assignees_insert on public.work_item_assignees for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy work_item_assignees_delete on public.work_item_assignees for delete to authenticated
  using (private.can_edit_project(project_id));

create table public.work_item_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  work_item_id uuid not null,
  project_id uuid not null,
  label text not null,
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (work_item_id, project_id) references public.work_items (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index work_item_checklist_items_workspace_idx on public.work_item_checklist_items (workspace_id, organisation_id);
create index work_item_checklist_items_organisation_idx on public.work_item_checklist_items (organisation_id);
create index work_item_checklist_items_work_item_project_idx on public.work_item_checklist_items (work_item_id, project_id);
create index work_item_checklist_items_project_idx on public.work_item_checklist_items (project_id, workspace_id);
create index work_item_checklist_items_created_by_idx on public.work_item_checklist_items (created_by);
create trigger work_item_checklist_items_00_tenant_guard before insert or update on public.work_item_checklist_items
  for each row execute function private.tenant_guard('work_item_id', 'work_items');
create trigger work_item_checklist_items_updated_at before update on public.work_item_checklist_items
  for each row execute function private.set_updated_at();
alter table public.work_item_checklist_items enable row level security;
revoke all on public.work_item_checklist_items from anon, authenticated;
grant select, insert, update, delete on public.work_item_checklist_items to authenticated;
create policy work_item_checklist_items_select on public.work_item_checklist_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy work_item_checklist_items_insert on public.work_item_checklist_items for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy work_item_checklist_items_update on public.work_item_checklist_items for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy work_item_checklist_items_delete on public.work_item_checklist_items for delete to authenticated
  using (private.can_edit_project(project_id));

create table public.work_item_links (
  organisation_id uuid not null,
  workspace_id uuid not null,
  predecessor_id uuid not null,
  successor_id uuid not null,
  project_id uuid not null,
  link_type text not null default 'finish_to_start' check (link_type in ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (predecessor_id, project_id) references public.work_items (id, project_id) on delete cascade,
  foreign key (successor_id, project_id) references public.work_items (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  check (predecessor_id <> successor_id),
  primary key (predecessor_id, successor_id)
);
create index work_item_links_workspace_idx on public.work_item_links (workspace_id, organisation_id);
create index work_item_links_organisation_idx on public.work_item_links (organisation_id);
create index work_item_links_predecessor_project_idx on public.work_item_links (predecessor_id, project_id);
create index work_item_links_successor_project_idx on public.work_item_links (successor_id, project_id);
create index work_item_links_project_idx on public.work_item_links (project_id, workspace_id);
create trigger work_item_links_00_tenant_guard before insert or update on public.work_item_links
  for each row execute function private.tenant_guard('predecessor_id', 'work_items');
alter table public.work_item_links enable row level security;
revoke all on public.work_item_links from anon, authenticated;
grant select, insert, delete on public.work_item_links to authenticated;
create policy work_item_links_select on public.work_item_links for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy work_item_links_insert on public.work_item_links for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy work_item_links_delete on public.work_item_links for delete to authenticated
  using (private.can_edit_project(project_id));

create table public.work_item_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  work_item_id uuid not null,
  project_id uuid not null,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (work_item_id, project_id) references public.work_items (id, project_id) on delete restrict,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete restrict
);
comment on table public.work_item_events is 'Append-only change log, written only by trigger.';
create index work_item_events_workspace_idx on public.work_item_events (workspace_id, organisation_id);
create index work_item_events_organisation_idx on public.work_item_events (organisation_id);
create index work_item_events_work_item_project_idx on public.work_item_events (work_item_id, project_id);
create index work_item_events_project_idx on public.work_item_events (project_id, workspace_id);
create index work_item_events_changed_by_idx on public.work_item_events (changed_by);
create index work_item_events_work_item_changed_at_idx on public.work_item_events (work_item_id, changed_at);
create trigger work_item_events_00_tenant_guard before insert or update on public.work_item_events
  for each row execute function private.tenant_guard('work_item_id', 'work_items');
alter table public.work_item_events enable row level security;
revoke all on public.work_item_events from anon, authenticated;
grant select on public.work_item_events to authenticated;
create policy work_item_events_select on public.work_item_events for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Who may record an offer response: the issued-to person, the issuer, or pmo/admin (the last
-- two on behalf of a resource with no profile; review E).
create function private.can_respond_to_offer(p_ws uuid, p_issued_to uuid, p_issued_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_own_resource(p_issued_to) or private.is_own_resource(p_issued_by)
      or private.has_workspace_role(p_ws, 'pmo');
$$;
grant execute on function private.can_respond_to_offer(uuid, uuid, uuid) to authenticated, service_role;

create table public.work_item_offers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  work_item_id uuid not null,
  project_id uuid not null,
  issued_at timestamptz not null default now(),
  acknowledgement_due_date date,
  reminder_sent_at timestamptz,
  response public.offer_response,
  proposed_date date,
  comment text,
  responded_at timestamptz,
  responded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  issued_by uuid not null,
  issued_to uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (work_item_id, project_id) references public.work_items (id, project_id) on delete restrict,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete restrict,
  foreign key (issued_by, organisation_id) references public.resources (id, organisation_id) on delete restrict,
  foreign key (issued_to, organisation_id) references public.resources (id, organisation_id) on delete restrict,
  check ((response = 'proposed_date') = (proposed_date is not null)),
  check ((response is null) = (responded_at is null))
);
comment on table public.work_item_offers is 'Append-only: one row per issue; the response is recorded once, re-issuing inserts a new row.';
create index work_item_offers_workspace_idx on public.work_item_offers (workspace_id, organisation_id);
create index work_item_offers_organisation_idx on public.work_item_offers (organisation_id);
create index work_item_offers_work_item_project_idx on public.work_item_offers (work_item_id, project_id);
create index work_item_offers_project_idx on public.work_item_offers (project_id, workspace_id);
create index work_item_offers_issued_by_idx on public.work_item_offers (issued_by, organisation_id);
create index work_item_offers_issued_to_idx on public.work_item_offers (issued_to, organisation_id);
create index work_item_offers_responded_by_idx on public.work_item_offers (responded_by);
create index work_item_offers_created_by_idx on public.work_item_offers (created_by);
create index work_item_offers_work_item_issued_at_idx on public.work_item_offers (work_item_id, issued_at);
create trigger work_item_offers_00_tenant_guard before insert or update on public.work_item_offers
  for each row execute function private.tenant_guard('work_item_id', 'work_items');
alter table public.work_item_offers enable row level security;
revoke all on public.work_item_offers from anon, authenticated;
grant select, insert, update on public.work_item_offers to authenticated;
create policy work_item_offers_select on public.work_item_offers for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy work_item_offers_insert on public.work_item_offers for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy work_item_offers_update on public.work_item_offers for update to authenticated
  using (response is null and private.can_respond_to_offer(workspace_id, issued_to, issued_by)) with check (private.can_respond_to_offer(workspace_id, issued_to, issued_by));

create table public.work_item_attachments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  work_item_id uuid not null,
  project_id uuid not null,
  file_name text not null,
  storage_path text not null,
  size_bytes bigint check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (work_item_id, project_id) references public.work_items (id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index work_item_attachments_workspace_idx on public.work_item_attachments (workspace_id, organisation_id);
create index work_item_attachments_organisation_idx on public.work_item_attachments (organisation_id);
create index work_item_attachments_work_item_project_idx on public.work_item_attachments (work_item_id, project_id);
create index work_item_attachments_project_idx on public.work_item_attachments (project_id, workspace_id);
create index work_item_attachments_created_by_idx on public.work_item_attachments (created_by);
create trigger work_item_attachments_00_tenant_guard before insert or update on public.work_item_attachments
  for each row execute function private.tenant_guard('work_item_id', 'work_items');
create trigger work_item_attachments_updated_at before update on public.work_item_attachments
  for each row execute function private.set_updated_at();
alter table public.work_item_attachments enable row level security;
revoke all on public.work_item_attachments from anon, authenticated;
grant select, insert, update, delete on public.work_item_attachments to authenticated;
create policy work_item_attachments_select on public.work_item_attachments for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy work_item_attachments_insert on public.work_item_attachments for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy work_item_attachments_update on public.work_item_attachments for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy work_item_attachments_delete on public.work_item_attachments for delete to authenticated
  using (private.can_edit_project(project_id));

alter table public.resource_assignments
  add constraint resource_assignments_work_item_fkey foreign key (work_item_id, project_id)
  references public.work_items (id, project_id) on delete set null (work_item_id);
create index resource_assignments_work_item_idx on public.resource_assignments (work_item_id, project_id);

-- done_at follows status.
create function private.work_items_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then new.done_at := coalesce(new.done_at, now()); end if;
  else
    new.done_at := null;
  end if;
  return new;
end;
$$;
create trigger work_items_10_done_at before insert or update of status on public.work_items
  for each row execute function private.work_items_done_at();

-- Append-only change log (velocity, scope history, later burn charts).
create function private.log_work_item_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.work_item_events (work_item_id, project_id, field, old_value, new_value, changed_by)
    values (new.id, new.project_id, 'created', null, new.title, who);
    return new;
  end if;
  insert into public.work_item_events (work_item_id, project_id, field, old_value, new_value, changed_by)
  select new.id, new.project_id, f.field, f.old_value, f.new_value, who
  from (values
    ('status', old.status::text, new.status::text),
    ('estimate', old.story_points::text, new.story_points::text),
    ('bucket', old.bucket_id::text, new.bucket_id::text),
    ('finish_date', old.finish_date::text, new.finish_date::text),
    ('milestone', old.milestone_id::text, new.milestone_id::text),
    ('deleted', old.deleted_at::text, new.deleted_at::text)
  ) as f(field, old_value, new_value)
  where f.old_value is distinct from f.new_value;
  return new;
end;
$$;
create trigger work_items_log_events after insert or update on public.work_items
  for each row execute function private.log_work_item_events();

-- Offers: issuing marks the item issued; the response is set once, by an allowed person,
-- and every other column is frozen. Accepting moves the item to not_started and assigns it.
create function private.work_item_offers_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Signed-in users issue offers unanswered; seed and service writes may load history.
    if (select auth.uid()) is not null then
      new.response := null; new.proposed_date := null; new.comment := null;
      new.responded_at := null; new.responded_by := null;
    end if;
    return new;
  end if;
  if old.response is not null then
    raise exception 'An offer response cannot be changed; issue a new offer instead' using errcode = '42501';
  end if;
  if (new.work_item_id, new.issued_by, new.issued_to, new.issued_at, new.acknowledgement_due_date, new.created_at, new.created_by)
     is distinct from (old.work_item_id, old.issued_by, old.issued_to, old.issued_at, old.acknowledgement_due_date, old.created_at, old.created_by) then
    raise exception 'Only the response fields of an offer can be recorded' using errcode = '42501';
  end if;
  if new.response is not null and (select auth.uid()) is not null then
    new.responded_at := now();
    new.responded_by := (select auth.uid());
  end if;
  return new;
end;
$$;
create trigger work_item_offers_10_guard before insert or update on public.work_item_offers
  for each row execute function private.work_item_offers_guard();

create function private.work_item_offers_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.response is null then
    update public.work_items set status = 'issued' where id = new.work_item_id and status = 'not_started';
  elsif new.response = 'accepted' and (tg_op = 'INSERT' or old.response is null) then
    update public.work_items set status = 'not_started' where id = new.work_item_id and status = 'issued';
    insert into public.work_item_assignees (work_item_id, project_id, resource_id)
    values (new.work_item_id, new.project_id, new.issued_to) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger work_item_offers_apply after insert or update on public.work_item_offers
  for each row execute function private.work_item_offers_apply();
