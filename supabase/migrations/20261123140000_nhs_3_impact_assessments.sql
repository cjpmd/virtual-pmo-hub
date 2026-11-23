-- NHS-3 part 1: quality and equality impact assessments (QIA / EqIA) and the delivery gate
-- (docs/nhs-module-plan.md § NHS-3, docs/sql/nhs-3-impact-assessments.sql). Written by an
-- unattended run on 23/11/2026: tested on the local Postgres only, NOT applied to production.
-- Apply after 20261123100000_nhs_2_benefit_categories. Nothing here is destructive: two new
-- tables, one view, new functions and triggers. No existing function is replaced.
--
-- Design
-- - impact_assessments: one assessment per target (entity_type + entity_id; a project or a
--   programme now, an efficiency scheme from NHS-4). Workspace records: organisation_id and
--   workspace_id come from the target (private.tenant_guard). The template in force when the
--   assessment was created is copied onto it (template, template_version), so a later change to
--   the organisation's template never changes a completed assessment.
-- - Answers are jsonb keyed by the template's keys: screening (per quality domain: impact,
--   consequence, likelihood, note), quality (the full assessment per domain: impact, description,
--   consequence, likelihood, mitigations, indicators) and equality (per protected characteristic
--   plus health inequalities / deprivation: impact, evidence, mitigation). screening_max_score
--   and full_required are worked out by trigger from the template's threshold.
-- - Status: draft → in_review (submit) → approved | rejected; an approver can also return it for
--   revision (back to draft). A material change sets an approved assessment to
--   reassessment_required, which blocks the gate again until it is re-approved. Status, version
--   and the gate link change only through the RPCs (SECURITY DEFINER); answers can be edited only
--   while the assessment is draft, rejected or reassessment_required.
-- - Sign-off reuses approval_gates / approval_steps (gate_type 'impact_assessment', entity_type
--   'impact_assessment', one gate per submission) with steps that name governance roles (NHS-0).
--   The template's route defaults to Medical Director then Chief Nurse (NHS) or Quality lead
--   (general); full assessments can add more roles (fullSignoff). Those gates and steps can't be
--   added, changed or removed by a client write (NHS-0 decision D6); decisions go through
--   decide_impact_assessment (or decide_approval_step, which keeps working), so the governance
--   role check applies. impact_assessment_decisions keeps each decision with its conditions.
-- - Gate: settings.impactAssessment.gate.phaseId names a lifecycle phase; while the module is on,
--   a project can't move into that phase (or a later one), or be created there, without an
--   approved assessment. Off by default and only applies to future moves (NHS-0 rule 3): projects
--   already past it are listed by impact_assessment_gaps and never blocked. Sample projects are
--   exempt.
-- - Templates: settings.impactAssessment.template (admins, set_impact_assessment_template),
--   else private.impact_assessment_default_template(pack). Written only through the RPCs.

-- ---------------------------------------------------------------------------------------------
-- 1. Default templates (mirror src/data/impact-assessment.ts; change both together)
-- ---------------------------------------------------------------------------------------------

create function private.impact_assessment_default_template(p_pack text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    -- A negative screening score (consequence × likelihood on the 5×5) at or above this needs a
    -- full assessment; so does any negative equality impact while equalityNegativeRequiresFull.
    'fullAssessmentMinScore', 8,
    'equalityNegativeRequiresFull', true,
    'reviewMonths', 6,
    'domains', case when p_pack = 'nhs' then jsonb_build_array(
        jsonb_build_object('key', 'patient_safety', 'label', 'Patient safety',
          'question', 'Could this change affect the safety of patients, including avoidable harm or incidents?'),
        jsonb_build_object('key', 'clinical_effectiveness', 'label', 'Clinical effectiveness',
          'question', 'Could this change affect clinical outcomes, evidence-based care or adherence to guidance?'),
        jsonb_build_object('key', 'patient_experience', 'label', 'Patient experience',
          'question', 'Could this change affect patients'' experience, access, dignity or choice?'),
        jsonb_build_object('key', 'workforce', 'label', 'Workforce and staff wellbeing',
          'question', 'Could this change affect staffing levels, skills, workload or staff wellbeing?'),
        jsonb_build_object('key', 'operational_performance', 'label', 'Operational performance',
          'question', 'Could this change affect waiting times, flow, capacity or performance standards?'))
      else jsonb_build_array(
        jsonb_build_object('key', 'safety', 'label', 'Safety and service quality',
          'question', 'Could this change affect the safety or quality of the service people receive?'),
        jsonb_build_object('key', 'effectiveness', 'label', 'Effectiveness and outcomes',
          'question', 'Could this change affect the outcomes the service achieves?'),
        jsonb_build_object('key', 'user_experience', 'label', 'Customer and user experience',
          'question', 'Could this change affect people''s experience, access or choice?'),
        jsonb_build_object('key', 'workforce', 'label', 'Staff wellbeing',
          'question', 'Could this change affect staffing, workload or staff wellbeing?'),
        jsonb_build_object('key', 'operational_performance', 'label', 'Operational performance',
          'question', 'Could this change affect service levels, capacity or performance?'))
      end,
    'equality', jsonb_build_array(
        jsonb_build_object('key', 'age', 'label', 'Age'),
        jsonb_build_object('key', 'disability', 'label', 'Disability'),
        jsonb_build_object('key', 'gender_reassignment', 'label', 'Gender reassignment'),
        jsonb_build_object('key', 'marriage_civil_partnership', 'label', 'Marriage and civil partnership'),
        jsonb_build_object('key', 'pregnancy_maternity', 'label', 'Pregnancy and maternity'),
        jsonb_build_object('key', 'race', 'label', 'Race'),
        jsonb_build_object('key', 'religion_belief', 'label', 'Religion or belief'),
        jsonb_build_object('key', 'sex', 'label', 'Sex'),
        jsonb_build_object('key', 'sexual_orientation', 'label', 'Sexual orientation'))
      || case when p_pack = 'nhs' then jsonb_build_array(
        jsonb_build_object('key', 'health_inequalities', 'label', 'Health inequalities'),
        jsonb_build_object('key', 'deprivation', 'label', 'Deprivation'))
      else jsonb_build_array(
        jsonb_build_object('key', 'socio_economic', 'label', 'Socio-economic disadvantage')) end,
    'signoff', case when p_pack = 'nhs' then '["medical_director", "chief_nurse"]'::jsonb
                    else '["quality_lead"]'::jsonb end,
    'fullSignoff', '[]'::jsonb);
