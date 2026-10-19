-- PROPOSAL (19/10/2026): D2 forums and meetings, database. Not applied.
--
-- Two migrations (a new enum value can't be used in the transaction that adds it):
--   d2_0_milestone_type_approval  alter type milestone_type add value 'approval'
--   d2_forums_meetings            everything below
-- Additive throughout: no DROP, no DELETE. The switch-over that needs them (dropping the
-- decisions / decision_events foreign keys to lookup_values, the forum_list columns, the five
-- 'decision_forum' lookup rows, seeding forums for new organisations) and the option-history
-- change to update_pending_decision are in docs/sql/runbook-d2.sql, to run after these two.
--
-- Decisions taken here (say if you want them different):
--   * Forums keep the 5 lookup ids per organisation. Every tenant table needs a workspace, so a
--     forum belongs to its organisation's first workspace (demo: its only one; outsider test org:
--     "Test workspace"). Read access is organisation-wide: a member of any workspace in the
--     organisation reads its forums and meetings (the Digital Committee serves every workspace;
--     reading only the owning workspace would hide forum names on UI Test's decisions). Still
--     built on private.my_workspace_ids(). Managing stays per workspace (PMO / admin of the
--     forum's workspace).
--   * Chair: a resource. "The chair" means the signed-in user is that resource (profile_id).
--   * Members: forum_members (forum, resource). PMO / admin add and remove them.
--   * Cadence: weekly / fortnightly / monthly / quarterly / ad hoc. Papers deadline: whole days
--     before the meeting (default 5).
--   * Meetings: planned / held / cancelled; papers deadline defaults to meeting date minus the
--     forum's days and stays editable. No delete grant: a meeting is cancelled, not removed.
--     Forums are deactivated (active = false), not removed.
--   * A decision's target meeting must be a meeting of the decision's forum (database rule).
--   * Approval milestones (new type) need a forum (rule for signed-in users, like gates and
--     their phase). The 34 "Design authority approval" milestones become approval milestones
--     with forum = Architecture Review Board.
--   * The forum chair can record, defer and reverse decisions of their forum (can_record), and
--     records for the forum by default.
--   * Signal rule, in v_decisions, for Pending decisions with a planned target meeting:
--       papers_deadline_passed            today is after the meeting's papers deadline
--       needed_by_before_papers_deadline  needed-by falls before the papers deadline
--       target_meeting_after_needed_by    the meeting itself is after the needed-by
--     ("decision needed-by before the target meeting's papers deadline" is the second; the
--     first and third are there for the screens to say why.)

-- ===== Migration d2_0_milestone_type_approval ================================================
alter type public.milestone_type add value if not exists 'approval';

-- ===== Migration d2_forums_meetings ===========================================================
-- 1. Types
create type public.forum_level as enum ('project', 'programme', 'portfolio', 'organisation');
create type public.forum_cadence as enum ('weekly', 'fortnightly', 'monthly', 'quarterly', 'ad_hoc');
create type public.meeting_status as enum ('planned', 'held', 'cancelled');

-- 2. Forums
create table public.forums (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  level public.forum_level not null default 'organisation',
  chair_resource_id uuid,
  cadence public.forum_cadence,
  papers_deadline_days integer not null default 5 check (papers_deadline_days between 0 and 60),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (chair_resource_id, organisation_id) references public.resources (id, organisation_id) on delete set null (chair_resource_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (id, workspace_id),
  unique (organisation_id, name)
);
create index forums_workspace_idx on public.forums (workspace_id, organisation_id);
create index forums_chair_idx on public.forums (chair_resource_id, organisation_id);
create index forums_created_by_idx on public.forums (created_by);
create trigger forums_00_tenant_guard before insert or update on public.forums
  for each row execute function private.tenant_guard('workspace_id', 'workspaces');
create trigger forums_updated_at before update on public.forums
  for each row execute function private.set_updated_at();
create trigger forums_audit after insert or update or delete on public.forums
  for each row execute function private.audit_row_change();

-- The five lookup labels become forums with the same ids, in each organisation's first workspace.
insert into public.forums (id, organisation_id, workspace_id, name, level, sort_order, active, created_at)
select l.id, l.organisation_id, w.id, l.label,
  case l.value when 'Project Board' then 'project'::public.forum_level
               when 'Programme Board' then 'programme'::public.forum_level
               else 'organisation'::public.forum_level end,
  l.sort_order, l.is_active, l.created_at
from public.lookup_values l
cross join lateral (
  select w.id from public.workspaces w where w.organisation_id = l.organisation_id
  order by w.created_at, w.id limit 1
) w
where l.list_key = 'decision_forum';

-- Is the signed-in user the chair of this (active) forum?
create function private.is_forum_chair(p_forum_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.forums f
    join public.resources r on r.id = f.chair_resource_id and r.organisation_id = f.organisation_id
    where f.id = p_forum_id and f.active and r.profile_id = (select auth.uid())
  );
$$;
revoke all on function private.is_forum_chair(uuid) from public, anon;
grant execute on function private.is_forum_chair(uuid) to authenticated;

-- Organisations whose workspaces I belong to (forums and meetings are read organisation-wide).
create function private.my_organisation_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct w.organisation_id), '{}')
  from public.workspaces w where w.id = any (private.my_workspace_ids());
$$;
revoke all on function private.my_organisation_ids() from public, anon;
grant execute on function private.my_organisation_ids() to authenticated;

alter table public.forums enable row level security;
revoke all on public.forums from anon, authenticated;
grant select, insert, update on public.forums to authenticated;
create policy forums_select on public.forums for select to authenticated
  using (organisation_id = any ((select private.my_organisation_ids())::uuid[]));
create policy forums_insert on public.forums for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]));
create policy forums_update on public.forums for update to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]))
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]));

