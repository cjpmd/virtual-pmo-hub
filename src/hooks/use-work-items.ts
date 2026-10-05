// Hooks over src/services/work-items.ts: a project's tasks.
import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { listPortfolioTasks, loadProjectTasks } from "@/services/work-items";
import { qk } from "@/services/query-keys";

export function useProjectTasks(projectId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.tasks(orgId, projectId),
    queryFn: () => loadProjectTasks(orgId, projectId),
  });
}

export function usePortfolioTasks() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.allTasks(orgId),
    queryFn: () => listPortfolioTasks(orgId),
  });
}
