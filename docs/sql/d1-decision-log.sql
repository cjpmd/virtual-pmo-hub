-- APPLIED 14/10/2026 as migration 20261014160439_d1_decision_log. D1 decision log, database only (14/10/2026).
-- Audit: docs/design/governance-decisions-audit.md. Decisions agreed on D0:
--   * refs stay organisation-wide (DEC-nnn); no renumbering
--   * recording: the decision maker (if they have a login) or workspace PMO / admin on the
--     forum's behalf; the forum chair arrives in D2; project editors create and edit Pending
--     decisions but can't set Made. decided_by (person or forum) is stored apart from
--     recorded_by (the signed-in user)
--   * Made decisions are read-only in the database; superseding and reversing are the only
--     ways to change them
--   * Deferred is not a status: a decision_events history (deferred, made, superseded,
--     reversed, edited); a deferred decision stays Pending with a new needed-by
--   * Supersede: the copy starts Pending and goes through Record decision; the original stays
--     Made until its successor is recorded, then becomes Superseded. v_decisions shows the
--     proposed replacement (pending_successor_*). Reverse: Reversed, with a required rationale,
--     who and when; no successor
--   * Withdraw (approved 14/10): a Pending decision can be withdrawn with a required reason
--     (status 'withdrawn', added by migration decision_status_withdrawn, and a 'withdrawn'
--     event); same permission as editing it; frozen like Made. A withdrawn successor releases
--     the original, which stays Made with no proposed replacement
--   * Status report links (approved 14/10): editable while the report is a draft, frozen once
--     it is submitted. submit_status_report saves a report and its decision links in one
--     transaction (insert as submitted, or draft -> submitted)
--
-- Contents:
--   1. decision_event_type enum, decision_events (append-only history; written only by the
--      RPCs and by the edit trigger)
--   2. decisions: decided_by_resource_id, decided_by_forum_id, recorded_by, recorded_at;
--      backfill decided_by for the 7 recorded decisions and their history events
--   3. Rules trigger: plain client writes (current_user = 'authenticated') can only create and
--      edit Pending decisions; outcome fields and status only through the RPCs; options and
--      links of a decision that is no longer Pending are frozen (actions stay editable, so
--      owners can progress them)
--   4. decision_milestones link table
--   5. RPCs: record_decision, defer_decision, supersede_decision, reverse_decision,
--      withdraw_decision
--   6. status_report_decisions (Decisions needed: links to decisions; decisions_needed text
--      stays as legacy notes), frozen once the report is submitted; submit_status_report
--   7. v_decisions: overdue (Pending past needed-by, organisation's today), days overdue,
--      deferral count, superseded-by, pending successor
--   8. get_project_overview: adds openDecisions and latestReportDecisions
-- Additive throughout: no DROP, no DELETE. New private functions revoke execute from public
-- and anon. RPC errors: 42501 not allowed, 22023 invalid input, 40001 changed by someone else.

-- ---------------------------------------------------------------------------------------
-- 1. Decision history
-- ---------------------------------------------------------------------------------------
create type public.decision_event_type as enum ('edited', 'deferred', 'made', 'superseded', 'reversed', 'withdrawn');

create table public.decision_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  decision_id uuid not null,
  project_id uuid,
  event_type public.decision_event_type not null,
  -- The day it happened (meeting or decision date); created_at is when it was recorded.
  event_date date not null,
  forum_id uuid,
  forum_list text generated always as ('decision_forum') stored,
  decided_by_resource_id uuid,
  reason text,
  previous_needed_by date,
  new_needed_by date,
  -- edited: {"column": [old, new], ...}
  changes jsonb,
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (forum_id, organisation_id, forum_list) references public.lookup_values (id, organisation_id, list_key),
  foreign key (decided_by_resource_id, organisation_id) references public.resources (id, organisation_id) on delete set null (decided_by_resource_id),
  foreign key (actor_id) references public.profiles (id) on delete set null,
  check (event_type <> 'deferred' or (new_needed_by is not null and length(btrim(coalesce(reason, ''))) > 0)),
  check (event_type not in ('reversed', 'withdrawn') or length(btrim(coalesce(reason, ''))) > 0),
  check (changes is null or jsonb_typeof(changes) = 'object')
);
create index decision_events_workspace_idx on public.decision_events (workspace_id, organisation_id);
create index decision_events_organisation_idx on public.decision_events (organisation_id);
create index decision_events_decision_idx on public.decision_events (decision_id, workspace_id);
create index decision_events_decision_type_idx on public.decision_events (decision_id, event_type, event_date);
create index decision_events_project_idx on public.decision_events (project_id, workspace_id);
create index decision_events_forum_idx on public.decision_events (forum_id, organisation_id, forum_list);
create index decision_events_decided_by_idx on public.decision_events (decided_by_resource_id, organisation_id);
create index decision_events_actor_idx on public.decision_events (actor_id);
create trigger decision_events_00_tenant_guard before insert or update on public.decision_events
  for each row execute function private.tenant_guard('decision_id', 'decisions');

-- Read-only to clients: rows come from the RPCs (SECURITY DEFINER) and the edit trigger.
alter table public.decision_events enable row level security;
revoke all on public.decision_events from anon, authenticated;
grant select on public.decision_events to authenticated;
create policy decision_events_select on public.decision_events for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));

-- ---------------------------------------------------------------------------------------
-- 2. Who decided and who recorded it
-- ---------------------------------------------------------------------------------------
alter table public.decisions
  add column decided_by_resource_id uuid,
  add column decided_by_forum_id uuid,
  add column recorded_by uuid,
  add column recorded_at timestamptz,
  add constraint decisions_decided_by_one check (num_nonnulls(decided_by_resource_id, decided_by_forum_id) <= 1),
  add constraint decisions_decided_by_resource_fkey foreign key (decided_by_resource_id, organisation_id)
    references public.resources (id, organisation_id) on delete set null (decided_by_resource_id),
  add constraint decisions_decided_by_forum_fkey foreign key (decided_by_forum_id, organisation_id, forum_list)
    references public.lookup_values (id, organisation_id, list_key),
  add constraint decisions_recorded_by_fkey foreign key (recorded_by) references public.profiles (id) on delete set null;
