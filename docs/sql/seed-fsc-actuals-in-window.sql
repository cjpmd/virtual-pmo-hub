-- APPLIED 2026-10-14 (data change, not a migration; approved).  Seed fix: FSC's actuals inside its life.
--
-- FSC (Future Students CRM, closed) has one £712,000 actual booked in September 2026, six months
-- after it finished (start 15/09/2024, finish 14/03/2026). Its project chart (start to the later
-- of baseline and forecast finish) therefore shows 0% spend for its whole life.
-- This spreads the same £712,000 evenly over the 19 months it ran, September 2024 to March 2026,
-- on the same cost line: the existing row moves to September 2024 and 18 rows are added. Total
-- unchanged (actual to date stays £712,000). The rounding remainder goes on March 2026.
-- No DELETE: the MCP tool can run it once approved. No financial period is closed in the demo
-- organisation, so the closed-month guard does not block it. Writes queue a health refresh and
-- audit rows as usual.
--
-- Left as is (ask if wanted): FSC's −£7,000 forecast in October 2026 (EAC £705,000), and the same
-- after-closure pattern on the other closed projects: SDO £242,500, SFZ £44,500, UC2 £251,000,
-- all booked in September 2026.

with fsc as (
  select fv.id, fv.organisation_id, fv.workspace_id, fv.project_id, fv.cost_line_id
  from public.financial_values fv
  join public.projects p on p.id = fv.project_id
  where p.code = 'FSC' and fv.kind = 'actual' and fv.period_month = date '2026-09-01'
    and fv.amount = 712000
),
moved as (
  update public.financial_values fv
  set period_month = date '2024-09-01', amount = 37473.68
  from fsc
  where fv.id = fsc.id
  returning fv.id
)
insert into public.financial_values
  (organisation_id, workspace_id, project_id, cost_line_id, period_month, kind, amount)
select fsc.organisation_id, fsc.workspace_id, fsc.project_id, fsc.cost_line_id,
  (date '2024-09-01' + make_interval(months => n))::date, 'actual',
  case when n = 18 then 37473.76 else 37473.68 end -- 18 × 37,473.68 + 37,473.76 = 712,000
from fsc
cross join generate_series(1, 18) n
where exists (select 1 from moved);

-- Dry run (rolled back): FSC actual rows 19, Sep 2024 to Mar 2026, total 712000.00.
