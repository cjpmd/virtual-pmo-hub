// Portfolio overview: the summary strip and status bar figures (docs/design/portfolio-overview-spec.md).
// Pure functions over data the overview already loads, so they are unit-tested and every screen
// that shows these figures computes them the same way. Closed projects never count: the strip
// reads active projects only.

import type { ProjectSummary } from "./hierarchy";
import type { PortfolioMilestone } from "./analytics";
import type { PortfolioSnapshot, ProjectSnapshot } from "./trends";

export type MetricKey =
  | "budget"
  | "forecast"
  | "variance"
  | "spend"
  | "onTrack"
  | "milestones"
  | "gaps"
  | "delivered"
  | "redRisks"
  | "finish";

/**
 * Which way is good, per metric, defined once. Colour means good or bad, never up or down: a
 * rising forecast or overspend is bad, more projects on track is good; neutral metrics stay muted.
 */
export const METRIC_SENSE: Record<MetricKey, "up-good" | "up-bad" | "neutral"> = {
  budget: "neutral",
  forecast: "up-bad",
  variance: "up-bad",
  spend: "neutral",
  onTrack: "up-good",
  milestones: "neutral",
  gaps: "up-bad",
  delivered: "up-good",
  redRisks: "up-bad",
  finish: "up-bad",
};

export type Tone = "good" | "bad" | "neutral";

export const changeTone = (key: MetricKey, change: number | null | undefined): Tone => {
  const sense = METRIC_SENSE[key];
  if (!change || sense === "neutral") return "neutral";
  return change > 0 === (sense === "up-good") ? "good" : "bad";
};

export type MetricUnit = "money" | "percent" | "count" | "ratio" | "date";

export interface SummaryMetric {
  key: MetricKey;
  label: string;
  unit: MetricUnit;
  value: number;
  /** For ratios: the denominator ("16 / 27"). */
  of?: number | undefined;
  /** Change since the end of last month, in the metric's unit; null when there is no history. */
  change: number | null;
  /** Unit of the change when it differs from the value's (variance is a % shown with a £ change). */
  changeUnit?: MetricUnit | undefined;
  /** The money behind a percentage (variance), for the "£58k over" line. */
  money?: number | undefined;
  detail?: { text: string; tone: Tone } | undefined;
  /** For dates: the ISO date shown as the value. */
  date?: string | null | undefined;
}

export interface SummaryInput {
  projects: ProjectSummary[];
  milestones: PortfolioMilestone[];
  /** Portfolio month-end snapshots; ignored when a programme is selected (they are portfolio-wide). */
  history: PortfolioSnapshot[];
  projectHistory: ProjectSnapshot[];
  gaps: { current: number; previous: number | null };
  programmeId?: string | null | undefined;
  today: string;
}

const DAY = 86_400_000;
const dayOf = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** The live counterpart of the snapshot's active-project, unsigned, inclusive 30-day rule. */
export function isMilestoneDueWithin30(
  milestone: Pick<PortfolioMilestone, "actualDate" | "forecastDate">,
  today: string,
) {
  if (milestone.actualDate) return false;
  const days = (dayOf(milestone.forecastDate) - dayOf(today)) / DAY;
  return days >= 0 && days <= 30;
}

