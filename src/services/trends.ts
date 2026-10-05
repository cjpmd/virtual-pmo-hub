// Period-on-period history for headline figures, read from health_snapshots.
//
// capture_health_snapshots() writes one row per active portfolio, programme and project
// (nightly, and when a status report is submitted). Portfolio rows also carry headline
// figures in `metrics`. These functions read that history and turn it into series; they
// never invent points. A new organisation has no history yet, so its series are empty and
// the charts show just today's value.
import { supabase } from "@/integrations/supabase/client";
import { toHealth } from "./labels";
import { unwrap } from "./service-error";
import type { Health } from "@/data/types";

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

/** How many periods of history the overview charts show. */
export const TREND_PERIODS = 12;

export interface TrendSeries {
  points: number[];
  current: number;
  previous: number;
  change: number;
  percent: number;
}

export interface PortfolioSnapshot {
  date: string;
  overall: Health;
  activeProjects: number | undefined;
  budget: number | undefined;
  forecast: number | undefined;
  spend: number | undefined;
  variance: number | undefined;
  percentOnTrack: number | undefined;
}

export interface ProjectSnapshot {
  date: string;
  projectId: string;
  overall: Health;
  schedule: Health;
  financial: Health;
  effort: Health;
  issue: Health;
  benefit: Health;
}

const metric = (metrics: unknown, key: string) => {
  const value = (metrics as Record<string, unknown> | null)?.[key];
  return typeof value === "number" ? value : undefined;
};

/** The latest snapshot in each calendar month, oldest first, for the last `periods` months. */
function lastPerMonth<T extends { date: string }>(rows: T[], periods: number): T[] {
  const byMonth = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date)))
    byMonth.set(row.date.slice(0, 7), row);
  return [...byMonth.values()].slice(-periods);
}

export async function listPortfolioSnapshots(
  orgId: string,
  portfolioId: string,
  periods = TREND_PERIODS,
): Promise<PortfolioSnapshot[]> {
  const rows = unwrap(
    await supabase
      .from("health_snapshots")
      .select("snapshot_date, overall, metrics")
      .eq("organisation_id", orgId)
      .eq("portfolio_id", portfolioId)
      .order("snapshot_date", { ascending: false })
      .limit(periods * 31),
    "Loading portfolio history",
  );
  return lastPerMonth(
    rows.map((row) => ({
      date: row.snapshot_date,
      overall: toHealth(row.overall),
      activeProjects: metric(row.metrics, "activeProjects"),
      budget: metric(row.metrics, "budget"),
      forecast: metric(row.metrics, "forecast"),
      spend: metric(row.metrics, "spend"),
      variance: metric(row.metrics, "variance"),
      percentOnTrack: metric(row.metrics, "percentOnTrack"),
    })),
    periods,
  );
}

export async function listProjectSnapshots(
  orgId: string,
  projectIds: string[],
  since: string,
): Promise<ProjectSnapshot[]> {
  if (!projectIds.length) return [];
  const rows = unwrap(
    await supabase
      .from("health_snapshots")
      .select("snapshot_date, project_id, overall, schedule, financial, effort, issue, benefit")
      .eq("organisation_id", orgId)
      .in("project_id", projectIds)
      .gte("snapshot_date", since)
      .order("snapshot_date"),
    "Loading project history",
  );
  return rows.map((row) => ({
    date: row.snapshot_date,
    projectId: row.project_id ?? "",
    overall: toHealth(row.overall),
    schedule: toHealth(row.schedule),
    financial: toHealth(row.financial),
    effort: toHealth(row.effort),
    issue: toHealth(row.issue),
    benefit: toHealth(row.benefit),
  }));
}

// ---- Pure helpers -------------------------------------------------------------------

/** "Sep 26" for an ISO date. */
export const periodLabel = (iso: string) =>
  `${SHORT_MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(2, 4)}`;

/**
 * A series of recorded values that ends on today's live value. History supplies every point
 * before the current month; the live value always replaces the current month's snapshot, so
 * the headline and the end of its sparkline can never disagree.
 */
export function toSeries(
  history: Array<{ date: string; value: number | undefined }>,
  current: number,
  currentMonth: string,
): TrendSeries {
  const points = history
    .filter((point) => point.date.slice(0, 7) < currentMonth && point.value !== undefined)
    .map((point) => point.value as number);
  points.push(current);
  const previous = points.length > 1 ? (points[points.length - 2] ?? current) : current;
  const change = current - previous;
  return {
    points,
    current,
    previous,
    change,
    percent: previous ? (change / Math.abs(previous)) * 100 : 0,
  };
}

/** Month labels for the series built by toSeries over the same history. */
export function trendPeriods(history: Array<{ date: string }>, todayIso: string): string[] {
  const month = todayIso.slice(0, 7);
  return [
    ...history
      .filter((point) => point.date.slice(0, 7) < month)
      .map((point) => periodLabel(point.date)),
    periodLabel(todayIso),
  ];
}

/** Wording for a KPI delta, e.g. "vs Aug 26". */
export const deltaLabel = (periods: string[]) =>
  periods.length > 1 ? `vs ${periods[periods.length - 2]}` : "no history yet";
