-- F4: business cases and documents (docs/financials-and-business-cases.md §2.1, §2.2, §2.4).
-- NOT APPLIED. For review. decide_business_case and the hand-off actions are F5.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.business_case_status as enum ('draft', 'submitted', 'approved', 'rejected', 'superseded');
-- The new value is compared as text below, so it can be used in this same transaction.
alter type public.document_scope add value if not exists 'business_case';

-- ---------------------------------------------------------------------------
-- business_case_templates: the organisation's sections (Five Case Model)
-- Organisation-level reference data like lookup_values, so no workspace_id.
-- ---------------------------------------------------------------------------
create table public.business_case_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  title text not null check (length(btrim(title)) between 1 and 120),
  guidance text,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (organisation_id, key)
);
create index business_case_templates_created_by_idx on public.business_case_templates (created_by);
create trigger business_case_templates_updated_at before update on public.business_case_templates
  for each row execute function private.set_updated_at();
create trigger business_case_templates_audit after insert or update on public.business_case_templates
  for each row execute function private.audit_row_change();
revoke all on public.business_case_templates from anon, authenticated;
grant select, insert, update on public.business_case_templates to authenticated;
grant all on public.business_case_templates to service_role;
alter table public.business_case_templates enable row level security;
create policy business_case_templates_select on public.business_case_templates for select to authenticated
  using (organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy business_case_templates_insert on public.business_case_templates for insert to authenticated
  with check (organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[]));
-- No delete: removing a section deactivates it (is_active = false).
create policy business_case_templates_update on public.business_case_templates for update to authenticated
  using (organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[]))
  with check (organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[]));

