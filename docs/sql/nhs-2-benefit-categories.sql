-- NHS-2: NHS benefit categories and the cash-releasing split (docs/nhs-module-plan.md § NHS-2,
-- docs/sql/nhs-2-benefit-categories.sql). Written by an unattended run on 23/11/2026: tested on the
-- local Postgres only, NOT applied to production. Apply after 20261123090000_nhs_1d_register_matrix.
-- Nothing here is destructive: one nullable column, three new functions and two functions
-- replaced (private.seed_module_defaults with one branch added, private.rb_benefits_value with
-- two keys added to its result).
--
-- Design
-- - The cash-releasing flag the plan asks for already exists: benefits, business_case_benefits and
--   request_benefit_drafts all carry `classification` (benefit_classification: cash_releasing,
--   non_cash_releasing, qualitative, societal). No `is_cash_releasing` column is added (it would
--   duplicate the enum and could disagree with it): cash-releasing means classification =
--   'cash_releasing'; every other classification is non-cash.
-- - "Defaulted from category and editable": each organisation may keep
--   settings.benefits.categoryClassification, a map of benefit_category lookup value →
--   classification. The screens pre-select it when a category is chosen; people can change it.
--   The NHS module seeds the map for the NHS categories only (missing keys only).
-- - The benefit_categories_nhs module seeds (missing values only, nothing renamed or reactivated):
--   twelve NHS benefit categories and a new lookup list `measure_unit` of unit presets.
-- - benefit_measures.notional_unit_value (core, every organisation): an optional notional £ value
--   per unit of the measure (for example one staff hour = £32), shown as notional and non-cash,
--   never added to cash-releasing totals.
-- - rb_benefits_value gains non_cash_planned / non_cash_realised; the new block
--   benefits_by_category shows planned and realised value per category, cash and non-cash apart.
--   Both are core (any organisation's categories), not owned by the module.

-- ---------------------------------------------------------------------------------------------
-- 1. Seed sets
-- ---------------------------------------------------------------------------------------------

create function private.nhs_benefit_categories()
returns table (value text, label text, classification public.benefit_classification, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select v.value, v.label, v.classification::public.benefit_classification, v.sort_order
  from (values
    ('cash_releasing_efficiency', 'Cash-releasing efficiency', 'cash_releasing', 1),
    ('non_cash_releasing_efficiency', 'Non-cash-releasing efficiency (productivity, capacity)', 'non_cash_releasing', 2),
    ('staff_time_released', 'Staff time released', 'non_cash_releasing', 3),
    ('bed_days_saved', 'Bed days saved', 'non_cash_releasing', 4),
    ('length_of_stay', 'Length of stay', 'non_cash_releasing', 5),
    ('elective_activity', 'Elective activity and waiting list (RTT)', 'non_cash_releasing', 6),
    ('patient_safety', 'Patient safety (incidents, harm)', 'qualitative', 7),
    ('patient_experience', 'Patient experience', 'qualitative', 8),
    ('clinical_outcomes', 'Clinical outcomes', 'qualitative', 9),
    ('staff_experience', 'Staff experience and retention', 'qualitative', 10),
    ('net_zero', 'Environmental and net zero', 'societal', 11),
    ('health_inequalities', 'Health inequalities', 'societal', 12)
  ) as v(value, label, classification, sort_order);
$$;
revoke execute on function private.nhs_benefit_categories() from public, anon;

create function private.measure_unit_presets()
returns table (value text, label text, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select v.value, v.label, v.sort_order
  from (values
    ('gbp', '£', 1),
    ('staff_hours', 'Staff hours', 2),
    ('wte', 'WTE', 3),
    ('bed_days', 'Bed days', 4),
    ('patients', 'Patients', 5),
    ('weeks_wait', 'Weeks wait', 6),
    ('incidents', 'Incidents', 7),
    ('percent', '%', 8)
  ) as v(value, label, sort_order);
$$;
revoke execute on function private.measure_unit_presets() from public, anon;

-- ---------------------------------------------------------------------------------------------
-- 2. Notional value per unit on a measure (core)
-- ---------------------------------------------------------------------------------------------

alter table public.benefit_measures
  add column notional_unit_value numeric(14,2)
    constraint benefit_measures_notional_unit_value_check check (notional_unit_value is null or notional_unit_value >= 0);
comment on column public.benefit_measures.notional_unit_value is
  'Optional notional £ value of one unit of the measure (NHS-2). Notional and non-cash: never part of cash-releasing totals.';

-- ---------------------------------------------------------------------------------------------
-- 3. Module seeding: the NHS-1 body with one branch added for benefit_categories_nhs.
-- ---------------------------------------------------------------------------------------------

create or replace function private.seed_module_defaults(p_org uuid, p_module text, p_pack text default 'general',
                                                        p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_more jsonb;
  v_map jsonb;
begin
  if p_module <> 'core' and not (p_module = any (private.module_keys())) then
    raise exception 'Unknown module %', p_module using errcode = '22023';
  end if;

  if p_module = 'core' then
    select coalesce(jsonb_agg(jsonb_build_object('list', 'governance_role', 'value', r.value, 'label', r.label)
                              order by r.sort_order), '[]'::jsonb)
      into v_items
    from private.pack_governance_roles(p_pack) r
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'governance_role' and l.value = r.value);
    if p_apply then
      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'governance_role', r.value, r.label,
             r.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'governance_role'), 0)
      from private.pack_governance_roles(p_pack) r
      on conflict (organisation_id, list_key, value) do nothing;
    end if;
  end if;

  -- NHS-1: board assurance.
  if p_module = 'assurance' then
    select coalesce(jsonb_agg(jsonb_build_object('list', 'risk_appetite', 'value', r.value, 'label', r.label)
                              order by r.sort_order), '[]'::jsonb)
      into v_more
    from private.risk_appetite_levels() r
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'risk_appetite' and l.value = r.value);
    v_items := v_items || v_more;
    if p_apply then
      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'risk_appetite', r.value, r.label,
             r.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'risk_appetite'), 0)
      from private.risk_appetite_levels() r
      on conflict (organisation_id, list_key, value) do nothing;
    end if;

    if p_pack = 'nhs' and not exists (select 1 from public.organisations o
                                      where o.id = p_org and coalesce(o.settings -> 'assurance' ->> 'matrixKey', '') <> '') then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'setting', 'assurance.matrixKey', 'value', 'nhs_5x5', 'label', 'NHS 5×5 matrix for new strategic risks'));
      if p_apply then
        update public.organisations o
           set settings = jsonb_set(o.settings, '{assurance}',
                                    coalesce(o.settings -> 'assurance', '{}'::jsonb) || '{"matrixKey":"nhs_5x5"}'::jsonb)
         where o.id = p_org;
      end if;
    end if;
  end if;

  -- NHS-2: NHS benefit categories, measure unit presets and default classifications. NHS-only by
  -- nature, so the same whichever pack the organisation has.
  if p_module = 'benefit_categories_nhs' then
    select coalesce(jsonb_agg(jsonb_build_object('list', 'benefit_category', 'value', c.value, 'label', c.label)
                              order by c.sort_order), '[]'::jsonb)
      into v_more
    from private.nhs_benefit_categories() c
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'benefit_category' and l.value = c.value);
    v_items := v_items || v_more;

    select coalesce(jsonb_agg(jsonb_build_object('list', 'measure_unit', 'value', u.value, 'label', u.label)
                              order by u.sort_order), '[]'::jsonb)
      into v_more
    from private.measure_unit_presets() u
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'measure_unit' and l.value = u.value);
    v_items := v_items || v_more;

    -- Default classification for each NHS category the organisation hasn't mapped yet.
    select coalesce(jsonb_object_agg(c.value, c.classification::text), '{}'::jsonb)
      into v_map
    from private.nhs_benefit_categories() c, public.organisations o
    where o.id = p_org
      and not coalesce(o.settings -> 'benefits' -> 'categoryClassification' ? c.value, false);
    if v_map <> '{}'::jsonb then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'setting', 'benefits.categoryClassification', 'value', v_map,
        'label', 'Default cash-releasing / non-cash classification for the NHS benefit categories'));
    end if;

    if p_apply then
      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'benefit_category', c.value, c.label,
             c.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'benefit_category'), 0)
      from private.nhs_benefit_categories() c
      on conflict (organisation_id, list_key, value) do nothing;

      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'measure_unit', u.value, u.label,
             u.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'measure_unit'), 0)
      from private.measure_unit_presets() u
      on conflict (organisation_id, list_key, value) do nothing;

      if v_map <> '{}'::jsonb then
        update public.organisations o
           set settings = jsonb_set(
                 case when jsonb_typeof(o.settings -> 'benefits') = 'object' then o.settings
                      else o.settings || jsonb_build_object('benefits', '{}'::jsonb) end,
                 '{benefits,categoryClassification}',
                 v_map || coalesce(case when jsonb_typeof(o.settings -> 'benefits' -> 'categoryClassification') = 'object'
                                        then o.settings -> 'benefits' -> 'categoryClassification' end, '{}'::jsonb))
         where o.id = p_org;
      end if;
    end if;
  end if;

  return v_items;
