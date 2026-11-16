-- GL-16: large report packs overflow to Storage (approved design, docs/design/pack-overflow-storage.md,
-- option C, decisions 12/11/2026). Applied to production 16/11/2026 (version 20261116142802). Tested
-- on the local Postgres first. No destructive statements: one bucket, three columns, two tables, new functions;
-- publish_report and report_snapshot_by_token replaced (create or replace keeps their grants).
--
-- * A block whose JSON is over 256 KB is published with data = JSON null, overflowed = true, its
--   SHA-256 (of data::text, as Postgres prints jsonb) and size; the payload waits in
--   private.report_snapshot_staging until report-publish (right after the RPC) or report-notify (every
--   15 minutes, retries) uploads it to report-snapshots/<org>/<report>/<snapshot>.json and
--   complete_snapshot_overflow checks the hash, records the object in report_snapshot_objects and
--   clears the staging row. The snapshot row itself never changes.
-- * Limits: 2 MB inline per pack (as before, now over inline rows only), 50 MB overflowed per pack,
--   50 MB per block. '__meta' always stays inline.
-- * Reads: the viewer downloads objects through a bucket policy that repeats report_snapshots_select
--   (private.can_view_snapshot), or reads a still-staged payload with report_snapshot_staged_payload;
--   the print route gets 60-second signed URLs (or the staged payload) from the edge function
--   report-snapshot-payload, which checks the print token with report_overflow_by_token. Every
--   reader checks the SHA-256.

-- =====================================================================================
-- 1. Bucket, columns, tables
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-snapshots', 'report-snapshots', false, 52428800, array['application/json'])
on conflict (id) do nothing;

alter table public.report_snapshots
  add column overflowed boolean not null default false,
  add column payload_sha256 bytea,
  add column payload_bytes integer,
  add constraint report_snapshots_overflow_check check (overflowed = (payload_sha256 is not null)),
  add constraint report_snapshots_overflow_data_check check (not overflowed or data = 'null'::jsonb);
comment on column public.report_snapshots.overflowed is
  'GL-16: the payload is in Storage (report_snapshot_objects) or still staged; data is JSON null.';
comment on column public.report_snapshots.payload_sha256 is
  'GL-16: SHA-256 of the payload text (data::text at publish) of an overflowed block; readers check it.';

create table public.report_snapshot_objects (
  snapshot_id uuid primary key references public.report_snapshots (id),
  organisation_id uuid not null,
  workspace_id uuid,
  report_id uuid not null,
  storage_path text not null unique,
  uploaded_at timestamptz not null default now(),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  constraint report_snapshot_objects_path_check check (storage_path = organisation_id || '/' || report_id || '/' || snapshot_id || '.json')
);
comment on table public.report_snapshot_objects is
  'GL-16: where an overflowed snapshot payload is in Storage (bucket report-snapshots). Insert-only, written by complete_snapshot_overflow.';
create index report_snapshot_objects_report_idx on public.report_snapshot_objects (report_id, organisation_id);
create index report_snapshot_objects_ws_idx on public.report_snapshot_objects (workspace_id, organisation_id);

create table private.report_snapshot_staging (
  snapshot_id uuid primary key references public.report_snapshots (id),
  organisation_id uuid not null references public.organisations (id),
  report_id uuid not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text
);
comment on table private.report_snapshot_staging is
  'GL-16: an overflowed payload waiting to move to Storage. No grants; read and cleared by definer functions.';
create index report_snapshot_staging_report_idx on private.report_snapshot_staging (report_id);
revoke all on private.report_snapshot_staging from public, anon, authenticated;

-- =====================================================================================
-- 2. Visibility: the report_snapshots_select rule for one snapshot
-- =====================================================================================
create function private.can_view_snapshot(p_snapshot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.can_view_report(s.report_id)
      and (not private.is_partner_viewer(s.report_id)
           or (not s.hidden_from_partners and not (s.block_key = any (private.partner_hidden_blocks(s.report_id)))))
    from public.report_snapshots s where s.id = p_snapshot), false);
$$;
revoke execute on function private.can_view_snapshot(uuid) from public, anon;
grant execute on function private.can_view_snapshot(uuid) to authenticated, service_role;

alter table public.report_snapshot_objects enable row level security;
revoke all on public.report_snapshot_objects from anon, authenticated;
grant select on public.report_snapshot_objects to authenticated;
create policy report_snapshot_objects_select on public.report_snapshot_objects for select to authenticated
  using ((select private.can_view_snapshot(snapshot_id)));
create trigger report_snapshot_objects_immutable before update or delete on public.report_snapshot_objects
  for each row execute function private.snapshot_immutable();
create trigger report_snapshot_objects_00_tenant_guard before insert on public.report_snapshot_objects
  for each row execute function private.tenant_guard('report_id', 'reports');
