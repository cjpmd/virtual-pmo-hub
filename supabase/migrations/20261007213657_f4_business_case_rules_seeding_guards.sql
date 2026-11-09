create or replace function private.business_case_version_rules()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('business_case_versions'), hashtext(new.business_case_id::text));
    new.version := coalesce((select max(v.version) from public.business_case_versions v
      where v.business_case_id = new.business_case_id), 0) + 1;
    new.status := 'draft';
    new.submitted_at := null; new.submitted_by := null;
    new.decided_at := null; new.decision_id := null; new.recorded_by := null;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'This version has been submitted and can''t be changed.' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.business_case_id <> old.business_case_id or new.version <> old.version then
    raise exception 'A version can''t move to another case or be renumbered' using errcode = '42501';
  end if;
  -- Plain client updates: drafts only, and never the status fields. The SECURITY DEFINER
  -- RPCs (submit_business_case, F5 decide_business_case) run as their owner instead.
  if current_user = 'authenticated' then
    if old.status <> 'draft' then
      raise exception 'This version has been submitted and can''t be changed.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       or new.submitted_at is distinct from old.submitted_at or new.submitted_by is distinct from old.submitted_by
       or new.decided_at is distinct from old.decided_at or new.decision_id is distinct from old.decision_id
       or new.recorded_by is distinct from old.recorded_by then
      raise exception 'Use Submit to change the status of a business case' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.business_case_version_rules() from public, anon, authenticated;

create or replace function public.submit_business_case(p_version_id uuid)
returns public.business_case_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.business_case_versions;
  v_preferred public.business_case_options;
  v_empty text;
begin
  select * into v from public.business_case_versions where id = p_version_id for update;
  if v.id is null or not (v.business_case_id = any (private.my_editable_business_case_ids())) then
    raise exception 'You can''t submit this business case' using errcode = '42501';
  end if;
  if v.status <> 'draft' then
    raise exception 'Only a draft can be submitted' using errcode = '22023';
  end if;
  if (select count(*) from public.business_case_options where version_id = v.id and is_preferred) <> 1 then
    raise exception 'Choose exactly one preferred option before submitting' using errcode = '22023';
  end if;
  select * into v_preferred from public.business_case_options where version_id = v.id and is_preferred;
  if v_preferred.whole_life_cost is null or v_preferred.delivery_cost is null then
    raise exception 'The preferred option needs a whole-life cost and a delivery cost' using errcode = '22023';
  end if;
  select string_agg(s.title, ', ' order by s.sort_order) into v_empty
  from public.business_case_sections s
  where s.version_id = v.id and s.is_required and btrim(s.content) = '';
  if v_empty is not null then
    raise exception 'Complete these sections before submitting: %', v_empty using errcode = '22023';
  end if;

  update public.business_case_versions
  set status = 'submitted', submitted_at = now(), submitted_by = (select auth.uid()),
      preferred_option_id = v_preferred.id,
      whole_life_cost = v_preferred.whole_life_cost
  where id = v.id
  returning * into v;
  return v;
end;
$$;
revoke all on function public.submit_business_case(uuid) from public, anon;
grant execute on function public.submit_business_case(uuid) to authenticated;

create or replace function private.audit_row_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  changes jsonb;
begin
  if (select auth.uid()) is null and current_setting('vpmo.seeding', true) = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('from', o -> k, 'to', n -> k)), '{}'::jsonb) into changes
    from jsonb_object_keys(n) k
    where k not in ('updated_at') and (o -> k) is distinct from (n -> k);
    if changes = '{}'::jsonb then
      return null;
    end if;
  else
    changes := case when tg_op = 'DELETE' then jsonb_build_object('row', o) else '{}'::jsonb end;
  end if;
  insert into public.audit_log (organisation_id, workspace_id, actor_id, action, entity_table, entity_id, detail)
  values ((r ->> 'organisation_id')::uuid, (r ->> 'workspace_id')::uuid, (select auth.uid()), lower(tg_op), tg_table_name,
          coalesce((r ->> 'id')::uuid, (r ->> 'profile_id')::uuid), changes);
  return null;
end;
$function$;

create or replace function private.capability_rules()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
begin
  if new.forecast_date is null then
    new.forecast_date := new.target_date;
  end if;
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    if uid is not null and not private.has_workspace_role(new.workspace_id, 'manager') then
      raise exception 'Only managers and PMO can record acceptance' using errcode = '42501';
    end if;
    if not (uid is null and current_setting('vpmo.seeding', true) = 'on') and not exists (
      select 1 from public.documents doc
      join storage.objects so on so.bucket_id = 'documents' and so.name = doc.storage_path
      where doc.capability_id = new.id and doc.archived_at is null) then
      raise exception 'Attach the acceptance evidence first' using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'accepted' and new.status <> 'accepted' then
    if uid is not null and not private.has_workspace_role(new.workspace_id, 'pmo') then
      raise exception 'Only PMO can reverse an acceptance' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.snapshot_on_status_report()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not ((select auth.uid()) is null and current_setting('vpmo.seeding', true) = 'on') then
    perform private.capture_health_snapshots(new.organisation_id);
  end if;
  return new;
end;
$function$;