// Write hooks for milestones and RAID. Each mutation:
//   1. calls one service function (which throws ServiceError on failure or an RLS refusal),
//   2. on settle (success or failure) invalidates the records it touched and every roll-up
//      that derives from them (project, programme and portfolio health), so the screen always
//      ends on the server's truth — failed optimistic board edits are reverted this way,
//   3. reports failures through the MutationCache toast in src/router.tsx.
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  createIssue,
  createMilestone,
  createRisk,
  deleteIssues,
  deleteMilestones,
  deleteRisks,
  updateIssue,
  updateMilestone,
  updateRisk,
  type IssueInput,
  type MilestoneInput,
  type RiskInput,
} from "@/services/project-records";
import { qk } from "@/services/query-keys";

/** Health roll-ups read risks, issues and milestones, so they refresh after any record write. */
const invalidateRollups = (queryClient: QueryClient, orgId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.projects.all(orgId) }),
    queryClient.invalidateQueries({ queryKey: qk.programmes.all(orgId) }),
    queryClient.invalidateQueries({ queryKey: qk.portfolios.all(orgId) }),
  ]);

export function useRaidMutations(projectId: string) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const onSettled = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.projects.raid(orgId, projectId) }),
      invalidateRollups(queryClient, orgId),
    ]);
  return {
    createRisk: useMutation({
      mutationFn: (input: RiskInput & { title: string }) => createRisk(projectId, input),
      onSettled,
    }),
    updateRisk: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: RiskInput;
        lastSeen?: string | null;
      }) => updateRisk(id, input, lastSeen),
      onSettled,
    }),
    deleteRisks: useMutation({ mutationFn: deleteRisks, onSettled }),
    createIssue: useMutation({
      mutationFn: (input: IssueInput & { title: string }) => createIssue(projectId, input),
      onSettled,
    }),
    updateIssue: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: IssueInput;
        lastSeen?: string | null;
      }) => updateIssue(id, input, lastSeen),
      onSettled,
    }),
    deleteIssues: useMutation({ mutationFn: deleteIssues, onSettled }),
  };
}

export function useMilestoneMutations(scopeKey: string) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const onSettled = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.projects.milestones(orgId, scopeKey) }),
      invalidateRollups(queryClient, orgId),
    ]);
  return {
    create: useMutation({
      mutationFn: ({
        projectId,
        input,
      }: {
        projectId: string;
        input: MilestoneInput & { title: string; forecastDate: string };
      }) => createMilestone(projectId, input),
      onSettled,
    }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: MilestoneInput;
        lastSeen?: string | null;
      }) => updateMilestone(id, input, lastSeen),
      onSettled,
    }),
    remove: useMutation({ mutationFn: deleteMilestones, onSettled }),
  };
}
