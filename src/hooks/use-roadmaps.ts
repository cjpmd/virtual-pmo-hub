import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { qk } from "@/services/query-keys";
import { listRoadmaps, rescheduleRoadmapItem } from "@/services/roadmaps";

/** Roadmaps live under the projects key, so project and health changes refresh linked items. */
export function useRoadmaps() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.roadmaps(orgId), queryFn: () => listRoadmaps(orgId) });
}

export function useRescheduleRoadmapItem() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      start,
      finish,
      lastSeen,
    }: {
      id: string;
      start: string;
      finish: string;
      lastSeen: string | null;
    }) => rescheduleRoadmapItem(id, start, finish, lastSeen),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.roadmaps(orgId) }),
  });
}