$$;
revoke execute on function private.impact_assessment_default_template(text) from public, anon;
grant execute on function private.impact_assessment_default_template(text) to authenticated;

-- Raises unless the template is well formed. Keys are unique within domains and within equality.
create function private.impact_assessment_check_template(t jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
begin
  if t is null or jsonb_typeof(t) <> 'object'
     or jsonb_typeof(t -> 'domains') <> 'array' or jsonb_array_length(t -> 'domains') = 0
     or jsonb_typeof(t -> 'equality') <> 'array'
     or jsonb_typeof(t -> 'signoff') <> 'array' or jsonb_array_length(t -> 'signoff') = 0
     or jsonb_typeof(coalesce(t -> 'fullSignoff', '[]')) <> 'array' then
    raise exception 'A template needs quality domains, an equality list and at least one sign-off role.'
      using errcode = '22023';
  end if;
  if coalesce(t ->> 'fullAssessmentMinScore', '') !~ '^[0-9]+(\.[0-9]+)?$'
     or (t ->> 'fullAssessmentMinScore')::numeric not between 1 and 25 then
    raise exception 'The full-assessment threshold must be a score from 1 to 25.' using errcode = '22023';
  end if;
  if jsonb_typeof(t -> 'fullAssessmentMinScore') <> 'number'
     or (t ? 'reviewMonths' and (jsonb_typeof(t -> 'reviewMonths') <> 'number'
                                 or (t ->> 'reviewMonths')::numeric not in (1, 2, 3, 4, 5, 6, 9, 12, 18, 24)))
     or (t ? 'equalityNegativeRequiresFull' and jsonb_typeof(t -> 'equalityNegativeRequiresFull') <> 'boolean') then
    raise exception 'The threshold must be a number, the review period 1–6, 9, 12, 18 or 24 months, and the equality rule true or false.'
      using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(t -> 'domains') d
             where coalesce(d ->> 'key', '') !~ '^[a-z][a-z0-9_]{1,39}$' or coalesce(btrim(d ->> 'label'), '') = '')
     or exists (select 1 from jsonb_array_elements(t -> 'equality') d
             where coalesce(d ->> 'key', '') !~ '^[a-z][a-z0-9_]{1,39}$' or coalesce(btrim(d ->> 'label'), '') = '') then
    raise exception 'Every domain and characteristic needs a key (lower case) and a label.' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct d ->> 'key') from jsonb_array_elements(t -> 'domains') d)
     or (select count(*) <> count(distinct d ->> 'key') from jsonb_array_elements(t -> 'equality') d) then
    raise exception 'Domain and characteristic keys must be unique.' using errcode = '22023';
  end if;
  for k in select jsonb_array_elements_text(t -> 'signoff') union all
           select jsonb_array_elements_text(coalesce(t -> 'fullSignoff', '[]')) loop
    if k !~ '^[a-z][a-z0-9_]{1,59}$' then
      raise exception 'Unknown sign-off role %', k using errcode = '22023';
    end if;
  end loop;
end;
$$;
revoke execute on function private.impact_assessment_check_template(jsonb) from public, anon;

-- The organisation's template: its own (settings.impactAssessment.template), else the pack default.
create function private.impact_assessment_template(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(o.settings -> 'impactAssessment' -> 'template',
                  private.impact_assessment_default_template(coalesce(o.settings ->> 'pack', 'general')))
  from public.organisations o where o.id = p_org;
$$;
revoke execute on function private.impact_assessment_template(uuid) from public, anon;

-- For the app: members read their organisation's template (with its default filled in).
create function public.impact_assessment_template(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_org) then
    return null;
  end if;
  return private.impact_assessment_template(p_org);
end;
$$;
revoke execute on function public.impact_assessment_template(uuid) from public, anon;
grant execute on function public.impact_assessment_template(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------------------------

create table public.impact_assessments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  -- The target. entity_type is checked by trigger (project, programme; NHS-4 adds its scheme),
  -- and project_id / programme_id are filled from it.
  entity_type text not null check (entity_type ~ '^[a-z_]{2,40}$'),
  entity_id uuid not null,
  project_id uuid,
  programme_id uuid,
  title text not null default '' check (length(title) <= 300),
  summary text check (summary is null or length(summary) <= 8000),
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'approved', 'rejected', 'reassessment_required')),
  template jsonb not null,
  template_version integer not null default 1,
  screening jsonb not null default '{}' check (jsonb_typeof(screening) = 'object'),
  quality jsonb not null default '{}' check (jsonb_typeof(quality) = 'object'),
  equality jsonb not null default '{}' check (jsonb_typeof(equality) = 'object'),
  screening_max_score integer not null default 0,
  full_required boolean not null default false,
  review_date date,
  -- Each submission makes a new sign-off gate; version counts them.
  version integer not null default 0,
  gate_id uuid,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  material_change_at timestamptz,
  material_change_reason text check (material_change_reason is null or length(material_change_reason) <= 2000),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (id, workspace_id),
  unique (organisation_id, entity_type, entity_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (gate_id, organisation_id) references public.approval_gates (id, organisation_id)
    on delete set null (gate_id),
  check (num_nonnulls(project_id, programme_id) <= 1)
);
create index impact_assessments_ws_idx on public.impact_assessments (workspace_id, organisation_id);
create index impact_assessments_project_idx on public.impact_assessments (project_id, workspace_id);
create index impact_assessments_programme_idx on public.impact_assessments (programme_id, workspace_id);
create index impact_assessments_gate_idx on public.impact_assessments (gate_id, organisation_id);
create index impact_assessments_entity_idx on public.impact_assessments (entity_type, entity_id);
create index impact_assessments_submitted_by_idx on public.impact_assessments (submitted_by);
create index impact_assessments_created_by_idx on public.impact_assessments (created_by);

