-- Optimism bias lives in organisations.settings -> 'benefits' -> 'optimismBias' and is now
-- validated with the other settings. PMO members may change it; every other column and
-- setting on the organisation row stays admin-only.

-- One uplift per benefit category: a non-empty category (unique, ignoring case) and a
-- percentage from 0 to 80, matching the limits on the settings screen.
create function private.valid_optimism_bias(b jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(b) = 'array', false)
    and not exists (
      select 1 from jsonb_array_elements(b) e
      where case
        when jsonb_typeof(e) is distinct from 'object' then true
        when jsonb_typeof(e -> 'category') is distinct from 'string' or btrim(e ->> 'category') = '' then true
        when jsonb_typeof(e -> 'percentage') is distinct from 'number' then true
        else (e ->> 'percentage')::numeric not between 0 and 80
      end)
    and (select count(*) = count(distinct lower(btrim(e ->> 'category'))) from jsonb_array_elements(b) e);
$$;
revoke all on function private.valid_optimism_bias(jsonb) from public, anon;
grant execute on function private.valid_optimism_bias(jsonb) to authenticated, service_role;

create or replace function private.default_org_settings()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'regional', jsonb_build_object(
      'baseCurrency', 'GBP', 'locale', 'en-GB', 'dateFormat', 'DD/MM/YYYY',
      'timeZone', 'Europe/London', 'firstDayOfWeek', 1, 'financialYearStartMonth', 8),
    'health', jsonb_build_object(
      'scheduleSlipPercent', 10, 'taskOverdueAtRiskPercent', 15, 'taskOverdueOffTrackPercent', 30,
      'financialAtRiskPercent', 0, 'financialOffTrackPercent', 10, 'riskScoreAtRisk', 10,
      'riskScoreOffTrack', 15, 'benefitBehindProfilePercent', 20, 'dependencyAtRiskWorkingDays', 10),
    'benefits', jsonb_build_object('optimismBias', jsonb_build_array(
      jsonb_build_object('category', 'Efficiency', 'percentage', 20),
      jsonb_build_object('category', 'Income', 'percentage', 30),
      jsonb_build_object('category', 'Student experience', 'percentage', 25),
      jsonb_build_object('category', 'Research', 'percentage', 25),
      jsonb_build_object('category', 'Risk reduction', 'percentage', 15),
      jsonb_build_object('category', 'Compliance', 'percentage', 10),
      jsonb_build_object('category', 'Sustainability', 'percentage', 15))),
    'data', jsonb_build_object('retentionMonths', 84)
  );
$$;

-- Organisations without a valid optimism bias get the defaults before the rule applies.
update public.organisations
set settings = jsonb_set(
  case when jsonb_typeof(settings -> 'benefits') = 'object' then settings
       else settings || jsonb_build_object('benefits', '{}'::jsonb) end,
  '{benefits,optimismBias}',
  private.default_org_settings() -> 'benefits' -> 'optimismBias')
where not private.valid_optimism_bias(settings -> 'benefits' -> 'optimismBias');

-- The health thresholds are read by SQL roll-ups; the optimism bias by appraisals. Both are
-- required and typed. (The check constraint calls this function, so new writes use it.)
create or replace function private.valid_org_settings(s jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(s) = 'object'
    and jsonb_typeof(s -> 'health') = 'object'
    and (select bool_and(jsonb_typeof(s -> 'health' -> k) = 'number')
         from unnest(array['scheduleSlipPercent', 'taskOverdueAtRiskPercent', 'taskOverdueOffTrackPercent',
                           'financialAtRiskPercent', 'financialOffTrackPercent', 'riskScoreAtRisk',
                           'riskScoreOffTrack', 'benefitBehindProfilePercent', 'dependencyAtRiskWorkingDays']) k)
    and private.valid_optimism_bias(s -> 'benefits' -> 'optimismBias');
$$;

-- PMO members may update the organisation row, but only the optimism bias (the trigger below).
alter policy organisations_update on public.organisations
  using (private.has_org_role(id, 'pmo')) with check (private.has_org_role(id, 'pmo'));

create function private.organisations_role_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Admins, and server-side jobs with no signed-in user, may change anything.
  if (select auth.uid()) is null or private.has_org_role(new.id, 'admin') then
    return new;
  end if;
  if (to_jsonb(new) - 'settings' - 'updated_at') is distinct from (to_jsonb(old) - 'settings' - 'updated_at')
     or (new.settings #- '{benefits,optimismBias}') is distinct from (old.settings #- '{benefits,optimismBias}') then
    raise exception 'Only organisation admins can change these settings.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.organisations_role_scope() from public, anon, authenticated;

create trigger organisations_10_role_scope before update on public.organisations
  for each row execute function private.organisations_role_scope();
