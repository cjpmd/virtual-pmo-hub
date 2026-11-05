-- Report builder, follow-up changes (docs/report-builder-decisions.md RB-16a, RB-11/32, RB-13,
-- RB-39). Additive only:
--   A1 published pack visibility per forum (members | organisation); ad hoc packs to the
--      creator and PMO / admins only.
--   A2 point-in-time metrics: project_metric_history (nightly), used for past as-at dates,
--      with a data-basis note per report.
--   A3 an organisation's own risk matrix can't be the default (until the register scores from
--      risk_matrices); forums and templates may name a matrix explicitly.
--   A7 scheduled drafts: a system-created marker and a notification outbox for the forum's
--      secretary / chair (else PMO), drained by the report-notify edge function.

-- ======================================================== A1. Published pack visibility
alter table public.forums
  add column published_pack_visibility text not null default 'members'
    check (published_pack_visibility in ('members', 'organisation'));
update public.forums set published_pack_visibility = 'members';

-- Readers of a report (replaces the Phase 1 rules for published packs):
--   PMO / admin of the report's workspace (organisation PMO / admin for organisation-wide
--   reports), the forum's chair or secretary: always.
--   Drafts, in review, approved: the editors and the creator.
--   Published / withdrawn, forum pack: forum members; everyone in the organisation when the
--   forum's published_pack_visibility is 'organisation'.
--   Published / withdrawn, ad hoc pack (no forum): the creator (plus PMO / admin above).
--   Partner organisations: unchanged (RB-15, RB-30).
create or replace function private.can_view_report(p_report uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  mine uuid[];
begin
  select rep.id, rep.organisation_id, rep.workspace_id, rep.forum_id, rep.status, rep.created_by, rep.scope_type, rep.scope_entity_id,
    f.published_pack_visibility
    into r from public.reports rep left join public.forums f on f.id = rep.forum_id where rep.id = p_report;
  if r.id is null then return false; end if;
  if (r.workspace_id is null and r.organisation_id = any (private.my_org_ids('pmo')))
    or r.workspace_id = any (private.my_workspace_ids('pmo')) then return true; end if;
  if r.forum_id is not null and private.forum_role_of(r.forum_id) in ('chair', 'secretary') then return true; end if;
  if r.created_by = (select auth.uid()) then return true; end if;
  if r.status in ('draft', 'in_review', 'approved') then
    return private.can_edit_report(p_report);
  end if;
  -- published / withdrawn
  mine := private.my_org_ids();
  if r.forum_id is not null then
    if private.forum_role_of(r.forum_id) is not null then return true; end if;
    if r.published_pack_visibility = 'organisation' and r.organisation_id = any (mine) then return true; end if;
  end if;
  return exists (
    select 1 from public.entity_shares s
    where s.partner_organisation_id = any (mine)
      and ((s.entity_type = 'report' and s.entity_id = r.id)
        or (s.entity_type = 'forum' and s.entity_id = r.forum_id)
        or (s.entity_type = r.scope_type and s.entity_id = r.scope_entity_id)));
end;
$$;

-- ============================================================ A3. Risk matrix default guard
-- Until the risk register scores from risk_matrices, only the system matrix is the default:
-- an organisation default would make report scoring differ from the register (RB-13a).
create function private.risk_matrix_default_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organisation_id is not null and new.is_default then
    raise exception 'An organisation''s own matrix can''t be the default yet: the risk register still scores from the organisation settings, so reports and the register would score risks differently. Choose the matrix on a forum or template instead.'
      using errcode = '23514', hint = 'org_matrix_default';
  end if;
  return new;
end;
$$;
revoke all on function private.risk_matrix_default_guard() from public, anon;
create trigger risk_matrices_05_default_guard before insert or update on public.risk_matrices
  for each row execute function private.risk_matrix_default_guard();
update public.risk_matrices set is_default = false where organisation_id is not null and is_default;

alter table public.forums add column risk_matrix_id uuid references public.risk_matrices (id) on delete set null;
create index forums_risk_matrix_idx on public.forums (risk_matrix_id);
alter table public.report_templates add column risk_matrix_key text;

-- The matrix a report uses: the forum's, else the template's (organisation, then system), else
-- the default (the system matrix).
create function private.report_matrix(p_forum uuid, p_template uuid, p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select to_jsonb(m) from public.forums f join public.risk_matrices m on m.id = f.risk_matrix_id
     where f.id = p_forum and (m.organisation_id is null or m.organisation_id = f.organisation_id)),
    (select to_jsonb(m) from public.report_templates t join public.risk_matrices m on m.key = t.risk_matrix_key
       and (m.organisation_id = p_org or m.organisation_id is null)
     where t.id = p_template order by m.organisation_id nulls last limit 1),
    private.org_risk_matrix(p_org));