comment on table public.impact_assessments is
  'NHS-3: quality and equality impact assessment (QIA / EqIA) of a project, programme or scheme. Do not enter patient-identifiable information.';

create table public.impact_assessment_decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  assessment_id uuid not null,
  gate_id uuid,
  step_id uuid,
  version integer not null,
  governance_role text,
  decision text not null check (decision in ('approved', 'approved_with_conditions', 'rejected', 'returned')),
  conditions text check (conditions is null or length(conditions) <= 4000),
  comment text check (comment is null or length(comment) <= 4000),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz not null default now(),
  foreign key (assessment_id, workspace_id) references public.impact_assessments (id, workspace_id) on delete cascade,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (gate_id, organisation_id) references public.approval_gates (id, organisation_id)
    on delete set null (gate_id),
  check (decision <> 'approved_with_conditions' or coalesce(btrim(conditions), '') <> '')
);
create index impact_assessment_decisions_assessment_idx on public.impact_assessment_decisions (assessment_id, workspace_id);
create index impact_assessment_decisions_ws_idx on public.impact_assessment_decisions (workspace_id, organisation_id);
create index impact_assessment_decisions_gate_idx on public.impact_assessment_decisions (gate_id, organisation_id);
create index impact_assessment_decisions_decided_by_idx on public.impact_assessment_decisions (decided_by);

comment on table public.impact_assessment_decisions is
  'NHS-3: sign-off decisions on impact assessments, with conditions. Written only by decide_impact_assessment.';

-- ---------------------------------------------------------------------------------------------
-- 3. Triggers on impact_assessments
-- ---------------------------------------------------------------------------------------------

