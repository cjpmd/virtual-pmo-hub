// Hooks over src/services/committee-packs.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { issueCommitteePack, listCommitteePacks } from "@/services/committee-packs";
import { qk } from "@/services/query-keys";

export function useCommitteePacks() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.committeePacks(orgId),
    queryFn: () => listCommitteePacks(orgId),
  });
}

export function useIssueCommitteePack() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: true }, // the pack preview shows the error itself
    mutationFn: issueCommitteePack,
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.committeePacks(orgId) }),
  });
}
