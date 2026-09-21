import type { Health, Programme, Project } from "@/data/types";
import { getEffortHealth, getFinancialHealth, getIssueHealth, getPortfolioMilestones, getProgrammes, getProjectBenefitHealth, getProjectHealth, getProjects, getScheduleHealth, type PortfolioMilestone } from "@/services/pmo";
import { getTrend, type TrendSeries } from "@/services/trends";

const parseDate = (value: string) => { const parts = value.split("/").map(Number); return new Date(parts[2] ?? 1970, (parts[1] ?? 1) - 1, parts[0] ?? 1) };
const DAY = 86400000;
export const analyticsToday = parseDate("21/09/2026");
export const dayNumber = (value: string) => Math.round(parseDate(value).getTime() / DAY);

export interface RagCounts { green: number; amber: number; red: number; unset: number; total: number; percentOnTrack: number }
/** RAG mix over a set of projects. Delivery views count active work only. */
export function getRag(items: Project[]): RagCounts {
  const of = (health: Health) => items.filter(project => getProjectHealth(project) === health).length;
  const green = of("On Track"), amber = of("At Risk"), red = of("Off Track"), unset = of("Not Set");
  const total = items.length;
  return { green, amber, red, unset, total, percentOnTrack: total ? Math.round((green / total) * 100) : 0 };
}
export const getActiveProjects = (programmeId?: string) => getProjects(programmeId).filter(project => project.state === "Active");

export const ragSegments = (rag: RagCounts) => [
  { key: "green", label: "On track", value: rag.green, colour: "var(--viz-good)" },
  { key: "amber", label: "At risk", value: rag.amber, colour: "var(--viz-warning)" },
  { key: "red", label: "Off track", value: rag.red, colour: "var(--viz-critical)" },
  { key: "unset", label: "Not set", value: rag.unset, colour: "var(--viz-ink-muted)" },
];

// ---- Headline figures -------------------------------------------------------
export interface Headline { key: string; value: number; trend: TrendSeries }
const headline = (key: string, value: number, options: Parameters<typeof getTrend>[2]): Headline => ({ key, value, trend: getTrend(key, value, options) });

export function getPortfolioHeadlines(items = getActiveProjects()) {
  const rag = getRag(items);
  const budget = items.reduce((sum, project) => sum + project.budget, 0);
  const forecast = items.reduce((sum, project) => sum + project.forecast, 0);
  const spend = items.reduce((sum, project) => sum + project.actual, 0);
  return {
    rag, budget, forecast, spend,
    activeProjects: headline("portfolio.active", items.length, { drift: 0.22, noise: 0.05, integer: true, min: 0 }),
    budgetSeries: headline("portfolio.budget", budget, { drift: 0.14, noise: 0.03, min: 0 }),
    varianceSeries: headline("portfolio.variance", forecast - budget, { drift: 0.55, noise: 0.12 }),
    onTrackSeries: headline("portfolio.onTrack", rag.percentOnTrack, { drift: -0.1, noise: 0.06, integer: true, min: 0, max: 100 }),
  };
}

// ---- Financials -------------------------------------------------------------
export interface FinancialRow { key: string; label: string; actual: number; forecast: number; target: number; note?: string }
export function getProgrammeFinancials(programmes = getProgrammes()): FinancialRow[] {
  return programmes.map(programme => {
    const items = getActiveProjects(programme.id);
    const target = items.reduce((sum, project) => sum + project.budget, 0);
    const forecast = items.reduce((sum, project) => sum + project.forecast, 0);
    return {
      key: programme.id, label: programme.name,
      actual: items.reduce((sum, project) => sum + project.actual, 0), forecast, target,
      note: `${items.length} active ${items.length === 1 ? "project" : "projects"}`,
    };
  }).sort((a, b) => (b.forecast - b.target) - (a.forecast - a.target));
}
export function getProjectFinancials(items: Project[]): FinancialRow[] {
  return items.map(project => ({ key: project.id, label: project.name, actual: project.actual, forecast: project.forecast, target: project.budget, note: `${project.stage} · ${project.manager}` }))
    .sort((a, b) => (b.forecast - b.target) - (a.forecast - a.target));
}

// ---- Milestone slippage -----------------------------------------------------
export type SlipSeverity = "Ahead" | "On plan" | "Minor" | "Material" | "Severe";
export const slipSeverity = (days: number): SlipSeverity => days < 0 ? "Ahead" : days === 0 ? "On plan" : days <= 14 ? "Minor" : days <= 30 ? "Material" : "Severe";
export const slipColour: Record<SlipSeverity, string> = { Ahead: "var(--viz-good)", "On plan": "var(--viz-good)", Minor: "var(--viz-warning)", Material: "var(--viz-serious)", Severe: "var(--viz-critical)" };

export function getSlippedMilestones(items = getPortfolioMilestones(), limit = 8): PortfolioMilestone[] {
  return items.filter(item => item.status !== "Completed" && item.slipDays > 0).sort((a, b) => b.slipDays - a.slipDays).slice(0, limit);
}

