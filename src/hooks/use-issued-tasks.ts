// Hooks over src/services/issued-tasks.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  issueTasks,
  loadIssuedTasks,
  markReminderSent,
  respondToOffer,
  type OfferResponse,
} from "@/services/issued-tasks";
import { qk } from "@/services/query-keys";
import { invalidateRollups } from "./use-project-records";

export function useIssuedTasks() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.issuedTasks(orgId), queryFn: () => loadIssuedTasks(orgId) });
}

export function useIssuedTaskMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  // Issued tasks are work items, so task counts and health refresh too (issuedTasks sits under projects).
  const onSettled = () => invalidateRollups(queryClient, orgId);
  return {
    issue: useMutation({ mutationFn: issueTasks, onSettled }),
    respond: useMutation({
      mutationFn: ({ offerId, answer }: { offerId: string; answer: OfferResponse }) =>
        respondToOffer(offerId, answer),
      onSettled,
    }),
    remind: useMutation({ mutationFn: markReminderSent, onSettled }),
  };
}
