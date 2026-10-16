-- APPLIED 16/10/2026. Second gate mapping (approved 16/10). Proposal and dry run: docs/sql/gate-mapping-2.sql.
update public.milestones m
set phase_id = lp.id
from public.lifecycle_phases lp
where m.type = 'gate'
  and m.phase_id is null
  and regexp_replace(btrim(m.title), '\s+', ' ', 'g') = 'GATE 1 - Ready to Deliver'
  and lp.organisation_id = m.organisation_id
  and lp.sort_order = 3;

update public.milestones
set type = 'key_date', report_to_committee = true, phase_id = null
where type = 'gate'
  and regexp_replace(btrim(title), '\s+', ' ', 'g') = 'Design authority approval';
