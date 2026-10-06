-- References past 999 were truncated: lpad() cuts a longer string to the given length, so
-- the 1000th risk became RSK-100 and collided with the 100th. Pad to three digits, never cut.
create or replace function private.next_ref(p_scope_id uuid, p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  insert into private.ref_counters as c (scope_id, prefix, last_value)
  values (p_scope_id, p_prefix, 1)
  on conflict (scope_id, prefix) do update set last_value = c.last_value + 1
  returning c.last_value into v;
  return p_prefix || '-' || case when v < 1000 then lpad(v::text, 3, '0') else v::text end;
end;
$$;
