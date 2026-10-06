// Hooks over src/services/integrations.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  loadIntegrations,
  requestAdminConsent,
  resolveConflict,
  retryOutbox,
  unlinkPlan,
} from "@/services/integrations";
import { qk } from "@/services/query-keys";

export function useIntegrations() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.integrations(orgId), queryFn: () => loadIntegrations(orgId) });
}

export function useIntegrationMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: qk.integrations(orgId) });
  return {
    requestConsent: useMutation({
      mutationFn: ({ exists, email }: { exists: boolean; email: string }) =>
        requestAdminConsent(orgId, exists, email),
      onSettled,
    }),
    unlink: useMutation({ mutationFn: unlinkPlan, onSettled }),
    resolve: useMutation({
      mutationFn: ({
        id,
        resolution,
        lastSeen,
      }: {
        id: string;
        resolution: "Kept Planner" | "Reapplied";
        lastSeen: string;
      }) => resolveConflict(id, resolution, lastSeen),
      onSettled,
    }),
    retry: useMutation({ mutationFn: retryOutbox, onSettled }),
  };
}
