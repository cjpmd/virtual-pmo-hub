-- GL-14 Phase A: close the report builder's gaps before Committee (Funding) packs retire
-- (docs/design/retire-committee-packs.md, decisions D-a to D-d of 12/11/2026).
--   G1  a real 'collection' scope (D-a): reports, templates and forums can cover a funding
--       collection; its projects are read from collection_projects whenever the selection is
--       computed, so the report follows changes to the collection.
--   G3  programme_coverage block: projects, budget and forecast per programme, plus pot vs
--       requested vs awarded for a collection scope (D-b). Requested comes from the business
--       case's funding requested, else the request's estimated cost, else the project budget,
--       labelled per project.
--   G6  benefits_value block (D-c; benefits_summary unchanged): planned, realised, % realised,
--       cash-releasing realised, at risk, by strategic objective, behind profile, overdue
--       measurements, using the same rules as services/benefits-value.ts getValueMetrics.
--   G2  report_cover returns the block's optional cover text (config cover_text) and a scope
--       label for a collection.
--   G13 the system template "Funding committee" (one global row, so every organisation has it).
--   G11 get_portfolio_overview's committee markers also come from published committee /
--       portfolio board / collection packs.
-- D-d (showLogo) is client-side and belongs to Phase B; nothing here.
--
-- Section 0 swaps four CHECK constraints (drop + add with the wider list). Nothing is lost,
-- but it is a DROP, so per CLAUDE.md it is also in its own section of
-- docs/sql/gl-14a-report-builder-gaps.sql to run by hand in the SQL editor first. Running it
-- twice is harmless (drop if exists, then the same constraint again). Everything else is
-- create / create or replace / insert.

-- =====================================================================================
-- 0. Wider scope_type checks (run by hand first; see the docs/sql file)
-- =====================================================================================
alter table public.reports drop constraint if exists reports_scope_type_check,
  add constraint reports_scope_type_check check (scope_type in ('project', 'programme', 'portfolio', 'custom', 'collection'));
alter table public.report_templates drop constraint if exists report_templates_scope_type_check,
  add constraint report_templates_scope_type_check check (scope_type in ('project', 'programme', 'portfolio', 'custom', 'collection', 'any'));
alter table public.forums drop constraint if exists forums_scope_type_check,
  add constraint forums_scope_type_check check (scope_type in ('project', 'programme', 'portfolio', 'custom', 'collection'));
alter table public.forums drop constraint if exists forums_scope_entity_check,
  add constraint forums_scope_entity_check check ((scope_type in ('project', 'programme', 'portfolio', 'collection')) = (scope_entity_id is not null) or scope_type is null);
-- reports_check ((scope_type = 'custom') = (scope_entity_id is null)) already requires a
-- collection id for a collection scope.

-- =====================================================================================
-- A. Collection scope
-- =====================================================================================
-- The projects a scope covers. A collection's projects are read live from collection_projects
-- (RLS applies: this function runs as the caller).
create or replace function private.scope_project_ids(p_scope_type text, p_scope_entity_id uuid, p_scope_items jsonb)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(p.id order by p.name), '{}')
  from public.v_projects p
  where p.archived_at is null
    and (p.state <> 'closed' or p_scope_type = 'project')
    and case p_scope_type
      when 'project' then p.id = p_scope_entity_id
      when 'programme' then p.programme_id = p_scope_entity_id
      when 'portfolio' then p.effective_portfolio_id = p_scope_entity_id
      when 'collection' then p.id in (select cp.project_id from public.collection_projects cp where cp.collection_id = p_scope_entity_id)
      else p.id in (select (i ->> 'entity_id')::uuid from jsonb_array_elements(coalesce(p_scope_items, '[]')) i where i ->> 'entity_type' = 'project')
        or p.programme_id in (select (i ->> 'entity_id')::uuid from jsonb_array_elements(coalesce(p_scope_items, '[]')) i where i ->> 'entity_type' = 'programme')
    end;
$$;

