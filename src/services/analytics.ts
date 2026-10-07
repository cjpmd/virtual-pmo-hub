// Portfolio overview: one loader that reads the views and snapshot history, plus pure
// helpers that shape them for charts. Health is never computed here. Every RAG value comes
// from v_project_health / v_programme_health / v_portfolio_health, and history comes from
// health_snapshots. The helpers only count, sum and sort what the database returned.
import type { Health } from "@/data/types";
import { parseDate } from "@/lib/format";
import { today, todayIso } from "@/lib/today";
import {
  listPeople,
  listProgrammes,
  listProjects,
  listPortfolios,
  type PortfolioSummary,
  type ProgrammeSummary,
  type ProjectSummary,
} from "./hierarchy";
import { listMilestones, type MilestoneItem } from "./project-records";
import { ServiceError } from "./service-error";
import {
  listPortfolioSnapshots,
  listProjectSnapshots,
  toSeries,
  trendPeriods,
  TREND_PERIODS,
  type PortfolioSnapshot,
  type ProjectSnapshot,
  type TrendSeries,
} from "./trends";

const DAY = 86_400_000;
/** Whole days since the epoch for a calendar date (ISO or DD/MM/YYYY). */
export const dayNumber = (value: string) => Math.round((parseDate(value)?.getTime() ?? 0) / DAY);

export interface PortfolioMilestone extends MilestoneItem {
  projectName: string;
  projectCode: string;
  programmeId: string | null;
  ownerName: string;
}

export interface PortfolioOverview {
  portfolio: PortfolioSummary;
  programmes: ProgrammeSummary[];
  /** Every non-archived project in the portfolio. */
  projects: ProjectSummary[];
  milestones: PortfolioMilestone[];
  history: PortfolioSnapshot[];
  projectHistory: ProjectSnapshot[];
}

export async function loadPortfolioOverview(
  orgId: string,
  portfolioId: string,
): Promise<PortfolioOverview> {
  const [portfolios, programmes, projects, history, people] = await Promise.all([
    listPortfolios(orgId),
    listProgrammes(orgId),
    listProjects(orgId),
    listPortfolioSnapshots(orgId, portfolioId),
    listPeople(orgId),
  ]);
  const portfolio = portfolios.find((item) => item.id === portfolioId);
  if (!portfolio)
    throw new ServiceError(
      "not_found",
      "We couldn't find that portfolio. It may have been archived, or you may not have access.",
    );
  const inPortfolio = projects.filter((project) => project.portfolioId === portfolioId);
  const ids = inPortfolio.map((project) => project.id);
  const since = history[0]?.date ?? todayIso();
  const [milestones, projectHistory] = await Promise.all([
    listMilestones(ids),
    listProjectSnapshots(orgId, ids, since),
  ]);
  const byId = new Map(inPortfolio.map((project) => [project.id, project]));
  const names = new Map(people.map((person) => [person.id, person.name]));
  return {
    portfolio,
    programmes: programmes.filter((programme) => programme.portfolioId === portfolioId),
    projects: inPortfolio,
    milestones: milestones.map((milestone) => {
      const project = byId.get(milestone.projectId);
      return {
        ...milestone,
        projectName: project?.name ?? "",
        projectCode: project?.code ?? "",
        programmeId: project?.programmeId ?? null,
        ownerName: (milestone.ownerId && names.get(milestone.ownerId)) || "Unassigned",
      };
    }),
    history,
    projectHistory,
  };
}

// ---- RAG counts -----------------------------------------------------------------------

export interface RagCounts {
  green: number;
  amber: number;
  red: number;
  unset: number;
  total: number;
  percentOnTrack: number;
}

/** RAG mix over a set of projects, from each project's view-computed overall health. */
export function getRag(items: Array<{ health: { overall: Health } }>): RagCounts {
  const of = (health: Health) => items.filter((item) => item.health.overall === health).length;
  const green = of("On Track"),
    amber = of("At Risk"),
    red = of("Off Track"),
    unset = of("Not Set");
  const total = items.length;
  return {
    green,
    amber,
    red,
    unset,
    total,
    percentOnTrack: total ? Math.round((green / total) * 100) : 0,
  };
}

