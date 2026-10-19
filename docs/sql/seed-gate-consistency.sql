-- PROPOSAL (19/10/2026): make the demo seed's gate dates agree with project phases. Not applied.
--
-- What the data shows (demo organisation): the seed gives every project the same milestone
-- schedule whatever its phase - GATE 0 - Ready to Design (Phase 2 gate) Aug-Nov 2026, Design
-- authority approval Nov 2026-Jan 2027, GATE 1 - Ready to Deliver (Phase 3 gate) Jan-Mar 2027.
-- Projects already in Phases 4-6 therefore have their Phase 3 gate (and the design approval
-- before it) still open, forecast months ahead:
--   Phase 4: ACA CAIG DOC(proposed) IOFTC(on hold) NRDC(proposed) W11
--   Phase 5: BCT BMF CMI(on hold) DSA VDI
--   Phase 6: ASS BCMF IRS(on hold) KBR
-- And four projects past Phase 2 have the Phase 2 gate open:
--   ARB  Phase 3  GATE 0 forecast 26/10/2026 (future)          baseline 16/09
--   CYB  Phase 3  GATE 0 forecast 20/09/2026 (past, overdue)   baseline 26/09
--   EBB  Phase 3  GATE 0 forecast 19/11/2026 (future)          baseline 11/09 (EBB also has
--                 GATE 1 forecast 26/02/2027, its current-phase gate, which is fine)
--   NRDC Phase 4  GATE 0 forecast 16/09/2026 (past)            plus Design authority and GATE 1
--                 open, as the Phase 4 list above
--
-- Two ways to make them agree:
--   A. Move phases back to match the milestones (most of the 18 would become Phase 2 or 3).
--      Changes every lifecycle stepper, gate checklist, phase filter and the screenshots taken
--      so far (ARB would go to Phase 2).
--   B. (Recommended) Keep the phases and record the earlier gates as passed, on plausible past
--      dates. Only milestone dates change; the seed's milestone schedule is generic anyway.
--
-- Option B, 34 milestones, update only (no DELETE):
--   * GATE 0 open on a project past Phase 2 (ARB, CYB, EBB, NRDC): passed on
--     least(forecast, today - 7).
--   * Design authority approval open on a project past Phase 3: passed 28 days after GATE 0
--     (its actual, or the date above), capped at today - 14.
--   * GATE 1 open on a project past Phase 3: passed 49 days after GATE 0, capped at today - 7.
--   * baseline_date, forecast_date and actual_date are all set to that date: the original
--     baselines are seed artefacts (2027), and keeping them would show these milestones as
--     delivered months early. Forecast changes add milestone_forecast_history rows (trigger);
--     health recalculates through the existing queue.
-- Effect: the "Gate N not passed" data-quality signal clears for all 18 projects; the
-- "No gate milestone for this phase" list is unchanged (it is about missing gates for Phases
-- 1, 3-6, not open ones).
--
-- Preview (read-only, computed 19/10/2026 with the organisation's today = 19/10/2026):
--   code  phase  ref     title                       new date
--   ARB   3      MS-002  GATE 0 - Ready to Design    12/10/2026
--   CYB   3      MS-002  GATE 0 - Ready to Design    20/09/2026
--   EBB   3      MS-002  GATE 0 - Ready to Design    12/10/2026
--   ACA   4      MS-003  Design authority approval   05/10/2026   MS-006 GATE 1  12/10/2026
--   CAIG  4      MS-003  Design authority approval   05/10/2026   MS-006 GATE 1  12/10/2026
--   DOC   4      MS-003  Design authority approval   12/09/2026   MS-006 GATE 1  03/10/2026
--   IOFTC 4      MS-003  Design authority approval   05/10/2026   MS-006 GATE 1  12/10/2026
--   NRDC  4      MS-002  GATE 0 16/09/2026;  MS-003 Design authority 05/10/2026;  MS-006 GATE 1 12/10/2026
--   W11   4      MS-003  Design authority approval   24/09/2026   MS-006 GATE 1  12/10/2026
--   BCT   5      MS-003  Design authority approval   05/10/2026   MS-006 GATE 1  12/10/2026
--   BMF   5      MS-003  Design authority approval   30/09/2026   MS-006 GATE 1  12/10/2026
--   CMI   5      MS-003  Design authority approval   05/10/2026   MS-006 GATE 1  12/10/2026
--   DSA   5      MS-003  Design authority approval   06/09/2026   MS-006 GATE 1  27/09/2026
--   VDI   5      MS-003  Design authority approval   18/09/2026   MS-006 GATE 1  09/10/2026
--   ASS   6      MS-003  Design authority approval   12/09/2026   MS-006 GATE 1  03/10/2026
--   BCMF  6      MS-003  Design authority approval   24/09/2026   MS-006 GATE 1  12/10/2026
--   IRS   6      MS-003  Design authority approval   05/10/2026   MS-006 GATE 1  12/10/2026
--   KBR   6      MS-003  Design authority approval   31/08/2026   MS-006 GATE 1  21/09/2026
-- Note: if D2 is applied first, "Design authority approval" is an approval milestone by then;
-- the statements below match it by title, so they work either way.

with t as (select o.id as organisation_id, private.org_today(o.id) as today from public.organisations o
           where o.id = '98e086a1-6b01-521a-92e9-21dac759c8f4'),
p as (
  select p.id, lp.sort_order as phase
  from public.projects p join public.lifecycle_phases lp on lp.id = p.phase_id
  join t on t.organisation_id = p.organisation_id
  where p.archived_at is null
),
g0 as (
  select m.project_id, m.actual_date, m.forecast_date from public.milestones m
  where m.title = 'GATE 0 - Ready to Design'
),
plan as (
  select m.id, least(m.forecast_date, t.today - 7) as d
  from p join public.milestones m on m.project_id = p.id and m.title = 'GATE 0 - Ready to Design' and m.actual_date is null, t
  where p.phase > 2
  union all
  select m.id, least(coalesce(g0.actual_date, least(g0.forecast_date, t.today - 7)) + 28, t.today - 14)
  from p join public.milestones m on m.project_id = p.id and m.title = 'Design authority approval' and m.actual_date is null
  join g0 on g0.project_id = p.id, t
  where p.phase > 3
  union all
  select m.id, least(coalesce(g0.actual_date, least(g0.forecast_date, t.today - 7)) + 49, t.today - 7)
  from p join public.milestones m on m.project_id = p.id and m.title = 'GATE 1 - Ready to Deliver' and m.actual_date is null
  join g0 on g0.project_id = p.id, t
  where p.phase > 3
)
update public.milestones m
set baseline_date = plan.d, forecast_date = plan.d, actual_date = plan.d
from plan
where m.id = plan.id;

-- DRY RUN (19/10/2026, one transaction, rolled back): 34 milestones updated, no errors;
-- "Gate N not passed" rows in the demo organisation 19 -> 0. Not applied (proposal only).