create trigger zz_org_read_only before insert or update or delete on public.report_snapshot_objects
  for each row execute function private.enforce_org_writable();

-- Downloads: report-snapshots/<org>/<report>/<snapshot>.json for whoever may read that snapshot row.
-- No insert, update or delete policy: only the service role writes, and objects are never replaced.
create policy report_snapshots_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'report-snapshots'
         and private.can_view_snapshot(private.try_uuid(replace(storage.filename(name), '.json', ''))));

-- =====================================================================================
-- 3. Publish
-- =====================================================================================
-- Inserts one snapshot row: inline up to 256 KB of JSON text, else overflowed and staged.
create function private.insert_report_snapshot(p_report public.reports, p_block_instance text, p_block_key text,
                                               p_entity uuid, p_data jsonb, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text := coalesce(p_data, 'null'::jsonb)::text;
  v_bytes integer := octet_length(v_text);
  v_id uuid;
begin
  if v_bytes <= 262144 or p_block_instance = '__meta' then
    insert into public.report_snapshots (report_id, block_instance_id, block_key, entity_id, data, hidden_from_partners)
    values (p_report.id, p_block_instance, p_block_key, p_entity, p_data, p_hidden);
    return;
  end if;
  if v_bytes > 52428800 then
    raise exception 'This pack is too large to publish (one block holds % MB; the limit is 50 MB per block). Reduce deep-dives or block limits.',
      round(v_bytes / 1048576.0, 1) using errcode = '54000';
  end if;
  insert into public.report_snapshots (report_id, block_instance_id, block_key, entity_id, data, hidden_from_partners,
                                       overflowed, payload_sha256, payload_bytes)
  values (p_report.id, p_block_instance, p_block_key, p_entity, 'null'::jsonb, p_hidden,
          true, extensions.digest(v_text, 'sha256'), v_bytes)
  returning id into v_id;
  insert into private.report_snapshot_staging (snapshot_id, organisation_id, report_id, data)
  values (v_id, p_report.organisation_id, p_report.id, p_data);
end;
$$;
revoke execute on function private.insert_report_snapshot(public.reports, text, text, uuid, jsonb, boolean) from public, anon, authenticated;

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
  v_overflow bigint;
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
        perform private.insert_report_snapshot(r, b ->> 'id', b ->> 'blockKey', v_entity, v_data,
          coalesce((b ->> 'hideFromPartners')::boolean, false) or (b ->> 'blockKey') = any (v_unsafe));
        v_blocks := v_blocks + 1;
      end loop;
    else
      v_data := private.report_block_resolve(ctx, b, null);
      perform private.insert_report_snapshot(r, b ->> 'id', b ->> 'blockKey', null, v_data,
        coalesce((b ->> 'hideFromPartners')::boolean, false) or (b ->> 'blockKey') = any (v_unsafe));
      v_blocks := v_blocks + 1;
    end if;
  end loop;

  -- Changes since the previous pack, always stored (movement markers), and the pack's meta.
  perform private.insert_report_snapshot(r, '__changes', 'changes_since_last', null, private.report_block_resolve(ctx,
    '{"id":"__changes","blockKey":"changes_since_last","config":{}}', null), false);
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

  -- GL-16: 2 MB inline (compressed, as before) and 50 MB overflowed per pack.
  select coalesce(sum(pg_column_size(s.data)) filter (where not s.overflowed), 0), coalesce(sum(s.payload_bytes), 0)
    into v_size, v_overflow from public.report_snapshots s where s.report_id = r.id;
  if v_size > 2 * 1024 * 1024 then
    raise exception 'This pack is too large to publish (% MB of snapshot data; the limit is 2 MB). Reduce deep-dives or block limits.',
      round(v_size / 1048576.0, 1) using errcode = '54000';
  end if;
  if v_overflow > 50 * 1024 * 1024 then
    raise exception 'This pack is too large to publish (% MB of large blocks; the limit is 50 MB). Reduce deep-dives or block limits.',
      round(v_overflow / 1048576.0, 1) using errcode = '54000';
  end if;

  update public.reports set status = 'published', published_at = now(), published_by = (select auth.uid()) where id = r.id returning * into r;
  perform private.report_event(r.id, 'published', jsonb_build_object('blocks', v_blocks, 'bytes', v_size, 'overflow_bytes', v_overflow));
  return jsonb_build_object('report_id', r.id, 'blocks', v_blocks, 'bytes', v_size, 'overflow_bytes', v_overflow,
                            'published_at', r.published_at);
end;
$$;

-- =====================================================================================
-- 4. Moving payloads to Storage (service role)
-- =====================================================================================
-- Staged payloads (one report's, or the oldest 50 of all), as the exact text that was hashed.
create function public.report_snapshot_staged(p_report_id uuid default null)
returns table (snapshot_id uuid, report_id uuid, organisation_id uuid, storage_path text, payload text,
               sha256 text, attempts integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.snapshot_id, g.report_id, g.organisation_id,
         g.organisation_id || '/' || g.report_id || '/' || g.snapshot_id || '.json',
         g.data::text, encode(s.payload_sha256, 'hex'), g.attempts
  from private.report_snapshot_staging g
  join public.report_snapshots s on s.id = g.snapshot_id
  where p_report_id is null or g.report_id = p_report_id
  order by g.created_at, g.snapshot_id
  limit case when p_report_id is null then 50 end;
$$;

-- The object is in Storage: check its hash, record it and clear the staging row. Once only.
create function public.complete_snapshot_overflow(p_snapshot_id uuid, p_storage_path text, p_sha256 text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g private.report_snapshot_staging;
  s public.report_snapshots;
begin
  select * into g from private.report_snapshot_staging x where x.snapshot_id = p_snapshot_id for update;
  if g.snapshot_id is null then
    raise exception 'This snapshot isn''t waiting to move to Storage.' using errcode = 'P0002', hint = 'not_staged';
  end if;
  select * into s from public.report_snapshots x where x.id = p_snapshot_id;
  if p_sha256 is distinct from encode(s.payload_sha256, 'hex') then
    raise exception 'The uploaded payload doesn''t match the published hash.' using errcode = '22023', hint = 'hash_mismatch';
  end if;
  if p_storage_path is distinct from g.organisation_id || '/' || g.report_id || '/' || g.snapshot_id || '.json' then
    raise exception 'Unexpected storage path.' using errcode = '22023', hint = 'bad_path';
  end if;
  insert into public.report_snapshot_objects (snapshot_id, organisation_id, workspace_id, report_id, storage_path)
  values (s.id, s.organisation_id, s.workspace_id, s.report_id, p_storage_path);
  delete from private.report_snapshot_staging x where x.snapshot_id = p_snapshot_id;
end;
$$;

-- A failed move: counted, and kept for the next run. Returns the attempts so far.
create function public.fail_snapshot_overflow(p_snapshot_id uuid, p_error text)
returns integer
language sql
security definer
set search_path = ''
as $$
  update private.report_snapshot_staging x set attempts = x.attempts + 1, last_error = left(p_error, 500)
  where x.snapshot_id = p_snapshot_id
  returning x.attempts;
$$;

-- The print route's overflowed blocks: for a valid print token, each requested overflowed snapshot of
-- that report, with its object path (the edge function signs it) or, while staged, the payload.
create function public.report_overflow_by_token(p_report_id uuid, p_token text, p_snapshot_ids uuid[])
returns table (snapshot_id uuid, storage_path text, payload text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, o.storage_path, case when o.snapshot_id is null then g.data::text end
  from public.report_snapshots s
  left join public.report_snapshot_objects o on o.snapshot_id = s.id
  left join private.report_snapshot_staging g on g.snapshot_id = s.id
  where s.report_id = p_report_id and s.overflowed and s.id = any (p_snapshot_ids)
    and exists (select 1 from private.report_print_tokens t where t.report_id = p_report_id
                and t.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256') and t.expires_at > now());
$$;

revoke execute on function public.report_snapshot_staged(uuid), public.complete_snapshot_overflow(uuid, text, text),
  public.fail_snapshot_overflow(uuid, text), public.report_overflow_by_token(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.report_snapshot_staged(uuid), public.complete_snapshot_overflow(uuid, text, text),
  public.fail_snapshot_overflow(uuid, text), public.report_overflow_by_token(uuid, text, uuid[]) to service_role;

-- =====================================================================================
-- 5. Reads
-- =====================================================================================
-- A still-staged payload, for whoever may read the snapshot row (the viewer, before the move).
create function public.report_snapshot_staged_payload(p_snapshot_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.data::text from private.report_snapshot_staging g
  where g.snapshot_id = p_snapshot_id and private.can_view_snapshot(p_snapshot_id);
$$;
revoke execute on function public.report_snapshot_staged_payload(uuid) from public, anon;
grant execute on function public.report_snapshot_staged_payload(uuid) to authenticated, service_role;

-- The print route's read: as before, plus each row's id, overflowed and sha256 (hex).
create or replace function public.report_snapshot_by_token(p_report_id uuid, p_token text)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select case when exists (select 1 from private.report_print_tokens t where t.report_id = p_report_id
      and t.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256') and t.expires_at > now())
    then jsonb_build_object(
      'report', (select to_jsonb(r) - 'created_by' - 'approved_by' - 'published_by' from public.reports r where r.id = p_report_id),
      'snapshots', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'block_instance_id', s.block_instance_id,
          'entity_id', s.entity_id, 'data', s.data, 'overflowed', s.overflowed, 'sha256', encode(s.payload_sha256, 'hex'))), '[]')
        from public.report_snapshots s where s.report_id = p_report_id))
    end;
$function$;