create or replace function private.can_view_entity(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_ws uuid;
  v_programme uuid;
  mine uuid[] := private.my_org_ids();
begin
  case p_entity_type
    when 'project' then select organisation_id, workspace_id, programme_id into v_org, v_ws, v_programme from public.projects where id = p_entity_id;
    when 'programme' then select organisation_id, workspace_id, id into v_org, v_ws, v_programme from public.programmes where id = p_entity_id;
    when 'portfolio' then select organisation_id, workspace_id into v_org, v_ws from public.portfolios where id = p_entity_id;
    when 'collection' then select organisation_id, workspace_id into v_org, v_ws from public.collections where id = p_entity_id;  -- GL-14
    when 'forum' then select organisation_id, workspace_id into v_org, v_ws from public.forums where id = p_entity_id;
    when 'report' then select organisation_id, workspace_id into v_org, v_ws from public.reports where id = p_entity_id;
    else return false;
  end case;
  if v_org is null then return false; end if;
  if (v_ws is null and v_org = any (mine)) or v_ws = any (private.my_workspace_ids()) then return true; end if;
  return exists (
    select 1 from public.entity_shares s
    where s.partner_organisation_id = any (mine)
      and ((s.entity_type = p_entity_type and s.entity_id = p_entity_id)
        or (s.entity_type = 'programme' and s.entity_id = v_programme)));
end;
$$;

-- create_report: a collection scope takes its organisation and workspace from the collection.
create or replace function public.create_report(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  elsif v_scope_type = 'collection' then select organisation_id, workspace_id into v_org, v_ws from public.collections where id = v_scope_entity;  -- GL-14
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
    raise exception 'Choose a project, programme, portfolio or collection you can see.' using errcode = '42501';
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
$function$;

-- =====================================================================================
-- D. Progress chart markers (G11): get_portfolio_overview's committee_dates also read
--    published committee / portfolio board / collection packs.
-- =====================================================================================
create or replace function public.get_portfolio_overview(p_workspace uuid, p_programme uuid DEFAULT NULL::uuid, p_range text DEFAULT 'fy'::text, p_portfolio uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
with bounds as (
  select
    w.id as workspace_id,
    w.organisation_id,
    o.settings,
    private.org_today(o.id) as today,
    private.fy_start(o.settings, private.org_today(o.id)) as fy_start,
    case p_range
      when '12m' then (date_trunc('month', private.org_today(o.id)) - interval '11 months')::date
      when 'all' then null::date
      else private.fy_start(o.settings, private.org_today(o.id))
    end as from_month,
    private.financial_cutoff(o.id) as cutoff_month
  from public.workspaces w
  join public.organisations o on o.id = w.organisation_id
  where w.id = p_workspace
),
red_threshold as (
  select coalesce(
    (
      select max((band ->> 'minScore')::integer)
      from jsonb_array_elements(coalesce(
        (select settings -> 'risk' -> 'bands' from bounds),
        '[]'::jsonb
      )) band
      where (band ->> 'minScore') ~ '^\d+$'
    ),
    15
  ) as min_score
),
scope as (
  select p.*
  from public.v_projects p
  join bounds b on b.workspace_id = p.workspace_id
  where p.archived_at is null
    and (p_programme is null or p.programme_id = p_programme)
    and (p_portfolio is null or p.effective_portfolio_id = p_portfolio)
),
scoped_projects as (
  select
    s.id, s.workspace_id, s.programme_id, s.portfolio_id, s.effective_portfolio_id,
    s.name, s.code, s.tier, s.state, s.priority,
    s.start_date, s.finish_date, s.baseline_finish_date,
    s.budget, s.actual, s.forecast, s.has_baseline,
    s.task_source, s.health_override, s.health_override_reason,
    s.phase_index, s.phase_count,
    s.manager_id, s.project_officer_id, s.sponsor_id,
    h.overall, h.schedule, h.financial, h.effort, h.issue, h.benefit,
    h.forecast_finish_date, h.forecast_basis,
    s.updated_at
  from scope s
  join public.project_health_current h on h.project_id = s.id
),
milestones as (
  select
    m.id, m.project_id, m.title, m.type::text as type,
    m.baseline_date, m.forecast_date, m.actual_date,
    m.status::text as status, m.slip_days, m.report_to_committee, m.owner_id,
    m.updated_at
  from public.v_milestones m
  join scope s on s.id = m.project_id
),
project_snaps as (
  select distinct on (hs.project_id, date_trunc('month', hs.snapshot_date))
    hs.project_id,
    date_trunc('month', hs.snapshot_date)::date as month,
    hs.snapshot_date,
    hs.overall::text as overall,
    hs.schedule::text as schedule,
    hs.financial::text as financial,
    hs.effort::text as effort,
    hs.issue::text as issue,
    hs.benefit::text as benefit
  from public.health_snapshots hs
  join scope s on s.id = hs.project_id
  join bounds b on b.workspace_id = hs.workspace_id
  where b.from_month is null
     or hs.snapshot_date >= (b.from_month - interval '6 months')::date
  order by hs.project_id, date_trunc('month', hs.snapshot_date), hs.snapshot_date desc
),
rollup_snaps as (
  select distinct on (coalesce(hs.programme_id, hs.portfolio_id), date_trunc('month', hs.snapshot_date))
    date_trunc('month', hs.snapshot_date)::date as month,
    hs.snapshot_date,
    hs.overall::text as overall,
    hs.metrics,
    hs.portfolio_id,
    hs.programme_id
  from public.health_snapshots hs
  join bounds b on b.workspace_id = hs.workspace_id
  where (
      (p_programme is not null and hs.programme_id = p_programme)
      or (
        p_programme is null
        and hs.portfolio_id in (
          select distinct s.effective_portfolio_id from scope s
          where s.effective_portfolio_id is not null
        )
      )
    )
    and (
      b.from_month is null
      or hs.snapshot_date >= (b.from_month - interval '6 months')::date
    )
  order by coalesce(hs.programme_id, hs.portfolio_id),
           date_trunc('month', hs.snapshot_date), hs.snapshot_date desc
),
money_by_month as (
  select
    fv.project_id,
    fv.period_month as month,
    fv.kind::text as kind,
    sum(fv.amount) as amount
  from public.financial_values fv
  join scope s on s.id = fv.project_id
  join bounds b on b.workspace_id = fv.workspace_id
  where b.from_month is null or fv.period_month >= b.from_month
  group by fv.project_id, fv.period_month, fv.kind
),
tasks_due as (
  select
    w.project_id,
    date_trunc('month', w.finish_date)::date as month,
    count(*) as due,
    count(*) filter (where w.status = 'done') as done_by_due
  from public.v_work_items w
  join scope s on s.id = w.project_id
  join bounds b on b.workspace_id = w.workspace_id
  where w.finish_date is not null
    and (b.from_month is null or w.finish_date >= b.from_month)
  group by 1, 2
),
tasks_done as (
  select
    w.project_id,
    date_trunc('month', w.done_at)::date as month,
    count(*) as done
  from public.v_work_items w
  join scope s on s.id = w.project_id
  join bounds b on b.workspace_id = w.workspace_id
  where w.done_at is not null
    and (b.from_month is null or date_trunc('month', w.done_at) >= b.from_month)
  group by 1, 2
),
scope_risks as (
  select
    r.id, r.project_id, r.title, r.score,
    r.created_at, r.closed_at, r.status::text as status
  from public.risks r
  join scope s on s.id = r.project_id
),
red_risks as (
  select r.*
  from scope_risks r
  cross join red_threshold t
  where r.status = 'open' and r.score >= t.min_score
),
portfolio_programmes as (
  select pr.id
  from public.programmes pr
  join bounds b on b.workspace_id = pr.workspace_id
  where p_portfolio is not null and pr.portfolio_id = p_portfolio
),
pathway_month_end as (
  select distinct on (
      coalesce(ps.capability_id::text, ps.outcome_id::text, ps.benefit_id::text),
      date_trunc('month', ps.snapshot_date)
    )
    date_trunc('month', ps.snapshot_date)::date as month,
    ps.snapshot_date,
    ps.programme_id,
    ps.capability_id,
    ps.outcome_id,
    ps.benefit_id,
    ps.rag::text as rag,
    ps.phase::text as phase,
    ps.is_complete,
    ps.due_in_fy,
    ps.realised_value,
    ps.fy_profile_value
  from public.pathway_snapshots ps
  join bounds b on b.workspace_id = ps.workspace_id
  where (p_programme is null or ps.programme_id = p_programme)
    and (p_portfolio is null or ps.programme_id in (select id from portfolio_programmes))
    and (b.from_month is null or ps.snapshot_date >= b.from_month)
  order by
    coalesce(ps.capability_id::text, ps.outcome_id::text, ps.benefit_id::text),
    date_trunc('month', ps.snapshot_date),
    ps.snapshot_date desc
),
pathway_targets as (
  select
    c.id as capability_id,
    null::uuid as outcome_id,
    c.target_date,
    c.status::text as status
  from public.capabilities c
  join bounds b on b.workspace_id = c.workspace_id
  where (p_programme is null or c.programme_id = p_programme)
    and (p_portfolio is null or c.programme_id in (select id from portfolio_programmes))
  union all
  select
    null::uuid,
    o.id,
    o.target_date,
    o.status::text
  from public.outcomes o
  join bounds b on b.workspace_id = o.workspace_id
  where (p_programme is null or o.programme_id = p_programme)
    and (p_portfolio is null or o.programme_id in (select id from portfolio_programmes))
),
forecast_history as (
  select
    ffh.project_id, ffh.reporting_month as month, ffh.budget, ffh.eac
  from public.financial_forecast_history ffh
  join scope s on s.id = ffh.project_id
  join bounds b on b.workspace_id = ffh.workspace_id
  where b.from_month is null or ffh.reporting_month >= b.from_month
),
committee_dates as (
  select cp.meeting_date as date, cp.title
  from public.committee_packs cp
  join bounds b on b.workspace_id = cp.workspace_id
  -- GL-14: published committee / portfolio board packs and collection packs from the report
  -- builder (the meeting's date, else the pack's as-at date). RLS on reports applies.
  union all
  select coalesce(m.meeting_date, r.as_at) as date, r.title
  from public.reports r
  join bounds b on b.organisation_id = r.organisation_id and (r.workspace_id is null or r.workspace_id = b.workspace_id)
  left join public.forums f on f.id = r.forum_id
  left join public.meetings m on m.id = r.meeting_id
  where r.status = 'published'
    and (f.forum_type in ('committee', 'portfolio_board') or r.scope_type = 'collection')
),
as_of as (
  select max(ts) as updated_at
  from (
    select s.updated_at as ts from scope s
    union all
    select m.updated_at from milestones m
    union all
    select w.updated_at
    from public.v_work_items w
    join scope s on s.id = w.project_id
    union all
    select fv.updated_at
    from public.financial_values fv
    join scope s on s.id = fv.project_id
  ) t
)
select jsonb_build_object(
  'asOf', (select updated_at from as_of),
  'today', (select today from bounds),
  'fyStart', (select fy_start from bounds),
  'cutoffMonth', (select cutoff_month from bounds),
  'redRiskMinScore', (select min_score from red_threshold),
  'projects', coalesce(
    (select jsonb_agg(to_jsonb(p) order by p.name) from scoped_projects p),
    '[]'::jsonb),
  'milestones', coalesce(
    (select jsonb_agg(to_jsonb(m) order by m.forecast_date) from milestones m),
    '[]'::jsonb),
  'portfolioSnapshots', coalesce(
    (select jsonb_agg(to_jsonb(r) order by r.portfolio_id, r.programme_id, r.month) from rollup_snaps r),
    '[]'::jsonb),
  'projectSnapshots', coalesce(
    (select jsonb_agg(to_jsonb(ps) order by ps.project_id, ps.month) from project_snaps ps),
    '[]'::jsonb),
  'moneyByMonth', coalesce(
    (select jsonb_agg(to_jsonb(m) order by m.project_id, m.month, m.kind) from money_by_month m),
    '[]'::jsonb),
  'tasksByMonth', coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'projectId', d.project_id,
         'month', d.month, 'due', d.due, 'doneByDue', d.done_by_due, 'done', coalesce(dd.done, 0)
       ) order by d.project_id, d.month)
     from tasks_due d
     left join tasks_done dd on dd.project_id = d.project_id and dd.month = d.month),
    '[]'::jsonb),
  'redRisks', coalesce(
    (select jsonb_agg(to_jsonb(r) order by r.score desc, r.created_at) from red_risks r),
    '[]'::jsonb),
  'risks', coalesce(
    (select jsonb_agg(to_jsonb(r) order by r.created_at) from scope_risks r),
    '[]'::jsonb),
  'pathwayMonthEnd', coalesce(
    (select jsonb_agg(to_jsonb(pm) order by pm.month) from pathway_month_end pm),
    '[]'::jsonb),
  'pathwayTargets', coalesce(
    (select jsonb_agg(to_jsonb(pt)) from pathway_targets pt),
    '[]'::jsonb),
  'forecastHistory', coalesce(
    (select jsonb_agg(to_jsonb(f) order by f.month, f.project_id) from forecast_history f),
    '[]'::jsonb),
  'committeeDates', coalesce(
    (select jsonb_agg(to_jsonb(c) order by c.date) from committee_dates c),
    '[]'::jsonb)
)
$function$;

