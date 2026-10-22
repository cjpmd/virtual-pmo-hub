-- APPROVED 22/10/2026 as written; applied as migration 20261022163735_1_5_notes_map_layout.
-- Programme office notes and a shared dependency map layout.
--
-- Decisions taken:
--   * Office note in its own one-row-per-programme table (programme_office_notes), not a column
--     on programmes. Two reasons: (1) programmes_update needs the workspace manager role, so a
--     programme's named manager who is only a contributor couldn't save a column on programmes
--     without widening that policy to every programme column; (2) saving the note would bump
--     programmes.updated_at and make anyone editing the programme's details hit a "changed by
--     someone else" conflict. Its own row has its own updated_at, so the note goes through the
--     shared write helper with optimistic concurrency like everything else.
--   * Who edits the note: the programme's manager (programmes.manager_id is a resource linked
--     to the signed-in profile), and the workspace's PMO / admin (organisation PMO / admin
--     included). Not other workspace managers. Archived programmes' notes are read-only.
--     Everyone who can see the programme reads the note.
--   * updated_by and updated_at are set by triggers (auth.uid(), now()), never by the client.
--   * Note length: at most 10,000 characters. An empty note clears it (no delete grant).
--   * Map layout scope: the map today is organisation-wide (one map of every dependency the
--     user can see), so instead of a free-text scope + scope_id the table has nullable
--     portfolio_id / programme_id with real composite foreign keys: both null = the
--     organisation's map (workspace_id null, as on forums and saved views), one set = that
--     portfolio's or programme's map (for later scoped maps). One layout per scope (unique,
--     nulls not distinct). The tenant guard fills organisation_id / workspace_id from the
--     portfolio or programme and makes them immutable.
--   * positions: {"<node id>": {"x": n, "y": n}}, node ids as the map uses them
--     ("programme:<uuid>", "project:<uuid>", ...). An object, at most 128 KB.
--   * Layout edits: PMO / admin (organisation PMO / admin for the organisation map, the
--     workspace's for a scoped one). Everyone else can still drag nodes for themselves; their
--     moves aren't saved. Reset = delete the row (PMO / admin).
--   * No audit trigger on either table (confirmed).
-- New functions: private.set_updated_by() (trigger, runs as the caller) and
-- private.can_edit_programme_note(uuid) (SECURITY DEFINER, explicit checks); both have execute
-- revoked from public and anon.

-- ===== Migration 1_5_notes_map_layout ========================================================

-- Shared: stamp who made the change.
create function private.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
revoke all on function private.set_updated_by() from public, anon;

-- 1. Programme office notes
create table public.programme_office_notes (
  programme_id uuid primary key,
  organisation_id uuid not null,
  workspace_id uuid not null,
  note text not null default '' check (length(note) <= 10000),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (updated_by) references public.profiles (id) on delete set null
);
create index programme_office_notes_workspace_idx on public.programme_office_notes (workspace_id, organisation_id);
create index programme_office_notes_updated_by_idx on public.programme_office_notes (updated_by);
create trigger programme_office_notes_00_tenant_guard before insert or update on public.programme_office_notes
  for each row execute function private.tenant_guard('programme_id', 'programmes');
create trigger programme_office_notes_updated_at before update on public.programme_office_notes
  for each row execute function private.set_updated_at();
create trigger programme_office_notes_updated_by before insert or update on public.programme_office_notes
  for each row execute function private.set_updated_by();

-- The programme's manager, or the workspace's PMO / admin; never on an archived programme.
create function private.can_edit_programme_note(p_programme uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.archived_at is null
       and (p.workspace_id = any (private.my_workspace_ids('pmo'))
            or (p.manager_id = any (private.my_resource_ids())
                and p.workspace_id = any (private.my_workspace_ids())))
    from public.programmes p
    where p.id = p_programme
  ), false);
$$;
revoke all on function private.can_edit_programme_note(uuid) from public, anon;
grant execute on function private.can_edit_programme_note(uuid) to authenticated;

alter table public.programme_office_notes enable row level security;
revoke all on public.programme_office_notes from anon, authenticated;
grant select, insert on public.programme_office_notes to authenticated;
grant update (note) on public.programme_office_notes to authenticated;
create policy programme_office_notes_select on public.programme_office_notes for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy programme_office_notes_insert on public.programme_office_notes for insert to authenticated
  with check ((select private.can_edit_programme_note(programme_id)));
create policy programme_office_notes_update on public.programme_office_notes for update to authenticated
  using ((select private.can_edit_programme_note(programme_id)))
  with check ((select private.can_edit_programme_note(programme_id)));

-- 2. Dependency map layouts
create table public.dependency_map_layouts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid,
  portfolio_id uuid,
  programme_id uuid,
  positions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(positions) = 'object' and pg_column_size(positions) <= 131072),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(portfolio_id, programme_id) <= 1),
  check ((workspace_id is null) = (portfolio_id is null and programme_id is null)),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (portfolio_id, workspace_id) references public.portfolios (id, workspace_id) on delete cascade,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (updated_by) references public.profiles (id) on delete set null,
  unique nulls not distinct (organisation_id, portfolio_id, programme_id)
);
create index dependency_map_layouts_workspace_idx on public.dependency_map_layouts (workspace_id, organisation_id);
create index dependency_map_layouts_portfolio_idx on public.dependency_map_layouts (portfolio_id, workspace_id);
create index dependency_map_layouts_programme_idx on public.dependency_map_layouts (programme_id, workspace_id);
create index dependency_map_layouts_updated_by_idx on public.dependency_map_layouts (updated_by);
create trigger dependency_map_layouts_00_tenant_guard before insert or update on public.dependency_map_layouts
  for each row execute function private.tenant_guard('programme_id', 'programmes', 'portfolio_id', 'portfolios');
create trigger dependency_map_layouts_updated_at before update on public.dependency_map_layouts
  for each row execute function private.set_updated_at();
create trigger dependency_map_layouts_updated_by before insert or update on public.dependency_map_layouts
  for each row execute function private.set_updated_by();

alter table public.dependency_map_layouts enable row level security;
revoke all on public.dependency_map_layouts from anon, authenticated;
grant select, insert, delete on public.dependency_map_layouts to authenticated;
grant update (positions) on public.dependency_map_layouts to authenticated;
create policy dependency_map_layouts_select on public.dependency_map_layouts for select to authenticated
  using (case when workspace_id is null
    then organisation_id = any ((select private.my_org_ids())::uuid[])
    else workspace_id = any ((select private.my_workspace_ids())::uuid[]) end);
create policy dependency_map_layouts_insert on public.dependency_map_layouts for insert to authenticated
  with check (case when workspace_id is null
    then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
    else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end);
create policy dependency_map_layouts_update on public.dependency_map_layouts for update to authenticated
  using (case when workspace_id is null
    then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
    else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end)
  with check (case when workspace_id is null
    then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
    else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end);
create policy dependency_map_layouts_delete on public.dependency_map_layouts for delete to authenticated
  using (case when workspace_id is null
    then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
    else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end);
