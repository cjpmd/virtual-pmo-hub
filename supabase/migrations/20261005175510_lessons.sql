-- Virtual PMO: lessons learned, improvement actions and phase lessons reviews.

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  sprint_name text,
  type public.lesson_type not null,
  summary text not null,
  what_happened text,
  impact text,
  root_cause text,
  recommendation text,
  applicability public.lesson_applicability not null default 'similar_projects',
  raised_date date not null default current_date,
  status public.lesson_status not null default 'identified',
  raised_by_id uuid,
  phase_id uuid,
  category_id uuid not null,
  category_list text not null generated always as ('lesson_category') stored,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (raised_by_id, organisation_id) references public.resources (id, organisation_id) on delete set null (raised_by_id),
  foreign key (phase_id, organisation_id) references public.lifecycle_phases (id, organisation_id) on delete set null (phase_id),
  foreign key (category_id, organisation_id, category_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, ref),
  unique (id, workspace_id)
);
create index lessons_workspace_idx on public.lessons (workspace_id, organisation_id);
create index lessons_project_idx on public.lessons (project_id, workspace_id);
create index lessons_raised_by_idx on public.lessons (raised_by_id, organisation_id);
create index lessons_phase_idx on public.lessons (phase_id, organisation_id);
create index lessons_category_category_list_idx on public.lessons (category_id, organisation_id, category_list);
create index lessons_created_by_idx on public.lessons (created_by);
create trigger lessons_00_tenant_guard before insert or update on public.lessons
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger lessons_ref before insert on public.lessons
  for each row execute function private.assign_ref('LES', 'organisation');
create trigger lessons_updated_at before update on public.lessons
  for each row execute function private.set_updated_at();
alter table public.lessons enable row level security;
revoke all on public.lessons from anon, authenticated;
grant select, insert, update, delete on public.lessons to authenticated;
create policy lessons_select on public.lessons for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy lessons_insert on public.lessons for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy lessons_update on public.lessons for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy lessons_delete on public.lessons for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.lesson_project_types (
  organisation_id uuid not null,
  workspace_id uuid not null,
  lesson_id uuid not null,
  project_id uuid not null,
  project_type_id uuid not null,
  project_type_list text not null generated always as ('project_type') stored,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (lesson_id, workspace_id) references public.lessons (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (project_type_id, organisation_id, project_type_list) references public.lookup_values (id, organisation_id, list_key),
  primary key (lesson_id, project_type_id)
);
create index lesson_project_types_workspace_idx on public.lesson_project_types (workspace_id, organisation_id);
create index lesson_project_types_organisation_idx on public.lesson_project_types (organisation_id);
create index lesson_project_types_lesson_idx on public.lesson_project_types (lesson_id, workspace_id);
create index lesson_project_types_project_idx on public.lesson_project_types (project_id, workspace_id);
create index lesson_project_types_project_type_project_type_list_idx on public.lesson_project_types (project_type_id, organisation_id, project_type_list);
create trigger lesson_project_types_00_tenant_guard before insert or update on public.lesson_project_types
  for each row execute function private.tenant_guard('lesson_id', 'lessons');
alter table public.lesson_project_types enable row level security;
revoke all on public.lesson_project_types from anon, authenticated;
grant select, insert, delete on public.lesson_project_types to authenticated;
create policy lesson_project_types_select on public.lesson_project_types for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy lesson_project_types_insert on public.lesson_project_types for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy lesson_project_types_delete on public.lesson_project_types for delete to authenticated
  using (private.can_edit_project(project_id));

create table public.improvement_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  lesson_id uuid not null,
  project_id uuid not null,
  description text not null,
  due_date date,
  status public.action_status not null default 'open',
  embedded_in text,
  owner_id uuid,
  ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (lesson_id, workspace_id) references public.lessons (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, ref)
);
create index improvement_actions_workspace_idx on public.improvement_actions (workspace_id, organisation_id);
create index improvement_actions_lesson_idx on public.improvement_actions (lesson_id, workspace_id);
create index improvement_actions_project_idx on public.improvement_actions (project_id, workspace_id);
create index improvement_actions_owner_idx on public.improvement_actions (owner_id, organisation_id);
create index improvement_actions_created_by_idx on public.improvement_actions (created_by);
create trigger improvement_actions_00_tenant_guard before insert or update on public.improvement_actions
  for each row execute function private.tenant_guard('lesson_id', 'lessons');
