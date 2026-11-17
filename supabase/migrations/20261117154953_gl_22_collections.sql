-- GL-22 Collection management. Applied to production 17/11/2026 as version 20261117154953
-- (supabase/migrations/20261117154953_gl_22_collections.sql, the same SQL); the three functions are
-- md5-identical to the local build.
-- Additive only: two columns, one index, two check constraints, three functions and three
-- triggers. No drop, delete or truncate.
--
-- Collections are already writable by the workspace's PMO and admins (RLS
-- my_workspace_ids('pmo'), which leaves archived workspaces out) and already carry the GL-4
-- read-only trigger, so create / edit / delete / add project / award need no policy change.
-- What this adds:
--   A. Archive: collections.archived_at / archived_by. An archived collection is read-only: the
--      only change allowed is restoring it (archived_at back to null, other columns may change
--      in the same update). archived_by is set by the trigger, never by the client.
--   B. Delete guard: reports and forums point at a collection through scope_entity_id with no
--      foreign key, so deleting one would leave packs, drafts and forum scopes pointing at
--      nothing. Deleting a collection that any report (any status) or forum is scoped to is
--      refused with hint 'collection_in_use'; the app offers Archive instead. SECURITY DEFINER so
--      it also counts reports the PMO can't read. The organisation purge steps aside
--      (private.in_purge(), GL-11).
--   C. Membership frozen while archived: adding, changing or removing a collection's projects is
--      refused while the collection is archived (hint 'collection_archived'). Deletes cascading
--      from a parent (a project or collection being deleted) are allowed: they run inside the
--      foreign key's trigger (pg_trigger_depth() > 1), as does the purge.
--   D. Pot and award amounts can't be negative, and a collection needs a name. Production on
--      17/11/2026: 3 collections, 10 project links, none negative or blank; 0 reports and 0 forums
--      scoped to a collection.
-- Errors use errcode P0001 with a hint, like org_read_only, so services/service-error.ts can map them.

-- =====================================================================================
-- A. Archive columns
-- =====================================================================================
alter table public.collections
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;
create index collections_archived_by_idx on public.collections (archived_by);

-- =====================================================================================
-- D. Amounts and name
-- =====================================================================================
alter table public.collections
  add constraint collections_pot_amount_check check (pot_amount is null or pot_amount >= 0),
  add constraint collections_name_check check (btrim(name) <> '');
alter table public.collection_projects
  add constraint collection_projects_award_amount_check check (award_amount is null or award_amount >= 0);

-- =====================================================================================
-- A + B. collections: archived is read-only; no delete while a report or forum uses it
-- =====================================================================================
create function private.collection_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reports int;
  v_forums int;
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11

  if tg_op = 'UPDATE' then
    if old.archived_at is not null and new.archived_at is not null then
      raise exception 'This collection is archived. Restore it before changing it.'
        using errcode = 'P0001', hint = 'collection_archived';
    end if;
    if old.archived_at is null and new.archived_at is not null then
      new.archived_by := auth.uid();
    elsif new.archived_at is null then
      new.archived_by := null;
    end if;
    return new;
  end if;

  -- DELETE
  select count(*) into v_reports from public.reports
  where scope_type = 'collection' and scope_entity_id = old.id;
  select count(*) into v_forums from public.forums
  where scope_type = 'collection' and scope_entity_id = old.id;
  if v_reports > 0 or v_forums > 0 then
    raise exception 'This collection can''t be deleted: % report(s) and % forum(s) use it. Archive it instead.',
      v_reports, v_forums
      using errcode = 'P0001', hint = 'collection_in_use';
  end if;
  return old;
end;
$$;
revoke execute on function private.collection_guard() from public, anon;

create trigger collections_05_guard before update or delete on public.collections
  for each row execute function private.collection_guard();

-- Insert: archived_by is never taken from the client.
create function private.collection_insert_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.archived_by := case when new.archived_at is null then null else auth.uid() end;
  return new;
end;
$$;
revoke execute on function private.collection_insert_archive() from public, anon;

create trigger collections_05_insert_archive before insert on public.collections
  for each row execute function private.collection_insert_archive();

-- =====================================================================================
-- C. collection_projects: frozen while the collection is archived
-- =====================================================================================
create function private.collection_projects_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  -- A delete cascading from a deleted project or collection runs inside the foreign key's trigger.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;

  if exists (
    select 1 from public.collections c
    where c.archived_at is not null
      and c.id in (case when tg_op = 'INSERT' then null else old.collection_id end,
                   case when tg_op = 'DELETE' then null else new.collection_id end)
  ) then
    raise exception 'This collection is archived. Restore it before changing its projects.'
      using errcode = 'P0001', hint = 'collection_archived';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function private.collection_projects_guard() from public, anon;

create trigger collection_projects_05_guard before insert or update or delete on public.collection_projects
  for each row execute function private.collection_projects_guard();