$$;

-- ========================================================== A2. Point-in-time metrics
create table public.project_metric_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid not null,
  as_of date not null,
  metrics jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  unique (project_id, as_of)
);
create index project_metric_history_ws_idx on public.project_metric_history (workspace_id, organisation_id);
create index project_metric_history_org_idx on public.project_metric_history (organisation_id, as_of);
alter table public.project_metric_history enable row level security;
revoke all on public.project_metric_history from anon, authenticated;
grant select on public.project_metric_history to authenticated;
-- As health_snapshots: workspace members read; only the nightly job writes.
create policy project_metric_history_select on public.project_metric_history for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));

-- The Phase 2 wrapper becomes the live core; the public function adds the forum's matrix and
-- history for past as-at dates.
alter function public.project_metrics(uuid[], date, uuid, uuid) rename to project_metrics_v2;
alter function public.project_metrics_v2(uuid[], date, uuid, uuid) set schema private;
revoke all on function private.project_metrics_v2(uuid[], date, uuid, uuid) from public, anon;
grant execute on function private.project_metrics_v2(uuid[], date, uuid, uuid) to authenticated, service_role;

-- metrics._basis says where each project's figures came from:
--   {"source":"history","as_of":d}   every metric from the nightly history on or before as-at
--   {"source":"current","ratings":"as_at"} as-at in the past but no history: ratings from the
--                                    health snapshots on or before as-at, everything else current
--   {"source":"current"}             as-at today or later: everything current
-- Forum-dependent metrics (decisions / escalations for this forum) and rating_worsened (against
-- the previous pack) are always worked out now.
create function public.project_metrics(p_project_ids uuid[], p_as_at date, p_forum_id uuid default null,
  p_previous_report_id uuid default null)
returns table (project_id uuid, metrics jsonb)
language sql
stable
set search_path = ''
as $$
  with live as (
    select v.project_id, v.metrics from private.project_metrics_v2(p_project_ids, p_as_at, p_forum_id, p_previous_report_id) v
  ),
  proj as (
    select p.id, p.organisation_id, private.org_today(p.organisation_id) as today from public.projects p where p.id = any (p_project_ids)
  ),
  hist as (
    select distinct on (h.project_id) h.project_id, h.as_of, h.metrics
    from public.project_metric_history h join proj on proj.id = h.project_id
    where p_as_at < proj.today and h.as_of <= p_as_at
    order by h.project_id, h.as_of desc
  ),
  fm as (
    -- the forum's own matrix (only when it names one) rescored over open risks without their own matrix
    select r.project_id, max(private.matrix_score(m.mx, r.probability, r.impact)) as max_score,
      count(*) filter (where (private.matrix_band(m.mx, private.matrix_score(m.mx, r.probability, r.impact)) ->> 'top')::boolean) as top_band
    from (select to_jsonb(x) as mx from public.forums f join public.risk_matrices x on x.id = f.risk_matrix_id where f.id = p_forum_id) m
    join public.risks r on r.project_id = any (p_project_ids) and r.status = 'open' and r.risk_matrix_id is null
    group by r.project_id
  ),
  prev as (select s.entity_id, s.metrics from private.previous_report_metrics(p_previous_report_id) s)
  select l.project_id,
    case when h.project_id is not null then
      (h.metrics - '_basis')
      || jsonb_build_object(
           'open_decisions_for_forum', l.metrics -> 'open_decisions_for_forum',
           'escalations_for_forum', l.metrics -> 'escalations_for_forum',
           'rating_worsened', coalesce(private.rag_rank(h.metrics ->> 'evidenced_rating') > private.rag_rank(pv.metrics ->> 'evidenced_rating'),
              (h.metrics -> 'rating_worsened')::boolean, false),
           '_basis', jsonb_build_object('source', 'history', 'as_of', h.as_of))
    else
      l.metrics
      || case when p_forum_id is not null and exists (select 1 from fm) then
           jsonb_build_object('max_risk_score', coalesce((select fm.max_score from fm where fm.project_id = l.project_id), 0),
             'risks_in_top_band', coalesce((select fm.top_band from fm where fm.project_id = l.project_id), 0))
         else '{}'::jsonb end
      || jsonb_build_object('_basis', case when p_as_at < pr.today then '{"source":"current","ratings":"as_at"}'::jsonb
                                            else '{"source":"current"}'::jsonb end)
    end
  from live l join proj pr on pr.id = l.project_id
  left join hist h on h.project_id = l.project_id
  left join prev pv on pv.entity_id = l.project_id;
