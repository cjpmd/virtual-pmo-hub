// Hooks over src/services/status-reports.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  listStatusReports,
  saveStatusReportDraft,
  submitStatusReport,
} from "@/services/status-reports";
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
  // Submitting also freezes decision links and changes the governance view of them.
  return useMutation({
    mutationFn: submitStatusReport,
    onSettled: (_data, _error, input) =>
      Promise.all([
        invalidateRollups(queryClient, orgId),
        queryClient.invalidateQueries({
          queryKey: qk.projects.statusReports(orgId, input.projectId),
        }),
      ]),
  });
}

/** Save a draft report (save_status_report_draft); reloads the project's reports. */
export function useSaveStatusReportDraft() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveStatusReportDraft,
    onSettled: (_data, _error, input) =>
      queryClient.invalidateQueries({
        queryKey: qk.projects.statusReports(orgId, input.projectId),
      }),
  });
}
