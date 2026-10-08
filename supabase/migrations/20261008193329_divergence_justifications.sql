-- Stage 1b: divergence justifications.
--
-- A justification explains why the latest submitted report is better than the evidence. It is
-- tied to that report and records what was true when it was written (declared, evidenced,
-- divergence days), captured by the database, not sent by the client.
--   * insert: project members with edit rights (as status_reports); only while the project is
--     divergent; status_report_id, the "at the time" values, author and time are set here
--   * update/delete: workspace admins only (an organisation admin counts, as elsewhere)
--   * read: workspace members (as status_reports)
-- v_project_divergence: justification now comes from this table (override_reasons are no longer
-- read); new trailing columns latest_report_id, justified, justification_at,
-- justification_author_id. A justified divergence raises no alert (and scores 15, not 40) until
-- the evidence worsens past what was justified or a new report is submitted.

-- A report id plus its project, so a justification can only point at its own project's report.
alter table public.status_reports add constraint status_reports_id_project_key unique (id, project_id);

create table public.divergence_justifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  status_report_id uuid not null,
  author_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  text text not null check (length(btrim(text)) between 1 and 2000),
  declared_at_time public.health not null,
  evidenced_at_time public.health not null,
  divergence_days_at_time integer not null check (divergence_days_at_time >= 0),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (status_report_id, project_id) references public.status_reports (id, project_id) on delete cascade,
  foreign key (author_id) references public.profiles (id) on delete set null
);
create index divergence_justifications_workspace_idx on public.divergence_justifications (workspace_id, organisation_id);
create index divergence_justifications_organisation_idx on public.divergence_justifications (organisation_id);
create index divergence_justifications_project_idx on public.divergence_justifications (project_id, workspace_id);
create index divergence_justifications_report_idx on public.divergence_justifications (status_report_id, project_id, created_at desc);
create index divergence_justifications_author_idx on public.divergence_justifications (author_id);

create trigger divergence_justifications_00_tenant_guard before insert or update on public.divergence_justifications
  for each row execute function private.tenant_guard('project_id', 'projects');

-- Fills in the report and the "at the time" values from v_project_divergence; refuses a
-- justification when there is nothing to justify. Runs after the tenant guard (name order).
create function private.capture_divergence_justification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
begin
  select v.latest_report_id, v.declared, v.evidenced, v.divergent, v.divergence_days into d
  from public.v_project_divergence v where v.project_id = new.project_id;
  if d.latest_report_id is null or not coalesce(d.divergent, false) then
    raise exception 'Nothing to justify: the latest report is not better than the evidence.'
      using errcode = '23514';
  end if;
  new.status_report_id := d.latest_report_id;
  new.declared_at_time := d.declared;
  new.evidenced_at_time := d.evidenced;
  new.divergence_days_at_time := d.divergence_days;
  new.author_id := (select auth.uid());
  new.created_at := now();
  return new;
end;
$$;
revoke all on function private.capture_divergence_justification() from public, anon, authenticated;
create trigger divergence_justifications_10_capture before insert on public.divergence_justifications
  for each row execute function private.capture_divergence_justification();
create trigger divergence_justifications_audit after insert or update or delete on public.divergence_justifications
  for each row execute function private.audit_row_change();

alter table public.divergence_justifications enable row level security;
revoke all on public.divergence_justifications from anon, authenticated;
grant select, insert, update, delete on public.divergence_justifications to authenticated;
create policy divergence_justifications_select on public.divergence_justifications for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy divergence_justifications_insert on public.divergence_justifications for insert to authenticated
  with check (project_id = any ((select private.my_editable_project_ids())::uuid[]));
create policy divergence_justifications_update on public.divergence_justifications for update to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('admin'))::uuid[]))
  with check (workspace_id = any ((select private.my_workspace_ids('admin'))::uuid[]));
create policy divergence_justifications_delete on public.divergence_justifications for delete to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('admin'))::uuid[]));

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
  select r.id, r.project_id, r.reporting_date, r.declared
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
  s.justification_author_id
from spans s;


