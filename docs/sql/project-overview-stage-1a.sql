-- PROPOSED, NOT APPLIED. Awaiting approval; becomes supabase/migrations/<timestamp>_project_overview_schema.sql once approved.
-- Stage 1a: project overview schema (docs/design/project-overview-design.html; decisions of 08/10/2026).
--   1. milestones.phase_id, nullable, FK to lifecycle_phases.
--   2. v_milestones: slip_days = (actual_date if delivered, else forecast_date) - baseline_date;
--      new trailing columns phase_id, past_baseline (display only) and slip_band.
--   3. v_project_delivery_health: schedule now reads milestone slip (bands as MilestoneSlippage),
--      and the milestone forecast finish and a data-quality count are exposed. v_project_health is re-created so it picks
--      the new columns up, and its forecast_finish_date now comes from the milestones.
--   4. status_reports: status (draft | submitted), submitted_at, decisions_needed, declared_benefit.
--      Evidenced health is captured, and a snapshot taken, when a report is submitted.
--   5. projects.reporting_cadence (default monthly) so the next report due date can be derived.
--   6. health_snapshots.source (seed | job); the pre-5-Oct synthetic rows are marked seed.
-- No new tables, so no new RLS policies: every column lands on a table that already has them.

-- ---------------------------------------------------------------------------
-- 1. Milestone phase. No backfill: lifecycle_phases carry no dates and no project records
--    phase start/end dates, so no baseline date can be placed inside a phase's range. Every
--    existing milestone stays null and the page shows its type instead.
-- ---------------------------------------------------------------------------
alter table public.milestones add column phase_id uuid;
alter table public.milestones add constraint milestones_phase_id_fkey
  foreign key (phase_id, organisation_id) references public.lifecycle_phases (id, organisation_id)
  on delete set null (phase_id);
create index milestones_phase_idx on public.milestones (phase_id, organisation_id);

-- ---------------------------------------------------------------------------
-- 2. Milestone view. Existing columns keep their order (m.* listed out so phase_id goes on
--    the end). Slip bands match the Milestone slippage card: on time (<= 0), minor (1-14),
--    material (15-30), severe (> 30). status is unchanged: 'overdue' still means not delivered
--    and forecast date passed. past_baseline (not delivered, baseline passed) is for display
--    ("Past baseline, forecast dd Mon") and is not used by any health rule.
-- ---------------------------------------------------------------------------
create or replace view public.v_milestones with (security_invoker = true) as
select
  m.id, m.organisation_id, m.workspace_id, m.project_id, m.title, m.type, m.baseline_date,
  m.forecast_date, m.actual_date, m.report_to_committee, m.owner_id, m.ref, m.created_at,
  m.updated_at, m.created_by,
  case
    when m.actual_date is not null then 'completed'::public.delivery_status
    when m.forecast_date < private.org_today(m.organisation_id) then 'overdue'::public.delivery_status
    when m.forecast_date > m.baseline_date then 'late'::public.delivery_status
    when m.forecast_date - private.org_today(m.organisation_id) > 30 then 'future'::public.delivery_status
    else 'on_track'::public.delivery_status
  end as status,
  (coalesce(m.actual_date, m.forecast_date) - m.baseline_date) as slip_days,
  m.phase_id,
  (m.actual_date is null and m.baseline_date < private.org_today(m.organisation_id)) as past_baseline,
  case
    when coalesce(m.actual_date, m.forecast_date) - m.baseline_date <= 0 then 'on_time'
    when coalesce(m.actual_date, m.forecast_date) - m.baseline_date <= 14 then 'minor'
    when coalesce(m.actual_date, m.forecast_date) - m.baseline_date <= 30 then 'material'
    else 'severe'
  end as slip_band
from public.milestones m;

