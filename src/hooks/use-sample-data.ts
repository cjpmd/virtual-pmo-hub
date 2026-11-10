// Hooks over src/services/sample-data.ts (GL-9).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { qk } from "@/services/query-keys";
import { listSampleIds, removeSampleData, seedSampleData } from "@/services/sample-data";

export function useSampleIds() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.sampleIds(orgId),
    queryFn: () => listSampleIds(orgId),
    staleTime: 5 * 60_000,
  });
}

/** Adding or removing sample data touches every list, so the whole organisation refreshes. */
export function useSampleDataMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: qk.org(orgId) });
  return {
    add: useMutation({ mutationFn: () => seedSampleData(orgId), onSettled }),
    remove: useMutation({ mutationFn: () => removeSampleData(orgId), onSettled }),
  };
}