-- 3. Members
create table public.forum_members (
  organisation_id uuid not null,
  workspace_id uuid not null,
  forum_id uuid not null,
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (forum_id, workspace_id) references public.forums (id, workspace_id) on delete cascade,
  foreign key (resource_id, organisation_id) references public.resources (id, organisation_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null,
  primary key (forum_id, resource_id)
);
create index forum_members_workspace_idx on public.forum_members (workspace_id, organisation_id);
create index forum_members_forum_idx on public.forum_members (forum_id, workspace_id);
create index forum_members_resource_idx on public.forum_members (resource_id, organisation_id);
create index forum_members_created_by_idx on public.forum_members (created_by);
create trigger forum_members_00_tenant_guard before insert or update on public.forum_members
  for each row execute function private.tenant_guard('forum_id', 'forums');
create trigger forum_members_audit after insert or update or delete on public.forum_members
  for each row execute function private.audit_row_change();
alter table public.forum_members enable row level security;
revoke all on public.forum_members from anon, authenticated;
grant select, insert, delete on public.forum_members to authenticated;
create policy forum_members_select on public.forum_members for select to authenticated
  using (organisation_id = any ((select private.my_organisation_ids())::uuid[]));
create policy forum_members_insert on public.forum_members for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]));
create policy forum_members_delete on public.forum_members for delete to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]));

-- 4. Meetings
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  forum_id uuid not null,
  meeting_date date not null,
  papers_deadline date,
  status public.meeting_status not null default 'planned',
  minutes_link text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (forum_id, workspace_id) references public.forums (id, workspace_id),
  foreign key (created_by) references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (id, workspace_id),
  check (papers_deadline is null or papers_deadline <= meeting_date)
);
create index meetings_workspace_idx on public.meetings (workspace_id, organisation_id);
create index meetings_forum_idx on public.meetings (forum_id, workspace_id);
create index meetings_forum_date_idx on public.meetings (forum_id, meeting_date);
create index meetings_created_by_idx on public.meetings (created_by);
create trigger meetings_00_tenant_guard before insert or update on public.meetings
  for each row execute function private.tenant_guard('forum_id', 'forums');

-- Papers deadline defaults from the forum; the forum can't change under a meeting.
create function private.meeting_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.forum_id is distinct from old.forum_id then
    raise exception 'A meeting stays with its forum.' using errcode = '23514';
  end if;
  if new.papers_deadline is null then
    select new.meeting_date - f.papers_deadline_days into new.papers_deadline
    from public.forums f where f.id = new.forum_id;
  end if;
  return new;
end;
$$;
revoke all on function private.meeting_rules() from public, anon;
create trigger meetings_10_rules before insert or update on public.meetings
  for each row execute function private.meeting_rules();
create trigger meetings_updated_at before update on public.meetings
  for each row execute function private.set_updated_at();
create trigger meetings_audit after insert or update or delete on public.meetings
  for each row execute function private.audit_row_change();
alter table public.meetings enable row level security;
revoke all on public.meetings from anon, authenticated;
grant select, insert, update on public.meetings to authenticated;
create policy meetings_select on public.meetings for select to authenticated
  using (organisation_id = any ((select private.my_organisation_ids())::uuid[]));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[])
    or (select private.is_forum_chair(forum_id)));