export const activeOnly = (items: ProjectSummary[]) =>
  items.filter((project) => project.state === "Active");

/** Projects that still count in roll-ups: everything except closed projects. */
export const openOnly = <T extends { state: string }>(items: T[]) =>
  items.filter((project) => project.state !== "Closed");

export const ragSegments = (rag: RagCounts) => [
  { key: "green", label: "On track", value: rag.green, colour: "var(--viz-good)" },
  { key: "amber", label: "At risk", value: rag.amber, colour: "var(--viz-warning)" },
  { key: "red", label: "Off track", value: rag.red, colour: "var(--viz-critical)" },
  { key: "unset", label: "Not set", value: rag.unset, colour: "var(--viz-ink-muted)" },
];

// ---- Headline figures -----------------------------------------------------------------

export function getPortfolioHeadlines(active: ProjectSummary[], history: PortfolioSnapshot[]) {
  const rag = getRag(active);
  const budget = active.reduce((sum, project) => sum + project.budget, 0);
  const forecast = active.reduce((sum, project) => sum + project.forecast, 0);
  const spend = active.reduce((sum, project) => sum + project.actual, 0);
  const month = todayIso().slice(0, 7);
  const series = (read: (row: PortfolioSnapshot) => number | undefined, current: number) =>
    toSeries(
      history.map((row) => ({ date: row.date, value: read(row) })),
      current,
      month,
    );
  return {
    rag,
    budget,
    forecast,
    spend,
    periods: trendPeriods(history, todayIso()),
    activeProjects: {
      value: active.length,
      trend: series((row) => row.activeProjects, active.length),
    },
    budgetSeries: { value: budget, trend: series((row) => row.budget, budget) },
    varianceSeries: {
      value: forecast - budget,
      trend: series((row) => row.variance, forecast - budget),
    },
    onTrackSeries: {
      value: rag.percentOnTrack,
      trend: series((row) => row.percentOnTrack, rag.percentOnTrack),
    },
  };
}

// ---- Financials -----------------------------------------------------------------------

export interface FinancialRow {
  key: string;
  label: string;
  actual: number;
  forecast: number;
  target: number;
  note?: string;
}

export function getProgrammeFinancials(
  programmes: ProgrammeSummary[],
  active: ProjectSummary[],
): FinancialRow[] {
  return programmes
    .map((programme) => {
      const items = active.filter((project) => project.programmeId === programme.id);
      return {
        key: programme.id,
        label: programme.name,
        actual: items.reduce((sum, project) => sum + project.actual, 0),
        forecast: items.reduce((sum, project) => sum + project.forecast, 0),
        target: items.reduce((sum, project) => sum + project.budget, 0),
        note: `${items.length} active ${items.length === 1 ? "project" : "projects"}`,
      };
    })
    .sort((a, b) => b.forecast - b.target - (a.forecast - a.target));
}

export function getProjectFinancials(items: ProjectSummary[]): FinancialRow[] {
  return items
    .map((project) => ({
      key: project.id,
      label: project.name,
      actual: project.actual,
      forecast: project.forecast,
      target: project.budget,
      note: `${project.phaseName} · ${project.managerName}`,
    }))
    .sort((a, b) => b.forecast - b.target - (a.forecast - a.target));
}

// ---- Milestones -----------------------------------------------------------------------

export type SlipSeverity = "Ahead" | "On plan" | "Minor" | "Material" | "Severe";
export const slipSeverity = (days: number): SlipSeverity =>
  days < 0
    ? "Ahead"
    : days === 0
      ? "On plan"
      : days <= 14
        ? "Minor"
        : days <= 30
          ? "Material"
          : "Severe";
export const slipColour: Record<SlipSeverity, string> = {
  Ahead: "var(--viz-good)",
  "On plan": "var(--viz-good)",
  Minor: "var(--viz-warning)",
  Material: "var(--viz-serious)",
  Severe: "var(--viz-critical)",
};

