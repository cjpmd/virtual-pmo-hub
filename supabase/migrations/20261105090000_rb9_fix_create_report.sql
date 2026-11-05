-- RB-54: fix create_report to handle JSON null for blocks and selection_rules.
--
-- When the client omits blocks from the payload, supabase-js serialises the
-- field as JSON null ({"blocks":null}).  In SQL, `p -> 'blocks'` on that
-- document yields the jsonb literal `null` — not SQL NULL — so COALESCE treats
-- it as a present value, the insert stores jsonb null, and the
-- `reports_blocks_check` constraint fires with an opaque Postgres message.
--
-- Fix: treat JSON null as absent with nullif(…, 'null'::jsonb), then validate
-- the resolved types explicitly and raise errcode 22023 so the client sees a
-- human-readable message rather than "That change isn't valid."

create or replace function public.create_report(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forums;
  t public.report_templates;
  m public.meetings;
  v_id uuid;
  v_scope_type text := nullif(p ->> 'scope_type', '');
  v_scope_entity uuid := nullif(p ->> 'scope_entity_id', '')::uuid;
  v_items jsonb := p -> 'scope_items';
  v_org uuid;
  v_ws uuid;
  v_wss uuid[];
  v_projects uuid[];
  v_as_at date;
  v_is_pmo boolean;
  v_allowed boolean := false;
  v_title text := nullif(btrim(coalesce(p ->> 'title', '')), '');
  v_scheme uuid := nullif(p ->> 'rating_scheme_id', '')::uuid;
  v_today date;
  v_prev uuid;
  -- Treat JSON null as absent; fall back to the template's value or the default.
  v_blocks jsonb;
  v_rules  jsonb;
begin
  if nullif(p ->> 'forum_id', '') is not null then
    select * into f from public.forums where id = (p ->> 'forum_id')::uuid;
    if f.id is null or not (f.organisation_id = any (private.my_org_ids())) then
      raise exception 'Forum not found.' using errcode = '42501';
    end if;
    v_scope_type := coalesce(v_scope_type, f.scope_type);
    v_scope_entity := coalesce(v_scope_entity, f.scope_entity_id);
    if v_scope_type = 'custom' and v_items is null then
      select jsonb_agg(jsonb_build_object('entity_type', s.entity_type, 'entity_id', s.entity_id)) into v_items
      from public.forum_scope_items s where s.forum_id = f.id;
    end if;
  end if;
  if nullif(p ->> 'meeting_id', '') is not null then
    select * into m from public.meetings where id = (p ->> 'meeting_id')::uuid;
    if m.id is null or m.forum_id is distinct from f.id then
      raise exception 'The meeting must be one of the forum''s meetings.' using errcode = '22023';
    end if;
  end if;
  if v_scope_type is null then
    raise exception 'Choose what the report covers.' using errcode = '22023';
  end if;
  if v_scope_type = 'custom' then v_scope_entity := null; end if;

  -- Organisation and workspace: the forum's, else the scope's.
  if v_scope_type = 'project' then select organisation_id, workspace_id into v_org, v_ws from public.projects where id = v_scope_entity;
  elsif v_scope_type = 'programme' then select organisation_id, workspace_id into v_org, v_ws from public.programmes where id = v_scope_entity;
  elsif v_scope_type = 'portfolio' then select organisation_id, workspace_id into v_org, v_ws from public.portfolios where id = v_scope_entity;
  else
    select min(x.organisation_id::text)::uuid, array_agg(distinct x.workspace_id) into v_org, v_wss from (
      select p2.organisation_id, p2.workspace_id from public.projects p2
      where p2.id in (select (i ->> 'entity_id')::uuid from jsonb_array_elements(coalesce(v_items, '[]')) i where i ->> 'entity_type' = 'project')
      union all
      select g.organisation_id, g.workspace_id from public.programmes g
      where g.id in (select (i ->> 'entity_id')::uuid from jsonb_array_elements(coalesce(v_items, '[]')) i where i ->> 'entity_type' = 'programme')) x;
    v_ws := case when cardinality(v_wss) = 1 then v_wss[1] end;
  end if;
  if f.id is not null then
    if v_org is not null and v_org <> f.organisation_id then
      raise exception 'The scope belongs to another organisation.' using errcode = '22023';
    end if;
    v_org := f.organisation_id;
    v_ws := coalesce(f.workspace_id, v_ws);
  end if;
  if v_org is null or not (v_org = any (private.my_org_ids())) then
    raise exception 'Choose a project, programme or portfolio you can see.' using errcode = '42501';
  end if;
  if v_scope_entity is not null and not private.can_view_entity(v_scope_type, v_scope_entity) then
    raise exception 'You can''t see that %.', v_scope_type using errcode = '42501';
  end if;
  if v_scope_type = 'custom' and exists (
      select 1 from jsonb_array_elements(coalesce(v_items, '[]')) i
      where not private.can_view_entity(i ->> 'entity_type', (i ->> 'entity_id')::uuid)) then
    raise exception 'You can''t see every item in that scope.' using errcode = '42501';
  end if;

  v_is_pmo := case when v_ws is null then v_org = any (private.my_org_ids('pmo')) else v_ws = any (private.my_workspace_ids('pmo')) end;
  if v_is_pmo then
    v_allowed := true;
  elsif f.id is not null then
    v_allowed := private.forum_role_of(f.id) in ('chair', 'secretary')
      or (f.forum_type = 'project_board' and v_scope_type = 'project' and exists (
            select 1 from public.projects p2 join public.resources res on res.id = p2.manager_id
            where p2.id = v_scope_entity and res.profile_id = (select auth.uid())));
  else
    v_allowed := case when v_ws is null then v_org = any (private.my_org_ids('contributor'))
                      else v_ws = any (private.my_workspace_ids('contributor')) end;
  end if;
  if not v_allowed then
    raise exception 'You can''t create a report here. PMO, the forum chair or secretary, or the project''s manager (for its project board) can.' using errcode = '42501';
  end if;

  v_today := private.org_today(v_org);
  v_as_at := coalesce(nullif(p ->> 'as_at', '')::date, m.papers_deadline, v_today);
  -- A meeting's pack waits for its papers deadline (the collection cut-off, RB-6); PMO can override.
  if m.id is not null and m.papers_deadline > v_today and not (v_is_pmo and coalesce((p ->> 'override_cutoff')::boolean, false)) then
    raise exception 'The pack can be created after the papers deadline (%).', to_char(m.papers_deadline, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  if nullif(p ->> 'template_id', '') is not null then
    select * into t from public.report_templates where id = (p ->> 'template_id')::uuid
      and (organisation_id is null or organisation_id = v_org) and archived_at is null;
    if t.id is null then raise exception 'Template not found.' using errcode = '22023'; end if;
  elsif f.default_template_id is not null and not coalesce((p ->> 'ad_hoc')::boolean, false) then
    select * into t from public.report_templates where id = f.default_template_id and archived_at is null;
  end if;
  if v_scheme is null and t.rating_scheme_key is not null then
    select s.id into v_scheme from public.rating_schemes s where s.key = t.rating_scheme_key
      and (s.organisation_id = v_org or s.organisation_id is null) order by s.organisation_id nulls last limit 1;
  end if;

  -- Resolve blocks and selection_rules: template takes precedence; JSON null in p is treated as
  -- absent (the client may send null when it has nothing to contribute).
  v_blocks := coalesce(t.blocks, nullif(p -> 'blocks', 'null'::jsonb), '[]');
  v_rules  := coalesce(t.selection_rules, nullif(p -> 'selection_rules', 'null'::jsonb), '{}');

  if jsonb_typeof(v_blocks) is distinct from 'array' then
    raise exception 'blocks must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_typeof(v_rules) is distinct from 'object' then
    raise exception 'selection_rules must be a JSON object' using errcode = '22023';
  end if;

  if f.id is not null then
    select r.id into v_prev from public.reports r where r.forum_id = f.id and r.status = 'published'
    order by r.published_at desc limit 1;
  end if;
  v_title := coalesce(v_title, case when f.id is not null
    then f.name || coalesce(' — ' || to_char(m.meeting_date, 'DD Mon YYYY'), '') else 'Ad hoc report' end);

  insert into public.reports (organisation_id, workspace_id, title, template_id, template_version, forum_id, meeting_id,
    scope_type, scope_entity_id, scope_items, as_at, blocks, selection_rules, rating_scheme_id, previous_report_id)
  values (v_org, v_ws, v_title, t.id, t.version, f.id, m.id, v_scope_type, v_scope_entity,
    case when v_scope_type = 'custom' then coalesce(v_items, '[]') end, v_as_at,
    v_blocks, v_rules, v_scheme, v_prev)
  returning id into v_id;
  perform private.compute_inclusions(v_id);
  insert into public.report_events (report_id, event, actor, payload)
  values (v_id, 'created', (select auth.uid()), jsonb_build_object('template_id', t.id, 'template_version', t.version));
  return v_id;
end;
$$;