create policy meetings_update on public.meetings for update to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[])
    or (select private.is_forum_chair(forum_id)))
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[])
    or (select private.is_forum_chair(forum_id)));

-- 5. Decisions: forum ids also reference forums (the lookup_values keys go in the runbook);
--    optional target meeting of the same forum.
alter table public.decisions
  add column target_meeting_id uuid,
  add constraint decisions_forum_id_forums_fkey foreign key (forum_id, organisation_id)
    references public.forums (id, organisation_id),
  add constraint decisions_decided_by_forum_id_forums_fkey foreign key (decided_by_forum_id, organisation_id)
    references public.forums (id, organisation_id),
  add constraint decisions_target_meeting_fkey foreign key (target_meeting_id, organisation_id)
    references public.meetings (id, organisation_id) on delete set null (target_meeting_id);
create index decisions_forum_org_idx on public.decisions (forum_id, organisation_id);
create index decisions_decided_by_forum_org_idx on public.decisions (decided_by_forum_id, organisation_id);
create index decisions_target_meeting_idx on public.decisions (target_meeting_id, organisation_id);
alter table public.decision_events
  add constraint decision_events_forum_id_forums_fkey foreign key (forum_id, organisation_id)
    references public.forums (id, organisation_id);
create index decision_events_forum_org_idx on public.decision_events (forum_id, organisation_id);

create function private.decision_target_meeting_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  m record;
begin
  if new.target_meeting_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.target_meeting_id is not distinct from old.target_meeting_id
    and new.forum_id is not distinct from old.forum_id then
    return new;
  end if;
  select mt.forum_id, mt.status into m from public.meetings mt where mt.id = new.target_meeting_id;
  if m.forum_id is distinct from new.forum_id then
    raise exception 'The target meeting must be a meeting of the decision''s forum.' using errcode = '23514';
  end if;
  if m.status <> 'planned' then
    raise exception 'The target meeting must be a planned meeting.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.decision_target_meeting_rule() from public, anon;
create trigger decisions_06_target_meeting before insert or update on public.decisions
  for each row execute function private.decision_target_meeting_rule();

-- 6. Approval milestones: linked to a forum (required for signed-in users), and the
--    34 "Design authority approval" key dates become approvals of the Architecture Review Board.
alter table public.milestones
  add column forum_id uuid,
  add constraint milestones_forum_fkey foreign key (forum_id, organisation_id)
    references public.forums (id, organisation_id) on delete set null (forum_id);
create index milestones_forum_idx on public.milestones (forum_id, organisation_id);

create function private.approval_milestone_needs_forum()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.type = 'approval' and new.forum_id is null then
    raise exception 'Choose the forum that gives this approval.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.approval_milestone_needs_forum() from public, anon;
create trigger milestones_06_approval_forum before insert or update on public.milestones
  for each row execute function private.approval_milestone_needs_forum();

update public.milestones m
set type = 'approval', forum_id = f.id, report_to_committee = true
from public.forums f
where f.organisation_id = m.organisation_id and f.name = 'Architecture Review Board'
  and regexp_replace(btrim(m.title), '\s+', ' ', 'g') = 'Design authority approval';

-- 7. The chair records for their forum.
create or replace function private.can_record_decision(p_decision public.decisions)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_decision.workspace_id = any (private.my_workspace_ids('pmo'))
    or (
      p_decision.workspace_id = any (private.my_workspace_ids())
      and (
        exists (
          select 1 from public.resources r
          where r.id = p_decision.decision_maker_id and r.profile_id = (select auth.uid())
        )
        or private.is_forum_chair(p_decision.forum_id)
      )
    );
$$;
revoke all on function private.can_record_decision(public.decisions) from public, anon;
grant execute on function private.can_record_decision(public.decisions) to authenticated;

-- 7b. record_decision: the chair records for the forum by default.
create or replace function public.record_decision(
  p_decision_id uuid,
  p_chosen_option_id uuid,
  p_rationale text,
  p_decision_date date,
  p_decided_by_resource_id uuid default null,
  p_decided_by_forum_id uuid default null,
  p_actions jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null
)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.decisions;
  pred public.decisions;
  is_pmo boolean;
  v_resource uuid := p_decided_by_resource_id;
  v_forum uuid := p_decided_by_forum_id;
  a jsonb;