export function getSlippedMilestones<T extends MilestoneItem>(items: T[], limit = 8): T[] {
  return items
    .filter((item) => item.status !== "Completed" && item.slipDays > 0)
    .sort((a, b) => b.slipDays - a.slipDays)
    .slice(0, limit);
}

/** Counts behind the milestone footer. Status and slip come from v_milestones. */
export function getMilestoneMetrics(items: MilestoneItem[]) {
  const now = today().getTime();
  const days = (value: string) => Math.round(((parseDate(value)?.getTime() ?? now) - now) / DAY);
  const completed = items.filter(
    (item) => item.actualDate && days(item.actualDate) >= -30 && days(item.actualDate) <= 0,
  ).length;
  const upcoming = items.filter(
    (item) =>
      item.status !== "Completed" && days(item.forecastDate) >= 0 && days(item.forecastDate) <= 30,
  ).length;
  const overdue = items.filter((item) => item.status === "Overdue").length;
  const slipped = items.filter((item) => item.slipDays > 0 && item.status !== "Completed").length;
  const recent = items.filter(
    (item) => item.actualDate && days(item.actualDate) >= -90 && days(item.actualDate) <= 0,
  );
  const hit = recent.filter(
    (item) => (item.actualDate ?? item.forecastDate) <= item.baselineDate,
  ).length;
  return {
    completed,
    upcoming,
    overdue,
    slipped,
    percentOnTime: recent.length ? Math.round((hit / recent.length) * 100) : 0,
  };
}

// ---- Health dimensions ----------------------------------------------------------------

type DimensionKey = "schedule" | "financial" | "effort" | "issue" | "benefit";
export interface DimensionScore {
  key: DimensionKey;
  label: string;
  percent: number;
  scored: number;
  total: number;
  trend: TrendSeries;
  info: string;
}
const dimensions: Array<{ key: DimensionKey; label: string; info: string }> = [
  {
    key: "schedule",
    label: "Schedule",
    info: "Projects with no overdue milestone and slip inside the tolerance.",
  },
  {
    key: "financial",
    label: "Financial",
    info: "Projects forecasting inside the approved budget tolerance.",
  },
  { key: "effort", label: "Effort", info: "Projects with overdue tasks below the tolerance." },
  {
    key: "issue",
    label: "Issues and risks",
    info: "Projects with no open high-severity issue and no risk above the escalation score.",
  },
  {
    key: "benefit",
    label: "Benefits",
    info: "Projects whose benefits are owned, baselined and tracking to profile for their stage.",
  },
];

const percentGreen = (values: Health[]) => {
  const scored = values.filter((health) => health !== "Not Set");
  return {
    scored: scored.length,
    percent: scored.length
      ? Math.round((scored.filter((health) => health === "On Track").length / scored.length) * 100)
      : 0,
  };
};

/**
 * Share of active projects reporting green in each dimension, with its history.
 * Projects where a dimension does not apply yet (no benefits mapped, say) are left out of
 * the denominator rather than counted as a failure. History covers today's active projects,
 * using the latest snapshot each month.
 */
export function getDimensionScores(
  active: ProjectSummary[],
  history: ProjectSnapshot[],
): { periods: string[]; scores: DimensionScore[]; overall: TrendSeries } {
  const ids = new Set(active.map((project) => project.id));
  const latest = new Map<string, ProjectSnapshot>();
  for (const row of history)
    if (ids.has(row.projectId)) latest.set(`${row.date.slice(0, 7)}|${row.projectId}`, row);
  const months = new Map<string, ProjectSnapshot[]>();
  for (const [key, row] of latest) {
    const month = key.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), row]);
  }
  const ordered = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-TREND_PERIODS)
    .map(([month, rows]) => ({ date: `${month}-01`, rows }));
  const month = todayIso().slice(0, 7);
  const series = (read: (rows: ProjectSnapshot[]) => number, current: number) =>
    toSeries(
      ordered.map((point) => ({ date: point.date, value: read(point.rows) })),
      current,
      month,
    );
  const scores = dimensions.map((dimension) => {
    const { scored, percent } = percentGreen(
      active.map((project) => project.health[dimension.key]),
    );
    return {
      ...dimension,
      percent,
      scored,
      total: active.length,
      trend: series((rows) => percentGreen(rows.map((row) => row[dimension.key])).percent, percent),
    };
  });
  const rag = getRag(active);
  const overall = series(
    (rows) =>
      rows.length
        ? Math.round((rows.filter((row) => row.overall === "On Track").length / rows.length) * 100)
        : 0,
    rag.percentOnTrack,
  );
  return { periods: trendPeriods(ordered, todayIso()), scores, overall };
}