-- =====================================================================================
-- B. Blocks
-- =====================================================================================
-- programme_coverage (G3, D-b): projects, budget and forecast per programme (projects with no
-- programme grouped as "No programme"), totals, and for a collection scope the pot against the
-- requested total and the awarded total.
-- "Requested" per project, first that exists:
--   1. business_case: funding_requested on the latest version of the project's business case
--      (or the case on the request it was converted from) that has one and isn't superseded;
--   2. request: the estimated cost of the request the project was converted from (above 0);
--   3. budget: the project's budget.
-- Each project's amount carries its source, and the totals are split by source, so the pack says
-- which figures are asks and which are budgets.
create function private.rb_programme_coverage(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with p as (
    select p.id, p.code, p.name, p.programme_id, coalesce(g.name, 'No programme') as programme_name, p.budget, p.forecast,
      pr.converted_from_request_id
    from public.v_projects p
    join public.projects pr on pr.id = p.id
    left join public.programmes g on g.id = p.programme_id
    where p.id = any (private.rb_projects(ctx))
  ),
  grouped as (
    select programme_id, programme_name as name, count(*)::integer as projects, sum(budget) as budget, sum(forecast) as forecast
    from p group by programme_id, programme_name
  ),
  coll as (
    select c.id, c.name, c.pot_amount from public.collections c
    where ctx ->> 'scope_type' = 'collection' and c.id = nullif(ctx ->> 'scope_entity_id', '')::uuid
  ),
  asked as (
    select p.id, p.code, p.name, p.budget,
      (select v.funding_requested from public.business_cases bc
         join public.business_case_versions v on v.business_case_id = bc.id
       where (bc.project_id = p.id or (p.converted_from_request_id is not null and bc.request_id = p.converted_from_request_id))
         and v.funding_requested is not null and v.status <> 'superseded'
       order by v.version desc limit 1) as case_amount,
      (select nullif(r.estimated_cost, 0) from public.project_requests r where r.id = p.converted_from_request_id) as request_amount
    from p where exists (select 1 from coll)
  ),
  req as (
    select a.id, a.code, a.name,
      coalesce(a.case_amount, a.request_amount, a.budget) as requested,
      case when a.case_amount is not null then 'business_case'
           when a.request_amount is not null then 'request'
           else 'budget' end as source
    from asked a
  )
  select jsonb_build_object('currency', ctx ->> 'currency',
    'rows', coalesce((select jsonb_agg(to_jsonb(g) order by g.programme_id is null, g.budget desc nulls last, g.name) from grouped g), '[]'),
    'totals', jsonb_build_object('projects', (select count(*) from p), 'budget', (select sum(budget) from p),
      'forecast', (select sum(forecast) from p)),
    'collection', (select jsonb_build_object('name', c.name, 'pot', c.pot_amount,
        'requested', (select sum(requested) from req),
        'requested_by_source', (select coalesce(jsonb_object_agg(x.source, jsonb_build_object('projects', x.n, 'amount', x.amount)), '{}')
          from (select source, count(*)::integer as n, sum(requested) as amount from req group by source) x),
        'requested_rows', coalesce((select jsonb_agg(jsonb_build_object('project_id', r.id, 'code', r.code, 'name', r.name,
            'requested', r.requested, 'source', r.source) order by r.code) from req r), '[]'),
        'awarded', (select sum(cp.award_amount) from public.collection_projects cp
                    where cp.collection_id = c.id and cp.project_id in (select id from p)),
        'remaining', c.pot_amount - coalesce((select sum(cp.award_amount) from public.collection_projects cp
                    where cp.collection_id = c.id and cp.project_id in (select id from p)), 0))
      from coll c));
$$;

-- benefits_value (G6, D-c): value metrics for the benefits the scope's projects enable, with the
-- rules of services/benefits-value.ts getValueMetrics / getBenefitsByObjective and the funding
-- pack's Benefits page: positive benefits only for value (disbenefits excluded), negative values
-- count as 0, at risk = low confidence or behind profile, objectives with planned value only (top
-- `objectives_limit`, default 6), behind profile and overdue measurements (next due before the
-- as-at date) up to `limit` each (default 5), with full counts.
create function private.rb_benefits_value(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with b as (
    select b.id, b.ref, b.title, b.type::text as type, b.classification::text as classification, b.confidence::text as confidence,
      b.planned_total_value, coalesce(br.realised_value, 0) as realised_value, br.realised_percent,
      coalesce(br.behind_profile, false) as behind_profile, ro.name as owner
    from public.benefits b
    left join public.v_benefit_realisation br on br.benefit_id = b.id
    left join public.resources ro on ro.id = b.owner_id
    where b.id in (select bp.benefit_id from public.benefit_projects bp where bp.project_id = any (private.rb_projects(ctx)))
  ),
  pos as (select * from b where type = 'benefit'),
  lim as (select coalesce((cfg ->> 'limit')::integer, 5) as n, coalesce((cfg ->> 'objectives_limit')::integer, 6) as o),
  objectives as (
    select o.id, o.title as name, sum(greatest(0, pos.planned_total_value)) as planned,
      sum(greatest(0, pos.realised_value)) as realised, count(*)::integer as count
    from pos join public.benefit_objectives bo on bo.benefit_id = pos.id
    join public.strategic_objectives o on o.id = bo.strategic_objective_id
    group by o.id, o.title
    having sum(greatest(0, pos.planned_total_value)) > 0
  ),
  overdue as (
    select m.id, b.ref, b.title as benefit, m.name as measure, m.next_due_date,
      (ctx ->> 'as_at')::date - m.next_due_date as days_overdue, b.owner
    from public.benefit_measures m join b on b.id = m.benefit_id
    where m.next_due_date < (ctx ->> 'as_at')::date
  ),
  totals as (
    select coalesce(sum(greatest(0, planned_total_value)), 0) as planned, coalesce(sum(greatest(0, realised_value)), 0) as realised,
      coalesce(sum(greatest(0, realised_value)) filter (where classification = 'cash_releasing'), 0) as cash_realised,
      coalesce(sum(greatest(0, planned_total_value)) filter (where classification = 'cash_releasing'), 0) as cash_planned
    from pos
  )
  select jsonb_build_object('currency', ctx ->> 'currency',
    'benefits', (select count(*) from b),
    'planned', t.planned, 'realised', t.realised,
    'percent', case when t.planned > 0 then round(100 * t.realised / t.planned)::integer else 0 end,
    'cash_releasing_realised', t.cash_realised, 'cash_releasing_planned', t.cash_planned,
    'at_risk', (select count(*) from b where confidence = 'low' or behind_profile),
    'disbenefit_value', (select coalesce(sum(abs(planned_total_value)), 0) from b where type = 'disbenefit'),
    'objectives', coalesce((select jsonb_agg(to_jsonb(x) order by x.planned desc, x.name)
      from (select * from objectives order by planned desc, name limit (select o from lim)) x), '[]'),
    'behind_count', (select count(*) from b where behind_profile),
    'behind', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'title', x.title,
        'realised', greatest(0, x.realised_value), 'realised_percent', x.realised_percent) order by x.realised_percent nulls first, x.ref)
      from (select * from b where behind_profile order by realised_percent nulls first, ref limit (select n from lim)) x), '[]'),
    'overdue_count', (select count(*) from overdue),
    'overdue', coalesce((select jsonb_agg(to_jsonb(x) order by x.next_due_date, x.ref)
      from (select * from overdue order by next_due_date, ref limit (select n from lim)) x), '[]'))
  from totals t;