begin
  select * into d from public.decisions where id = p_decision_id for update;
  if d.id is null or not private.can_record_decision(d) then
    raise exception 'You can''t record this decision. The decision maker, the forum chair or the PMO records it.' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
  end if;
  if d.status <> 'pending' then
    raise exception '% is already %.', d.ref, d.status using errcode = '22023';
  end if;
  if p_chosen_option_id is null or not exists (
    select 1 from public.decision_options o where o.id = p_chosen_option_id and o.decision_id = d.id) then
    raise exception 'Choose one of this decision''s options.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_rationale, ''))) = 0 then
    raise exception 'Give the rationale for the decision.' using errcode = '22023';
  end if;
  if p_decision_date is null or p_decision_date > private.org_today(d.organisation_id) then
    raise exception 'The decision date can''t be in the future.' using errcode = '22023';
  end if;
  if v_resource is not null and v_forum is not null then
    raise exception 'A decision is made by a person or a forum, not both.' using errcode = '22023';
  end if;
  is_pmo := d.workspace_id = any (private.my_workspace_ids('pmo'));
  if not is_pmo then
    -- The decision maker records their own decision, or their forum's.
    if (v_resource is not null and v_resource <> d.decision_maker_id)
      or (v_forum is not null and v_forum is distinct from d.forum_id) then
      raise exception 'You can record the decision as yours or as %''s forum only.', d.ref using errcode = '42501';
    end if;
    if v_resource is null and v_forum is null then
      -- The forum's chair records for the forum; the decision maker as themselves.
      if private.is_forum_chair(d.forum_id) then
        v_forum := d.forum_id;
      else
        v_resource := d.decision_maker_id;
      end if;
    end if;
  elsif v_resource is null and v_forum is null then
    v_forum := d.forum_id;
    if v_forum is null then v_resource := d.decision_maker_id; end if;
  end if;
  if v_resource is null and v_forum is null then
    raise exception 'Say who made the decision: a person or a forum.' using errcode = '22023';
  end if;

  update public.decisions set
    status = 'made', chosen_option_id = p_chosen_option_id, rationale = btrim(p_rationale),
    decision_date = p_decision_date, decided_by_resource_id = v_resource, decided_by_forum_id = v_forum,
    recorded_by = (select auth.uid()), recorded_at = now()
  where id = d.id
  returning * into d;

  for a in select * from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) loop
    if length(btrim(coalesce(a ->> 'description', ''))) = 0 then
      raise exception 'Every action needs a description.' using errcode = '22023';
    end if;
    insert into public.decision_actions (decision_id, description, owner_id, due_date)
    values (d.id, btrim(a ->> 'description'), nullif(a ->> 'owner_id', '')::uuid, nullif(a ->> 'due_date', '')::date);
  end loop;

  insert into public.decision_events (decision_id, event_type, event_date, forum_id, decided_by_resource_id, reason, actor_id)
  values (d.id, 'made', p_decision_date, coalesce(v_forum, d.forum_id), v_resource, d.rationale, (select auth.uid()));

  -- A recorded successor supersedes the decision it replaces.
  if d.supersedes_id is not null then
    select * into pred from public.decisions where id = d.supersedes_id for update;
    if pred.status = 'made' then
      update public.decisions set status = 'superseded' where id = pred.id;
      insert into public.decision_events (decision_id, event_type, event_date, forum_id, reason, actor_id)
      values (pred.id, 'superseded', p_decision_date, coalesce(v_forum, d.forum_id),
        format('Superseded by %s: %s', d.ref, d.title), (select auth.uid()));
    end if;
  end if;
  return d;