create index decisions_decided_by_resource_idx on public.decisions (decided_by_resource_id, organisation_id);
create index decisions_decided_by_forum_idx on public.decisions (decided_by_forum_id, organisation_id, forum_list);
create index decisions_recorded_by_idx on public.decisions (recorded_by);

-- Backfill: decisions recorded before this history existed were decided by their decision
-- maker; who recorded them is unknown (recorded_by stays null).
update public.decisions
set decided_by_resource_id = decision_maker_id
where status in ('made', 'superseded', 'reversed') and decided_by_resource_id is null;

insert into public.decision_events (decision_id, event_type, event_date, forum_id, decided_by_resource_id, reason, actor_id, created_at)
select d.id, 'made', d.decision_date, d.forum_id, d.decision_maker_id, d.rationale, null, d.decision_date::timestamptz
from public.decisions d
where d.status in ('made', 'superseded', 'reversed') and d.decision_date is not null;

insert into public.decision_events (decision_id, event_type, event_date, forum_id, reason, actor_id, created_at)
select d.id, 'superseded', s.decision_date, s.forum_id, format('Superseded by %s: %s', s.ref, s.title), null, s.decision_date::timestamptz
from public.decisions d
join public.decisions s on s.supersedes_id = d.id and s.status = 'made'
where d.status = 'superseded';

-- ---------------------------------------------------------------------------------------
-- 3. Rules for plain client writes
-- ---------------------------------------------------------------------------------------
-- Writes the "edited" history row (the client can't insert into decision_events).
create function private.log_decision_edit(p_decision_id uuid, p_changes jsonb, p_previous_needed_by date, p_new_needed_by date)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.decision_events (decision_id, event_type, event_date, previous_needed_by, new_needed_by, changes, actor_id)
  select d.id, 'edited', private.org_today(d.organisation_id), p_previous_needed_by, p_new_needed_by, p_changes, (select auth.uid())
  from public.decisions d where d.id = p_decision_id;
$$;
revoke all on function private.log_decision_edit(uuid, jsonb, date, date) from public, anon;
grant execute on function private.log_decision_edit(uuid, jsonb, date, date) to authenticated;

-- Runs as the caller, so current_user tells a plain client write ('authenticated') from an RPC
-- (the function owner); no session setting can change that.
create function private.decision_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  changed jsonb;
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'pending' then
      raise exception '% is % and is kept for the record. Supersede or reverse it instead.', old.ref, old.status
        using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.chosen_option_id is not null or new.decision_date is not null
      or new.rationale is not null or new.supersedes_id is not null then
      raise exception 'A new decision starts as Pending. Record the outcome with Record decision.'
        using errcode = '42501';
    end if;
    new.decided_by_resource_id := null;
    new.decided_by_forum_id := null;
    new.recorded_by := null;
    new.recorded_at := null;
    return new;
  end if;
  -- UPDATE
  if old.status <> 'pending' then
    raise exception '% is % and read-only. Supersede or reverse it to change it.', old.ref, old.status
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status
    or new.chosen_option_id is distinct from old.chosen_option_id
    or new.decision_date is distinct from old.decision_date
    or new.rationale is distinct from old.rationale
    or new.supersedes_id is distinct from old.supersedes_id
    or new.decided_by_resource_id is distinct from old.decided_by_resource_id
    or new.decided_by_forum_id is distinct from old.decided_by_forum_id
    or new.recorded_by is distinct from old.recorded_by
    or new.recorded_at is distinct from old.recorded_at then
    raise exception 'Use Record decision, Defer, Supersede or Reverse to change a decision''s outcome.'
      using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)), '{}'::jsonb) into changed
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on o.key = n.key
  where n.value is distinct from o.value
    and n.key not in ('updated_at', 'created_at', 'created_by', 'organisation_id', 'workspace_id', 'ref', 'forum_list');
  if changed <> '{}'::jsonb then
    perform private.log_decision_edit(new.id, changed,
      case when new.needed_by_date is distinct from old.needed_by_date then old.needed_by_date end,
      case when new.needed_by_date is distinct from old.needed_by_date then new.needed_by_date end);
  end if;
  return new;
end;
$$;
revoke all on function private.decision_rules() from public, anon;
create trigger decisions_05_rules before insert or update or delete on public.decisions
  for each row execute function private.decision_rules();

-- Options and links belong to the decision as it was made: frozen once it isn't Pending.
create function private.decision_child_frozen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d record;
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  select dd.ref, dd.status into d from public.decisions dd
  where dd.id = coalesce(new.decision_id, old.decision_id);
  if d.status is not null and d.status <> 'pending' then
    raise exception '% is % and read-only. Supersede or reverse it to change it.', d.ref, d.status
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.decision_child_frozen() from public, anon;
create trigger decision_options_05_frozen before insert or update or delete on public.decision_options
  for each row execute function private.decision_child_frozen();
create trigger decision_risks_05_frozen before insert or delete on public.decision_risks
  for each row execute function private.decision_child_frozen();
create trigger decision_issues_05_frozen before insert or delete on public.decision_issues
  for each row execute function private.decision_child_frozen();
create trigger decision_change_requests_05_frozen before insert or delete on public.decision_change_requests
  for each row execute function private.decision_child_frozen();
create trigger decision_dependencies_05_frozen before insert or delete on public.decision_dependencies
  for each row execute function private.decision_child_frozen();
create trigger decision_benefits_05_frozen before insert or delete on public.decision_benefits
  for each row execute function private.decision_child_frozen();

