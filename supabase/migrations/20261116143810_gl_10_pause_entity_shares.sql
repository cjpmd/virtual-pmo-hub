-- GL-10 follow-up: pause new partner shares until the six partner-sharing findings
-- (docs/go-live-plan.md, GL-10 follow-up; cross_tenant.sql section 5) are fixed.
-- Proposal: docs/sql/gl-10-pause-entity-shares.sql. Additive only: no drop, delete or truncate.
--
-- * New rows in public.entity_shares are refused while private.entity_sharing_settings.enabled is
--   false (the shipped value). Nothing in the app creates shares today (share creation is SQL-only,
--   spec §14), so this closes the SQL path too, whoever runs it.
-- * Everything else is unchanged: existing shares (production had 0 on 16/11/2026) stay readable
--   and keep working, and updating or deleting (revoking) a share is still allowed.
-- * To allow shares again once the fixes are in, set the flag in the SQL editor:
--     update private.entity_sharing_settings set enabled = true, changed_at = now();
--   It is a table row, not a session setting, so no session can turn it on for itself.

create table private.entity_sharing_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  changed_at timestamptz not null default now()
);
comment on table private.entity_sharing_settings is
  'GL-10 follow-up: whether new partner shares (public.entity_shares) may be created. One row. Off until the partner-sharing findings are fixed.';
insert into private.entity_sharing_settings (singleton, enabled) values (true, false);
revoke all on private.entity_sharing_settings from public, anon, authenticated;

create function private.entity_shares_paused()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select s.enabled from private.entity_sharing_settings s), false) then
    raise exception 'Sharing with partner organisations is paused.' using errcode = '42501', hint = 'sharing_paused';
  end if;
  return new;
end;
$$;
revoke execute on function private.entity_shares_paused() from public, anon, authenticated;

create trigger entity_shares_00_paused before insert on public.entity_shares
  for each row execute function private.entity_shares_paused();
