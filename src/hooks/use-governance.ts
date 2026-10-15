// Hooks over src/services/decisions.ts: decisions, assumptions and change requests.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  addDecisionLink,
  createDecision,
  deferDecision,
  listDecisionEvents,
  listDecisionLinkTargets,
  loadGovernance,
  removeDecisionLink,
  reverseDecision,
  savePendingDecision,
  updateDecisionAction,
  withdrawDecision,
  type DecisionLinkKind,
  type NewDecisionInput,
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

/** History of one decision (decision_events, newest first). Under the governance key, so every
 * decision write refreshes it. */
export function useDecisionEvents(decisionId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.governance(orgId), "events", decisionId],
    queryFn: () => listDecisionEvents(orgId, decisionId),
  });
}

/** Records on a project that a decision can link to. */
export function useDecisionLinkTargets(projectId: string | null | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.governance(orgId), "link-targets", projectId ?? ""],
    queryFn: () => listDecisionLinkTargets(projectId ?? ""),
    enabled: Boolean(projectId),
  });
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
    defer: useMutation({ mutationFn: deferDecision, onSettled }),
    reverse: useMutation({ mutationFn: reverseDecision, onSettled }),
    withdraw: useMutation({ mutationFn: withdrawDecision, onSettled }),
    create: useMutation({
      mutationFn: (input: NewDecisionInput) => createDecision(input),
      onSettled,
    }),
    savePending: useMutation({
      mutationFn: (args: {
        id: string;
        input: Omit<NewDecisionInput, "scope" | "links">;
        optionIds: string[];
        lastSeen: string;
      }) => savePendingDecision(args.id, args.input, args.optionIds, args.lastSeen),
      onSettled,
    }),
    link: useMutation({
      mutationFn: async (args: {
        id: string;
        kind: DecisionLinkKind;
        targetId: string;
        add: boolean;
      }) => {
        if (args.add) await addDecisionLink(args.id, args.kind, args.targetId);
        else await removeDecisionLink(args.id, args.kind, args.targetId);
      },
      onSettled,
    }),
    updateAction: useMutation({
      mutationFn: (args: {
        id: string;
        input: Parameters<typeof updateDecisionAction>[1];
        lastSeen: string;
      }) => updateDecisionAction(args.id, args.input, args.lastSeen),
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
