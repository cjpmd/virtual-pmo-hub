// Hooks over src/services/dependencies.ts. The key sits under projects, so milestone and
// project writes (which change dependency health) refresh it too.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  createDependency,
  deleteDependencies,
  loadDependencies,
  raiseFromDependency,
  updateDependency,
  type DependencyInput,
  type EndInput,
} from "@/services/dependencies";
import { qk } from "@/services/query-keys";
import { invalidateRollups } from "./use-project-records";

export function useDependencies() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.dependencies(orgId), queryFn: () => loadDependencies(orgId) });
}

export function useDependencyMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const onSettled = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.dependencies(orgId) }),
      invalidateRollups(queryClient, orgId),
    ]);
  return {
    create: useMutation({
      mutationFn: ({
        input,
        raisedById,
        today,
      }: {
        input: DependencyInput & { giver: EndInput; receiver: EndInput; requiredBy: string };
        raisedById: string | null;
        today: string;
      }) => createDependency(input, raisedById, today),
      onSettled,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: DependencyInput;
        lastSeen?: string | null;
      }) => updateDependency(id, input, lastSeen),
      onSettled,
    }),
    remove: useMutation({ mutationFn: deleteDependencies, onSettled }),
    raise: useMutation({ mutationFn: raiseFromDependency, onSettled }),
  };
}
