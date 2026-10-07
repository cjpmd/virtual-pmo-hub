-- Benefits pathway (Stage BP2, docs/benefits-pathway.md): capability and outcome dates, status,
-- acceptance and indicators; the three RAG views; the project and programme benefit dimension
-- read from the pathway; monthly pathway snapshots.

-- ---------------------------------------------------------------------------
-- Settings: four new health thresholds, required and numeric like the others. The check now
-- rejects a missing key too: bool_and skipped the null that a missing key produced, so a
-- health object without a key passed (and the views then read a null threshold).
-- ---------------------------------------------------------------------------
create or replace function private.default_org_settings()
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
      'riskScoreOffTrack', 15, 'benefitBehindProfilePercent', 20, 'dependencyAtRiskWorkingDays', 10,
      'capabilitySlipAmberDays', 30, 'acceptanceGraceDays', 0,
      'outcomeBehindTrajectoryAmberPercent', 10, 'outcomeBehindTrajectoryRedPercent', 25),
    'benefits', jsonb_build_object('optimismBias', jsonb_build_array(
      jsonb_build_object('category', 'Efficiency', 'percentage', 20),
      jsonb_build_object('category', 'Income', 'percentage', 30),
      jsonb_build_object('category', 'Student experience', 'percentage', 25),
      jsonb_build_object('category', 'Research', 'percentage', 25),
      jsonb_build_object('category', 'Risk reduction', 'percentage', 15),
      jsonb_build_object('category', 'Compliance', 'percentage', 10),
      jsonb_build_object('category', 'Sustainability', 'percentage', 15))),
    'data', jsonb_build_object('retentionMonths', 84)
  );
$$;

-- Existing organisations get the default for any health key they don't have (before the rule tightens).
update public.organisations o
set settings = jsonb_set(o.settings, '{health}',
  (private.default_org_settings() -> 'health') || coalesce(o.settings -> 'health', '{}'::jsonb))
where not coalesce(o.settings -> 'health' ?& array['scheduleSlipPercent', 'taskOverdueAtRiskPercent',
  'taskOverdueOffTrackPercent', 'financialAtRiskPercent', 'financialOffTrackPercent', 'riskScoreAtRisk',
  'riskScoreOffTrack', 'benefitBehindProfilePercent', 'dependencyAtRiskWorkingDays', 'capabilitySlipAmberDays',
  'acceptanceGraceDays', 'outcomeBehindTrajectoryAmberPercent', 'outcomeBehindTrajectoryRedPercent'], false);

create or replace function private.valid_org_settings(s jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(s) = 'object'
    and jsonb_typeof(s -> 'health') = 'object'
    and (select bool_and(coalesce(jsonb_typeof(s -> 'health' -> k) = 'number', false))
         from unnest(array['scheduleSlipPercent', 'taskOverdueAtRiskPercent', 'taskOverdueOffTrackPercent',
                           'financialAtRiskPercent', 'financialOffTrackPercent', 'riskScoreAtRisk',
                           'riskScoreOffTrack', 'benefitBehindProfilePercent', 'dependencyAtRiskWorkingDays',
                           'capabilitySlipAmberDays', 'acceptanceGraceDays',
                           'outcomeBehindTrajectoryAmberPercent', 'outcomeBehindTrajectoryRedPercent']) k)
    and private.valid_optimism_bias(s -> 'benefits' -> 'optimismBias');
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.capability_status as enum ('planned', 'in_progress', 'delivered', 'accepted');
create type public.outcome_status as enum ('planned', 'emerging', 'achieved', 'not_achieved');
-- F4 adds 'business_case' (and its column) when the business case tables exist.
create type public.document_scope as enum ('project', 'programme', 'capability');

-- ---------------------------------------------------------------------------
-- Capabilities: status, dates, acceptance. Only 'accepted' counts as delivered.
-- ---------------------------------------------------------------------------
alter table public.capabilities
  add column status public.capability_status not null default 'planned',
  add column target_date date,
  add column forecast_date date,
  add column delivered_date date,
  add column accepted_at date,
  add column accepted_by_id uuid,
  add column acceptance_note text,
  add column archived_at timestamptz,
  add constraint capabilities_accepted_by_fkey foreign key (accepted_by_id, organisation_id)
    references public.resources (id, organisation_id) on delete set null (accepted_by_id),
  add constraint capabilities_target_required check (status = 'planned' or target_date is not null),
  add constraint capabilities_delivered_date check ((status in ('delivered', 'accepted')) = (delivered_date is not null)),
  add constraint capabilities_accepted_fields check ((status = 'accepted') = (accepted_at is not null and accepted_by_id is not null)),
  add constraint capabilities_accepted_after_delivery check (accepted_at is null or accepted_at >= delivered_date);
create index capabilities_accepted_by_idx on public.capabilities (accepted_by_id, organisation_id);
create index capabilities_programme_status_idx on public.capabilities (programme_id, status);

-- Acceptance needs a manager or PMO and stored evidence; leaving 'accepted' needs PMO.
-- Server-side jobs (no signed-in user) skip the role checks; the seed also skips the
-- evidence check, because its evidence files are uploaded afterwards by
-- scripts/seed-demo-files.ts (documents rows are never created without the stored object).
create function private.capability_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if new.forecast_date is null then
    new.forecast_date := new.target_date;
  end if;
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    if uid is not null and not private.has_workspace_role(new.workspace_id, 'manager') then
      raise exception 'Only managers and PMO can record acceptance' using errcode = '42501';
    end if;
    if current_setting('vpmo.seeding', true) is distinct from 'on' and not exists (
      select 1 from public.documents doc
      join storage.objects so on so.bucket_id = 'documents' and so.name = doc.storage_path
      where doc.capability_id = new.id and doc.archived_at is null) then
      raise exception 'Attach the acceptance evidence first' using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'accepted' and new.status <> 'accepted' then
    if uid is not null and not private.has_workspace_role(new.workspace_id, 'pmo') then
      raise exception 'Only PMO can reverse an acceptance' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.capability_rules() from public, anon, authenticated;
-- After the tenant guard (00), which fills workspace_id on insert.
create trigger capabilities_10_rules before insert or update on public.capabilities
  for each row execute function private.capability_rules();
create trigger capabilities_audit after insert or update or delete on public.capabilities
  for each row execute function private.audit_row_change();

-- Forecast history: one row per capability per day, written only by the trigger.
create table public.capability_forecast_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  capability_id uuid not null,
  reporting_date date not null,
  forecast_date date not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (capability_id, workspace_id) references public.capabilities (id, workspace_id) on delete restrict,
  unique (capability_id, reporting_date)
);
create index capability_forecast_history_workspace_idx on public.capability_forecast_history (workspace_id, organisation_id);
create index capability_forecast_history_organisation_idx on public.capability_forecast_history (organisation_id);
create index capability_forecast_history_created_by_idx on public.capability_forecast_history (created_by);
create trigger capability_forecast_history_00_tenant_guard before insert or update on public.capability_forecast_history
  for each row execute function private.tenant_guard('capability_id', 'capabilities');
