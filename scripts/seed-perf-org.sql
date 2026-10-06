-- Performance test organisation: 500 projects with realistic volumes, for measuring the
-- health views (see docs/perf.md). Not part of the demo seed and not a migration.
--
-- Run as the database owner (SQL editor or psql), once per database:
--   psql "$DATABASE_URL" -f scripts/seed-perf-org.sql
--
-- Creates "Perf Test University" (slug perf-test-university) with one workspace, one
-- portfolio, 25 programmes and 500 projects, and per project: 3 buckets, 30 tasks,
-- 6 milestones, 4 risks, 2 issues and 1 benefit. Dates are relative to today, so the mix of
-- on-track, slipping and overdue work is the same whenever it runs. IDs are deterministic.
-- Nobody is a member; to look at it in the app, add yourself to organisation_members.

begin;
set local vpmo.seeding = 'on'; -- skip audit rows, as the demo seed does

do $$
begin
  if exists (select 1 from public.organisations where slug = 'perf-test-university') then
    raise exception 'The performance test organisation already exists';
  end if;
end $$;

create temp table perf_ids on commit drop as
select md5('virtual-pmo-perf:org')::uuid as org, md5('virtual-pmo-perf:workspace')::uuid as ws,
       md5('virtual-pmo-perf:portfolio')::uuid as portfolio, current_date as today;

-- Deterministic ids: id('project', 17) etc.
create function pg_temp.id(kind text, n integer) returns uuid language sql immutable as $f$
  select md5('virtual-pmo-perf:' || kind || ':' || n)::uuid
$f$;

insert into public.organisations (id, name, short_name, slug, region, settings)
select org, 'Perf Test University', 'PTU', 'perf-test-university', 'uk', private.default_org_settings()
from perf_ids;
insert into public.organisation_subscriptions (organisation_id, plan, seats_total)
select org, 'trial', 500 from perf_ids;
select private.seed_org_defaults(org) from perf_ids;
insert into public.workspaces (id, organisation_id, name, description)
select ws, org, 'Performance test', '500-project organisation for measuring the health views.' from perf_ids;

-- ---- People: 60 bookable resources ----
insert into public.resources (id, organisation_id, name, email, job_title, contracted_hours_per_week, fte, bau_percentage, is_bookable)
select pg_temp.id('resource', n), org, 'Person ' || n, 'person' || n || '@perf-test.ac.uk',
       (array['Project Manager', 'Business Analyst', 'Developer', 'Architect', 'Tester'])[1 + n % 5],
       36.25, 1, 20, true
from perf_ids, generate_series(1, 60) n;

-- ---- Hierarchy: 1 portfolio, 25 programmes, 500 projects ----
insert into public.portfolios (id, workspace_id, name, description, owner_id, budget)
select portfolio, ws, 'Perf portfolio', 'Every project in the test organisation.', pg_temp.id('resource', 1), 250000000
from perf_ids;

insert into public.programmes (id, portfolio_id, name, manager_id, sponsor_id, start_date, finish_date, budget)
select pg_temp.id('programme', n), portfolio, 'Programme ' || n, pg_temp.id('resource', 1 + n % 60),
       pg_temp.id('resource', 1 + (n + 7) % 60), today - 400, today + 400, 10000000
from perf_ids, generate_series(1, 25) n;

insert into public.projects (id, programme_id, name, code, manager_id, sponsor_id, tier, phase_id, state, priority,
                             start_date, finish_date, baseline_finish_date, task_source)
select pg_temp.id('project', n), pg_temp.id('programme', 1 + (n - 1) / 20), 'Project ' || n,
       'PT' || lpad(n::text, 4, '0'), pg_temp.id('resource', 1 + n % 60), pg_temp.id('resource', 1 + (n + 13) % 60),
       (array['small', 'medium', 'large']::public.project_tier[])[1 + n % 3],
       (select id from public.lifecycle_phases p where p.organisation_id = org order by sort_order offset n % 5 limit 1),
       case when n % 25 = 0 then 'closed' when n % 17 = 0 then 'on_hold' when n % 9 = 0 then 'proposed' else 'active' end::public.project_state,
       (array['low', 'moderate', 'high', 'critical']::public.priority[])[1 + n % 4],
       today - (60 + n % 300), today + (30 + n % 400),
       -- one in five has slipped against its baseline
       today + (30 + n % 400) - case when n % 5 = 0 then 45 else 0 end,
       'native'
from perf_ids, generate_series(1, 500) n;

