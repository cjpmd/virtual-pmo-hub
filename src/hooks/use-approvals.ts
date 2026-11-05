// Hooks over services/approvals.ts and services/escalations.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  addApprovalGate,
  addApprovalStep,
  decideApprovalStep,
  listApprovalGates,
  removeApprovalStep,
  waiveApprovalGate,
} from "@/services/approvals";
import { listEscalatable, setEscalation, type EscalatableItem } from "@/services/escalations";
import { qk } from "@/services/query-keys";

const key = (orgId: string, projectId: string) =>
  [...qk.org(orgId), "projects", projectId, "approval-gates"] as const;
const escKey = (orgId: string, projectId: string) =>
  [...qk.org(orgId), "projects", projectId, "escalations"] as const;

export function useApprovalGates(projectId: string) {
  const orgId = useOrgId();
  return useQuery({ queryKey: key(orgId, projectId), queryFn: () => listApprovalGates(projectId) });
}

export function useApprovalMutations(projectId: string) {
  const orgId = useOrgId();
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: key(orgId, projectId) });
  return {
    addGate: useMutation({
      mutationFn: (input: { name: string; gateType: string; dueDate: string | null }) =>
        addApprovalGate(projectId, input),
      onSuccess,
    }),
    addStep: useMutation({
      mutationFn: (v: { gateId: string; order: number; role: string }) =>
        addApprovalStep(v.gateId, v.order, v.role),
      onSuccess,
    }),
    removeStep: useMutation({
      mutationFn: (stepId: string) => removeApprovalStep(stepId),
      onSuccess,
    }),
    waive: useMutation({
      mutationFn: (v: { gateId: string; lastSeen: string }) =>
        waiveApprovalGate(v.gateId, v.lastSeen),
      onSuccess,
    }),
    decide: useMutation({
      mutationFn: (v: { stepId: string; decision: "approved" | "rejected"; comment: string }) =>
        decideApprovalStep(v.stepId, v.decision, v.comment),
      onSuccess,
    }),
  };
}

export function useEscalatable(projectId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: escKey(orgId, projectId),
    queryFn: () => listEscalatable(projectId),
  });
}

export function useSetEscalation(projectId: string) {
  const orgId = useOrgId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { item: EscalatableItem; forumId: string | null }) =>
      setEscalation(v.item, v.forumId),
    onSuccess: () => client.invalidateQueries({ queryKey: escKey(orgId, projectId) }),
  });
}