-- A consequence or likelihood level (1–5) from an answer, else 0. Never fails on bad input.
create function private.impact_level(v jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when v #>> '{}' ~ '^[1-5]$' then (v #>> '{}')::integer else 0 end;
$$;
revoke execute on function private.impact_level(jsonb) from public, anon;
grant execute on function private.impact_level(jsonb) to authenticated;

-- Scores from the answers and the assessment's own template.
create function private.impact_assessment_scores(t jsonb, screening jsonb, equality jsonb,
                                                 out max_score integer, out full_required boolean)
language sql
immutable
set search_path = ''
as $$
  with s as (
    select coalesce(max(case when a.value ->> 'impact' = 'negative'
                             then private.impact_level(a.value -> 'consequence') * private.impact_level(a.value -> 'likelihood')
                             else 0 end), 0) as m
    from jsonb_array_elements(t -> 'domains') d
    left join lateral (select screening -> (d ->> 'key') as value) a on true
  ),
  e as (
    select exists (select 1 from jsonb_array_elements(t -> 'equality') d
                   where equality -> (d ->> 'key') ->> 'impact' = 'negative') as neg
  )
  select s.m::integer,
         s.m >= coalesce((t ->> 'fullAssessmentMinScore')::numeric, 8)
           or (e.neg and coalesce((t ->> 'equalityNegativeRequiresFull')::boolean, true))
  from s, e;
$$;
revoke execute on function private.impact_assessment_scores(jsonb, jsonb, jsonb) from public, anon;
grant execute on function private.impact_assessment_scores(jsonb, jsonb, jsonb) to authenticated;

-- Target types (NHS-4 adds its scheme here): fills project_id / programme_id from the target, so
-- the tenant guard then takes the workspace from it (under the caller's RLS).
create function private.impact_assessments_target()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.entity_type = 'project' then
      new.project_id := new.entity_id; new.programme_id := null;
    elsif new.entity_type = 'programme' then
      new.programme_id := new.entity_id; new.project_id := null;
    else
      raise exception 'An impact assessment can be made for a project or a programme.' using errcode = '22023';
    end if;
  elsif (new.entity_type, new.entity_id, new.project_id, new.programme_id)
        is distinct from (old.entity_type, old.entity_id, old.project_id, old.programme_id) then
    raise exception 'An impact assessment can''t be moved to another record.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.impact_assessments_target() from public, anon, authenticated;

-- After the tenant guard (so the target is visible to the caller): a default title, no archived
-- targets on insert, and the scores from the answers and the assessment's own template.
create function private.impact_assessments_finish()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_scores record;
  v_name text;
  v_archived timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.project_id is not null then
      select p.name, p.archived_at into v_name, v_archived from public.projects p where p.id = new.project_id;
    else
      select p.name, p.archived_at into v_name, v_archived from public.programmes p where p.id = new.programme_id;
    end if;
    if v_archived is not null then
      raise exception 'This % is archived, so it can''t be assessed.', new.entity_type using errcode = '42501';
    end if;
    if btrim(new.title) = '' then
      new.title := 'Impact assessment: ' || coalesce(v_name, new.entity_type);
    end if;
  end if;
  select * into v_scores from private.impact_assessment_scores(new.template, new.screening, new.equality);
  new.screening_max_score := v_scores.max_score;
  new.full_required := v_scores.full_required;
  return new;
end;
$$;
revoke execute on function private.impact_assessments_finish() from public, anon, authenticated;

-- Client writes (current_user = 'authenticated') can only create drafts and edit answers while
-- the assessment is open for editing. The RPCs run as the owner, so they pass.
create function private.impact_assessments_client_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.template := private.impact_assessment_template_for_insert(new.organisation_id);
    new.template_version := coalesce((new.template ->> 'version')::int, 1);
    new.status := 'draft';
    new.version := 0;
    new.gate_id := null;
    new.submitted_at := null; new.submitted_by := null; new.approved_at := null;
    new.material_change_at := null; new.material_change_reason := null;
    return new;
  end if;
  if (new.status, new.version, new.gate_id, new.submitted_at, new.submitted_by, new.approved_at,
      new.template, new.template_version, new.material_change_at, new.material_change_reason, new.is_sample)
     is distinct from
     (old.status, old.version, old.gate_id, old.submitted_at, old.submitted_by, old.approved_at,
      old.template, old.template_version, old.material_change_at, old.material_change_reason, old.is_sample) then
    raise exception 'Submit, decide or flag a change through the assessment''s buttons.' using errcode = '42501';
  end if;
  if old.status not in ('draft', 'rejected', 'reassessment_required') then
    raise exception 'This assessment is % and can''t be edited.',
      case old.status when 'in_review' then 'awaiting sign-off' else 'approved' end
      using errcode = '42501', hint = 'impact_assessment_locked';
  end if;
  return new;
end;
$$;
revoke execute on function private.impact_assessments_client_guard() from public, anon, authenticated;

-- The template a new assessment copies (definer, so the guard can read settings whatever RLS).
create function private.impact_assessment_template_for_insert(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.impact_assessment_template(p_org);
$$;
revoke execute on function private.impact_assessment_template_for_insert(uuid) from public, anon;
grant execute on function private.impact_assessment_template_for_insert(uuid) to authenticated;

-- Fill the template for owner inserts too (seeds, fixtures) when none is given.
create function private.impact_assessments_default_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.template is null then
    new.template := private.impact_assessment_template(new.organisation_id);
    new.template_version := coalesce((new.template ->> 'version')::int, 1);
  end if;
  return new;
end;
$$;
revoke execute on function private.impact_assessments_default_template() from public, anon, authenticated;

-- Order: 00 target, 01 tenant guard (organisation and workspace from the target), 02 template,
-- 03 client guard, 09 title, archived check and scores.
create trigger impact_assessments_00_target before insert or update on public.impact_assessments
  for each row execute function private.impact_assessments_target();
create trigger impact_assessments_01_tenant_guard before insert or update on public.impact_assessments
  for each row execute function private.tenant_guard('project_id', 'projects', 'programme_id', 'programmes');
create trigger impact_assessments_02_template before insert on public.impact_assessments
  for each row execute function private.impact_assessments_default_template();
create trigger impact_assessments_03_client_guard before insert or update on public.impact_assessments
  for each row execute function private.impact_assessments_client_guard();
create trigger impact_assessments_09_scores before insert or update on public.impact_assessments
  for each row execute function private.impact_assessments_finish();
create trigger impact_assessments_updated_at before update on public.impact_assessments
  for each row execute function private.set_updated_at();
create trigger impact_assessments_audit after insert or update or delete on public.impact_assessments
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.impact_assessments
  for each row execute function private.enforce_org_writable();

create trigger impact_assessment_decisions_00_tenant_guard before insert or update on public.impact_assessment_decisions
  for each row execute function private.tenant_guard('assessment_id', 'impact_assessments');
create trigger impact_assessment_decisions_audit after insert or delete on public.impact_assessment_decisions
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.impact_assessment_decisions
  for each row execute function private.enforce_org_writable();

-- ---------------------------------------------------------------------------------------------
-- 4. RLS. Reads: workspace members, module on or off. Writes (create a draft, edit answers):
--    the target's editors while the module is on: project editors (contributor and above in the
--    workspace) for a project, workspace managers and above for a programme. No deletes: an
--    assessment is part of the record. Decisions are written only by decide_impact_assessment.
-- ---------------------------------------------------------------------------------------------

alter table public.impact_assessments enable row level security;
alter table public.impact_assessment_decisions enable row level security;
revoke all on public.impact_assessments, public.impact_assessment_decisions from anon, authenticated;
grant select, insert, update on public.impact_assessments to authenticated;
grant select on public.impact_assessment_decisions to authenticated;

create policy impact_assessments_select on public.impact_assessments for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy impact_assessments_insert on public.impact_assessments for insert to authenticated
  with check (private.module_enabled(organisation_id, 'impact_assessment')
    and case when project_id is not null then project_id = any ((select private.my_editable_project_ids())::uuid[])
             else workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[]) end);
create policy impact_assessments_update on public.impact_assessments for update to authenticated
  using (private.module_enabled(organisation_id, 'impact_assessment')
    and case when project_id is not null then project_id = any ((select private.my_editable_project_ids())::uuid[])
             else workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[]) end)
  with check (private.module_enabled(organisation_id, 'impact_assessment')
    and case when project_id is not null then project_id = any ((select private.my_editable_project_ids())::uuid[])
             else workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[]) end);
create policy impact_assessment_decisions_select on public.impact_assessment_decisions for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));