end;
$$;
revoke execute on function private.seed_module_defaults(uuid, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Report blocks
-- ---------------------------------------------------------------------------------------------

-- benefits_value (GL-14a) with the non-cash totals beside the cash-releasing ones. Non-cash is
-- every classification other than cash_releasing. Otherwise unchanged.
create or replace function private.rb_benefits_value(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with b as (
    select b.id, b.ref, b.title, b.type::text as type, b.classification::text as classification, b.confidence::text as confidence,
      b.planned_total_value, coalesce(br.realised_value, 0) as realised_value, br.realised_percent,
      coalesce(br.behind_profile, false) as behind_profile, ro.name as owner
    from public.benefits b
    left join public.v_benefit_realisation br on br.benefit_id = b.id
    left join public.resources ro on ro.id = b.owner_id
    where b.id in (select bp.benefit_id from public.benefit_projects bp where bp.project_id = any (private.rb_projects(ctx)))
  ),
  pos as (select * from b where type = 'benefit'),
  lim as (select coalesce((cfg ->> 'limit')::integer, 5) as n, coalesce((cfg ->> 'objectives_limit')::integer, 6) as o),
  objectives as (
    select o.id, o.title as name, sum(greatest(0, pos.planned_total_value)) as planned,
      sum(greatest(0, pos.realised_value)) as realised, count(*)::integer as count
    from pos join public.benefit_objectives bo on bo.benefit_id = pos.id
    join public.strategic_objectives o on o.id = bo.strategic_objective_id
    group by o.id, o.title
    having sum(greatest(0, pos.planned_total_value)) > 0
  ),
  overdue as (
    select m.id, b.ref, b.title as benefit, m.name as measure, m.next_due_date,
      (ctx ->> 'as_at')::date - m.next_due_date as days_overdue, b.owner
    from public.benefit_measures m join b on b.id = m.benefit_id
    where m.next_due_date < (ctx ->> 'as_at')::date
  ),
  totals as (
    select coalesce(sum(greatest(0, planned_total_value)), 0) as planned, coalesce(sum(greatest(0, realised_value)), 0) as realised,
      coalesce(sum(greatest(0, realised_value)) filter (where classification = 'cash_releasing'), 0) as cash_realised,
      coalesce(sum(greatest(0, planned_total_value)) filter (where classification = 'cash_releasing'), 0) as cash_planned,
      coalesce(sum(greatest(0, realised_value)) filter (where classification <> 'cash_releasing'), 0) as non_cash_realised,
      coalesce(sum(greatest(0, planned_total_value)) filter (where classification <> 'cash_releasing'), 0) as non_cash_planned
    from pos
  )
  select jsonb_build_object('currency', ctx ->> 'currency',
    'benefits', (select count(*) from b),
    'planned', t.planned, 'realised', t.realised,
    'percent', case when t.planned > 0 then round(100 * t.realised / t.planned)::integer else 0 end,
    'cash_releasing_realised', t.cash_realised, 'cash_releasing_planned', t.cash_planned,
    'non_cash_realised', t.non_cash_realised, 'non_cash_planned', t.non_cash_planned,
    'at_risk', (select count(*) from b where confidence = 'low' or behind_profile),
    'disbenefit_value', (select coalesce(sum(abs(planned_total_value)), 0) from b where type = 'disbenefit'),
    'objectives', coalesce((select jsonb_agg(to_jsonb(x) order by x.planned desc, x.name)
      from (select * from objectives order by planned desc, name limit (select o from lim)) x), '[]'),
    'behind_count', (select count(*) from b where behind_profile),
    'behind', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'title', x.title,
        'realised', greatest(0, x.realised_value), 'realised_percent', x.realised_percent) order by x.realised_percent nulls first, x.ref)
      from (select * from b where behind_profile order by realised_percent nulls first, ref limit (select n from lim)) x), '[]'),
    'overdue_count', (select count(*) from overdue),
    'overdue', coalesce((select jsonb_agg(to_jsonb(x) order by x.next_due_date, x.ref)
      from (select * from overdue order by next_due_date, ref limit (select n from lim)) x), '[]'))
  from totals t;
