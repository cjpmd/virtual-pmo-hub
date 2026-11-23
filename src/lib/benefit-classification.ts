// NHS-2: cash-releasing and non-cash benefit value kept apart, and the default classification a
// benefit category suggests (settings.benefits.categoryClassification, keyed by the category's
// lookup value). Mirrors migration 20261123100000_nhs_2_benefit_categories: cash-releasing means
// classification "Cash-releasing"; every other classification is non-cash. Never add the two
// into one savings figure.
import type { AppSettings, BenefitClassificationValue } from "@/data/settings-types";
import type { BenefitClassification } from "@/data/types";

export const CLASSIFICATION_LABEL: Record<BenefitClassificationValue, BenefitClassification> = {
  cash_releasing: "Cash-releasing",
  non_cash_releasing: "Non-cash-releasing",
  qualitative: "Qualitative",
  societal: "Societal",
};
export const CLASSIFICATION_VALUE = Object.fromEntries(
  Object.entries(CLASSIFICATION_LABEL).map(([value, label]) => [label, value]),
) as Record<BenefitClassification, BenefitClassificationValue>;

export const isCashReleasing = (
  classification: BenefitClassification | BenefitClassificationValue,
) => classification === "Cash-releasing" || classification === "cash_releasing";

/**
 * The classification a category suggests, by the category's lookup value or (in Settings, where
 * categories are labels) its label through settings.benefits.categoryKeys. Null when the
 * organisation hasn't set one: keep whatever is already chosen.
 */
export function defaultClassification(
  category: { value?: string | null; label?: string | null },
  benefits: Pick<AppSettings["benefits"], "categoryClassification" | "categoryKeys"> | undefined,
): BenefitClassification | null {
  const value =
    category.value ?? (category.label ? benefits?.categoryKeys?.[category.label] : undefined);
  if (!value) return null;
  const stored = benefits?.categoryClassification?.[value];
  return stored && stored in CLASSIFICATION_LABEL ? CLASSIFICATION_LABEL[stored] : null;
}

export interface CashSplit {
  cashPlanned: number;
  cashRealised: number;
  nonCashPlanned: number;
  nonCashRealised: number;
}

/** Planned and realised value, cash-releasing and non-cash apart. Negative values count as 0. */
export function cashSplit(
  items: Array<{ classification: BenefitClassification; planned: number; realised: number }>,
): CashSplit {
  const split: CashSplit = {
    cashPlanned: 0,
    cashRealised: 0,
    nonCashPlanned: 0,
    nonCashRealised: 0,
  };
  for (const item of items) {
    const planned = Math.max(0, Number(item.planned) || 0);
    const realised = Math.max(0, Number(item.realised) || 0);
    if (isCashReleasing(item.classification)) {
      split.cashPlanned += planned;
      split.cashRealised += realised;
    } else {
      split.nonCashPlanned += planned;
      split.nonCashRealised += realised;
    }
  }
  return split;
}

/** A measure's notional £ value (units × notional value per unit), or null without a factor. */
export function notionalValue(units: number, perUnit: number | null | undefined): number | null {
  if (perUnit === null || perUnit === undefined || !Number.isFinite(perUnit) || perUnit < 0)
    return null;
  if (!Number.isFinite(units)) return null;
  return Math.round(units * perUnit * 100) / 100;
}
