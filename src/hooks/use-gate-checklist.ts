import { useBenefits } from "@/hooks/use-benefits";
import { benefitsForProject } from "@/services/benefits-value";
import { getGateChecklist, phaseByName } from "@/services/gates";
import type { ProjectSummary } from "@/services/hierarchy";

export interface ChecklistInput {
  project: ProjectSummary;
  lessonsReviewed: boolean;
  phaseReviewHeld: boolean;
  manualTicks: string[];
}

/**
 * The current phase's exit-gate criteria, resolved (passed when evaluated as Pass, or a manual
 * item ticked). Shared by the checklist on Plan › Gates and the Overview gate signal.
 */
export function useGateChecklist({
  project,
  lessonsReviewed,
  phaseReviewHeld,
  manualTicks,
}: ChecklistInput) {
  const benefits = useBenefits().data;
  const phase = phaseByName(project.phaseName);
  const items = getGateChecklist({
    phaseName: project.phaseName,
    tier: project.tier,
    benefits: benefits ? benefitsForProject(benefits, project.id) : [],
    lessonsReviewed,
    phaseReviewHeld,
  });
  const resolved = items.map((item) => ({
    ...item,
    passed:
      item.status === "Pass" ||
      (item.status === "Manual" && manualTicks.includes(item.criterion.id)),
  }));
  return {
    phase,
    resolved,
    passed: resolved.filter((item) => item.passed).length,
    total: resolved.length,
  };
}
