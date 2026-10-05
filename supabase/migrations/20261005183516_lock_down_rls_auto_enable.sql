-- Supabase's platform-created ensure_rls event trigger function lives in public and
-- was executable over PostgREST. Event trigger functions fire without EXECUTE, so
-- revoking it from the API roles changes nothing except closing the RPC endpoint.
-- Guarded so a local stack without the platform function still resets cleanly.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