alter table public.capability_forecast_history enable row level security;
revoke all on public.capability_forecast_history from anon, authenticated;
grant select on public.capability_forecast_history to authenticated;
create policy capability_forecast_history_select on public.capability_forecast_history for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));

create function private.record_capability_forecast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.forecast_date is not null and (tg_op = 'INSERT' or new.forecast_date is distinct from old.forecast_date) then
    insert into public.capability_forecast_history (capability_id, reporting_date, forecast_date)
    values (new.id, private.org_today(new.organisation_id), new.forecast_date)
    on conflict (capability_id, reporting_date) do update set forecast_date = excluded.forecast_date;
  end if;
  return null;
end;
$$;
revoke all on function private.record_capability_forecast() from public, anon, authenticated;
create trigger capabilities_forecast_history after insert or update of forecast_date on public.capabilities
  for each row execute function private.record_capability_forecast();

-- ---------------------------------------------------------------------------
-- Documents (BP-7: the F4 table, created here with the capability scope). Typed owner FKs;
-- never deleted, archived instead. storage_path is set by the trigger.
-- ---------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  scope public.document_scope not null,
  project_id uuid,
  programme_id uuid,
  capability_id uuid,
  file_name text not null check (length(btrim(file_name)) between 1 and 200 and file_name !~ '[/\\]'),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation')),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  version integer not null default 1,
  storage_path text not null unique,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete restrict,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete restrict,
  foreign key (capability_id, workspace_id) references public.capabilities (id, workspace_id) on delete restrict,
  check (num_nonnulls(project_id, programme_id, capability_id) = 1),
  check ((scope = 'project') = (project_id is not null)),
  check ((scope = 'programme') = (programme_id is not null)),
  check ((scope = 'capability') = (capability_id is not null))
);
create index documents_workspace_idx on public.documents (workspace_id, organisation_id);
create index documents_organisation_idx on public.documents (organisation_id);
create index documents_project_idx on public.documents (project_id, workspace_id);
create index documents_programme_idx on public.documents (programme_id, workspace_id);
create index documents_capability_idx on public.documents (capability_id, workspace_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);
create trigger documents_00_tenant_guard before insert or update on public.documents
  for each row execute function private.tenant_guard('project_id', 'projects', 'programme_id', 'programmes', 'capability_id', 'capabilities');

create function private.document_defaults()
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
      and d.capability_id is not distinct from new.capability_id), 0) + 1;
  new.storage_path := concat_ws('/', new.organisation_id, new.workspace_id, new.scope,
    coalesce(new.project_id, new.programme_id, new.capability_id), new.id, new.file_name);
  return new;
end;
$$;
revoke all on function private.document_defaults() from public, anon, authenticated;
create trigger documents_10_defaults before insert or update on public.documents
  for each row execute function private.document_defaults();
create trigger documents_audit after insert or update on public.documents
  for each row execute function private.audit_row_change();

alter table public.documents enable row level security;
revoke all on public.documents from anon, authenticated;
grant select, insert, update on public.documents to authenticated;
create policy documents_select on public.documents for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
-- Contributors for project and capability documents; managers for programme documents.
create policy documents_insert on public.documents for insert to authenticated
  with check (
    case when scope = 'programme' then workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
         else workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]) end);
-- Update is archive only (the trigger rejects anything else).
create policy documents_update on public.documents for update to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]))
  with check (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;

-- Storage policies stay one per action: the documents bucket is added to each. Upload only to
-- the path of a documents row the caller can see and insert; no update or delete.
create function private.can_upload_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_name and d.archived_at is null
      and private.has_workspace_role(d.workspace_id, case when d.scope = 'programme' then 'manager'::public.app_role else 'contributor'::public.app_role end));
$$;
revoke all on function private.can_upload_document(text) from public, anon;
grant execute on function private.can_upload_document(text) to authenticated, service_role;

alter policy vpmo_objects_select on storage.objects
  using (
    (bucket_id = 'org-assets' and private.is_org_member(private.try_uuid((storage.foldername(name))[1])))
    or (bucket_id in ('attachments', 'evidence') and private.is_workspace_member(private.storage_workspace(name)))
    or (bucket_id = 'documents' and private.storage_workspace(name) = any ((select private.my_workspace_ids())::uuid[])));
alter policy vpmo_objects_insert on storage.objects
  with check (
    (bucket_id = 'org-assets' and private.has_org_role(private.try_uuid((storage.foldername(name))[1]), 'admin'))
    or (bucket_id in ('attachments', 'evidence') and private.has_workspace_role(private.storage_workspace(name), 'contributor'))
    or (bucket_id = 'documents' and private.can_upload_document(name)));

-- ---------------------------------------------------------------------------
-- Outcomes: status and target date; indicators and their measurements.
-- ---------------------------------------------------------------------------
alter table public.outcomes
  add column status public.outcome_status not null default 'planned',
  add column target_date date,
  add column achieved_date date,
  add column archived_at timestamptz,
  add constraint outcomes_achieved_date check ((status = 'achieved') = (achieved_date is not null));

create function private.outcome_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (new.status in ('achieved', 'not_achieved') or (tg_op = 'UPDATE' and old.status in ('achieved', 'not_achieved')))
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and not private.has_workspace_role(new.workspace_id, 'pmo') then
    raise exception 'Only PMO can set or reverse achieved and not achieved' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.outcome_rules() from public, anon, authenticated;
create trigger outcomes_10_rules before insert or update on public.outcomes
  for each row execute function private.outcome_rules();
create trigger outcomes_audit after insert or update or delete on public.outcomes
  for each row execute function private.audit_row_change();

create table public.outcome_indicators (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  outcome_id uuid not null,
  name text not null,
  unit text,
  baseline_value numeric not null,
  baseline_date date not null,
  target_value numeric not null,
  target_date date not null,
  frequency public.measure_frequency not null default 'quarterly',
  next_due_date date,
  data_source text,
  measurement_method text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (outcome_id, workspace_id) references public.outcomes (id, workspace_id) on delete cascade,
  unique (id, workspace_id),
  check (target_value <> baseline_value),
  check (target_date > baseline_date)
);
create index outcome_indicators_workspace_idx on public.outcome_indicators (workspace_id, organisation_id);
create index outcome_indicators_organisation_idx on public.outcome_indicators (organisation_id);
create index outcome_indicators_outcome_idx on public.outcome_indicators (outcome_id, workspace_id);
create index outcome_indicators_created_by_idx on public.outcome_indicators (created_by);
create trigger outcome_indicators_00_tenant_guard before insert or update on public.outcome_indicators
  for each row execute function private.tenant_guard('outcome_id', 'outcomes');