$$;

revoke all on function private.rb_programme_coverage(jsonb, jsonb), private.rb_benefits_value(jsonb, jsonb) from public, anon;
grant execute on function private.rb_programme_coverage(jsonb, jsonb), private.rb_benefits_value(jsonb, jsonb) to authenticated, service_role;

-- report_cover (G2): optional cover text from the block's config (cover_text, plain text up to
-- 2,000 characters), and the collection's name as the scope label.
create or replace function private.rb_report_cover(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'title', ctx ->> 'title', 'status', ctx ->> 'status', 'as_at', ctx ->> 'as_at',
    'forum_name', ctx -> 'forum' ->> 'name', 'meeting_date', ctx -> 'meeting' ->> 'meeting_date',
    'overall_rating', ctx ->> 'overall_rating', 'overall_rating_rationale', ctx ->> 'overall_rating_rationale',
    'author', (select pr.display_name from public.profiles pr where pr.id = (ctx ->> 'created_by')::uuid),
    'project_count', jsonb_array_length(coalesce(ctx -> 'project_ids', '[]')),
    'scope_label', case ctx ->> 'scope_type'
      when 'project' then (select p.code || ' ' || p.name from public.projects p where p.id = (ctx ->> 'scope_entity_id')::uuid)
      when 'programme' then (select g.name from public.programmes g where g.id = (ctx ->> 'scope_entity_id')::uuid)
      when 'portfolio' then (select f.name from public.portfolios f where f.id = (ctx ->> 'scope_entity_id')::uuid)
      when 'collection' then (select c.name from public.collections c where c.id = (ctx ->> 'scope_entity_id')::uuid)
      else jsonb_array_length(coalesce(ctx -> 'project_ids', '[]')) || ' projects' end,
    'scope_type', ctx ->> 'scope_type',
    'cover_text', nullif(left(btrim(coalesce(cfg ->> 'cover_text', '')), 2000), ''),
    'data_basis', ctx -> 'data_basis' ->> 'text');
