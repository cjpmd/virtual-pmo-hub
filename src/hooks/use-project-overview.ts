import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { getProjectOverviewData } from "@/services/project-overview";
import { qk } from "@/services/query-keys";

/** The project overview's raw rows in one call (get_project_overview). */
export function useProjectOverview(projectId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.overview(orgId, projectId),
    queryFn: () => getProjectOverviewData(projectId),
  });
}
