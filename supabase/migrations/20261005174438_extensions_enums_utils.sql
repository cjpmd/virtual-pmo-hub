-- Virtual PMO: extensions, enums and shared utilities.
-- Internal helpers live in the `private` schema, which PostgREST does not expose.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- pg_cron drives nightly health snapshots and audit-log pruning. Guarded so local
-- databases without the extension still migrate.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Enums. Declared in ascending order where ordering is meaningful, so that
-- comparison operators and max() work directly (app_role, health).
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('viewer', 'contributor', 'manager', 'pmo', 'admin');
create type public.health as enum ('not_set', 'green', 'amber', 'red');
create type public.entity_state as enum ('active', 'closed');
create type public.project_state as enum ('proposed', 'active', 'on_hold', 'closed');
create type public.project_tier as enum ('small', 'medium', 'large');
create type public.priority as enum ('low', 'moderate', 'high', 'critical');
create type public.task_source as enum ('native', 'planner_basic', 'planner_premium');
create type public.work_item_type as enum ('task', 'story', 'bug', 'spike', 'milestone_task');
create type public.work_item_status as enum ('issued', 'not_started', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.status_category as enum ('todo', 'in_progress', 'done');
create type public.offer_response as enum ('accepted', 'declined', 'proposed_date');
create type public.external_source as enum ('planner_basic', 'planner_premium', 'import');
create type public.milestone_type as enum ('delivery', 'gate', 'key_date', 'external_dependency');
create type public.open_closed as enum ('open', 'closed');
create type public.risk_response as enum ('avoid', 'reduce', 'transfer', 'accept');
create type public.issue_severity as enum ('low', 'medium', 'high');
create type public.change_status as enum ('proposed', 'approved', 'rejected');
create type public.decision_status as enum ('pending', 'made', 'superseded', 'reversed');
create type public.action_status as enum ('open', 'in_progress', 'done');
create type public.assumption_status as enum ('open', 'validated', 'invalidated');
create type public.dependency_type as enum ('sequencing', 'alignment', 'information', 'resource', 'external');
create type public.dependency_validation as enum ('inferred', 'proposed', 'confirmed', 'closed', 'broken');
create type public.criticality as enum ('low', 'medium', 'high');
create type public.benefit_type as enum ('benefit', 'disbenefit');
create type public.benefit_classification as enum ('cash_releasing', 'non_cash_releasing', 'qualitative', 'societal');
create type public.benefit_status as enum ('identified', 'validated', 'planned', 'in_realisation', 'realised', 'partially_realised', 'not_realised', 'closed');
create type public.confidence as enum ('low', 'medium', 'high');
create type public.measure_frequency as enum ('monthly', 'quarterly', 'annually');
create type public.measurement_status as enum ('submitted', 'validated', 'queried');
create type public.benefit_review_type as enum ('scheduled', 'post_implementation');
create type public.request_status as enum ('new', 'in_review', 'on_hold', 'approved', 'rejected');
create type public.lesson_type as enum ('success', 'problem');
create type public.lesson_applicability as enum ('this_project', 'similar_projects', 'all_projects');
create type public.lesson_status as enum ('identified', 'action_agreed', 'embedded', 'closed');
create type public.project_role as enum ('project_manager', 'project_officer', 'programme_manager', 'team_member', 'sponsor');
create type public.booking_type as enum ('soft', 'hard');
create type public.leave_type as enum ('annual_leave', 'training', 'other');
create type public.gate_check_key as enum ('benefit_profiles_owned', 'benefit_baselines', 'benefits_handover', 'lessons_reviewed', 'phase_lessons_review');
create type public.ms_connection_status as enum ('not_connected', 'pending_approval', 'connected', 'needs_reconnect');
create type public.plan_kind as enum ('basic', 'premium');
create type public.sync_mode as enum ('polling', 'live_updates', 'change_tracking');
create type public.sync_health as enum ('healthy', 'warning', 'failing');
create type public.outbox_status as enum ('queued', 'sending', 'retrying', 'failed');
create type public.sync_log_kind as enum ('read', 'write', 'throttled', 'failed', 'deleted', 'directory');
create type public.conflict_resolution as enum ('kept_planner', 'reapplied');

-- ---------------------------------------------------------------------------
-- Utilities
-- ---------------------------------------------------------------------------

-- Keeps updated_at current on every audited table.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Human-readable reference counters. scope_id is a project or organisation id.
create table private.ref_counters (
  scope_id uuid not null,
  prefix text not null,
  last_value integer not null default 0,
  primary key (scope_id, prefix)
);

create function private.next_ref(p_scope_id uuid, p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  insert into private.ref_counters as c (scope_id, prefix, last_value)
  values (p_scope_id, p_prefix, 1)
  on conflict (scope_id, prefix) do update set last_value = c.last_value + 1
  returning c.last_value into v;
  return p_prefix || '-' || lpad(v::text, 3, '0');
end;
$$;

-- Before-insert trigger: fills `ref` when not supplied.
-- TG_ARGV[0] = prefix, TG_ARGV[1] = 'project' | 'organisation' | 'project_or_organisation'.
create function private.assign_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  j jsonb := to_jsonb(new);
  scope uuid;
begin
  if new.ref is not null then
    return new;
  end if;
  scope := case tg_argv[1]
    when 'project' then (j ->> 'project_id')::uuid
    when 'organisation' then (j ->> 'organisation_id')::uuid
    else coalesce((j ->> 'project_id')::uuid, (j ->> 'organisation_id')::uuid)
  end;
  new.ref := private.next_ref(scope, tg_argv[0]);
  return new;
end;
$$;

-- Weekdays strictly after `from_date` up to and including `to_date`; negative when
-- to_date is earlier. Mirrors workingDaysBetween() in services/dependencies.ts.
create function private.working_days_between(from_date date, to_date date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when to_date >= from_date then
      (select count(*)::integer from generate_series(from_date + 1, to_date, interval '1 day') d
        where extract(isodow from d) < 6)
    else
      -(select count(*)::integer from generate_series(to_date, from_date - 1, interval '1 day') d
        where extract(isodow from d) < 6)
  end;
$$;