-- ---- Financials: a baseline, four cost lines, 24 months of values ----
-- Budget B = 100,000 + (n mod 40) x 25,000, phased evenly over 24 months: 12 months to the
-- cut-off with actuals, 12 after it with forecast. One in seven runs 15% over budget; one in
-- eleven has an actual in the open month above its forecast (the overrun warning).
\ir seed-perf-org-financials.sql

-- ---- Work: buckets, tasks, milestones ----
insert into public.project_buckets (id, project_id, name, sort_order)
select pg_temp.id('bucket', p * 10 + b), pg_temp.id('project', p), (array['Plan', 'Build', 'Close'])[b], b
from generate_series(1, 500) p, generate_series(1, 3) b;

insert into public.work_items (id, project_id, title, item_type, status, bucket_id, priority, start_date, finish_date,
                               baseline_finish_date, percent_complete, estimated_effort_hours, effort_completed_hours, backlog_rank)
select pg_temp.id('task', p * 100 + t), pg_temp.id('project', p), 'Task ' || t, 'task',
       case when t <= 10 then 'done' when t <= 18 then 'in_progress' when t % 13 = 0 then 'blocked' else 'not_started' end::public.work_item_status,
       pg_temp.id('bucket', p * 10 + 1 + t % 3),
       (array['low', 'moderate', 'high', 'critical']::public.priority[])[1 + t % 4],
       today - 90 + t * 5, today - 80 + t * 5, today - 80 + t * 5,
       case when t <= 10 then 100 when t <= 18 then 50 else 0 end,
       16, case when t <= 10 then 16 when t <= 18 then 8 else 0 end, t
from perf_ids, generate_series(1, 500) p, generate_series(1, 30) t;

insert into public.milestones (id, project_id, title, type, owner_id, baseline_date, forecast_date, actual_date, report_to_committee)
select pg_temp.id('milestone', p * 10 + m), pg_temp.id('project', p), 'Milestone ' || m,
       (array['delivery', 'gate', 'key_date', 'external_dependency']::public.milestone_type[])[1 + m % 4],
       pg_temp.id('resource', 1 + (p + m) % 60),
       today - 120 + m * 40, today - 120 + m * 40 + case when p % 4 = 0 then 21 else 0 end,
       case when m <= 2 then today - 120 + m * 40 end, m % 2 = 0
from perf_ids, generate_series(1, 500) p, generate_series(1, 6) m;

-- ---- RAID ----
insert into public.risks (id, project_id, title, description, owner_id, probability, impact, response, status, review_date)
select pg_temp.id('risk', p * 10 + r), pg_temp.id('project', p), 'Risk ' || r, 'Generated for performance testing.',
       pg_temp.id('resource', 1 + (p + r) % 60), 1 + (p + r) % 5, 1 + (p * r) % 5, 'reduce',
       case when r = 4 then 'closed' else 'open' end::public.open_closed, today + 14
from perf_ids, generate_series(1, 500) p, generate_series(1, 4) r;

insert into public.issues (id, project_id, title, owner_id, severity, status, due_date)
select pg_temp.id('issue', p * 10 + i), pg_temp.id('project', p), 'Issue ' || i, pg_temp.id('resource', 1 + (p + i) % 60),
       (array['low', 'medium', 'high']::public.issue_severity[])[1 + (p + i) % 3],
       'open'::public.open_closed, today + case when p % 6 = 0 then -5 else 10 end
from perf_ids, generate_series(1, 500) p, generate_series(1, 2) i;

-- ---- Benefits: one per project ----
insert into public.benefits (id, portfolio_id, programme_id, title, type, classification, category_id, owner_id, status, planned_total_value)
select pg_temp.id('benefit', p), portfolio, pg_temp.id('programme', 1 + (p - 1) / 20), 'Benefit of project ' || p, 'benefit',
       'non_cash_releasing',
       (select id from public.lookup_values l where l.organisation_id = org and l.list_key = 'benefit_category' order by sort_order limit 1),
       pg_temp.id('resource', 1 + p % 60), 'planned', 50000
from perf_ids, generate_series(1, 500) p;

insert into public.benefit_projects (benefit_id, project_id, attribution_percent)
select pg_temp.id('benefit', p), pg_temp.id('project', p), 100
from generate_series(1, 500) p;

select o.name, (select count(*) from public.projects where organisation_id = o.id) as projects,
       (select count(*) from public.work_items where organisation_id = o.id) as tasks
from public.organisations o where o.slug = 'perf-test-university';

commit;
