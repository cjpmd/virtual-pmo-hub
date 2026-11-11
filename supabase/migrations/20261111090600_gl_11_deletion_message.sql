-- GL-11 follow-up: say why a write is refused when the organisation is scheduled for deletion.
-- private.assert_org_writable (GL-4) gave the trial / subscription message for every read-only
-- organisation. A pending deletion (GL-11) now gets its own sentence, with the date. Same errcode
-- (P0001) and hint (org_read_only), so every caller and the client's read_only mapping still
-- apply; the client shows the database's sentence for this case. Additive: create or replace only.
create or replace function private.assert_org_writable(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_purge_after timestamptz;
begin
  if p_org is not null and not private.organisation_is_writable(p_org) then
    select d.purge_after into v_purge_after
    from public.organisation_deletions d
    where d.organisation_id = p_org and d.cancelled_at is null;
    if found then
      raise exception 'This organisation is scheduled for deletion on %, so it is read-only. An admin can cancel the deletion in Settings › Organisation.',
        to_char(v_purge_after at time zone 'Europe/London', 'FMDD FMMonth YYYY')
        using errcode = 'P0001', hint = 'org_read_only';
    end if;
    raise exception 'This organisation is read-only because its trial or subscription has ended. An admin can subscribe in Settings › Subscription to restore editing.'
      using errcode = 'P0001', hint = 'org_read_only';
  end if;
end;
$$;
revoke execute on function private.assert_org_writable(uuid) from public, anon, authenticated;