// ---- Health dimensions ------------------------------------------------------
export interface DimensionScore { key: string; label: string; percent: number; scored: number; total: number; trend: TrendSeries; info: string }
const dimensions: Array<{ key: string; label: string; read: (project: Project) => Health; drift: number; info: string }> = [
  { key: "schedule", label: "Schedule", read: getScheduleHealth, drift: -0.14, info: "Projects with no overdue milestone and slip inside the tolerance." },
  { key: "financial", label: "Financial", read: getFinancialHealth, drift: -0.08, info: "Projects forecasting inside the approved budget tolerance." },
  { key: "effort", label: "Effort", read: getEffortHealth, drift: 0.1, info: "Projects with overdue tasks below the tolerance." },
  { key: "issues", label: "Issues and risks", read: getIssueHealth, drift: -0.18, info: "Projects with no open high-severity issue and no risk above the escalation score." },
  { key: "benefits", label: "Benefits", read: getProjectBenefitHealth, drift: 0.06, info: "Projects whose benefits are owned, baselined and tracking to profile for their stage." },
];

/**
 * Share of projects reporting green in each health dimension, with its recent history.
 * Projects where the dimension does not yet apply — no benefits mapped, say — are left
 * out of the denominator rather than counted as a failure.
 */
export function getDimensionScores(items = getActiveProjects()): DimensionScore[] {
  return dimensions.map(dimension => {
    const read = items.map(project => dimension.read(project));
    const scored = read.filter(health => health !== "Not Set").length;
    const green = read.filter(health => health === "On Track").length;
    const percent = scored ? Math.round((green / scored) * 100) : 0;
    return { key: dimension.key, label: dimension.label, percent, scored, total: items.length, info: dimension.info, trend: getTrend(`dimension.${dimension.key}`, percent, { drift: dimension.drift, noise: 0.07, integer: true, min: 0, max: 100 }) };
  });
}
/** Muted RAG tone for a percentage-green score. */
export const scoreColour = (percent: number) => percent >= 80 ? "var(--viz-good)" : percent >= 60 ? "var(--viz-warning)" : percent >= 40 ? "var(--viz-serious)" : "var(--viz-critical)";

// ---- Programme roll-up ------------------------------------------------------
export interface ProgrammeRollup { programme: Programme; rag: RagCounts; budget: number; forecast: number; actual: number; slipped: number }
export function getProgrammeRollups(programmes = getProgrammes()): ProgrammeRollup[] {
  const milestones = getPortfolioMilestones();
  return programmes.map(programme => {
    const items = getActiveProjects(programme.id);
    return {
      programme, rag: getRag(items),
      budget: items.reduce((sum, project) => sum + project.budget, 0),
      forecast: items.reduce((sum, project) => sum + project.forecast, 0),
      actual: items.reduce((sum, project) => sum + project.actual, 0),
      slipped: milestones.filter(item => item.programmeId === programme.id && item.status !== "Completed" && item.slipDays > 0).length,
    };
  });
}

// ---- Delivery profile -------------------------------------------------------
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export interface DeliveryPoint { period: string; planned: number; actual?: number | undefined; band?: [number, number] | undefined }

/**
 * Cumulative milestone delivery: baselined plan against what has actually been
 * signed off, then a forecast range for the months ahead. Cumulative curves show
 * whether the portfolio is catching up or falling further behind, which a bar per
 * month does not.
 */
export function getDeliveryCurve(items = getPortfolioMilestones(), back = 6, forward = 8) {
  const months = Array.from({ length: back + forward + 1 }, (_, index) => new Date(analyticsToday.getFullYear(), analyticsToday.getMonth() - back + index + 1, 0));
  const todayIndex = back;
  const upTo = (date: Date, read: (item: PortfolioMilestone) => string | undefined) => items.filter(item => { const value = read(item); return value ? parseDate(value) <= date : false }).length;
  const points: DeliveryPoint[] = months.map((end, index) => {
    const planned = upTo(end, item => item.baselineDate);
    const period = `${SHORT_MONTHS[end.getMonth()]} ${String(end.getFullYear()).slice(2)}`;
    const delivered = upTo(end, item => item.actualDate);
    // The band is anchored on today's actual so the forecast reads as a continuation, not a second series.
    if (index < todayIndex) return { period, planned, actual: delivered };
    if (index === todayIndex) return { period, planned, actual: delivered, band: [delivered, delivered] as [number, number] };
    const expected = upTo(end, item => item.actualDate ?? item.forecastDate);
    return { period, planned, band: [Math.round(expected * 0.9), Math.round(expected * 1.04)] as [number, number] };
  });
  const current = points[todayIndex];
  return { points, todayPeriod: current?.period ?? "", delivered: current?.actual ?? 0, plannedToDate: current?.planned ?? 0, total: items.length };
}
