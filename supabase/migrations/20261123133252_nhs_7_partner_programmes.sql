-- NHS-7 (part 1): partner (cross-organisation / ICS) programmes. Module `cross_org`.
-- Proposal: docs/sql/nhs-7-partner-programmes.sql. NOT APPLIED: for review. Additive only.
--
-- What exists (audit in the PR): public.entity_shares (RB Phase 1) grants a partner organisation
-- read access to a programme, project, forum or report, but only the report builder uses it:
-- private.can_view_entity / can_view_report and the partner-safe snapshot policies. Partner users
-- can't read a shared programme or its projects anywhere else, and nothing creates shares (SQL
-- only, spec §14). New shares are paused (GL-10 follow-up, private.entity_sharing_settings).
--
-- What this adds:
-- 1. public.partner_invites: the host invites a partner organisation to a programme through one
--    of that organisation's admins (email). The token is returned once (sha256 at rest). The
--    partner admin accepts for one of their organisations; accepting creates the entity_shares
--    row (programme, access read | contribute). Accepting never moves data between organisations.
--    While sharing is paused, creating and accepting invitations are refused (hint
--    'sharing_paused'); this migration never switches sharing on.
-- 2. public.programme_contributions: a partner links one of its own projects into the host's
--    shared programme (share access 'contribute'). The row belongs to the partner organisation
--    (the project's owner); the project stays owned and edited there. A contribution counts only
--    while the share still exists with 'contribute' access and the module is on in both
--    organisations; revoking the share hides it at once.
-- 3. Read RPCs that return a curated, read-only roll-up (no table RLS is widened, so nothing else
--    of either organisation becomes readable): shared_programmes(), programme_partners(programme)
--    and shared_programme_overview(programme) (programme, host projects, contributed projects,
--    stored health, next milestone, open risks, benefit totals split cash / non-cash).
-- 4. Write RPCs: create / revoke invitation, accept, set a share's access, revoke a share (host,
--    or the partner leaving), contribute and withdraw a project.
-- Health is read from the stored *_health_current tables (never computed here); contributed
-- projects don't change the host programme's stored health (decision NHS-7 / B14).

-- ---------------------------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------------------------

-- Is creating partner shares allowed (GL-10 pause switch)? Read-only check; never changes it.
create function private.partner_sharing_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.enabled from private.entity_sharing_settings s), false);
$$;
revoke execute on function private.partner_sharing_enabled() from public, anon;
grant execute on function private.partner_sharing_enabled() to authenticated, service_role;

create function private.assert_partner_sharing_enabled()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.partner_sharing_enabled() then
    raise exception 'Sharing with partner organisations is paused.' using errcode = '42501', hint = 'sharing_paused';
  end if;
end;
$$;
revoke execute on function private.assert_partner_sharing_enabled() from public, anon;
grant execute on function private.assert_partner_sharing_enabled() to authenticated, service_role;

-- The share that lets one of the caller's organisations see a programme (null when none). With
-- several (a person in two partner organisations), 'contribute' wins.
create function private.my_programme_share(p_programme uuid)
returns public.entity_shares
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from public.entity_shares s
  where s.entity_type = 'programme' and s.entity_id = p_programme
    and s.partner_organisation_id = any (private.my_org_ids())
  order by (s.access = 'contribute') desc, s.created_at
  limit 1;
$$;
revoke execute on function private.my_programme_share(uuid) from public, anon;
grant execute on function private.my_programme_share(uuid) to authenticated, service_role;

-- Can the caller read the partner roll-up of a programme: a member of its workspace, or a member
-- of a partner organisation it is shared with, while the host has the module on.
create function private.can_read_partner_programme(p_programme uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.module_enabled(p.organisation_id, 'cross_org')
      and (p.workspace_id = any (private.my_workspace_ids())
        or exists (select 1 from public.entity_shares s
                   where s.entity_type = 'programme' and s.entity_id = p.id
                     and s.partner_organisation_id = any (private.my_org_ids())))
    from public.programmes p where p.id = p_programme), false);
$$;
revoke execute on function private.can_read_partner_programme(uuid) from public, anon;
grant execute on function private.can_read_partner_programme(uuid) to authenticated, service_role;

-- Is the caller PMO / admin of the programme's workspace (the host's sharing managers)?
create function private.is_programme_host_pmo(p_programme uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.workspace_id = any (private.my_workspace_ids('pmo'))
    from public.programmes p where p.id = p_programme), false);
