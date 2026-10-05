-- Virtual PMO: tenancy and identity tables.
-- organisations -> workspaces; organisation_members / workspace_members carry roles.

-- Default organisation settings. Only keys the database reads are required here;
-- the front end deep-merges its own defaults over whatever is stored.
create function private.default_org_settings()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'regional', jsonb_build_object(
      'baseCurrency', 'GBP', 'locale', 'en-GB', 'dateFormat', 'DD/MM/YYYY',
      'timeZone', 'Europe/London', 'firstDayOfWeek', 1, 'financialYearStartMonth', 8),
    'health', jsonb_build_object(
      'scheduleSlipPercent', 10, 'taskOverdueAtRiskPercent', 15, 'taskOverdueOffTrackPercent', 30,
      'financialAtRiskPercent', 0, 'financialOffTrackPercent', 10, 'riskScoreAtRisk', 10,
      'riskScoreOffTrack', 15, 'benefitBehindProfilePercent', 20, 'dependencyAtRiskWorkingDays', 10),
    'data', jsonb_build_object('retentionMonths', 84)
  );
$$;

-- The health thresholds are read by SQL roll-ups, so their presence and type is enforced.
create function private.valid_org_settings(s jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(s) = 'object'
    and jsonb_typeof(s -> 'health') = 'object'
    and (select bool_and(jsonb_typeof(s -> 'health' -> k) = 'number')
         from unnest(array['scheduleSlipPercent', 'taskOverdueAtRiskPercent', 'taskOverdueOffTrackPercent',
                           'financialAtRiskPercent', 'financialOffTrackPercent', 'riskScoreAtRisk',
                           'riskScoreOffTrack', 'benefitBehindProfilePercent', 'dependencyAtRiskWorkingDays']) k);
$$;

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  brand_colour text,
  logo_path text,
  support_contact text,
  region text not null default 'uk' check (region in ('uk', 'eu')),
  is_demo boolean not null default false,
  settings jsonb not null default private.default_org_settings() check (private.valid_org_settings(settings)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text not null,
  avatar_path text,
  last_organisation_id uuid references public.organisations (id) on delete set null,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_last_organisation_id_idx on public.profiles (last_organisation_id);
create index profiles_email_idx on public.profiles (lower(email));

alter table public.organisations
  add constraint organisations_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;
create index organisations_created_by_idx on public.organisations (created_by);

create table public.organisation_subscriptions (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  plan text not null default 'trial',
  seats_total integer not null default 10 check (seats_total >= 0),
  renewal_date date,
  billing_contact text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisation_members (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  primary key (organisation_id, profile_id)
);
create index organisation_members_profile_id_idx on public.organisation_members (profile_id);
create index organisation_members_created_by_idx on public.organisation_members (created_by);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (organisation_id, name)
);
create index workspaces_created_by_idx on public.workspaces (created_by);

create table public.workspace_members (
  workspace_id uuid not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organisation_id uuid not null,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  primary key (workspace_id, profile_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id) on delete cascade,
  -- A workspace member must be a member of the same organisation.
  foreign key (organisation_id, profile_id) references public.organisation_members (organisation_id, profile_id) on delete cascade
);
create index workspace_members_profile_id_idx on public.workspace_members (profile_id);
create index workspace_members_workspace_org_idx on public.workspace_members (workspace_id, organisation_id);
create index workspace_members_org_profile_idx on public.workspace_members (organisation_id, profile_id);
create index workspace_members_created_by_idx on public.workspace_members (created_by);

create trigger organisations_updated_at before update on public.organisations for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger organisation_subscriptions_updated_at before update on public.organisation_subscriptions for each row execute function private.set_updated_at();
create trigger organisation_members_updated_at before update on public.organisation_members for each row execute function private.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces for each row execute function private.set_updated_at();
create trigger workspace_members_updated_at before update on public.workspace_members for each row execute function private.set_updated_at();

-- created_by defaults to the signed-in user (null for service-role and seed writes).
alter table public.organisations alter column created_by set default auth.uid();
alter table public.organisation_members alter column created_by set default auth.uid();
alter table public.workspaces alter column created_by set default auth.uid();
alter table public.workspace_members alter column created_by set default auth.uid();

-- workspace_members.organisation_id always follows the workspace.
create function private.workspace_members_fill_org()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select w.organisation_id into new.organisation_id from public.workspaces w where w.id = new.workspace_id;
  if new.organisation_id is null then
    raise exception 'Workspace % not found', new.workspace_id using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.organisation_id is distinct from old.organisation_id then
    raise exception 'organisation_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger workspace_members_fill_org before insert or update on public.workspace_members
  for each row execute function private.workspace_members_fill_org();

-- An organisation always keeps at least one admin.
create function private.guard_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if not exists (
      select 1 from public.organisation_members m
      where m.organisation_id = old.organisation_id and m.role = 'admin' and m.profile_id <> old.profile_id
    ) and exists (select 1 from public.organisations o where o.id = old.organisation_id) then
      raise exception 'An organisation must keep at least one admin' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger organisation_members_last_admin before update or delete on public.organisation_members
  for each row execute function private.guard_last_admin();

-- Every auth user gets a profile.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1), 'New user'),
    coalesce(new.email, '')
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.organisation_subscriptions enable row level security;
alter table public.organisation_members enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

revoke all on public.organisations, public.profiles, public.organisation_subscriptions,
  public.organisation_members, public.workspaces, public.workspace_members from anon;
grant select, update on public.organisations to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.organisation_subscriptions to authenticated;
grant select, insert, update, delete on public.organisation_members, public.workspaces, public.workspace_members to authenticated;