create function private.seed_business_case_templates(p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.business_case_templates (organisation_id, key, title, guidance, sort_order)
  values
    (p_org, 'strategic', 'Strategic case', 'The case for change and fit with strategy.', 1),
    (p_org, 'economic', 'Economic case', 'Options appraisal and value for money.', 2),
    (p_org, 'commercial', 'Commercial case', 'Procurement and contracts.', 3),
    (p_org, 'financial', 'Financial case', 'Affordability and funding.', 4),
    (p_org, 'management', 'Management case', 'Delivery, governance, risks and benefits plan.', 5)
  on conflict (organisation_id, key) do nothing;
$$;
revoke all on function private.seed_business_case_templates(uuid) from public, anon, authenticated;
grant execute on function private.seed_business_case_templates(uuid) to service_role;

-- New organisations: seeded on insert (keeps seed_org_defaults untouched). Existing: backfilled.
create function private.organisations_seed_business_case_templates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_business_case_templates(new.id);
  return new;
end;
$$;
revoke all on function private.organisations_seed_business_case_templates() from public, anon, authenticated;
create trigger organisations_seed_business_case_templates after insert on public.organisations
  for each row execute function private.organisations_seed_business_case_templates();

select private.seed_business_case_templates(o.id) from public.organisations o;

-- ---------------------------------------------------------------------------
-- business_cases: one per request or project (D3)
-- ---------------------------------------------------------------------------
create table public.business_cases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  request_id uuid unique,
  project_id uuid unique,
  title text not null check (length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (id, workspace_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (request_id, workspace_id) references public.project_requests (id, workspace_id) on delete restrict,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete restrict,
  foreign key (created_by) references public.profiles (id) on delete set null,
  check (num_nonnulls(request_id, project_id) = 1)
);
create index business_cases_workspace_idx on public.business_cases (workspace_id, organisation_id);
create index business_cases_organisation_idx on public.business_cases (organisation_id);
create index business_cases_request_idx on public.business_cases (request_id, workspace_id);
create index business_cases_project_idx on public.business_cases (project_id, workspace_id);
create index business_cases_created_by_idx on public.business_cases (created_by);
create trigger business_cases_00_tenant_guard before insert or update on public.business_cases
  for each row execute function private.tenant_guard('project_id', 'projects', 'request_id', 'project_requests');
create trigger business_cases_updated_at before update on public.business_cases
  for each row execute function private.set_updated_at();
create trigger business_cases_audit after insert or update or delete on public.business_cases
  for each row execute function private.audit_row_change();

-- Cases the caller can edit: project cases where the project is editable (contributor,
-- not archived); request cases for managers, matching request_benefit_drafts.
create function private.my_editable_business_case_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(bc.id), '{}')
  from public.business_cases bc
  where bc.project_id = any (private.my_editable_project_ids())
     or (bc.request_id is not null and bc.workspace_id = any (private.my_workspace_ids('manager')));
$$;
revoke all on function private.my_editable_business_case_ids() from public, anon;
grant execute on function private.my_editable_business_case_ids() to authenticated, service_role;

revoke all on public.business_cases from anon, authenticated;
grant select, insert, update on public.business_cases to authenticated;
grant all on public.business_cases to service_role;
alter table public.business_cases enable row level security;
create policy business_cases_select on public.business_cases for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy business_cases_insert on public.business_cases for insert to authenticated
  with check (case when project_id is not null
    then project_id = any ((select private.my_editable_project_ids())::uuid[])
    else workspace_id = any ((select private.my_workspace_ids('manager'::public.app_role))::uuid[]) end);
-- Title edits only; moving from request to project happens in the F5 conversion RPC.
create policy business_cases_update on public.business_cases for update to authenticated
  using (id = any ((select private.my_editable_business_case_ids())::uuid[]))
  with check (id = any ((select private.my_editable_business_case_ids())::uuid[]));

-- ---------------------------------------------------------------------------
-- business_case_versions
-- ---------------------------------------------------------------------------
create table public.business_case_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  business_case_id uuid not null,
  version integer not null,
  status public.business_case_status not null default 'draft',
  whole_life_cost numeric(14,2),
  funding_requested numeric(14,2),
  preferred_option_id uuid,
  submitted_at timestamptz,
  submitted_by uuid,
  decided_at timestamptz,
  decision_id uuid,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (id, workspace_id),
  unique (business_case_id, version),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (business_case_id, workspace_id) references public.business_cases (id, workspace_id) on delete restrict,
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete restrict,
  foreign key (submitted_by) references public.profiles (id) on delete set null,
  foreign key (recorded_by) references public.profiles (id) on delete set null,
  foreign key (created_by) references public.profiles (id) on delete set null,
  check ((status = 'draft') = (submitted_at is null))
);
create unique index business_case_versions_one_draft on public.business_case_versions (business_case_id) where status = 'draft';
create index business_case_versions_workspace_idx on public.business_case_versions (workspace_id, organisation_id);
create index business_case_versions_organisation_idx on public.business_case_versions (organisation_id);
create index business_case_versions_decision_idx on public.business_case_versions (decision_id, workspace_id);
create index business_case_versions_preferred_idx on public.business_case_versions (preferred_option_id);
create index business_case_versions_submitted_by_idx on public.business_case_versions (submitted_by);
create index business_case_versions_recorded_by_idx on public.business_case_versions (recorded_by);
create index business_case_versions_created_by_idx on public.business_case_versions (created_by);

