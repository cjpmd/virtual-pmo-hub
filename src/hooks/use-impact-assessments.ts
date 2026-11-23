// Impact assessments (NHS-3 part 2): queries and mutations for the assessment panel, the register
// and Settings. Every change refreshes all of the organisation's impact assessment queries, since a
// decision changes the register, the target's panel and the gaps list together.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrgId } from "@/components/auth/organisation-provider";
import { useModule } from "@/lib/modules";
import { listGovernanceRoleHolders, listGovernanceRoles } from "@/services/modules";
import {
  decideAssessment,
  flagMaterialChange,
  getAssessmentFor,
  getAssessmentSummary,
  listAssessmentDecisions,
  listAssessmentGaps,
  listAssessmentRegister,
  saveAssessment,
  startAssessment,
  submitAssessment,
  type AssessmentEdit,
  type ImpactTarget,
} from "@/services/impact-assessments";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";
import { useSettings } from "@/services/settings";
import type { AssessmentDecision } from "@/data/impact-assessment";

/** The target's assessment with its sign-off steps and decision history (null when none yet). */
export function useTargetAssessment(entityType: ImpactTarget, entityId: string) {
  const orgId = useOrgId();
  const enabled = useModule("impact_assessment");
  return useQuery({
    queryKey: qk.impactAssessments.target(orgId, entityType, entityId),
    enabled,
    queryFn: async () => {
      const assessment = await getAssessmentFor(entityType, entityId);
      if (!assessment) return null;
      const [summary, decisions] = await Promise.all([
        getAssessmentSummary(assessment.id),
        listAssessmentDecisions(assessment.id),
      ]);
      return { assessment, steps: summary?.steps ?? [], decisions };
    },
  });
}

export function useAssessmentRegister() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.impactAssessments.register(orgId),
    queryFn: listAssessmentRegister,
  });
}

/** Projects past the delivery gate without an approved assessment (empty while no gate is set). */
export function useAssessmentGaps() {
  const orgId = useOrgId();
  const gate = useSettings().modules.impactGatePhaseId ?? null;
  return useQuery({
    queryKey: qk.impactAssessments.gaps(orgId),
    queryFn: () => listAssessmentGaps(orgId),
    enabled: gate !== null,
  });
}

/** Governance roles (labels) and the roles the signed-in person holds, as holder or deputy. */
export function useGovernanceRoleInfo() {
  const orgId = useOrgId();
  const currentUserId = useSettings().currentUserId;
  return useQuery({
    queryKey: [...qk.governanceRoles(orgId), "mine"],
    queryFn: async () => {
      const [roles, holders] = await Promise.all([
        listGovernanceRoles(orgId),
        listGovernanceRoleHolders(orgId),
      ]);
      return {
        labels: new Map(roles.map((role) => [role.value, role.label])),
        roles,
        held: new Set(
          holders.filter((holder) => holder.profileId === currentUserId).map((h) => h.roleKey),
        ),
        holdersByRole: holders.reduce<Map<string, number>>(
          (map, holder) => map.set(holder.roleKey, (map.get(holder.roleKey) ?? 0) + 1),
          new Map(),
        ),
      };
    },
  });
}

export function useAssessmentMutations() {
  const orgId = useOrgId();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: qk.impactAssessments.all(orgId) });
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const options = { meta: { silent: true }, onError } as const;
  return {
    start: useMutation({
      ...options,
      mutationFn: (input: { entityType: ImpactTarget; entityId: string; title?: string }) =>
        startAssessment(input.entityType, input.entityId, input.title),
      onSuccess: refresh,
    }),
    save: useMutation({
      ...options,
      mutationFn: (input: { id: string; edit: AssessmentEdit; lastSeen: string }) =>
        saveAssessment(input.id, input.edit, input.lastSeen),
      onSuccess: refresh,
    }),
    /** Saves the answers, then submits (one click for the person). */
    submit: useMutation({
      ...options,
      mutationFn: async (input: { id: string; edit: AssessmentEdit; lastSeen: string }) => {
        const written = await saveAssessment(input.id, input.edit, input.lastSeen);
        return submitAssessment(input.id, written.updatedAt ?? undefined);
      },
      onSuccess: async () => {
        await refresh();
        toast.success("Submitted for sign-off.");
      },
    }),
    decide: useMutation({
      ...options,
      mutationFn: (input: {
        stepId: string;
        decision: AssessmentDecision;
        comment?: string;
        conditions?: string;
      }) => decideAssessment(input.stepId, input.decision, input.comment, input.conditions),
      onSuccess: async () => {
        await refresh();
        toast.success("Decision recorded.");
      },
    }),
    flag: useMutation({
      ...options,
      mutationFn: (input: { id: string; reason: string }) =>
        flagMaterialChange(input.id, input.reason),
      onSuccess: async () => {
        await refresh();
        toast.success("Flagged for re-assessment.");
      },
    }),
  };
}
