// Five Case Model business cases (NHS-5, module five_case; docs/nhs-module-plan.md § NHS-5).
//
//   stages    – single, or SOC → OBC → FBC; a new stage is a new version that carries the content
//               forward (start_business_case_stage). The database refuses going back once a stage
//               is approved, or skipping a stage.
//   strategic – spending objectives and critical success factors (business_case_objectives).
//   economic  – long and short-listed options, and per-year capital, revenue, cash and non-cash
//               benefit figures (business_case_option_years) for the appraisal aid below.
//   approval  – submitting opens an approval gate from the organisation's route for the stage
//               (settings.fiveCase.approvalRoutes); each step is decided by a governance role
//               holder through decide_approval_step, and the version follows the gate.
//
// The appraisal figures (present values, NPV, NPSV, benefit-cost ratio) are an aid worked out
// from what the user typed, not a substitute for finance review; they are not health or RAG.
import { supabase } from "@/integrations/supabase/client";
import { ServiceError, unwrap } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

export const CASE_STAGES = ["single", "soc", "obc", "fbc"] as const;
export type CaseStage = (typeof CASE_STAGES)[number];

export const stageLabel: Record<CaseStage, string> = {
  single: "Single-stage case",
  soc: "Strategic Outline Case",
  obc: "Outline Business Case",
  fbc: "Full Business Case",
};
export const stageShort: Record<CaseStage, string> = {
  single: "Single stage",
  soc: "SOC",
  obc: "OBC",
  fbc: "FBC",
};

export const isCaseStage = (value: unknown): value is CaseStage =>
  typeof value === "string" && (CASE_STAGES as readonly string[]).includes(value);

const stageRank: Record<CaseStage, number> = { single: 0, soc: 1, obc: 2, fbc: 3 };

/**
 * The stages a new version may take, mirroring private.business_case_stage_check: never back
 * past an approved stage, at most one beyond the highest approved stage, and a case approved as
 * single-stage (or staged) stays that way.
 */
export function allowedNextStages(approvedStages: CaseStage[]): CaseStage[] {
  const staged = approvedStages.filter((s) => s !== "single");
  if (approvedStages.includes("single")) return ["single"];
  if (!staged.length) return [...CASE_STAGES];
  const max = Math.max(...staged.map((s) => stageRank[s]));
  return (["soc", "obc", "fbc"] as CaseStage[]).filter(
    (s) => stageRank[s] >= max && stageRank[s] <= max + 1,
  );
}

export const TEMPLATE_SETS = { standard: "Standard", five_case: "Five Case Model" } as const;
export type TemplateSetKey = keyof typeof TEMPLATE_SETS | (string & {});
export const templateSetLabel = (key: string) =>
  (TEMPLATE_SETS as Record<string, string>)[key] ?? key;

export const CASE_GROUPS = [
  "strategic",
  "economic",
  "commercial",
  "financial",
  "management",
] as const;
export type CaseGroup = (typeof CASE_GROUPS)[number];
export const caseGroupLabel: Record<CaseGroup, string> = {
  strategic: "Strategic case",
  economic: "Economic case",
  commercial: "Commercial case",
  financial: "Financial case",
  management: "Management case",
};
export const isCaseGroup = (value: unknown): value is CaseGroup =>
  typeof value === "string" && (CASE_GROUPS as readonly string[]).includes(value);

export type ObjectiveKind = "spending_objective" | "critical_success_factor";
export const objectiveKindLabel: Record<ObjectiveKind, string> = {
  spending_objective: "Spending objective",
  critical_success_factor: "Critical success factor",
};

export interface CaseObjective {
  id: string;
  kind: ObjectiveKind;
  title: string;
  description: string | null;
  measure: string | null;
  sortOrder: number;
  updatedAt: string;
}

export interface OptionYear {
  id: string;
  optionId: string;
  yearIndex: number;
  capitalCost: number;
  revenueCost: number;
  cashBenefit: number;
  nonCashBenefit: number;
  updatedAt: string;
}

