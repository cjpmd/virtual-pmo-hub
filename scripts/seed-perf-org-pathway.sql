-- Benefits pathway data for the performance test organisation (included by seed-perf-org.sql,
-- or run on its own against an organisation seeded before Stage BP2). Per project: 2
-- capabilities (with forecast history), 1 outcome with 2 indicators and a measurement each,
-- linked to the project's benefit. Skips projects that already have capabilities.
set local vpmo.seeding = 'on';

insert into public.capabilities (id, programme_id, title, status, target_date, forecast_date, delivered_date, accepted_at, accepted_by_id)
select md5('virtual-pmo-perf:capability:' || (n * 10 + k))::uuid, p.programme_id, 'Capability ' || n || '.' || k,
       c.status, current_date + c.target, current_date + c.forecast,
       case when c.status in ('delivered', 'accepted') then current_date + c.target - 10 end,
       case when c.status = 'accepted' then current_date + c.target - 5 end,
       case when c.status = 'accepted' then md5('virtual-pmo-perf:resource:' || (1 + n % 60))::uuid end
from generate_series(1, 500) n
join public.projects p on p.id = md5('virtual-pmo-perf:project:' || n)::uuid
cross join generate_series(1, 2) k
-- A fixed mix: accepted, delivered past target, slipping, on track.
cross join lateral (select
  case when (n + k) % 6 = 0 then 'accepted' when (n + k) % 11 = 0 then 'delivered' when (n + k) % 3 = 0 then 'planned' else 'in_progress' end::public.capability_status as status,
  case when (n + k) % 6 = 0 then -40 when (n + k) % 11 = 0 then -7 else 20 + (n * k) % 300 end as target,
  case when (n + k) % 6 = 0 then -40 when (n + k) % 11 = 0 then -7 when n % 7 = 0 then 80 + (n * k) % 300 else 20 + (n * k) % 300 end as forecast) c
where not exists (select 1 from public.capability_projects cp where cp.project_id = p.id);

insert into public.capability_projects (capability_id, project_id)
select md5('virtual-pmo-perf:capability:' || (n * 10 + k))::uuid, md5('virtual-pmo-perf:project:' || n)::uuid
from generate_series(1, 500) n, generate_series(1, 2) k
on conflict do nothing;

insert into public.capability_forecast_history (capability_id, reporting_date, forecast_date)
select c.id, current_date - 60, c.target_date
from public.capabilities c
where c.organisation_id = md5('virtual-pmo-perf:org')::uuid and c.forecast_date <> c.target_date
on conflict do nothing;

insert into public.outcomes (id, programme_id, title, status, target_date)
select md5('virtual-pmo-perf:outcome:' || n)::uuid, p.programme_id, 'Outcome of project ' || n,
       case when n % 4 = 0 then 'emerging' else 'planned' end::public.outcome_status, current_date + 100 + n % 250
from generate_series(1, 500) n
join public.projects p on p.id = md5('virtual-pmo-perf:project:' || n)::uuid
on conflict do nothing;

insert into public.outcome_capabilities (outcome_id, capability_id)
select md5('virtual-pmo-perf:outcome:' || n)::uuid, md5('virtual-pmo-perf:capability:' || (n * 10 + k))::uuid
from generate_series(1, 500) n, generate_series(1, 2) k
on conflict do nothing;

insert into public.outcome_benefits (outcome_id, benefit_id)
select md5('virtual-pmo-perf:outcome:' || n)::uuid, md5('virtual-pmo-perf:benefit:' || n)::uuid
from generate_series(1, 500) n
on conflict do nothing;

insert into public.outcome_indicators (id, outcome_id, name, unit, baseline_value, baseline_date, target_value, target_date, next_due_date)
select md5('virtual-pmo-perf:indicator:' || (n * 10 + k))::uuid, md5('virtual-pmo-perf:outcome:' || n)::uuid,
       'Indicator ' || k, '%', 20, current_date - 120, 80, current_date + 200, current_date + 30
from generate_series(1, 500) n, generate_series(1, 2) k
on conflict do nothing;

-- One in four outcomes has measurements (some behind trajectory).
insert into public.outcome_indicator_measurements (id, indicator_id, measured_on, actual_value, status)
select md5('virtual-pmo-perf:indicator-measurement:' || (n * 10 + k))::uuid, md5('virtual-pmo-perf:indicator:' || (n * 10 + k))::uuid,
       current_date - 20, 20 + (n * k) % 30, case when n % 8 = 0 then 'submitted' else 'validated' end::public.measurement_status
from generate_series(1, 500) n, generate_series(1, 2) k
where n % 4 = 0
on conflict do nothing;

-- Half the benefits are in realisation.
update public.benefits b set realisation_start_date = current_date - 30, status = 'in_realisation'
from generate_series(1, 500) n
where b.id = md5('virtual-pmo-perf:benefit:' || n)::uuid and n % 2 = 0 and b.realisation_start_date is null;
