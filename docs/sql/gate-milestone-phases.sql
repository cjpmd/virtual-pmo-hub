-- APPLIED 15/10/2026 as migration 20261015102227_gate_milestone_phases (proposal of the same day).
--
-- Today the gate checklist ticks against "the next open gate milestone", which can belong to a
-- different phase from the checklist (ARB: Phase 3 checklist "GATE 3 - Ready to build" saved
-- against "MS-002 GATE 0 - Ready to Design"). Gate milestones carry no phase (0 of 87).
--
-- 1. Backfill milestones.phase_id for gate milestones, by an explicit title -> phase mapping
--    (each organisation's own lifecycle_phases, matched by sort_order). Gate n in the lifecycle
--    is the exit gate of Phase n. All 87 gate milestones are in the demo organisation:
--
--      title                       rows  phase                                  why
--      GATE 0 - Ready to Design      34  Phase 2 (GATE 2 - Ready to design)     gate name matches;
--                                                                               its number (0) doesn't
--      Closure report approved        3  Phase 6 (GATE 6 - Closure approved)    gate name matches
--      Design authority approval     34  not mapped                             no name or number
--                                                                               match (Phase 3 would
--                                                                               be the likely one)
--      GATE 1 - Ready to Deliver     16  not mapped                             name matches no gate;
--                                                                               number 1 (Phase 1,
--                                                                               "Idea approved to
--                                                                               explore") contradicts
--                                                                               its place after design
--                                                                               (Phase 4 likely)
--    Unmapped gate milestones keep phase_id null. They don't attach to any checklist; editing one
--    now requires a phase (rule 2).
--
-- 2. Rule: a gate milestone created or edited by a signed-in user (current_user =
--    'authenticated') must have a phase (23514 "Choose the lifecycle phase this gate closes.").
--    Other milestone types are unaffected; server-side jobs are unaffected.
--
-- 3. v_project_gates (security invoker): one row per gate milestone with a phase, on a live
--    project:
--      is_current  the gate milestone of the project's current phase: of that phase's gate
--                  milestones, the earliest undelivered by forecast, else the earliest delivered.
--                  The checklist ticks and the Overview gate signal both use it.
--      not_passed  an earlier phase's gate milestone with no actual date: the data-quality signal
--                  "Gate N not passed but project is in Phase M".
--
-- 4. Ticks attach only to the current phase's gate milestone: gate_checklist_tick_rules now
--    requires milestones.phase_id = projects.phase_id (23514 otherwise).
--
-- 5. Existing ticks move to the current gate milestone of their project (0 ticks today; the
--    statement is there for completeness). A tick whose project has no current gate milestone
--    stays where it is.
--
-- Additive: one new trigger, one view, a replaced trigger function, an update backfill. No
-- DROP, no DELETE. The new private function revokes execute from public and anon.

-- 1. Backfill.
with mapping (title, phase_sort) as (
  values ('GATE 0 - Ready to Design', 2), ('Closure report approved', 6)
)
update public.milestones m
set phase_id = lp.id
from mapping x, public.lifecycle_phases lp
where m.type = 'gate'
  and m.phase_id is null
  and regexp_replace(btrim(m.title), '\s+', ' ', 'g') = x.title
  and lp.organisation_id = m.organisation_id
  and lp.sort_order = x.phase_sort;

-- 2. Gate milestones need a phase.
create function private.gate_milestone_needs_phase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.type = 'gate' and new.phase_id is null then
    raise exception 'Choose the lifecycle phase this gate closes.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.gate_milestone_needs_phase() from public, anon;
create trigger milestones_05_gate_phase before insert or update on public.milestones
  for each row execute function private.gate_milestone_needs_phase();

-- 3. Gates per project.
create view public.v_project_gates with (security_invoker = true) as
select g.milestone_id, g.ref, g.title, g.project_id, g.organisation_id, g.workspace_id,
  g.forecast_date, g.actual_date, g.phase_id, g.gate_phase, g.gate_phase_name, g.gate_name,
  g.project_phase_id, g.project_phase, g.project_phase_name,
  (g.phase_id = g.project_phase_id and g.rank_in_phase = 1) as is_current,
  (g.gate_phase < g.project_phase and g.actual_date is null) as not_passed
from (
  select m.id as milestone_id, m.ref, m.title, m.project_id, m.organisation_id, m.workspace_id,
    m.forecast_date, m.actual_date, m.phase_id,
    gp.sort_order as gate_phase, gp.name as gate_phase_name, gp.gate_name,
    p.phase_id as project_phase_id, pp.sort_order as project_phase, pp.name as project_phase_name,
    row_number() over (
      partition by m.project_id, m.phase_id
      order by (m.actual_date is not null), m.forecast_date, m.ref
    ) as rank_in_phase
  from public.milestones m
  join public.projects p on p.id = m.project_id and p.archived_at is null
  join public.lifecycle_phases gp on gp.id = m.phase_id
  left join public.lifecycle_phases pp on pp.id = p.phase_id
  where m.type = 'gate'
) g;
revoke all on public.v_project_gates from anon, authenticated;
grant select on public.v_project_gates to authenticated;

-- 4. Ticks only on the current phase's gate milestone.
create or replace function private.gate_checklist_tick_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.milestones m
    join public.projects p on p.id = m.project_id
    where m.id = new.milestone_id and m.project_id = new.project_id and m.type = 'gate'
      and m.phase_id is not null and m.phase_id = p.phase_id
  ) then
    raise exception 'Checklist items can only be ticked against the gate milestone of the project''s current phase.'
      using errcode = '23514';
  end if;
  new.ticked_by := (select auth.uid());
  new.ticked_at := now();
  return new;
end;
$$;
revoke all on function private.gate_checklist_tick_rules() from public, anon, authenticated;

-- 5. Move existing ticks to their project's current gate milestone (0 rows today).
update public.gate_checklist_ticks t
set milestone_id = g.milestone_id
from public.v_project_gates g
where g.project_id = t.project_id and g.is_current and g.milestone_id <> t.milestone_id
  and not exists (
    select 1 from public.gate_checklist_ticks o
    where o.milestone_id = g.milestone_id and o.criterion_id = t.criterion_id);

-- DRY RUN (15/10/2026, one transaction, rolled back; member and outsider simulated):
--   1  backfill                                   GATE 0 - Ready to Design 34 -> Phase 2,
--                                                 Closure report approved 3 -> Phase 6,
--                                                 Design authority approval 0, GATE 1 - Ready to
--                                                 Deliver 0 (unmapped, as proposed)
--   2  member edits an unmapped gate milestone    refused 23514
--   2b same edit, setting Phase 3                 1 row
--   2c new gate milestone without a phase         refused 23514
--   2d new delivery milestone without a phase     ok
--   3  v_project_gates (demo)                     9 current gates, 4 not passed; ARB: no current
--                                                 gate, MS-002 (Phase 2 gate) not passed in Phase 3
--   3b ARB current gate after 2b                  MS-003 Design authority approval
--   4  member ticks ARB's current-phase gate      ok
--   4b member ticks ARB GATE 0 (Phase 2 gate)     refused 23514
--   3c outsider reads v_project_gates             0 rows
--   5  new private function: anon / public        no execute
-- 11/11 as intended.