$$;

-- benefits_by_category: the benefits the scope's projects enable, per category, with planned and
-- realised value cash-releasing and non-cash apart (never one combined savings figure), and the
-- count by classification. Positive benefits only (disbenefits counted separately), negative
-- values count as 0, as in benefits_value. Config: limit (categories, default 12).
create function private.rb_benefits_by_category(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with b as (
    select b.id, b.type::text as type, b.classification::text as classification, b.category_id,
      greatest(0, b.planned_total_value) as planned, greatest(0, coalesce(br.realised_value, 0)) as realised
    from public.benefits b
    left join public.v_benefit_realisation br on br.benefit_id = b.id
    where b.organisation_id = nullif(ctx ->> 'organisation_id', '')::uuid
      and b.id in (select bp.benefit_id from public.benefit_projects bp where bp.project_id = any (private.rb_projects(ctx)))
  ),
  pos as (select * from b where type = 'benefit'),
  cats as (
    select l.id, l.label, l.sort_order,
      count(pos.id)::integer as count,
      coalesce(sum(pos.planned) filter (where pos.classification = 'cash_releasing'), 0) as cash_planned,
      coalesce(sum(pos.realised) filter (where pos.classification = 'cash_releasing'), 0) as cash_realised,
      coalesce(sum(pos.planned) filter (where pos.classification <> 'cash_releasing'), 0) as non_cash_planned,
      coalesce(sum(pos.realised) filter (where pos.classification <> 'cash_releasing'), 0) as non_cash_realised,
      jsonb_build_object(
        'cash_releasing', count(*) filter (where pos.classification = 'cash_releasing'),
        'non_cash_releasing', count(*) filter (where pos.classification = 'non_cash_releasing'),
        'qualitative', count(*) filter (where pos.classification = 'qualitative'),
        'societal', count(*) filter (where pos.classification = 'societal')) as by_classification
    from pos join public.lookup_values l on l.id = pos.category_id
    group by l.id, l.label, l.sort_order
  )
  select jsonb_build_object('currency', ctx ->> 'currency',
    'benefits', (select count(*) from pos),
    'disbenefits', (select count(*) from b where type = 'disbenefit'),
    'cash_planned', (select coalesce(sum(planned), 0) from pos where classification = 'cash_releasing'),
    'cash_realised', (select coalesce(sum(realised), 0) from pos where classification = 'cash_releasing'),
    'non_cash_planned', (select coalesce(sum(planned), 0) from pos where classification <> 'cash_releasing'),
    'non_cash_realised', (select coalesce(sum(realised), 0) from pos where classification <> 'cash_releasing'),
    'category_count', (select count(*) from cats),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.label, 'count', x.count,
        'cash_planned', x.cash_planned, 'cash_realised', x.cash_realised,
        'non_cash_planned', x.non_cash_planned, 'non_cash_realised', x.non_cash_realised,
        'by_classification', x.by_classification)
      order by x.cash_planned + x.non_cash_planned desc, x.sort_order, x.label)
      from (select * from cats order by cash_planned + non_cash_planned desc, sort_order, label
            limit greatest(1, coalesce((cfg ->> 'limit')::integer, 12))) x), '[]'));
$$;

revoke all on function private.rb_benefits_value(jsonb, jsonb), private.rb_benefits_by_category(jsonb, jsonb) from public, anon;
grant execute on function private.rb_benefits_value(jsonb, jsonb), private.rb_benefits_by_category(jsonb, jsonb)
  to authenticated, service_role;