end;
$$;
revoke all on function public.record_decision(uuid, uuid, text, date, uuid, uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.record_decision(uuid, uuid, text, date, uuid, uuid, jsonb, timestamptz) to authenticated;

-- 8. Views. v_decisions gains the target meeting and the papers-deadline rule (columns added at
--    the end); v_forums and v_meetings feed Governance › Boards.
create or replace view public.v_decisions with (security_invoker = true) as
-- The decision columns are listed (not d.*) so the new target_meeting_id can go at the end:
-- create or replace view only allows columns to be added after the existing ones.
select d.id, d.organisation_id, d.workspace_id, d.portfolio_id, d.programme_id, d.project_id, d.title,
  d.context, d.chosen_option_id, d.rationale, d.needed_by_date, d.decision_date, d.status,
  d.impact_scope, d.impact_scope_note, d.impact_cost, d.impact_cost_note, d.impact_time,
  d.impact_time_note, d.impact_benefits, d.impact_benefits_note, d.evidence_link, d.supersedes_id,
  d.decision_maker_id, d.forum_id, d.forum_list, d.ref, d.created_at, d.updated_at, d.created_by,
  d.decided_by_resource_id, d.decided_by_forum_id, d.recorded_by, d.recorded_at,
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
  private.can_write_decision(d) as can_write,
  -- Target meeting (D2): when it is, its papers deadline, and whether the decision will be late.
  d.target_meeting_id,
  tm.meeting_date as target_meeting_date,
  tm.papers_deadline as target_papers_deadline,
  tm.status as target_meeting_status,
  (d.status = 'pending' and tm.status = 'planned' and tm.papers_deadline < t.today) as papers_deadline_passed,
  (d.status = 'pending' and tm.status = 'planned' and d.needed_by_date is not null
    and d.needed_by_date < tm.papers_deadline) as needed_by_before_papers_deadline,
  (d.status = 'pending' and tm.status = 'planned' and d.needed_by_date is not null
    and d.needed_by_date < tm.meeting_date) as target_meeting_after_needed_by
from public.decisions d
left join public.meetings tm on tm.id = d.target_meeting_id
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

create view public.v_forums with (security_invoker = true) as
select f.*,
  r.name as chair_name,
  (select count(*) from public.forum_members fm where fm.forum_id = f.id)::integer as member_count,
  nm.id as next_meeting_id,
  nm.meeting_date as next_meeting_date,
  nm.papers_deadline as next_papers_deadline,
  (select count(*) from public.decisions d where d.forum_id = f.id and d.status = 'pending')::integer as pending_decisions
from public.forums f
left join public.resources r on r.id = f.chair_resource_id
left join lateral (
  select mt.id, mt.meeting_date, mt.papers_deadline from public.meetings mt
  where mt.forum_id = f.id and mt.status = 'planned' and mt.meeting_date >= private.org_today(f.organisation_id)
  order by mt.meeting_date limit 1
) nm on true;
revoke all on public.v_forums from anon, authenticated;
grant select on public.v_forums to authenticated;

create view public.v_meetings with (security_invoker = true) as
select mt.*,
  f.name as forum_name,
  t.today,
  (mt.meeting_date < t.today) as is_past,
  (mt.status = 'planned' and mt.papers_deadline < t.today) as papers_deadline_passed,
  (select count(*) from public.decisions d where d.target_meeting_id = mt.id)::integer as decisions_targeted,
  (select count(*) from public.decisions d where d.target_meeting_id = mt.id and d.status = 'pending')::integer as decisions_pending
from public.meetings mt
join public.forums f on f.id = mt.forum_id
cross join lateral (select private.org_today(mt.organisation_id) as today) t;
revoke all on public.v_meetings from anon, authenticated;
grant select on public.v_meetings to authenticated;

-- DRY RUN (19/10/2026, one transaction, rolled back; d2_forums_meetings only - the 'approval'
-- enum value can't be used before its own migration commits, so the 34-milestone move was
-- counted, not run). Member = contributor in the demo organisation; promoted to PMO and back
-- inside the transaction; made chair of the Architecture Review Board (ARB) there.
--   1  forums from the 5 lookup labels per organisation   10 forums, all 10 ids kept, demo 5
--   1b Design authority approvals that would move          34
--   2  member reads forums (demo + UI Test org)            10
--   3  contributor creates a forum                         refused 42501
--   4  contributor (not chair) adds a meeting              refused 42501
--   5  as PMO: ARB chair = member, add a member, add a     ok; Project Board 05/11 papers 31/10
--      Project Board meeting                               (forum default 5 days)
--   6  as ARB chair: add ARB meetings 29/10 and 20/10      ok; 29/10 papers 24/10
--   7  chair adds a meeting to another forum               refused 42501
--   8  move a meeting to another forum                     refused 23514
--   9  DEC-003 (ARB, needed 23/10) targets ARB 29/10       papers passed false; needed-by before
--                                                          papers deadline true; meeting after
--                                                          needed-by true; can_record true
--   10 retarget to ARB 20/10 (papers 15/10, today 19/10)   papers deadline passed true
--   11 target a meeting of another forum                   refused 23514
--   12 can_record as ARB chair                             both pending ARB decisions true,
--                                                          every other decision false
--   13 chair records DEC-008 (ARB)                         made, decided by forum ARB
--   14 chair records DEC-004 (Project Board)               refused 42501
--   15 outsider reads forums / demo meetings               5 (own) / 0
--   16 outsider adds a meeting to demo ARB                 refused (23503, forum not visible)
--   17 anon execute on the 5 new private functions         false x5
-- 18 of 18 as intended. Afterwards: no forums or meetings tables, member back to contributor,
-- DEC-008 still Pending.
