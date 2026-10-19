-- APPLIED 16/10/2026. v_decisions: can_record / can_write for the signed-in user (approved 16/10).
-- Proposal and dry run: docs/sql/decision-can-record.sql.
grant execute on function private.can_record_decision(public.decisions) to authenticated;
grant execute on function private.can_write_decision(public.decisions) to authenticated;

create or replace view public.v_decisions with (security_invoker = true) as
select d.*,
  t.today,
  (d.status = 'pending' and d.needed_by_date is not null and d.needed_by_date < t.today) as overdue,
  case when d.status = 'pending' and d.needed_by_date < t.today then t.today - d.needed_by_date end as days_overdue,
  coalesce(ev.deferrals, 0)::integer as deferral_count,
  ev.last_deferred_on,
  s.id as superseded_by_id,
  s.ref as superseded_by_ref,
  s.status as superseded_by_status,
  ps.id as pending_successor_id,
  ps.ref as pending_successor_ref,
  private.can_record_decision(d) as can_record,
  private.can_write_decision(d) as can_write
from public.decisions d
cross join lateral (select private.org_today(d.organisation_id) as today) t
left join lateral (
  select count(*) filter (where e.event_type = 'deferred') as deferrals,
    max(e.event_date) filter (where e.event_type = 'deferred') as last_deferred_on
  from public.decision_events e where e.decision_id = d.id
) ev on true
-- The successor that replaced it (recorded), and a replacement still being proposed.
left join lateral (
  select x.id, x.ref, x.status from public.decisions x
  where x.supersedes_id = d.id and x.status not in ('pending', 'withdrawn')
  order by x.decision_date desc nulls last, x.created_at desc limit 1
) s on true
left join lateral (
  select x.id, x.ref from public.decisions x
  where x.supersedes_id = d.id and x.status = 'pending'
  order by x.created_at desc limit 1
) ps on true;
revoke all on public.v_decisions from anon, authenticated;
grant select on public.v_decisions to authenticated;
