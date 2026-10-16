-- SUPERSEDED as the thing to run: the approved runbook is docs/sql/runbook-decision-edit-and-draft-links.sql
-- (it contains this function plus the draft-link changes). Kept for the design notes and local checks.
-- RUNBOOK (15/10/2026): update_pending_decision. Not applied; contains DELETE, so it is yours
-- to run (block A is the dry run, block B applies it).
--
-- Today the drawer saves a Pending decision in several writes (update the decision, delete all
-- its options, insert them again, then each link): a failure part-way leaves it half saved, and
-- the option ids change on every save. update_pending_decision does it in one transaction.
--
-- update_pending_decision(p_decision_id, p_decision, p_options, p_links, p_expected_updated_at)
--   returns public.decisions
--   * Permission: private.can_write_decision (as editing a Pending decision today); Pending only;
--     optional stale check on updated_at (40001). Errors 42501 / 22023 / 40001 as the other RPCs.
--   * p_decision (object): any of title, context, decision_maker_id, forum_id, needed_by_date,
--     impact_scope, impact_scope_note, impact_cost, impact_cost_note, impact_time,
--     impact_time_note, impact_benefits, impact_benefits_note, evidence_link. A key that is
--     present replaces the field; title can't be blank and needed_by_date can't be cleared.
--     Status, outcome and recording fields can't be set here.
--   * p_options (array, or null to leave them): [{id?, title, pros[], cons[]}] in display order,
--     at least two with a title. An option with an id of this decision is updated in place (its
--     id is kept); one without an id is added; an existing option not listed is deleted.
--   * p_links (object, or null to leave them): keys risk, issue, change, dependency, benefit,
--     milestone, each a uuid array. A key that is present sets that link list exactly (adds the
--     missing, deletes the unlisted); an absent key leaves it.
--   * History: one 'edited' event with {column: [old, new]} for changed fields, plus "options"
--     and "links" entries (old / new counts) when those changed.
-- Runs as the owner, so the decisions rules trigger and the child-freeze trigger don't apply;
-- the function enforces Pending itself.

-- ===== Block A: dry run (one transaction, rolled back) =====================================
-- begin;
--   <the create function and grants from block B>
--   then, as the member test user (set_config('role','authenticated') + request.jwt.claims):
--   1  create a Pending decision on a project the member edits, with options A, B and one risk link
--   2  update_pending_decision: new title, options [A (same id, renamed), C (new)], links
--      {risk: [], milestone: [m1]}                       -> options A' + C, A's id kept, B gone,
--                                                          risk link gone, milestone linked,
--                                                          1 edited event with title/options/links
--   3  only one option                                    -> refused 22023
--   4  stale p_expected_updated_at                        -> refused 40001
--   5  an option id from another decision                 -> refused 22023
--   6  withdraw it, then update                           -> refused 22023 (not Pending)
--   7  outsider calls it                                  -> refused 42501
-- rollback;

-- ===== Block B: apply (as a migration) =========================================================
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

-- LOCAL CHECK (15/10/2026): block B was created and exercised in PGlite against stub tables
-- (no Supabase), since execute_sql can't run DELETE. It caught one bug (fixed: "returning id
-- into ids[1]"). Results: title updated; option A updated in place with its id kept, B deleted,
-- C added, blank pros dropped, sort order by position; risk link removed, milestone link added;
-- one 'edited' event {title, options [2,2], links {risk [1,0], milestone [0,1]}}; one option ->
-- 22023; stale -> 40001; option of another decision -> 22023; a status key -> 22023; blank
-- title -> 22023; Withdrawn -> 22023; no permission -> 42501; a save with no change logs no
-- event. RLS, triggers and the real tables are only exercised by block A on Supabase.
