-- APPLIED 08/10/2026 (execute_sql, one transaction, 78 rows). Kept as the record of the seed-data fix; not a migration.
-- Seed-data fix (Stage 1a, option c): pull seed milestones that were baselined after their
-- project's baseline finish back inside it.
--
-- Rule, per non-closed, non-archived project whose latest milestone baseline is after its
-- baseline finish:
--   * only undelivered milestones baselined after today (08/10/2026) move; nothing in the past,
--     nothing delivered, and closed projects (FSC, SFZ) are untouched;
--   * anchor A = the later of today and the project's latest unmoved milestone baseline;
--     new baseline = A + max(1, round((old - A) x (baseline finish - A) / (latest baseline - A))),
--     so order is kept, nothing lands on or before A (so not before today or any unmoved
--     milestone) and the last lands on the baseline finish;
--   * forecast moves with it, so each milestone keeps its slip.
-- 78 milestones on 17 projects. Checked before applying: none lands before today or an
-- unmoved milestone, no new same-date pairs, smallest gap between consecutive milestones
-- involving a moved one = 9 days (CMI and ACA, MS-003 to MS-004; was 18). The only same-day
-- pairs on these projects are existing, unmoved past ones (IOFTC and W11, MS-001/MS-002). The milestone-forecast history and audit triggers are
-- suspended for the update so seed correction doesn't read as a reforecast; updated_at still
-- bumps (open editors get a conflict, as they should).
--
-- Afterwards 6 projects still forecast their last milestone 7 days after the baseline finish
-- (ACA, CAIG, DOC, IOFTC, NRDC, W11): that is real slip, and Schedule stays red for them.
--
-- code  ref     milestone                    baseline              forecast
-- ACA   MS-003  Design authority approval    2027-02-08→2026-12-09 2027-02-08→2026-12-09
-- ACA   MS-004  Pilot service launch         2027-02-26→2026-12-18 2027-03-07→2026-12-27
-- ACA   MS-005  Supplier mobilisation        2027-03-31→2027-01-03 2027-03-31→2027-01-03
-- ACA   MS-006  GATE 1 - Ready to Deliver    2027-04-25→2027-01-16 2027-05-02→2027-01-23
-- ASS   MS-003  Design authority approval    2026-12-18→2026-12-12 2026-12-18→2026-12-12
-- ASS   MS-004  Pilot service launch         2027-01-05→2026-12-28 2027-01-14→2027-01-06
-- ASS   MS-005  Supplier mobilisation        2027-02-07→2027-01-27 2027-02-07→2027-01-27
-- ASS   MS-006  GATE 1 - Ready to Deliver    2027-03-04→2027-02-19 2027-03-11→2027-02-26
-- ASS   MS-007  Benefits review              2027-04-18→2027-04-01 2027-04-18→2027-04-01
-- BCMF  MS-003  Design authority approval    2026-12-18→2026-12-07 2026-12-18→2026-12-07
-- BCMF  MS-004  Pilot service launch         2027-01-05→2026-12-23 2027-01-14→2027-01-01
-- BCMF  MS-005  Supplier mobilisation        2027-02-07→2027-01-20 2027-02-07→2027-01-20
-- BCMF  MS-006  GATE 1 - Ready to Deliver    2027-03-04→2027-02-10 2027-03-11→2027-02-17
-- BCMF  MS-007  Benefits review              2027-04-18→2027-03-20 2027-04-18→2027-03-20
-- BCT   MS-003  Design authority approval    2027-02-21→2026-12-21 2027-02-21→2026-12-21
-- BCT   MS-004  Pilot service launch         2027-03-11→2026-12-31 2027-03-20→2027-01-09
-- BCT   MS-005  Supplier mobilisation        2027-04-13→2027-01-18 2027-04-13→2027-01-18
-- BCT   MS-006  GATE 1 - Ready to Deliver    2027-05-08→2027-01-31 2027-05-15→2027-02-07
-- BCT   MS-007  Benefits review              2027-06-22→2027-02-25 2027-06-22→2027-02-25
-- BMF   MS-003  Design authority approval    2026-12-05→2026-11-20 2026-12-05→2026-11-20
-- BMF   MS-004  Pilot service launch         2026-12-23→2026-12-04 2027-01-01→2026-12-13
-- BMF   MS-005  Supplier mobilisation        2027-01-25→2026-12-29 2027-01-25→2026-12-29
-- BMF   MS-006  GATE 1 - Ready to Deliver    2027-02-19→2027-01-16 2027-02-26→2027-01-23
-- BMF   MS-007  Benefits review              2027-04-05→2027-02-19 2027-04-05→2027-02-19
-- CAIG  MS-003  Design authority approval    2026-11-22→2026-11-15 2026-11-22→2026-11-15
-- CAIG  MS-004  Pilot service launch         2026-12-10→2026-11-30 2026-12-19→2026-12-09
-- CAIG  MS-005  Supplier mobilisation        2027-01-12→2026-12-28 2027-01-12→2026-12-28
-- CAIG  MS-006  GATE 1 - Ready to Deliver    2027-02-06→2027-01-18 2027-02-13→2027-01-25
-- CMI   MS-003  Design authority approval    2027-02-21→2026-12-17 2027-02-21→2026-12-17
-- CMI   MS-004  Pilot service launch         2027-03-11→2026-12-26 2027-03-20→2027-01-04
-- CMI   MS-005  Supplier mobilisation        2027-04-13→2027-01-12 2027-04-13→2027-01-12
-- CMI   MS-006  GATE 1 - Ready to Deliver    2027-05-08→2027-01-25 2027-05-15→2027-02-01
-- CMI   MS-007  Benefits review              2027-06-22→2027-02-17 2027-06-22→2027-02-17
-- DOC   MS-003  Design authority approval    2026-11-22→2026-11-16 2026-11-22→2026-11-16
-- DOC   MS-004  Pilot service launch         2026-12-10→2026-12-02 2026-12-19→2026-12-11
-- DOC   MS-005  Supplier mobilisation        2027-01-12→2026-12-31 2027-01-12→2026-12-31
-- DOC   MS-006  GATE 1 - Ready to Deliver    2027-02-06→2027-01-22 2027-02-13→2027-01-29
-- DSA   MS-003  Design authority approval    2026-12-05→2026-11-22 2026-12-05→2026-11-22
-- DSA   MS-004  Pilot service launch         2026-12-23→2026-12-06 2027-01-01→2026-12-15
-- DSA   MS-005  Supplier mobilisation        2027-01-25→2026-12-31 2027-01-25→2026-12-31
-- DSA   MS-006  GATE 1 - Ready to Deliver    2027-02-19→2027-01-19 2027-02-26→2027-01-26
-- DSA   MS-007  Benefits review              2027-04-05→2027-02-23 2027-04-05→2027-02-23
-- EBB   MS-003  Design authority approval    2027-03-06→2027-01-05 2027-03-06→2027-01-05
-- EBB   MS-004  Pilot service launch         2027-03-24→2027-01-16 2027-04-02→2027-01-25
-- EBB   MS-005  Supplier mobilisation        2027-04-26→2027-02-04 2027-04-26→2027-02-04
-- EBB   MS-006  GATE 1 - Ready to Deliver    2027-05-21→2027-02-19 2027-05-28→2027-02-26
-- EBB   MS-007  Benefits review              2027-07-05→2027-03-18 2027-07-05→2027-03-18
-- IOFTC MS-003  Design authority approval    2027-02-08→2026-12-16 2027-02-08→2026-12-16
-- IOFTC MS-004  Pilot service launch         2027-02-26→2026-12-26 2027-03-07→2027-01-04
-- IOFTC MS-005  Supplier mobilisation        2027-03-31→2027-01-14 2027-03-31→2027-01-14
-- IOFTC MS-006  GATE 1 - Ready to Deliver    2027-04-25→2027-01-28 2027-05-02→2027-02-04
-- IRS   MS-003  Design authority approval    2027-03-06→2027-01-09 2027-03-06→2027-01-09
-- IRS   MS-004  Pilot service launch         2027-03-24→2027-01-21 2027-04-02→2027-01-30
-- IRS   MS-005  Supplier mobilisation        2027-04-26→2027-02-10 2027-04-26→2027-02-10
-- IRS   MS-006  GATE 1 - Ready to Deliver    2027-05-21→2027-02-26 2027-05-28→2027-03-05
-- IRS   MS-007  Benefits review              2027-07-05→2027-03-26 2027-07-05→2027-03-26
-- KBR   MS-003  Design authority approval    2026-12-18→2026-12-09 2026-12-18→2026-12-09
-- KBR   MS-004  Pilot service launch         2027-01-05→2026-12-24 2027-01-14→2027-01-02
-- KBR   MS-005  Supplier mobilisation        2027-02-07→2027-01-22 2027-02-07→2027-01-22
-- KBR   MS-006  GATE 1 - Ready to Deliver    2027-03-04→2027-02-13 2027-03-11→2027-02-20
-- KBR   MS-007  Benefits review              2027-04-18→2027-03-24 2027-04-18→2027-03-24
-- NRDC  MS-007  Network stable               2026-10-30→2026-10-20 2026-12-04→2026-11-24
-- NRDC  MS-003  Design authority approval    2027-02-08→2026-12-14 2027-02-08→2026-12-14
-- NRDC  MS-004  Pilot service launch         2027-02-26→2026-12-24 2027-03-07→2027-01-02
-- NRDC  MS-005  Supplier mobilisation        2027-03-31→2027-01-10 2027-03-31→2027-01-10
-- NRDC  MS-006  GATE 1 - Ready to Deliver    2027-04-25→2027-01-24 2027-05-02→2027-01-31
-- SAM   MS-003  Design authority approval    2027-01-26→2027-01-24 2027-01-26→2027-01-24
-- SAM   MS-004  Pilot service launch         2027-02-13→2027-02-11 2027-02-22→2027-02-20
-- SAM   MS-005  Supplier mobilisation        2027-03-18→2027-03-15 2027-03-18→2027-03-15
-- VDI   MS-003  Design authority approval    2026-12-05→2026-11-24 2026-12-05→2026-11-24
-- VDI   MS-004  Pilot service launch         2026-12-23→2026-12-09 2027-01-01→2026-12-18
-- VDI   MS-005  Supplier mobilisation        2027-01-25→2027-01-05 2027-01-25→2027-01-05
-- VDI   MS-006  GATE 1 - Ready to Deliver    2027-02-19→2027-01-25 2027-02-26→2027-02-01
-- VDI   MS-007  Benefits review              2027-04-05→2027-03-03 2027-04-05→2027-03-03
-- W11   MS-003  Design authority approval    2026-11-22→2026-11-19 2026-11-22→2026-11-19
-- W11   MS-004  Pilot service launch         2026-12-10→2026-12-06 2026-12-19→2026-12-15
-- W11   MS-005  Supplier mobilisation        2027-01-12→2027-01-06 2027-01-12→2027-01-06
-- W11   MS-006  GATE 1 - Ready to Deliver    2027-02-06→2027-01-30 2027-02-13→2027-02-06

