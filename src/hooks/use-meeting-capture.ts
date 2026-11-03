// Presentation-mode capture: decisions and actions against a pack (services/reports.ts).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { qk } from "@/services/query-keys";
import { addMeetingAction, listReportActions, recordMeetingDecision } from "@/services/reports";

export function useMeetingCapture(reportId: string) {
  const orgId = useOrgId();
  const client = useQueryClient();
  const actionsKey = [...qk.reports.detail(orgId, reportId), "actions"];
  return {
    actions: useQuery({ queryKey: actionsKey, queryFn: () => listReportActions(reportId) }),
    decide: useMutation({
      mutationFn: (v: { decisionId: string; optionId: string; outcome: string }) =>
        recordMeetingDecision({ reportId, ...v }),
      onSuccess: () => client.invalidateQueries({ queryKey: qk.org(orgId) }),
    }),
    addAction: useMutation({
      mutationFn: (v: {
        title: string;
        ownerId: string | null;
        dueDate: string | null;
        projectId: string | null;
      }) => addMeetingAction({ reportId, ...v }),
      onSuccess: () => client.invalidateQueries({ queryKey: actionsKey }),
    }),
  };
}