-- ---------------------------------------------------------------------------------------
-- 4. Milestone links
-- ---------------------------------------------------------------------------------------
create table public.decision_milestones (
  organisation_id uuid not null,
  workspace_id uuid not null,
  decision_id uuid not null,
  project_id uuid,
  milestone_id uuid not null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (milestone_id, workspace_id) references public.milestones (id, workspace_id) on delete cascade,
  primary key (decision_id, milestone_id)
);
create index decision_milestones_workspace_idx on public.decision_milestones (workspace_id, organisation_id);
create index decision_milestones_organisation_idx on public.decision_milestones (organisation_id);
create index decision_milestones_decision_idx on public.decision_milestones (decision_id, workspace_id);
create index decision_milestones_project_idx on public.decision_milestones (project_id, workspace_id);
create index decision_milestones_milestone_idx on public.decision_milestones (milestone_id, workspace_id);
create trigger decision_milestones_00_tenant_guard before insert or update on public.decision_milestones
  for each row execute function private.tenant_guard('decision_id', 'decisions');
create trigger decision_milestones_05_frozen before insert or delete on public.decision_milestones
  for each row execute function private.decision_child_frozen();
alter table public.decision_milestones enable row level security;
revoke all on public.decision_milestones from anon, authenticated;
grant select, insert, delete on public.decision_milestones to authenticated;
create policy decision_milestones_select on public.decision_milestones for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy decision_milestones_insert on public.decision_milestones for insert to authenticated
  with check (case when project_id is null
    then workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[])
    else project_id = any ((select private.my_editable_project_ids())::uuid[]) end);
create policy decision_milestones_delete on public.decision_milestones for delete to authenticated
  using (case when project_id is null
    then workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[])
    else project_id = any ((select private.my_editable_project_ids())::uuid[]) end);

-- ---------------------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------------------
-- Who may record, defer or reverse: workspace PMO / admin (on the forum's behalf), or the
-- decision maker when they have a login. (The forum chair joins in D2.)
create function private.can_record_decision(p_decision public.decisions)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_decision.workspace_id = any (private.my_workspace_ids('pmo'))
    or (
      p_decision.workspace_id = any (private.my_workspace_ids())
      and exists (
        select 1 from public.resources r
        where r.id = p_decision.decision_maker_id and r.profile_id = (select auth.uid())
      )
    );
$$;
revoke all on function private.can_record_decision(public.decisions) from public, anon;

-- Who may create, edit and supersede: as the decisions insert/update policies.
create function private.can_write_decision(p_decision public.decisions)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_decision.project_id is null
    then p_decision.workspace_id = any (private.my_workspace_ids('contributor'))
    else p_decision.project_id = any (private.my_editable_project_ids()) end;
$$;
revoke all on function private.can_write_decision(public.decisions) from public, anon;

create function public.record_decision(
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
    raise exception 'You can''t record this decision. The decision maker or the PMO records it.' using errcode = '42501';
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
      v_resource := d.decision_maker_id;
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

create function public.defer_decision(
  p_decision_id uuid,
  p_new_needed_by date,
  p_reason text,
  p_event_date date default null,
  p_forum_id uuid default null,
  p_expected_updated_at timestamptz default null
)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.decisions;
  v_today date;
  v_previous date;
begin
  select * into d from public.decisions where id = p_decision_id for update;
  if d.id is null or not private.can_record_decision(d) then
    raise exception 'You can''t defer this decision. The decision maker or the PMO defers it.' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
  end if;
  if d.status <> 'pending' then
    raise exception 'Only a Pending decision can be deferred; % is %.', d.ref, d.status using errcode = '22023';
  end if;
  v_today := private.org_today(d.organisation_id);
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Give the reason for deferring.' using errcode = '22023';
  end if;
  if coalesce(p_event_date, v_today) > v_today then
    raise exception 'The deferral date can''t be in the future.' using errcode = '22023';
  end if;
  if p_new_needed_by is null or p_new_needed_by < v_today then
    raise exception 'The new needed-by date must be today or later.' using errcode = '22023';
  end if;
  v_previous := d.needed_by_date;
  update public.decisions set needed_by_date = p_new_needed_by where id = d.id returning * into d;
  insert into public.decision_events (decision_id, event_type, event_date, forum_id, reason, previous_needed_by, new_needed_by, actor_id)
  values (d.id, 'deferred', coalesce(p_event_date, v_today), coalesce(p_forum_id, d.forum_id), btrim(p_reason),
    v_previous, p_new_needed_by, (select auth.uid()));
  return d;
end;
$$;
revoke all on function public.defer_decision(uuid, date, text, date, uuid, timestamptz) from public, anon;
grant execute on function public.defer_decision(uuid, date, text, date, uuid, timestamptz) to authenticated;

-- A new Pending decision that copies the original (content, options, links) and points at it
-- with supersedes_id. The original stays Made until the new one is recorded.
create function public.supersede_decision(
  p_decision_id uuid,
  p_needed_by date,
  p_expected_updated_at timestamptz default null
)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.decisions;
  n public.decisions;
begin
  select * into d from public.decisions where id = p_decision_id for update;
  if d.id is null or not private.can_write_decision(d) then
    raise exception 'You can''t supersede this decision.' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
  end if;
  if d.status <> 'made' then
    raise exception 'Only a Made decision can be superseded; % is %.', d.ref, d.status using errcode = '22023';
  end if;
  if exists (select 1 from public.decisions s where s.supersedes_id = d.id and s.status = 'pending') then
    raise exception '% already has a Pending successor.', d.ref using errcode = '22023';
  end if;
  if p_needed_by is null then
    raise exception 'Give a needed-by date for the new decision.' using errcode = '22023';
  end if;

  insert into public.decisions (
    organisation_id, workspace_id, portfolio_id, programme_id, project_id, title, context,
    needed_by_date, status, impact_scope, impact_scope_note, impact_cost, impact_cost_note,
    impact_time, impact_time_note, impact_benefits, impact_benefits_note, supersedes_id,
    decision_maker_id, forum_id)
  values (
    d.organisation_id, d.workspace_id, d.portfolio_id, d.programme_id, d.project_id, d.title, d.context,
    p_needed_by, 'pending', d.impact_scope, d.impact_scope_note, d.impact_cost, d.impact_cost_note,
    d.impact_time, d.impact_time_note, d.impact_benefits, d.impact_benefits_note, d.id,
    d.decision_maker_id, d.forum_id)
  returning * into n;

  insert into public.decision_options (decision_id, title, pros, cons, sort_order)
  select n.id, o.title, o.pros, o.cons, o.sort_order from public.decision_options o where o.decision_id = d.id;
  insert into public.decision_risks (decision_id, risk_id) select n.id, x.risk_id from public.decision_risks x where x.decision_id = d.id;
  insert into public.decision_issues (decision_id, issue_id) select n.id, x.issue_id from public.decision_issues x where x.decision_id = d.id;
  insert into public.decision_change_requests (decision_id, change_request_id) select n.id, x.change_request_id from public.decision_change_requests x where x.decision_id = d.id;
  insert into public.decision_dependencies (decision_id, dependency_id) select n.id, x.dependency_id from public.decision_dependencies x where x.decision_id = d.id;
  insert into public.decision_benefits (decision_id, benefit_id) select n.id, x.benefit_id from public.decision_benefits x where x.decision_id = d.id;
  insert into public.decision_milestones (decision_id, milestone_id) select n.id, x.milestone_id from public.decision_milestones x where x.decision_id = d.id;
  return n;
end;
$$;
revoke all on function public.supersede_decision(uuid, date, timestamptz) from public, anon;
grant execute on function public.supersede_decision(uuid, date, timestamptz) to authenticated;

create function public.reverse_decision(
  p_decision_id uuid,
  p_rationale text,
  p_event_date date default null,
  p_expected_updated_at timestamptz default null
)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.decisions;
  v_today date;
begin
  select * into d from public.decisions where id = p_decision_id for update;
  if d.id is null or not private.can_record_decision(d) then
    raise exception 'You can''t reverse this decision. The decision maker or the PMO reverses it.' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
  end if;
  if d.status <> 'made' then
    raise exception 'Only a Made decision can be reversed; % is %.', d.ref, d.status using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_rationale, ''))) = 0 then
    raise exception 'Give the rationale for reversing the decision.' using errcode = '22023';
  end if;
  v_today := private.org_today(d.organisation_id);
  if coalesce(p_event_date, v_today) > v_today then
    raise exception 'The reversal date can''t be in the future.' using errcode = '22023';
  end if;
  update public.decisions set status = 'reversed' where id = d.id returning * into d;
  insert into public.decision_events (decision_id, event_type, event_date, forum_id, reason, actor_id)
  values (d.id, 'reversed', coalesce(p_event_date, v_today), d.forum_id, btrim(p_rationale), (select auth.uid()));
  return d;
