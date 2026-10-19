-- RUNBOOK (16/10/2026): decision edit and draft links in one transaction. Approved 16/10 as a
-- runbook; yours to run (contains DELETE, which the MCP tools can't run). Tell me when it's done.
--
-- What it changes (functions only; no table, view or data change):
--   1. update_pending_decision (new): edit a Pending decision, its options and its links in one
--      transaction. Design and local checks: docs/sql/update-pending-decision.sql.
--   2. save_status_report_draft (replaced): p_decision_ids is now the draft's whole link list. A
--      link not listed is deleted in the same transaction (before: refused with "Remove DEC-0xx
--      from the draft first"). Everything else is unchanged.
--   3. submit_status_report (replaced): the same for a draft being submitted (unlisted links are
--      deleted, listed ones renumbered), so the client no longer deletes links itself. A new
--      report (no p_report_id) is unchanged. Submitted reports stay frozen.
-- After it's applied the app drops dropUnlistedDraftLinks (the client-side delete) and the
-- drawer saves through update_pending_decision.
-- Checked locally (PGlite, stub tables): the draft/submit link replacement and
-- update_pending_decision behave as listed under Block A. RLS and triggers are only exercised
-- by Block A on Supabase.
--
-- Run each block on its own in the Supabase SQL editor.

-- ===== Block A: dry run (one transaction, rolled back; writes nothing) ======================
-- Expected output: rows 1-9 with ok = true, and a last row "ALL | 9 of 9 ok | 9 of 9 ok | true":
--   1 update_pending_decision            title edited; options A renamed(same id), C;
--                                        0 milestone links; event keys links,options,title
--   2 one option                         22023
--   3 stale updated_at                   40001
--   4 status key                         22023
--   5 save draft [D1,D2] then [D2]       draft, 1 link (D2)
--   6 submit the draft with no links     submitted, 0 links, evidence captured
--   7 save the submitted report          22023
--   8 outsider edits demo DEC-003        42501
--   9 anon execute (3 functions)         false/false/false
-- (Runs in UIT, the UI Test project; everything is rolled back.)

begin;
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

-- Checks, as the member test user on UIT (the UI Test project in the outsider test organisation).
create temp table r (n serial, chk text, expected text, got text, ok boolean);
create temp table ctx (k text primary key, id uuid, ts timestamptz);
grant all on r, ctx to authenticated; grant usage on sequence r_n_seq to authenticated;
select set_config('role','authenticated',true), set_config('request.jwt.claims','{"sub":"ee64bf2e-7bd1-4756-a2df-9dbc5b5e5ede","role":"authenticated"}',true);
do $$ declare d uuid; a uuid; begin
  insert into decisions (project_id, title, needed_by_date) values ('f92c86b4-df33-47a5-b7f8-e1344395eea2','Runbook test','2026-12-01') returning id into d;
  insert into ctx values ('d', d, null);
  insert into decision_options (decision_id, title, sort_order) values (d,'A',0) returning id into a;
  insert into ctx values ('a', a, null);
  insert into decision_options (decision_id, title, sort_order) values (d,'B',1);
  insert into decision_milestones (decision_id, project_id, milestone_id) values (d,'f92c86b4-df33-47a5-b7f8-e1344395eea2','f0e11ba1-cf9b-4537-9831-de96d380a5b3');
  update ctx set ts = (select updated_at from decisions where id = d) where k = 'd';
end $$;
do $$ declare x public.decisions; o text; m int; e jsonb; begin
  select * into x from update_pending_decision((select id from ctx where k='d'), '{"title":"Runbook test (edited)"}'::jsonb,
    jsonb_build_array(jsonb_build_object('id',(select id from ctx where k='a'),'title','A renamed'), jsonb_build_object('title','C')),
    '{"milestone":[]}'::jsonb, (select ts from ctx where k='d'));
  select string_agg(title||case when id=(select id from ctx where k='a') then '(same id)' else '' end, ', ' order by sort_order) into o from decision_options where decision_id=x.id;
  select count(*) into m from decision_milestones where decision_id=x.id;
  select changes into e from decision_events where decision_id=x.id and event_type='edited';
  insert into r(chk,expected,got,ok) values ('1 update_pending_decision',
    'title edited; options A renamed(same id), C; 0 milestone links; event keys links,options,title',
    x.title||'; '||o||'; '||m||' milestone links; event keys '||(select string_agg(k, ',' order by k) from jsonb_object_keys(e) k),
    x.title='Runbook test (edited)' and o='A renamed(same id), C' and m=0 and (select string_agg(k, ',' order by k) from jsonb_object_keys(e) k)='links,options,title');
exception when others then insert into r(chk,expected,got,ok) values ('1 update_pending_decision','ok',sqlstate||' '||sqlerrm,false); end $$;
do $$ begin perform update_pending_decision((select id from ctx where k='d'), '{}'::jsonb, '[{"title":"only"}]'::jsonb);
  insert into r(chk,expected,got,ok) values ('2 one option','22023','not refused',false);
exception when others then insert into r(chk,expected,got,ok) values ('2 one option','22023',sqlstate,sqlstate='22023'); end $$;
do $$ begin perform update_pending_decision((select id from ctx where k='d'), '{"title":"x"}'::jsonb, null, null, '2000-01-01');
  insert into r(chk,expected,got,ok) values ('3 stale updated_at','40001','not refused',false);
exception when others then insert into r(chk,expected,got,ok) values ('3 stale updated_at','40001',sqlstate,sqlstate='40001'); end $$;
do $$ begin perform update_pending_decision((select id from ctx where k='d'), '{"status":"made"}'::jsonb);
  insert into r(chk,expected,got,ok) values ('4 status key','22023','not refused',false);
exception when others then insert into r(chk,expected,got,ok) values ('4 status key','22023',sqlstate,sqlstate='22023'); end $$;
-- Draft links: save [D1, D2], save [D2] (D1 removed), submit [] (D2 removed), save again refused.
do $$ declare d2 uuid; s public.status_reports; n int; begin
  insert into decisions (project_id, title, needed_by_date) values ('f92c86b4-df33-47a5-b7f8-e1344395eea2','Runbook test 2','2026-12-01') returning id into d2;
  insert into ctx values ('d2', d2, null);
  select * into s from save_status_report_draft('f92c86b4-df33-47a5-b7f8-e1344395eea2','{"accomplished":"a","planned":"p"}'::jsonb, array[(select id from ctx where k='d'), d2]);
  insert into ctx values ('s', s.id, null);
  select * into s from save_status_report_draft('f92c86b4-df33-47a5-b7f8-e1344395eea2','{}'::jsonb, array[d2], s.id);
  select count(*) into n from status_report_decisions where status_report_id=s.id;
  insert into r(chk,expected,got,ok) values ('5 save draft [D1,D2] then [D2]','draft, 1 link (D2)', s.status||', '||n||' link'||case when exists (select 1 from status_report_decisions where status_report_id=s.id and decision_id=d2) then ' (D2)' else '' end,
    s.status='draft' and n=1 and exists (select 1 from status_report_decisions where status_report_id=s.id and decision_id=d2));
exception when others then insert into r(chk,expected,got,ok) values ('5 save draft','ok',sqlstate||' '||sqlerrm,false); end $$;
do $$ declare s public.status_reports; n int; begin
  select * into s from submit_status_report('f92c86b4-df33-47a5-b7f8-e1344395eea2','{}'::jsonb, '{}'::uuid[], (select id from ctx where k='s'));
  select count(*) into n from status_report_decisions where status_report_id=s.id;
  insert into r(chk,expected,got,ok) values ('6 submit the draft with no links listed','submitted, 0 links, evidence captured', s.status||', '||n||' links, evidence '||(s.evidenced_overall is not null),
    s.status='submitted' and n=0 and s.evidenced_overall is not null);
exception when others then insert into r(chk,expected,got,ok) values ('6 submit the draft','ok',sqlstate||' '||sqlerrm,false); end $$;
do $$ begin perform save_status_report_draft('f92c86b4-df33-47a5-b7f8-e1344395eea2','{}'::jsonb, '{}'::uuid[], (select id from ctx where k='s'));
  insert into r(chk,expected,got,ok) values ('7 save the submitted report','22023','not refused',false);
exception when others then insert into r(chk,expected,got,ok) values ('7 save the submitted report','22023',sqlstate,sqlstate='22023'); end $$;
reset role;
-- The outsider has no access to the demo organisation: refused on a demo decision.
select set_config('role','authenticated',true), set_config('request.jwt.claims','{"sub":"3fa99177-dd44-4ecd-a278-a6f1c4e61b78","role":"authenticated"}',true);
do $$ begin perform update_pending_decision('3421df5f-1fb3-0453-ce70-db3e666aaa19', '{"title":"x"}'::jsonb);
  insert into r(chk,expected,got,ok) values ('8 outsider edits demo DEC-003','42501','not refused',false);
exception when others then insert into r(chk,expected,got,ok) values ('8 outsider edits demo DEC-003','42501',sqlstate,sqlstate='42501'); end $$;
reset role;
insert into r(chk,expected,got,ok) select '9 anon execute (3 functions)','false/false/false',
  has_function_privilege('anon','public.update_pending_decision(uuid, jsonb, jsonb, jsonb, timestamptz)','execute')||'/'||
  has_function_privilege('anon','public.save_status_report_draft(uuid, jsonb, uuid[], uuid, timestamptz)','execute')||'/'||
  has_function_privilege('anon','public.submit_status_report(uuid, jsonb, uuid[], uuid, timestamptz)','execute'), 
  not (has_function_privilege('anon','public.update_pending_decision(uuid, jsonb, jsonb, jsonb, timestamptz)','execute')
    or has_function_privilege('anon','public.save_status_report_draft(uuid, jsonb, uuid[], uuid, timestamptz)','execute')
    or has_function_privilege('anon','public.submit_status_report(uuid, jsonb, uuid[], uuid, timestamptz)','execute'));
select n, chk, expected, got, ok from r
union all select 99, 'ALL', '9 of 9 ok', count(*) filter (where ok)||' of '||count(*)||' ok', bool_and(ok) from r
order by 1;
rollback;

-- ===== Block B: apply ========================================================================
-- Same three functions, committed, and recorded in the migration history so the repo and the
-- database agree (version 20261016170000, name decision_edit_and_draft_links).

begin;
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

insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20261016170000', 'decision_edit_and_draft_links',
  array['-- applied from docs/sql/runbook-decision-edit-and-draft-links.sql, Block B']);
commit;

-- ===== Block C: checks after applying (read-only) ===========================================
-- Expected: 3 rows, each security_definer true, authenticated true, anon false, public false;
-- then 1 row: migration recorded = true.

select p.proname, p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
  has_function_privilege('anon', p.oid, 'execute') as anon,
  has_function_privilege('public', p.oid, 'execute') as public
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('update_pending_decision', 'save_status_report_draft', 'submit_status_report')
order by 1;

select exists (select 1 from supabase_migrations.schema_migrations where version = '20261016170000') as migration_recorded;
