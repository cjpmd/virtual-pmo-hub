-- NHS-5 Five Case Model business cases, part 2: financial case → budget baseline
-- (docs/nhs-module-plan.md § NHS-5 item 5, docs/sql/nhs-5-five-case-baseline.sql). Written by an
-- unattended lane B run on 23/11/2026: tested on the local Postgres only, NOT applied to production.
-- Nothing here is destructive.
--
-- budget_baselines has had a 'business_case' source and a business_case_version_id column since the
-- financials migration, but private.budget_baseline_guard refused that source ("arrives with
-- business cases", F4 never replaced it). This replaces only that branch, for every organisation
-- (the source isn't module-specific):
-- - the version must be approved (not draft, submitted, rejected or superseded) and belong to the
--   project's business case;
-- - a Strategic Outline Case is indicative, so it can't set a baseline (single-stage, OBC and FBC can);
-- - the total defaults to the preferred option's delivery cost; any other total needs the PMO and a
--   reason (docs/financials-and-business-cases.md, budget_baselines rules);
-- - each version can set a project's baseline once;
-- - a manager or the PMO of the workspace sets the first baseline from it; replacing an existing
--   baseline from a later case (an FBC after the OBC) is the PMO's;
-- - an 'initial' baseline is refused once the project has an approved business case (not an SOC):
--   the first baseline comes from the case (D5 in that document).
-- It also adds the foreign key the financials migration left for business cases, so the link can
-- only name a version in the same workspace.
-- ---------------------------------------------------------------------------------------------

alter table public.budget_baselines
  add constraint budget_baselines_business_case_version_fkey
  foreign key (business_case_version_id, workspace_id)
  references public.business_case_versions (id, workspace_id);
create index budget_baselines_business_case_version_idx
  on public.budget_baselines (business_case_version_id, workspace_id);

create or replace function private.budget_baseline_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  prev_version integer;
  prev_total numeric;
  cr record;
  bc record;
begin
  select b.version, b.total into prev_version, prev_total
  from public.budget_baselines b where b.project_id = new.project_id
  order by b.version desc limit 1;
  new.version := coalesce(prev_version, 0) + 1;
  new.approved_at := now();
  if uid is not null then
    new.approved_by := uid;
  end if;

  if new.source = 'migration' then
    if uid is not null then
      raise exception 'Migration baselines are created by the system only.' using errcode = '42501';
    end if;
  elsif new.source = 'initial' then
    if prev_version is not null then
      raise exception 'This project already has a budget baseline. Change it through an approved change request or a PMO adjustment.' using errcode = 'P0001';
    end if;
    if uid is not null and not (new.workspace_id = any (private.my_workspace_ids('manager'))) then
      raise exception 'Only a manager or the PMO can set the first budget baseline.' using errcode = '42501';
    end if;
    -- docs/financials-and-business-cases.md D5: a project with an approved business case takes its
    -- first baseline from it.
    if exists (select 1 from public.business_case_versions v
                 join public.business_cases c on c.id = v.business_case_id
                where c.project_id = new.project_id and v.status = 'approved' and v.stage <> 'soc') then
      raise exception 'This project has an approved business case: set the first baseline from it.' using errcode = 'P0001';
    end if;
  elsif new.source = 'business_case' then
    -- NHS-5, per docs/financials-and-business-cases.md (budget_baselines rules): an approved
    -- version of this project's business case (not an SOC); the total defaults to the preferred
    -- option's delivery cost, and any other total needs the PMO and a reason.
    select v.status, v.stage, c.project_id,
           (select o.delivery_cost from public.business_case_options o
             where o.version_id = v.id and o.is_preferred limit 1) as delivery_cost
      into bc
      from public.business_case_versions v
      join public.business_cases c on c.id = v.business_case_id
     where v.id = new.business_case_version_id;
    if not found or bc.project_id is distinct from new.project_id then
      raise exception 'That business case belongs to a different project.' using errcode = 'P0001';
    end if;
    if bc.status <> 'approved' then
      raise exception 'Only an approved business case can set the budget baseline.' using errcode = 'P0001';
    end if;
    if bc.stage = 'soc' then
      raise exception 'A Strategic Outline Case is indicative: set the baseline from the approved Outline or Full Business Case.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.budget_baselines b
                where b.project_id = new.project_id and b.business_case_version_id = new.business_case_version_id) then
      raise exception 'This business case version has already set the project''s budget baseline.' using errcode = 'P0001';
    end if;
    if uid is not null and not (new.workspace_id = any (private.my_workspace_ids('manager'))) then
      raise exception 'Only a manager or the PMO can set the budget baseline from a business case.' using errcode = '42501';
    end if;
    if new.total is distinct from bc.delivery_cost then
      if btrim(coalesce(new.reason, '')) = '' then
        raise exception 'The baseline from this business case is % (the preferred option''s delivery cost). A different total needs a reason.',
          coalesce(bc.delivery_cost::text, 'not set') using errcode = 'P0001';
      end if;
      if uid is not null and not (new.workspace_id = any (private.my_workspace_ids('pmo'))) then
        raise exception 'Only the PMO can set a baseline that differs from the business case''s delivery cost.' using errcode = '42501';
      end if;
    end if;
    -- After the first baseline, changing it from a later case (an FBC after the OBC) is the PMO's,
    -- as for any other change outside a change request.
    if prev_version is not null and uid is not null and not (new.workspace_id = any (private.my_workspace_ids('pmo'))) then
      raise exception 'The project already has a budget baseline: only the PMO can replace it from a later business case.' using errcode = '42501';
    end if;
  elsif new.source = 'change_request' then
    select c.project_id, c.status, c.cost_impact into cr from public.change_requests c where c.id = new.change_request_id;
    if cr.project_id is distinct from new.project_id then
      raise exception 'That change request belongs to a different project.' using errcode = 'P0001';
    end if;
    if cr.status <> 'approved' then
      raise exception 'Only an approved change request can change the budget baseline.' using errcode = 'P0001';
    end if;
    if prev_version is null then
      raise exception 'The project has no budget baseline to change yet.' using errcode = 'P0001';
    end if;
    if new.total <> prev_total + coalesce(cr.cost_impact, 0) then
      raise exception 'The new baseline must be % (current % plus the change''s cost impact %).',
        prev_total + coalesce(cr.cost_impact, 0), prev_total, coalesce(cr.cost_impact, 0) using errcode = 'P0001';
    end if;
  elsif new.source = 'pmo_adjustment' then
    if uid is not null and not (new.workspace_id = any (private.my_workspace_ids('pmo'))) then
      raise exception 'Only the PMO can adjust a budget baseline directly.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