create trigger outcome_indicators_updated_at before update on public.outcome_indicators
  for each row execute function private.set_updated_at();
alter table public.outcome_indicators enable row level security;
revoke all on public.outcome_indicators from anon, authenticated;
grant select, insert, update, delete on public.outcome_indicators to authenticated;
create policy outcome_indicators_select on public.outcome_indicators for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy outcome_indicators_insert on public.outcome_indicators for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]));
create policy outcome_indicators_update on public.outcome_indicators for update to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]))
  with check (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]));
create policy outcome_indicators_delete on public.outcome_indicators for delete to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[]));

create table public.outcome_indicator_measurements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  indicator_id uuid not null,
  measured_on date not null,
  actual_value numeric not null,
  evidence text,
  evidence_path text,
  notes text,
  submitted_date date,
  validated_date date,
  query_note text,
  status public.measurement_status not null default 'submitted',
  submitted_by_id uuid,
  validated_by_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (indicator_id, workspace_id) references public.outcome_indicators (id, workspace_id) on delete cascade,
  foreign key (submitted_by_id, organisation_id) references public.resources (id, organisation_id) on delete set null (submitted_by_id),
  foreign key (validated_by_id, organisation_id) references public.resources (id, organisation_id) on delete set null (validated_by_id)
);
create index outcome_indicator_measurements_workspace_idx on public.outcome_indicator_measurements (workspace_id, organisation_id);
create index outcome_indicator_measurements_organisation_idx on public.outcome_indicator_measurements (organisation_id);
create index outcome_indicator_measurements_indicator_idx on public.outcome_indicator_measurements (indicator_id, workspace_id);
create index outcome_indicator_measurements_latest_idx on public.outcome_indicator_measurements (indicator_id, measured_on desc);
create index outcome_indicator_measurements_submitted_by_idx on public.outcome_indicator_measurements (submitted_by_id, organisation_id);
create index outcome_indicator_measurements_validated_by_idx on public.outcome_indicator_measurements (validated_by_id, organisation_id);
create index outcome_indicator_measurements_created_by_idx on public.outcome_indicator_measurements (created_by);
create trigger outcome_indicator_measurements_00_tenant_guard before insert or update on public.outcome_indicator_measurements
  for each row execute function private.tenant_guard('indicator_id', 'outcome_indicators');
-- The benefit measurement rule is generic: only PMO can validate or query.
create trigger outcome_indicator_measurements_10_validation before insert or update on public.outcome_indicator_measurements
  for each row execute function private.benefit_measurement_validation();
create trigger outcome_indicator_measurements_updated_at before update on public.outcome_indicator_measurements
  for each row execute function private.set_updated_at();
create trigger outcome_indicator_measurements_audit after insert or update or delete on public.outcome_indicator_measurements
  for each row execute function private.audit_row_change();
alter table public.outcome_indicator_measurements enable row level security;
revoke all on public.outcome_indicator_measurements from anon, authenticated;
grant select, insert, update, delete on public.outcome_indicator_measurements to authenticated;
create policy outcome_indicator_measurements_select on public.outcome_indicator_measurements for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy outcome_indicator_measurements_insert on public.outcome_indicator_measurements for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]));
create policy outcome_indicator_measurements_update on public.outcome_indicator_measurements for update to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]))
  with check (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]));
create policy outcome_indicator_measurements_delete on public.outcome_indicator_measurements for delete to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[]));

-- ---------------------------------------------------------------------------
-- Benefits: realisation start. Null = readiness phase. Required to move into realisation.
-- ---------------------------------------------------------------------------
alter table public.benefits add column realisation_start_date date;

-- Benefits already in realisation start at their first profiled period with a target (or
-- measurement), else the day they were created.
update public.benefits b
set realisation_start_date = coalesce(
  (select min(bp.start_date) from public.benefit_measures m
   join public.benefit_measure_targets t on t.measure_id = m.id
   join public.benefit_periods bp on bp.id = t.period_id
   where m.benefit_id = b.id),
  (select min(bp.start_date) from public.benefit_measures m
   join public.benefit_measurements x on x.measure_id = m.id
   join public.benefit_periods bp on bp.id = x.period_id
   where m.benefit_id = b.id),
  b.created_at::date)
where b.status in ('in_realisation', 'realised', 'partially_realised', 'not_realised')
  and b.realisation_start_date is null;

create function private.benefit_realisation_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('in_realisation', 'realised', 'partially_realised', 'not_realised')
     and new.realisation_start_date is null then
    raise exception 'Set the realisation start date before moving this benefit into realisation' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.benefit_realisation_start() from public, anon, authenticated;
create trigger benefits_10_realisation_start before insert or update of status, realisation_start_date on public.benefits
  for each row execute function private.benefit_realisation_start();

-- ---------------------------------------------------------------------------
-- Project delivery health: the four delivery dimensions, without the benefit dimension, so
-- capability health can read it without a loop (BP-1, BP-2). Same rules as before.
-- ---------------------------------------------------------------------------
create view public.v_project_delivery_health with (security_invoker = true) as
with base as (
  select p.*, o.settings, private.org_today(p.organisation_id) as today,
    s.task_count, s.overdue_count
  from public.v_projects p
  join public.organisations o on o.id = p.organisation_id
  join public.v_project_task_stats s on s.project_id = p.id
),
dims as materialized (
  select
    base.id,
    case
      when exists (select 1 from public.v_milestones m where m.project_id = base.id and m.status = 'overdue') then 'red'::public.health
      when (base.baseline_finish_date - base.start_date) > 0
        and (base.finish_date - base.baseline_finish_date)::numeric / (base.baseline_finish_date - base.start_date)
            > private.health_threshold(base.settings, 'scheduleSlipPercent') / 100 then 'red'::public.health
      when base.task_count > 0
        and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueAtRiskPercent') / 100 then 'amber'::public.health
      else 'green'::public.health
    end as schedule,
    case
      when not base.has_baseline then 'not_set'::public.health
      when base.forecast > base.budget * (1 + private.health_threshold(base.settings, 'financialOffTrackPercent') / 100) then 'red'::public.health
      when base.forecast > base.budget * (1 + private.health_threshold(base.settings, 'financialAtRiskPercent') / 100) then 'amber'::public.health
      else 'green'::public.health
    end as financial,
    case
      when base.task_count > 0 and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueOffTrackPercent') / 100 then 'red'::public.health
      when base.task_count > 0 and base.overdue_count::numeric / base.task_count > private.health_threshold(base.settings, 'taskOverdueAtRiskPercent') / 100 then 'amber'::public.health
      else 'green'::public.health
    end as effort,
    case
      when exists (select 1 from public.issues i where i.project_id = base.id and i.status = 'open' and i.severity = 'high')
        or exists (select 1 from public.risks r where r.project_id = base.id and r.status = 'open'
                   and r.score >= private.health_threshold(base.settings, 'riskScoreOffTrack')) then 'red'::public.health
      when exists (select 1 from public.issues i where i.project_id = base.id and i.status = 'open')
        or exists (select 1 from public.risks r where r.project_id = base.id and r.status = 'open'
                   and r.score >= private.health_threshold(base.settings, 'riskScoreAtRisk')) then 'amber'::public.health
      else 'green'::public.health
    end as issue
  from base
)
select
  base.id as project_id,
  base.organisation_id,
  base.workspace_id,
  base.programme_id,
  base.effective_portfolio_id,
  base.code,
  base.state,
  base.phase_index,
  base.health_override,
  base.finish_date,
  dims.schedule, dims.financial, dims.effort, dims.issue,
  greatest(dims.schedule, dims.financial, dims.effort, dims.issue) as delivery
