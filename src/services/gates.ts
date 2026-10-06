// The stage-gate checklist for a project's current phase (Prompt H3). Criteria are the
// organisation's own (lifecycle_phases + gate_criteria, loaded into settings); automatic checks
// read the project's benefits and lessons from Supabase. Pure: callers pass the data in.
import { defaultLifecyclePhases, defaultTierDefinitions } from "@/data/lifecycle";
import type { GateCriterion, LifecyclePhase, ProjectTier, TierDefinition } from "@/data/types";
import type { BenefitView } from "./benefits";
import { getSettings } from "./settings";

export type GateCheckStatus = "Pass" | "Fail" | "Manual";
export interface GateChecklistItem {
  criterion: GateCriterion;
  status: GateCheckStatus;
  detail: string;
}

export const phaseByName = (name: string): LifecyclePhase | undefined =>
  getLifecyclePhases().find((phase) => phase.name === name);

export function getGateChecklist(input: {
  phaseName: string;
  tier: ProjectTier;
  benefits: BenefitView[];
  lessonsReviewed: boolean;
  phaseReviewHeld: boolean;
}): GateChecklistItem[] {
  const items = input.benefits;
  const criteria =
    phaseByName(input.phaseName)?.criteria.filter((item) => item.tiers.includes(input.tier)) ?? [];
  const noBenefits = (criterion: GateCriterion): GateChecklistItem => ({
    criterion,
    status: "Fail",
    detail: "No benefit profiles are linked to this project.",
  });
  return criteria.map((criterion): GateChecklistItem => {
    switch (criterion.check) {
      case undefined:
        return {
          criterion,
          status: "Manual",
          detail: "Confirmed manually by the project manager.",
        };
      case "benefit-profiles-owned": {
        if (!items.length) return noBenefits(criterion);
        const unowned = items.filter((benefit) => !benefit.ownerId);
        return unowned.length
          ? {
              criterion,
              status: "Fail",
              detail: `${unowned.length} of ${items.length} benefit profiles have no owner.`,
            }
          : {
              criterion,
              status: "Pass",
              detail: `${items.length} benefit profiles, each with a named owner.`,
            };
      }
      case "benefit-baselines": {
        if (!items.length) return noBenefits(criterion);
        const missing = items.filter(
          (benefit) =>
            !benefit.measures.some(
              (measure) => measure.baselineDate && measure.targetProfile.length,
            ),
        );
        return missing.length
          ? {
              criterion,
              status: "Fail",
              detail: `${missing.length} benefit${missing.length === 1 ? "" : "s"} without a baseline and target profile.`,
            }
          : {
              criterion,
              status: "Pass",
              detail: "Every benefit has a baseline and a target profile.",
            };
      }
      case "benefits-handover": {
        const tracked = items.filter(
          (benefit) => benefit.status !== "Closed" && benefit.status !== "Not realised",
        );
        const missing = tracked.filter((benefit) => !benefit.handover);
        if (!tracked.length)
          return { criterion, status: "Pass", detail: "No benefits remain in realisation." };
        return missing.length
          ? {
              criterion,
              status: "Fail",
              detail: `${missing.length} of ${tracked.length} benefits have no BAU owner or review schedule.`,
            }
          : {
              criterion,
              status: "Pass",
              detail: `All ${tracked.length} benefits handed over to a BAU owner.`,
            };
      }
      case "lessons-reviewed":
        return input.lessonsReviewed
          ? {
              criterion,
              status: "Pass",
              detail: "The project manager has confirmed relevant lessons were reviewed.",
            }
          : {
              criterion,
              status: "Fail",
              detail: "Relevant lessons from similar projects have not been ticked as reviewed.",
            };
      case "phase-lessons-review":
        return input.phaseReviewHeld
          ? {
              criterion,
              status: "Pass",
              detail: "A phase lessons review has been recorded for this phase.",
            }
          : {
              criterion,
              status: "Fail",
              detail: "No phase lessons review has been recorded for this phase.",
            };
      default:
        return {
          criterion,
          status: "Manual",
          detail: "Confirmed manually by the project manager.",
        };
    }
  });
}

/** The organisation's lifecycle phases and tier definitions (settings), with built-in defaults. */
export const getLifecyclePhases = (): LifecyclePhase[] => {
  const phases = getSettings().lifecycle?.phases;
  return phases?.length ? phases : defaultLifecyclePhases;
};
export const getTierDefinitions = (): TierDefinition[] => {
  const tiers = getSettings().lifecycle?.tiers;
  return tiers?.length ? tiers : defaultTierDefinitions;
};
