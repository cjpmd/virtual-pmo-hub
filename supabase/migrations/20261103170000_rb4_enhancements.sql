-- Report builder, Phase 4: AI executive summary support, template versioning, scheduled pack
-- creation, lessons_learned and linked_records blocks (docs/report-builder-spec.md §18 Phase 4).
-- Additive only.

-- ======================================================================= 1. AI drafts
-- The report-ai-summary edge function stores its draft through this (as the caller): the
-- narrative is marked ai_draft (badged, and submit / publish refuse until it's edited or
-- acknowledged) and the event is audited with the model used.
create function public.record_ai_draft(p_report_id uuid, p_block_instance_id text, p_text text, p_model text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.can_edit_report(p_report_id) then
    raise exception 'You can''t change this report.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_text, ''))) = 0 then
    raise exception 'The draft is empty.' using errcode = '22023';
  end if;
  insert into public.report_narratives (report_id, block_instance_id, entity_id, body, source)
  values (p_report_id, p_block_instance_id, null, jsonb_build_object('format', 'markdown', 'text', btrim(p_text)), 'ai_draft')
  on conflict (report_id, block_instance_id, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set body = excluded.body, source = 'ai_draft', updated_at = now(), updated_by = (select auth.uid())
  returning id into v_id;
  insert into public.report_events (report_id, event, actor, payload)
  values (p_report_id, 'ai_draft', (select auth.uid()), jsonb_build_object('block_instance_id', p_block_instance_id, 'model', p_model));
  return v_id;
end;
$$;

-- "Mark reviewed": the AI draft becomes the editor's own text.
create function public.acknowledge_ai_draft(p_narrative_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.report_narratives;
begin
  select * into n from public.report_narratives where id = p_narrative_id;
  if n.id is null or not private.can_edit_report(n.report_id) then
    raise exception 'You can''t change this report.' using errcode = '42501';
  end if;
  update public.report_narratives set source = 'human' where id = n.id and source = 'ai_draft';
  insert into public.report_events (report_id, event, actor, payload)
  values (n.report_id, 'ai_acknowledged', (select auth.uid()), jsonb_build_object('narrative_id', n.id));
end;
$$;

-- AI drafts by the report's organisation in the last 24 hours (the per-organisation daily cap).
create function public.ai_drafts_today(p_report_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.report_events e
  join public.reports r on r.id = e.report_id
  where r.organisation_id = (select organisation_id from public.reports where id = p_report_id)
    and e.event = 'ai_draft' and e.created_at > now() - interval '24 hours';
$$;

-- ================================================================ 2. Template versioning
-- Replace a draft's blocks and rules with its template's latest version. Narratives stay with
-- block instances whose ids still exist; inclusions are recomputed.
create function public.update_report_to_template(p_report_id uuid)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
  t public.report_templates;
begin
  select * into r from public.reports where id = p_report_id for update;
  if r.id is null or not private.can_edit_report(r.id) or r.status <> 'draft' then
    raise exception 'Only an editable draft can be updated to its template.' using errcode = '42501';
  end if;
  select * into t from public.report_templates where id = r.template_id;
  if t.id is null then
    raise exception 'This report has no template.' using errcode = '22023';
  end if;
  update public.reports set blocks = t.blocks, selection_rules = t.selection_rules, template_version = t.version
  where id = r.id returning * into r;
  perform private.compute_inclusions(r.id);
  insert into public.report_events (report_id, event, actor, payload)
  values (r.id, 'template_updated', (select auth.uid()), jsonb_build_object('template_version', t.version));
  return r;
end;
$$;

-- ============================================================ 3. Scheduled pack creation
-- A forum can ask for its pack to be drafted automatically when a meeting's papers deadline
-- (the collection cut-off) passes. Drafts only; nothing is submitted or published.
alter table public.forums add column auto_create_packs boolean not null default false;

create function private.create_scheduled_packs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_id uuid;
  v_prev uuid;
  n integer := 0;
begin
  for m in
    select mt.id as meeting_id, mt.meeting_date, mt.papers_deadline, f.*
    from public.meetings mt join public.forums f on f.id = mt.forum_id
    where f.auto_create_packs and f.active and f.archived_at is null and f.default_template_id is not null and f.scope_type is not null
      and mt.status = 'planned' and mt.papers_deadline < private.org_today(f.organisation_id)
      and mt.papers_deadline >= private.org_today(f.organisation_id) - 7
      and not exists (select 1 from public.reports r where r.meeting_id = mt.id)
  loop
    select r.id into v_prev from public.reports r where r.forum_id = m.id and r.status = 'published' order by r.published_at desc limit 1;
    insert into public.reports (organisation_id, workspace_id, title, template_id, template_version, forum_id, meeting_id,
      scope_type, scope_entity_id, scope_items, as_at, blocks, selection_rules, previous_report_id, created_by)
    select m.organisation_id, m.workspace_id, m.name || ' — ' || to_char(m.meeting_date, 'DD Mon YYYY'), t.id, t.version, m.id, m.meeting_id,
      m.scope_type, case when m.scope_type = 'custom' then null else m.scope_entity_id end,
      case when m.scope_type = 'custom' then (select coalesce(jsonb_agg(jsonb_build_object('entity_type', s.entity_type, 'entity_id', s.entity_id)), '[]')
        from public.forum_scope_items s where s.forum_id = m.id) end,
      m.papers_deadline, t.blocks, t.selection_rules, v_prev, null
    from public.report_templates t where t.id = m.default_template_id
    returning id into v_id;
    perform private.compute_inclusions(v_id);
    insert into public.report_events (report_id, event, actor, payload)
    values (v_id, 'created', null, jsonb_build_object('scheduled', true, 'meeting_id', m.meeting_id));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function private.create_scheduled_packs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vpmo-scheduled-report-packs', '20 6 * * *', 'select private.create_scheduled_packs()');
  end if;
end $$;

-- v_record_links: dependencies whose ends are milestones count against the milestone's project.
create or replace view public.v_record_links with (security_invoker = true) as
  select l.id, l.organisation_id, l.workspace_id, l.from_type, l.from_id, l.to_type, l.to_id, l.link_type,
    l.attributes, 'record_links'::text as source
  from public.record_links l
  union all
  select d.id, d.organisation_id, d.workspace_id, 'project', coalesce(d.receiver_project_id, rm.project_id),
    'project', coalesce(d.giver_project_id, gm.project_id),
    'depends_on', jsonb_build_object('criticality', d.criticality, 'need_by', d.required_by_date, 'ref', d.ref,
      'description', d.description, 'validation', d.validation),
    'dependencies'
  from public.dependencies d
  left join public.milestones gm on gm.id = d.giver_milestone_id
  left join public.milestones rm on rm.id = d.receiver_milestone_id
  where coalesce(d.receiver_project_id, rm.project_id) is not null and coalesce(d.giver_project_id, gm.project_id) is not null;

-- ============================================================ 4. Phase 4 blocks
-- lessons_learned: lessons raised in the period (since the previous meeting) on projects in scope.
create function private.rb_lessons_learned(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('since', private.rb_since(ctx),
    'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.raised_date desc), '[]')) from (
    select l.id, l.ref, l.summary, l.type::text as type, l.recommendation, l.applicability::text as applicability,
      l.status::text as status, l.raised_date, p.code as project_code, coalesce(lv.label, l.category_list) as category
    from public.lessons l
    left join public.projects p on p.id = l.project_id
    left join public.lookup_values lv on lv.id = l.category_id
    where l.project_id = any (private.rb_projects(ctx))
      and l.raised_date >= case when coalesce((cfg ->> 'all_open')::boolean, false) then '-infinity'::date else private.rb_since(ctx) end
      and (cfg -> 'types' is null or jsonb_array_length(cfg -> 'types') = 0 or cfg -> 'types' ? l.type::text)
    limit coalesce((cfg ->> 'limit')::int, 20)) x;
$$;

-- linked_records: typed links (record_links, plus dependencies as depends_on) from or to
-- projects in scope; later modules (BAF, hazards) add link types without engine changes.
create function private.rb_linked_records(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.link_type, x.project_code), '[]')) from (
    select l.id, l.link_type, l.source, l.attributes,
      case when l.from_type = 'project' and l.from_id = any (private.rb_projects(ctx)) then 'out' else 'in' end as direction,
      fp.code as project_code,
      l.from_type, l.from_id, l.to_type, l.to_id,
      coalesce(tp.code || ' ' || tp.name, tr.ref || ' ' || tr.title, ti.ref || ' ' || ti.title, tb.ref || ' ' || tb.title, tl.ref || ' ' || tl.summary, l.to_type) as to_label,
      coalesce(fp.code || ' ' || fp.name, fr.ref || ' ' || fr.title, l.from_type) as from_label
    from public.v_record_links l
    left join public.projects fp on l.from_type = 'project' and fp.id = l.from_id
    left join public.risks fr on l.from_type = 'risk' and fr.id = l.from_id
    left join public.projects tp on l.to_type = 'project' and tp.id = l.to_id
    left join public.risks tr on l.to_type = 'risk' and tr.id = l.to_id
    left join public.issues ti on l.to_type = 'issue' and ti.id = l.to_id
    left join public.benefits tb on l.to_type = 'benefit' and tb.id = l.to_id
    left join public.lessons tl on l.to_type = 'lesson' and tl.id = l.to_id
    where ((l.from_type = 'project' and l.from_id = any (private.rb_projects(ctx)))
        or (l.to_type = 'project' and l.to_id = any (private.rb_projects(ctx)))
        or (l.from_type = 'risk' and l.from_id in (select k.id from public.risks k where k.project_id = any (private.rb_projects(ctx)))))
      and (cfg -> 'link_types' is null or jsonb_array_length(cfg -> 'link_types') = 0 or cfg -> 'link_types' ? l.link_type)
    limit coalesce((cfg ->> 'limit')::int, 30)) x;
$$;

-- ========================================================================= 5. Grants
revoke all on function public.record_ai_draft(uuid, text, text, text), public.acknowledge_ai_draft(uuid), public.ai_drafts_today(uuid),
  public.update_report_to_template(uuid), private.rb_lessons_learned(jsonb, jsonb), private.rb_linked_records(jsonb, jsonb)
  from public, anon;
grant execute on function public.record_ai_draft(uuid, text, text, text), public.acknowledge_ai_draft(uuid), public.ai_drafts_today(uuid),
  public.update_report_to_template(uuid), private.rb_lessons_learned(jsonb, jsonb), private.rb_linked_records(jsonb, jsonb)
  to authenticated, service_role;