from base join dims on dims.id = base.id;

-- ---------------------------------------------------------------------------
-- Capability health. First match wins:
--   accepted → green (complete); no target date → not_set (nothing to judge yet);
--   delivered and within the acceptance grace → amber; past target (plus grace when
--   delivered) → red; a delivering project off track → red; forecast slip >
--   capabilitySlipAmberDays → amber; a delivering project at risk → amber; otherwise green.
-- One definition, used by v_capability_health and by the project and programme roll-ups (which
-- pass in delivery health they have already computed, so it is worked out once per query).
-- Reads no tables.
-- ---------------------------------------------------------------------------
create function private.capability_rag(
  p_status public.capability_status, p_target date, p_forecast date, p_accepted_at date, p_today date,
  p_grace integer, p_slip_amber numeric, p_red_projects text, p_amber_projects text,
  out rag public.health, out reason text)
language sql
stable
set search_path = ''
as $$
  select
    (case r.rule when 1 then 'green' when 2 then 'not_set' when 3 then 'amber' when 4 then 'red' when 5 then 'red'
       when 6 then 'amber' when 7 then 'amber' else 'green' end)::public.health,
    case r.rule
      when 1 then 'Accepted ' || to_char(p_accepted_at, 'DD/MM/YYYY')
      when 2 then 'No target date'
      when 3 then 'Awaiting acceptance'
      when 4 then case when p_status = 'delivered'
                    then 'Past target date (' || to_char(p_target, 'DD/MM/YYYY') || ') and awaiting acceptance'
                    else 'Past target date (' || to_char(p_target, 'DD/MM/YYYY') || ') and not accepted' end
      when 5 then 'Delivering project off track: ' || p_red_projects
      when 6 then 'Forecast ' || (p_forecast - p_target) || ' days beyond target'
      when 7 then 'Delivering project at risk: ' || p_amber_projects
      else case when p_status = 'delivered'
             then 'Delivered, acceptance due by ' || to_char(p_target, 'DD/MM/YYYY')
             else 'On track' end
    end
  from (select case
      when p_status = 'accepted' then 1
      when p_target is null then 2
      when p_status = 'delivered' and p_target < p_today and p_target + coalesce(p_grace, 0) >= p_today then 3
      when p_target < p_today and (p_status <> 'delivered' or p_target + coalesce(p_grace, 0) < p_today) then 4
      when p_red_projects is not null then 5
      when p_forecast - p_target > p_slip_amber then 6
      when p_amber_projects is not null then 7
      else 8
    end as rule) r;
$$;
revoke all on function private.capability_rag(public.capability_status, date, date, date, date, integer, numeric, text, text) from public, anon;
grant execute on function private.capability_rag(public.capability_status, date, date, date, date, integer, numeric, text, text) to authenticated, service_role;

create view public.v_capability_health with (security_invoker = true) as
with base as (
  select c.*, private.org_today(c.organisation_id) as today, o.settings
  from public.capabilities c
  join public.organisations o on o.id = c.organisation_id
  where c.archived_at is null
),
delivery as materialized (
  select cp.capability_id,
    string_agg(d.code, ', ' order by d.code) filter (where d.delivery = 'red') as red_projects,
    string_agg(d.code, ', ' order by d.code) filter (where d.delivery = 'amber') as amber_projects
  from public.capability_projects cp
  join public.v_project_delivery_health d on d.project_id = cp.project_id
  where d.state <> 'closed'
  group by cp.capability_id
)
select
  base.id as capability_id,
  base.organisation_id,
  base.workspace_id,
  base.programme_id,
  base.title,
  base.status,
  base.target_date,
  base.forecast_date,
  (base.forecast_date - base.target_date) as slip_days,
  base.status = 'accepted' as is_complete,
  (base.status = 'delivered' and base.target_date < base.today) as awaiting_acceptance_past_target,
  x.rag,
  x.reason
from base
left join delivery dl on dl.capability_id = base.id
cross join lateral private.capability_rag(base.status, base.target_date, base.forecast_date, base.accepted_at, base.today,
  private.health_threshold(base.settings, 'acceptanceGraceDays')::integer,
  private.health_threshold(base.settings, 'capabilitySlipAmberDays'), dl.red_projects, dl.amber_projects) x;