create trigger improvement_actions_ref before insert on public.improvement_actions
  for each row execute function private.assign_ref('ACT', 'organisation');
create trigger improvement_actions_updated_at before update on public.improvement_actions
  for each row execute function private.set_updated_at();
alter table public.improvement_actions enable row level security;
revoke all on public.improvement_actions from anon, authenticated;
grant select, insert, update, delete on public.improvement_actions to authenticated;
create policy improvement_actions_select on public.improvement_actions for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy improvement_actions_insert on public.improvement_actions for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy improvement_actions_update on public.improvement_actions for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy improvement_actions_delete on public.improvement_actions for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.phase_lessons_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  review_date date not null,
  facilitator_id uuid,
  phase_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (facilitator_id, organisation_id) references public.resources (id, organisation_id) on delete set null (facilitator_id),
  foreign key (phase_id, organisation_id) references public.lifecycle_phases (id, organisation_id) on delete restrict,
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, workspace_id),
  unique (project_id, phase_id, review_date)
);
create index phase_lessons_reviews_workspace_idx on public.phase_lessons_reviews (workspace_id, organisation_id);
create index phase_lessons_reviews_organisation_idx on public.phase_lessons_reviews (organisation_id);
create index phase_lessons_reviews_project_idx on public.phase_lessons_reviews (project_id, workspace_id);
create index phase_lessons_reviews_facilitator_idx on public.phase_lessons_reviews (facilitator_id, organisation_id);
create index phase_lessons_reviews_phase_idx on public.phase_lessons_reviews (phase_id, organisation_id);
create index phase_lessons_reviews_created_by_idx on public.phase_lessons_reviews (created_by);
create trigger phase_lessons_reviews_00_tenant_guard before insert or update on public.phase_lessons_reviews
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger phase_lessons_reviews_updated_at before update on public.phase_lessons_reviews
  for each row execute function private.set_updated_at();
alter table public.phase_lessons_reviews enable row level security;
revoke all on public.phase_lessons_reviews from anon, authenticated;
grant select, insert, update, delete on public.phase_lessons_reviews to authenticated;
create policy phase_lessons_reviews_select on public.phase_lessons_reviews for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy phase_lessons_reviews_insert on public.phase_lessons_reviews for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy phase_lessons_reviews_update on public.phase_lessons_reviews for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy phase_lessons_reviews_delete on public.phase_lessons_reviews for delete to authenticated
  using (private.has_workspace_role(workspace_id, 'manager'));

create table public.phase_lessons_review_attendees (
  organisation_id uuid not null,
  workspace_id uuid not null,
  review_id uuid not null,
  project_id uuid not null,
  resource_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (review_id, workspace_id) references public.phase_lessons_reviews (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (resource_id, organisation_id) references public.resources (id, organisation_id) on delete restrict,
  primary key (review_id, resource_id)
);
create index phase_lessons_review_attendees_workspace_idx on public.phase_lessons_review_attendees (workspace_id, organisation_id);
create index phase_lessons_review_attendees_organisation_idx on public.phase_lessons_review_attendees (organisation_id);
create index phase_lessons_review_attendees_review_idx on public.phase_lessons_review_attendees (review_id, workspace_id);
create index phase_lessons_review_attendees_project_idx on public.phase_lessons_review_attendees (project_id, workspace_id);
create index phase_lessons_review_attendees_resource_idx on public.phase_lessons_review_attendees (resource_id, organisation_id);
create trigger phase_lessons_review_attendees_00_tenant_guard before insert or update on public.phase_lessons_review_attendees
  for each row execute function private.tenant_guard('review_id', 'phase_lessons_reviews');
alter table public.phase_lessons_review_attendees enable row level security;
revoke all on public.phase_lessons_review_attendees from anon, authenticated;
grant select, insert, delete on public.phase_lessons_review_attendees to authenticated;
create policy phase_lessons_review_attendees_select on public.phase_lessons_review_attendees for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy phase_lessons_review_attendees_insert on public.phase_lessons_review_attendees for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy phase_lessons_review_attendees_delete on public.phase_lessons_review_attendees for delete to authenticated
  using (private.can_edit_project(project_id));
