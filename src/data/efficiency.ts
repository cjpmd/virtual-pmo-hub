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

// ---------------------------------------------------------------------------------------------
// NHS-4 part 2: phasing grid, forecast outturn, carry-forward and the year summary
// (public.efficiency_summary in migration 20261123200000_nhs_4b_efficiency_summary mirrors these;
// change both together).
// ---------------------------------------------------------------------------------------------

export const VALUE_KINDS: ValueKind[] = ["plan", "forecast", "actual"];
export const VALUE_KIND_LABELS: Record<ValueKind, string> = {
  plan: "Plan",
  forecast: "Forecast",
  actual: "Actual",
};

/** One cell pair of the phasing grid (a month and kind), with the stored row when there is one. */
export interface GridCell {
  recurrent: number;
  nonRecurrent: number;
  id?: string;
  updatedAt?: string;
  validated?: boolean;
}

export type PhasingGrid = Record<string, GridCell>;

export const gridKey = (kind: ValueKind, month: string) => `${kind}:${month.slice(0, 7)}`;

/** The stored values of one financial year (its months) as a grid; missing cells are zero. */
export function buildGrid(
  values: (MonthValue & { id?: string; updatedAt?: string; validatedAt?: string | null })[],
  months: string[],
): PhasingGrid {
  const grid: PhasingGrid = {};
  for (const kind of VALUE_KINDS)
    for (const month of months) grid[gridKey(kind, month)] = { recurrent: 0, nonRecurrent: 0 };
  for (const v of values) {
    const key = gridKey(v.kind, v.month);
    if (!(key in grid)) continue;
    grid[key] = {
      recurrent: v.recurrent,
      nonRecurrent: v.nonRecurrent,
      ...(v.id ? { id: v.id } : {}),
      ...(v.updatedAt ? { updatedAt: v.updatedAt } : {}),
      validated: Boolean(v.validatedAt),
    };
  }
  return grid;
}

export interface GridChange {
  kind: ValueKind;
  month: string;
  recurrent: number;
  nonRecurrent: number;
  existing?: { id: string; updatedAt: string };
}

/** The cells whose amounts differ from the stored grid, in month then kind order. New cells that
 *  are still zero are left out (nothing to store). */
export function gridChanges(stored: PhasingGrid, edited: PhasingGrid): GridChange[] {
  const changes: GridChange[] = [];
  for (const key of Object.keys(edited).sort((a, b) => {
    const [ka, ma] = a.split(":");
    const [kb, mb] = b.split(":");
    return (
      (ma ?? "").localeCompare(mb ?? "") ||
      VALUE_KINDS.indexOf(ka as ValueKind) - VALUE_KINDS.indexOf(kb as ValueKind)
    );
  })) {
    const before = stored[key];
    const after = edited[key];
    if (!after) continue;
    if (
      before &&
      before.recurrent === after.recurrent &&
      before.nonRecurrent === after.nonRecurrent
    )
      continue;
    if (!before?.id && after.recurrent === 0 && after.nonRecurrent === 0) continue;
    const [kind, month] = key.split(":") as [ValueKind, string];
    changes.push({
      kind,
      month: `${month}-01`,
      recurrent: after.recurrent,
      nonRecurrent: after.nonRecurrent,
      ...(before?.id && before.updatedAt
        ? { existing: { id: before.id, updatedAt: before.updatedAt } }
        : {}),
    });
  }
  return changes;
}

/** Copies one kind's row onto another for the given months (e.g. plan → forecast). Pure. */
export function copyKind(
  grid: PhasingGrid,
  from: ValueKind,
  to: ValueKind,
  months: string[],
): PhasingGrid {
  const next = { ...grid };
  for (const month of months) {
    const source = grid[gridKey(from, month)];
    const target = grid[gridKey(to, month)];
    if (!source) continue;
    next[gridKey(to, month)] = {
      ...(target ?? {}),
      recurrent: source.recurrent,
      nonRecurrent: source.nonRecurrent,
    };
  }
  return next;
}