-- ---------------------------------------------------------------------------
-- Indicator health against a straight-line trajectory from baseline to target. The counted
-- measurement is the latest by measured_on; on the same date validated beats submitted;
-- queried never counts.
-- ---------------------------------------------------------------------------
create view public.v_outcome_indicator_health with (security_invoker = true) as
with base as (
  select i.*, private.org_today(i.organisation_id) as today,
    private.health_threshold(o.settings, 'outcomeBehindTrajectoryAmberPercent') as amber_pct,
    private.health_threshold(o.settings, 'outcomeBehindTrajectoryRedPercent') as red_pct
  from public.outcome_indicators i
  join public.organisations o on o.id = i.organisation_id
),
counted as (
  select base.*, m.id as measurement_id, m.measured_on, m.actual_value, m.status as measurement_status,
    base.baseline_value + (base.target_value - base.baseline_value)
      * private.clamp((m.measured_on - base.baseline_date)::numeric / (base.target_date - base.baseline_date), 0, 1) as expected_value
  from base
  left join lateral (
    select x.id, x.measured_on, x.actual_value, x.status
    from public.outcome_indicator_measurements x
    where x.indicator_id = base.id and x.status <> 'queried'
    order by x.measured_on desc, (x.status = 'validated') desc, x.submitted_date nulls last, x.created_at, x.id
    limit 1
  ) m on true
),
calc as (
  select counted.*,
    case when counted.measurement_id is null then null
         else greatest(0, (counted.expected_value - counted.actual_value) / (counted.target_value - counted.baseline_value)) * 100
    end as shortfall_percent,
    (counted.next_due_date < counted.today) as measurement_overdue
  from counted
)
select
  c.id as indicator_id,
  c.organisation_id,
  c.workspace_id,
  c.outcome_id,
  c.name,
  c.unit,
  c.baseline_value, c.baseline_date, c.target_value, c.target_date,
  c.measurement_id, c.measured_on, c.actual_value, c.measurement_status,
  c.expected_value,
  round(c.shortfall_percent, 1) as shortfall_percent,
  c.measurement_overdue,
  (case
     when c.measurement_id is not null and c.shortfall_percent > c.red_pct then 'red'
     when c.measurement_id is not null and c.shortfall_percent > c.amber_pct then 'amber'
     when c.measurement_overdue then 'amber'
     when c.measurement_id is not null then 'green'
     else 'not_set'
   end)::public.health as rag,
  case
    when c.measurement_id is not null and c.shortfall_percent > c.amber_pct
      then round(c.shortfall_percent) || '% behind trajectory'
    when c.measurement_overdue then 'Measurement overdue'
    when c.measurement_id is not null then 'On trajectory'
    else 'Not measured yet'
  end as reason
from calc c;

-- ---------------------------------------------------------------------------
-- Outcome health. First match wins: achieved → green (complete); not achieved → red; past
-- target and not achieved → red; any measured indicator → worst of the measured (and overdue)
-- indicators; otherwise worst of the enabling capabilities; otherwise not_set.
-- ---------------------------------------------------------------------------
create view public.v_outcome_health with (security_invoker = true) as
with base as (
  select oc.*, private.org_today(oc.organisation_id) as today
  from public.outcomes oc
  where oc.archived_at is null
),
indicators as materialized (
  select ih.outcome_id,
    bool_or(ih.measurement_id is not null) as any_measured,
    max(ih.rag) filter (where ih.rag <> 'not_set') as worst,
    (array_agg(ih.name || ': ' || ih.reason order by ih.rag desc, ih.name) filter (where ih.rag <> 'not_set'))[1] as worst_reason
  from public.v_outcome_indicator_health ih
  group by ih.outcome_id
),
capabilities as materialized (
  select x.outcome_id, max(ch.rag) as worst,
    (array_agg(ch.title || ': ' || ch.reason order by ch.rag desc, ch.title))[1] as worst_reason
  from public.outcome_capabilities x
  join public.v_capability_health ch on ch.capability_id = x.capability_id
  group by x.outcome_id
)
select
  base.id as outcome_id,
  base.organisation_id,
  base.workspace_id,
  base.programme_id,
  base.title,
  base.status,
  base.target_date,
  base.status = 'achieved' as is_complete,
  case
    when base.status = 'achieved' then 'green'::public.health
    when base.status = 'not_achieved' then 'red'::public.health
    when base.target_date < base.today then 'red'::public.health
    when coalesce(ind.any_measured, false) then ind.worst
    when cap.worst is not null then cap.worst
    else 'not_set'::public.health
  end as rag,
  case
    when base.status = 'achieved' then 'Achieved ' || to_char(base.achieved_date, 'DD/MM/YYYY')
    when base.status = 'not_achieved' then 'Not achieved'
    when base.target_date < base.today then 'Past target date (' || to_char(base.target_date, 'DD/MM/YYYY') || ') and not achieved'
    when coalesce(ind.any_measured, false) then ind.worst_reason
    when cap.worst is not null then 'Enabling capability ' || cap.worst_reason
    else 'No indicators measured and no enabling capabilities'
  end as reason,
  coalesce(ind.any_measured, false) as indicator_driven
from base
left join indicators ind on ind.outcome_id = base.id
left join capabilities cap on cap.outcome_id = base.id;

-- ---------------------------------------------------------------------------
-- Benefit readiness / realisation. In realisation once realisation_start_date <= today:
-- red if low confidence or behind profile; amber if a measurement is overdue or the benefit is
-- unvalidated; otherwise green. Before that: worst of its outcomes; not_set with no pathway.
-- ---------------------------------------------------------------------------
create view public.v_benefit_readiness with (security_invoker = true) as
with base as (
  select b.*, private.org_today(b.organisation_id) as today
  from public.benefits b
  where b.status <> 'closed'
),
outcomes as materialized (
  select x.benefit_id, max(oh.rag) as worst,
    (array_agg(oh.title || ': ' || oh.reason order by oh.rag desc, oh.title))[1] as worst_reason
  from public.outcome_benefits x
  join public.v_outcome_health oh on oh.outcome_id = x.outcome_id
  group by x.benefit_id
),
flags as (
  select base.*, ob.worst as outcome_worst, ob.worst_reason as outcome_reason, ob.benefit_id is not null as has_pathway,
    coalesce(base.realisation_start_date <= base.today, false) as in_realisation,
    (base.confidence = 'low' or coalesce(r.behind_profile, false)) as is_red,
    coalesce(r.measurement_overdue, false) as is_overdue,
    (base.status = 'identified' or not base.eligibility_confirmed) as is_unvalidated,
    r.behind_profile
  from base
  left join public.v_benefit_realisation r on r.benefit_id = base.id
  left join outcomes ob on ob.benefit_id = base.id
)
select
  f.id as benefit_id,
  f.organisation_id,
  f.workspace_id,
  f.portfolio_id,
  f.programme_id,
  f.ref,
  f.title,
  case when f.in_realisation then 'realisation' else 'readiness' end as phase,
  f.has_pathway,
  f.realisation_start_date,
  (f.realisation_start_date is null and f.status in ('planned', 'validated')) as needs_realisation_start,
  case
    when f.in_realisation then case
      when f.is_red then 'red'::public.health
      when f.is_overdue or f.is_unvalidated then 'amber'::public.health
      else 'green'::public.health end
    else coalesce(f.outcome_worst, 'not_set'::public.health)
  end as rag,
  case
    when f.in_realisation then case
      when f.confidence = 'low' then 'Confidence low'
      when coalesce(f.behind_profile, false) then 'Behind profile'
      when f.is_overdue then 'Measurement overdue'
      when f.is_unvalidated then 'Not yet validated'
      else 'Realising to profile' end
    when f.outcome_worst is null then 'No pathway: link this benefit to an outcome'
    else 'Outcome ' || f.outcome_reason
  end as reason
from flags f;

