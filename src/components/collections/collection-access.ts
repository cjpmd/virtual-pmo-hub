// GL-22: who may manage collections. RLS is the real check (PMO and admins in the collection's
// workspace, never in an archived workspace); these only decide which buttons to offer.
import { useOrgWritable } from "@/hooks/use-org-access";
import { useOrgRole, useWorkspaceRoles } from "@/hooks/use-permissions";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { atLeast } from "@/services/auth";

export function useCollectionAccess() {
  const roles = useWorkspaceRoles().data ?? [];
  const workspaces = useWorkspaces().data ?? [];
  const writable = useOrgWritable();
  // Archived workspaces cap every role at viewer, so they never count here.
  const canManage = (workspaceId: string | null | undefined) =>
    !!workspaceId &&
    roles.some((role) => role.workspaceId === workspaceId && atLeast(role.role, "pmo")) &&
    !workspaces.find((workspace) => workspace.id === workspaceId)?.archivedAt;
  const pmoWorkspaces = workspaces.filter(
    (workspace) => !workspace.archivedAt && canManage(workspace.id),
  );
  // Collection types are an organisation list: organisation PMO and admins (lookup_values RLS).
  const canManageTypes = atLeast(useOrgRole(), "pmo");
  return { canManage, canManageTypes, pmoWorkspaces, writable };
}