-- True when the caller may edit (and submit) the assessment.
create function private.can_edit_impact_assessment(a public.impact_assessments)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.module_enabled(a.organisation_id, 'impact_assessment')
    and case when a.project_id is not null then a.project_id = any (private.my_editable_project_ids())
             else a.workspace_id = any (private.my_workspace_ids('manager')) end;
$$;
revoke execute on function private.can_edit_impact_assessment(public.impact_assessments) from public, anon;
grant execute on function private.can_edit_impact_assessment(public.impact_assessments) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Module-owned approval gates can't be changed by client writes (NHS-0 decision D6). The
--    RPCs and decide_approval_step run as the owner, so they pass. NHS-6 adds its gate type here.
-- ---------------------------------------------------------------------------------------------

create function private.locked_gate_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['impact_assessment'];
$$;
revoke execute on function private.locked_gate_types() from public, anon;
grant execute on function private.locked_gate_types() to authenticated;

create function private.approval_gate_type(p_gate uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.gate_type from public.approval_gates g where g.id = p_gate;
$$;
revoke execute on function private.approval_gate_type(uuid) from public, anon;
grant execute on function private.approval_gate_type(uuid) to authenticated;

create function private.approval_module_gate_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type text;
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_table_name = 'approval_gates' then
    v_type := coalesce(new.gate_type, old.gate_type);
    if tg_op = 'UPDATE' and old.gate_type = any (private.locked_gate_types()) then
      v_type := old.gate_type;
    end if;
  else
    v_type := private.approval_gate_type(coalesce(new.gate_id, old.gate_id));
    if tg_op = 'UPDATE' and private.approval_gate_type(old.gate_id) = any (private.locked_gate_types()) then
      v_type := private.approval_gate_type(old.gate_id);
    end if;
  end if;
  if v_type = any (private.locked_gate_types()) then
    raise exception 'This sign-off is managed by its assessment and can''t be changed here.'
      using errcode = '42501', hint = 'module_gate_locked';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function private.approval_module_gate_lock() from public, anon, authenticated;

create trigger approval_gates_05_module_lock before insert or update or delete on public.approval_gates
  for each row execute function private.approval_module_gate_lock();
create trigger approval_steps_05_module_lock before insert or update or delete on public.approval_steps
  for each row execute function private.approval_module_gate_lock();

-- The assessment follows its current gate: approved → approved, rejected → rejected (an approver
-- returning it for revision sets it back to draft afterwards, in decide_impact_assessment).
create function private.impact_assessment_follow_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.impact_assessments a
     set status = case new.status when 'approved' then 'approved' else 'rejected' end,
         approved_at = case when new.status = 'approved' then now() else null end
   where a.gate_id = new.id and a.status = 'in_review' and new.status in ('approved', 'rejected');
  return null;
end;
$$;
revoke execute on function private.impact_assessment_follow_gate() from public, anon, authenticated;

create trigger approval_gates_40_impact_assessment after update of status on public.approval_gates
  for each row when (new.gate_type = 'impact_assessment' and new.status is distinct from old.status)
  execute function private.impact_assessment_follow_gate();

-- ---------------------------------------------------------------------------------------------
-- 6. RPCs
-- ---------------------------------------------------------------------------------------------

-- What's missing before the assessment can be submitted (labels), given its own template.
create function private.impact_assessment_missing(a public.impact_assessments)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(x.label order by x.ord), '{}') from (
    -- Screening: every domain needs an impact; a negative one needs consequence and likelihood.
    select 1 as ord, 'Screening: ' || (d.value ->> 'label') as label
    from jsonb_array_elements(a.template -> 'domains') d
    where coalesce(a.screening -> (d.value ->> 'key') ->> 'impact', '') not in ('positive', 'neutral', 'negative')
       or (a.screening -> (d.value ->> 'key') ->> 'impact' = 'negative'
           and (private.impact_level(a.screening -> (d.value ->> 'key') -> 'consequence') = 0
                or private.impact_level(a.screening -> (d.value ->> 'key') -> 'likelihood') = 0))
    union all
    -- Equality: every characteristic needs an impact; a negative one needs evidence and mitigation
    -- when the full assessment is required.
    select 2, 'Equality: ' || (d.value ->> 'label')
    from jsonb_array_elements(a.template -> 'equality') d
    where coalesce(a.equality -> (d.value ->> 'key') ->> 'impact', '') not in ('positive', 'neutral', 'negative')
       or (a.full_required and a.equality -> (d.value ->> 'key') ->> 'impact' = 'negative'
           and (coalesce(btrim(a.equality -> (d.value ->> 'key') ->> 'evidence'), '') = ''
                or coalesce(btrim(a.equality -> (d.value ->> 'key') ->> 'mitigation'), '') = ''))
    union all
    -- Full assessment: every domain needs an impact and a description; a negative one needs
    -- consequence, likelihood and mitigations.
    select 3, 'Full assessment: ' || (d.value ->> 'label')
    from jsonb_array_elements(a.template -> 'domains') d
    where a.full_required
      and (coalesce(a.quality -> (d.value ->> 'key') ->> 'impact', '') not in ('positive', 'neutral', 'negative')
           or coalesce(btrim(a.quality -> (d.value ->> 'key') ->> 'description'), '') = ''
           or (a.quality -> (d.value ->> 'key') ->> 'impact' = 'negative'
               and (private.impact_level(a.quality -> (d.value ->> 'key') -> 'consequence') = 0
                    or private.impact_level(a.quality -> (d.value ->> 'key') -> 'likelihood') = 0
                    or coalesce(btrim(a.quality -> (d.value ->> 'key') ->> 'mitigations'), '') = '')))
  ) x;
