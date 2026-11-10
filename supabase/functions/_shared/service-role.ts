// GL-6: is this request from the service role? For functions called by pg_cron through pg_net
// with the key stored in Vault. Deployed with verify_jwt = true, so the gateway has already
// checked the token's signature against the project's JWT secret; this reads its role claim.
// The key in Vault is the legacy service-role JWT, which no longer equals the runtime's
// SUPABASE_SERVICE_ROLE_KEY, so comparing strings refused it (found 10/11/2026). The runtime key
// itself is still accepted. Never use this in a function deployed with verify_jwt = false.

/** The role claim of a JWT, or null. Doesn't verify the signature (the gateway does). */
export function jwtRole(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function isServiceRoleRequest(authorization: string | null, runtimeKey: string | undefined): boolean {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return false;
  if (runtimeKey && token === runtimeKey) return true;
  return jwtRole(token) === "service_role";
}
