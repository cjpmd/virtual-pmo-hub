// Hooks over src/services/collections.ts.
import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { listCollections, loadPackProjects } from "@/services/collections";
import { qk } from "@/services/query-keys";

export function useCollections() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.collections(orgId),
    queryFn: () => listCollections(orgId),
  });
}

export function usePackProjects(projectIds: string[]) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.pack(orgId, projectIds),
    queryFn: () => loadPackProjects(orgId, projectIds),
  });
}
