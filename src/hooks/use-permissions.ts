// What the signed-in user may do, for deciding which buttons to show. RLS still enforces every
// write; these only stop the UI offering actions that would be refused.
import { useQuery } from "@tanstack/react-query";
import { useOrganisation, useOrgId } from "@/components/auth/organisation-provider";
import { atLeast, listMyWorkspaceRoles, type AppRole } from "@/services/auth";
import { qk } from "@/services/query-keys";

export function useWorkspaceRoles() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.workspaceRoles(orgId),
    queryFn: listMyWorkspaceRoles,
    staleTime: 5 * 60_000,
    select: (rows) => rows.filter((row) => row.organisationId === orgId),
  });
}

/**
 * Effective role in a workspace. Without a workspace id, the highest role across the
 * organisation's workspaces (used for organisation-wide screens such as registers).
 */
export function useWorkspaceRole(workspaceId?: string | null): AppRole | null {
  const roles = useWorkspaceRoles().data ?? [];
  if (workspaceId) return roles.find((row) => row.workspaceId === workspaceId)?.role ?? null;
  return roles.reduce<AppRole | null>(
    (best, row) => (!best || atLeast(row.role, best) ? row.role : best),
    null,
  );
}

/** True when the user holds at least `min` in the workspace (or anywhere, without one). */
export function useCan(min: AppRole, workspaceId?: string | null) {
  return atLeast(useWorkspaceRole(workspaceId), min);
}

/** The organisation-level role (memberships), e.g. for settings. */
export function useOrgRole(): AppRole {
  return useOrganisation().organisation.role as AppRole;
}