// ---- Appraisal aid ----

export interface AppraisalYearInput {
  yearIndex: number;
  capitalCost: number;
  revenueCost: number;
  cashBenefit: number;
  nonCashBenefit: number;
}

export interface AppraisalResult {
  /** Years counted (0 … appraisalYears − 1). */
  years: number;
  pvCost: number;
  /** Present value of costs after optimism bias. */
  pvCostAdjusted: number;
  pvCashBenefit: number;
  pvNonCashBenefit: number;
  /** Cash benefits less bias-adjusted costs. */
  npv: number;
  /** Cash and non-cash benefits less bias-adjusted costs (net present social value). */
  npsv: number;
  /** All benefits over bias-adjusted costs; null when there are no costs. */
  bcr: number | null;
}

/**
 * Discounted appraisal of one option. Year 0 is undiscounted; year t is divided by
 * (1 + rate)^t. Optimism bias raises every cost by the given percentage.
 */
export function appraiseOption(
  rows: AppraisalYearInput[],
  options: { discountRatePct: number; appraisalYears: number; optimismBiasPct?: number | null },
): AppraisalResult {
  const rate = Math.max(0, options.discountRatePct) / 100;
  const bias = 1 + Math.max(0, options.optimismBiasPct ?? 0) / 100;
  const years = Math.max(1, Math.floor(options.appraisalYears));
  let pvCost = 0,
    pvCash = 0,
    pvNonCash = 0;
  for (const row of rows) {
    if (row.yearIndex < 0 || row.yearIndex >= years) continue;
    const factor = 1 / (1 + rate) ** row.yearIndex;
    pvCost += (row.capitalCost + row.revenueCost) * factor;
    pvCash += row.cashBenefit * factor;
    pvNonCash += row.nonCashBenefit * factor;
  }
  const pvCostAdjusted = pvCost * bias;
  return {
    years,
    pvCost,
    pvCostAdjusted,
    pvCashBenefit: pvCash,
    pvNonCashBenefit: pvNonCash,
    npv: pvCash - pvCostAdjusted,
    npsv: pvCash + pvNonCash - pvCostAdjusted,
    bcr: pvCostAdjusted > 0 ? (pvCash + pvNonCash) / pvCostAdjusted : null,
  };
}

/** Capital and revenue by year for the financial case (the preferred option's figures). */
export function costsByYear(rows: AppraisalYearInput[], appraisalYears: number) {
  return Array.from({ length: Math.max(1, appraisalYears) }, (_, yearIndex) => {
    const row = rows.find((r) => r.yearIndex === yearIndex);
    return {
      yearIndex,
      capital: row?.capitalCost ?? 0,
      revenue: row?.revenueCost ?? 0,
    };
  });
}

// ---- Approval routes ----

export interface RouteStep {
  name: string;
  governanceRole: string;
  minValue: number | null;
}
export type ApprovalRoutes = Partial<Record<CaseStage, RouteStep[]>>;

/** Reads settings.fiveCase.approvalRoutes defensively (bad shapes are dropped). */
export function readApprovalRoutes(value: unknown): ApprovalRoutes {
  const out: ApprovalRoutes = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [stage, steps] of Object.entries(value as Record<string, unknown>)) {
    if (!isCaseStage(stage) || !Array.isArray(steps)) continue;
    out[stage] = steps.flatMap((step) => {
      if (!step || typeof step !== "object") return [];
      const s = step as Record<string, unknown>;
      const name = typeof s["name"] === "string" ? s["name"].trim() : "";
      const role = typeof s["governanceRole"] === "string" ? s["governanceRole"] : "";
      const min = s["minValue"];
      if (!name || !role) return [];
      return [
        {
          name,
          governanceRole: role,
          minValue: typeof min === "number" && Number.isFinite(min) ? min : null,
        },
      ];
    });
  }
  return out;
}

