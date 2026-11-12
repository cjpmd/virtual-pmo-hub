-- GL-9 follow-up: published packs record whether each deep-dive project was sample data.
-- NOT APPLIED to production: tested on the local Postgres only (supabase/tests/sample_data.sql).
-- docs/sql/gl-9-snapshot-sample.sql is identical. Nothing destructive: one function replaced
-- (create or replace keeps its grants); snapshots already published are not rewritten.
--
-- public.publish_report (last defined in 20261104150000_rb7_batched_block_data) is unchanged
-- except that each entry of the '__meta' snapshot's deep_dives now carries 'is_sample', frozen
-- with the pack like the code and name. The public print link (report_snapshot_by_token, anon)
-- and the PDF made from it can then show the Sample chip without reading live projects; the
-- signed-in viewer uses the stored flag and falls back to the live one for older packs.

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
        'is_sample', p.is_sample,
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
