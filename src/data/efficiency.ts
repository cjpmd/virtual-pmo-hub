// Efficiency / savings programme (NHS-4; "CIP" in the NHS pack): stages, planning confidence and
// the pure sums the screens show. Mirrors private.efficiency_stage_rank,
// private.efficiency_settings, private.efficiency_default_categories, private.financial_year_of
// and public.efficiency_run_rate_fye in migration 20261123190000_nhs_4_efficiency: change both
// together. The database is the authority (it enforces the stage rules); these let screens show
// the same result before saving.
import type { SectorPack } from "./sector-packs";

export type EfficiencyStage =
  | "idea"
  | "opportunity"
  | "plan_in_progress"
  | "fully_developed"
  | "in_delivery"
  | "delivered"
  | "on_hold"
  | "rejected";

/** Pipeline order; on hold and rejected sit outside it. */
export const PIPELINE_STAGES: EfficiencyStage[] = [
  "idea",
  "opportunity",
  "plan_in_progress",
  "fully_developed",
  "in_delivery",
  "delivered",
];
export const STAGES: EfficiencyStage[] = [...PIPELINE_STAGES, "on_hold", "rejected"];

export const STAGE_LABELS: Record<EfficiencyStage, string> = {
  idea: "Idea",
  opportunity: "Opportunity",
  plan_in_progress: "Plan in progress",
  fully_developed: "Fully developed",
  in_delivery: "In delivery",
  delivered: "Delivered / closed",
  on_hold: "On hold",
  rejected: "Rejected",
};

export const isStage = (value: unknown): value is EfficiencyStage =>
  STAGES.includes(value as EfficiencyStage);

/** 1–6 along the pipeline; 0 for on hold and rejected. */
export const stageRank = (stage: EfficiencyStage): number => PIPELINE_STAGES.indexOf(stage) + 1;

export type Confidence =
  | "fully_developed_in_delivery"
  | "fully_developed_not_started"
  | "plans_in_progress"
  | "opportunity";

export const CONFIDENCES: Confidence[] = [
  "fully_developed_in_delivery",
  "fully_developed_not_started",
  "plans_in_progress",
  "opportunity",
];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  fully_developed_in_delivery: "Fully developed – in delivery",
  fully_developed_not_started: "Fully developed – delivery not yet started",
  plans_in_progress: "Plans in progress",
  opportunity: "Opportunity",
};

export const isConfidence = (value: unknown): value is Confidence =>
  CONFIDENCES.includes(value as Confidence);

export const DEFAULT_WEIGHTS: Record<Confidence, number> = {
  fully_developed_in_delivery: 1,
  fully_developed_not_started: 0.8,
  plans_in_progress: 0.5,
  opportunity: 0.2,
};

export type SavingsType = "pay" | "non_pay" | "income";
export const SAVINGS_TYPE_LABELS: Record<SavingsType, string> = {
  pay: "Pay",
  non_pay: "Non-pay",
  income: "Income",
};

export type Recurrence = "recurrent" | "non_recurrent" | "mixed";
export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  recurrent: "Recurrent",
  non_recurrent: "Non-recurrent",
  mixed: "Recurrent and non-recurrent",
};

export type ValueKind = "plan" | "forecast" | "actual";

export interface EfficiencySettings {
  /** In delivery needs an approved impact assessment (while that module is on). */
  requireAssessment: boolean;
  /** In delivery needs the finance lead's validation. */
  requireFinanceValidation: boolean;
  confidenceWeights: Record<Confidence, number>;
}

export const DEFAULT_SETTINGS: EfficiencySettings = {
  requireAssessment: true,
  requireFinanceValidation: true,
  confidenceWeights: DEFAULT_WEIGHTS,
};

/** Stored settings (any shape) with the defaults filled in. Pure. */
export function toEfficiencySettings(value: unknown): EfficiencySettings {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const weights =
    typeof raw["confidenceWeights"] === "object" && raw["confidenceWeights"] !== null
      ? (raw["confidenceWeights"] as Record<string, unknown>)
      : {};
  return {
    requireAssessment:
      typeof raw["requireAssessment"] === "boolean" ? raw["requireAssessment"] : true,
    requireFinanceValidation:
      typeof raw["requireFinanceValidation"] === "boolean" ? raw["requireFinanceValidation"] : true,
    confidenceWeights: Object.fromEntries(
      CONFIDENCES.map((c) => {
        const w = weights[c];
        return [c, typeof w === "number" && w >= 0 && w <= 1 ? w : DEFAULT_WEIGHTS[c]];
      }),
    ) as Record<Confidence, number>,
  };
}

/** Planned value × the confidence weight (0 without a confidence), rounded to pence. */
export function riskAdjusted(
  planned: number,
  confidence: Confidence | null,
  weights: Record<Confidence, number> = DEFAULT_WEIGHTS,
): number {
  if (!confidence) return 0;
  return Math.round(planned * weights[confidence] * 100) / 100;
}

/** The calendar year a financial year starts in, for a month (YYYY-MM-DD). */
export function financialYearOf(month: string, startMonth: number): number {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m >= startMonth ? year : year - 1;
}

/** "2026/27" for a financial year starting in 2026 (or "2026" for a January start). */
export function financialYearLabel(year: number, startMonth: number): string {
  return startMonth === 1 ? String(year) : `${year}/${String((year + 1) % 100).padStart(2, "0")}`;
}

/** The twelve months (first days) of a financial year, in order. */
export function financialYearMonths(year: number, startMonth: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = startMonth - 1 + i;
    const y = year + Math.floor(m / 12);
    return `${y}-${String((m % 12) + 1).padStart(2, "0")}-01`;
  });
}

export interface MonthValue {
  month: string;
  kind: ValueKind;
  recurrent: number;
  nonRecurrent: number;
}

/** Suggested full-year effect: average recurrent value of the last three planned months × 12. */
export function runRateFullYearEffect(values: MonthValue[]): number | null {
  const last = values
    .filter((v) => v.kind === "plan")
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 3);
  if (!last.length) return null;
  const avg = last.reduce((sum, v) => sum + v.recurrent, 0) / last.length;
  return Math.round(avg * 12 * 100) / 100;
}

/** Default categories seeded with the module (private.efficiency_default_categories). */
export function defaultCategories(
  pack: SectorPack | null | undefined,
): { value: string; label: string }[] {
  return pack === "nhs"
    ? [
        { value: "workforce", label: "Workforce and pay" },
        { value: "agency_bank", label: "Agency and bank" },
        { value: "medicines", label: "Medicines" },
        { value: "procurement", label: "Procurement and non-pay" },
        { value: "estates", label: "Estates and facilities" },
        { value: "clinical_productivity", label: "Clinical productivity" },
        { value: "corporate", label: "Corporate services" },
        { value: "income", label: "Income" },
      ]
    : [
        { value: "staffing", label: "Staffing" },
        { value: "procurement", label: "Procurement" },
        { value: "estates", label: "Estates" },
        { value: "process_improvement", label: "Process improvement" },
        { value: "income", label: "Income" },
      ];
}