/** The steps that apply to a version of this value, as the database chooses them on submit. */
export const routeStepsFor = (routes: ApprovalRoutes, stage: CaseStage, value: number | null) =>
  (routes[stage] ?? []).filter((s) => s.minValue === null || (value ?? 0) >= s.minValue);

export async function saveApprovalRoutes(orgId: string, routes: ApprovalRoutes) {
  return unwrap(
    await supabase.rpc("set_business_case_approval_routes", {
      p_org: orgId,
      p_routes: routes as unknown as never,
    }),
    "Saving the approval routes",
  );
}

// ---- Writes ----

export async function startStage(businessCaseId: string, stage: CaseStage) {
  return unwrap(
    await supabase.rpc("start_business_case_stage", {
      p_business_case_id: businessCaseId,
      p_stage: stage,
    }),
    "Starting the stage",
  );
}

export async function setVersionStage(versionId: string, stage: CaseStage, lastSeen: string) {
  return updateRow(
    "business_case_versions",
    versionId,
    { stage },
    { context: "Changing the stage", lastSeen },
  );
}

export interface AppraisalSettingsInput {
  discountRate: number;
  appraisalYears: number;
  priceBaseYear: number | null;
}

export async function saveAppraisalSettings(
  versionId: string,
  input: AppraisalSettingsInput,
  lastSeen: string,
) {
  if (!(input.discountRate >= 0 && input.discountRate <= 20))
    throw new ServiceError("invalid", "The discount rate must be between 0% and 20%.");
  if (!(input.appraisalYears >= 1 && input.appraisalYears <= 60))
    throw new ServiceError("invalid", "The appraisal period must be 1 to 60 years.");
  return updateRow(
    "business_case_versions",
    versionId,
    {
      discount_rate: input.discountRate,
      appraisal_years: Math.floor(input.appraisalYears),
      price_base_year: input.priceBaseYear,
    },
    { context: "Saving the appraisal settings", lastSeen },
  );
}

export interface ObjectiveInput {
  kind: ObjectiveKind;
  title: string;
  description: string;
  measure: string;
}

const objectiveFields = (input: ObjectiveInput) => {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give it a title.");
  return {
    kind: input.kind,
    title: input.title.trim(),
    description: input.description.trim() || null,
    measure: input.measure.trim() || null,
  };
};

export async function addObjective(versionId: string, input: ObjectiveInput, sortOrder: number) {
  return insertRow(
    "business_case_objectives",
    { version_id: versionId, sort_order: sortOrder, ...objectiveFields(input) },
    "Adding the objective",
  );
}

export async function updateObjective(id: string, input: ObjectiveInput, lastSeen: string) {
  return updateRow("business_case_objectives", id, objectiveFields(input), {
    context: "Saving the objective",
    lastSeen,
  });
}

export async function deleteObjective(id: string) {
  await deleteRows("business_case_objectives", [id], "Removing the objective");
}

export interface OptionYearInput {
  capitalCost: number;
  revenueCost: number;
  cashBenefit: number;
  nonCashBenefit: number;
}

/** Insert the year's row, update it, or remove it when every figure is zero. */
export async function saveOptionYear(
  versionId: string,
  optionId: string,
  yearIndex: number,
  input: OptionYearInput,
  existing: OptionYear | undefined,
) {
  const fields = {
    capital_cost: input.capitalCost,
    revenue_cost: input.revenueCost,
    cash_benefit: input.cashBenefit,
    non_cash_benefit: input.nonCashBenefit,
  };
  const empty = Object.values(fields).every((v) => !v);
  if (existing) {
    if (empty) return deleteRows("business_case_option_years", [existing.id], "Clearing the year");
    return updateRow("business_case_option_years", existing.id, fields, {
      context: "Saving the year",
      lastSeen: existing.updatedAt,
    });
  }
  if (empty) return undefined;
  return insertRow(
    "business_case_option_years",
    { version_id: versionId, option_id: optionId, year_index: yearIndex, ...fields },
    "Saving the year",
  );
}