/** An amount typed into the grid: "£1,250.50", "1250", "" (zero). Null when it isn't a number or
 *  has more than two decimals, or is beyond the column's range. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[£€$,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Math.abs(value) < 1e12 ? value : null;
}

export interface YearTotals {
  plan: number;
  planRecurrent: number;
  planNonRecurrent: number;
  forecast: number;
  forecastOutturn: number;
  actual: number;
  /** Planned recurrent value of the year's last month × 12. */
  carryForward: number;
}

/** One scheme's totals for a year's months from its grid: the in-year effect of each kind, the
 *  forecast outturn (actual where recorded, else forecast, else plan, month by month) and the
 *  recurrent carry-forward. "Recorded" means a stored row, so an actual of zero counts. */
export function yearTotals(grid: PhasingGrid, months: string[]): YearTotals {
  const sum = (c: GridCell | undefined) => (c ? c.recurrent + c.nonRecurrent : 0);
  const recorded = (c: GridCell | undefined) =>
    Boolean(c && (c.id || c.recurrent !== 0 || c.nonRecurrent !== 0));
  const totals: YearTotals = {
    plan: 0,
    planRecurrent: 0,
    planNonRecurrent: 0,
    forecast: 0,
    forecastOutturn: 0,
    actual: 0,
    carryForward: 0,
  };
  for (const month of months) {
    const plan = grid[gridKey("plan", month)];
    const forecast = grid[gridKey("forecast", month)];
    const actual = grid[gridKey("actual", month)];
    totals.plan += sum(plan);
    totals.planRecurrent += plan?.recurrent ?? 0;
    totals.planNonRecurrent += plan?.nonRecurrent ?? 0;
    totals.forecast += sum(forecast);
    totals.actual += sum(actual);
    totals.forecastOutturn += recorded(actual)
      ? sum(actual)
      : recorded(forecast)
        ? sum(forecast)
        : sum(plan);
  }
  const last = months[months.length - 1];
  totals.carryForward = last ? (grid[gridKey("plan", last)]?.recurrent ?? 0) * 12 : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return Object.fromEntries(
    Object.entries(totals).map(([k, v]) => [k, round(v)]),
  ) as unknown as YearTotals;
}

/** Target − value: positive means short of target; null without a target. */
export const gapToTarget = (target: number | null, value: number): number | null =>
  target == null ? null : Math.round((target - value) * 100) / 100;

/** A workspace's target for a year: its whole-workspace target, else the sum of its unit targets. */
export function workspaceTarget(
  targets: {
    workspaceId: string;
    financialYear: number;
    businessUnit: string | null;
    amount: number;
  }[],
  workspaceId: string,
  year: number,
): number | null {
  const rows = targets.filter((t) => t.workspaceId === workspaceId && t.financialYear === year);
  const whole = rows.find((t) => !t.businessUnit);
  if (whole) return whole.amount;
  return rows.length ? rows.reduce((s, t) => s + t.amount, 0) : null;
}

// The year summary returned by public.efficiency_summary.
export interface SummaryMeasures {
  schemes: number;
  plan: number;
  riskAdjusted: number;
  forecastOutturn: number;
  actual: number;
}
export interface EfficiencySummary {
  year: number;
  startMonth: number;
  totals: SummaryMeasures & {
    target: number | null;
    planRecurrent: number;
    fullYearEffect: number;
    carryForward: number;
  };
  months: {
    month: string;
    plan: number;
    riskAdjusted: number;
    forecastOutturn: number;
    actual: number;
    hasActual: boolean;
    cumPlan: number;
    cumRiskAdjusted: number;
    cumForecastOutturn: number;
    cumActual: number;
  }[];
  byUnit: (SummaryMeasures & { key: string | null; target: number | null })[];
  byCategory: (SummaryMeasures & { key: string | null; planRecurrent: number })[];
  byStage: { stage: EfficiencyStage; schemes: number; plan: number; riskAdjusted: number }[];
}

const asObj = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asNum = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const asNumOrNull = (v: unknown): number | null => (v == null ? null : asNum(v));
const asKey = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asArr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(asObj) : []);

