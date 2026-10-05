// Hooks over src/services/resources.ts: people, placeholders, bookings and project teams.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  bookResource,
  loadResources,
  moveAssignment,
  type AssignmentView,
} from "@/services/resources";
import { qk } from "@/services/query-keys";

export function useResourceData() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.resources.planning(orgId), queryFn: () => loadResources(orgId) });
}

export function useResourceMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: qk.resources.planning(orgId) });
  return {
    move: useMutation({
      mutationFn: ({
        item,
        resourceId,
        start,
        end,
      }: {
        item: AssignmentView;
        resourceId: string;
        start: string;
        end: string;
      }) => moveAssignment(item, resourceId, start, end),
      onSettled,
    }),
    book: useMutation({ mutationFn: bookResource, onSettled }),
  };
}