$$;
revoke execute on function private.impact_assessment_missing(public.impact_assessments) from public, anon;

-- Submit for sign-off: checks the answers, makes a new sign-off gate with one step per role on the
-- route (signoff, plus fullSignoff for a full assessment) and sets the review date when blank.
-- Every role on the route needs someone holding it, or the gate could never be decided.
create function public.submit_impact_assessment(p_id uuid, p_updated_at timestamptz default null)
returns public.impact_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.impact_assessments;
  v_missing text[];
  v_roles text[];
  v_unheld text[];
  v_gate uuid;
  i integer;
begin
  select * into a from public.impact_assessments where id = p_id for update;
  if a.id is null or not (a.workspace_id = any (private.my_workspace_ids())) or not private.can_edit_impact_assessment(a) then
    raise exception 'You can''t submit this assessment.' using errcode = '42501';
  end if;
  if p_updated_at is not null and a.updated_at <> p_updated_at then
    raise exception 'Someone else changed this assessment. Reload it and try again.' using errcode = '40001';
  end if;
  if a.status not in ('draft', 'rejected', 'reassessment_required') then
    raise exception 'This assessment is already submitted or approved.' using errcode = '22023';
  end if;
  v_missing := private.impact_assessment_missing(a);
  if cardinality(v_missing) > 0 then
    raise exception 'Complete these before submitting: %.', array_to_string(v_missing, ', ')
      using errcode = '22023', hint = 'impact_assessment_incomplete';
  end if;

  select array_agg(r order by o) into v_roles from (
    select r, min(o) as o from (
      select r, o from jsonb_array_elements_text(a.template -> 'signoff') with ordinality s(r, o)
      union all
      select r, 100 + o from jsonb_array_elements_text(coalesce(a.template -> 'fullSignoff', '[]')) with ordinality s(r, o)
      where a.full_required
    ) z group by r) y;
  select array_agg(coalesce(l.label, r)) into v_unheld
  from unnest(v_roles) r
  left join public.lookup_values l on l.organisation_id = a.organisation_id and l.list_key = 'governance_role' and l.value = r
  where not exists (select 1 from public.governance_role_holders h
                    where h.organisation_id = a.organisation_id and h.role_key = r);
  if v_unheld is not null then
    raise exception 'Nobody holds %. An admin or PMO can assign it in Settings › Governance roles.',
      array_to_string(v_unheld, ', ') using errcode = '22023', hint = 'governance_role_unassigned';
  end if;

  insert into public.approval_gates (organisation_id, workspace_id, project_id, entity_type, entity_id,
                                     gate_type, name, status, created_by)
  values (a.organisation_id, a.workspace_id, a.project_id, 'impact_assessment', a.id, 'impact_assessment',
          left(a.title, 200) || ' — sign-off ' || (a.version + 1), 'pending', (select auth.uid()))
  returning id into v_gate;
  for i in 1 .. cardinality(v_roles) loop
    insert into public.approval_steps (organisation_id, workspace_id, gate_id, step_order, required_role, governance_role)
    select a.organisation_id, a.workspace_id, v_gate, i,
           coalesce((select l.label from public.lookup_values l where l.organisation_id = a.organisation_id
                       and l.list_key = 'governance_role' and l.value = v_roles[i]), v_roles[i]),
           v_roles[i];
  end loop;

  update public.impact_assessments set status = 'in_review', version = a.version + 1, gate_id = v_gate,
    submitted_at = now(), submitted_by = (select auth.uid()), approved_at = null,
    review_date = coalesce(a.review_date,
                           (current_date + make_interval(months => coalesce((a.template ->> 'reviewMonths')::int, 6)))::date)
  where id = a.id returning * into a;
  return a;
end;
$$;
revoke execute on function public.submit_impact_assessment(uuid, timestamptz) from public, anon;
grant execute on function public.submit_impact_assessment(uuid, timestamptz) to authenticated;

