-- APPLIED 16/10/2026 by the user from docs/sql/runbook-decision-edit-and-draft-links.sql (Block B),
-- recorded in the migration history as 20261016170000 decision_edit_and_draft_links.
-- update_pending_decision; save_status_report_draft and submit_status_report replace a draft's links.
create function public.update_pending_decision(
  p_decision_id uuid,
  p_decision jsonb default '{}'::jsonb,
  p_options jsonb default null,
  p_links jsonb default null,
  p_expected_updated_at timestamptz default null
)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.decisions;
  before_row jsonb;
  changed jsonb;
  o jsonb;
  keep uuid[] := '{}';
  n_before integer;
  n_after integer;
  kind text;
  tbl text;
  col text;
  ids uuid[];
  before_ids uuid[];
  new_id uuid;
  links_changed jsonb := '{}'::jsonb;
  allowed text[] := array['title', 'context', 'decision_maker_id', 'forum_id', 'needed_by_date',
    'impact_scope', 'impact_scope_note', 'impact_cost', 'impact_cost_note', 'impact_time',
    'impact_time_note', 'impact_benefits', 'impact_benefits_note', 'evidence_link'];
begin
  select * into d from public.decisions where id = p_decision_id for update;
  if d.id is null or not private.can_write_decision(d) then
    raise exception 'You can''t edit this decision.' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and d.updated_at is distinct from p_expected_updated_at then
    raise exception 'Changed by someone else, reload to see the latest.' using errcode = '40001';
  end if;
  if d.status <> 'pending' then
    raise exception '% is % and read-only. Supersede or reverse it to change it.', d.ref, d.status
      using errcode = '22023';
  end if;
  p_decision := coalesce(p_decision, '{}'::jsonb);
  if jsonb_typeof(p_decision) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_decision) k where not (k = any (allowed))) then
    raise exception 'Only a Pending decision''s content can be edited here.' using errcode = '22023';
  end if;
  if p_decision ? 'title' and length(btrim(coalesce(p_decision ->> 'title', ''))) = 0 then
    raise exception 'Give the decision a title.' using errcode = '22023';
  end if;
  if p_decision ? 'needed_by_date' and nullif(p_decision ->> 'needed_by_date', '') is null then
    raise exception 'Set a needed-by date.' using errcode = '22023';
  end if;

  before_row := to_jsonb(d);
  update public.decisions set
    title = case when p_decision ? 'title' then btrim(p_decision ->> 'title') else title end,
    context = case when p_decision ? 'context' then nullif(btrim(coalesce(p_decision ->> 'context', '')), '') else context end,
    decision_maker_id = case when p_decision ? 'decision_maker_id' then nullif(p_decision ->> 'decision_maker_id', '')::uuid else decision_maker_id end,
    forum_id = case when p_decision ? 'forum_id' then nullif(p_decision ->> 'forum_id', '')::uuid else forum_id end,
    needed_by_date = case when p_decision ? 'needed_by_date' then (p_decision ->> 'needed_by_date')::date else needed_by_date end,
    impact_scope = case when p_decision ? 'impact_scope' then coalesce((p_decision ->> 'impact_scope')::boolean, false) else impact_scope end,
    impact_scope_note = case when p_decision ? 'impact_scope_note' then nullif(btrim(coalesce(p_decision ->> 'impact_scope_note', '')), '') else impact_scope_note end,
    impact_cost = case when p_decision ? 'impact_cost' then coalesce((p_decision ->> 'impact_cost')::boolean, false) else impact_cost end,
    impact_cost_note = case when p_decision ? 'impact_cost_note' then nullif(btrim(coalesce(p_decision ->> 'impact_cost_note', '')), '') else impact_cost_note end,
    impact_time = case when p_decision ? 'impact_time' then coalesce((p_decision ->> 'impact_time')::boolean, false) else impact_time end,
    impact_time_note = case when p_decision ? 'impact_time_note' then nullif(btrim(coalesce(p_decision ->> 'impact_time_note', '')), '') else impact_time_note end,
    impact_benefits = case when p_decision ? 'impact_benefits' then coalesce((p_decision ->> 'impact_benefits')::boolean, false) else impact_benefits end,
    impact_benefits_note = case when p_decision ? 'impact_benefits_note' then nullif(btrim(coalesce(p_decision ->> 'impact_benefits_note', '')), '') else impact_benefits_note end,
    evidence_link = case when p_decision ? 'evidence_link' then nullif(btrim(coalesce(p_decision ->> 'evidence_link', '')), '') else evidence_link end
  where id = d.id
  returning * into d;

  select coalesce(jsonb_object_agg(n.key, jsonb_build_array(b.value, n.value)), '{}'::jsonb) into changed
  from jsonb_each(to_jsonb(d)) n join jsonb_each(before_row) b on b.key = n.key
  where n.value is distinct from b.value
    and n.key not in ('updated_at', 'created_at', 'created_by', 'organisation_id', 'workspace_id', 'ref', 'forum_list');

  -- Options: update listed ones in place, add new ones, delete the unlisted.
  if p_options is not null then
    if jsonb_typeof(p_options) <> 'array'
      or (select count(*) from jsonb_array_elements(p_options) x where length(btrim(coalesce(x ->> 'title', ''))) > 0) < 2 then
      raise exception 'Add at least two options.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_options) x
      where nullif(x ->> 'id', '') is not null
        and not exists (select 1 from public.decision_options o where o.id = (x ->> 'id')::uuid and o.decision_id = d.id)) then
      raise exception 'An option doesn''t belong to this decision.' using errcode = '22023';
    end if;
    select count(*) into n_before from public.decision_options where decision_id = d.id;
    for o in select x from jsonb_array_elements(p_options) with ordinality as e(x, ord)
      where length(btrim(coalesce(x ->> 'title', ''))) > 0 order by ord loop
      if nullif(o ->> 'id', '') is not null then
        update public.decision_options set
          title = btrim(o ->> 'title'),
          pros = coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'pros', '[]')) v where btrim(v) <> ''), '{}'),
          cons = coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'cons', '[]')) v where btrim(v) <> ''), '{}'),
          sort_order = coalesce(array_length(keep, 1), 0)
        where id = (o ->> 'id')::uuid;
        keep := keep || (o ->> 'id')::uuid;
      else
        insert into public.decision_options (decision_id, title, pros, cons, sort_order)
        values (d.id, btrim(o ->> 'title'),
          coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'pros', '[]')) v where btrim(v) <> ''), '{}'),
          coalesce(array(select btrim(v) from jsonb_array_elements_text(coalesce(o -> 'cons', '[]')) v where btrim(v) <> ''), '{}'),
          coalesce(array_length(keep, 1), 0))
        returning id into new_id;
        keep := keep || new_id;
      end if;
    end loop;
    delete from public.decision_options where decision_id = d.id and not (id = any (keep));
    select count(*) into n_after from public.decision_options where decision_id = d.id;
    changed := changed || jsonb_build_object('options', jsonb_build_array(n_before, n_after));
  end if;

  -- Links: each listed kind is set exactly.
  if p_links is not null then
    if jsonb_typeof(p_links) <> 'object' then
      raise exception 'Links must be an object of id lists.' using errcode = '22023';
    end if;
    for kind, tbl, col in
      select * from (values ('risk', 'decision_risks', 'risk_id'), ('issue', 'decision_issues', 'issue_id'),
        ('change', 'decision_change_requests', 'change_request_id'), ('dependency', 'decision_dependencies', 'dependency_id'),
        ('benefit', 'decision_benefits', 'benefit_id'), ('milestone', 'decision_milestones', 'milestone_id')) v(k, t, c)
    loop
      continue when not (p_links ? kind);
      ids := coalesce(array(select (v)::uuid from jsonb_array_elements_text(coalesce(p_links -> kind, '[]')) v), '{}');
      execute format('select coalesce(array_agg(%I order by %I), ''{}'') from public.%I where decision_id = $1', col, col, tbl)
        into before_ids using d.id;
      execute format('delete from public.%I where decision_id = $1 and not (%I = any ($2))', tbl, col) using d.id, ids;
      execute format(
        'insert into public.%I (decision_id, project_id, %I) select $1, $2, x from unnest($3::uuid[]) x
         where not exists (select 1 from public.%I l where l.decision_id = $1 and l.%I = x)', tbl, col, tbl, col)
        using d.id, d.project_id, ids;
      if before_ids is distinct from coalesce(array(select distinct x from unnest(ids) x order by x), '{}') then
        links_changed := links_changed || jsonb_build_object(kind, jsonb_build_array(cardinality(before_ids), cardinality(ids)));
      end if;
    end loop;
    if links_changed <> '{}'::jsonb then
      changed := changed || jsonb_build_object('links', links_changed);
    end if;
  end if;

  if changed <> '{}'::jsonb then
    insert into public.decision_events (decision_id, event_type, event_date, previous_needed_by, new_needed_by, changes, actor_id)
    values (d.id, 'edited', private.org_today(d.organisation_id),
      case when changed ? 'needed_by_date' then (before_row ->> 'needed_by_date')::date end,
      case when changed ? 'needed_by_date' then d.needed_by_date end,
      changed, (select auth.uid()));
  end if;
  return d;
end;
$$;
revoke all on function public.update_pending_decision(uuid, jsonb, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.update_pending_decision(uuid, jsonb, jsonb, jsonb, timestamptz) to authenticated;

create or replace function public.save_status_report_draft(
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
begin
  if p_project_id is null or not (p_project_id = any (private.my_editable_project_ids())) then
    raise exception 'You can''t save a status report for this project.' using errcode = '42501';
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
      'draft',
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
    update public.status_reports set
      reporting_date = case when p_report ? 'reporting_date'
        then coalesce(nullif(p_report ->> 'reporting_date', '')::date, reporting_date) else reporting_date end,
      submitter_id = case when p_report ? 'submitter_id' then nullif(p_report ->> 'submitter_id', '')::uuid else submitter_id end,
      overall = case when p_report ? 'overall' then coalesce(nullif(p_report ->> 'overall', '')::public.health, 'not_set') else overall end,
      schedule = case when p_report ? 'schedule' then coalesce(nullif(p_report ->> 'schedule', '')::public.health, 'not_set') else schedule end,
      financial = case when p_report ? 'financial' then coalesce(nullif(p_report ->> 'financial', '')::public.health, 'not_set') else financial end,
      effort = case when p_report ? 'effort' then coalesce(nullif(p_report ->> 'effort', '')::public.health, 'not_set') else effort end,
      issue = case when p_report ? 'issue' then coalesce(nullif(p_report ->> 'issue', '')::public.health, 'not_set') else issue end,
      declared_benefit = case when p_report ? 'declared_benefit'
        then coalesce(nullif(p_report ->> 'declared_benefit', '')::public.health, 'not_set') else declared_benefit end,
      accomplished = case when p_report ? 'accomplished' then p_report ->> 'accomplished' else accomplished end,
      planned = case when p_report ? 'planned' then p_report ->> 'planned' else planned end,
      comments = case when p_report ? 'comments' then nullif(p_report ->> 'comments', '') else comments end,
      decisions_needed = case when p_report ? 'decisions_needed' then nullif(p_report ->> 'decisions_needed', '') else decisions_needed end,
      override_reasons = case when p_report ? 'override_reasons' then coalesce(p_report -> 'override_reasons', '{}'::jsonb) else override_reasons end,
      ai_draft = case when p_report ? 'ai_draft' then p_report -> 'ai_draft' else ai_draft end
    where id = r.id
    returning * into r;

    -- The list is the draft's links: drop the ones no longer listed (same transaction).
    delete from public.status_report_decisions l
    where l.status_report_id = r.id and not (l.decision_id = any (coalesce(p_decision_ids, '{}')));
  end if;

  -- Listed links in display order: add the missing ones, renumber the rest.
  insert into public.status_report_decisions (status_report_id, decision_id, sort_order)
  select r.id, x.id, x.ord::integer
  from unnest(coalesce(p_decision_ids, '{}')) with ordinality as x(id, ord)
  where not exists (
    select 1 from public.status_report_decisions l where l.status_report_id = r.id and l.decision_id = x.id);
  update public.status_report_decisions l set sort_order = x.ord::integer
  from unnest(coalesce(p_decision_ids, '{}')) with ordinality as x(id, ord)
  where l.status_report_id = r.id and l.decision_id = x.id and l.sort_order <> x.ord::integer;
  return r;
end;
$$;
revoke all on function public.save_status_report_draft(uuid, jsonb, uuid[], uuid, timestamptz) from public, anon;
grant execute on function public.save_status_report_draft(uuid, jsonb, uuid[], uuid, timestamptz) to authenticated;

create or replace function public.submit_status_report(
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
    -- The list is the draft's links: drop the ones no longer listed (same transaction).
    delete from public.status_report_decisions l
    where l.status_report_id = r.id and not (l.decision_id = any (coalesce(p_decision_ids, '{}')));
  end if;

  insert into public.status_report_decisions (status_report_id, decision_id, sort_order)
  select r.id, x.id, x.ord::integer
  from unnest(coalesce(p_decision_ids, '{}')) with ordinality as x(id, ord)
  where not exists (
    select 1 from public.status_report_decisions l where l.status_report_id = r.id and l.decision_id = x.id);
  update public.status_report_decisions l set sort_order = x.ord::integer
  from unnest(coalesce(p_decision_ids, '{}')) with ordinality as x(id, ord)
  where l.status_report_id = r.id and l.decision_id = x.id and l.sort_order <> x.ord::integer;

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
