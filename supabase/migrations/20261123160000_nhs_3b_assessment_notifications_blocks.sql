-- NHS-3 part 3: sign-off notifications for impact assessments and three report blocks
-- (docs/nhs-module-plan.md § NHS-3 item 9, docs/sql/nhs-3b-assessment-notifications-blocks.sql).
-- Written by an unattended run on 23/11/2026: tested on the local Postgres only, NOT applied to
-- production. Apply after 20261123140000_nhs_3_impact_assessments.
--
-- Section 0 widens two CHECK constraints on public.notifications (drop + add, no data change).
-- On production run section 0 of docs/sql/nhs-3b-assessment-notifications-blocks.sql by hand
-- first; here it only runs where the constraint doesn't allow the new kinds yet (a fresh
-- database), as GL-14a did. Everything else is additive: new functions and triggers, and three
-- functions replaced with their previous body plus one change each:
--   private.notification_event_label (two labels), public.set_my_notification_preferences (two
--   kinds accepted) and private.partner_unsafe_blocks (three blocks added).
--
-- Design
-- - Two notification kinds:
--   * assessment_signoff (entity approval_step): raised for each undecided step of an assessment
--     awaiting sign-off, to the holders (and deputies) of the step's governance role who can
--     decide it (workspace contributor or above, or organisation PMO / admin; NHS-0 D4). Resolved
--     when the step is decided, the assessment leaves review, or the person stops holding the
--     role. Assigning a role while an assessment waits notifies the new holder.
--   * assessment_decided (entity impact_assessment): to whoever submitted and created the
--     assessment when it is approved (with or without conditions), rejected or returned for
--     revision; written from impact_assessment_decisions, so only decide_impact_assessment raises
--     it. A later decision resolves the earlier one.
--   Sample assessments raise nothing; with the module off nothing new is raised. Organisations
--   switch either event off in Settings › Notifications like any other ("Impact assessment
--   awaiting my sign-off", "Impact assessment decided"); people narrow them per channel.
--   The triggers never fail the user's write (errors become warnings), as GL-13's do.
-- - Report blocks (RB-10 contract, partner-unsafe, owned by the impact_assessment module in
--   src/lib/modules.ts): impact_assessment_status, impact_assessments_awaiting and
--   impact_negative_impacts. They cover assessments of the report's projects and of the
--   programmes in scope (private.rb_scope_programmes); review dates and waiting days use the
--   report's as-at date. Not added to the NHS-1 committee templates: a template is hidden while
--   any of its blocks belongs to a module that is off, so adding them would hide the Quality
--   Committee template from organisations with board assurance but not impact assessments.

-- ---------------------------------------------------------------------------------------------
-- 0. Wider kind and entity type checks (run by hand first on production; here only where needed)
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint k where k.conrelid = 'public.notifications'::regclass
                 and k.conname = 'notifications_kind_check'
                 and pg_get_constraintdef(k.oid) like '%assessment_signoff%') then
    alter table public.notifications drop constraint if exists notifications_kind_check,
      add constraint notifications_kind_check check (kind in (
        'task_overdue', 'task_issued', 'decision_due', 'decision_recorded',
        'measurement_overdue', 'dependency_off_track', 'pack_drafted',
        'assessment_signoff', 'assessment_decided'));
  end if;
  if not exists (select 1 from pg_constraint k where k.conrelid = 'public.notifications'::regclass
                 and k.conname = 'notifications_entity_type_check'
                 and pg_get_constraintdef(k.oid) like '%approval_step%') then
    alter table public.notifications drop constraint if exists notifications_entity_type_check,
      add constraint notifications_entity_type_check check (entity_type in (
        'work_item', 'work_item_offer', 'decision', 'benefit_measure', 'dependency', 'report',
        'approval_step', 'impact_assessment'));
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. Settings: labels and personal preferences for the new kinds
-- ---------------------------------------------------------------------------------------------

