-- APPLIED 08/10/2026. Part 1 is migration 20261008194610_status_reports_source; Part 2 ran once via
-- execute_sql (26 reports on 24 projects). Kept as the record of the seed data; not a migration.
-- assurance views have declared ratings to compare against the evidence.
--
-- Part 1 is a schema change (status_reports.source, like health_snapshots.source) so these
-- rows can be purged with the other seed data:
--   delete from public.status_reports where source = 'seed';
-- Part 2 inserts the reports. Evidence "at the time" is taken from the health snapshot on or
-- before each reporting date (worst of its five dimensions), exactly what the capture trigger
-- would have frozen had the report been submitted then.
--
-- Profiles (open projects without reports; ACA, CYB and EBB keep their existing three):
--   optimistic_twice  reports on 07/08 and 11/09, each declaring one level better than the
--                     evidence then: VDI, W11 (divergence alert fires: 30+ days, last two better)
--   optimistic        report on 11/09 declaring one level better than the evidence then:
--                     CAIG, CSCSI, DSA, WAH (divergent, no alert yet)
--   honest            report on 11/09 declaring exactly the evidence then: ARB and the rest.
--                     Where the evidence has worsened since (ARB, BCT, CMI, DOM, IOFTC, TAWS,
--                     mostly from the Stage 1a schedule rule) they show as divergent from today.
--   none              no report, so the overdue signal shows: CCM, STO, WPCMP
-- One level better = each dimension at the worst level moves up one (red→amber, amber→green).

-- ---------------------------------------------------------------------------
-- Part 1: schema (migration)
-- ---------------------------------------------------------------------------
alter table public.status_reports
  add column source text not null default 'user' check (source in ('seed', 'user'));

-- ---------------------------------------------------------------------------
-- Part 2: data (run once, as the service; no auth.uid(), so the supplied evidence is kept and
-- vpmo.seeding stops the per-report snapshot run)
-- ---------------------------------------------------------------------------
select set_config('vpmo.seeding', 'on', true);

with profile(code, kind) as (values
  ('VDI', 'optimistic_twice'), ('W11', 'optimistic_twice'),
  ('CAIG', 'optimistic'), ('CSCSI', 'optimistic'), ('DSA', 'optimistic'), ('WAH', 'optimistic'),
  ('ARB', 'honest'), ('ASS', 'honest'), ('BCMF', 'honest'), ('BCT', 'honest'), ('BMF', 'honest'),
  ('CIN', 'honest'), ('CMI', 'honest'), ('DLM', 'honest'), ('DMDR', 'honest'), ('DOM', 'honest'),
  ('IIRV', 'honest'), ('IOFTC', 'honest'), ('IRS', 'honest'), ('KBR', 'honest'), ('RDTA', 'honest'),
  ('SAM', 'honest'), ('STBP', 'honest'), ('TAWS', 'honest')
),
dates(kind, reporting_date) as (values
  ('optimistic_twice', date '2026-08-07'), ('optimistic_twice', date '2026-09-11'),
  ('optimistic', date '2026-09-11'), ('honest', date '2026-09-11')
),
plan as (
  select p.id as project_id, p.code, p.manager_id, pf.kind, d.reporting_date,
    s.schedule as ev_s, s.financial as ev_f, s.effort as ev_e, s.issue as ev_i, s.benefit as ev_b,
    greatest(s.schedule, s.financial, s.effort, s.issue, s.benefit) as ev_o
  from profile pf
  join public.projects p on p.code = pf.code and p.state in ('active', 'on_hold')
  join dates d on d.kind = pf.kind
  cross join lateral (
    select * from public.health_snapshots hs
    where hs.project_id = p.id and hs.snapshot_date <= d.reporting_date
    order by hs.snapshot_date desc limit 1) s
  where not exists (select 1 from public.status_reports r where r.project_id = p.id)
),
declared as (
  select pl.*,
    -- one level better on every dimension sitting at the worst level, for optimistic reports
    (select case when pl.kind = 'honest' or v <> pl.ev_o or v in ('green', 'not_set') then v
                 when v = 'red' then 'amber'::public.health else 'green'::public.health end
       from (values (pl.ev_s)) x(v)) as d_s,
    (select case when pl.kind = 'honest' or v <> pl.ev_o or v in ('green', 'not_set') then v
                 when v = 'red' then 'amber'::public.health else 'green'::public.health end
       from (values (pl.ev_f)) x(v)) as d_f,
    (select case when pl.kind = 'honest' or v <> pl.ev_o or v in ('green', 'not_set') then v
                 when v = 'red' then 'amber'::public.health else 'green'::public.health end
       from (values (pl.ev_e)) x(v)) as d_e,
    (select case when pl.kind = 'honest' or v <> pl.ev_o or v in ('green', 'not_set') then v
                 when v = 'red' then 'amber'::public.health else 'green'::public.health end
       from (values (pl.ev_i)) x(v)) as d_i,
    (select case when pl.kind = 'honest' or v <> pl.ev_o or v in ('green', 'not_set') then v
                 when v = 'red' then 'amber'::public.health else 'green'::public.health end
       from (values (pl.ev_b)) x(v)) as d_b
  from plan pl
),
texts as (
  select dc.*,
    greatest(dc.d_s, dc.d_f, dc.d_e, dc.d_i, dc.d_b) as d_o,
    (select m.title from public.milestones m where m.project_id = dc.project_id
       and m.actual_date <= dc.reporting_date order by m.actual_date desc limit 1) as done_ms,
    (select m.title || ' (forecast ' || to_char(m.forecast_date, 'DD/MM/YYYY') || ')' from public.milestones m
      where m.project_id = dc.project_id and m.actual_date is null and m.forecast_date > dc.reporting_date
      order by m.forecast_date limit 1) as next_ms
  from declared dc
)
insert into public.status_reports (project_id, reporting_date, status, submitted_at, source, submitter_id,
  overall, schedule, financial, effort, issue, declared_benefit,
  evidenced_overall, evidenced_schedule, evidenced_financial, evidenced_effort, evidenced_issue, evidenced_benefit,
  accomplished, planned, comments, decisions_needed)
select t.project_id, t.reporting_date, 'submitted', (t.reporting_date + 2) + time '10:00', 'seed', t.manager_id,
  t.d_o, t.d_s, t.d_f, t.d_e, t.d_i, t.d_b,
  t.ev_o, t.ev_s, t.ev_f, t.ev_e, t.ev_i, t.ev_b,
  coalesce('Signed off: ' || t.done_ms || '. ', '') || 'Delivery plan reviewed with the team and dependencies updated.',
  coalesce('Prepare for ' || t.next_ms || '. ', '') || 'Confirm resourcing for the next phase.',
  case
    when t.kind <> 'honest' and t.d_o = 'green' then 'Work is broadly on plan. Minor slippage is being absorbed within the phase and we do not expect it to affect the overall finish.'
    when t.kind <> 'honest' then 'There are some pressures, but the team has a recovery plan and expects to be back on track by the next report.'
    when t.d_o = 'red' then 'Delivery is off track against the baseline. The issues below need sponsor attention before the next gate.'
    when t.d_o = 'amber' then 'Some milestones have slipped and are being re-planned. Risks are being managed but need watching.'
    else 'Delivery is on plan against the baseline, with no material issues this period.'
  end,
  case
    when t.d_o = 'red' then 'Sponsor to agree a revised baseline or reduced scope at the next board.'
    when t.d_o = 'amber' or t.kind <> 'honest' then 'Sponsor to confirm the recovery plan and any extra resource it needs.'
  end
from texts t;