$$;
revoke execute on function private.is_programme_host_pmo(uuid) from public, anon;
grant execute on function private.is_programme_host_pmo(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Partner invitations
-- ---------------------------------------------------------------------------------------------

create table public.partner_invites (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  workspace_id uuid not null,
  programme_id uuid not null,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 320),
  access text not null default 'read' check (access in ('read', 'contribute')),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  invited_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_organisation_id uuid references public.organisations (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade
);
comment on table public.partner_invites is
  'NHS-7: invitations for a partner organisation (through one of its admins) to see a shared programme. Written only by definer RPCs; token sha256 at rest.';
create index partner_invites_ws_idx on public.partner_invites (workspace_id, organisation_id);
create index partner_invites_programme_idx on public.partner_invites (programme_id, workspace_id);
create index partner_invites_invited_by_idx on public.partner_invites (invited_by);
create index partner_invites_accepted_by_idx on public.partner_invites (accepted_by);
create index partner_invites_revoked_by_idx on public.partner_invites (revoked_by);
create index partner_invites_accepted_org_idx on public.partner_invites (accepted_organisation_id);
-- One pending invitation per programme and address.
create unique index partner_invites_pending_key on public.partner_invites (programme_id, email)
  where accepted_at is null and revoked_at is null;

create trigger zz_org_read_only before insert or update or delete on public.partner_invites
  for each row execute function private.enforce_org_writable();

alter table public.partner_invites enable row level security;
revoke all on public.partner_invites from anon, authenticated;
-- Host PMO / admin read their workspace's invitations (token_hash is never granted).
grant select (id, organisation_id, workspace_id, programme_id, email, access, expires_at, invited_by, created_at,
  accepted_at, accepted_by, accepted_organisation_id, revoked_at, revoked_by) on public.partner_invites to authenticated;
create policy partner_invites_select on public.partner_invites for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]));

-- ---------------------------------------------------------------------------------------------
-- 3. Partner-contributed projects
-- ---------------------------------------------------------------------------------------------

create table public.programme_contributions (
  id uuid primary key default gen_random_uuid(),
  -- The contributing (partner) organisation: the project's owner.
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  workspace_id uuid not null,
  project_id uuid not null,
  host_organisation_id uuid not null references public.organisations (id) on delete cascade,
  host_programme_id uuid not null references public.programmes (id) on delete cascade,
  contributed_by uuid default auth.uid() references public.profiles (id) on delete set null,
  contributed_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles (id) on delete set null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
comment on table public.programme_contributions is
  'NHS-7: a partner organisation''s own project linked into a host''s shared programme. Owned by the partner; counts only while the programme share has contribute access. Written only by definer RPCs.';
create index programme_contributions_ws_idx on public.programme_contributions (workspace_id, organisation_id);
create index programme_contributions_project_idx on public.programme_contributions (project_id, workspace_id);
create index programme_contributions_host_idx on public.programme_contributions (host_programme_id);
create index programme_contributions_host_org_idx on public.programme_contributions (host_organisation_id);
create index programme_contributions_by_idx on public.programme_contributions (contributed_by);
create index programme_contributions_withdrawn_by_idx on public.programme_contributions (withdrawn_by);
create unique index programme_contributions_active_key on public.programme_contributions (project_id, host_programme_id)
  where withdrawn_at is null;

create trigger zz_org_read_only before insert or update or delete on public.programme_contributions
  for each row execute function private.enforce_org_writable();

alter table public.programme_contributions enable row level security;
revoke all on public.programme_contributions from anon, authenticated;
grant select on public.programme_contributions to authenticated;
-- The contributing workspace's members read their own rows. The host sees contributions only
-- through the roll-up RPCs (no table access to another organisation's rows).
create policy programme_contributions_select on public.programme_contributions for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));

-- ---------------------------------------------------------------------------------------------
-- 4. Invitation RPCs
-- ---------------------------------------------------------------------------------------------

-- Host PMO / admin of the programme's workspace invites a partner organisation's admin.
-- Returns the token once; the app builds the link (/partner-invite?token=...).
create function public.create_partner_invite(p_programme uuid, p_email text, p_access text default 'read')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.programmes;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_id uuid;
  v_expires timestamptz := now() + interval '14 days';