-- Previous body (GL-13) plus the two NHS-3 labels.
create or replace function private.notification_event_label(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'task_overdue' then 'Task overdue'
    when 'task_issued' then 'Task issued to me'
    when 'decision_due' then 'Decision needed by date approaching'
    when 'decision_recorded' then 'Decision recorded'
    when 'measurement_overdue' then 'Measurement overdue'
    when 'dependency_off_track' then 'Dependency off track'
    when 'pack_drafted' then 'Draft pack ready'
    when 'assessment_signoff' then 'Impact assessment awaiting my sign-off'
    when 'assessment_decided' then 'Impact assessment decided'
  end;
$$;
revoke execute on function private.notification_event_label(text) from public, anon, authenticated;

-- Previous body (GL-13); the two NHS-3 kinds are accepted.
-- A person's own preferences: { digest?: immediate|daily|weekly|off|null, inApp?: {kind: bool},
-- email?: {kind: bool} }. Merged into profiles.preferences -> 'notifications'; a null digest
-- clears the choice (back to the organisation's default). Profiles have no read-only trigger.
create or replace function public.set_my_notification_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current jsonb;
  v_next jsonb;
  v_channel text;
  v_key text;
  v_value jsonb;
  v_kinds text[] := array['task_overdue', 'task_issued', 'decision_due', 'decision_recorded',
                          'measurement_overdue', 'dependency_off_track', 'pack_drafted',
                          'assessment_signoff', 'assessment_decided'];
begin
  if v_uid is null then
    raise exception 'Sign in to change your notification settings.' using errcode = '42501';
  end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'Notification settings must be an object.' using errcode = '22023';
  end if;
  select coalesce(preferences -> 'notifications', '{}'::jsonb) into v_current
  from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(v_current) <> 'object' then v_current := '{}'::jsonb; end if;
  v_next := v_current;
  for v_key in select jsonb_object_keys(p_preferences) loop
    if v_key not in ('digest', 'inApp', 'email') then
      raise exception 'Unknown notification setting: %', v_key using errcode = '22023';
    end if;
  end loop;
  if p_preferences ? 'digest' then
    v_value := p_preferences -> 'digest';
    if jsonb_typeof(v_value) = 'null' then
      v_next := v_next - 'digest';
    elsif jsonb_typeof(v_value) = 'string' and v_value #>> '{}' in ('immediate', 'daily', 'weekly', 'off') then
      v_next := jsonb_set(v_next, '{digest}', v_value);
    else
      raise exception 'Digest must be immediate, daily, weekly or off.' using errcode = '22023';
    end if;
  end if;
  foreach v_channel in array array['inApp', 'email'] loop
    if p_preferences ? v_channel then
      if jsonb_typeof(p_preferences -> v_channel) <> 'object' then
        raise exception '% must be an object of kinds.', v_channel using errcode = '22023';
      end if;
      for v_key, v_value in select * from jsonb_each(p_preferences -> v_channel) loop
        if not (v_key = any (v_kinds)) or jsonb_typeof(v_value) <> 'boolean' then
          raise exception 'Unknown notification kind or value: %', v_key using errcode = '22023';
        end if;
        v_next := jsonb_set(v_next, array[v_channel],
          coalesce(case when jsonb_typeof(v_next -> v_channel) = 'object' then v_next -> v_channel end, '{}'::jsonb)
            || jsonb_build_object(v_key, v_value));
      end loop;
    end if;
  end loop;
  update public.profiles
  set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{notifications}', v_next),
      updated_at = now()
  where id = v_uid;
  return v_next;
end;
$$;
revoke execute on function public.set_my_notification_preferences(jsonb) from public, anon;
grant execute on function public.set_my_notification_preferences(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Sign-off notifications
-- ---------------------------------------------------------------------------------------------

-- Where an assessment is opened in the app: the project's Plan › Gates tab or the programme's
-- Status tab, else the register.
create function private.impact_assessment_link(p_project uuid, p_programme uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select '/portfolio/projects/' || p.code || '?tab=plan&sub=gates' from public.projects p
      where p.id = p_project and p.code ~ '^[A-Za-z0-9_.-]{1,60}$'),
    (select '/portfolio/programmes/' || g.id || '?tab=status' from public.programmes g where g.id = p_programme),
    '/governance/impact-assessments');
$$;

-- How an assessment is named in a notification: its title, with "(CODE)" or the programme's name
-- added when the title doesn't already name the target.
create function private.impact_assessment_label(p_title text, p_project uuid, p_programme uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when t.name is null or strpos(coalesce(p_title, ''), t.name) > 0 then coalesce(nullif(p_title, ''), t.name, 'An impact assessment')
              else coalesce(nullif(p_title, ''), 'Impact assessment') || ' (' || t.ref || ')' end
  from (select coalesce((select p.name from public.projects p where p.id = p_project),
                        (select g.name from public.programmes g where g.id = p_programme)) as name,
               coalesce((select p.code from public.projects p where p.id = p_project),
                        (select g.name from public.programmes g where g.id = p_programme)) as ref) t;
$$;

-- Brings one assessment's sign-off notifications up to date: resolves those that no longer apply
-- and raises one for each eligible holder of each undecided step's role. Idempotent.
create function private.sync_impact_assessment_signoff(p_assessment uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.impact_assessments;
  v_org uuid;
  s record;
  v_n integer := 0;
  v_label text;
  v_link text;
begin
  select * into a from public.impact_assessments where id = p_assessment;
  v_org := coalesce(a.organisation_id,
                    (select g.organisation_id from public.approval_gates g
                      where g.entity_type = 'impact_assessment' and g.entity_id = p_assessment limit 1));
  if v_org is null then
    return 0;
  end if;

  update public.notifications n set resolved_at = now()
  where n.organisation_id = v_org and n.kind = 'assessment_signoff' and n.resolved_at is null
    and n.entity_id in (select st.id from public.approval_steps st
                        join public.approval_gates g on g.id = st.gate_id
                        where g.entity_type = 'impact_assessment' and g.entity_id = p_assessment)
    and not exists (
      select 1 from public.approval_steps st
      where st.id = n.entity_id and st.decision is null and st.gate_id = a.gate_id
        and a.status = 'in_review'
        and private.holds_governance_role(v_org, st.governance_role, n.recipient_id));

  if a.id is null or a.status <> 'in_review' or a.gate_id is null or a.is_sample
     or not private.module_enabled(a.organisation_id, 'impact_assessment') then
    return 0;
  end if;
  v_label := private.impact_assessment_label(a.title, a.project_id, a.programme_id);
  v_link := private.impact_assessment_link(a.project_id, a.programme_id);
  for s in
    select st.id, st.governance_role, st.required_role
    from public.approval_steps st
    where st.gate_id = a.gate_id and st.decision is null and st.governance_role is not null
    order by st.step_order
  loop
    v_n := v_n + private.raise_notification(a.organisation_id, a.workspace_id,
      (select coalesce(array_agg(h.profile_id), '{}') from public.governance_role_holders h
        where h.organisation_id = a.organisation_id and h.role_key = s.governance_role
          and (exists (select 1 from public.workspace_members wm
                       where wm.workspace_id = a.workspace_id and wm.profile_id = h.profile_id
                         and wm.role >= 'contributor')
               or exists (select 1 from public.organisation_members om
                          where om.organisation_id = a.organisation_id and om.profile_id = h.profile_id
                            and om.role >= 'pmo'))),
      'assessment_signoff', 'approval_step', s.id,
      format('“%s” is waiting for your sign-off as %s.', v_label, s.required_role),
      v_link, coalesce(a.submitted_at::date, private.org_today(a.organisation_id)));
  end loop;
  return v_n;
end;
$$;

-- impact_assessments: status or gate changed (submitted, decided, returned, flagged), or deleted.
create function private.notify_impact_assessment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.sync_impact_assessment_signoff(coalesce(new.id, old.id));
  exception when others then
    raise warning 'notify_impact_assessment_status: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
create trigger zz_notify_impact_assessment after update of status, gate_id on public.impact_assessments
  for each row when (old.status is distinct from new.status or old.gate_id is distinct from new.gate_id)
  execute function private.notify_impact_assessment_status();
create trigger zz_notify_impact_assessment_delete after delete on public.impact_assessments
  for each row execute function private.notify_impact_assessment_status();

-- approval_steps: a step of an impact assessment gate was decided.
create function private.notify_impact_assessment_step()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment uuid;
begin
  begin
    select g.entity_id into v_assessment from public.approval_gates g
     where g.id = new.gate_id and g.gate_type = 'impact_assessment' and g.entity_type = 'impact_assessment';
    if v_assessment is not null then
      perform private.sync_impact_assessment_signoff(v_assessment);
    end if;
  exception when others then
    raise warning 'notify_impact_assessment_step: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
create trigger zz_notify_impact_assessment_step after update of decision on public.approval_steps
  for each row when (old.decision is distinct from new.decision)
  execute function private.notify_impact_assessment_step();

-- governance_role_holders: someone gained or lost a role while assessments wait for it.
create function private.notify_governance_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  begin
    for r in
      select distinct a.id
      from public.impact_assessments a
      join public.approval_steps st on st.gate_id = a.gate_id and st.decision is null
      where a.organisation_id = coalesce(new.organisation_id, old.organisation_id)
        and a.status = 'in_review'
        and st.governance_role in (new.role_key, old.role_key)
    loop
      perform private.sync_impact_assessment_signoff(r.id);
    end loop;
  exception when others then
    raise warning 'notify_governance_role_change: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
create trigger zz_notify_governance_role_change after insert or update or delete on public.governance_role_holders
  for each row execute function private.notify_governance_role_change();

-- impact_assessment_decisions: tell the submitter and the author the outcome. An intermediate
-- approval (other steps still open) raises nothing.
create function private.notify_impact_assessment_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.impact_assessments;
  v_outcome text;
begin
  begin
    select * into a from public.impact_assessments where id = new.assessment_id;
    if a.id is null or a.is_sample or not private.module_enabled(a.organisation_id, 'impact_assessment') then
      return null;
    end if;
    v_outcome := case
      when new.decision = 'returned' then 'was returned for revision'
      when new.decision = 'rejected' then 'was rejected'
      when a.status = 'approved' and exists (
             select 1 from public.impact_assessment_decisions d
             where d.assessment_id = a.id and d.version = new.version and d.decision = 'approved_with_conditions')
        then 'was approved with conditions'
      when a.status = 'approved' then 'was approved'
    end;
    if v_outcome is null then
      return null;
    end if;
    update public.notifications set resolved_at = now()
     where organisation_id = a.organisation_id and kind = 'assessment_decided' and entity_id = a.id
       and resolved_at is null;
    perform private.raise_notification(a.organisation_id, a.workspace_id,
      array_remove(array[a.submitted_by, a.created_by], null), 'assessment_decided', 'impact_assessment', a.id,
      format('“%s” %s.', private.impact_assessment_label(a.title, a.project_id, a.programme_id), v_outcome),
      private.impact_assessment_link(a.project_id, a.programme_id),
      private.org_today(a.organisation_id), new.decided_by);
  exception when others then
    raise warning 'notify_impact_assessment_decided: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
create trigger zz_notify_impact_assessment_decided after insert on public.impact_assessment_decisions
  for each row execute function private.notify_impact_assessment_decided();

revoke execute on function private.impact_assessment_link(uuid, uuid), private.impact_assessment_label(text, uuid, uuid),
  private.sync_impact_assessment_signoff(uuid), private.notify_impact_assessment_status(),
  private.notify_impact_assessment_step(), private.notify_governance_role_change(),
  private.notify_impact_assessment_decided()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Report blocks
-- ---------------------------------------------------------------------------------------------

-- Assessments of the report's projects and of the programmes in scope, in the report's
-- organisation, with their sign-off progress on the as-at date.
create function private.rb_impact_rows(ctx jsonb)
returns table (
  id uuid, entity_type text, target text, project_code text, title text, status text, version integer,
  full_required boolean, max_score integer, review_date date, review_overdue boolean,
  submitted_on date, approved_on date, steps_total integer, steps_approved integer, pending_roles text[],
  has_conditions boolean, is_sample boolean, template jsonb, screening jsonb, quality jsonb, equality jsonb)
language sql
stable
set search_path = ''
as $$
  with scope as (select private.rb_projects(ctx) as projects, private.rb_scope_programmes(ctx) as programmes)
  select a.id, a.entity_type, coalesce(p.code || ' ' || p.name, g.name), p.code, a.title, a.status, a.version,
    a.full_required, a.screening_max_score, a.review_date,
    a.status = 'approved' and a.review_date < (ctx ->> 'as_at')::date,
    a.submitted_at::date, a.approved_at::date,
    (select count(*) from public.approval_steps st where st.gate_id = a.gate_id)::integer,
    (select count(*) from public.approval_steps st where st.gate_id = a.gate_id and st.decision = 'approved')::integer,
    case when a.status = 'in_review' then
      (select coalesce(array_agg(st.required_role order by st.step_order), '{}') from public.approval_steps st
        where st.gate_id = a.gate_id and st.decision is null) else '{}'::text[] end,
    exists (select 1 from public.impact_assessment_decisions d
            where d.assessment_id = a.id and d.version = a.version and d.decision = 'approved_with_conditions'),
    a.is_sample, a.template, a.screening, a.quality, a.equality
  from public.impact_assessments a
  cross join scope
  left join public.projects p on p.id = a.project_id
  left join public.programmes g on g.id = a.programme_id
  where a.organisation_id = nullif(ctx ->> 'organisation_id', '')::uuid
    and (a.project_id = any (scope.projects) or a.programme_id = any (scope.programmes));
$$;

-- impact_assessment_status: counts by status and the register for the scope, most urgent first,
-- plus projects in scope at or past the delivery gate without an approved assessment. Config:
-- limit (default 20), include_gaps (default true).
create function private.rb_impact_assessment_status(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (select * from private.rb_impact_rows(ctx)),
  gate as (select private.impact_assessment_gate_order(nullif(ctx ->> 'organisation_id', '')::uuid) as ord),
  gaps as (
    select p.id, p.code, p.name, l.name as phase
    from public.projects p
    join public.lifecycle_phases l on l.id = p.phase_id
    cross join gate
    where gate.ord is not null and coalesce((cfg ->> 'include_gaps')::boolean, true)
      and p.id = any (private.rb_projects(ctx))
      and p.organisation_id = nullif(ctx ->> 'organisation_id', '')::uuid
      and not p.is_sample and l.sort_order >= gate.ord
      and not exists (select 1 from public.impact_assessments a
                      where a.entity_type = 'project' and a.entity_id = p.id and a.status = 'approved')
  ),
  ordered as (
    select r.*, case r.status when 'reassessment_required' then 1 when 'rejected' then 2 when 'in_review' then 3
                              when 'draft' then 4 else 5 end as urgency
    from r
  )
  select jsonb_build_object(
    'total', (select count(*) from r),
    'counts', jsonb_build_object(
      'draft', (select count(*) from r where status = 'draft'),
      'in_review', (select count(*) from r where status = 'in_review'),
      'approved', (select count(*) from r where status = 'approved'),
      'rejected', (select count(*) from r where status = 'rejected'),
      'reassessment_required', (select count(*) from r where status = 'reassessment_required')),
    'review_overdue', (select count(*) from r where review_overdue),
    'with_conditions', (select count(*) from r where status = 'approved' and has_conditions),
    'full_required', (select count(*) from r where full_required),
    'gate_on', (select ord is not null from gate),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'entity_type', x.entity_type, 'target', x.target,
        'title', x.title, 'status', x.status, 'version', x.version, 'full_required', x.full_required,
        'max_score', x.max_score, 'steps_total', x.steps_total, 'steps_approved', x.steps_approved,
        'has_conditions', x.has_conditions, 'review_date', x.review_date, 'review_overdue', x.review_overdue,
        'is_sample', x.is_sample)
      order by x.urgency, x.review_overdue desc, x.target)
      from (select * from ordered order by urgency, review_overdue desc, target
            limit least(greatest(coalesce((cfg ->> 'limit')::integer, 20), 1), 100)) x), '[]'),
    'gaps', coalesce((select jsonb_agg(jsonb_build_object('id', gp.id, 'code', gp.code, 'name', gp.name, 'phase', gp.phase)
      order by gp.code) from gaps gp), '[]'));
