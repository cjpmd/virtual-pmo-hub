-- convert_request_to_project is SECURITY INVOKER, so it runs as the calling
-- authenticated user.  private.write_audit was never granted to that role
-- (all previous callers are SECURITY DEFINER functions that run as postgres).
grant execute on function private.write_audit(uuid, text, text, uuid, jsonb, uuid)
  to authenticated, service_role;