begin
  select * into p from public.programmes where id = p_programme;
  if p.id is null or not private.is_programme_host_pmo(p_programme) then
    raise exception 'Programme not found, or you can''t share it' using errcode = '42501';
  end if;
  perform private.assert_module_enabled(p.organisation_id, 'cross_org');
  perform private.assert_partner_sharing_enabled();
  if p.archived_at is not null then
    raise exception 'An archived programme can''t be shared' using errcode = 'P0001', hint = 'programme_archived';
  end if;
  if coalesce(p_access, '') not in ('read', 'contribute') then
    raise exception 'Access must be read or contribute' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 320 then
    raise exception 'Enter a valid email address' using errcode = '22023', hint = 'invalid_email';
  end if;
  -- A new invitation to the same address replaces the pending one.
  update public.partner_invites i set revoked_at = now(), revoked_by = (select auth.uid())
  where i.programme_id = p.id and i.email = v_email and i.accepted_at is null and i.revoked_at is null;
  insert into public.partner_invites (organisation_id, workspace_id, programme_id, email, access, token_hash, expires_at)
  values (p.organisation_id, p.workspace_id, p.id, v_email, p_access, sha256(convert_to(v_token, 'UTF8')), v_expires)
  returning id into v_id;
  perform private.write_audit(p.organisation_id, 'insert', 'partner_invites', v_id,
    jsonb_build_object('event', 'partner_invite.created', 'programme_id', p.id, 'email', v_email, 'access', p_access));
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

create function public.revoke_partner_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.partner_invites;
begin
  select * into i from public.partner_invites where id = p_invite;
  if i.id is null or not private.is_programme_host_pmo(i.programme_id) then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if i.accepted_at is not null or i.revoked_at is not null then return; end if;
  update public.partner_invites set revoked_at = now(), revoked_by = (select auth.uid()) where id = p_invite;
  perform private.write_audit(i.organisation_id, 'update', 'partner_invites', i.id,
    jsonb_build_object('event', 'partner_invite.revoked', 'programme_id', i.programme_id));
end;
$$;

-- What a signed-in person sees before accepting: the host, the programme, the access, and the
-- organisations they could accept for (where they are an admin). Unknown or unusable tokens
-- return only a status, so nothing about the host leaks without a valid token.
create function public.partner_invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.partner_invites;
  v_email text;
  v_status text;
begin
  if (select auth.uid()) is null or p_token is null or length(p_token) not between 32 and 128 then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into i from public.partner_invites where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if i.id is null then return jsonb_build_object('status', 'not_found'); end if;
  select e.email into v_email from private.auth_email() e;
  v_status := case
    when i.accepted_at is not null then 'accepted'
    when i.revoked_at is not null then 'revoked'
    when i.expires_at <= now() then 'expired'
    when v_email is distinct from i.email then 'wrong_email'
    when not private.partner_sharing_enabled() then 'paused'
    else 'pending' end;
  if v_status not in ('pending', 'paused') then
    return jsonb_build_object('status', v_status);
  end if;
  return jsonb_build_object(
    'status', v_status,
    'host_organisation', (select o.name from public.organisations o where o.id = i.organisation_id),
    'programme', (select p.name from public.programmes p where p.id = i.programme_id),
    'access', i.access,
    'expires_at', i.expires_at,
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name,
               'module_on', private.module_enabled(o.id, 'cross_org')) order by o.name)
      from public.organisations o
      where o.id = any (private.my_org_ids('admin')) and o.id <> i.organisation_id), '[]'::jsonb));
end;
$$;