/** The RPC's JSON as typed values (missing fields read as zero). Null when there is no summary. */
export function toSummary(value: unknown): EfficiencySummary | null {
  if (value == null || typeof value !== "object") return null;
  const raw = asObj(value);
  const t = asObj(raw["totals"]);
  const measures = (r: Record<string, unknown>): SummaryMeasures => ({
    schemes: asNum(r["schemes"]),
    plan: asNum(r["plan"]),
    riskAdjusted: asNum(r["riskAdjusted"]),
    forecastOutturn: asNum(r["forecastOutturn"]),
    actual: asNum(r["actual"]),
  });
  return {
    year: asNum(raw["year"]),
    startMonth: asNum(raw["startMonth"]) || 4,
    totals: {
      ...measures(t),
      target: asNumOrNull(t["target"]),
      planRecurrent: asNum(t["planRecurrent"]),
      fullYearEffect: asNum(t["fullYearEffect"]),
      carryForward: asNum(t["carryForward"]),
    },
    months: asArr(raw["months"]).map((m) => ({
      month: String(m["month"] ?? ""),
      plan: asNum(m["plan"]),
      riskAdjusted: asNum(m["riskAdjusted"]),
      forecastOutturn: asNum(m["forecastOutturn"]),
      actual: asNum(m["actual"]),
      hasActual: m["hasActual"] === true,
      cumPlan: asNum(m["cumPlan"]),
      cumRiskAdjusted: asNum(m["cumRiskAdjusted"]),
      cumForecastOutturn: asNum(m["cumForecastOutturn"]),
      cumActual: asNum(m["cumActual"]),
    })),
    byUnit: asArr(raw["byUnit"]).map((u) => ({
      ...measures(u),
      key: asKey(u["key"]),
      target: asNumOrNull(u["target"]),
    })),
    byCategory: asArr(raw["byCategory"]).map((c) => ({
      ...measures(c),
      key: asKey(c["key"]),
      planRecurrent: asNum(c["planRecurrent"]),
    })),
    byStage: asArr(raw["byStage"])
      .filter((s) => isStage(s["stage"]))
      .map((s) => ({
        stage: s["stage"] as EfficiencyStage,
        schemes: asNum(s["schemes"]),
        plan: asNum(s["plan"]),
        riskAdjusted: asNum(s["riskAdjusted"]),
      })),
  };
}

// ---------------------------------------------------------------------------------------------
// NHS-4 part 4: the dashboard.
// ---------------------------------------------------------------------------------------------

/** One month of the cumulative chart (the shape of charts/plots CurvePoint). */
export interface CumulativePoint {
  period: string;
  planned: number;
  actual?: number | undefined;
  band?: [number, number] | undefined;
}

/**
 * The dashboard's cumulative chart: planned, actual up to the last month with an actual recorded
 * (no line after it), and a band from the risk-adjusted to the forecast outturn position.
 * `label` names each month (e.g. "Apr 26").
 */
export function cumulativePoints(
  summary: EfficiencySummary,
  label: (month: string) => string,
): CumulativePoint[] {
  const lastActual = summary.months.reduce((last, m, i) => (m.hasActual ? i : last), -1);
  return summary.months.map((m, i) => ({
    period: label(m.month),
    planned: m.cumPlan,
    actual: i <= lastActual ? m.cumActual : undefined,
    band: [
      Math.min(m.cumRiskAdjusted, m.cumForecastOutturn),
      Math.max(m.cumRiskAdjusted, m.cumForecastOutturn),
    ],
  }));
}

/** Recurrent share of the year's plan, as a percentage (null without a plan). */
export const recurrentShare = (totals: EfficiencySummary["totals"]): number | null =>
  totals.plan > 0 ? Math.round((totals.planRecurrent / totals.plan) * 1000) / 10 : null;

// ---------------------------------------------------------------------------------------------
// NHS-4 part 3: the pipeline board and the scheme list.
// ---------------------------------------------------------------------------------------------