end;
$$;
revoke all on function public.reverse_decision(uuid, text, date, timestamptz) from public, anon;
grant execute on function public.reverse_decision(uuid, text, date, timestamptz) to authenticated;

-- Withdraw a Pending decision (raised in error, or a proposed replacement that isn't going
-- ahead). Same permission as editing it. A withdrawn successor leaves the original Made.
create function public.withdraw_decision(
  p_decision_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz default null
)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.decisions;
begin
  select * into d from public.decisions where id = p_decision_id for update;
  if d.id is null or not private.can_write_decision(d) then
    raise exception 'You can''t withdraw this decision.' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
  end if;
  if d.status <> 'pending' then
    raise exception 'Only a Pending decision can be withdrawn; % is %.', d.ref, d.status using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Give the reason for withdrawing the decision.' using errcode = '22023';
  end if;
  update public.decisions set status = 'withdrawn' where id = d.id returning * into d;
  insert into public.decision_events (decision_id, event_type, event_date, forum_id, reason, actor_id)
  values (d.id, 'withdrawn', private.org_today(d.organisation_id), d.forum_id, btrim(p_reason), (select auth.uid()));
  return d;
end;
$$;
revoke all on function public.withdraw_decision(uuid, text, timestamptz) from public, anon;
grant execute on function public.withdraw_decision(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------
-- 6. Status report "Decisions needed"
-- ---------------------------------------------------------------------------------------
create table public.status_report_decisions (
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  status_report_id uuid not null,
  decision_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (status_report_id, project_id) references public.status_reports (id, project_id) on delete cascade,
  foreign key (decision_id, workspace_id) references public.decisions (id, workspace_id) on delete cascade,
  foreign key (created_by) references public.profiles (id) on delete set null,
  primary key (status_report_id, decision_id)
);
create index status_report_decisions_workspace_idx on public.status_report_decisions (workspace_id, organisation_id);
create index status_report_decisions_organisation_idx on public.status_report_decisions (organisation_id);
create index status_report_decisions_project_idx on public.status_report_decisions (project_id, workspace_id);
create index status_report_decisions_report_idx on public.status_report_decisions (status_report_id, project_id);
create index status_report_decisions_decision_idx on public.status_report_decisions (decision_id, workspace_id);
create index status_report_decisions_created_by_idx on public.status_report_decisions (created_by);
create trigger status_report_decisions_00_tenant_guard before insert or update on public.status_report_decisions
  for each row execute function private.tenant_guard('status_report_id', 'status_reports');

-- A report asks for Pending decisions of its own project (or of its programme / portfolio).
-- Links are editable while the report is a draft and frozen once it is submitted (like its
-- evidence); submit_status_report writes the links of a report it submits (as the owner).
create function private.status_report_decision_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d record;
  report_status public.status_report_status;
begin
  select r.status into report_status from public.status_reports r
  where r.id = coalesce(new.status_report_id, old.status_report_id);
  if current_user = 'authenticated' and report_status = 'submitted' then
    raise exception 'This report has been submitted; its decisions needed can''t be changed.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.decision_id is distinct from old.decision_id
    or new.status_report_id is distinct from old.status_report_id) then
    raise exception 'Remove the link and add another instead.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;
  select dd.ref, dd.status, dd.project_id into d from public.decisions dd where dd.id = new.decision_id;
  if d.project_id is not null and d.project_id <> new.project_id then
    raise exception '% belongs to another project.', d.ref using errcode = '23514';
  end if;
  if d.status <> 'pending' then
    raise exception '% is % and no longer needs a decision.', d.ref, d.status using errcode = '23514';
  end if;
  new.created_by := (select auth.uid());
  new.created_at := now();
  return new;
