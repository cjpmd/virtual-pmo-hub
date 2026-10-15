import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  listGateTicks,
  tickGateCriterion,
  untickGateCriterion,
  type GateTickInput,
} from "@/services/gate-ticks";
import { qk } from "@/services/query-keys";

/** Saved gate checklist ticks for a project (all its gate milestones). */
export function useGateTicks(projectId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.gateTicks(orgId, projectId),
    queryFn: () => listGateTicks(projectId),
  });
}

/** Tick or untick one criterion against a gate milestone, then reload the ticks. */
export function useToggleGateTick(projectId: string) {
  const orgId = useOrgId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ ticked, ...input }: GateTickInput & { ticked: boolean }) =>
      ticked ? tickGateCriterion(input).then(() => undefined) : untickGateCriterion(input),
    onSettled: () =>
      client.invalidateQueries({ queryKey: qk.projects.gateTicks(orgId, projectId) }),
  });
}