-- ---------------------------------------------------------------------------
-- Project health: the delivery dimensions from v_project_delivery_health, and the benefit
-- dimension from the pathway. Benefit = worst of
--   * each capability the project delivers;
--   * today's flags, only for linked benefits in realisation;
--   * amber for a linked benefit not yet in realisation with low confidence, or unvalidated
--     from phase index 2 ("Benefit confidence low, not yet validated").
-- not_set when none apply. benefit_reason (new, last column) names the worst contributor.
-- ---------------------------------------------------------------------------
create or replace view public.v_project_health with (security_invoker = true) as
with delivery as materialized (
  select * from public.v_project_delivery_health
),
benefit_flags as materialized (
  select b.id, b.ref,
    coalesce(b.realisation_start_date <= private.org_today(b.organisation_id), false) as in_realisation,
    (b.confidence = 'low' or coalesce(r.behind_profile, false)) as is_red,
    coalesce(r.measurement_overdue, false) as is_overdue,
    (b.status = 'identified' or not b.eligibility_confirmed) as is_unvalidated,
    b.confidence = 'low' and b.status <> 'closed' as is_low,
    b.status <> 'closed' as is_open
  from public.benefits b
  left join public.v_benefit_realisation r on r.benefit_id = b.id
),
cap_delivery as materialized (
  select cp.capability_id,
    string_agg(d.code, ', ' order by d.code) filter (where d.delivery = 'red') as red_projects,
    string_agg(d.code, ', ' order by d.code) filter (where d.delivery = 'amber') as amber_projects
  from public.capability_projects cp
  join delivery d on d.project_id = cp.project_id
  where d.state <> 'closed'
  group by cp.capability_id
),
caps as materialized (
  select c.id, c.title, x.rag, x.reason
  from public.capabilities c
  join public.organisations o on o.id = c.organisation_id
  left join cap_delivery cd on cd.capability_id = c.id
  cross join lateral private.capability_rag(c.status, c.target_date, c.forecast_date, c.accepted_at,
    private.org_today(c.organisation_id), private.health_threshold(o.settings, 'acceptanceGraceDays')::integer,
    private.health_threshold(o.settings, 'capabilitySlipAmberDays'), cd.red_projects, cd.amber_projects) x
  where c.archived_at is null
),
items as (
  select cp.project_id, ch.rag, 1 as priority, 'Capability "' || ch.title || '": ' || ch.reason as reason
  from public.capability_projects cp
  join caps ch on ch.id = cp.capability_id
  union all
  select bp.project_id,
    case when f.is_red then 'red'::public.health when f.is_overdue or f.is_unvalidated then 'amber'::public.health else 'green'::public.health end,
    2,
    'Benefit ' || f.ref || ': ' || case when f.is_red then 'confidence low or behind profile'
                                        when f.is_overdue then 'measurement overdue'
                                        when f.is_unvalidated then 'not yet validated'
                                        else 'realising to profile' end
  from public.benefit_projects bp
  join benefit_flags f on f.id = bp.benefit_id and f.in_realisation
  union all
  select bp.project_id, 'amber'::public.health, 3, 'Benefit confidence low, not yet validated'
  from public.benefit_projects bp
  join benefit_flags f on f.id = bp.benefit_id and not f.in_realisation
  join delivery d on d.project_id = bp.project_id
  where f.is_low or (f.is_open and f.is_unvalidated and d.phase_index >= 2)
),
benefit as materialized (
  select distinct on (i.project_id) i.project_id, i.rag, i.reason
  from items i
  order by i.project_id, i.rag desc, i.priority, i.reason
)
select
  d.project_id,
  d.organisation_id,
  d.workspace_id,
  d.programme_id,
  d.effective_portfolio_id,
  d.schedule, d.financial, d.effort, d.issue,
  coalesce(b.rag, 'not_set'::public.health) as benefit,
  greatest(d.delivery, coalesce(b.rag, 'not_set'::public.health)) as computed_overall,
  coalesce(d.health_override, greatest(d.delivery, coalesce(b.rag, 'not_set'::public.health))) as overall,
  d.health_override is not null as is_overridden,
  d.finish_date as forecast_finish_date,
  'declared'::text as forecast_basis,
  coalesce(b.reason, 'No capabilities or benefits in realisation') as benefit_reason
from delivery d
left join benefit b on b.project_id = d.project_id;

-- Programme health: the same benefit rule over the programme's capabilities and benefits
-- (BP-8); the hygiene rule uses the programme's furthest project phase, as before. Capability
-- health reads the delivery dimensions of v_project_health, so they are computed once.
create or replace view public.v_programme_health with (security_invoker = true) as
with ph as materialized (
  select ph.*, vp.code, vp.state, vp.phase_index, greatest(ph.schedule, ph.financial, ph.effort, ph.issue) as delivery
  from public.v_project_health ph join public.v_projects vp on vp.id = ph.project_id
),
kids as materialized (
  select ph.programme_id, max(ph.overall) as worst_project, max(ph.forecast_finish_date) as forecast_finish_date,
    max(ph.phase_index) as max_phase_index
  from ph
  where ph.programme_id is not null
  group by ph.programme_id
),
cap_delivery as materialized (
  select cp.capability_id,
    string_agg(ph.code, ', ' order by ph.code) filter (where ph.delivery = 'red') as red_projects,
    string_agg(ph.code, ', ' order by ph.code) filter (where ph.delivery = 'amber') as amber_projects
  from public.capability_projects cp
  join ph on ph.project_id = cp.project_id
  where ph.state <> 'closed'
  group by cp.capability_id
),
caps as materialized (
  select c.programme_id, c.title, x.rag, x.reason
  from public.capabilities c
  join public.organisations o on o.id = c.organisation_id
  left join cap_delivery cd on cd.capability_id = c.id
  cross join lateral private.capability_rag(c.status, c.target_date, c.forecast_date, c.accepted_at,
    private.org_today(c.organisation_id), private.health_threshold(o.settings, 'acceptanceGraceDays')::integer,
    private.health_threshold(o.settings, 'capabilitySlipAmberDays'), cd.red_projects, cd.amber_projects) x
  where c.archived_at is null
),
benefit_flags as materialized (
  select b.programme_id, b.ref,
    coalesce(b.realisation_start_date <= private.org_today(b.organisation_id), false) as in_realisation,
    (b.confidence = 'low' or coalesce(r.behind_profile, false)) as is_red,
    coalesce(r.measurement_overdue, false) as is_overdue,
    (b.status = 'identified' or not b.eligibility_confirmed) as is_unvalidated,
    b.confidence = 'low' and b.status <> 'closed' as is_low,
    b.status <> 'closed' as is_open
  from public.benefits b
  left join public.v_benefit_realisation r on r.benefit_id = b.id
  where b.programme_id is not null
),
items as (
  select ch.programme_id, ch.rag, 1 as priority, 'Capability "' || ch.title || '": ' || ch.reason as reason
  from caps ch
  union all
  select f.programme_id,
    case when f.is_red then 'red'::public.health when f.is_overdue or f.is_unvalidated then 'amber'::public.health else 'green'::public.health end,
    2,
    'Benefit ' || f.ref || ': ' || case when f.is_red then 'confidence low or behind profile'
                                        when f.is_overdue then 'measurement overdue'
                                        when f.is_unvalidated then 'not yet validated'
                                        else 'realising to profile' end
  from benefit_flags f where f.in_realisation
  union all
  select f.programme_id, 'amber'::public.health, 3, 'Benefit confidence low, not yet validated'
  from benefit_flags f
  left join kids on kids.programme_id = f.programme_id
  where not f.in_realisation and (f.is_low or (f.is_open and f.is_unvalidated and greatest(0, coalesce(kids.max_phase_index, 0)) >= 2))
),
benefit as materialized (
  select distinct on (i.programme_id) i.programme_id, i.rag, i.reason
  from items i
  order by i.programme_id, i.rag desc, i.priority, i.reason
),
dims as (
  select pr.*, kids.worst_project, kids.forecast_finish_date,
    coalesce(bn.rag, 'not_set'::public.health) as benefit,
    coalesce(bn.reason, 'No capabilities or benefits in realisation') as benefit_reason
  from public.programmes pr
  left join kids on kids.programme_id = pr.id
  left join benefit bn on bn.programme_id = pr.id
  where pr.archived_at is null
)
select
  dims.id as programme_id,
  dims.organisation_id,
  dims.workspace_id,
  dims.portfolio_id,
  dims.benefit,
  coalesce(greatest(dims.worst_project, dims.benefit), 'not_set') as computed_overall,
  coalesce(dims.health_override, greatest(dims.worst_project, dims.benefit), 'not_set') as overall,
  dims.health_override is not null as is_overridden,
  coalesce(dims.forecast_finish_date, dims.finish_date) as forecast_finish_date,
  'declared'::text as forecast_basis,
  dims.benefit_reason
