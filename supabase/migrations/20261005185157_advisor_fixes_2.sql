-- Advisor fixes 2.
--
-- 1. Nothing in the private schema should be executable by anon or PUBLIC. Migration 3's
--    `alter default privileges ... in schema private revoke ...` could not do this: a
--    schema-level default can only add to Postgres's global default (EXECUTE for PUBLIC),
--    never remove it. So every function is revoked explicitly here. Callers that need a
--    function already have an explicit grant to authenticated/service_role, and trigger
--    functions fire without EXECUTE. Later migrations must revoke new functions themselves.
-- 2. org_today() honours the vpmo.today override only when there is no signed-in user
--    (scripts, tests, cron). A signed-in session always gets the real date.
-- 3. v_benefit_period_values: among non-queried measurements in a period, validated wins,
--    then the latest submission.

create or replace function private.org_today(p_org uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case when (select auth.uid()) is null then nullif(current_setting('vpmo.today', true), '')::date end,
    (select (now() at time zone coalesce(o.settings -> 'regional' ->> 'timeZone', 'Europe/London'))::date
     from public.organisations o where o.id = p_org));
$$;

create or replace view public.v_benefit_period_values with (security_invoker = true) as
with periods as (
  select bp.*,
    (row_number() over (partition by bp.organisation_id order by bp.start_date) - 1)::integer as idx,
    count(*) over (partition by bp.organisation_id)::integer as n
  from public.benefit_periods bp
),
first_measure as (
  select distinct on (bm.benefit_id) bm.*
  from public.benefit_measures bm
  order by bm.benefit_id, bm.sort_order, bm.created_at, bm.id
),
final_target as (
  select distinct on (t.measure_id) t.measure_id, t.value
  from public.benefit_measure_targets t
  join public.benefit_periods bp on bp.id = t.period_id
  order by t.measure_id, bp.start_date desc
),
target_counts as (
  select t.measure_id, count(*) as n from public.benefit_measure_targets t group by t.measure_id
)
select
  b.id as benefit_id,
  b.organisation_id,
  b.workspace_id,
  pe.id as period_id,
  pe.label as period_label,
  pe.start_date,
  pe.finish_date,
  pe.idx,
  pe.n,
  case
    when fm.id is null or coalesce(tc.n, 0) = 0 then (pe.idx + 1)::numeric / pe.n
    when tg.value is null then 0
    when coalesce(ft.value, fm.baseline_value) - fm.baseline_value = 0 then 0
    else private.clamp((tg.value - fm.baseline_value) / (coalesce(ft.value, fm.baseline_value) - fm.baseline_value), 0, 1)
  end as planned_fraction,
  case
    when fm.id is null or rec.actual_value is null then null
    when coalesce(ft.value, fm.baseline_value) - fm.baseline_value = 0 then 0
    else private.clamp((rec.actual_value - fm.baseline_value) / (coalesce(ft.value, fm.baseline_value) - fm.baseline_value), 0, 1.35)
  end as actual_fraction,
  tg.value as target_value,
  rec.actual_value
from public.benefits b
join periods pe on pe.organisation_id = b.organisation_id
left join first_measure fm on fm.benefit_id = b.id
left join final_target ft on ft.measure_id = fm.id
left join target_counts tc on tc.measure_id = fm.id
left join public.benefit_measure_targets tg on tg.measure_id = fm.id and tg.period_id = pe.id
left join lateral (
  -- Several submissions per period are allowed (resubmission after a query, or a second
  -- data provider). Queried records never count; validated evidence wins, then the latest
  -- submission.
  select r.actual_value from public.benefit_measurements r
  where r.measure_id = fm.id and r.period_id = pe.id and r.status <> 'queried'
  order by (r.status = 'validated') desc, r.submitted_date desc nulls last, r.created_at desc, r.id desc
  limit 1
) rec on true;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;