-- An approver decides their step: approved, approved_with_conditions, rejected or returned (for
-- revision). decide_approval_step checks the caller may decide it (workspace contributor and the
-- step's governance role). Conditions are required for approved_with_conditions, a comment for
-- rejected and returned. Returning ends this gate (rejected) and puts the assessment back to draft.
create function public.decide_impact_assessment(p_step uuid, p_decision text, p_comment text default null,
                                                p_conditions text default null)
returns public.impact_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.approval_steps;
  a public.impact_assessments;
begin
  select * into s from public.approval_steps where id = p_step;
  select * into a from public.impact_assessments x
   where s.id is not null and x.gate_id = s.gate_id and x.workspace_id = any (private.my_workspace_ids())
   for update;
  if a.id is null then
    raise exception 'You can''t decide this approval step.' using errcode = '42501';
  end if;
  if a.status <> 'in_review' then
    raise exception 'This assessment isn''t awaiting sign-off.' using errcode = '22023';
  end if;
  if p_decision is null or p_decision not in ('approved', 'approved_with_conditions', 'rejected', 'returned') then
    raise exception 'Choose approve, approve with conditions, reject or return for revision.' using errcode = '22023';
  end if;
  if p_decision = 'approved_with_conditions' and coalesce(btrim(p_conditions), '') = '' then
    raise exception 'Set out the conditions of approval.' using errcode = '22023';
  end if;
  if p_decision in ('rejected', 'returned') and coalesce(btrim(p_comment), '') = '' then
    raise exception 'Say why, so the team can act on it.' using errcode = '22023';
  end if;
  perform private.assert_module_enabled(a.organisation_id, 'impact_assessment');

  perform public.decide_approval_step(p_step,
    case when p_decision in ('approved', 'approved_with_conditions') then 'approved' else 'rejected' end,
    case when p_decision = 'returned' then 'Returned for revision: ' || btrim(p_comment) else p_comment end);

  insert into public.impact_assessment_decisions (organisation_id, workspace_id, assessment_id, gate_id, step_id,
    version, governance_role, decision, conditions, comment, decided_by)
  values (a.organisation_id, a.workspace_id, a.id, s.gate_id, s.id, a.version, s.governance_role, p_decision,
          nullif(btrim(coalesce(p_conditions, '')), ''), nullif(btrim(coalesce(p_comment, '')), ''), (select auth.uid()));

  if p_decision = 'returned' then
    update public.impact_assessments set status = 'draft', approved_at = null where id = a.id;
  end if;
  select * into a from public.impact_assessments where id = a.id;
  return a;
end;
$$;
revoke execute on function public.decide_impact_assessment(uuid, text, text, text) from public, anon;
grant execute on function public.decide_impact_assessment(uuid, text, text, text) to authenticated;

-- A material change to an approved assessment (or one awaiting sign-off): it needs re-assessment,
-- which blocks the gate again until it is re-approved. A pending gate is closed (rejected).
create function public.flag_impact_assessment_change(p_id uuid, p_reason text)
returns public.impact_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.impact_assessments;
begin
  select * into a from public.impact_assessments where id = p_id for update;
  if a.id is null or not (a.workspace_id = any (private.my_workspace_ids())) or not private.can_edit_impact_assessment(a) then
    raise exception 'You can''t change this assessment.' using errcode = '42501';
  end if;
  if a.status not in ('approved', 'in_review') then
    raise exception 'Only an approved or submitted assessment can be flagged for re-assessment.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Describe the material change.' using errcode = '22023';
  end if;
  update public.impact_assessments set status = 'reassessment_required', approved_at = null,
    material_change_at = now(), material_change_reason = btrim(p_reason)
  where id = a.id returning * into a;
  update public.approval_gates set status = 'rejected', decided_at = now()
   where id = a.gate_id and status = 'pending';
  return a;
end;
$$;
revoke execute on function public.flag_impact_assessment_change(uuid, text) from public, anon;
grant execute on function public.flag_impact_assessment_change(uuid, text) to authenticated;

-- Admins set the organisation's template (null restores the pack default). The version goes up
-- each time; assessments already created keep the template they were made with.
create function public.set_impact_assessment_template(p_org uuid, p_template jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current jsonb;
  v_new jsonb;
begin
  perform private.assert_org_admin(p_org);
  v_current := private.impact_assessment_template(p_org);
  if p_template is null then
    update public.organisations o
       set settings = jsonb_set(o.settings, '{impactAssessment}',
                                coalesce(o.settings -> 'impactAssessment', '{}'::jsonb) - 'template')
     where o.id = p_org;
    return private.impact_assessment_template(p_org);
  end if;
  v_new := p_template || jsonb_build_object('version', coalesce((v_current ->> 'version')::int, 1) + 1,
                                            'fullSignoff', coalesce(p_template -> 'fullSignoff', '[]'::jsonb));
  perform private.impact_assessment_check_template(v_new);
  update public.organisations o
     set settings = jsonb_set(o.settings, '{impactAssessment}',
                              coalesce(o.settings -> 'impactAssessment', '{}'::jsonb) || jsonb_build_object('template', v_new))
   where o.id = p_org;
  perform private.write_audit(p_org, 'update', 'organisations', p_org,
    jsonb_build_object('event', 'impact_assessment.template_changed', 'version', v_new -> 'version'));
  return v_new;
end;
$$;
revoke execute on function public.set_impact_assessment_template(uuid, jsonb) from public, anon;
grant execute on function public.set_impact_assessment_template(uuid, jsonb) to authenticated;

-- Admins choose the lifecycle phase a project can't enter without an approved assessment (null
-- switches the gate off). The time it was switched on is recorded with it.
create function public.set_impact_assessment_gate(p_org uuid, p_phase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate jsonb;
begin
  perform private.assert_org_admin(p_org);
  if p_phase_id is not null and not exists (select 1 from public.lifecycle_phases l
                                            where l.id = p_phase_id and l.organisation_id = p_org) then
    raise exception 'Choose one of your organisation''s lifecycle phases.' using errcode = '22023';
  end if;
  v_gate := case when p_phase_id is null then null
                 else jsonb_build_object('phaseId', p_phase_id, 'enabledAt', now(), 'enabledBy', (select auth.uid())) end;
  update public.organisations o
     set settings = jsonb_set(o.settings, '{impactAssessment}',
                              case when v_gate is null then coalesce(o.settings -> 'impactAssessment', '{}'::jsonb) - 'gate'
                                   else coalesce(o.settings -> 'impactAssessment', '{}'::jsonb) || jsonb_build_object('gate', v_gate) end)
   where o.id = p_org;
  perform private.write_audit(p_org, 'update', 'organisations', p_org,
    jsonb_build_object('event', 'impact_assessment.gate_changed', 'phase_id', p_phase_id));
  return v_gate;
end;
$$;
revoke execute on function public.set_impact_assessment_gate(uuid, uuid) from public, anon;
grant execute on function public.set_impact_assessment_gate(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. The delivery gate
-- ---------------------------------------------------------------------------------------------

create function private.impact_assessment_approved(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.impact_assessments a
                 where a.entity_type = p_entity_type and a.entity_id = p_entity_id and a.status = 'approved');
$$;
revoke execute on function private.impact_assessment_approved(text, uuid) from public, anon;
grant execute on function private.impact_assessment_approved(text, uuid) to authenticated, service_role;

create function private.assert_impact_assessment_approved(p_entity_type text, p_entity_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.impact_assessment_approved(p_entity_type, p_entity_id) then
    raise exception 'This % needs an approved impact assessment first.', replace(p_entity_type, '_', ' ')
      using errcode = 'P0001', hint = 'impact_assessment_required';
  end if;
end;
$$;
revoke execute on function private.assert_impact_assessment_approved(text, uuid) from public, anon;
grant execute on function private.assert_impact_assessment_approved(text, uuid) to authenticated, service_role;

-- The gate phase's position, or null when the gate is off (no phase, or the module off).
create function private.impact_assessment_gate_order(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select l.sort_order
  from public.organisations o
  join public.lifecycle_phases l on l.organisation_id = o.id
   and l.id = nullif(o.settings -> 'impactAssessment' -> 'gate' ->> 'phaseId', '')::uuid
  where o.id = p_org and o.settings -> 'modules' -> 'impact_assessment' = 'true'::jsonb;
$$;
revoke execute on function private.impact_assessment_gate_order(uuid) from public, anon;
grant execute on function private.impact_assessment_gate_order(uuid) to authenticated, service_role;

-- A project can't move into the gate phase (or past it), or be created there, without an approved
-- assessment. Moves between phases already past the gate, and sample projects, are allowed.
create function private.projects_impact_assessment_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate integer;
  v_new integer;
  v_old integer;
begin
  if new.phase_id is null or new.is_sample or private.in_purge() then
    return new;
  end if;
  v_gate := private.impact_assessment_gate_order(new.organisation_id);
  if v_gate is null then
    return new;
  end if;
  select l.sort_order into v_new from public.lifecycle_phases l where l.id = new.phase_id;
  if tg_op = 'UPDATE' and old.phase_id is not null then
    select l.sort_order into v_old from public.lifecycle_phases l where l.id = old.phase_id;
  end if;
  if v_new >= v_gate and (v_old is null or v_old < v_gate) then
    perform private.assert_impact_assessment_approved('project', new.id);
  end if;
  return new;
end;
$$;
revoke execute on function private.projects_impact_assessment_gate() from public, anon, authenticated;

create trigger projects_40_impact_assessment_gate before insert on public.projects
  for each row execute function private.projects_impact_assessment_gate();
create trigger projects_41_impact_assessment_gate before update of phase_id on public.projects
  for each row when (old.phase_id is distinct from new.phase_id)
  execute function private.projects_impact_assessment_gate();

-- Projects at or past the gate phase without an approved assessment (started before the gate was
-- switched on, or flagged for re-assessment), for the PMO's "missing assessment" list. Runs as the
-- caller, so RLS limits it to their workspaces.
create function public.impact_assessment_gaps(p_org uuid)
returns table (project_id uuid, code text, name text, phase_name text, assessment_id uuid, status text)
language sql
stable
set search_path = ''
as $$
  select p.id, p.code, p.name, l.name, a.id, coalesce(a.status, 'missing')
  from public.projects p
  join public.lifecycle_phases l on l.id = p.phase_id
  left join public.impact_assessments a on a.entity_type = 'project' and a.entity_id = p.id
  where p.organisation_id = p_org and p.archived_at is null and not p.is_sample
    and l.sort_order >= private.impact_assessment_gate_order(p_org)
    and coalesce(a.status, 'missing') <> 'approved'
  order by l.sort_order, p.code;
$$;
revoke execute on function public.impact_assessment_gaps(uuid) from public, anon;
grant execute on function public.impact_assessment_gaps(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 8. Register view (security invoker): each assessment with its target, current gate progress and
--    the review date status.
-- ---------------------------------------------------------------------------------------------

create view public.v_impact_assessments with (security_invoker = true) as
select a.id, a.organisation_id, a.workspace_id, a.entity_type, a.entity_id, a.project_id, a.programme_id,
  coalesce(p.name, g.name) as target_name, p.code as project_code,
  a.title, a.status, a.version, a.full_required, a.screening_max_score, a.template_version,
  a.review_date, (a.status = 'approved' and a.review_date < current_date) as review_overdue,
  a.submitted_at, a.approved_at, a.material_change_at, a.is_sample, a.updated_at,
  (select count(*) from jsonb_array_elements(a.template -> 'domains') d
    where coalesce(a.quality, '{}') -> (d ->> 'key') ->> 'impact' = 'negative'
       or a.screening -> (d ->> 'key') ->> 'impact' = 'negative')::integer as negative_domains,
  (select count(*) from jsonb_array_elements(a.template -> 'equality') d
    where a.equality -> (d ->> 'key') ->> 'impact' = 'negative')::integer as negative_equality,
  (select count(*) from public.approval_steps s where s.gate_id = a.gate_id)::integer as steps_total,
  (select count(*) from public.approval_steps s where s.gate_id = a.gate_id and s.decision = 'approved')::integer as steps_approved,
  (select coalesce(jsonb_agg(jsonb_build_object('step_id', s.id, 'order', s.step_order, 'role', s.governance_role,
                                                'role_label', s.required_role, 'decision', s.decision,
                                                'decided_at', s.decided_at) order by s.step_order), '[]'::jsonb)
     from public.approval_steps s where s.gate_id = a.gate_id) as steps,
  exists (select 1 from public.impact_assessment_decisions d
          where d.assessment_id = a.id and d.version = a.version and d.decision = 'approved_with_conditions') as has_conditions
from public.impact_assessments a
left join public.projects p on p.id = a.project_id
left join public.programmes g on g.id = a.programme_id;

revoke all on public.v_impact_assessments from anon, authenticated;
grant select on public.v_impact_assessments to authenticated;