-- A partner organisation's admin accepts for one of their organisations (not the host). Creates
-- or updates the programme share. Refused while sharing is paused.
create function public.accept_partner_invite(p_token text, p_organisation uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.partner_invites;
  v_email text;
  v_confirmed boolean;
  v_share uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to accept this invitation' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) not between 32 and 128 then
    raise exception 'This invitation link isn''t valid' using errcode = 'P0002', hint = 'invite_not_found';
  end if;
  select * into i from public.partner_invites where token_hash = sha256(convert_to(p_token, 'UTF8')) for update;
  if i.id is null then
    raise exception 'This invitation link isn''t valid' using errcode = 'P0002', hint = 'invite_not_found';
  end if;
  if i.accepted_at is not null then
    raise exception 'This invitation has already been used' using errcode = 'P0001', hint = 'invite_used';
  end if;
  if i.revoked_at is not null then
    raise exception 'This invitation was withdrawn' using errcode = 'P0001', hint = 'invite_revoked';
  end if;
  if i.expires_at <= now() then
    raise exception 'This invitation has expired. Ask for a new one.' using errcode = 'P0001', hint = 'invite_expired';
  end if;
  select e.email, e.confirmed into v_email, v_confirmed from private.auth_email() e;
  if not coalesce(v_confirmed, false) or v_email is distinct from i.email then
    raise exception 'This invitation was sent to a different email address' using errcode = 'P0001', hint = 'invite_wrong_email';
  end if;
  if p_organisation is null or not (p_organisation = any (private.my_org_ids('admin'))) then
    raise exception 'Only an admin of the organisation can accept for it' using errcode = '42501';
  end if;
  if p_organisation = i.organisation_id then
    raise exception 'Choose a partner organisation, not the programme''s own' using errcode = 'P0001', hint = 'same_organisation';
  end if;
  perform private.assert_module_enabled(p_organisation, 'cross_org');
  perform private.assert_module_enabled(i.organisation_id, 'cross_org');
  perform private.assert_partner_sharing_enabled();

  insert into public.entity_shares (organisation_id, workspace_id, entity_type, entity_id, partner_organisation_id, access, created_by)
  values (i.organisation_id, i.workspace_id, 'programme', i.programme_id, p_organisation, i.access, i.invited_by)
  on conflict (entity_type, entity_id, partner_organisation_id) do update set access = excluded.access
  returning id into v_share;
  update public.partner_invites
    set accepted_at = now(), accepted_by = (select auth.uid()), accepted_organisation_id = p_organisation
  where id = i.id;
  perform private.write_audit(i.organisation_id, 'insert', 'entity_shares', v_share,
    jsonb_build_object('event', 'partner_share.accepted', 'programme_id', i.programme_id,
      'partner_organisation_id', p_organisation, 'access', i.access, 'invite_id', i.id));
  perform private.write_audit(p_organisation, 'insert', 'entity_shares', v_share,
    jsonb_build_object('event', 'partner_share.joined', 'programme_id', i.programme_id, 'access', i.access));
  return jsonb_build_object('share_id', v_share, 'programme_id', i.programme_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Share management
-- ---------------------------------------------------------------------------------------------

-- Host PMO / admin change a programme share between read and contribute. Lowering to read hides
-- the partner's contributions (they come back if contribute is given again).
create function public.set_programme_share_access(p_share uuid, p_access text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.entity_shares;
begin
  select * into s from public.entity_shares where id = p_share and entity_type = 'programme';
  if s.id is null or not private.is_programme_host_pmo(s.entity_id) then
    raise exception 'Share not found' using errcode = 'P0002';
  end if;
  if coalesce(p_access, '') not in ('read', 'contribute') then
    raise exception 'Access must be read or contribute' using errcode = '22023';
  end if;
  perform private.assert_module_enabled(s.organisation_id, 'cross_org');
  update public.entity_shares set access = p_access where id = p_share;
  perform private.write_audit(s.organisation_id, 'update', 'entity_shares', s.id,
    jsonb_build_object('event', 'partner_share.access_changed', 'from', s.access, 'to', p_access));
end;
$$;

-- Ends a programme share: the host's PMO / admin, or an admin of the partner organisation (leaving).
-- Access stops at once. Contributions stay with the partner (not deleted) but no longer show.
-- Works with the module switched off, so access can always be withdrawn.
create function public.revoke_programme_share(p_share uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.entity_shares;
begin
  select * into s from public.entity_shares where id = p_share and entity_type = 'programme';
  if s.id is null or not (private.is_programme_host_pmo(s.entity_id)
      or s.partner_organisation_id = any (private.my_org_ids('admin'))) then
    raise exception 'Share not found' using errcode = 'P0002';
  end if;
  delete from public.entity_shares where id = p_share;
  perform private.write_audit(s.organisation_id, 'delete', 'entity_shares', s.id,
    jsonb_build_object('event', 'partner_share.revoked', 'programme_id', s.entity_id,
      'partner_organisation_id', s.partner_organisation_id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Contributions
-- ---------------------------------------------------------------------------------------------

-- PMO / admin of the project's workspace link the project into a programme shared with their
-- organisation for contribution.
create function public.contribute_project(p_project uuid, p_programme uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  pr public.projects;
  pg public.programmes;
  v_id uuid;
begin
  select * into pr from public.projects where id = p_project;
  if pr.id is null or not (pr.workspace_id = any (private.my_workspace_ids('pmo'))) then
    raise exception 'Project not found, or you can''t contribute it' using errcode = '42501';
  end if;
  select * into pg from public.programmes where id = p_programme;
  if pg.id is null or not exists (
      select 1 from public.entity_shares s
      where s.entity_type = 'programme' and s.entity_id = pg.id
        and s.partner_organisation_id = pr.organisation_id and s.access = 'contribute') then
    raise exception 'That programme isn''t shared with your organisation for contributions' using errcode = '42501', hint = 'not_shared';
  end if;
  perform private.assert_module_enabled(pr.organisation_id, 'cross_org');
  perform private.assert_module_enabled(pg.organisation_id, 'cross_org');
  if pr.archived_at is not null or pg.archived_at is not null then
    raise exception 'Archived projects and programmes can''t be linked' using errcode = 'P0001', hint = 'archived';
  end if;
  if exists (select 1 from public.programme_contributions c
             where c.project_id = pr.id and c.host_programme_id = pg.id and c.withdrawn_at is null) then
    raise exception 'This project is already part of that programme' using errcode = '23505', hint = 'already_contributed';
  end if;
  insert into public.programme_contributions (organisation_id, workspace_id, project_id, host_organisation_id, host_programme_id)
  values (pr.organisation_id, pr.workspace_id, pr.id, pg.organisation_id, pg.id)
  returning id into v_id;
  perform private.write_audit(pr.organisation_id, 'insert', 'programme_contributions', v_id,
    jsonb_build_object('event', 'partner_contribution.added', 'project_id', pr.id, 'host_programme_id', pg.id));
  perform private.write_audit(pg.organisation_id, 'insert', 'programme_contributions', v_id,
    jsonb_build_object('event', 'partner_contribution.received', 'partner_organisation_id', pr.organisation_id, 'programme_id', pg.id));
  return v_id;
end;
$$;

-- The contributing workspace's PMO / admin, or the host programme's PMO / admin, take a project
-- out of the programme. The row is kept (withdrawn), never deleted.
create function public.withdraw_contribution(p_contribution uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.programme_contributions;
begin
  select * into c from public.programme_contributions where id = p_contribution;
  if c.id is null or not (c.workspace_id = any (private.my_workspace_ids('pmo'))
      or private.is_programme_host_pmo(c.host_programme_id)) then
    raise exception 'Contribution not found' using errcode = 'P0002';
  end if;
  if c.withdrawn_at is not null then return; end if;
  update public.programme_contributions set withdrawn_at = now(), withdrawn_by = (select auth.uid()) where id = c.id;
  perform private.write_audit(c.organisation_id, 'update', 'programme_contributions', c.id,
    jsonb_build_object('event', 'partner_contribution.withdrawn', 'host_programme_id', c.host_programme_id));
  perform private.write_audit(c.host_organisation_id, 'update', 'programme_contributions', c.id,
    jsonb_build_object('event', 'partner_contribution.withdrawn', 'partner_organisation_id', c.organisation_id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Read RPCs
-- ---------------------------------------------------------------------------------------------

-- One project's read-only roll-up row (stored health, next milestone, open risks). Internal:
-- callers check access first.
create function private.partner_project_rollup(p_project uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'name', p.name, 'state', p.state, 'is_sample', p.is_sample,
    'start_date', p.start_date, 'finish_date', p.finish_date,
    'organisation_id', p.organisation_id,
    'organisation', (select o.name from public.organisations o where o.id = p.organisation_id),
    'overall', h.overall, 'schedule', h.schedule, 'financial', h.financial,
    'forecast_finish_date', h.forecast_finish_date, 'health_computed_at', h.computed_at,
    'next_milestone', (select jsonb_build_object('title', m.title, 'date', coalesce(m.forecast_date, m.baseline_date))
      from public.milestones m
      where m.project_id = p.id and m.actual_date is null and coalesce(m.forecast_date, m.baseline_date) is not null
      order by coalesce(m.forecast_date, m.baseline_date) limit 1),
    'milestones_overdue', (select count(*) from public.milestones m
      where m.project_id = p.id and m.actual_date is null and coalesce(m.forecast_date, m.baseline_date) < current_date),
    'open_risks', (select count(*) from public.risks r where r.project_id = p.id and r.status = 'open'),
    'risk_score', h.risk_score)
  from public.projects p
  left join public.project_health_current h on h.project_id = p.id
  where p.id = p_project;
$$;
revoke execute on function private.partner_project_rollup(uuid) from public, anon, authenticated;

-- Benefit totals for a set of projects plus a programme (planned values, split cash / non-cash,
-- never summed into one figure: NHS-2).
create function private.partner_benefit_totals(p_programme uuid, p_projects uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select distinct bn.id, bn.classification, bn.planned_total_value, bn.status
    from public.benefits bn
    where bn.status <> 'closed'
      and (bn.programme_id = p_programme
        or exists (select 1 from public.benefit_projects bp where bp.benefit_id = bn.id and bp.project_id = any (p_projects))))
  select jsonb_build_object(
    'count', count(*),
    'cash_releasing', coalesce(sum(planned_total_value) filter (where classification = 'cash_releasing'), 0),
    'non_cash', coalesce(sum(planned_total_value) filter (where classification <> 'cash_releasing'), 0),
    'realised', count(*) filter (where status in ('realised', 'partially_realised')))
  from b;
$$;
revoke execute on function private.partner_benefit_totals(uuid, uuid[]) from public, anon, authenticated;

-- Programmes shared with the caller's organisations (the partner's list).
create function public.shared_programmes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'share_id', s.id, 'programme_id', p.id, 'programme', p.name, 'access', s.access,
      'host_organisation_id', p.organisation_id,
      'host_organisation', (select o.name from public.organisations o where o.id = p.organisation_id),
      'partner_organisation_id', s.partner_organisation_id,
      'partner_organisation', (select o.name from public.organisations o where o.id = s.partner_organisation_id),
      'shared_at', s.created_at,
      'host_module_on', private.module_enabled(p.organisation_id, 'cross_org'),
      'archived', p.archived_at is not null,
      'my_contributions', (select count(*) from public.programme_contributions c
        where c.host_programme_id = p.id and c.organisation_id = s.partner_organisation_id and c.withdrawn_at is null))
    order by p.name), '[]'::jsonb)
  from public.entity_shares s
  join public.programmes p on p.id = s.entity_id
  where s.entity_type = 'programme' and s.partner_organisation_id = any (private.my_org_ids());
$$;

-- The host's view of who a programme is shared with: shares, pending invitations (PMO / admin
-- only) and contributions. Host workspace members only; null otherwise.
create function public.programme_partners(p_programme uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.programmes;
  v_pmo boolean;
  v_shares jsonb;
  v_invites jsonb := '[]'::jsonb;
  v_contribs jsonb;
begin
  select * into p from public.programmes where id = p_programme;
  if p.id is null or not (p.workspace_id = any (private.my_workspace_ids())) then return null; end if;
  v_pmo := private.is_programme_host_pmo(p.id);
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'partner_organisation_id', s.partner_organisation_id,
      'partner_organisation', o.name, 'access', s.access, 'created_at', s.created_at) order by o.name), '[]'::jsonb)
    into v_shares
  from public.entity_shares s join public.organisations o on o.id = s.partner_organisation_id
  where s.entity_type = 'programme' and s.entity_id = p.id;
  if v_pmo then
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'access', i.access,
        'expires_at', i.expires_at, 'created_at', i.created_at) order by i.created_at desc), '[]'::jsonb)
      into v_invites
    from public.partner_invites i
    where i.programme_id = p.id and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'partner_organisation_id', c.organisation_id,
      'partner_organisation', o.name, 'project_id', c.project_id, 'project_code', pr.code, 'project', pr.name,
      'contributed_at', c.contributed_at,
      'active', private.module_enabled(c.organisation_id, 'cross_org') and exists (select 1 from public.entity_shares s
        where s.entity_type = 'programme' and s.entity_id = p.id and s.partner_organisation_id = c.organisation_id
          and s.access = 'contribute')) order by o.name, pr.code), '[]'::jsonb)
    into v_contribs
  from public.programme_contributions c
  join public.organisations o on o.id = c.organisation_id
  join public.projects pr on pr.id = c.project_id
  where c.host_programme_id = p.id and c.withdrawn_at is null;
  return jsonb_build_object('programme_id', p.id, 'module_on', private.module_enabled(p.organisation_id, 'cross_org'),
    'sharing_enabled', private.partner_sharing_enabled(), 'can_manage', v_pmo,
    'shares', v_shares, 'invites', v_invites, 'contributions', v_contribs);