$$;
revoke all on function public.project_metrics(uuid[], date, uuid, uuid) from public, anon;
grant execute on function public.project_metrics(uuid[], date, uuid, uuid) to authenticated, service_role;

-- Nightly: every active project's metrics as at today (after the 02:15 health snapshots).
create function private.capture_project_metric_history(p_org uuid default null, p_date date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  n integer := 0;
  c integer;
begin
  for o in select id from public.organisations where p_org is null or id = p_org loop
    insert into public.project_metric_history (organisation_id, workspace_id, project_id, as_of, metrics)
    select p.organisation_id, p.workspace_id, pm.project_id, coalesce(p_date, private.org_today(o.id)), pm.metrics - '_basis'
    from public.project_metrics((select array_agg(x.id) from public.projects x
        where x.organisation_id = o.id and x.archived_at is null and x.state <> 'closed'),
      coalesce(p_date, private.org_today(o.id))) pm
    join public.projects p on p.id = pm.project_id
    on conflict (project_id, as_of) do update set metrics = excluded.metrics, created_at = now();
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end;
$$;
revoke all on function private.capture_project_metric_history(uuid, date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('vpmo-capture-project-metric-history', '40 2 * * *', 'select private.capture_project_metric_history()');
  end if;
end $$;

-- A short note on what the figures are as at (shown on the cover, in the viewer and in print).
create function private.report_data_basis(p_project_ids uuid[], p_as_at date, p_org uuid, p_status text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.org_today(p_org);
  v_total integer := coalesce(cardinality(p_project_ids), 0);
  v_hist integer;
  v_earliest date;
  v_when text := case when p_status in ('approved', 'published', 'withdrawn') then 'current at publish' else 'current (live)' end;
  d text := to_char(p_as_at, 'FMDD Mon YYYY');
  v_text text;
  v_source text;
begin
  if p_as_at >= v_today then
    return jsonb_build_object('source', 'current', 'text', 'All figures as at ' || to_char(v_today, 'FMDD Mon YYYY'));
  end if;
  select count(distinct h.project_id) into v_hist from public.project_metric_history h
  where h.project_id = any (p_project_ids) and h.as_of <= p_as_at;
  select min(h.as_of) into v_earliest from public.project_metric_history h where h.organisation_id = p_org;
  if v_total > 0 and v_hist = v_total then
    v_source := 'history';
    v_text := 'All figures as at ' || d;
  elsif v_hist = 0 then
    v_source := 'current';
    v_text := 'Ratings as at ' || d || '; financials and RAID ' || v_when
      || coalesce(' (no history before ' || to_char(v_earliest, 'FMDD Mon YYYY') || ')', ' (no history yet)');
  else
    v_source := 'mixed';
    v_text := 'Figures as at ' || d || ' for ' || v_hist || ' of ' || v_total || ' projects; for the rest, ratings as at ' || d
      || ', financials and RAID ' || v_when || coalesce(' (no history before ' || to_char(v_earliest, 'FMDD Mon YYYY') || ')', '');
  end if;
  return jsonb_build_object('source', v_source, 'text', v_text, 'history_projects', v_hist, 'projects', v_total, 'earliest', v_earliest);
end;
$$;
revoke all on function private.report_data_basis(uuid[], date, uuid, text) from public, anon;
grant execute on function private.report_data_basis(uuid[], date, uuid, text) to authenticated, service_role;

-- report_context: the matrix follows the forum / template (A3) and carries the data basis (A2).
create or replace function public.report_context(p_input jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  r public.reports;
  v_org uuid;
  v_projects uuid[];
  v_forum uuid;
  v_today date;
begin
  if p_input ? 'report_id' then
    select * into r from public.reports where id = (p_input ->> 'report_id')::uuid;
    if r.id is null then
      raise exception 'Report not found or not visible.' using errcode = '42501';
    end if;
  else
    r.organisation_id := (p_input ->> 'organisation_id')::uuid;
    r.scope_type := coalesce(p_input ->> 'scope_type', 'project');
    r.scope_entity_id := nullif(p_input ->> 'scope_entity_id', '')::uuid;
    r.scope_items := p_input -> 'scope_items';
    r.forum_id := nullif(p_input ->> 'forum_id', '')::uuid;
    r.template_id := nullif(p_input ->> 'template_id', '')::uuid;
    r.title := coalesce(p_input ->> 'title', 'Preview');
    r.status := 'draft';
    r.selection_rules := coalesce(p_input -> 'selection_rules', '{}');
    if r.organisation_id is null then
      select organisation_id into r.organisation_id from public.v_projects
      where id = any (private.scope_project_ids(r.scope_type, r.scope_entity_id, r.scope_items)) limit 1;
    end if;
    r.as_at := coalesce(nullif(p_input ->> 'as_at', '')::date, private.org_today(r.organisation_id));
  end if;
  v_org := r.organisation_id;
  v_forum := r.forum_id;
  v_today := private.org_today(v_org);
  v_projects := private.scope_project_ids(r.scope_type, r.scope_entity_id, r.scope_items);
  return jsonb_build_object(
    'report_id', r.id, 'organisation_id', v_org, 'workspace_id', r.workspace_id, 'title', r.title,
    'status', r.status, 'as_at', r.as_at, 'today', v_today, 'forum_id', v_forum, 'meeting_id', r.meeting_id,
    'scope_type', r.scope_type, 'scope_entity_id', r.scope_entity_id, 'project_ids', to_jsonb(v_projects),
    'previous_report_id', r.previous_report_id, 'created_by', r.created_by,
    'overall_rating', r.overall_rating, 'overall_rating_rationale', r.overall_rating_rationale,
    'scheme', private.report_scheme(r.rating_scheme_id, v_forum, p_input ->> 'rating_scheme_key', v_org),
    'matrix', private.report_matrix(v_forum, r.template_id, v_org),
    'data_basis', private.report_data_basis(v_projects, r.as_at, v_org, r.status::text),
    'currency', coalesce((select o.settings -> 'regional' ->> 'baseCurrency' from public.organisations o where o.id = v_org), 'GBP'),
    'included', coalesce((select jsonb_agg(i.entity_id order by i.sort_order nulls last) from public.report_inclusions i
                          where i.report_id = r.id and i.mode <> 'excluded'), '[]'::jsonb),
    'forum', (select jsonb_build_object('id', f.id, 'name', f.name, 'forum_type', f.forum_type, 'tolerances', f.tolerances,
                'approval_required', f.approval_required, 'workspace_id', f.workspace_id)
              from public.forums f where f.id = v_forum),
    'meeting', (select jsonb_build_object('id', m.id, 'meeting_date', m.meeting_date, 'papers_deadline', m.papers_deadline, 'status', m.status)
                from public.meetings m where m.id = r.meeting_id)
  );
end;
$$;

-- The cover shows the data basis.
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
      else jsonb_array_length(coalesce(ctx -> 'project_ids', '[]')) || ' projects' end,
    'scope_type', ctx ->> 'scope_type',
    'data_basis', ctx -> 'data_basis' ->> 'text');
$$;

-- Published packs keep their note: stored as the '__basis' snapshot when the status becomes
-- published (inside publish_report's transaction).
create function private.snapshot_data_basis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    insert into public.report_snapshots (report_id, block_instance_id, block_key, data)
    values (new.id, '__basis', '__basis', private.report_data_basis(
      private.scope_project_ids(new.scope_type, new.scope_entity_id, new.scope_items), new.as_at, new.organisation_id, 'published'))
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_data_basis() from public, anon;
create trigger reports_20_snapshot_data_basis after update of status on public.reports
  for each row execute function private.snapshot_data_basis();

-- changes_since_last: where the previous pack has no metric snapshot, compare with the metric
-- history on or before its as-at date.
create or replace function private.rb_changes_since_last(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with prev as (
    select r.id, r.title, r.as_at, r.published_at from public.reports r where r.id = nullif(ctx ->> 'previous_report_id', '')::uuid
  ),
  curr as (
    select pm.project_id, pm.metrics from public.project_metrics(private.rb_projects(ctx), (ctx ->> 'as_at')::date,
      nullif(ctx ->> 'forum_id', '')::uuid, nullif(ctx ->> 'previous_report_id', '')::uuid) pm
  ),
  snap as (
    select s.entity_id, s.metrics from public.report_metric_snapshots s, prev
    where s.report_id = prev.id and s.entity_type = 'project'
  ),
  prevm as (
    select * from snap
    union all
    select h.project_id, h.metrics || jsonb_build_object('_basis', jsonb_build_object('source', 'history', 'as_of', h.as_of))
    from (select distinct on (h.project_id) h.project_id, h.as_of, h.metrics
          from public.project_metric_history h, prev
          where not exists (select 1 from snap) and h.project_id = any (private.rb_projects(ctx)) and h.as_of <= prev.as_at
          order by h.project_id, h.as_of desc) h
  )
  select case when (select id from prev) is null then jsonb_build_object('previous', null) else jsonb_build_object(
    'previous', (select jsonb_build_object('id', id, 'title', title, 'as_at', as_at, 'published_at', published_at) from prev),
    'previous_basis', case when exists (select 1 from snap) then 'snapshot' when exists (select 1 from prevm) then 'history' else 'none' end,
    'projects', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name, 'prev', pv.metrics, 'curr', c.metrics,
        'prev_included', exists (select 1 from public.report_inclusions i, prev where i.report_id = prev.id and i.entity_id = p.id and i.mode <> 'excluded'),
        'curr_included', exists (select 1 from public.report_inclusions i where i.report_id = nullif(ctx ->> 'report_id', '')::uuid and i.entity_id = p.id and i.mode <> 'excluded'))
      order by p.name)
      from public.projects p left join curr c on c.project_id = p.id left join prevm pv on pv.entity_id = p.id
      where (c.project_id is not null or pv.entity_id is not null) and (nullif(ctx ->> 'entity_id', '') is null or p.id = (ctx ->> 'entity_id')::uuid)), '[]'),
    'decisions_made', (select count(*) from public.decisions d, prev where d.status = 'made' and d.recorded_at >= prev.published_at
      and (coalesce(d.decided_by_forum_id, d.forum_id) = nullif(ctx ->> 'forum_id', '')::uuid or d.project_id = any (private.rb_projects(ctx)))),
    'actions_closed', (select count(*) from public.forum_actions a, prev where a.forum_id = nullif(ctx ->> 'forum_id', '')::uuid and a.closed_at >= prev.published_at),
    'actions_overdue', (select count(*) from public.forum_actions a where a.forum_id = nullif(ctx ->> 'forum_id', '')::uuid and a.status = 'open'
      and a.due_date < (ctx ->> 'as_at')::date)) end;
$$;

-- ====================================================== A7. Scheduled draft notifications
-- Outbox: one 'draft_ready' row per report (unique), drained by the report-notify edge
-- function (service role), which emails each recipient once (Resend idempotency key
-- report-<id>-draft-ready/<n>) and marks the row sent.
create table public.report_notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid,
  report_id uuid not null,
  kind text not null check (kind in ('draft_ready')),
  recipients jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  result jsonb,
  unique (report_id, kind),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
create index report_notifications_report_idx on public.report_notifications (report_id, organisation_id);
create index report_notifications_ws_idx on public.report_notifications (workspace_id, organisation_id);
create index report_notifications_pending_idx on public.report_notifications (created_at) where sent_at is null;
create trigger report_notifications_00_tenant_guard before insert on public.report_notifications
  for each row execute function private.tenant_guard('report_id', 'reports');
alter table public.report_notifications enable row level security;
revoke all on public.report_notifications from anon, authenticated;
grant select on public.report_notifications to authenticated;
create policy report_notifications_select on public.report_notifications for select to authenticated
  using ((select private.can_view_report(report_id)));

-- Who hears about an automatically drafted pack: the forum's secretary and chair; the PMO /
-- admins of the forum's workspace (or organisation) when it has neither.
create function private.draft_pack_recipients(p_report uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (select * from public.reports where id = p_report),
  roles as (
    select pr.id as profile_id, pr.email, pr.display_name, fm.role::text as role
    from r join public.forum_members fm on fm.forum_id = r.forum_id and fm.role in ('chair', 'secretary')
    join public.resources res on res.id = fm.resource_id join public.profiles pr on pr.id = res.profile_id
    union
    select pr.id, pr.email, pr.display_name, 'chair'
    from r join public.forums f on f.id = r.forum_id join public.resources res on res.id = f.chair_resource_id
    join public.profiles pr on pr.id = res.profile_id
  ),
  pmo as (
    select distinct pr.id as profile_id, pr.email, pr.display_name, 'pmo' as role
    from r join public.organisation_members om on om.organisation_id = r.organisation_id and om.role >= 'pmo'
    join public.profiles pr on pr.id = om.profile_id
    union
    select distinct pr.id, pr.email, pr.display_name, 'pmo'
    from r join public.workspace_members wm on wm.workspace_id = r.workspace_id and wm.role >= 'pmo'
    join public.profiles pr on pr.id = wm.profile_id
  )
  select coalesce(jsonb_agg(distinct jsonb_build_object('profile_id', x.profile_id, 'email', x.email, 'name', x.display_name, 'role', x.role)), '[]')
  from (select * from roles union all select * from pmo where not exists (select 1 from roles)) x
  where coalesce(x.email, '') <> '';
$$;
revoke all on function private.draft_pack_recipients(uuid) from public, anon, authenticated;

-- The scheduled job (replaces RB-39's): marks the creator as the system in the 'created' event
-- and queues the notification.
create or replace function private.create_scheduled_packs()
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
    values (v_id, 'created', null, jsonb_build_object('scheduled', true, 'system', true, 'creator', 'system', 'meeting_id', m.meeting_id));
    insert into public.report_notifications (report_id, kind, recipients)
    values (v_id, 'draft_ready', private.draft_pack_recipients(v_id))
    on conflict (report_id, kind) do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function private.create_scheduled_packs() from public, anon, authenticated;

-- Service role: pending notifications (with what the email needs) and marking them sent.
create function public.pending_report_notifications()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'report_id', n.report_id, 'kind', n.kind, 'recipients', n.recipients,
      'title', r.title, 'forum', f.name, 'meeting_date', m.meeting_date, 'as_at', r.as_at,
      'deep_dives', (select count(*) from public.report_inclusions i where i.report_id = r.id and i.mode <> 'excluded'))
    order by n.created_at), '[]')
  from public.report_notifications n join public.reports r on r.id = n.report_id
  left join public.forums f on f.id = r.forum_id left join public.meetings m on m.id = r.meeting_id
  where n.sent_at is null;
$$;

create function public.mark_report_notification_sent(p_id uuid, p_result jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.report_notifications set sent_at = now(), result = p_result where id = p_id and sent_at is null;
$$;
revoke all on function public.pending_report_notifications(), public.mark_report_notification_sent(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.pending_report_notifications(), public.mark_report_notification_sent(uuid, jsonb) to service_role;

-- Drafts the system created, for the in-app notification feed (only editors see drafts).
create function public.my_system_drafted_packs()
returns table (report_id uuid, title text, created_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select r.id, r.title, r.created_at from public.reports r
  where r.status = 'draft' and r.created_by is null
    and exists (select 1 from public.report_events e where e.report_id = r.id and e.event = 'created' and (e.payload ->> 'system')::boolean)
  order by r.created_at desc limit 20;
$$;
revoke all on function public.my_system_drafted_packs() from public, anon;
grant execute on function public.my_system_drafted_packs() to authenticated, service_role;

revoke all on function private.report_matrix(uuid, uuid, uuid), private.snapshot_data_basis() from public, anon;
grant execute on function private.report_matrix(uuid, uuid, uuid) to authenticated, service_role;
