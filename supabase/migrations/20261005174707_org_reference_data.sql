-- Virtual PMO: organisation-level reference data (lists, lifecycle, periods, calendars, templates).
-- Every FK to these tables is composite with organisation_id (review A).

create table public.lookup_values (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  list_key text not null check (list_key ~ '^[a-z_]+$'),
  value text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, list_key, value),
  unique (id, organisation_id, list_key)
);
create index lookup_values_created_by_idx on public.lookup_values (created_by);
create trigger lookup_values_updated_at before update on public.lookup_values
  for each row execute function private.set_updated_at();
alter table public.lookup_values enable row level security;
revoke all on public.lookup_values from anon, authenticated;
grant select, insert, update, delete on public.lookup_values to authenticated;
create policy lookup_values_select on public.lookup_values for select to authenticated
  using (private.is_org_member(organisation_id));
create policy lookup_values_insert on public.lookup_values for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy lookup_values_update on public.lookup_values for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy lookup_values_delete on public.lookup_values for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

create table public.lifecycle_phases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  name text not null,
  short_name text not null,
  description text,
  gate_name text,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (organisation_id, sort_order) deferrable initially deferred,
  unique (organisation_id, name)
);
create index lifecycle_phases_created_by_idx on public.lifecycle_phases (created_by);
create trigger lifecycle_phases_updated_at before update on public.lifecycle_phases
  for each row execute function private.set_updated_at();
alter table public.lifecycle_phases enable row level security;
revoke all on public.lifecycle_phases from anon, authenticated;
grant select, insert, update, delete on public.lifecycle_phases to authenticated;
create policy lifecycle_phases_select on public.lifecycle_phases for select to authenticated
  using (private.is_org_member(organisation_id));
create policy lifecycle_phases_insert on public.lifecycle_phases for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy lifecycle_phases_update on public.lifecycle_phases for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy lifecycle_phases_delete on public.lifecycle_phases for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

create table public.gate_criteria (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  phase_id uuid not null,
  label text not null,
  tiers public.project_tier[] not null default '{small,medium,large}',
  document text,
  check_key public.gate_check_key,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (phase_id, organisation_id) references public.lifecycle_phases (id, organisation_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index gate_criteria_organisation_idx on public.gate_criteria (organisation_id);
create index gate_criteria_phase_idx on public.gate_criteria (phase_id, organisation_id);
create index gate_criteria_created_by_idx on public.gate_criteria (created_by);
create trigger gate_criteria_00_tenant_guard before insert or update on public.gate_criteria
  for each row execute function private.tenant_guard('phase_id', 'lifecycle_phases');
create trigger gate_criteria_updated_at before update on public.gate_criteria
  for each row execute function private.set_updated_at();
alter table public.gate_criteria enable row level security;
revoke all on public.gate_criteria from anon, authenticated;
grant select, insert, update, delete on public.gate_criteria to authenticated;
create policy gate_criteria_select on public.gate_criteria for select to authenticated
  using (private.is_org_member(organisation_id));
create policy gate_criteria_insert on public.gate_criteria for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy gate_criteria_update on public.gate_criteria for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy gate_criteria_delete on public.gate_criteria for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

create table public.benefit_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  label text not null,
  start_date date not null,
  finish_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (organisation_id, label),
  check (finish_date >= start_date)
);
create index benefit_periods_created_by_idx on public.benefit_periods (created_by);
create trigger benefit_periods_updated_at before update on public.benefit_periods
  for each row execute function private.set_updated_at();
alter table public.benefit_periods enable row level security;
revoke all on public.benefit_periods from anon, authenticated;
grant select, insert, update, delete on public.benefit_periods to authenticated;
create policy benefit_periods_select on public.benefit_periods for select to authenticated
  using (private.is_org_member(organisation_id));
create policy benefit_periods_insert on public.benefit_periods for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy benefit_periods_update on public.benefit_periods for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy benefit_periods_delete on public.benefit_periods for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  currency char(3) not null,
  rate numeric(12,6) not null check (rate > 0),
  effective_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (organisation_id, currency, effective_date)
);
create index exchange_rates_created_by_idx on public.exchange_rates (created_by);
create trigger exchange_rates_updated_at before update on public.exchange_rates
  for each row execute function private.set_updated_at();
alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from anon, authenticated;
grant select, insert, update, delete on public.exchange_rates to authenticated;
create policy exchange_rates_select on public.exchange_rates for select to authenticated
  using (private.is_org_member(organisation_id));
create policy exchange_rates_insert on public.exchange_rates for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy exchange_rates_update on public.exchange_rates for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy exchange_rates_delete on public.exchange_rates for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

create table public.holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (organisation_id, name)
);
create index holiday_calendars_created_by_idx on public.holiday_calendars (created_by);
create trigger holiday_calendars_updated_at before update on public.holiday_calendars
  for each row execute function private.set_updated_at();
alter table public.holiday_calendars enable row level security;
revoke all on public.holiday_calendars from anon, authenticated;
grant select, insert, update, delete on public.holiday_calendars to authenticated;
create policy holiday_calendars_select on public.holiday_calendars for select to authenticated
  using (private.is_org_member(organisation_id));
create policy holiday_calendars_insert on public.holiday_calendars for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy holiday_calendars_update on public.holiday_calendars for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy holiday_calendars_delete on public.holiday_calendars for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

create table public.holiday_dates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  calendar_id uuid not null,
  date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (calendar_id, organisation_id) references public.holiday_calendars (id, organisation_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (calendar_id, date)
);
create index holiday_dates_organisation_idx on public.holiday_dates (organisation_id);
create index holiday_dates_calendar_idx on public.holiday_dates (calendar_id, organisation_id);
create index holiday_dates_created_by_idx on public.holiday_dates (created_by);
create trigger holiday_dates_00_tenant_guard before insert or update on public.holiday_dates
  for each row execute function private.tenant_guard('calendar_id', 'holiday_calendars');
create trigger holiday_dates_updated_at before update on public.holiday_dates
  for each row execute function private.set_updated_at();
alter table public.holiday_dates enable row level security;
revoke all on public.holiday_dates from anon, authenticated;
grant select, insert, update, delete on public.holiday_dates to authenticated;
create policy holiday_dates_select on public.holiday_dates for select to authenticated
  using (private.is_org_member(organisation_id));
create policy holiday_dates_insert on public.holiday_dates for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy holiday_dates_update on public.holiday_dates for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy holiday_dates_delete on public.holiday_dates for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  name text not null,
  tier public.project_tier not null,
  description text,
  task_buckets text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (organisation_id, name)
);
create index project_templates_created_by_idx on public.project_templates (created_by);
create trigger project_templates_updated_at before update on public.project_templates
  for each row execute function private.set_updated_at();
alter table public.project_templates enable row level security;
revoke all on public.project_templates from anon, authenticated;
grant select, insert, update, delete on public.project_templates to authenticated;
create policy project_templates_select on public.project_templates for select to authenticated
  using (private.is_org_member(organisation_id));
create policy project_templates_insert on public.project_templates for insert to authenticated
  with check (private.has_org_role(organisation_id, 'pmo'));
create policy project_templates_update on public.project_templates for update to authenticated
  using (private.has_org_role(organisation_id, 'pmo')) with check (private.has_org_role(organisation_id, 'pmo'));
create policy project_templates_delete on public.project_templates for delete to authenticated
  using (private.has_org_role(organisation_id, 'pmo'));
create trigger lookup_values_00_tenant_guard before update on public.lookup_values
  for each row execute function private.tenant_guard();
create trigger lifecycle_phases_00_tenant_guard before update on public.lifecycle_phases
  for each row execute function private.tenant_guard();
create trigger benefit_periods_00_tenant_guard before update on public.benefit_periods
  for each row execute function private.tenant_guard();
create trigger exchange_rates_00_tenant_guard before update on public.exchange_rates
  for each row execute function private.tenant_guard();
create trigger holiday_calendars_00_tenant_guard before update on public.holiday_calendars
  for each row execute function private.tenant_guard();
create trigger project_templates_00_tenant_guard before update on public.project_templates
  for each row execute function private.tenant_guard();