-- ---------------------------------------------------------------------------
-- 3. Project delivery health. Schedule, first match wins (every red before any amber):
--      red    a milestone's forecast date has passed and it isn't delivered (status 'overdue');
--      red    an undelivered milestone is forecast more than 30 days late;
--      red    the milestone forecast finish is after the project baseline finish;
--      red    the declared finish slips more than scheduleSlipPercent (existing rule);
--      amber  an undelivered milestone is forecast 15-30 days late;
--      amber  overdue tasks over taskOverdueAtRiskPercent (existing rule);
--      green  otherwise.
--    Milestone forecast finish = latest of (actual date if delivered, else forecast date).
--    milestones_after_baseline_finish counts milestones baselined after the project's
--    baseline finish (data-quality signal). Other dimensions unchanged; new columns at the end.
-- ---------------------------------------------------------------------------
create or replace view public.v_project_delivery_health with (security_invoker = true) as
with base as (
  select p.*, o.settings, private.org_today(p.organisation_id) as today,
    s.task_count, s.overdue_count
  from public.v_projects p
  join public.organisations o on o.id = p.organisation_id
  join public.v_project_task_stats s on s.project_id = p.id
),
ms as materialized (
  select m.project_id,
    bool_or(m.status = 'overdue') as any_forecast_missed,
    max(m.slip_days) filter (where m.actual_date is null) as worst_open_slip,
    max(coalesce(m.actual_date, m.forecast_date)) as forecast_finish,
    count(*) filter (where m.baseline_date > p.baseline_finish_date) as after_baseline_finish
  from public.v_milestones m
  join public.projects p on p.id = m.project_id
  group by m.project_id
),
dims as materialized (
  select
    base.id,
    case
      when coalesce(ms.any_forecast_missed, false) then 'red'::public.health
      when ms.worst_open_slip > 30 then 'red'::public.health
      when ms.forecast_finish > base.baseline_finish_date then 'red'::public.health
      when (base.baseline_finish_date - base.start_date) > 0
        and (base.finish_date - base.baseline_finish_date)::numeric / (base.baseline_finish_date - base.start_date)
            > private.health_threshold(base.settings, 'scheduleSlipPercent') / 100 then 'red'::public.health
      when ms.worst_open_slip >= 15 then 'amber'::public.health
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
    end as issue,
    ms.forecast_finish,
    coalesce(ms.after_baseline_finish, 0) as after_baseline_finish
  from base
  left join ms on ms.project_id = base.id
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
  greatest(dims.schedule, dims.financial, dims.effort, dims.issue) as delivery,
  base.baseline_finish_date,
  dims.forecast_finish as milestone_forecast_finish,
  dims.after_baseline_finish as milestones_after_baseline_finish
from base join dims on dims.id = base.id;

-- Re-created unchanged except the forecast finish: the milestone forecast when the project has
-- milestones (basis 'milestones'), else the declared finish date (basis 'declared'). The
-- sprint forecast engine (next phase) will add its own basis here.
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
  coalesce(d.milestone_forecast_finish, d.finish_date) as forecast_finish_date,
  case when d.milestone_forecast_finish is not null then 'milestones' else 'declared' end::text as forecast_basis,
  coalesce(b.reason, 'No capabilities or benefits in realisation') as benefit_reason
from delivery d
left join benefit b on b.project_id = d.project_id;

-- ---------------------------------------------------------------------------
-- 4. Status reports: drafts, and the highlight report fields. accomplished and planned stay
--    the "done this period" and "planned next period" text; comments stays the summary.
--    Only decisions_needed and declared_benefit are new narrative/RAG fields.
--    Existing rows are submitted, dated by when they were created.
-- ---------------------------------------------------------------------------
create type public.status_report_status as enum ('draft', 'submitted');
alter table public.status_reports
  add column status public.status_report_status not null default 'submitted',
  add column submitted_at timestamptz,
  add column decisions_needed text,
  add column declared_benefit public.health not null default 'not_set';

-- Backfill without bumping updated_at or writing audit rows.
alter table public.status_reports disable trigger user;
update public.status_reports set submitted_at = created_at where submitted_at is null;
alter table public.status_reports enable trigger user;

alter table public.status_reports add constraint status_reports_submitted_at_check
  check ((status = 'submitted') = (submitted_at is not null));
create index status_reports_project_submitted_idx on public.status_reports (project_id, submitted_at desc)
  where status = 'submitted';

-- Evidenced health is captured from v_project_health at the moment a report is submitted
-- (insert as submitted, or draft -> submitted), then frozen. Drafts carry none. A submitted
-- report can't go back to draft. Seed/service writes (no auth.uid()) may supply history.
create or replace function private.capture_evidenced_health()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'submitted' and new.status = 'draft' then
      raise exception 'A submitted report can''t be returned to draft.' using errcode = '42501';
    end if;
    if old.status = 'submitted' or new.status = 'draft' then
      new.evidenced_overall := old.evidenced_overall; new.evidenced_schedule := old.evidenced_schedule;
      new.evidenced_financial := old.evidenced_financial; new.evidenced_effort := old.evidenced_effort;
      new.evidenced_issue := old.evidenced_issue; new.evidenced_benefit := old.evidenced_benefit;
      new.submitted_at := old.submitted_at;
      return new;
    end if;
  elsif new.status = 'draft' then
    new.evidenced_overall := null; new.evidenced_schedule := null; new.evidenced_financial := null;
    new.evidenced_effort := null; new.evidenced_issue := null; new.evidenced_benefit := null;
    new.submitted_at := null;
    return new;
  end if;
  -- Being submitted now.
  if (select auth.uid()) is null and new.evidenced_overall is not null then
    new.submitted_at := coalesce(new.submitted_at, now());
    return new;
  end if;
  select v.overall, v.schedule, v.financial, v.effort, v.issue, v.benefit into h
  from public.v_project_health v where v.project_id = new.project_id;
  new.evidenced_overall := h.overall; new.evidenced_schedule := h.schedule; new.evidenced_financial := h.financial;
  new.evidenced_effort := h.effort; new.evidenced_issue := h.issue; new.evidenced_benefit := h.benefit;
  new.submitted_at := now();
  return new;
end;
$$;
revoke all on function private.capture_evidenced_health() from public, anon, authenticated;

-- Snapshot on submission, not on every insert (drafts don't count).
create or replace function private.snapshot_on_status_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'submitted' then
    return new;
  end if;
  if not ((select auth.uid()) is null and current_setting('vpmo.seeding', true) = 'on') then
    perform private.capture_health_snapshots(new.organisation_id);
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_on_status_report() from public, anon, authenticated;
drop trigger status_reports_snapshot on public.status_reports;
create trigger status_reports_snapshot after insert or update of status on public.status_reports
  for each row when (new.status = 'submitted') execute function private.snapshot_on_status_report();

-- ---------------------------------------------------------------------------
-- 5. Reporting cadence. Next due = latest submitted reporting_date + cadence.
-- ---------------------------------------------------------------------------
create type public.reporting_cadence as enum ('weekly', 'fortnightly', 'monthly');
alter table public.projects
  add column reporting_cadence public.reporting_cadence not null default 'monthly';

-- ---------------------------------------------------------------------------
-- 6. Snapshot provenance. Every row before the first real nightly run (05/10/2026) is
--    synthetic seed history (429 rows, all is_synthetic); purge later with
--    delete from public.health_snapshots where source = 'seed'.
-- ---------------------------------------------------------------------------
alter table public.health_snapshots
  add column source text not null default 'job' check (source in ('seed', 'job'));
update public.health_snapshots set source = 'seed'
  where is_synthetic or snapshot_date < date '2026-10-05';
