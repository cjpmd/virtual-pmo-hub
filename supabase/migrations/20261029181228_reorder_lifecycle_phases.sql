-- Renumber an organisation's lifecycle phases 1..n in one transaction.
-- lifecycle_phases (organisation_id, sort_order) is unique and DEFERRABLE INITIALLY DEFERRED,
-- so a swap or an insert between phases only passes when every row moves in the same
-- transaction. Settings saves rows without their order (new rows parked at 100000+), then calls this.
-- Security invoker: the lifecycle_phases update policy (pmo and above) still decides who can.
-- Phases missing from p_phase_ids keep their relative order after the listed ones.
create or replace function public.reorder_lifecycle_phases(p_organisation_id uuid, p_phase_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  with ordered as (
    select p.id,
           row_number() over (order by x.ord nulls last, p.sort_order, p.created_at)::integer as rn
    from public.lifecycle_phases p
    left join unnest(coalesce(p_phase_ids, '{}')) with ordinality as x(id, ord) on x.id = p.id
    where p.organisation_id = p_organisation_id
  )
  update public.lifecycle_phases p
  set sort_order = o.rn
  from ordered o
  where p.id = o.id and p.sort_order is distinct from o.rn;
$$;

revoke execute on function public.reorder_lifecycle_phases(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_lifecycle_phases(uuid, uuid[]) to authenticated;
