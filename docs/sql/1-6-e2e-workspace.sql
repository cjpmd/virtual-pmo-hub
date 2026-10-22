-- Work package 1.6: end-to-end test data for workspaces. Data change only (no schema change, so
-- no migration). Run once in the Supabase SQL editor, after creating the two test logins
-- (E2E_ADMIN_EMAIL and E2E_MEMBER_EMAIL in .env.local) and signing in with each once, so they
-- have profiles. Replace the two addresses below first. Safe to run again.
--
--   * The admin login: organisation admin of the demo organisation (manages workspaces in
--     Settings › Workspaces).
--   * The member login: organisation viewer, and contributor in "E2E Workspace B" only. An
--     organisation viewer has no access to any workspace by itself (only organisation PMO /
--     admin act in every workspace), so this login sees Workspace B and nothing of the demo
--     workspace.
--   * "E2E Workspace B" holds one portfolio, programme and project, so the isolation spec has
--     records to find on each list, board and report.
-- The specs never delete these rows. Their own throwaway workspaces are named "E2E temp …" and
-- removed by the specs.

with emails (admin_email, member_email) as (
  values ('<E2E_ADMIN_EMAIL>', '<E2E_MEMBER_EMAIL>')
),
demo as (
  select o.id from public.organisations o where o.is_demo order by o.created_at limit 1
)
insert into public.organisation_members (organisation_id, profile_id, role)
select demo.id, p.id, case when lower(p.email) = lower(e.admin_email) then 'admin' else 'viewer' end::public.app_role
from demo, emails e, public.profiles p
where lower(p.email) in (lower(e.admin_email), lower(e.member_email))
on conflict (organisation_id, profile_id) do update set role = excluded.role;

update public.profiles p
set last_organisation_id = (
  select o.id from public.organisations o where o.is_demo order by o.created_at limit 1
)
where lower(p.email) in (lower('<E2E_ADMIN_EMAIL>'), lower('<E2E_MEMBER_EMAIL>'));

insert into public.workspaces (organisation_id, name, description)
select o.id, 'E2E Workspace B', 'End-to-end tests: a second workspace (work package 1.6).'
from public.organisations o
where o.is_demo
  and not exists (
    select 1 from public.workspaces w where w.organisation_id = o.id and w.name = 'E2E Workspace B'
  )
order by o.created_at
limit 1;

insert into public.workspace_members (workspace_id, organisation_id, profile_id, role)
select w.id, w.organisation_id, p.id, 'contributor'
from public.workspaces w
join public.organisations o on o.id = w.organisation_id and o.is_demo
cross join public.profiles p
where w.name = 'E2E Workspace B' and lower(p.email) = lower('<E2E_MEMBER_EMAIL>')
on conflict (workspace_id, profile_id) do update set role = excluded.role;

insert into public.portfolios (workspace_id, organisation_id, name, description)
select w.id, w.organisation_id, 'E2E Portfolio B', 'Workspace B test portfolio.'
from public.workspaces w
join public.organisations o on o.id = w.organisation_id and o.is_demo
where w.name = 'E2E Workspace B'
  and not exists (select 1 from public.portfolios x where x.workspace_id = w.id and x.name = 'E2E Portfolio B');

insert into public.programmes (workspace_id, organisation_id, portfolio_id, name, description)
select pf.workspace_id, pf.organisation_id, pf.id, 'E2E Programme B', 'Workspace B test programme.'
from public.portfolios pf
join public.workspaces w on w.id = pf.workspace_id and w.name = 'E2E Workspace B'
join public.organisations o on o.id = w.organisation_id and o.is_demo
where pf.name = 'E2E Portfolio B'
  and not exists (select 1 from public.programmes x where x.portfolio_id = pf.id and x.name = 'E2E Programme B');

insert into public.projects (workspace_id, organisation_id, programme_id, name, code)
select g.workspace_id, g.organisation_id, g.id, 'E2E Project B', 'E2EB-001'
from public.programmes g
join public.workspaces w on w.id = g.workspace_id and w.name = 'E2E Workspace B'
join public.organisations o on o.id = w.organisation_id and o.is_demo
where g.name = 'E2E Programme B'
  and not exists (select 1 from public.projects x where x.programme_id = g.id and x.name = 'E2E Project B');

-- Check: one row per login, and the Workspace B records.
select p.email, om.role as org_role, wm.role as workspace_b_role
from public.profiles p
join public.organisation_members om on om.profile_id = p.id
join public.organisations o on o.id = om.organisation_id and o.is_demo
left join public.workspace_members wm on wm.profile_id = p.id
  and wm.workspace_id = (select id from public.workspaces where name = 'E2E Workspace B' and organisation_id = o.id)
where lower(p.email) in (lower('<E2E_ADMIN_EMAIL>'), lower('<E2E_MEMBER_EMAIL>'));