$$;

-- =====================================================================================
-- C. "Funding committee" system template (G13): the funding pack's pages as blocks.
--    Every project in the collection gets a deep-dive: one always-true rule ("In this
--    collection": the evidenced rating is any value), ordered by programme, so the selection
--    panel still lets PMO exclude or reorder projects. Sample projects are never auto-included
--    (GL-9), as in every template.
-- =====================================================================================
insert into public.report_templates (organisation_id, name, description, forum_type, scope_type, is_system, blocks, selection_rules)
select null, 'Funding committee',
  'Funding collection pack: delivery at a glance, money and programme coverage against the pot, exceptions, milestones, benefits value, decisions, and a page per project.',
  'committee', 'collection', true, '[
  {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
  {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"dist","blockKey":"rating_distribution","blockVersion":1,"config":{},"placement":"report"},
  {"id":"budget","blockKey":"budget_summary","blockVersion":1,"config":{"show_projects":false},"placement":"report"},
  {"id":"coverage","blockKey":"programme_coverage","blockVersion":1,"config":{},"placement":"report"},
  {"id":"grid","blockKey":"project_status_grid","blockVersion":1,"config":{"only_exceptions":true},"placement":"report","pageBreakBefore":true},
  {"id":"divergence","blockKey":"divergence_list","blockVersion":1,"config":{},"placement":"report"},
  {"id":"milestones","blockKey":"milestone_timeline","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
  {"id":"benefits","blockKey":"benefits_value","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
  {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
  {"id":"decided","blockKey":"decisions_taken","blockVersion":1,"config":{},"placement":"report"},
  {"id":"dd-heading","blockKey":"section_heading","blockVersion":1,"config":{"title":"Project highlights"},"placement":"report","pageBreakBefore":true},
  {"id":"dd-overview","blockKey":"project_overview","blockVersion":1,"config":{"milestones_limit":6,"raid_limit":5},"placement":"deep_dive"}
 ]'::jsonb, '{"mode":"any","orderBy":"programme","rules":[
  {"id":"in_collection","label":"In this collection","metric":"evidenced_rating","op":"in","value":["green","amber","red","not_set"],"severity":1,"enabled":true}]}'::jsonb
where not exists (select 1 from public.report_templates where is_system and name = 'Funding committee');