/** What the board needs of a scheme. */
export interface PipelineScheme {
  stage: EfficiencyStage;
  planInYear: number;
  riskAdjustedInYear: number;
}

export interface PipelineColumn<T extends PipelineScheme> {
  stage: EfficiencyStage;
  schemes: T[];
  plan: number;
  riskAdjusted: number;
  /** Rejected schemes never count towards the programme's totals. */
  counted: boolean;
}

/** One column per stage (pipeline order, then on hold and rejected), with this year's planned and
 *  risk-adjusted totals. Empty columns are kept so the board's shape never changes. Pure. */
export function pipelineColumns<T extends PipelineScheme>(schemes: T[]): PipelineColumn<T>[] {
  const round = (n: number) => Math.round(n * 100) / 100;
  return STAGES.map((stage) => {
    const inStage = schemes.filter((s) => s.stage === stage);
    return {
      stage,
      schemes: inStage,
      plan: round(inStage.reduce((sum, s) => sum + s.planInYear, 0)),
      riskAdjusted: round(inStage.reduce((sum, s) => sum + s.riskAdjustedInYear, 0)),
      counted: stage !== "rejected",
    };
  });
}

/** The pipeline stage before and after a scheme's (null at the ends). On hold and rejected sit
 *  outside the pipeline, so they have neither; they move with the stage menu. */
export function adjacentStages(stage: EfficiencyStage): {
  back: EfficiencyStage | null;
  forward: EfficiencyStage | null;
} {
  const i = PIPELINE_STAGES.indexOf(stage);
  if (i < 0) return { back: null, forward: null };
  return { back: PIPELINE_STAGES[i - 1] ?? null, forward: PIPELINE_STAGES[i + 1] ?? null };
}

export interface SchemeFilter {
  workspaceId?: string | undefined;
  businessUnit?: string | undefined;
  category?: string | undefined;
  search?: string | undefined;
  /** Show rejected and delivered / closed schemes (hidden by default on the list). */
  showClosed?: boolean;
}

/** Schemes matching a filter. Search matches the reference and title, ignoring case. Pure. */
export function filterSchemes<
  T extends {
    workspaceId: string;
    businessUnit: string | null;
    category: string | null;
    ref: string;
    title: string;
    stage: EfficiencyStage;
  },
>(schemes: T[], filter: SchemeFilter): T[] {
  const q = filter.search?.trim().toLowerCase() ?? "";
  return schemes.filter(
    (s) =>
      (!filter.workspaceId || s.workspaceId === filter.workspaceId) &&
      (!filter.businessUnit || s.businessUnit === filter.businessUnit) &&
      (!filter.category || s.category === filter.category) &&
      (filter.showClosed || (s.stage !== "rejected" && s.stage !== "delivered")) &&
      (!q || s.ref.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)),
  );
}

/** Who may do what on one scheme, mirroring the RLS policies and validate RPCs (the database
 *  still decides). Workspace managers edit the scheme; its lead and finance lead (as workspace
 *  contributors) edit its values; the finance lead or workspace PMO / admin validate. */
export function schemePermissions(input: {
  role: "viewer" | "contributor" | "manager" | "pmo" | "admin" | null;
  myResourceId: string | null;
  schemeLeadId: string | null;
  financeLeadId: string | null;
  moduleOn: boolean;
  writable: boolean;
}): { canEdit: boolean; canEditValues: boolean; canValidate: boolean } {
  const rank = { viewer: 1, contributor: 2, manager: 3, pmo: 4, admin: 5 } as const;
  const r = input.role ? rank[input.role] : 0;
  const open = input.moduleOn && input.writable;
  const me = input.myResourceId;
  const isLead = Boolean(me) && r >= 2 && (me === input.schemeLeadId || me === input.financeLeadId);
  const isFinance = Boolean(me) && r >= 2 && me === input.financeLeadId;
  return {
    canEdit: open && r >= 3,
    canEditValues: open && (r >= 3 || isLead),
    canValidate: open && (r >= 4 || isFinance),
  };
}