end;
$$;

-- The system-level roll-up of a shared programme, for the host's members and the partner
-- organisations it is shared with. Null when the caller may not see it or the host has the
-- module off. Contributions count only while their share has contribute access and the
-- contributing organisation has the module on.
create function public.shared_programme_overview(p_programme uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.programmes;
  v_host_projects uuid[];
  v_contrib_projects uuid[];
  v_share public.entity_shares;
begin
  if not private.can_read_partner_programme(p_programme) then return null; end if;
  select * into p from public.programmes where id = p_programme;
  v_share := private.my_programme_share(p.id);
  select coalesce(array_agg(pr.id order by pr.code), '{}') into v_host_projects
  from public.projects pr where pr.programme_id = p.id and pr.archived_at is null;
  select coalesce(array_agg(c.project_id order by c.contributed_at), '{}') into v_contrib_projects
  from public.programme_contributions c
  join public.projects pr on pr.id = c.project_id
  where c.host_programme_id = p.id and c.withdrawn_at is null and pr.archived_at is null
    and private.module_enabled(c.organisation_id, 'cross_org')
    and exists (select 1 from public.entity_shares s
      where s.entity_type = 'programme' and s.entity_id = p.id and s.partner_organisation_id = c.organisation_id
        and s.access = 'contribute');
  return jsonb_build_object(
    'programme', jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description,
      'start_date', p.start_date, 'finish_date', p.finish_date, 'state', p.state, 'archived', p.archived_at is not null,
      'organisation_id', p.organisation_id,
      'organisation', (select o.name from public.organisations o where o.id = p.organisation_id),
      'overall', (select h.overall from public.programme_health_current h where h.programme_id = p.id),
      'benefit_health', (select h.benefit from public.programme_health_current h where h.programme_id = p.id),
      'forecast_finish_date', (select h.forecast_finish_date from public.programme_health_current h where h.programme_id = p.id)),
    'viewer', jsonb_build_object(
      'is_host', p.workspace_id = any (private.my_workspace_ids()),
      'share_id', v_share.id, 'access', v_share.access,
      'partner_organisation_id', v_share.partner_organisation_id),
    'projects', coalesce((select jsonb_agg(private.partner_project_rollup(x) order by ord)
      from unnest(v_host_projects) with ordinality t(x, ord)), '[]'::jsonb),
    'contributed_projects', coalesce((select jsonb_agg(private.partner_project_rollup(x) order by ord)
      from unnest(v_contrib_projects) with ordinality t(x, ord)), '[]'::jsonb),
    'organisations', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', r.role) order by r.role, o.name)
      from (select p.organisation_id as id, 'host'::text as role
            union select s.partner_organisation_id, 'partner' from public.entity_shares s
              where s.entity_type = 'programme' and s.entity_id = p.id) r
      join public.organisations o on o.id = r.id), '[]'::jsonb),
    'benefits', private.partner_benefit_totals(p.id, v_host_projects || v_contrib_projects));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 8. Grants: every new public function closed to anon, open to signed-in users (each checks the
-- caller itself).
-- ---------------------------------------------------------------------------------------------
revoke execute on function
  public.create_partner_invite(uuid, text, text), public.revoke_partner_invite(uuid),
  public.partner_invite_preview(text), public.accept_partner_invite(text, uuid),
  public.set_programme_share_access(uuid, text), public.revoke_programme_share(uuid),
  public.contribute_project(uuid, uuid), public.withdraw_contribution(uuid),
  public.shared_programmes(), public.programme_partners(uuid), public.shared_programme_overview(uuid)
  from public, anon;
grant execute on function
  public.create_partner_invite(uuid, text, text), public.revoke_partner_invite(uuid),
  public.partner_invite_preview(text), public.accept_partner_invite(text, uuid),
  public.set_programme_share_access(uuid, text), public.revoke_programme_share(uuid),
  public.contribute_project(uuid, uuid), public.withdraw_contribution(uuid),
  public.shared_programmes(), public.programme_partners(uuid), public.shared_programme_overview(uuid)
  to authenticated, service_role;