-- ---------------------------------------------------------------------------
-- business_case_sections, business_case_options, business_case_benefits
-- ---------------------------------------------------------------------------
create table public.business_case_sections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  version_id uuid not null,
  template_id uuid references public.business_case_templates (id) on delete set null,
  key text not null,
  title text not null,
  is_required boolean not null default true,
  content text not null default '' check (length(content) <= 100000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (version_id, key),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (version_id, workspace_id) references public.business_case_versions (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index business_case_sections_workspace_idx on public.business_case_sections (workspace_id, organisation_id);
create index business_case_sections_organisation_idx on public.business_case_sections (organisation_id);
create index business_case_sections_template_idx on public.business_case_sections (template_id);
create index business_case_sections_created_by_idx on public.business_case_sections (created_by);

create table public.business_case_options (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  version_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text,
  whole_life_cost numeric(14,2),
  delivery_cost numeric(14,2),
  benefits_summary text,
  risk_summary text,
  is_preferred boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (id, version_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (version_id, workspace_id) references public.business_case_versions (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create unique index business_case_options_one_preferred on public.business_case_options (version_id) where is_preferred;
create index business_case_options_workspace_idx on public.business_case_options (workspace_id, organisation_id);
create index business_case_options_organisation_idx on public.business_case_options (organisation_id);
create index business_case_options_version_idx on public.business_case_options (version_id, workspace_id);
create index business_case_options_created_by_idx on public.business_case_options (created_by);

-- The preferred option must belong to the same version.
alter table public.business_case_versions
  add foreign key (preferred_option_id, id) references public.business_case_options (id, version_id)
  on delete set null (preferred_option_id) deferrable initially deferred;

create table public.business_case_benefits (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  version_id uuid not null,
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
  foreign key (version_id, workspace_id) references public.business_case_versions (id, workspace_id) on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  foreign key (strategic_objective_id, workspace_id) references public.strategic_objectives (id, workspace_id) on delete set null (strategic_objective_id),
  foreign key (category_id, organisation_id, category_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index business_case_benefits_workspace_idx on public.business_case_benefits (workspace_id, organisation_id);
create index business_case_benefits_organisation_idx on public.business_case_benefits (organisation_id);
create index business_case_benefits_version_idx on public.business_case_benefits (version_id, workspace_id);
create index business_case_benefits_owner_idx on public.business_case_benefits (owner_id, organisation_id);
create index business_case_benefits_objective_idx on public.business_case_benefits (strategic_objective_id, workspace_id);
create index business_case_benefits_created_by_idx on public.business_case_benefits (created_by);

-- Tenant guards, updated_at and audit for the version and its children.
create trigger business_case_versions_00_tenant_guard before insert or update on public.business_case_versions
  for each row execute function private.tenant_guard('business_case_id', 'business_cases');
create trigger business_case_sections_00_tenant_guard before insert or update on public.business_case_sections
  for each row execute function private.tenant_guard('version_id', 'business_case_versions');
create trigger business_case_options_00_tenant_guard before insert or update on public.business_case_options
  for each row execute function private.tenant_guard('version_id', 'business_case_versions');
create trigger business_case_benefits_00_tenant_guard before insert or update on public.business_case_benefits
  for each row execute function private.tenant_guard('version_id', 'business_case_versions');
create trigger business_case_versions_updated_at before update on public.business_case_versions
  for each row execute function private.set_updated_at();
create trigger business_case_sections_updated_at before update on public.business_case_sections
  for each row execute function private.set_updated_at();
create trigger business_case_options_updated_at before update on public.business_case_options
  for each row execute function private.set_updated_at();
create trigger business_case_benefits_updated_at before update on public.business_case_benefits
  for each row execute function private.set_updated_at();
create trigger business_case_versions_audit after insert or update or delete on public.business_case_versions
  for each row execute function private.audit_row_change();
create trigger business_case_sections_audit after insert or update or delete on public.business_case_sections
  for each row execute function private.audit_row_change();
create trigger business_case_options_audit after insert or update or delete on public.business_case_options
  for each row execute function private.audit_row_change();
create trigger business_case_benefits_audit after insert or update or delete on public.business_case_benefits
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- Versioning and freezing (§2.2)
-- ---------------------------------------------------------------------------
-- Versions: number assigned on insert; new rows are always drafts; frozen once submitted.
-- Status changes go through the RPCs, which set private.bc_transition for their transaction.
create function private.business_case_version_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('business_case_versions'), hashtext(new.business_case_id::text));
    new.version := coalesce((select max(v.version) from public.business_case_versions v
      where v.business_case_id = new.business_case_id), 0) + 1;
    new.status := 'draft';
    new.submitted_at := null; new.submitted_by := null;
    new.decided_at := null; new.decision_id := null; new.recorded_by := null;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'This version has been submitted and can''t be changed.' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.business_case_id <> old.business_case_id or new.version <> old.version then
    raise exception 'A version can''t move to another case or be renumbered' using errcode = '42501';
  end if;
  if coalesce(current_setting('private.bc_transition', true), '') <> 'on' then
    if old.status <> 'draft' then
      raise exception 'This version has been submitted and can''t be changed.' using errcode = '42501';
    end if;
    if new.status <> old.status or new.submitted_at is distinct from old.submitted_at
       or new.decided_at is distinct from old.decided_at or new.decision_id is distinct from old.decision_id then
      raise exception 'Use Submit to change the status of a business case' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.business_case_version_rules() from public, anon, authenticated;
create trigger business_case_versions_10_rules before insert or update or delete on public.business_case_versions
  for each row execute function private.business_case_version_rules();

-- Sections, options and benefits: only while their version is a draft.
create function private.business_case_child_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.business_case_status;
begin
  if tg_op = 'UPDATE' and new.version_id <> old.version_id then
    raise exception 'Can''t move content to another version' using errcode = '42501';
  end if;
  -- A version being deleted cascades to its children; the version rule has already checked it.
  select v.status into v_status from public.business_case_versions v
  where v.id = case when tg_op = 'DELETE' then old.version_id else new.version_id end;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'This version has been submitted and can''t be changed.' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.business_case_child_frozen() from public, anon, authenticated;
create trigger business_case_sections_10_frozen before insert or update or delete on public.business_case_sections
  for each row execute function private.business_case_child_frozen();
create trigger business_case_options_10_frozen before insert or update or delete on public.business_case_options
  for each row execute function private.business_case_child_frozen();
create trigger business_case_benefits_10_frozen before insert or update or delete on public.business_case_benefits
  for each row execute function private.business_case_child_frozen();

-- Keep preferred_option_id and is_preferred in step (the options table is the source).
create function private.business_case_options_sync_preferred()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_preferred then
    update public.business_case_versions set preferred_option_id = new.id
    where id = new.version_id and preferred_option_id is distinct from new.id;
  elsif tg_op = 'UPDATE' and old.is_preferred then
    update public.business_case_versions set preferred_option_id = null
    where id = new.version_id and preferred_option_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function private.business_case_options_sync_preferred() from public, anon, authenticated;
create trigger business_case_options_20_sync_preferred after insert or update of is_preferred on public.business_case_options
  for each row execute function private.business_case_options_sync_preferred();

-- RLS: everyone in the workspace reads; editors of the case write (triggers freeze non-drafts).
revoke all on public.business_case_versions, public.business_case_sections,
  public.business_case_options, public.business_case_benefits from anon, authenticated;
grant select, insert, update, delete on public.business_case_versions, public.business_case_sections,
  public.business_case_options, public.business_case_benefits to authenticated;
grant all on public.business_case_versions, public.business_case_sections,
  public.business_case_options, public.business_case_benefits to service_role;
alter table public.business_case_versions enable row level security;
alter table public.business_case_sections enable row level security;
alter table public.business_case_options enable row level security;
alter table public.business_case_benefits enable row level security;

create policy business_case_versions_select on public.business_case_versions for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy business_case_versions_insert on public.business_case_versions for insert to authenticated
  with check (business_case_id = any ((select private.my_editable_business_case_ids())::uuid[]));
create policy business_case_versions_update on public.business_case_versions for update to authenticated
  using (business_case_id = any ((select private.my_editable_business_case_ids())::uuid[]))
  with check (business_case_id = any ((select private.my_editable_business_case_ids())::uuid[]));
create policy business_case_versions_delete on public.business_case_versions for delete to authenticated
  using (business_case_id = any ((select private.my_editable_business_case_ids())::uuid[]));

-- Children: editable through their version's case. A helper returns the editable version ids.
create function private.my_editable_business_case_version_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(v.id), '{}')
  from public.business_case_versions v
  where v.business_case_id = any (private.my_editable_business_case_ids());
$$;
revoke all on function private.my_editable_business_case_version_ids() from public, anon;
grant execute on function private.my_editable_business_case_version_ids() to authenticated, service_role;

create policy business_case_sections_select on public.business_case_sections for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy business_case_sections_insert on public.business_case_sections for insert to authenticated
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]));
create policy business_case_sections_update on public.business_case_sections for update to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]))
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]));
create policy business_case_sections_delete on public.business_case_sections for delete to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]));

