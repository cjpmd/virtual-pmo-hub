-- Virtual PMO: resources. Every person the system names is a resource (owners, sponsors,
-- assignees...). Signed-in users are linked via profile_id; sponsors who never sign in are not.

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  profile_id uuid,
  name text not null,
  email text,
  job_title text,
  line_manager_id uuid,
  contracted_hours_per_week numeric(5,2) check (contracted_hours_per_week >= 0),
  fte numeric(3,2) check (fte >= 0 and fte <= 1.5),
  bau_percentage numeric(5,2) check (bau_percentage between 0 and 100),
  is_bookable boolean not null default false,
  is_placeholder boolean not null default false,
  placeholder_role text,
  needs_staffing boolean not null default false,
  is_active boolean not null default true,
  team_id uuid,
  team_list text not null generated always as ('team') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (team_id, organisation_id, team_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (organisation_id, profile_id),
  foreign key (organisation_id, profile_id) references public.organisation_members (organisation_id, profile_id) on delete set null (profile_id),
  foreign key (line_manager_id, organisation_id) references public.resources (id, organisation_id) on delete set null (line_manager_id)
);
create index resources_team_team_list_idx on public.resources (team_id, organisation_id, team_list);
create index resources_created_by_idx on public.resources (created_by);
create index resources_line_manager_idx on public.resources (line_manager_id, organisation_id);
create index resources_organisation_email_idx on public.resources (organisation_id, email);
create trigger resources_updated_at before update on public.resources
  for each row execute function private.set_updated_at();
alter table public.resources enable row level security;
revoke all on public.resources from anon, authenticated;
grant select, insert, update, delete on public.resources to authenticated;
create policy resources_select on public.resources for select to authenticated
  using (private.is_org_member(organisation_id));
create policy resources_insert on public.resources for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo') or (is_placeholder and private.has_org_role(organisation_id, 'manager')));
create policy resources_update on public.resources for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo') or (is_placeholder and private.has_org_role(organisation_id, 'manager'))) with check (private.has_org_role(organisation_id, 'pmo') or (is_placeholder and private.has_org_role(organisation_id, 'manager')));
create policy resources_delete on public.resources for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

create table public.resource_skills (
  organisation_id uuid not null,
  resource_id uuid not null,
  level smallint not null check (level between 1 and 3),
  skill_id uuid not null,
  skill_list text not null generated always as ('skill') stored,
  foreign key (organisation_id) references public.organisations (id),
  foreign key (resource_id, organisation_id) references public.resources (id, organisation_id) on delete cascade,
  foreign key (skill_id, organisation_id, skill_list) references public.lookup_values (id, organisation_id, list_key),
  primary key (resource_id, skill_id)
);
create index resource_skills_organisation_idx on public.resource_skills (organisation_id);
create index resource_skills_resource_idx on public.resource_skills (resource_id, organisation_id);
create index resource_skills_skill_skill_list_idx on public.resource_skills (skill_id, organisation_id, skill_list);
create trigger resource_skills_00_tenant_guard before insert or update on public.resource_skills
  for each row execute function private.tenant_guard('resource_id', 'resources');
alter table public.resource_skills enable row level security;
revoke all on public.resource_skills from anon, authenticated;
grant select, insert, update, delete on public.resource_skills to authenticated;
create policy resource_skills_select on public.resource_skills for select to authenticated
  using (private.is_org_member(organisation_id));
create policy resource_skills_insert on public.resource_skills for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy resource_skills_update on public.resource_skills for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy resource_skills_delete on public.resource_skills for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

-- The caller's own resource row in an organisation (for "my work" and offer responses).
create function private.current_resource_id(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.resources r where r.organisation_id = p_org and r.profile_id = (select auth.uid());
$$;

create function private.is_own_resource(p_resource uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.resources r where r.id = p_resource and r.profile_id = (select auth.uid()));
$$;
grant execute on function private.current_resource_id(uuid), private.is_own_resource(uuid) to authenticated, service_role;

create table public.resource_leave (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  resource_id uuid not null,
  start_date date not null,
  finish_date date not null,
  leave_type public.leave_type not null default 'annual_leave',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (resource_id, organisation_id) references public.resources (id, organisation_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null,
  check (finish_date >= start_date)
);
create index resource_leave_organisation_idx on public.resource_leave (organisation_id);
create index resource_leave_resource_idx on public.resource_leave (resource_id, organisation_id);
create index resource_leave_created_by_idx on public.resource_leave (created_by);
create trigger resource_leave_00_tenant_guard before insert or update on public.resource_leave
  for each row execute function private.tenant_guard('resource_id', 'resources');
create trigger resource_leave_updated_at before update on public.resource_leave
  for each row execute function private.set_updated_at();
alter table public.resource_leave enable row level security;
revoke all on public.resource_leave from anon, authenticated;
grant select, insert, update, delete on public.resource_leave to authenticated;
create policy resource_leave_select on public.resource_leave for select to authenticated
  using (private.is_org_member(organisation_id));
create policy resource_leave_insert on public.resource_leave for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo') or private.is_own_resource(resource_id));
create policy resource_leave_update on public.resource_leave for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo') or private.is_own_resource(resource_id)) with check (private.has_org_role(organisation_id, 'pmo') or private.is_own_resource(resource_id));
create policy resource_leave_delete on public.resource_leave for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo') or private.is_own_resource(resource_id));
create trigger resources_00_tenant_guard before update on public.resources
  for each row execute function private.tenant_guard();

-- Every organisation member has a resource row (decided in Stage 2). On joining, link
-- the member to an existing resource with the same email, or create a non-bookable one.
create function private.link_profile_to_resource()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = new.profile_id;
  if exists (select 1 from public.resources r where r.organisation_id = new.organisation_id and r.profile_id = new.profile_id) then
    return new;
  end if;
  update public.resources r set profile_id = new.profile_id
  where r.id = (
    select r2.id from public.resources r2
    where r2.organisation_id = new.organisation_id and r2.profile_id is null
      and p.email <> '' and lower(r2.email) = lower(p.email)
    order by r2.is_bookable desc, r2.created_at
    limit 1
  );
  if not found then
    insert into public.resources (organisation_id, profile_id, name, email, is_bookable)
    values (new.organisation_id, new.profile_id, p.display_name, nullif(p.email, ''), false);
  end if;
  return new;
end;
$$;
create trigger organisation_members_link_resource after insert on public.organisation_members
  for each row execute function private.link_profile_to_resource();
