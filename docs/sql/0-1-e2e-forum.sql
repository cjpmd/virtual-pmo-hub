-- Work package 0.1, option B: one workspace-level forum in the demo organisation, so the
-- Boards end-to-end spec has a forum the PMO test user may edit (organisation-level forums are
-- organisation-admin only). Data change only (no schema change, so no migration). Run once,
-- after approval, in the Supabase SQL editor. The spec edits its papers deadline and restores it.
--
-- Uses the demo organisation's first workspace. Safe to re-run: the unique
-- (organisation_id, workspace_id, name) constraint makes a second run a no-op.

insert into public.forums (organisation_id, workspace_id, name, level, cadence, papers_deadline_days)
select w.organisation_id, w.id, 'E2E Test Board (automated)', 'project', 'monthly', 5
from public.workspaces w
join public.organisations o on o.id = w.organisation_id
where o.is_demo
order by o.created_at, w.created_at
limit 1
on conflict (organisation_id, workspace_id, name) do nothing;
