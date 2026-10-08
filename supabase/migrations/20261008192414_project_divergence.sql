-- Stage 1b: assurance from the database instead of sprints.ts.
--
-- v_project_divergence: one row per non-archived project the caller can see (security invoker,
-- so RLS on projects, status_reports and health_snapshots applies).
--   declared       overall RAG of the latest submitted status report (null if none)
--   evidenced      v_project_health.computed_overall (the evidence, ignoring any PM override)
--   divergent      evidenced worse than declared, both set
--   divergence_since / divergence_days
--                  start of the current unbroken run in which evidence was worse than the
--                  report in force. Each health snapshot day is compared with the latest
--                  submitted report on or before that day; snapshot evidence = worst of its five
--                  dimensions (so overrides don't hide it). Today counts from live evidence.
--   divergence_alert
--                  divergent for divergenceAlertDays+ days (organisation health setting, default
--                  14), or the last two submitted reports both declared better than the evidence
--                  captured when they were submitted
--   justification  override_reasons.overall on the latest submitted report
--   divergent_prev_month_end
--                  the same comparison at the end of last month (latest snapshot and report on
--                  or before it); null when there is nothing to compare
--   last_report_date, next_report_due, report_overdue
--                  next due = latest submitted reporting_date + cadence; with no report yet, the
--                  first is due one cadence after the start date. Closed projects have no due
--                  date; only active and on-hold projects can be overdue.
--   finish_vs_baseline_days
--                  forecast finish (v_project_health) minus baseline finish
--   risk_score     ordering for the Assurance register: 40 alert (15 if only divergent),
--                  + up to 30 for finish slip (1 point per 3 days), + 20 if the report is overdue
-- Reads seed and job snapshots alike; purging seed rows (source = 'seed') shortens history only.

create view public.v_project_divergence with (security_invoker = true) as
with proj as (
  select p.id as project_id, p.organisation_id, p.workspace_id, p.programme_id, p.code, p.state,
    p.start_date, p.baseline_finish_date, p.reporting_cadence,
    private.org_today(p.organisation_id) as today,
    coalesce(private.health_threshold(o.settings, 'divergenceAlertDays'), 14)::integer as alert_days,
    h.computed_overall as evidenced, h.forecast_finish_date
  from public.projects p
  join public.organisations o on o.id = p.organisation_id
  join public.v_project_health h on h.project_id = p.id
  where p.archived_at is null
),
reports as materialized (
  select r.project_id, r.reporting_date, r.overall as declared, r.evidenced_overall,
    r.override_reasons ->> 'overall' as justification,
    row_number() over (partition by r.project_id order by r.reporting_date desc, r.submitted_at desc) as rn
  from public.status_reports r
  where r.status = 'submitted'
),
latest as (
  select r.project_id, r.reporting_date, r.declared, r.justification
  from reports r where r.rn = 1
),
last_two as (
  select r.project_id,
    count(*) filter (where r.evidenced_overall > r.declared
                       and r.declared <> 'not_set' and r.evidenced_overall <> 'not_set') = 2 as both_better
  from reports r where r.rn <= 2
  group by r.project_id
  having count(*) = 2
),
days as materialized (
  select s.project_id, s.snapshot_date,
    greatest(s.schedule, s.financial, s.effort, s.issue, s.benefit) as evidenced,
    (select r.declared from reports r
      where r.project_id = s.project_id and r.reporting_date <= s.snapshot_date
      order by r.reporting_date desc, r.rn limit 1) as declared
  from public.health_snapshots s
  join proj on proj.project_id = s.project_id
  where s.snapshot_date <= proj.today
),
flags as (
  select d.project_id, d.snapshot_date,
    (d.declared is not null and d.declared <> 'not_set' and d.evidenced <> 'not_set'
       and d.evidenced > d.declared) as worse
  from days d
),
runs as (
  select f.project_id,
    max(f.snapshot_date) filter (where not f.worse) as last_not_worse,
    min(f.snapshot_date) filter (where f.worse) as first_worse,
    max(f.snapshot_date) as last_day
  from flags f
  group by f.project_id
),
prev as (
  select proj.project_id,
    (select greatest(s.schedule, s.financial, s.effort, s.issue, s.benefit)
       from public.health_snapshots s
      where s.project_id = proj.project_id
        and s.snapshot_date <= (date_trunc('month', proj.today) - interval '1 day')::date
      order by s.snapshot_date desc limit 1) as evidenced,
    (select r.declared from reports r
      where r.project_id = proj.project_id
        and r.reporting_date <= (date_trunc('month', proj.today) - interval '1 day')::date
      order by r.reporting_date desc, r.rn limit 1) as declared
  from proj
),
base as (
  select proj.*,
    l.declared, l.reporting_date as last_report_date, l.justification,
    (l.declared is not null and l.declared <> 'not_set' and proj.evidenced <> 'not_set'
       and proj.evidenced > l.declared) as divergent,
    coalesce(t.both_better, false) as last_two_better,
    ru.last_not_worse, ru.first_worse, ru.last_day,
    case when pv.evidenced is null or pv.declared is null
              or pv.evidenced = 'not_set' or pv.declared = 'not_set' then null
         else pv.evidenced > pv.declared end as divergent_prev_month_end,
    case when proj.state <> 'closed' then
      (coalesce(l.reporting_date, proj.start_date) + case proj.reporting_cadence
         when 'weekly' then interval '7 days'
         when 'fortnightly' then interval '14 days'
         else interval '1 month' end)::date
    end as next_report_due
  from proj
  left join latest l on l.project_id = proj.project_id
  left join last_two t on t.project_id = proj.project_id
  left join runs ru on ru.project_id = proj.project_id
  left join prev pv on pv.project_id = proj.project_id
),
spans as (
  select b.*,
    case
      when not b.divergent then null
      -- history worse up to the latest snapshot: the run starts after the last good day
      when b.first_worse is not null and (b.last_not_worse is null or b.last_not_worse < b.last_day)
        then coalesce(
          (select min(f.snapshot_date) from flags f
            where f.project_id = b.project_id and f.worse
              and f.snapshot_date > coalesce(b.last_not_worse, '-infinity'::date)),
          b.today)
      else b.today
    end as divergence_since
  from base b
)
select
  s.project_id, s.organisation_id, s.workspace_id, s.programme_id, s.code, s.state,
  s.declared, s.evidenced, s.divergent,
  s.divergence_since,
  case when s.divergence_since is null then 0 else s.today - s.divergence_since end as divergence_days,
  (s.divergent and (s.today - s.divergence_since >= s.alert_days or s.last_two_better)) as divergence_alert,
  s.justification,
  s.divergent_prev_month_end,
  s.last_report_date,
  s.next_report_due,
  (s.state in ('active', 'on_hold') and s.next_report_due < s.today) as report_overdue,
  s.forecast_finish_date - s.baseline_finish_date as finish_vs_baseline_days,
  ( case when s.divergent and (s.today - s.divergence_since >= s.alert_days or s.last_two_better) then 40
         when s.divergent then 15 else 0 end
    + least(30, greatest(0, coalesce(s.forecast_finish_date - s.baseline_finish_date, 0)) / 3)
    + case when s.state in ('active', 'on_hold') and s.next_report_due < s.today then 20 else 0 end
  )::integer as risk_score
from spans s;

revoke all on public.v_project_divergence from anon, authenticated;
grant select on public.v_project_divergence to authenticated;
