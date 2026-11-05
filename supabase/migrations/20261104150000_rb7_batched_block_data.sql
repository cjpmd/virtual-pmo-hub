-- RB-50: report pages and publish compute the context and project metrics once per request.
--
-- Before: every block was its own RPC (report_block_data), and each rebuilt report_context
-- (scheme, matrix, data basis, inclusions) and, for seven blocks, ran project_metrics over the
-- scope again: about 45 requests and 20 metric runs for a programme pack, each paying PostgREST,
-- RLS and plan start-up on a pooled connection. On the small test instance requests queued past
-- the 8 s statement timeout.
--
-- After:
--   * report_blocks_data(p_input, p_items) resolves many blocks in one call. The context is built
--     once and, when any requested block needs them, the scope's metrics are worked out once and
--     carried in the context as ctx._metrics (project id -> metrics).
--   * private.rb_metrics(ctx) is what the seven metric blocks now read: ctx._metrics when present
--     (filtered to the block's projects), else project_metrics as before. Blocks that used to
--     call project_metrics without the forum / previous pack now see the forum-aware metrics;
--     they read only ratings, divergence and budget keys, which the forum and previous pack don't
--     change.
--   * report_block_data keeps its signature (single blocks, the AI summary function) and goes
--     through the same resolver.
--   * publish_report builds the context and metrics once and stores the metric snapshots from
--     the same map, so the snapshots and the metric blocks agree.
--   * Two indexes for the per-project history lookups the blocks make.
-- No table changes; nothing is dropped.

-- =========================================================== 1. Indexes
-- overall_status / health_by_dimension / project_metrics: health snapshots of one project up to
-- a date (the existing index leads with coalesce(portfolio, programme, project)).
create index if not exists health_snapshots_project_date_idx
  on public.health_snapshots (project_id, snapshot_date desc) where project_id is not null;
-- highlight_report_summary / health_by_dimension / project_metrics: latest submitted report on
-- or before a date.
create index if not exists status_reports_submitted_reporting_idx
  on public.status_reports (project_id, reporting_date desc, submitted_at desc) where status = 'submitted';

-- =========================================================== 2. Metrics carried in the context
create function private.rb_metrics(ctx jsonb)
returns table (project_id uuid, metrics jsonb)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  if ctx ? '_metrics' then
    return query
      select k.key::uuid, k.value from jsonb_each(ctx -> '_metrics') k
      where k.key::uuid = any (private.rb_projects(ctx));
  else
    return query
      select pm.project_id, pm.metrics
      from public.project_metrics(private.rb_projects(ctx), (ctx ->> 'as_at')::date, nullif(ctx ->> 'forum_id', '')::uuid,
        nullif(ctx ->> 'previous_report_id', '')::uuid) pm;
  end if;
end;
$$;

-- The report's context plus its scope's metrics, computed once.
create function private.report_ctx_with_metrics(ctx jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select ctx || jsonb_build_object('_metrics', coalesce((
    select jsonb_object_agg(pm.project_id, pm.metrics)
    from public.project_metrics(private.rb_projects(ctx - 'entity_id'), (ctx ->> 'as_at')::date,
      nullif(ctx ->> 'forum_id', '')::uuid, nullif(ctx ->> 'previous_report_id', '')::uuid) pm), '{}'::jsonb));
$$;

-- Blocks that read project metrics (the batch computes them only when one of these is asked for).
create function private.rb_metric_blocks()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['overall_status', 'rating_distribution', 'divergence_list', 'project_status_grid', 'budget_summary',
    'budget_movers', 'changes_since_last'];
$$;

-- =========================================================== 3. The seven metric blocks
-- Bodies as before; only the metrics source changes to private.rb_metrics(ctx).
create or replace function private.rb_overall_status(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with one as (select private.rb_single_project(ctx) as id),
  m as (
    select pm.metrics from one, private.rb_metrics(ctx) pm where one.id is not null and pm.project_id = one.id
  ),
  trend as (
    select jsonb_agg(jsonb_build_object('month', t.month, 'rating', t.overall) order by t.month) as months from (
      select distinct on (date_trunc('month', hs.snapshot_date)) to_char(hs.snapshot_date, 'YYYY-MM') as month, hs.overall::text as overall
      from public.health_snapshots hs, one
      where hs.project_id = one.id and hs.snapshot_date <= (ctx ->> 'as_at')::date
        and hs.snapshot_date > (ctx ->> 'as_at')::date - make_interval(months => coalesce((cfg ->> 'months')::int, 6))
      order by date_trunc('month', hs.snapshot_date), hs.snapshot_date desc) t
  ),
  scope as (
    select count(*) filter (where pm.metrics ->> 'evidenced_rating' = 'green') as green,
      count(*) filter (where pm.metrics ->> 'evidenced_rating' = 'amber') as amber,
      count(*) filter (where pm.metrics ->> 'evidenced_rating' = 'red') as red,
      count(*) filter (where coalesce(pm.metrics ->> 'evidenced_rating', 'not_set') = 'not_set') as not_set,
      count(*) filter (where (pm.metrics ->> 'rating_rank_delta')::int > 0) as divergent
    from private.rb_metrics(ctx) pm
  )
  select case when (select id from one) is not null then
    (select jsonb_build_object('mode', 'project', 'declared', m.metrics ->> 'declared_rating', 'evidenced', m.metrics ->> 'evidenced_rating',
       'divergence_days', (m.metrics ->> 'divergence_days')::int, 'rating_rank_delta', (m.metrics ->> 'rating_rank_delta')::int,
       'divergence_alert', h.divergence_alert, 'justified', h.justified, 'justification', h.justification,
       'last_report_date', h.last_report_date, 'report_overdue', h.report_overdue,
       'trend', coalesce((select months from trend), '[]'))
     from m left join public.project_health_current h on h.project_id = (select id from one))
  else
    (select jsonb_build_object('mode', 'scope', 'declared', ctx ->> 'overall_rating',
       'evidenced', case ctx ->> 'scope_type'
         when 'programme' then (select ph.overall::text from public.programme_health_current ph where ph.programme_id = (ctx ->> 'scope_entity_id')::uuid)
         when 'portfolio' then (select fh.overall::text from public.portfolio_health_current fh where fh.portfolio_id = (ctx ->> 'scope_entity_id')::uuid) end,
       'rationale', ctx ->> 'overall_rating_rationale',
       'counts', jsonb_build_object('green', s.green, 'amber', s.amber, 'red', s.red, 'not_set', s.not_set), 'divergent', s.divergent)
     from scope s) end;
$$;

create or replace function private.rb_project_status_grid(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rows as (
    select p.id, p.code, p.name, p.programme_id, coalesce(g.name, 'No programme') as programme_name,
      mgr.name as manager, lp.name as phase, p.state::text as state,
      pm.metrics ->> 'declared_rating' as declared, pm.metrics ->> 'evidenced_rating' as evidenced,
      h.schedule::text as schedule, h.financial::text as financial, h.effort::text as effort, h.issue::text as issue,
      h.benefit::text as benefit, (pm.metrics ->> 'divergence_days')::int as divergence_days,
      h.forecast_finish_date, h.finish_vs_baseline_days, (pm.metrics ->> 'budget_variance_pct')::numeric as budget_variance_pct,
      (pm.metrics ->> 'percent_complete')::numeric as percent_complete,
      i.mode as inclusion, coalesce(i.reasons, '[]') as reasons
    from private.rb_metrics(ctx) pm
    join public.projects p on p.id = pm.project_id
    left join public.programmes g on g.id = p.programme_id
    left join public.resources mgr on mgr.id = p.manager_id
    left join public.lifecycle_phases lp on lp.id = p.phase_id
    left join public.project_health_current h on h.project_id = p.id
    left join public.report_inclusions i on i.report_id = nullif(ctx ->> 'report_id', '')::uuid and i.entity_id = p.id
  )
  select jsonb_build_object('group_by', coalesce(cfg ->> 'group_by', 'programme'), 'rows', coalesce(jsonb_agg(to_jsonb(r) order by
      case when coalesce(cfg ->> 'group_by', 'programme') = 'programme' then r.programme_name end,
      case when cfg ->> 'sort' = 'rating' then private.rag_rank(r.evidenced) end desc nulls last,
      case when cfg ->> 'sort' = 'code' then r.code end, r.name), '[]'),
    'total', (select count(*) from rows))
  from rows r
  where not coalesce((cfg ->> 'only_exceptions')::boolean, false) or r.inclusion in ('rule', 'pinned');
$$;

create or replace function private.rb_budget_summary(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rows as (
    select p.id, p.code, p.name, f.budget, f.actual_to_date, f.eac, f.eac - f.budget as variance, f.variance_percent, f.actuals_through,
      (pm.metrics ->> 'budget_change_period')::numeric as change_period
    from public.v_project_financials f join public.projects p on p.id = f.project_id
    left join private.rb_metrics(ctx) pm on pm.project_id = p.id
    where f.project_id = any (private.rb_projects(ctx))
  )
  select jsonb_build_object('currency', ctx ->> 'currency',
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by abs(coalesce(r.variance, 0)) desc, r.name) from rows r), '[]'),
    'totals', (select jsonb_build_object('budget', sum(budget), 'actual_to_date', sum(actual_to_date), 'eac', sum(eac),
      'variance', sum(variance), 'variance_percent', case when sum(budget) > 0 then round(100 * sum(variance) / sum(budget), 1) end,
      'change_period', sum(change_period)) from rows));
$$;

create or replace function private.rb_rating_distribution(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with m as (
    select pm.metrics from private.rb_metrics(ctx) pm
  )
  select jsonb_build_object('total', (select count(*) from m),
    'declared', (select jsonb_object_agg(k, n) from (select coalesce(metrics ->> 'declared_rating', 'not_set') k, count(*) n from m group by 1) x),
    'evidenced', (select jsonb_object_agg(k, n) from (select coalesce(metrics ->> 'evidenced_rating', 'not_set') k, count(*) n from m group by 1) x));
$$;

create or replace function private.rb_divergence_list(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.divergence_days desc, x.name), '[]')) from (
    select p.id, p.code, p.name, pm.metrics ->> 'declared_rating' as declared, pm.metrics ->> 'evidenced_rating' as evidenced,
      (pm.metrics ->> 'divergence_days')::int as divergence_days, h.justified, h.justification, h.last_report_date
    from private.rb_metrics(ctx) pm
    join public.projects p on p.id = pm.project_id
    left join public.project_health_current h on h.project_id = p.id
    where (pm.metrics ->> 'rating_rank_delta')::int > 0
      and (pm.metrics ->> 'divergence_days')::int >= coalesce((cfg ->> 'min_days')::int, 0)) x;
$$;

create or replace function private.rb_budget_movers(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rows as (
    select p.id, p.code, p.name, (pm.metrics ->> 'budget')::numeric as budget, (pm.metrics ->> 'eac')::numeric as eac,
      (pm.metrics ->> 'budget_variance_abs')::numeric as variance, (pm.metrics ->> 'budget_variance_pct')::numeric as variance_pct,
      (pm.metrics ->> 'budget_change_period')::numeric as change_period
    from private.rb_metrics(ctx) pm join public.projects p on p.id = pm.project_id
  )
  select jsonb_build_object('currency', ctx ->> 'currency',
    'overspend', coalesce((select jsonb_agg(to_jsonb(r) order by r.variance desc) from (select * from rows where variance > 0 order by variance desc limit coalesce((cfg ->> 'limit')::int, 5)) r), '[]'),
    'movers', coalesce((select jsonb_agg(to_jsonb(r) order by abs(r.change_period) desc) from (select * from rows where coalesce(change_period, 0) <> 0 order by abs(change_period) desc limit coalesce((cfg ->> 'limit')::int, 5)) r), '[]'));
$$;

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
    select pm.project_id, pm.metrics from private.rb_metrics(ctx) pm
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

-- =========================================================== 4. Resolver, single and batched RPCs
-- One block against a context already built (the dispatcher that used to live in
-- report_block_data).
create function private.report_block_resolve(ctx jsonb, p_block jsonb, p_entity uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_key text := p_block ->> 'blockKey';
  v_out jsonb;
begin
  if v_key is null or v_key !~ '^[a-z_]{2,40}$' or to_regprocedure('private.rb_' || v_key || '(jsonb,jsonb)') is null then
    return jsonb_build_object('unavailable', true, 'blockKey', v_key);
  end if;
  if p_entity is not null and not (ctx -> 'project_ids' ? p_entity::text) then
    raise exception 'That project isn''t in this report''s scope.' using errcode = '22023';
  end if;
  ctx := ctx || jsonb_build_object('block_id', p_block ->> 'id', 'entity_id', p_entity);
  execute format('select private.%I($1, $2)', 'rb_' || v_key) into v_out using ctx, coalesce(p_block -> 'config', '{}'::jsonb);
  return coalesce(v_out, '{}'::jsonb);
end;
$$;

create or replace function public.report_block_data(p_input jsonb, p_block jsonb, p_entity uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  return private.report_block_resolve(public.report_context(p_input), p_block, p_entity);
end;
$$;

-- Many blocks in one call. p_items: [{"key": text, "block": BlockInstance, "entity": uuid|null}].
-- Returns {key: {"data": ...}} or {key: {"error": message, "code": sqlstate}} per item, so one
-- failing block doesn't fail the page (a statement timeout still fails the whole call).
create function public.report_blocks_data(p_input jsonb, p_items jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  ctx jsonb;
  item jsonb;
  v_out jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'p_items must be an array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 300 then
    raise exception 'Too many blocks in one request (% of 300).', jsonb_array_length(p_items) using errcode = '54000';
  end if;
  ctx := public.report_context(p_input);
  if exists (select 1 from jsonb_array_elements(p_items) x where x -> 'block' ->> 'blockKey' = any (private.rb_metric_blocks())) then
    ctx := private.report_ctx_with_metrics(ctx);
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    begin
      v_out := v_out || jsonb_build_object(item ->> 'key', jsonb_build_object('data',
        private.report_block_resolve(ctx, item -> 'block', nullif(item ->> 'entity', '')::uuid)));
    exception when others then
      v_out := v_out || jsonb_build_object(item ->> 'key', jsonb_build_object('error', sqlerrm, 'code', sqlstate));
    end;
  end loop;
  return v_out;
end;
$$;

-- =========================================================== 5. publish_report
-- As in rb3, with the context and metrics built once; metric snapshots come from the same map.
create or replace function public.publish_report(p_report_id uuid)
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
  ctx := private.report_ctx_with_metrics(public.report_context(jsonb_build_object('report_id', r.id)));
  v_hidden := private.partner_hidden_blocks(r.id);

  for b in select value from jsonb_array_elements(r.blocks) loop
    if coalesce(b ->> 'placement', 'report') = 'deep_dive' then
      for v_entity in select i.entity_id from public.report_inclusions i where i.report_id = r.id and i.mode <> 'excluded' order by i.sort_order loop
        v_data := private.report_block_resolve(ctx, b, v_entity);
        insert into public.report_snapshots (report_id, block_instance_id, block_key, entity_id, data, hidden_from_partners)
        values (r.id, b ->> 'id', b ->> 'blockKey', v_entity, v_data,
          coalesce((b ->> 'hideFromPartners')::boolean, false) or (b ->> 'blockKey') = any (v_unsafe));
        v_blocks := v_blocks + 1;
      end loop;
    else
      v_data := private.report_block_resolve(ctx, b, null);
      insert into public.report_snapshots (report_id, block_instance_id, block_key, entity_id, data, hidden_from_partners)
      values (r.id, b ->> 'id', b ->> 'blockKey', null, v_data,
        coalesce((b ->> 'hideFromPartners')::boolean, false) or (b ->> 'blockKey') = any (v_unsafe));
      v_blocks := v_blocks + 1;
    end if;
  end loop;

  -- Changes since the previous pack, always stored (movement markers), and the pack's meta.
  insert into public.report_snapshots (report_id, block_instance_id, block_key, data)
  values (r.id, '__changes', 'changes_since_last', private.report_block_resolve(ctx,
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
  select r.id, 'project', k.key::uuid, k.value from jsonb_each(ctx -> '_metrics') k;
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

-- =========================================================== 6. Grants
revoke all on function private.rb_metrics(jsonb), private.report_ctx_with_metrics(jsonb), private.rb_metric_blocks(),
  private.report_block_resolve(jsonb, jsonb, uuid) from public, anon;
grant execute on function private.rb_metrics(jsonb), private.report_ctx_with_metrics(jsonb), private.rb_metric_blocks(),
  private.report_block_resolve(jsonb, jsonb, uuid) to authenticated, service_role;
revoke all on function public.report_blocks_data(jsonb, jsonb) from public, anon;
grant execute on function public.report_blocks_data(jsonb, jsonb) to authenticated, service_role;
