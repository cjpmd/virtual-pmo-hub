// Hooks over src/services/members.ts (work package 2.1): members, seats, invitations, join
// requests and seat changes. Admin-only reads are switched off for everyone else.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { useOrgRole } from "@/hooks/use-permissions";
import type { AppRole } from "@/services/auth";
import {
  addJoinDomain,
  addSeats,
  cancelScheduledChange,
  changeMemberRole,
  decideJoinRequest,
  getJoinSettings,
  getSeatUsage,
  listInvites,
  listJoinRequests,
  listMembers,
  removeJoinDomain,
  removeMember,
  resendInvite,
  revokeInvite,
  scheduleIntervalSwitch,
  scheduleSeatReduction,
  sendInvites,
  setJoinRequestsEnabled,
  type JoinDomain,
} from "@/services/members";
import { qk } from "@/services/query-keys";

export function useMembers() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.members.list(orgId), queryFn: () => listMembers(orgId) });
}

export function useSeatUsage() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.members.seats(orgId), queryFn: () => getSeatUsage(orgId) });
}

export function useInvites() {
  const orgId = useOrgId();
  const isAdmin = useOrgRole() === "admin";
  return useQuery({
    queryKey: qk.members.invites(orgId),
    queryFn: () => listInvites(orgId),
    enabled: isAdmin,
  });
}

export function useJoinSettings() {
  const orgId = useOrgId();
  const isAdmin = useOrgRole() === "admin";
  return useQuery({
    queryKey: qk.members.joinSettings(orgId),
    queryFn: () => getJoinSettings(orgId),
    enabled: isAdmin,
  });
}

/** Pending join requests (admins only; empty for everyone else). Also drives the nav badge. */
export function useJoinRequests() {
  const orgId = useOrgId();
  const isAdmin = useOrgRole() === "admin";
  return useQuery({
    queryKey: qk.members.joinRequests(orgId),
    queryFn: () => listJoinRequests(orgId),
    enabled: isAdmin,
    staleTime: 60_000,
  });
}

export function useMemberMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  // A role or membership change can change seats, workspace roles and the settings' member list.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.members.all(orgId) }),
      queryClient.invalidateQueries({ queryKey: qk.workspaceRoles(orgId) }),
      queryClient.invalidateQueries({ queryKey: qk.workspaces.all(orgId) }),
      queryClient.invalidateQueries({ queryKey: qk.settings(orgId) }),
    ]);
  return {
    changeRole: useMutation({
      meta: { silent: true }, // the page shows the error itself
      mutationFn: (input: { profileId: string; role: AppRole }) =>
        changeMemberRole(orgId, input.profileId, input.role),
      onSettled: refresh,
    }),
    remove: useMutation({
      meta: { silent: true },
      mutationFn: (profileId: string) => removeMember(orgId, profileId),
      onSettled: refresh,
    }),
    invite: useMutation({
      meta: { silent: true },
      mutationFn: (input: {
        invites: Array<{ email: string; role: AppRole }>;
        workspaceIds: string[];
      }) => sendInvites(orgId, input.invites, input.workspaceIds),
      onSettled: refresh,
    }),
    resend: useMutation({
      meta: { silent: true },
      mutationFn: resendInvite,
      onSettled: refresh,
    }),
    revoke: useMutation({
      meta: { silent: true },
      mutationFn: revokeInvite,
      onSettled: refresh,
    }),
    decide: useMutation({
      meta: { silent: true },
      mutationFn: (input: {
        requestId: string;
        decision: { approve: true; role: AppRole; workspaceIds: string[] } | { approve: false };
      }) => decideJoinRequest(input.requestId, input.decision),
      onSettled: refresh,
    }),
    setJoinEnabled: useMutation({
      meta: { silent: true },
      mutationFn: (enabled: boolean) => setJoinRequestsEnabled(orgId, enabled),
      onSettled: refresh,
    }),
    addDomain: useMutation({
      meta: { silent: true },
      mutationFn: (kind: JoinDomain["kind"]) => addJoinDomain(orgId, kind),
      onSettled: refresh,
    }),
    removeDomain: useMutation({
      meta: { silent: true },
      mutationFn: removeJoinDomain,
      onSettled: refresh,
    }),
  };
}

/** Seat and billing-period changes through manage-subscription. */
export function useSeatChangeMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.members.seats(orgId) }),
      queryClient.invalidateQueries({ queryKey: qk.settings(orgId) }),
    ]);
  return {
    add: useMutation({
      meta: { silent: true },
      mutationFn: (input: { seats: number; prorationDate: number }) =>
        addSeats(orgId, input.seats, input.prorationDate),
      onSettled: refresh,
    }),
    reduce: useMutation({
      meta: { silent: true },
      mutationFn: (seats: number) => scheduleSeatReduction(orgId, seats),
      onSettled: refresh,
    }),
    switchInterval: useMutation({
      meta: { silent: true },
      mutationFn: (interval: "month" | "year") => scheduleIntervalSwitch(orgId, interval),
      onSettled: refresh,
    }),
    cancelScheduled: useMutation({
      meta: { silent: true },
      mutationFn: () => cancelScheduledChange(orgId),
      onSettled: refresh,
    }),
  };
}
