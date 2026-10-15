// Hooks over src/services/status-reports.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  addDraftDecisionLink,
  listStatusReports,
  removeDraftDecisionLink,
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

/** Edit a draft report's decision links (insert/delete status_report_decisions). */
export function useDraftDecisionLink(projectId: string) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      reportId: string;
      decisionId: string;
      sortOrder: number;
      add: boolean;
    }) => {
      if (args.add)
        await addDraftDecisionLink({
          reportId: args.reportId,
          projectId,
          decisionId: args.decisionId,
          sortOrder: args.sortOrder,
        });
      else await removeDraftDecisionLink(args.reportId, args.decisionId);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: qk.projects.statusReports(orgId, projectId) }),
  });
}