end;
$$;
revoke all on function private.status_report_decision_rules() from public, anon;
create trigger status_report_decisions_10_rules before insert or update or delete on public.status_report_decisions
  for each row execute function private.status_report_decision_rules();
create trigger status_report_decisions_audit after insert or update or delete on public.status_report_decisions
  for each row execute function private.audit_row_change();

alter table public.status_report_decisions enable row level security;
revoke all on public.status_report_decisions from anon, authenticated;
grant select, insert, update, delete on public.status_report_decisions to authenticated;
create policy status_report_decisions_select on public.status_report_decisions for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy status_report_decisions_insert on public.status_report_decisions for insert to authenticated
  with check (project_id = any ((select private.my_editable_project_ids())::uuid[]));
create policy status_report_decisions_update on public.status_report_decisions for update to authenticated
  using (project_id = any ((select private.my_editable_project_ids())::uuid[]))
  with check (project_id = any ((select private.my_editable_project_ids())::uuid[]));
create policy status_report_decisions_delete on public.status_report_decisions for delete to authenticated
  using (project_id = any ((select private.my_editable_project_ids())::uuid[]));

-- Saves a status report and its decision links in one transaction, then the report is
-- submitted (and the links frozen with it).
--   * p_report_id null: inserts a new report as submitted for p_project_id.
--   * p_report_id set: a draft of p_project_id; its fields are updated from p_report and it
--     becomes submitted. Its links are the draft's own (edited while it is a draft) plus any
--     in p_decision_ids not yet linked; a draft link missing from p_decision_ids is refused
--     ("remove it from the draft first") rather than dropped silently.
-- p_report keys (all optional except the five health ratings): reporting_date, submitter_id,
-- overall, schedule, financial, effort, issue, declared_benefit, accomplished, planned,
-- comments, decisions_needed (legacy notes), override_reasons, ai_draft. Evidence and
-- submitted_at are captured by the existing status report trigger, not sent.
create function public.submit_status_report(
  p_project_id uuid,
  p_report jsonb,
  p_decision_ids uuid[] default '{}',
  p_report_id uuid default null,
  p_expected_updated_at timestamptz default null
)
returns public.status_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.status_reports;
  v_org uuid;
  extra text;
begin
  if p_project_id is null or not (p_project_id = any (private.my_editable_project_ids())) then
    raise exception 'You can''t submit a status report for this project.' using errcode = '42501';
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'The report is missing.' using errcode = '22023';
  end if;
  select organisation_id into v_org from public.projects where id = p_project_id;

  if p_report_id is null then
    insert into public.status_reports (
      project_id, reporting_date, submitter_id, status, overall, schedule, financial, effort, issue,
      declared_benefit, accomplished, planned, comments, decisions_needed, override_reasons, ai_draft)
    values (
      p_project_id,
      coalesce(nullif(p_report ->> 'reporting_date', '')::date, private.org_today(v_org)),
      nullif(p_report ->> 'submitter_id', '')::uuid,
      'submitted',
      coalesce(nullif(p_report ->> 'overall', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'schedule', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'financial', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'effort', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'issue', '')::public.health, 'not_set'),
      coalesce(nullif(p_report ->> 'declared_benefit', '')::public.health, 'not_set'),
      p_report ->> 'accomplished', p_report ->> 'planned', nullif(p_report ->> 'comments', ''),
      nullif(p_report ->> 'decisions_needed', ''),
      coalesce(p_report -> 'override_reasons', '{}'::jsonb), p_report -> 'ai_draft')
    returning * into r;
  else
    select * into r from public.status_reports where id = p_report_id for update;
    if r.id is null or r.project_id <> p_project_id then
      raise exception 'That report isn''t on this project.' using errcode = '42501';
    end if;
    if p_expected_updated_at is not null and r.updated_at is distinct from p_expected_updated_at then
      raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
    end if;
    if r.status <> 'draft' then
      raise exception '% has already been submitted.', r.ref using errcode = '22023';
    end if;
    select string_agg(d.ref, ', ' order by d.ref) into extra
    from public.status_report_decisions l join public.decisions d on d.id = l.decision_id
    where l.status_report_id = r.id and not (l.decision_id = any (coalesce(p_decision_ids, '{}')));
    if extra is not null then
      raise exception 'Remove % from the draft first, or include it.', extra using errcode = '22023';
    end if;
  end if;

  insert into public.status_report_decisions (status_report_id, decision_id, sort_order)
  select r.id, x.id, x.ord::integer
  from unnest(coalesce(p_decision_ids, '{}')) with ordinality as x(id, ord)
  where not exists (
    select 1 from public.status_report_decisions l where l.status_report_id = r.id and l.decision_id = x.id);

  if p_report_id is not null then
    update public.status_reports set
      reporting_date = coalesce(nullif(p_report ->> 'reporting_date', '')::date, reporting_date),
      submitter_id = coalesce(nullif(p_report ->> 'submitter_id', '')::uuid, submitter_id),
      overall = coalesce((p_report ->> 'overall')::public.health, overall),
      schedule = coalesce((p_report ->> 'schedule')::public.health, schedule),
      financial = coalesce((p_report ->> 'financial')::public.health, financial),
      effort = coalesce((p_report ->> 'effort')::public.health, effort),
      issue = coalesce((p_report ->> 'issue')::public.health, issue),
      declared_benefit = coalesce(nullif(p_report ->> 'declared_benefit', '')::public.health, declared_benefit),
      accomplished = coalesce(p_report ->> 'accomplished', accomplished),
      planned = coalesce(p_report ->> 'planned', planned),
      comments = case when p_report ? 'comments' then nullif(p_report ->> 'comments', '') else comments end,
      decisions_needed = case when p_report ? 'decisions_needed' then nullif(p_report ->> 'decisions_needed', '') else decisions_needed end,
      override_reasons = coalesce(p_report -> 'override_reasons', override_reasons),
      ai_draft = case when p_report ? 'ai_draft' then p_report -> 'ai_draft' else ai_draft end,
      status = 'submitted'
    where id = r.id
    returning * into r;
  end if;
  return r;
