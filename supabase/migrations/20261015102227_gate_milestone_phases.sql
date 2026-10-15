-- APPLIED 15/10/2026. Gate milestones belong to a lifecycle phase. Proposal, mapping and dry run: docs/sql/gate-milestone-phases.sql.
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
