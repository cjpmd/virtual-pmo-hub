-- RB-50 (2): the selection panel's scope metrics travel in the same batch as the blocks, so a
-- page computes project metrics once instead of three times in parallel (scope metrics, an early
-- one-block batch and the main batch). Items with "kind": "scope_metrics" return what
-- report_scope_metrics returns, from the batch's shared metrics. report_scope_metrics stays for
-- other callers. No table changes.

create function private.rb_scope_metrics_rows(ctx jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('project_id', pm.project_id, 'code', p.code, 'name', p.name,
      'programme', g.name, 'metrics', pm.metrics) order by p.name), '[]')
  from private.rb_metrics(ctx - 'entity_id') pm
  join public.projects p on p.id = pm.project_id left join public.programmes g on g.id = p.programme_id;
$$;

create or replace function public.report_blocks_data(p_input jsonb, p_items jsonb)
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
  if exists (select 1 from jsonb_array_elements(p_items) x
             where x ->> 'kind' = 'scope_metrics' or x -> 'block' ->> 'blockKey' = any (private.rb_metric_blocks())) then
    ctx := private.report_ctx_with_metrics(ctx);
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    begin
      v_out := v_out || jsonb_build_object(item ->> 'key', jsonb_build_object('data',
        case when item ->> 'kind' = 'scope_metrics' then private.rb_scope_metrics_rows(ctx)
             else private.report_block_resolve(ctx, item -> 'block', nullif(item ->> 'entity', '')::uuid) end));
    exception when others then
      v_out := v_out || jsonb_build_object(item ->> 'key', jsonb_build_object('error', sqlerrm, 'code', sqlstate));
    end;
  end loop;
  return v_out;
end;
$$;

revoke all on function private.rb_scope_metrics_rows(jsonb) from public, anon;
grant execute on function private.rb_scope_metrics_rows(jsonb) to authenticated, service_role;
