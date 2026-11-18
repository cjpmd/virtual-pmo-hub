// Project tiers as people see them: the organisation's labels from Settings › Lifecycle (falling
// back to the stored names Small / Medium / Large), and the rules for changing a project's tier.
// Changing a tier needs PMO or admin and a short reason; the database enforces both
// (public.change_project_tier, docs/sql/project-tier-changes.sql). Pure.
import type { ProjectTier, TierDefinition } from "@/data/types";

/** The stored tiers, smallest first. Their names never change: projects reference them. */
export const PROJECT_TIERS: readonly ProjectTier[] = ["Small", "Medium", "Large"];

export const TIER_REASON_MIN = 3;
export const TIER_REASON_MAX = 500;
export const TIER_LOCKED_TIP = "Only the PMO and admins can change a project's tier.";

/** The organisation's label for a tier: its non-blank label, else the stored name. */
export function tierDisplayName(tier: ProjectTier, definitions: readonly TierDefinition[]) {
  const label = definitions.find((item) => item.tier === tier)?.label?.trim();
  return label || tier;
}

export interface TierOption {
  value: ProjectTier;
  label: string;
  guideline: string;
}

/** One option per stored tier, in size order, with the organisation's label and guideline. */
export function tierOptions(definitions: readonly TierDefinition[]): TierOption[] {
  return PROJECT_TIERS.map((tier) => ({
    value: tier,
    label: tierDisplayName(tier, definitions),
    guideline: definitions.find((item) => item.tier === tier)?.guideline ?? "",
  }));
}

/** Why a tier-change reason can't be saved, or null when it can. Mirrors the database's rule. */
export function tierReasonError(reason: string): string | null {
  const text = reason.trim();
  if (text.length < TIER_REASON_MIN) return "Give a short reason for the tier change.";
  if (text.length > TIER_REASON_MAX) return `Keep the reason under ${TIER_REASON_MAX} characters.`;
  return null;
}

/** "Tier changed: Small → Large", in the organisation's labels. */
export function tierChangeTitle(
  from: ProjectTier,
  to: ProjectTier,
  definitions: readonly TierDefinition[],
) {
  return `Tier changed: ${tierDisplayName(from, definitions)} → ${tierDisplayName(to, definitions)}`;
}

/** A tier change as project_tier_history returns it (services/entities.ts TierChange). */
export interface TierChangeRecord {
  changedAt: string;
  from: ProjectTier;
  to: ProjectTier;
  reason: string | null;
  changedBy: string | null;
}

/**
 * A tier change as an Activity timeline entry. `date` is the local calendar day (YYYY-MM-DD) of
 * the change; `id` is unique per change (the history has no row id).
 */
export function tierChangeActivity(
  change: TierChangeRecord,
  definitions: readonly TierDefinition[],
) {
  const at = new Date(change.changedAt);
  const date = Number.isNaN(at.getTime())
    ? change.changedAt.slice(0, 10)
    : `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return {
    id: `${change.changedAt}-${change.from}-${change.to}`,
    date,
    kind: "Tier changed",
    label: tierChangeTitle(change.from, change.to, definitions),
    detail: `${change.reason ?? "No reason recorded"} · ${change.changedBy ?? "Unknown"}`,
  };
}