create policy business_case_options_select on public.business_case_options for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy business_case_options_insert on public.business_case_options for insert to authenticated
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]));
create policy business_case_options_update on public.business_case_options for update to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]))
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]));
create policy business_case_options_delete on public.business_case_options for delete to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]));

create policy business_case_benefits_select on public.business_case_benefits for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy business_case_benefits_insert on public.business_case_benefits for insert to authenticated
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]));
create policy business_case_benefits_update on public.business_case_benefits for update to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]))
  with check (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]));
create policy business_case_benefits_delete on public.business_case_benefits for delete to authenticated
  using (version_id = any ((select private.my_editable_business_case_version_ids())::uuid[]));

-- ---------------------------------------------------------------------------
-- RPCs (run as the caller, so RLS and the triggers still decide)
-- ---------------------------------------------------------------------------
-- Start a draft: version 1 from the active templates (and, for a request, its benefit
-- drafts), or version n+1 copying the latest version's sections, options and benefits.
create function public.start_business_case_version(p_business_case_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_case public.business_cases;
  v_prev public.business_case_versions;
  v_new uuid;
begin
  select * into v_case from public.business_cases where id = p_business_case_id;
  if v_case.id is null then
    raise exception 'Business case not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.business_case_versions where business_case_id = v_case.id and status = 'draft') then
    raise exception 'This business case already has a draft' using errcode = '23505';
  end if;
  select * into v_prev from public.business_case_versions
  where business_case_id = v_case.id order by version desc limit 1;

  insert into public.business_case_versions (business_case_id, whole_life_cost, funding_requested)
  values (v_case.id, v_prev.whole_life_cost, v_prev.funding_requested)
  returning id into v_new;

  if v_prev.id is null then
    insert into public.business_case_sections (version_id, template_id, key, title, is_required, sort_order)
    select v_new, t.id, t.key, t.title, t.is_required, t.sort_order
    from public.business_case_templates t
    where t.organisation_id = v_case.organisation_id and t.is_active;
    if v_case.request_id is not null then
      insert into public.business_case_benefits (version_id, title, classification, measure, baseline, target,
        annual_value, years_counted, sort_order, owner_id, strategic_objective_id, category_id)
      select v_new, d.title, d.classification, d.measure, d.baseline, d.target,
        d.annual_value, d.years_counted, d.sort_order, d.owner_id, d.strategic_objective_id, d.category_id
      from public.request_benefit_drafts d where d.request_id = v_case.request_id;
    end if;
  else
    insert into public.business_case_sections (version_id, template_id, key, title, is_required, content, sort_order)
    select v_new, s.template_id, s.key, s.title, s.is_required, s.content, s.sort_order
    from public.business_case_sections s where s.version_id = v_prev.id;
    insert into public.business_case_options (version_id, name, description, whole_life_cost, delivery_cost,
      benefits_summary, risk_summary, is_preferred, sort_order)
    select v_new, o.name, o.description, o.whole_life_cost, o.delivery_cost,
      o.benefits_summary, o.risk_summary, o.is_preferred, o.sort_order
    from public.business_case_options o where o.version_id = v_prev.id;
    insert into public.business_case_benefits (version_id, title, classification, measure, baseline, target,
      annual_value, years_counted, sort_order, owner_id, strategic_objective_id, category_id)
    select v_new, b.title, b.classification, b.measure, b.baseline, b.target,
      b.annual_value, b.years_counted, b.sort_order, b.owner_id, b.strategic_objective_id, b.category_id
    from public.business_case_benefits b where b.version_id = v_prev.id;
  end if;
  return v_new;
end;
$$;
revoke all on function public.start_business_case_version(uuid) from public, anon;
grant execute on function public.start_business_case_version(uuid) to authenticated;

create function public.submit_business_case(p_version_id uuid)
returns public.business_case_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.business_case_versions;
  v_preferred public.business_case_options;
  v_empty text;
begin
  select * into v from public.business_case_versions where id = p_version_id for update;
  if v.id is null then
    raise exception 'Business case version not found' using errcode = 'P0002';
  end if;
  if v.status <> 'draft' then
    raise exception 'Only a draft can be submitted' using errcode = '22023';
  end if;
  if (select count(*) from public.business_case_options where version_id = v.id and is_preferred) <> 1 then
    raise exception 'Choose exactly one preferred option before submitting' using errcode = '22023';
  end if;
  select * into v_preferred from public.business_case_options where version_id = v.id and is_preferred;
  if v_preferred.whole_life_cost is null or v_preferred.delivery_cost is null then
    raise exception 'The preferred option needs a whole-life cost and a delivery cost' using errcode = '22023';
  end if;
  select string_agg(s.title, ', ' order by s.sort_order) into v_empty
  from public.business_case_sections s
  where s.version_id = v.id and s.is_required and btrim(s.content) = '';
  if v_empty is not null then
    raise exception 'Complete these sections before submitting: %', v_empty using errcode = '22023';
  end if;

  perform set_config('private.bc_transition', 'on', true);
  update public.business_case_versions
  set status = 'submitted', submitted_at = now(), submitted_by = (select auth.uid()),
      preferred_option_id = v_preferred.id,
      whole_life_cost = coalesce(whole_life_cost, v_preferred.whole_life_cost)
  where id = v.id
  returning * into v;
  perform set_config('private.bc_transition', '', true);
  return v;
end;
$$;
revoke all on function public.submit_business_case(uuid) from public, anon;
grant execute on function public.submit_business_case(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Documents: business-case scope (D6), and removing an incomplete upload (§2.4)
-- ---------------------------------------------------------------------------
alter table public.documents add column business_case_id uuid;
alter table public.documents
  add constraint documents_business_case_fk foreign key (business_case_id, workspace_id)
    references public.business_cases (id, workspace_id) on delete restrict,
  drop constraint documents_check,
  add constraint documents_one_owner check (num_nonnulls(project_id, programme_id, capability_id, business_case_id) = 1),
  add constraint documents_business_case_scope check ((scope::text = 'business_case') = (business_case_id is not null));
create index documents_business_case_idx on public.documents (business_case_id, workspace_id);

drop trigger documents_00_tenant_guard on public.documents;
create trigger documents_00_tenant_guard before insert or update on public.documents
  for each row execute function private.tenant_guard('project_id', 'projects', 'programme_id', 'programmes',
    'capability_id', 'capabilities', 'business_case_id', 'business_cases');

create or replace function private.document_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'archived_at') is distinct from (to_jsonb(old) - 'archived_at') then
      raise exception 'Documents are immutable; upload a new version instead' using errcode = '42501';
    end if;
    return new;
  end if;
  new.version := coalesce((select max(d.version) from public.documents d
    where d.file_name = new.file_name
      and d.project_id is not distinct from new.project_id
      and d.programme_id is not distinct from new.programme_id
      and d.capability_id is not distinct from new.capability_id
      and d.business_case_id is not distinct from new.business_case_id), 0) + 1;
  new.storage_path := concat_ws('/', new.organisation_id, new.workspace_id, new.scope,
    coalesce(new.project_id, new.programme_id, new.capability_id, new.business_case_id), new.id, new.file_name);
  return new;
end;
$$;

-- Business-case documents: whoever can edit the case. Others unchanged.
alter policy documents_insert on public.documents
  with check (
    case when scope::text = 'business_case' then business_case_id = any ((select private.my_editable_business_case_ids())::uuid[])
         when scope = 'programme' then workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
         else workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]) end);

create or replace function private.can_upload_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name and d.archived_at is null
      and case when d.scope::text = 'business_case' then d.business_case_id = any (private.my_editable_business_case_ids())
               else private.has_workspace_role(d.workspace_id, case when d.scope = 'programme' then 'manager'::public.app_role else 'contributor'::public.app_role end) end);
$$;

-- "Remove" for an upload that never completed: the uploader, only while no object exists.
create function private.my_incomplete_document_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(d.id), '{}')
  from public.documents d
  where d.uploaded_by = (select auth.uid())
    and not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = d.storage_path);
$$;
revoke all on function private.my_incomplete_document_ids() from public, anon;
grant execute on function private.my_incomplete_document_ids() to authenticated, service_role;

grant delete on public.documents to authenticated;
create policy documents_delete on public.documents for delete to authenticated
  using (id = any ((select private.my_incomplete_document_ids())::uuid[]));
-- The audit trigger also records removals.
drop trigger documents_audit on public.documents;
create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function private.audit_row_change();