/** The last month-end snapshot before the current month. */
export function previousSnapshot<T extends { date: string }>(rows: T[], today: string) {
  const month = today.slice(0, 7);
  return rows
    .filter((row) => row.date.slice(0, 7) < month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
}

export function getSummaryMetrics(input: SummaryInput): SummaryMetric[] {
  const { programmeId, today } = input;
  const active = input.projects.filter(
    (project) =>
      project.state === "Active" && (!programmeId || project.programmeId === programmeId),
  );
  const ids = new Set(active.map((project) => project.id));
  const sum = (read: (project: ProjectSummary) => number) =>
    active.reduce((total, project) => total + read(project), 0);
  const budget = sum((p) => p.budget),
    forecast = sum((p) => p.forecast),
    spend = sum((p) => p.actual);
  const variance = forecast - budget;

  // Month-on-month money changes come from the portfolio snapshots, so only for the whole portfolio.
  const snapshot = programmeId ? undefined : previousSnapshot(input.history, today);
  const moneyChange = (current: number, previous: number | undefined) =>
    previous === undefined ? null : current - previous;

  // On track: active projects green now, against the same projects' month-end health last month.
  const green = active.filter((p) => p.health.overall === "On Track").length;
  const lastMonth = new Map<string, ProjectSnapshot>();
  const month = today.slice(0, 7);
  for (const row of [...input.projectHistory].sort((a, b) => a.date.localeCompare(b.date)))
    if (ids.has(row.projectId) && row.date.slice(0, 7) < month) lastMonth.set(row.projectId, row);
  const greenBefore = [...lastMonth.values()].filter((row) => row.overall === "On Track").length;

  const activeMilestones = input.milestones.filter((milestone) => ids.has(milestone.projectId));
  const due30 = activeMilestones.filter((milestone) => isMilestoneDueWithin30(milestone, today)).length;
  const overdue = activeMilestones.filter(
    (milestone) => !milestone.actualDate && dayOf(milestone.forecastDate) < dayOf(today),
  ).length;

  return [
    {
      key: "budget",
      label: "Approved budget",
      unit: "money",
      value: budget,
      change: moneyChange(budget, snapshot?.budget),
    },
    {
      key: "forecast",
      label: "Forecast",
      unit: "money",
      value: forecast,
      change: moneyChange(forecast, snapshot?.forecast),
    },
    {
      key: "variance",
      label: "Variance",
      unit: "percent",
      value: budget ? (variance / budget) * 100 : 0,
      change: moneyChange(variance, snapshot?.variance),
      changeUnit: "money",
      money: variance,
      detail: {
        text: variance === 0 ? "on budget" : variance > 0 ? "over" : "under",
        tone: variance > 0 ? "bad" : variance < 0 ? "good" : "neutral",
      },
    },
    {
      key: "spend",
      label: "Spent to date",
      unit: "money",
      value: spend,
      change: moneyChange(spend, snapshot?.spend),
      detail: {
        text: budget ? `${Math.round((spend / budget) * 100)}% of budget` : "no budget",
        tone: "neutral",
      },
    },
    {
      key: "onTrack",
      label: "On track",
      unit: "ratio",
      value: green,
      of: active.length,
      change: lastMonth.size ? green - greenBefore : null,
    },
    {
      key: "milestones",
      label: "Milestones 30d",
      unit: "count",
      value: due30,
      change:
        snapshot?.milestonesDue30 === undefined ? null : due30 - snapshot.milestonesDue30,
      detail:
        snapshot?.milestonesDue30 === undefined
          ? { text: `${overdue} overdue`, tone: overdue ? "bad" : "neutral" }
          : undefined,
    },
    {
      key: "gaps",
      label: "Report vs data gaps",
      unit: "count",
      value: input.gaps.current,
      change: input.gaps.previous === null ? null : input.gaps.current - input.gaps.previous,
    },
  ];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Month labels for the status bar: the latest closed financial month and the open one after it. */
export function periodStatus(closedMonths: string[], today: string) {
  const latest = [...closedMonths].sort().at(-1);
  const label = (iso: string) => MONTHS[+iso.slice(5, 7) - 1] ?? "";
  if (!latest) return { closed: null, open: label(today) };
  const [y, m] = [+latest.slice(0, 4), +latest.slice(5, 7)];
  const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  return { closed: label(latest), open: label(next) };
}

/**
 * The status bar's "data as of": the latest moment any of the overview's data changed (record
 * updates, status reports), not the page load time.
 */
export function dataAsOf(stamps: Array<string | null | undefined>) {
  return (stamps.filter(Boolean) as string[]).sort().at(-1) ?? null;
}

// ---- Project scope (project overview, Stage 3) ------------------------------------------

export interface ProjectSummaryInput {
  financials: { budget: number; eac: number; actualToDate: number } | null;
  /** Month-end figures from financial_forecast_history; empty until the first close. */
  forecastHistory: Array<{ month: string; budget: number; eac: number; actualToDate: number }>;
  milestones: Array<
    Pick<PortfolioMilestone, "actualDate" | "forecastDate"> & {
      baselineDate: string;
      /** v_milestones.slip_band: on_time | minor (≤14) | material (15–30) | severe (>30). */
      slipBand: string | null;
    }
  >;
  risks: Array<{ score: number; createdAt: string; closedAt: string | null; status: string }>;
  redRiskMinScore: number;
  forecastFinish: string | null;
  /** v_project_divergence.finish_vs_baseline_days: forecast finish minus baseline finish. */
  finishVsBaselineDays: number | null;
  today: string;
}

/** Open at the given exclusive bound: the same rule the progress chart's red-risk line uses. */
const openAt = (risk: ProjectSummaryInput["risks"][number], bound: string) =>
  risk.createdAt < bound &&
  (risk.closedAt === null ? risk.status === "open" : risk.closedAt >= bound);

/**
 * The project overview's eight cells. Month-on-month changes come from the previous month-end
 * (forecast history, milestone actual dates, risk open/close dates); null when there is none.
 */
export function getProjectSummaryMetrics(input: ProjectSummaryInput): SummaryMetric[] {
  const { today } = input;
  const monthStart = `${today.slice(0, 7)}-01`;
  const budget = input.financials?.budget ?? 0,
    forecast = input.financials?.eac ?? 0,
    spend = input.financials?.actualToDate ?? 0;
  const variance = forecast - budget;
  const before = input.forecastHistory
    .filter((row) => row.month < today.slice(0, 7))
    .sort((a, b) => a.month.localeCompare(b.month))
    .at(-1);
  const change = (current: number, previous: number | undefined) =>
    previous === undefined ? null : current - previous;

  const delivered = input.milestones.filter((m) => m.actualDate);
  const onTime = delivered.filter((m) => (m.actualDate as string) <= m.baselineDate).length;
  const deliveredBefore = delivered.filter((m) => (m.actualDate as string) < monthStart).length;
  const next30 = input.milestones.filter((m) => isMilestoneDueWithin30(m, today));
  // At risk: due in the next 30 days with a slip of 15+ days (material or severe band), plus
  // anything overdue (not delivered, forecast date passed).
  const atRisk =
    next30.filter((m) => m.slipBand === "material" || m.slipBand === "severe").length +
    input.milestones.filter((m) => !m.actualDate && dayOf(m.forecastDate) < dayOf(today)).length;

  const red = input.risks.filter((r) => r.score >= input.redRiskMinScore);
  const redNow = red.filter((r) => r.status === "open").length;
  const redBefore = red.filter((r) => openAt(r, monthStart)).length;

  const slip = input.finishVsBaselineDays;
  return [
    {
      key: "budget",
      label: "Budget",
      unit: "money",
      value: budget,
      change: change(budget, before?.budget),
    },
    {
      key: "forecast",
      label: "Forecast",
      unit: "money",
      value: forecast,
      change: change(forecast, before?.eac),
    },
    {
      key: "variance",
      label: "Variance",
      unit: "percent",
      value: budget ? (variance / budget) * 100 : 0,
      change: change(variance, before ? before.eac - before.budget : undefined),
      changeUnit: "money",
      money: variance,
      detail: {
        text: variance === 0 ? "on budget" : variance > 0 ? "over" : "under",
        tone: variance > 0 ? "bad" : variance < 0 ? "good" : "neutral",
      },
    },
    {
      key: "spend",
      label: "Spent to date",
      unit: "money",
      value: spend,
      change: change(spend, before?.actualToDate),
      detail: {
        text: budget ? `${Math.round((spend / budget) * 100)}% of budget` : "no budget",
        tone: "neutral",
      },
    },
    {
      key: "delivered",
      label: "Milestones delivered",
      unit: "ratio",
      value: delivered.length,
      of: input.milestones.length,
      change: delivered.length - deliveredBefore,
      detail: {
        text: delivered.length
          ? `${Math.round((100 * onTime) / delivered.length)}% on time`
          : "none delivered yet",
        tone: "neutral",
      },
    },
    {
      key: "milestones",
      label: "Milestones, next 30 days",
      unit: "count",
      value: next30.length,
      change: null,
      detail: { text: `${atRisk} at risk`, tone: atRisk ? "bad" : "neutral" },
    },
    {
      key: "redRisks",
      label: "Red risks",
      unit: "count",
      value: redNow,
      change: redNow - redBefore,
    },
    {
      key: "finish",
      label: "Forecast finish",
      unit: "date",
      value: slip ?? 0,
      date: input.forecastFinish,
      change: null,
      detail:
        slip === null
          ? undefined
          : {
              text:
                slip === 0
                  ? "on baseline"
                  : `${Math.abs(slip)} ${Math.abs(slip) === 1 ? "day" : "days"} ${slip > 0 ? "after" : "before"} baseline`,
              tone: slip > 0 ? "bad" : slip < 0 ? "good" : "neutral",
            },
    },
  ];
}
