-- Stage 1b: divergence_kind on v_project_divergence (trailing column).
--   optimistic_at_submission  the latest report declared better than the evidence frozen when
--                             it was submitted
--   evidence_moved            the latest report matched (or was worse than) the evidence then,
--                             and the evidence has worsened since
-- null when not divergent. The two-reports-in-a-row alert path (last_two) already counts only
-- reports that were optimistic at submission; evidence_moved alerts on the day threshold alone.

create or replace view public.v_project_divergence with (security_invoker = true) as
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
  select r.id, r.project_id, r.reporting_date, r.overall as declared, r.evidenced_overall,
    row_number() over (partition by r.project_id order by r.reporting_date desc, r.submitted_at desc) as rn
  from public.status_reports r
  where r.status = 'submitted'
),
latest as (
  select r.id, r.project_id, r.reporting_date, r.declared, r.evidenced_overall
  from reports r where r.rn = 1
),
-- The newest justification against the latest submitted report.
just as (
  select distinct on (j.status_report_id) j.status_report_id, j.text, j.created_at, j.author_id,
    j.evidenced_at_time
  from public.divergence_justifications j
  order by j.status_report_id, j.created_at desc
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
    l.id as latest_report_id, l.declared, l.reporting_date as last_report_date,
    jt.text as justification, jt.created_at as justification_at, jt.author_id as justification_author_id,
    -- Justified until the evidence worsens past what was justified (a new report has no
    -- justification of its own, so it needs a fresh one).
    (jt.status_report_id is not null and proj.evidenced <= jt.evidenced_at_time) as justification_holds,
    (l.declared is not null and l.declared <> 'not_set' and proj.evidenced <> 'not_set'
       and proj.evidenced > l.declared) as divergent,
    -- The latest report already declared better than the evidence frozen at its submission.
    (l.evidenced_overall is not null and l.declared <> 'not_set' and l.evidenced_overall <> 'not_set'
       and l.evidenced_overall > l.declared) as optimistic_at_submission,
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
  left join just jt on jt.status_report_id = l.id
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
  (s.divergent and not s.justification_holds
     and (s.today - s.divergence_since >= s.alert_days or s.last_two_better)) as divergence_alert,
  s.justification,
  s.divergent_prev_month_end,
  s.last_report_date,
  s.next_report_due,
  (s.state in ('active', 'on_hold') and s.next_report_due < s.today) as report_overdue,
  s.forecast_finish_date - s.baseline_finish_date as finish_vs_baseline_days,
  ( case when s.divergent and not s.justification_holds
              and (s.today - s.divergence_since >= s.alert_days or s.last_two_better) then 40
         when s.divergent then 15 else 0 end
    + least(30, greatest(0, coalesce(s.forecast_finish_date - s.baseline_finish_date, 0)) / 3)
    + case when s.state in ('active', 'on_hold') and s.next_report_due < s.today then 20 else 0 end
  )::integer as risk_score,
  s.latest_report_id,
  (s.divergent and s.justification_holds) as justified,
  s.justification_at,
  s.justification_author_id,
  case when not s.divergent then null
       when s.optimistic_at_submission then 'optimistic_at_submission'
       else 'evidence_moved' end as divergence_kind
from spans s;