from dims;

revoke all on public.v_project_delivery_health, public.v_capability_health, public.v_outcome_indicator_health,
  public.v_outcome_health, public.v_benefit_readiness from anon, authenticated;
grant select on public.v_project_delivery_health, public.v_capability_health, public.v_outcome_indicator_health,
  public.v_outcome_health, public.v_benefit_readiness to authenticated;

-- ---------------------------------------------------------------------------
-- Monthly pathway history (BP-9): one row per capability, outcome and benefit per capture
-- day, written by capture_health_snapshots. The overview takes the last row per month.
-- ---------------------------------------------------------------------------
create table public.pathway_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  programme_id uuid,
  snapshot_date date not null,
  capability_id uuid,
  outcome_id uuid,
  benefit_id uuid,
  rag public.health not null,
  phase text check (phase in ('readiness', 'realisation')),
  is_complete boolean not null default false,
  due_in_fy boolean not null default false,
  realised_value numeric(14,2),
  fy_profile_value numeric(14,2),
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete restrict,
  foreign key (capability_id, workspace_id) references public.capabilities (id, workspace_id) on delete restrict,
  foreign key (outcome_id, workspace_id) references public.outcomes (id, workspace_id) on delete restrict,
  foreign key (benefit_id, workspace_id) references public.benefits (id, workspace_id) on delete restrict,
  check (num_nonnulls(capability_id, outcome_id, benefit_id) = 1)
);
create unique index pathway_snapshots_item_day_idx on public.pathway_snapshots (coalesce(capability_id, outcome_id, benefit_id), snapshot_date);
create index pathway_snapshots_workspace_org_idx on public.pathway_snapshots (workspace_id, organisation_id);
create index pathway_snapshots_organisation_idx on public.pathway_snapshots (organisation_id, snapshot_date);
create index pathway_snapshots_programme_idx on public.pathway_snapshots (programme_id, workspace_id);
create index pathway_snapshots_programme_date_idx on public.pathway_snapshots (programme_id, snapshot_date);
create index pathway_snapshots_capability_idx on public.pathway_snapshots (capability_id, workspace_id);
create index pathway_snapshots_outcome_idx on public.pathway_snapshots (outcome_id, workspace_id);
create index pathway_snapshots_benefit_idx on public.pathway_snapshots (benefit_id, workspace_id);
alter table public.pathway_snapshots enable row level security;
revoke all on public.pathway_snapshots from anon, authenticated;
grant select on public.pathway_snapshots to authenticated;
create policy pathway_snapshots_select on public.pathway_snapshots for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));