end;
$$;
revoke all on function public.submit_status_report(uuid, jsonb, uuid[], uuid, timestamptz) from public, anon;
grant execute on function public.submit_status_report(uuid, jsonb, uuid[], uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------------------
-- 7. v_decisions: the overdue rule lives here
-- ---------------------------------------------------------------------------------------
create view public.v_decisions with (security_invoker = true) as
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
  ps.ref as pending_successor_ref
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

-- ---------------------------------------------------------------------------------------
-- 8. get_project_overview: Stage 2 definition (20261013165004) plus openDecisions and
--    latestReportDecisions. Security invoker as before, so RLS decides.
-- ---------------------------------------------------------------------------------------
create or replace function public.get_project_overview(p_project uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
with proj as (
  select p.*, pr.reporting_cadence,
    o.settings,
    private.org_today(p.organisation_id) as today,
    private.fy_start(o.settings, private.org_today(p.organisation_id)) as fy_start,
    private.financial_cutoff(p.organisation_id) as cutoff_month
  from public.v_projects p
  join public.projects pr on pr.id = p.id
  join public.organisations o on o.id = p.organisation_id
  where p.id = p_project and p.archived_at is null
),
red_threshold as (
  select coalesce(
    (select max((band ->> 'minScore')::integer)
     from jsonb_array_elements(coalesce((select settings -> 'risk' -> 'bands' from proj), '[]'::jsonb)) band
     where (band ->> 'minScore') ~ '^\d+$'),
    15) as min_score
),
health as (
  select h.* from public.project_health_current h join proj on proj.id = h.project_id
),
milestones as (
  select
    m.id, m.ref, m.title, m.type::text as type, m.phase_id, lp.name as phase_name,
    m.baseline_date, m.forecast_date, m.actual_date,
    m.status::text as status, m.slip_days, m.slip_band, m.past_baseline,
    m.report_to_committee, m.owner_id, m.updated_at
  from public.v_milestones m
  join proj on proj.id = m.project_id
  left join public.lifecycle_phases lp on lp.id = m.phase_id
),
markers as (
  select m.id, m.title, m.type, m.report_to_committee, m.baseline_date,
    coalesce(m.actual_date, m.forecast_date) as date
  from milestones m
  where m.type = 'gate' or m.report_to_committee
),
phases as (
  select lp.id, lp.name, lp.short_name, lp.gate_name, lp.sort_order
  from public.lifecycle_phases lp
  join proj on proj.organisation_id = lp.organisation_id
),
financials as (
  select f.budget, f.has_baseline, f.baseline_version, f.budget_phased, f.phasing_gap,
    f.actuals_through, f.actual_to_date, f.actual_open_months, f.forecast_remaining, f.eac,
    f.variance, f.variance_percent, f.open_month_overrun, f.overrun_month
  from public.v_project_financials f
  join proj on proj.id = f.project_id
),
money_by_month as (
  select fv.project_id, fv.period_month as month, fv.kind::text as kind, sum(fv.amount) as amount
  from public.financial_values fv
  join proj on proj.id = fv.project_id
  group by fv.project_id, fv.period_month, fv.kind
),
forecast_history as (
  select ffh.project_id, ffh.reporting_month as month, ffh.budget, ffh.eac,
    ffh.actual_to_date, ffh.source::text as source
  from public.financial_forecast_history ffh
  join proj on proj.id = ffh.project_id
),
submitted as (
  select r.*
  from public.status_reports r
  join proj on proj.id = r.project_id
  where r.status = 'submitted'
),
project_snaps as (
  select distinct on (date_trunc('month', hs.snapshot_date))
    hs.project_id,
    date_trunc('month', hs.snapshot_date)::date as month,
    hs.snapshot_date,
    hs.overall::text as overall, hs.schedule::text as schedule, hs.financial::text as financial,
    hs.effort::text as effort, hs.issue::text as issue, hs.benefit::text as benefit,
    hs.source
  from public.health_snapshots hs
  join proj on proj.id = hs.project_id
  where proj.start_date is null or hs.snapshot_date >= date_trunc('month', proj.start_date)::date
  order by date_trunc('month', hs.snapshot_date), hs.snapshot_date desc
),
project_snaps_declared as (
  select s.*,
    d.overall::text as declared_overall, d.schedule::text as declared_schedule,
    d.financial::text as declared_financial, d.effort::text as declared_effort,
    d.issue::text as declared_issue, d.declared_benefit::text as declared_benefit,
    d.reporting_date as declared_report_date
  from project_snaps s
  left join lateral (
    select r.overall, r.schedule, r.financial, r.effort, r.issue, r.declared_benefit, r.reporting_date
    from submitted r
    where r.reporting_date <= (s.month + interval '1 month' - interval '1 day')::date
    order by r.reporting_date desc, r.submitted_at desc
    limit 1
  ) d on true
),
latest_report as (
  select r.id, r.ref, r.reporting_date, r.submitter_id, res.name as author, r.submitted_at,
    r.comments, r.accomplished, r.planned, r.decisions_needed,
    r.overall::text as declared_overall, r.schedule::text as declared_schedule,
    r.financial::text as declared_financial, r.effort::text as declared_effort,
    r.issue::text as declared_issue, r.declared_benefit::text as declared_benefit,
    r.evidenced_overall::text as evidenced_overall, r.evidenced_schedule::text as evidenced_schedule,
    r.evidenced_financial::text as evidenced_financial, r.evidenced_effort::text as evidenced_effort,
    r.evidenced_issue::text as evidenced_issue, r.evidenced_benefit::text as evidenced_benefit,
    r.source
  from submitted r
  left join public.resources res on res.id = r.submitter_id
  order by r.reporting_date desc, r.submitted_at desc
  limit 1
),
open_raid as (
  select 'risk' as kind, r.id, r.ref, r.title, r.score::integer as score, r.probability::integer as probability,
    r.impact::integer as impact, null::text as severity, r.review_date, r.owner_id, r.created_at, r.updated_at
  from public.risks r join proj on proj.id = r.project_id
  where r.status = 'open'
  union all
  select 'issue', i.id, i.ref, i.title, null, null, null, i.severity::text, null::date, i.owner_id,
    i.created_at, i.updated_at
  from public.issues i join proj on proj.id = i.project_id
  where i.status = 'open'
),
all_risks as (
  select r.id, r.project_id, r.title, r.score, r.created_at, r.closed_at, r.status::text as status
  from public.risks r join proj on proj.id = r.project_id
),
tasks_due as (
  select w.project_id, date_trunc('month', w.finish_date)::date as month,
    count(*) as due, count(*) filter (where w.status = 'done') as done_by_due
  from public.v_work_items w join proj on proj.id = w.project_id
  where w.finish_date is not null
  group by 1, 2
),
tasks_done as (
  select w.project_id, date_trunc('month', w.done_at)::date as month, count(*) as done
  from public.v_work_items w join proj on proj.id = w.project_id
  where w.done_at is not null
  group by 1, 2
),
linked_items as (
  select cp.capability_id, null::uuid as benefit_id
  from public.capability_projects cp join proj on proj.id = cp.project_id
  union
  select null::uuid, bp.benefit_id
  from public.benefit_projects bp join proj on proj.id = bp.project_id
),
pathway_month_end as (
  select distinct on (coalesce(ps.capability_id::text, ps.benefit_id::text), date_trunc('month', ps.snapshot_date))
    date_trunc('month', ps.snapshot_date)::date as month, ps.snapshot_date, ps.programme_id,
    ps.capability_id, ps.outcome_id, ps.benefit_id, ps.rag::text as rag, ps.phase::text as phase,
    ps.is_complete, ps.due_in_fy, ps.realised_value, ps.fy_profile_value
  from public.pathway_snapshots ps
  join linked_items li on li.capability_id = ps.capability_id or li.benefit_id = ps.benefit_id
  order by coalesce(ps.capability_id::text, ps.benefit_id::text), date_trunc('month', ps.snapshot_date),
    ps.snapshot_date desc
),
pathway_targets as (
  select c.id as capability_id, null::uuid as outcome_id, c.target_date, c.status::text as status
  from public.capabilities c
  join linked_items li on li.capability_id = c.id
  where c.archived_at is null
),
committee_dates as (
  select cp.meeting_date as date, cp.title
  from public.committee_packs cp
  join proj on proj.workspace_id = cp.workspace_id
),
-- D1: open decisions with the overdue rule from v_decisions, and the decisions the latest
-- submitted report asked for (status_report_decisions).
open_decisions as (
  select d.id, d.ref, d.title, d.needed_by_date, d.overdue, d.days_overdue, d.deferral_count,
    d.decision_maker_id, lv.label as forum
  from public.v_decisions d
  join proj on proj.id = d.project_id
  left join public.lookup_values lv on lv.id = d.forum_id
  where d.status = 'pending'
),
latest_report_decisions as (
  select d.id, d.ref, d.title, d.status::text as status, d.needed_by_date, d.decision_date,
    d.overdue, srd.sort_order
  from public.status_report_decisions srd
  join latest_report r on r.id = srd.status_report_id
  join public.v_decisions d on d.id = srd.decision_id
)
select jsonb_build_object(
  'asOf', (select computed_at from health),
  'today', proj.today,
  'fyStart', proj.fy_start,
  'cutoffMonth', proj.cutoff_month,
  'redRiskMinScore', (select min_score from red_threshold),
  'project', jsonb_build_object(
    'id', proj.id, 'code', proj.code, 'name', proj.name, 'workspace_id', proj.workspace_id,
    'programme_id', proj.programme_id, 'effective_portfolio_id', proj.effective_portfolio_id,
    'state', proj.state, 'tier', proj.tier, 'priority', proj.priority,
    'start_date', proj.start_date, 'finish_date', proj.finish_date,
    'baseline_finish_date', proj.baseline_finish_date,
    'phase_id', proj.phase_id, 'phase_index', proj.phase_index, 'phase_count', proj.phase_count,
    'reporting_cadence', proj.reporting_cadence,
    'manager_id', proj.manager_id, 'project_officer_id', proj.project_officer_id,
    'sponsor_id', proj.sponsor_id, 'updated_at', proj.updated_at),
  'health', (select to_jsonb(h) from health h),
  'milestones', coalesce((select jsonb_agg(to_jsonb(m) order by m.baseline_date, m.title) from milestones m), '[]'::jsonb),
  'markers', coalesce((select jsonb_agg(to_jsonb(k) order by k.date) from markers k), '[]'::jsonb),
  'phases', coalesce((select jsonb_agg(to_jsonb(ph) order by ph.sort_order) from phases ph), '[]'::jsonb),
  'financials', (select to_jsonb(f) from financials f),
  'moneyByMonth', coalesce((select jsonb_agg(to_jsonb(m) order by m.month, m.kind) from money_by_month m), '[]'::jsonb),
  'forecastHistory', coalesce((select jsonb_agg(to_jsonb(f) order by f.month) from forecast_history f), '[]'::jsonb),
  'projectSnapshots', coalesce((select jsonb_agg(to_jsonb(s) order by s.month) from project_snaps_declared s), '[]'::jsonb),
  'latestReport', (select to_jsonb(r) from latest_report r),
  'openRaid', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from open_raid x), '[]'::jsonb),
  'riskBands', coalesce(proj.settings -> 'risk' -> 'bands', '[]'::jsonb),
  'risks', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from all_risks r), '[]'::jsonb),
  'tasksByMonth', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'projectId', d.project_id, 'month', d.month, 'due', d.due, 'doneByDue', d.done_by_due,
        'done', coalesce(dd.done, 0)) order by d.month)
     from tasks_due d left join tasks_done dd on dd.project_id = d.project_id and dd.month = d.month),
    '[]'::jsonb),
  'pathwayMonthEnd', coalesce((select jsonb_agg(to_jsonb(pm) order by pm.month) from pathway_month_end pm), '[]'::jsonb),
  'pathwayTargets', coalesce((select jsonb_agg(to_jsonb(pt)) from pathway_targets pt), '[]'::jsonb),
  'committeeDates', coalesce((select jsonb_agg(to_jsonb(c) order by c.date) from committee_dates c), '[]'::jsonb),
  'openDecisions', coalesce((select jsonb_agg(to_jsonb(od) order by od.needed_by_date nulls last, od.ref) from open_decisions od), '[]'::jsonb),
  'latestReportDecisions', coalesce((select jsonb_agg(to_jsonb(rd) order by rd.sort_order, rd.ref) from latest_report_decisions rd), '[]'::jsonb)
)
from proj
$$;
revoke all on function public.get_project_overview(uuid) from public, anon;
grant execute on function public.get_project_overview(uuid) to authenticated;