/** Muted RAG tone for a percentage-green score. */
export const scoreColour = (percent: number) =>
  percent >= 80
    ? "var(--viz-good)"
    : percent >= 60
      ? "var(--viz-warning)"
      : percent >= 40
        ? "var(--viz-serious)"
        : "var(--viz-critical)";

// ---- Programme roll-up ----------------------------------------------------------------

export interface ProgrammeRollup {
  programme: ProgrammeSummary;
  rag: RagCounts;
  budget: number;
  forecast: number;
  actual: number;
  slipped: number;
}

export function getProgrammeRollups(
  programmes: ProgrammeSummary[],
  projects: ProjectSummary[],
  milestones: PortfolioMilestone[],
): ProgrammeRollup[] {
  const active = activeOnly(projects);
  return programmes.map((programme) => {
    const items = active.filter((project) => project.programmeId === programme.id);
    return {
      programme,
      rag: getRag(items),
      budget: items.reduce((sum, project) => sum + project.budget, 0),
      forecast: items.reduce((sum, project) => sum + project.forecast, 0),
      actual: items.reduce((sum, project) => sum + project.actual, 0),
      slipped: milestones.filter(
        (item) =>
          item.programmeId === programme.id && item.status !== "Completed" && item.slipDays > 0,
      ).length,
    };
  });
}

// ---- Delivery profile -----------------------------------------------------------------

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export interface DeliveryPoint {
  period: string;
  planned: number;
  actual?: number | undefined;
  band?: [number, number] | undefined;
}

/**
 * Cumulative milestone delivery: baselined plan against what has actually been signed off,
 * then a forecast range for the months ahead. Cumulative curves show whether the portfolio
 * is catching up or falling further behind, which a bar per month does not.
 */
export function getDeliveryCurve(items: MilestoneItem[], back = 6, forward = 8) {
  const now = today();
  const months = Array.from(
    { length: back + forward + 1 },
    (_, index) => new Date(now.getFullYear(), now.getMonth() - back + index + 1, 0),
  );
  const todayIndex = back;
  const upTo = (date: Date, read: (item: MilestoneItem) => string | null | undefined) =>
    items.filter((item) => {
      const value = read(item);
      const parsed = value ? parseDate(value) : undefined;
      return parsed ? parsed <= date : false;
    }).length;
  const points: DeliveryPoint[] = months.map((end, index) => {
    const planned = upTo(end, (item) => item.baselineDate);
    const period = `${SHORT_MONTHS[end.getMonth()]} ${String(end.getFullYear()).slice(2)}`;
    const delivered = upTo(end, (item) => item.actualDate);
    // The band is anchored on today's actual so the forecast reads as a continuation.
    if (index < todayIndex) return { period, planned, actual: delivered };
    if (index === todayIndex)
      return {
        period,
        planned,
        actual: delivered,
        band: [delivered, delivered] as [number, number],
      };
    const expected = upTo(end, (item) => item.actualDate ?? item.forecastDate);
    return {
      period,
      planned,
      band: [Math.round(expected * 0.9), Math.round(expected * 1.04)] as [number, number],
    };
  });
  const current = points[todayIndex];
  return {
    points,
    todayPeriod: current?.period ?? "",
    delivered: current?.actual ?? 0,
    plannedToDate: current?.planned ?? 0,
    total: items.length,
  };
}