alter table public.milestones disable trigger milestones_forecast_history;
alter table public.milestones disable trigger milestones_audit;

with proj as (
  select p.id, p.baseline_finish_date as bf, max(m.baseline_date) as max_b
  from public.projects p
  join public.milestones m on m.project_id = p.id
  where p.state <> 'closed' and p.archived_at is null
  group by p.id, p.baseline_finish_date
  having max(m.baseline_date) > p.baseline_finish_date
),
cls as (
  select m.id, m.project_id, m.baseline_date, m.forecast_date, pr.bf, pr.max_b,
    (m.actual_date is null and m.baseline_date > date '2026-10-08') as moving
  from public.milestones m
  join proj pr on pr.id = m.project_id
),
anchor as (
  select project_id,
    greatest(date '2026-10-08', max(baseline_date) filter (where not moving)) as a
  from cls
  group by project_id
),
plan as (
  select c.id,
    an.a + greatest(1, round((c.baseline_date - an.a)::numeric * (c.bf - an.a) / (c.max_b - an.a))::int) as new_b,
    c.forecast_date - c.baseline_date as slip
  from cls c
  join anchor an on an.project_id = c.project_id
  where c.moving
)
update public.milestones m
set baseline_date = plan.new_b, forecast_date = plan.new_b + plan.slip
from plan
where m.id = plan.id and m.baseline_date <> plan.new_b;   -- expect 78 rows

alter table public.milestones enable trigger milestones_audit;
alter table public.milestones enable trigger milestones_forecast_history;