$$;

-- impact_assessments_awaiting: assessments awaiting sign-off, longest waiting first, with the roles
-- still to decide. Config: limit (default 15).
create function private.rb_impact_assessments_awaiting(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (select * from private.rb_impact_rows(ctx) where status = 'in_review')
  select jsonb_build_object(
    'count', (select count(*) from r),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'target', x.target, 'title', x.title,
        'version', x.version, 'full_required', x.full_required, 'submitted_on', x.submitted_on,
        'days_waiting', greatest((ctx ->> 'as_at')::date - x.submitted_on, 0),
        'steps_total', x.steps_total, 'steps_approved', x.steps_approved, 'pending_roles', to_jsonb(x.pending_roles),
        'is_sample', x.is_sample)
      order by x.submitted_on nulls last, x.target)
      from (select * from r order by submitted_on nulls last, target
            limit least(greatest(coalesce((cfg ->> 'limit')::integer, 15), 1), 50)) x), '[]'));
$$;

-- impact_negative_impacts: each negative quality impact (the full assessment's answer where there
-- is one, else the screening answer) with its consequence × likelihood score and mitigations, and
-- each negative equality impact with its evidence and mitigation. Config: limit (default 20),
-- min_score (quality impacts below it are left out, default 0), include_equality (default true),
-- include_drafts (default false).
create function private.rb_impact_negative_impacts(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (
    select * from private.rb_impact_rows(ctx)
    where coalesce((cfg ->> 'include_drafts')::boolean, false) or status <> 'draft'
  ),
  q as (
    select r.id, r.target, r.title, r.status, d.value ->> 'label' as label, x.ans,
      nullif(private.impact_level(x.ans -> 'consequence') * private.impact_level(x.ans -> 'likelihood'), 0) as score
    from r
    cross join lateral jsonb_array_elements(r.template -> 'domains') d
    cross join lateral (
      select case when r.full_required and r.quality -> (d.value ->> 'key') ->> 'impact' is not null
                  then r.quality -> (d.value ->> 'key') else r.screening -> (d.value ->> 'key') end as ans) x
    where x.ans ->> 'impact' = 'negative'
  ),
  qf as (select * from q where coalesce(q.score, 0) >= coalesce((cfg ->> 'min_score')::integer, 0)),
  e as (
    select r.id, r.target, r.title, r.status, d.value ->> 'label' as label, r.equality -> (d.value ->> 'key') as ans
    from r
    cross join lateral jsonb_array_elements(r.template -> 'equality') d
    where coalesce((cfg ->> 'include_equality')::boolean, true)
      and r.equality -> (d.value ->> 'key') ->> 'impact' = 'negative'
  ),
  lim as (select least(greatest(coalesce((cfg ->> 'limit')::integer, 20), 1), 100) as n)
  select jsonb_build_object(
    'assessments', (select count(*) from r),
    'quality_count', (select count(*) from qf),
    'equality_count', (select count(*) from e),
    'unmitigated', (select count(*) from qf where coalesce(btrim(coalesce(qf.ans ->> 'mitigations', qf.ans ->> 'note')), '') = '')
                 + (select count(*) from e where coalesce(btrim(e.ans ->> 'mitigation'), '') = ''),
    'quality', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'target', y.target, 'title', y.title,
        'status', y.status, 'domain', y.label, 'score', y.score,
        'consequence', nullif(private.impact_level(y.ans -> 'consequence'), 0),
        'likelihood', nullif(private.impact_level(y.ans -> 'likelihood'), 0),
        'description', left(coalesce(nullif(btrim(y.ans ->> 'description'), ''), y.ans ->> 'note'), 400),
        'mitigations', left(nullif(btrim(y.ans ->> 'mitigations'), ''), 400),
        'indicators', left(nullif(btrim(y.ans ->> 'indicators'), ''), 300))
      order by y.score desc nulls last, y.target, y.label)
      from (select * from qf order by score desc nulls last, target, label limit (select n from lim)) y), '[]'),
    'equality', coalesce((select jsonb_agg(jsonb_build_object('id', z.id, 'target', z.target, 'title', z.title,
        'status', z.status, 'characteristic', z.label,
        'evidence', left(nullif(btrim(z.ans ->> 'evidence'), ''), 400),
        'mitigation', left(nullif(btrim(z.ans ->> 'mitigation'), ''), 400))
      order by z.target, z.label)
      from (select * from e order by target, label limit (select n from lim)) z), '[]'));
$$;

revoke all on function private.rb_impact_rows(jsonb), private.rb_impact_assessment_status(jsonb, jsonb),
  private.rb_impact_assessments_awaiting(jsonb, jsonb), private.rb_impact_negative_impacts(jsonb, jsonb)
  from public, anon;
grant execute on function private.rb_impact_rows(jsonb), private.rb_impact_assessment_status(jsonb, jsonb),
  private.rb_impact_assessments_awaiting(jsonb, jsonb), private.rb_impact_negative_impacts(jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Partner safety: impact assessments never reach partner organisations. Previous list (NHS-1
--    part 3) plus the three blocks.
-- ---------------------------------------------------------------------------------------------

create or replace function private.partner_unsafe_blocks()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['resource_summary', 'data_quality', 'baf_summary', 'baf_above_appetite', 'baf_linkage',
                   'assurance_by_programme', 'impact_assessment_status', 'impact_assessments_awaiting',
                   'impact_negative_impacts']; $$;
