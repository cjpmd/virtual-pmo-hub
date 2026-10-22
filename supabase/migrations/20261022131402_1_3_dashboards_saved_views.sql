-- Work package 1.3: dashboards and board saved views (docs/sql/1-3-dashboards-views.sql).

-- 1. Dashboards
create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid,
  owner_id uuid not null default auth.uid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  -- {"version": 1, "widgets": [{"type": "RAG donut"}, ...]}; the service owns the shape.
  layout jsonb not null default '{"version": 1, "widgets": []}'::jsonb
    check (jsonb_typeof(layout) = 'object' and pg_column_size(layout) <= 65536),
  is_shared boolean not null default false,
  -- The owner's own default dashboard (personal only, even when shared).
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (owner_id) references public.profiles (id) on delete cascade
);
create index dashboards_organisation_idx on public.dashboards (organisation_id);
create index dashboards_workspace_idx on public.dashboards (workspace_id, organisation_id);
create index dashboards_owner_idx on public.dashboards (owner_id);
create unique index dashboards_one_default on public.dashboards (organisation_id, owner_id)
  where is_default;
create trigger dashboards_00_tenant_guard before insert or update on public.dashboards
  for each row execute function private.tenant_guard('workspace_id', 'workspaces');
create trigger dashboards_updated_at before update on public.dashboards
  for each row execute function private.set_updated_at();

-- Only the owner sets or clears their default; setting it clears their previous default.
-- Runs as the caller, so RLS applies to the clearing update.
create function private.dashboards_single_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.is_default is distinct from old.is_default
     and new.owner_id is distinct from (select auth.uid()) then
    raise exception 'Only the owner can change their default dashboard' using errcode = '42501';
  end if;
  if new.is_default and (tg_op = 'INSERT' or not old.is_default) then
    update public.dashboards d
       set is_default = false
     where d.id <> new.id
       and d.is_default
       and d.organisation_id = new.organisation_id
       and d.owner_id = new.owner_id;
  end if;
  return new;
end;
$$;
revoke all on function private.dashboards_single_default() from public, anon;
create trigger dashboards_10_single_default before insert or update of is_default
  on public.dashboards for each row execute function private.dashboards_single_default();

alter table public.dashboards enable row level security;
revoke all on public.dashboards from anon, authenticated;
grant select, insert, delete on public.dashboards to authenticated;
grant update (name, layout, is_shared, is_default) on public.dashboards to authenticated;

create policy dashboards_select on public.dashboards for select to authenticated
  using (
    (owner_id = (select auth.uid()) and organisation_id = any ((select private.my_org_ids())::uuid[]))
    or (is_shared and case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids())::uuid[])
          else workspace_id = any ((select private.my_workspace_ids())::uuid[]) end)
  );
create policy dashboards_insert on public.dashboards for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids())::uuid[])
          else workspace_id = any ((select private.my_workspace_ids())::uuid[]) end
  );
create policy dashboards_update on public.dashboards for update to authenticated
  using (
    owner_id = (select auth.uid())
    or (is_shared and case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
          else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end)
  )
  with check (
    owner_id = (select auth.uid())
    or (is_shared and case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
          else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end)
  );
create policy dashboards_delete on public.dashboards for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or (is_shared and case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
          else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end)
  );

-- 2. Board saved views
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid,
  board_key text not null check (board_key ~ '^[a-z0-9][a-z0-9:_-]{0,99}$'),
  owner_id uuid not null default auth.uid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  -- {"version": 1, "type": "table", "groupBy": ..., "sortKey": ..., "filter": ...,
  --  "filters": [...], "visible": [...]}; the service owns the shape.
  config jsonb not null check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 32768),
  is_shared boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organisation_id) references public.organisations (id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (owner_id) references public.profiles (id) on delete cascade
);
create index saved_views_board_idx on public.saved_views (organisation_id, board_key);
create index saved_views_workspace_idx on public.saved_views (workspace_id, organisation_id);
create index saved_views_owner_idx on public.saved_views (owner_id);
-- One personal default per person per board, and one shared default per board and scope.
create unique index saved_views_one_personal_default on public.saved_views
  (organisation_id, owner_id, board_key) where is_default and not is_shared;
create unique index saved_views_one_shared_default on public.saved_views
  (organisation_id, workspace_id, board_key) nulls not distinct where is_default and is_shared;
create trigger saved_views_00_tenant_guard before insert or update on public.saved_views
  for each row execute function private.tenant_guard('workspace_id', 'workspaces');
create trigger saved_views_updated_at before update on public.saved_views
  for each row execute function private.set_updated_at();

-- Setting a default clears the previous one in the same scope. Runs as the caller (not
-- SECURITY DEFINER), so it can only clear a row the caller may update; otherwise the unique
-- index refuses the new default.
create function private.saved_views_single_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default and (tg_op = 'INSERT' or not old.is_default or old.is_shared <> new.is_shared) then
    update public.saved_views v
       set is_default = false
     where v.id <> new.id
       and v.is_default
       and v.organisation_id = new.organisation_id
       and v.board_key = new.board_key
       and v.is_shared = new.is_shared
       and case when new.is_shared then v.workspace_id is not distinct from new.workspace_id
                else v.owner_id = new.owner_id end;
  end if;
  return new;
end;
$$;
revoke all on function private.saved_views_single_default() from public, anon;
create trigger saved_views_10_single_default before insert or update of is_default, is_shared
  on public.saved_views for each row execute function private.saved_views_single_default();

alter table public.saved_views enable row level security;
revoke all on public.saved_views from anon, authenticated;
grant select, insert, delete on public.saved_views to authenticated;
grant update (name, config, is_shared, is_default) on public.saved_views to authenticated;

create policy saved_views_select on public.saved_views for select to authenticated
  using (
    (owner_id = (select auth.uid()) and organisation_id = any ((select private.my_org_ids())::uuid[]))
    or (is_shared and case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids())::uuid[])
          else workspace_id = any ((select private.my_workspace_ids())::uuid[]) end)
  );
-- A shared default is everyone's default for the board, so only PMO / admin can set it.
create policy saved_views_insert on public.saved_views for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids())::uuid[])
          else workspace_id = any ((select private.my_workspace_ids())::uuid[]) end
    and (not (is_shared and is_default) or case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
          else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end)
  );
-- Once a shared view is the board default it is PMO's: its owner can no longer change or
-- delete it (that would change or remove everyone's default).
create policy saved_views_update on public.saved_views for update to authenticated
  using (
    (owner_id = (select auth.uid()) and not (is_shared and is_default))
    or (is_shared and case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
          else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end)
  )
  with check (
    (owner_id = (select auth.uid()) or is_shared)
    and (not is_shared and owner_id = (select auth.uid())
      or not is_default and owner_id = (select auth.uid())
      or case when workspace_id is null
           then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
           else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end)
  );
create policy saved_views_delete on public.saved_views for delete to authenticated
  using (
    (owner_id = (select auth.uid()) and not (is_shared and is_default))
    or (is_shared and case when workspace_id is null
          then organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
          else workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[]) end)
  );