-- The first day of the financial year containing p_date.
create function private.fy_start(p_settings jsonb, p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(extract(year from p_date)::integer
           - case when extract(month from p_date) < coalesce((p_settings -> 'regional' ->> 'financialYearStartMonth')::integer, 1) then 1 else 0 end,
         coalesce((p_settings -> 'regional' ->> 'financialYearStartMonth')::integer, 1), 1);
$$;
revoke all on function private.fy_start(jsonb, date) from public, anon;
grant execute on function private.fy_start(jsonb, date) to authenticated, service_role;

create function private.capture_pathway_snapshots(p_org uuid default null, p_date date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  c integer;
begin
  insert into public.pathway_snapshots (organisation_id, workspace_id, programme_id, snapshot_date, capability_id, rag,
    is_complete, due_in_fy)
  select ch.organisation_id, ch.workspace_id, ch.programme_id, s.day, ch.capability_id, ch.rag, ch.is_complete,
    coalesce(ch.target_date >= s.fy and ch.target_date < (s.fy + interval '1 year')::date, false)
  from public.v_capability_health ch
  join public.organisations o on o.id = ch.organisation_id
  cross join lateral (select coalesce(p_date, private.org_today(o.id)) as day) d
  cross join lateral (select d.day, private.fy_start(o.settings, d.day) as fy) s
  where p_org is null or ch.organisation_id = p_org
  on conflict (coalesce(capability_id, outcome_id, benefit_id), snapshot_date) do update
    set rag = excluded.rag, is_complete = excluded.is_complete, due_in_fy = excluded.due_in_fy, is_synthetic = false;
  get diagnostics c = row_count; n := n + c;

  insert into public.pathway_snapshots (organisation_id, workspace_id, programme_id, snapshot_date, outcome_id, rag,
    is_complete, due_in_fy)
  select oh.organisation_id, oh.workspace_id, oh.programme_id, s.day, oh.outcome_id, oh.rag, oh.is_complete,
    coalesce(oh.target_date >= s.fy and oh.target_date < (s.fy + interval '1 year')::date, false)
  from public.v_outcome_health oh
  join public.organisations o on o.id = oh.organisation_id
  cross join lateral (select coalesce(p_date, private.org_today(o.id)) as day) d
  cross join lateral (select d.day, private.fy_start(o.settings, d.day) as fy) s
  where p_org is null or oh.organisation_id = p_org
  on conflict (coalesce(capability_id, outcome_id, benefit_id), snapshot_date) do update
    set rag = excluded.rag, is_complete = excluded.is_complete, due_in_fy = excluded.due_in_fy, is_synthetic = false;
  get diagnostics c = row_count; n := n + c;

  -- Benefits: realised value to date and the profiled value to the end of the financial year
  -- (both cumulative), for the "Benefits realised" line.
  insert into public.pathway_snapshots (organisation_id, workspace_id, programme_id, snapshot_date, benefit_id, rag,
    phase, is_complete, due_in_fy, realised_value, fy_profile_value)
  select br.organisation_id, br.workspace_id, br.programme_id, s.day, br.benefit_id, br.rag, br.phase,
    false, coalesce(pv.fy_fraction, 0) > 0, r.realised_value,
    private.js_round(b.planned_total_value * coalesce(pv.fy_fraction, 0))
  from public.v_benefit_readiness br
  join public.benefits b on b.id = br.benefit_id
  join public.organisations o on o.id = br.organisation_id
  join public.v_benefit_realisation r on r.benefit_id = br.benefit_id
  cross join lateral (select coalesce(p_date, private.org_today(o.id)) as day) d
  cross join lateral (select d.day, private.fy_start(o.settings, d.day) as fy) s
  left join lateral (
    select v.planned_fraction as fy_fraction from public.v_benefit_period_values v
    where v.benefit_id = br.benefit_id and v.start_date < (s.fy + interval '1 year')::date
    order by v.start_date desc limit 1
  ) pv on true
  where p_org is null or br.organisation_id = p_org
  on conflict (coalesce(capability_id, outcome_id, benefit_id), snapshot_date) do update
    set rag = excluded.rag, phase = excluded.phase, due_in_fy = excluded.due_in_fy, realised_value = excluded.realised_value,
        fy_profile_value = excluded.fy_profile_value, is_synthetic = false;
  get diagnostics c = row_count; n := n + c;
  return n;
end;
$$;
revoke all on function private.capture_pathway_snapshots(uuid, date) from public, anon, authenticated;
grant execute on function private.capture_pathway_snapshots(uuid, date) to service_role;

-- The nightly job (and the status-report trigger) capture the pathway with the health.
create or replace function private.capture_health_snapshots(p_org uuid default null, p_date date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  c integer;
begin
  insert into public.health_snapshots (organisation_id, workspace_id, project_id, snapshot_date, overall, schedule, financial,
    effort, issue, benefit, forecast_finish_date, forecast_basis)
  select h.organisation_id, h.workspace_id, h.project_id, coalesce(p_date, private.org_today(h.organisation_id)), h.overall,
    h.schedule, h.financial, h.effort, h.issue, h.benefit, h.forecast_finish_date, h.forecast_basis
  from public.v_project_health h join public.projects p on p.id = h.project_id
  where p.state <> 'closed' and (p_org is null or h.organisation_id = p_org)
  on conflict (coalesce(portfolio_id, programme_id, project_id), snapshot_date) do update
    set overall = excluded.overall, schedule = excluded.schedule, financial = excluded.financial, effort = excluded.effort,
        issue = excluded.issue, benefit = excluded.benefit, forecast_finish_date = excluded.forecast_finish_date, is_synthetic = false;
  get diagnostics c = row_count; n := n + c;

  insert into public.health_snapshots (organisation_id, workspace_id, programme_id, snapshot_date, overall, benefit,
    forecast_finish_date, forecast_basis)
  select g.organisation_id, g.workspace_id, g.programme_id, coalesce(p_date, private.org_today(g.organisation_id)), g.overall,
    g.benefit, g.forecast_finish_date, g.forecast_basis
  from public.v_programme_health g join public.programmes pr on pr.id = g.programme_id
  where pr.state = 'active' and (p_org is null or g.organisation_id = p_org)
  on conflict (coalesce(portfolio_id, programme_id, project_id), snapshot_date) do update
    set overall = excluded.overall, benefit = excluded.benefit, forecast_finish_date = excluded.forecast_finish_date, is_synthetic = false;
  get diagnostics c = row_count; n := n + c;

  insert into public.health_snapshots (organisation_id, workspace_id, portfolio_id, snapshot_date, overall,
    forecast_finish_date, forecast_basis, metrics)
  select f.organisation_id, f.workspace_id, f.portfolio_id, coalesce(p_date, private.org_today(f.organisation_id)), f.overall,
    f.forecast_finish_date, f.forecast_basis,
    (select jsonb_build_object(
       'activeProjects', count(*),
       'budget', coalesce(sum(p.budget), 0),
       'forecast', coalesce(sum(p.forecast), 0),
       'spend', coalesce(sum(p.actual), 0),
       'variance', coalesce(sum(p.forecast - p.budget), 0),
       'green', count(*) filter (where h.overall = 'green'),
       'amber', count(*) filter (where h.overall = 'amber'),
       'red', count(*) filter (where h.overall = 'red'),
       'unset', count(*) filter (where h.overall = 'not_set'),
       'percentOnTrack', case when count(*) = 0 then 0 else private.js_round(100.0 * count(*) filter (where h.overall = 'green') / count(*)) end,
       'dimensionsGreen', jsonb_build_object(
         'schedule', count(*) filter (where h.schedule = 'green'), 'financial', count(*) filter (where h.financial = 'green'),
         'effort', count(*) filter (where h.effort = 'green'), 'issue', count(*) filter (where h.issue = 'green'),
         'benefit', count(*) filter (where h.benefit = 'green')))
     from public.v_projects p join public.v_project_health h on h.project_id = p.id
     where p.effective_portfolio_id = f.portfolio_id and p.state = 'active')
  from public.v_portfolio_health f join public.portfolios pf on pf.id = f.portfolio_id
  where pf.state = 'active' and (p_org is null or f.organisation_id = p_org)
  on conflict (coalesce(portfolio_id, programme_id, project_id), snapshot_date) do update
    set overall = excluded.overall, forecast_finish_date = excluded.forecast_finish_date, metrics = excluded.metrics, is_synthetic = false;
  get diagnostics c = row_count; n := n + c;

  n := n + private.capture_pathway_snapshots(p_org, p_date);
  return n;
end;
$$;
revoke all on function private.capture_health_snapshots(uuid, date) from public, anon, authenticated;
grant execute on function private.capture_health_snapshots(uuid, date) to service_role;
