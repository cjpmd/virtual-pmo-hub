// Hooks over src/services/decisions.ts: decisions, assumptions and change requests.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  loadGovernance,
  raiseIssueFromAssumption,
  recordDecision,
  supersedeDecision,
  updateAssumption,
  updateChange,
  updateDecision,
  type AssumptionInput,
  type ChangeInput,
  type DecisionInput,
  type ResolvedDecision,
} from "@/services/decisions";
import { qk } from "@/services/query-keys";
import { invalidateRollups } from "./use-project-records";

export function useGovernance() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.governance(orgId), queryFn: () => loadGovernance(orgId) });
}

export function useGovernanceMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: qk.governance(orgId) });
  // Raising an issue changes issue health, so the roll-ups refresh too.
  const onIssue = () => Promise.all([onSettled(), invalidateRollups(queryClient, orgId)]);
  return {
    recordDecision: useMutation({ mutationFn: recordDecision, onSettled }),
    supersede: useMutation({
      mutationFn: ({ decision, neededBy }: { decision: ResolvedDecision; neededBy: string }) =>
        supersedeDecision(decision, neededBy),
      onSettled,
    }),
    updateDecision: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: DecisionInput;
        lastSeen?: string | null;
      }) => updateDecision(id, input, lastSeen),
      onSettled,
    }),
    updateAssumption: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: AssumptionInput;
        lastSeen?: string | null;
      }) => updateAssumption(id, input, lastSeen),
      onSettled,
    }),
    raiseIssue: useMutation({ mutationFn: raiseIssueFromAssumption, onSettled: onIssue }),
    updateChange: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: ChangeInput;
        lastSeen?: string | null;
      }) => updateChange(id, input, lastSeen),
      onSettled,
    }),
  };
}