-- DRY RUN (final, 14/10/2026, one transaction, rolled back). Member = the test contributor
-- (project editor); "PMO" = the same member promoted to workspace PMO inside the transaction
-- only; outsider = the other organisation's admin. All checks behaved as intended:
--    0 backfill: 8 made events, 1 superseded event, decided_by on 8; 3 overdue (DEC-004/005/008)
--    1 member creates a Pending decision (DEC-017)               ok
--    2 member inserts a decision as Made                          refused
--    3 member edits a Pending decision                            ok; 'edited' event (title,
--                                                                 needed_by_date; old -> new)
--    4 member sets status = made directly                         refused
--    5-6 member records / defers DEC-004 (not maker, not PMO)    refused
--    7 decision maker with a login records their decision         ok; decided_by = them,
--                                                                 recorded_by = their account
--    8-9 member edits a Made decision / adds an option            refused (read-only)
--   10 member progresses an action of a Made decision             ok
--   11 member supersedes DEC-007                                  DEC-018 Pending, options copied,
--                                                                 DEC-007 Made, pending_successor
--                                                                 DEC-018
--   12 second successor for DEC-007                               refused
--   13 withdraw DEC-018 with a blank reason                       refused
--   14 member withdraws DEC-018                                   Withdrawn + event; DEC-007 still
--                                                                 Made, no pending successor, not
--                                                                 superseded (released)
--   15 member edits the Withdrawn DEC-018                         refused (frozen)
--   16 member proposes a new replacement                          DEC-019, pending_successor DEC-019
--   17 member reverses DEC-001                                    refused
--   18 link a SUBMITTED report to DEC-004                         refused (frozen)
--   19 draft report: link DEC-004, reorder                        ok (draft links editable)
--   20-21 draft link to another project's / a Made decision       refused
--   22 submit the draft without its linked DEC-004                refused ("Remove DEC-004 from
--                                                                 the draft first, or include it")
--   23 submit_status_report: draft -> submitted                   submitted, evidence captured,
--                                                                 1 link, legacy note kept
--   24-25 reorder / add links after submit                        refused (frozen)
--   26 submit_status_report: new report inserted as submitted     first run: failed (omitted
--                                                                 declared_benefit sent as null);
--                                                                 fixed (omitted ratings default
--                                                                 to not_set) and rerun: SR-003
--                                                                 submitted, evidence captured,
--                                                                 1 link, links then frozen;
--                                                                 a draft submitted with text only
--                                                                 keeps its health ratings
--   27 member links DEC-004 to a milestone                        ok
--   28 get_project_overview(VDI) as member                        openDecisions DEC-004 (overdue),
--                                                                 latestReportDecisions DEC-004
--   29 member inserts into decision_events                        refused (no grant)
--   30 PMO defers DEC-004 (+14 days)                              Pending, Deferred x1, not overdue
--   31 PMO records DEC-003 without saying who decided             decided_by = the forum
--   32 PMO records DEC-019                                        DEC-007 Superseded by DEC-019, no
--                                                                 pending successor
--   33-34 PMO reverses DEC-001 blank / with a rationale           refused / Reversed + event
--   35 outsider reads decisions, v_decisions, events, links       0 rows each
--   36-39 outsider records, supersedes, withdraws, submits        refused
--   40 outsider get_project_overview(VDI)                         null

-- RLS TESTS AFTER APPLY (14/10/2026), live schema:
--   REST as the real member and outsider logins (reads, and writes refused before anything is
--   written): 37/37 as intended. Member reads 16 decisions and 9 events; Made DEC-001 can't be
--   edited, recorded, deferred or withdrawn; submitted SR-001 can't take links. Outsider reads
--   0 everywhere, get_project_overview(ARB) is null, every RPC refuses 42501.
--   SQL, one transaction rolled back, member (contributor) then promoted to PMO in-transaction,
--   then outsider: 22/22 as intended (create and edit Pending, Made refused on insert and plain
--   update, record_decision refused for a contributor, draft links editable, submit freezes
--   them, gate tick sets ticked_by/at, non-gate tick refused, withdraw then frozen; as PMO
--   record defaults to the forum, supersede keeps the original Made with pending_successor,
--   withdrawing the successor releases it, reverse; outsider sees 0 and is refused). Row counts
--   unchanged afterwards.
