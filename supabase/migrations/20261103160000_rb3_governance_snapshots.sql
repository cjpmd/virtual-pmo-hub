-- Report builder, Phase 3: lifecycle, snapshots, publish, diffs, meeting capture, distribution
-- and print tokens (docs/report-builder-spec.md §9.3, §10, §11, §12). Additive only.

-- ===================================================================== 1. Snapshots
create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid,
  report_id uuid not null,
  block_instance_id text not null,
  block_key text not null,
  entity_id uuid,
  data jsonb not null,
  metrics jsonb,
  -- partner-unsafe block, hidden by the instance, or listed by a share: partners never read it
  hidden_from_partners boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
create unique index report_snapshots_one on public.report_snapshots
  (report_id, block_instance_id, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index report_snapshots_report_idx on public.report_snapshots (report_id, organisation_id);
create index report_snapshots_ws_idx on public.report_snapshots (workspace_id, organisation_id);

create table public.report_metric_snapshots (
  organisation_id uuid not null,
  workspace_id uuid,
  report_id uuid not null,
  entity_type text not null check (entity_type in ('project', 'programme', 'risk')),
  entity_id uuid not null,
  metrics jsonb not null,
  created_at timestamptz not null default now(),
  primary key (report_id, entity_type, entity_id),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
create index report_metric_snapshots_report_idx on public.report_metric_snapshots (report_id, organisation_id);
create index report_metric_snapshots_ws_idx on public.report_metric_snapshots (workspace_id, organisation_id);

-- Immutable after insert (§5.3).
create function private.snapshot_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Published snapshots can''t be changed or deleted.' using errcode = '42501';
end;
$$;
revoke all on function private.snapshot_immutable() from public, anon;
create trigger report_snapshots_immutable before update or delete on public.report_snapshots
  for each row execute function private.snapshot_immutable();
create trigger report_metric_snapshots_immutable before update or delete on public.report_metric_snapshots
  for each row execute function private.snapshot_immutable();
create trigger report_snapshots_00_tenant_guard before insert on public.report_snapshots
  for each row execute function private.tenant_guard('report_id', 'reports');
create trigger report_metric_snapshots_00_tenant_guard before insert on public.report_metric_snapshots
  for each row execute function private.tenant_guard('report_id', 'reports');

-- Blocks partner organisations never receive (TS: partnerSafe = false). Kept in step by
-- src/features/reports/blocks/partner-safety.test.ts.
create function private.partner_unsafe_blocks()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['resource_summary', 'data_quality']; $$;

alter table public.report_snapshots enable row level security;
alter table public.report_metric_snapshots enable row level security;
revoke all on public.report_snapshots, public.report_metric_snapshots from anon, authenticated;
grant select on public.report_snapshots, public.report_metric_snapshots to authenticated;
-- Inserts come only from publish_report (definer). Partners read only what they may see.
create policy report_snapshots_select on public.report_snapshots for select to authenticated
  using ((select private.can_view_report(report_id))
    and (not (select private.is_partner_viewer(report_id))
         or (not hidden_from_partners and not (block_key = any ((select private.partner_hidden_blocks(report_id))::text[])))));
create policy report_metric_snapshots_select on public.report_metric_snapshots for select to authenticated
  using ((select private.can_view_report(report_id)) and not (select private.is_partner_viewer(report_id)));

-- Previous report metrics now come from its snapshot (replaces the Phase 1 stub).
create or replace function private.previous_report_metrics(p_report uuid)
returns table (entity_id uuid, metrics jsonb)
language sql
stable
set search_path = ''
as $$
  select s.entity_id, s.metrics from public.report_metric_snapshots s
  where s.report_id = p_report and s.entity_type = 'project';
$$;

-- ================================================================ 2. Phase 3 blocks
-- changes_since_last: raw previous / current metrics and inclusion per project; the diff itself
-- is src/features/reports/engine/diff.ts (one implementation, unit-tested), applied to this.
create function private.rb_changes_since_last(ctx jsonb, cfg jsonb)
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
  prevm as (
    select s.entity_id, s.metrics from public.report_metric_snapshots s, prev
    where s.report_id = prev.id and s.entity_type = 'project'
  )
  select case when (select id from prev) is null then jsonb_build_object('previous', null) else jsonb_build_object(
    'previous', (select jsonb_build_object('id', id, 'title', title, 'as_at', as_at, 'published_at', published_at) from prev),
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

-- raid_movement: new, closed and re-scored risks and issues since the previous published pack
-- (scores at that pack come from its risk metric snapshots).
create function private.rb_raid_movement(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with prev as (
    select r.id, r.published_at from public.reports r where r.id = nullif(ctx ->> 'previous_report_id', '')::uuid
  ),
  since as (select coalesce((select published_at from prev), ((ctx ->> 'as_at')::date - 31)::timestamptz) as at),
  risks as (
    select r.id, r.ref, r.title, p.code as project_code, r.status::text as status, r.created_at, r.closed_at,
      private.matrix_score(ctx -> 'matrix', r.probability, r.impact) as score,
      (select (s.metrics ->> 'score')::int from public.report_metric_snapshots s, prev where s.report_id = prev.id and s.entity_type = 'risk' and s.entity_id = r.id) as prev_score
    from public.risks r join public.projects p on p.id = r.project_id where r.project_id = any (private.rb_projects(ctx))
  )
  select jsonb_build_object('since', (select at from since), 'has_previous', (select id from prev) is not null,
    'new', coalesce((select jsonb_agg(jsonb_build_object('kind', 'risk', 'ref', ref, 'title', title, 'project_code', project_code, 'score', score,
        'band', private.matrix_band(ctx -> 'matrix', score) ->> 'label') order by score desc) from risks, since where created_at > since.at), '[]')
      || coalesce((select jsonb_agg(jsonb_build_object('kind', 'issue', 'ref', i.ref, 'title', i.title, 'project_code', p.code, 'severity', i.severity))
        from public.issues i join public.projects p on p.id = i.project_id, since where i.project_id = any (private.rb_projects(ctx)) and i.created_at > since.at), '[]'),
    'closed', coalesce((select jsonb_agg(jsonb_build_object('kind', 'risk', 'ref', ref, 'title', title, 'project_code', project_code)) from risks, since where closed_at > since.at), '[]')
      || coalesce((select jsonb_agg(jsonb_build_object('kind', 'issue', 'ref', i.ref, 'title', i.title, 'project_code', p.code))
        from public.issues i join public.projects p on p.id = i.project_id, since where i.project_id = any (private.rb_projects(ctx)) and i.closed_at > since.at), '[]'),
    'rescored', coalesce((select jsonb_agg(jsonb_build_object('ref', ref, 'title', title, 'project_code', project_code, 'from', prev_score, 'to', score,
        'from_band', private.matrix_band(ctx -> 'matrix', prev_score) ->> 'label', 'to_band', private.matrix_band(ctx -> 'matrix', score) ->> 'label') order by abs(score - prev_score) desc)
      from risks where status = 'open' and prev_score is not null and prev_score <> score), '[]'));
$$;

-- decisions_taken: decisions made at the previous meeting count too (on or after its date).
create or replace function private.rb_decisions_taken(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('since', private.rb_since(ctx), 'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.decision_date desc, x.ref), '[]')) from (
    select d.id, d.ref, d.title, d.decision_date, d.rationale, o.title as chosen_option, p.code as project_code,
      d.decided_meeting_id, d.report_id
    from public.decisions d
    left join public.decision_options o on o.id = d.chosen_option_id
    left join public.projects p on p.id = d.project_id
    where d.status = 'made' and d.decision_date >= private.rb_since(ctx)
      and ((nullif(ctx ->> 'forum_id', '') is not null and coalesce(d.decided_by_forum_id, d.forum_id) = (ctx ->> 'forum_id')::uuid
            and (d.project_id is null or d.project_id = any (private.rb_projects(ctx)) or nullif(ctx ->> 'entity_id', '') is null))
        or (nullif(ctx ->> 'forum_id', '') is null and d.project_id = any (private.rb_projects(ctx))))) x;
$$;

-- ================================================================ 3. Lifecycle (§10)
create function private.report_event(p_report uuid, p_event text, p_payload jsonb default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.report_events (report_id, event, actor, payload) values (p_report, p_event, (select auth.uid()), p_payload);
$$;

create function public.submit_report(p_report_id uuid)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
  v_scheme jsonb;
begin
  select * into r from public.reports where id = p_report_id for update;
  if r.id is null or not private.can_edit_report(r.id) then
    raise exception 'You can''t submit this report.' using errcode = '42501';
  end if;
  if r.status <> 'draft' then
    raise exception 'Only a draft can be submitted (this one is %).', r.status using errcode = '22023';
  end if;
  if r.forum_id is null then
    raise exception 'An ad hoc report has no forum to review it: publish it directly.' using errcode = '22023';
  end if;
  v_scheme := private.report_scheme(r.rating_scheme_id, r.forum_id, null, r.organisation_id);
  if coalesce((v_scheme ->> 'is_assurance')::boolean, false) and r.overall_rating is null then
    raise exception 'Set the overall rating and rationale first: this forum uses %.', v_scheme ->> 'name' using errcode = '22023';
  end if;
  if exists (select 1 from public.report_narratives n where n.report_id = r.id and n.source = 'ai_draft') then
    raise exception 'Review the AI draft first: edit it or mark it reviewed.' using errcode = '22023';
  end if;
  update public.reports set status = 'in_review', submitted_at = now() where id = r.id returning * into r;
  perform private.report_event(r.id, 'submitted');
  return r;
end;
$$;

create function public.return_report(p_report_id uuid, p_comment text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  select * into r from public.reports where id = p_report_id for update;
  if r.id is null or not (private.can_approve_report(r.id) or private.can_publish_report(r.id)) then
    raise exception 'The chair, secretary or PMO returns a report.' using errcode = '42501';
  end if;
  if r.status not in ('in_review', 'approved') then
    raise exception 'Only a report in review or approved can be returned.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_comment, ''))) = 0 then
    raise exception 'Say what needs changing.' using errcode = '22023';
  end if;
  update public.reports set status = 'draft', approved_at = null, approved_by = null where id = r.id returning * into r;
  perform private.report_event(r.id, 'returned', jsonb_build_object('comment', btrim(p_comment)));
  return r;
end;
$$;

create function public.approve_report(p_report_id uuid)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  select * into r from public.reports where id = p_report_id for update;
  if r.id is null or not private.can_approve_report(r.id) then
    raise exception 'The forum''s chair approves (PMO when the forum has no chair or doesn''t require approval).' using errcode = '42501';
  end if;
  if r.status <> 'in_review' then
    raise exception 'Only a report in review can be approved.' using errcode = '22023';
  end if;
  update public.reports set status = 'approved', approved_at = now(), approved_by = (select auth.uid()) where id = r.id returning * into r;
  perform private.report_event(r.id, 'approved');
  return r;
end;
$$;

create function public.withdraw_report(p_report_id uuid, p_reason text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  select * into r from public.reports where id = p_report_id for update;
  if r.id is null or not private.is_report_pmo(r.id) then
    raise exception 'PMO or admins withdraw a published report.' using errcode = '42501';
  end if;
  if r.status <> 'published' then
    raise exception 'Only a published report can be withdrawn.' using errcode = '22023';
  end if;
  update public.reports set status = 'withdrawn' where id = r.id returning * into r;
  perform private.report_event(r.id, 'withdrawn', jsonb_build_object('reason', nullif(btrim(coalesce(p_reason, '')), '')));
  return r;
end;
$$;

-- Publish (§10.1): one transaction. Re-evaluates the selection, resolves every block
-- (report-level once, deep-dives per included project), stores the snapshots and every
-- in-scope project's metrics (plus open risk scores, for raid_movement), then sets published.
create function public.publish_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
  ctx jsonb;
  b jsonb;
  v_entity uuid;
  v_data jsonb;
  v_hidden text[];
  v_size bigint;
  v_blocks int := 0;
  v_unsafe text[] := private.partner_unsafe_blocks();
begin
  select * into r from public.reports where id = p_report_id for update;
  if r.id is null or not private.can_publish_report(r.id) then
    raise exception 'PMO or the forum''s secretary publishes.' using errcode = '42501';
  end if;
  if not (r.status = 'approved' or (r.status = 'draft' and r.forum_id is null)) then
    raise exception 'Only an approved report (or an ad hoc draft) can be published; this one is %.', r.status using errcode = '22023';
  end if;
  if exists (select 1 from public.report_narratives n where n.report_id = r.id and n.source = 'ai_draft') then
    raise exception 'Review the AI draft first: edit it or mark it reviewed.' using errcode = '22023';
  end if;

  perform private.compute_inclusions(r.id);
  ctx := public.report_context(jsonb_build_object('report_id', r.id));
  v_hidden := private.partner_hidden_blocks(r.id);

  for b in select value from jsonb_array_elements(r.blocks) loop
    if coalesce(b ->> 'placement', 'report') = 'deep_dive' then
      for v_entity in select i.entity_id from public.report_inclusions i where i.report_id = r.id and i.mode <> 'excluded' order by i.sort_order loop
        v_data := public.report_block_data(jsonb_build_object('report_id', r.id), b, v_entity);
        insert into public.report_snapshots (report_id, block_instance_id, block_key, entity_id, data, hidden_from_partners)
        values (r.id, b ->> 'id', b ->> 'blockKey', v_entity, v_data,
          coalesce((b ->> 'hideFromPartners')::boolean, false) or (b ->> 'blockKey') = any (v_unsafe));
        v_blocks := v_blocks + 1;
      end loop;
    else
      v_data := public.report_block_data(jsonb_build_object('report_id', r.id), b, null);
      insert into public.report_snapshots (report_id, block_instance_id, block_key, entity_id, data, hidden_from_partners)
      values (r.id, b ->> 'id', b ->> 'blockKey', null, v_data,
        coalesce((b ->> 'hideFromPartners')::boolean, false) or (b ->> 'blockKey') = any (v_unsafe));
      v_blocks := v_blocks + 1;
    end if;
  end loop;

  -- Changes since the previous pack, always stored (movement markers), and the pack's meta.
  insert into public.report_snapshots (report_id, block_instance_id, block_key, data)
  values (r.id, '__changes', 'changes_since_last', public.report_block_data(jsonb_build_object('report_id', r.id),
    '{"id":"__changes","blockKey":"changes_since_last","config":{}}', null));
  insert into public.report_snapshots (report_id, block_instance_id, block_key, data)
  values (r.id, '__meta', '__meta', jsonb_build_object(
    'scheme', ctx -> 'scheme', 'forum', ctx -> 'forum', 'meeting', ctx -> 'meeting', 'as_at', ctx ->> 'as_at',
    'project_ids', ctx -> 'project_ids', 'previous_report_id', ctx ->> 'previous_report_id',
    'deep_dives', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'mode', i.mode,
        'reasons', (select coalesce(jsonb_agg(jsonb_build_object('label', x ->> 'label', 'ruleId', x ->> 'rule_id', 'metric', x ->> 'metric',
          'op', x ->> 'op', 'value', x -> 'value', 'threshold', x -> 'threshold', 'severity', x -> 'severity')), '[]') from jsonb_array_elements(i.reasons) x))
      order by i.sort_order)
      from public.report_inclusions i join public.projects p on p.id = i.entity_id where i.report_id = r.id and i.mode <> 'excluded'), '[]')));

  insert into public.report_metric_snapshots (report_id, entity_type, entity_id, metrics)
  select r.id, 'project', pm.project_id, pm.metrics
  from public.project_metrics(private.scope_project_ids(r.scope_type, r.scope_entity_id, r.scope_items), r.as_at, r.forum_id, r.previous_report_id) pm;
  insert into public.report_metric_snapshots (report_id, entity_type, entity_id, metrics)
  select r.id, 'risk', k.id, jsonb_build_object('score', private.matrix_score(ctx -> 'matrix', k.probability, k.impact), 'status', k.status)
  from public.risks k where k.project_id = any (private.scope_project_ids(r.scope_type, r.scope_entity_id, r.scope_items)) and k.status = 'open';

  select sum(pg_column_size(s.data)) into v_size from public.report_snapshots s where s.report_id = r.id;
  if v_size > 2 * 1024 * 1024 then
    raise exception 'This pack is too large to publish (% MB of snapshot data; the limit is 2 MB). Reduce deep-dives or block limits.',
      round(v_size / 1048576.0, 1) using errcode = '54000';
  end if;

  update public.reports set status = 'published', published_at = now(), published_by = (select auth.uid()) where id = r.id returning * into r;
  perform private.report_event(r.id, 'published', jsonb_build_object('blocks', v_blocks, 'bytes', v_size));
  return jsonb_build_object('report_id', r.id, 'blocks', v_blocks, 'bytes', v_size, 'published_at', r.published_at);
end;
$$;

-- ======================================================== 4. Meeting capture (§9.3, J4)
-- Record a decision's outcome during the meeting: the existing record_decision rules apply,
-- then the decision is linked to the meeting and the pack. The snapshot is not changed.
create function public.record_meeting_decision(p_report_id uuid, p_decision_id uuid, p_option_id uuid, p_outcome text,
  p_actions jsonb default '[]'::jsonb)
returns public.decisions
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
  d public.decisions;
  v_date date;
begin
  select * into r from public.reports where id = p_report_id;
  if r.id is null or not private.can_view_report(r.id) then
    raise exception 'Report not found.' using errcode = '42501';
  end if;
  if r.status not in ('published', 'approved') then
    raise exception 'Decisions are recorded against an approved or published pack.' using errcode = '22023';
  end if;
  v_date := least(coalesce((select m.meeting_date from public.meetings m where m.id = r.meeting_id), private.org_today(r.organisation_id)),
    private.org_today(r.organisation_id));
  d := public.record_decision(p_decision_id, p_option_id, p_outcome, v_date, null, null, coalesce(p_actions, '[]'::jsonb), null);
  update public.decisions set report_id = r.id, decided_meeting_id = r.meeting_id where id = d.id returning * into d;
  return d;
end;
$$;

-- Add a meeting action against the pack's forum and meeting.
create function public.add_meeting_action(p_report_id uuid, p_title text, p_owner_id uuid, p_due_date date, p_project_id uuid default null)
returns public.forum_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
  a public.forum_actions;
begin
  select * into r from public.reports where id = p_report_id;
  if r.id is null or r.forum_id is null then
    raise exception 'Actions belong to a forum''s pack.' using errcode = '22023';
  end if;
  if not private.can_write_forum_action(r.forum_id) then
    raise exception 'The chair, secretary or PMO records actions.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'Describe the action.' using errcode = '22023';
  end if;
  insert into public.forum_actions (forum_id, meeting_id, report_id, project_id, title, owner_id, due_date)
  values (r.forum_id, r.meeting_id, r.id, p_project_id, btrim(p_title), p_owner_id, p_due_date) returning * into a;
  return a;
end;
$$;

-- ==================================================================== 5. Distribution (§12)
-- Recipients: forum members except contributors (RB-21) with an account, plus partner
-- organisation members when the forum or report is shared. Service role only.
create function public.report_distribution(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with r as (select * from public.reports where id = p_report_id),
  members as (
    select distinct pr.email, pr.display_name, false as partner
    from r join public.forum_members fm on fm.forum_id = r.forum_id
    join public.resources res on res.id = fm.resource_id
    join public.profiles pr on pr.id = res.profile_id
    where fm.role <> 'contributor' and coalesce(pr.email, '') <> ''
    union
    select pr.email, pr.display_name, false
    from r join public.forums f on f.id = r.forum_id join public.resources res on res.id = f.chair_resource_id
    join public.profiles pr on pr.id = res.profile_id where coalesce(pr.email, '') <> ''
    union
    select pr.email, pr.display_name, true
    from r join public.entity_shares s on (s.entity_type = 'report' and s.entity_id = r.id) or (s.entity_type = 'forum' and s.entity_id = r.forum_id)
    join public.organisation_members om on om.organisation_id = s.partner_organisation_id
    join public.profiles pr on pr.id = om.profile_id where coalesce(pr.email, '') <> ''
  ),
  missing as (
    select res.name from r join public.forum_members fm on fm.forum_id = r.forum_id
    join public.resources res on res.id = fm.resource_id
    left join public.profiles pr on pr.id = res.profile_id
    where fm.role <> 'contributor' and coalesce(pr.email, '') = ''
  )
  select jsonb_build_object(
    'report', (select jsonb_build_object('id', r.id, 'title', r.title, 'status', r.status, 'as_at', r.as_at, 'overall_rating', r.overall_rating,
       'organisation_id', r.organisation_id, 'forum', (select f.name from public.forums f where f.id = r.forum_id),
       'meeting_date', (select m.meeting_date from public.meetings m where m.id = r.meeting_id),
       'scheme', private.report_scheme(r.rating_scheme_id, r.forum_id, null, r.organisation_id)) from r),
    'summary', (select left(coalesce(n.body ->> 'text', ''), 300) from r join public.report_narratives n on n.report_id = r.id
       join lateral jsonb_array_elements(r.blocks) b on b ->> 'id' = n.block_instance_id and b ->> 'blockKey' = 'executive_summary'
       where n.entity_id is null limit 1),
    'counts', (select jsonb_build_object(
       'exceptions', (select count(*) from public.report_inclusions i where i.report_id = r.id and i.mode <> 'excluded'),
       'decisions', (select count(*) from public.decisions d where d.status = 'pending' and d.forum_id = r.forum_id)) from r),
    'recipients', coalesce((select jsonb_agg(jsonb_build_object('email', email, 'name', display_name, 'partner', partner)) from members), '[]'),
    'without_account', coalesce((select jsonb_agg(name) from missing), '[]'),
    'already_distributed', exists (select 1 from public.report_events e where e.report_id = p_report_id and e.event = 'distributed'),
    'pdf_path', (select payload ->> 'path' from public.report_events e where e.report_id = p_report_id and e.event = 'pdf_generated'
       order by e.created_at desc limit 1));
$$;

create function public.record_report_event(p_report_id uuid, p_event text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.report_events (report_id, event, actor, payload) values (p_report_id, p_event, null, p_payload);
$$;

-- ======================================================== 6. Print tokens (server PDF, §11)
create table private.report_print_tokens (
  token_hash bytea primary key,
  report_id uuid not null references public.reports (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table private.report_print_tokens enable row level security;
create index report_print_tokens_report_idx on private.report_print_tokens (report_id);

-- Service role: a short-lived token that lets the print route render one published pack.
create function public.issue_report_print_token(p_report_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not exists (select 1 from public.reports where id = p_report_id and status = 'published') then
    raise exception 'Only a published report can be printed by the server.' using errcode = '22023';
  end if;
  delete from private.report_print_tokens where expires_at < now();
  insert into private.report_print_tokens (token_hash, report_id, expires_at)
  values (extensions.digest(v_token, 'sha256'), p_report_id, now() + interval '10 minutes');
  return v_token;
end;
$$;

-- The print route's read with a token instead of a session (anon). Partner-safe content only
-- matters for partner viewers; the token is issued for internal distribution, so it returns
-- every snapshot.
create function public.report_snapshot_by_token(p_report_id uuid, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (select 1 from private.report_print_tokens t where t.report_id = p_report_id
      and t.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256') and t.expires_at > now())
    then jsonb_build_object(
      'report', (select to_jsonb(r) - 'created_by' - 'approved_by' - 'published_by' from public.reports r where r.id = p_report_id),
      'snapshots', (select coalesce(jsonb_agg(jsonb_build_object('block_instance_id', s.block_instance_id, 'entity_id', s.entity_id, 'data', s.data)), '[]')
        from public.report_snapshots s where s.report_id = p_report_id))
    end;
$$;

-- Generated PDFs: report-pdfs/<organisation>/<report>.pdf, read by anyone who can view the report.
insert into storage.buckets (id, name, public) values ('report-pdfs', 'report-pdfs', false) on conflict (id) do nothing;
create policy report_pdfs_select on storage.objects for select to authenticated
  using (bucket_id = 'report-pdfs' and private.can_view_report(private.try_uuid(replace(storage.filename(name), '.pdf', ''))));

-- ========================================================================== 7. Grants
revoke all on function private.partner_unsafe_blocks(), private.rb_changes_since_last(jsonb, jsonb), private.rb_raid_movement(jsonb, jsonb),
  private.report_event(uuid, text, jsonb) from public, anon;
grant execute on function private.partner_unsafe_blocks(), private.rb_changes_since_last(jsonb, jsonb), private.rb_raid_movement(jsonb, jsonb)
  to authenticated, service_role;
revoke all on function public.submit_report(uuid), public.return_report(uuid, text), public.approve_report(uuid), public.withdraw_report(uuid, text),
  public.publish_report(uuid), public.record_meeting_decision(uuid, uuid, uuid, text, jsonb), public.add_meeting_action(uuid, text, uuid, date, uuid),
  public.report_distribution(uuid), public.record_report_event(uuid, text, jsonb), public.issue_report_print_token(uuid),
  public.report_snapshot_by_token(uuid, text) from public, anon;
grant execute on function public.submit_report(uuid), public.return_report(uuid, text), public.approve_report(uuid), public.withdraw_report(uuid, text),
  public.publish_report(uuid), public.record_meeting_decision(uuid, uuid, uuid, text, jsonb), public.add_meeting_action(uuid, text, uuid, date, uuid)
  to authenticated, service_role;
-- Service role only (Supabase's default privileges grant new public functions to authenticated).
revoke all on function public.report_distribution(uuid), public.record_report_event(uuid, text, jsonb), public.issue_report_print_token(uuid)
  from authenticated;
grant execute on function public.report_distribution(uuid), public.record_report_event(uuid, text, jsonb), public.issue_report_print_token(uuid)
  to service_role;
grant execute on function public.report_snapshot_by_token(uuid, text) to anon, authenticated, service_role;
revoke all on public.v_record_links from anon;
