// Hooks over src/services/status-reports.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { listStatusReports, submitStatusReport } from "@/services/status-reports";
import { qk } from "@/services/query-keys";
import { invalidateRollups } from "./use-project-records";

export function useStatusReports(projectId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.statusReports(orgId, projectId),
    queryFn: () => listStatusReports(orgId, projectId),
  });
}

export function useSubmitStatusReport() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  // The latest report sets the declared RAG (assurance) and the last-report date on lists.
  return useMutation({
    mutationFn: submitStatusReport,
    onSettled: () => invalidateRollups(queryClient, orgId),
  });
}
