// Hooks over src/services/committee-packs.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  getCommitteePack,
  issueCommitteePack,
  listCommitteePacks,
} from "@/services/committee-packs";
import { qk } from "@/services/query-keys";

export function useCommitteePacks() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.committeePacks(orgId),
    queryFn: () => listCommitteePacks(orgId),
  });
}

/** One issued pack with its snapshot. Issued packs never change, so it is never refetched. */
export function useCommitteePack(id: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.committeePacks(orgId), id],
    queryFn: () => getCommitteePack(id),
    staleTime: Infinity,
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
