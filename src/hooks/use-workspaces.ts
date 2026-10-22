// Hooks over src/services/workspaces.ts (work package 1.6).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import type { AppRole } from "@/services/auth";
import { qk } from "@/services/query-keys";
import {
  addWorkspaceMember,
  changeWorkspaceMemberRole,
  createWorkspace,
  deleteWorkspace,
  listWorkspaceMembers,
  listWorkspaces,
  removeWorkspaceMember,
  setWorkspaceArchived,
  updateWorkspace,
  type Workspace,
  type WorkspaceInput,
  type WorkspaceMember,
} from "@/services/workspaces";

/** The organisation's workspaces the user can see, active first. */
export function useWorkspaces() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.workspaces.all(orgId),
    queryFn: () => listWorkspaces(orgId),
    staleTime: 5 * 60_000,
  });
}

/** True when the workspace is archived (read-only). False while loading or without one. */
export function useWorkspaceArchived(workspaceId: string | null | undefined) {
  const workspaces = useWorkspaces().data ?? [];
  return !!workspaceId && !!workspaces.find((item) => item.id === workspaceId)?.archivedAt;
}

export function useWorkspaceMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.workspaces.all(orgId) }),
      queryClient.invalidateQueries({ queryKey: qk.workspaceRoles(orgId) }),
    ]);
  return {
    create: useMutation({
      meta: { silent: true }, // the dialog shows the error itself
      mutationFn: (input: WorkspaceInput) => createWorkspace(orgId, input),
      onSuccess: refresh,
    }),
    update: useMutation({
      meta: { silent: true },
      mutationFn: (input: { workspace: Workspace } & WorkspaceInput) =>
        updateWorkspace(input.workspace, input),
      onSuccess: refresh,
    }),
    // Archiving changes what everyone may do in that workspace: reload the organisation's data.
    setArchived: useMutation({
      meta: { silent: true },
      mutationFn: (input: { workspace: Workspace; archived: boolean }) =>
        setWorkspaceArchived(input.workspace, input.archived),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.org(orgId) }),
    }),
    remove: useMutation({
      meta: { silent: true },
      mutationFn: deleteWorkspace,
      onSuccess: refresh,
    }),
  };
}

export function useWorkspaceMembers(workspaceId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.workspaces.members(orgId, workspaceId ?? ""),
    queryFn: () => listWorkspaceMembers(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useWorkspaceMemberMutations(workspaceId: string) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.workspaces.members(orgId, workspaceId) }),
      queryClient.invalidateQueries({ queryKey: qk.workspaceRoles(orgId) }),
    ]);
  return {
    add: useMutation({
      meta: { silent: true }, // the panel shows the error itself
      mutationFn: (input: { profileId: string; role: AppRole }) =>
        addWorkspaceMember(workspaceId, input.profileId, input.role),
      onSettled: refresh,
    }),
    changeRole: useMutation({
      meta: { silent: true },
      mutationFn: (input: { member: WorkspaceMember; role: AppRole }) =>
        changeWorkspaceMemberRole(input.member, input.role),
      onSettled: refresh,
    }),
    remove: useMutation({
      meta: { silent: true },
      mutationFn: removeWorkspaceMember,
      onSettled: refresh,
    }),
  };
}
