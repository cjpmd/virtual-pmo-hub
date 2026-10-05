import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { qk } from "@/services/query-keys";
import { createRequest, listRequests, updateRequest, type RequestInput } from "@/services/requests";

export function useRequests() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.requests(orgId), queryFn: () => listRequests(orgId) });
}

export function useRequestMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: qk.requests(orgId) });
  return {
    update: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: RequestInput;
        lastSeen?: string | null;
      }) => updateRequest(id, input, lastSeen),
      onSettled,
    }),
    create: useMutation({ mutationFn: createRequest, onSettled }),
  };
}
