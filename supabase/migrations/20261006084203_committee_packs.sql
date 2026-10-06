-- Committee packs: the dated record of what a governance forum was shown. A pack is a draft
-- until it is issued; once issued_at is set it can't be changed, and packs are never deleted.
-- content holds the pack as built (sections, collection and project facts at the time).

create table public.committee_packs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  -- The governance collection the pack was built from, if any. A collection with packs
  -- can't be deleted, so an issued pack always keeps its source.
  collection_id uuid,
  title text not null check (btrim(title) <> ''),
  meeting_date date not null,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  issued_at timestamptz,
  issued_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (collection_id, workspace_id) references public.collections (id, workspace_id),
  foreign key (issued_by) references public.profiles (id) on delete set null,
  foreign key (created_by) references public.profiles (id) on delete set null
);
create index committee_packs_workspace_meeting_idx on public.committee_packs (workspace_id, organisation_id, meeting_date desc);
create index committee_packs_organisation_idx on public.committee_packs (organisation_id);
create index committee_packs_collection_idx on public.committee_packs (collection_id, workspace_id);
create index committee_packs_issued_by_idx on public.committee_packs (issued_by);
create index committee_packs_created_by_idx on public.committee_packs (created_by);

-- Issuing is recorded by the server: when a signed-in user sets issued_at, it becomes now()
-- and issued_by becomes that user. An issued pack refuses every update.
create function private.committee_pack_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.issued_at is not null then
    raise exception 'This pack has been issued and can no longer be changed.' using errcode = 'P0001';
  end if;
  if (select auth.uid()) is not null then
    if new.issued_at is not null then
      new.issued_at := now();
      new.issued_by := (select auth.uid());
    else
      new.issued_by := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.committee_pack_lock() from public, anon, authenticated;

create function private.committee_pack_no_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Committee packs are kept permanently and can''t be deleted.' using errcode = '42501';
end;
$$;
revoke all on function private.committee_pack_no_delete() from public, anon, authenticated;

create trigger committee_packs_00_tenant_guard before insert or update on public.committee_packs
  for each row execute function private.tenant_guard('collection_id', 'collections', 'workspace_id', 'workspaces');
create trigger committee_packs_05_lock before insert or update on public.committee_packs
  for each row execute function private.committee_pack_lock();
create trigger committee_packs_no_delete before delete on public.committee_packs
  for each row execute function private.committee_pack_no_delete();
create trigger committee_packs_updated_at before update on public.committee_packs
  for each row execute function private.set_updated_at();
create trigger committee_packs_audit after insert or update or delete on public.committee_packs
  for each row execute function private.audit_row_change();

-- Readable by workspace members; built and issued by PMO (as for collections). No delete grant.
alter table public.committee_packs enable row level security;
revoke all on public.committee_packs from anon, authenticated;
grant select, insert, update on public.committee_packs to authenticated;
create policy committee_packs_select on public.committee_packs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy committee_packs_insert on public.committee_packs for insert to authenticated
  with check (private.has_workspace_role(workspace_id, 'pmo'));
create policy committee_packs_update on public.committee_packs for update to authenticated
  using (private.has_workspace_role(workspace_id, 'pmo')) with check (private.has_workspace_role(workspace_id, 'pmo'));
