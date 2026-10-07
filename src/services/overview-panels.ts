// Programme strip, project watchlist and signals for the portfolio overview
// (docs/design/portfolio-overview-spec.md §3–4). Loaders read records; the build functions
// are pure. Health and RAG are read as recorded (v_* views, health_snapshots, pathway views);
// nothing here works a RAG out, it only compares and counts recorded values.
import { supabase } from "@/integrations/supabase/client";
import type { Health } from "@/data/types";
import { unwrap } from "./service-error";
import type { EvidencedRag } from "./forecast";
import type { ProjectSummary, ProgrammeSummary } from "./hierarchy";
import type { ProjectSnapshot } from "./trends";
import type { PathwayData } from "./pathway";

/** Forecast movement that counts as a signal: the org default until a setting exists. */
export const FORECAST_MOVE_THRESHOLD = { amount: 25000, percent: 5 };
/** Spend may lead milestones by up to this many points before it is a signal. */
export const SPEND_LEAD_POINTS = 15;
/** Milestones forecast to land below this share of the year's plan are a signal. */
export const MILESTONE_LANDING_PERCENT = 90;
export const MAX_SIGNALS = 5;

export interface ForecastPoint {
  projectId: string;
  month: string; // YYYY-MM
  eac: number;
  budget: number;
}

export async function listForecastHistory(
  orgId: string,
  projectIds: string[],
): Promise<ForecastPoint[]> {
  if (!projectIds.length) return [];
  const rows = unwrap(
    await supabase
      .from("financial_forecast_history")
      .select("project_id, reporting_month, eac, budget")
      .eq("organisation_id", orgId)
      .in("project_id", projectIds)
      .order("reporting_month")
      .range(0, 19999),
    "Loading forecast history",
  );
  return rows.map((row) => ({
    projectId: row.project_id,
    month: row.reporting_month.slice(0, 7),
    eac: Number(row.eac),
    budget: Number(row.budget),
  }));
}

const lastMonths = (current: string, n: number) => {
  const out: string[] = [];
  let y = Number(current.slice(0, 4)),
    m = Number(current.slice(5, 7));
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
};

export const evidencedToHealth = (rag: EvidencedRag | undefined): Health =>
  rag === "Green"
    ? "On Track"
    : rag === "Amber"
      ? "At Risk"
      : rag === "Red"
        ? "Off Track"
        : "Not Set";
const rank = (h: Health) =>
  h === "On Track" ? 0 : h === "At Risk" ? 1 : h === "Off Track" ? 2 : -1;

/** % of projects green in each month-end snapshot, over the last six months. */
function greenTrend(projectIds: Set<string>, history: ProjectSnapshot[], months: string[]) {
  return months.map((month) => {
    const last = new Map<string, ProjectSnapshot>();
    for (const row of history)
      if (row.date.slice(0, 7) === month && projectIds.has(row.projectId))
        last.set(row.projectId, row);
    const list = [...last.values()];
    return list.length
      ? Math.round((100 * list.filter((r) => r.overall === "On Track").length) / list.length)
      : null;
  });
}

// ---- Programme cards -----------------------------------------------------------------

export interface ProgrammeCardData {
  id: string | null; // null = whole portfolio
  name: string;
  variance: number; // forecast − budget
  onTrack: number;
  total: number;
  rag: { green: number; amber: number; red: number; unset: number };
  trend: Array<number | null>;
}

export function buildProgrammeCards(
  programmes: ProgrammeSummary[],
  active: ProjectSummary[],
  history: ProjectSnapshot[],
  today: string,
): ProgrammeCardData[] {
  const months = lastMonths(today.slice(0, 7), 6);
  const card = (id: string | null, name: string, projects: ProjectSummary[]): ProgrammeCardData => {
    const rag = { green: 0, amber: 0, red: 0, unset: 0 };
    for (const p of projects) {
      const h = p.health.overall;
      if (h === "On Track") rag.green++;
      else if (h === "At Risk") rag.amber++;
      else if (h === "Off Track") rag.red++;
      else rag.unset++;
    }
    return {
      id,
      name,
      variance: projects.reduce((sum, p) => sum + (p.forecast - p.budget), 0),
      onTrack: rag.green,
      total: projects.length,
      rag,
      trend: greenTrend(new Set(projects.map((p) => p.id)), history, months),
    };
  };
  return [
    card(null, "Whole portfolio", active),
    ...programmes
      .filter((programme) => programme.state !== "Closed")
      .map((programme) =>
        card(
          programme.id,
          programme.name,
          active.filter((p) => p.programmeId === programme.id),
        ),
      ),
  ];
}

// ---- Watchlist -----------------------------------------------------------------------

export type WatchSort = "overspend" | "movers" | "gap";

export interface WatchRow {
  id: string;
  code: string;
  name: string;
  programmeId: string | null;
  programmeName: string;
  declared: Health; // report ring
  evidenced: Health; // data dot
  disagree: boolean;
  variance: number;
  change: number | null; // forecast change since last month
  trend: Array<number | null>; // variance at each month end
  /** Open risks and issues, open change requests, and average task completion. */
  risks: number;
  issues: number;
  changes: number;
  completion: number | null;
}

export interface WatchGroup {
  id: string | null;
  name: string;
  onTrack: number;
  total: number;
  variance: number;
  rows: WatchRow[];
}

export function buildWatchlist(input: {
  active: ProjectSummary[];
  declared: Map<string, { declared: Health; evidenced: EvidencedRag; divergent: boolean }>;
  forecasts: ForecastPoint[];
  /** Open change requests by project id. */
  openChanges: Map<string, number>;
  today: string;
  sort: WatchSort;
}): WatchGroup[] {
  const current = input.today.slice(0, 7);
  const months = lastMonths(current, 6);
  const byProject = new Map<string, ForecastPoint[]>();
  for (const point of input.forecasts)
    byProject.set(point.projectId, [...(byProject.get(point.projectId) ?? []), point]);
  const rows: WatchRow[] = input.active.map((p) => {
    const points = byProject.get(p.id) ?? [];
    const before = points.filter((pt) => pt.month < current).at(-1);
    const assurance = input.declared.get(p.id);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      programmeId: p.programmeId,
      programmeName: p.programmeName || "No programme",
      declared: assurance?.declared ?? p.health.overall,
      evidenced: assurance ? evidencedToHealth(assurance.evidenced) : p.health.overall,
      disagree: assurance?.divergent ?? false,
      variance: p.forecast - p.budget,
      change: before ? p.forecast - before.eac : null,
      trend: months.map((month) => {
        if (month === current) return p.forecast - p.budget;
        const point = points.filter((pt) => pt.month <= month).at(-1);
        return point ? point.eac - point.budget : null;
      }),
      risks: p.openRisks,
      issues: p.openIssues,
      changes: input.openChanges.get(p.id) ?? 0,
      completion: p.taskCount ? p.averagePercentComplete : null,
    };
  });
  const sorter: Record<WatchSort, (a: WatchRow, b: WatchRow) => number> = {
    overspend: (a, b) => b.variance - a.variance,
    movers: (a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0),
    gap: (a, b) => Number(b.disagree) - Number(a.disagree) || rank(b.evidenced) - rank(a.evidenced),
  };
  const groups = new Map<string, WatchGroup>();
  for (const row of rows) {
    const key = row.programmeId ?? "none";
    const group = groups.get(key) ?? {
      id: row.programmeId,
      name: row.programmeName,
      onTrack: 0,
      total: 0,
      variance: 0,
      rows: [],
    };
    group.rows.push(row);
    group.total++;
    if (input.active.find((p) => p.id === row.id)?.health.overall === "On Track") group.onTrack++;
    group.variance += row.variance;
    groups.set(key, group);
  }
  const list = [...groups.values()];
  for (const group of list) group.rows.sort(sorter[input.sort]);
  return list.sort((a, b) =>
    input.sort === "overspend" ? b.variance - a.variance : a.name.localeCompare(b.name),
  );
}

// ---- Signals -------------------------------------------------------------------------

export type SignalTone = "bad" | "warn";
export interface Signal {
  id: string;
  date: string; // ISO date the signal relates to
  tone: SignalTone;
  title: string;
  detail: string;
  link:
    | { kind: "project"; code: string }
    | { kind: "programme"; id: string }
    | { kind: "benefit"; id: string }
    | { kind: "pathway" }
    | { kind: "assurance" }
    | { kind: "milestones" };
}

export interface SignalInput {
  today: string;
  scopeName: string;
  spendPercent: number | undefined;
  milestonePercent: number | undefined;
  milestoneYearEndPercent: number | undefined;
  active: ProjectSummary[];
  projectHistory: ProjectSnapshot[];
  watch: WatchRow[];
  pathway: Pick<PathwayData, "capabilities" | "outcomes" | "benefits"> | undefined;
  /** Month-end pathway RAG last month, keyed by item id, to spot a turn to amber or red. */
  previousPathwayRag: Map<string, Health>;
  programmeIds: Set<string> | null;
  money: (value: number) => string;
}

const worse = (now: Health, before: Health | undefined) =>
  (now === "At Risk" || now === "Off Track") && rank(now) > rank(before ?? "On Track");

export function buildSignals(input: SignalInput): Signal[] {
  const { today } = input;
  const monthStart = `${today.slice(0, 7)}-01`;
  const out: Signal[] = [];
  const inScope = (id: string | null) =>
    !input.programmeIds || (id !== null && input.programmeIds.has(id));

  // 1. Spend leads milestones.
  if (input.spendPercent !== undefined && input.milestonePercent !== undefined) {
    const lead = input.spendPercent - input.milestonePercent;
    if (lead > SPEND_LEAD_POINTS)
      out.push({
        id: "spend-lead",
        date: today,
        tone: "bad",
        title: "Spend ahead of delivery",
        detail: `${Math.round(input.spendPercent)}% of the year's budget spent, but only ${Math.round(input.milestonePercent)}% of milestones signed off (${Math.round(lead)} points).`,
        link: { kind: "milestones" },
      });
  }

  // 2. Evidenced health changed this month.
  for (const project of input.active) {
    const before = input.projectHistory
      .filter((row) => row.projectId === project.id && row.date < monthStart)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1);
    const now = project.health.overall;
    if (!before || before.overall === now || now === "Not Set") continue;
    const better = rank(now) < rank(before.overall);
    out.push({
      id: `health-${project.id}`,
      date: project.updatedAt?.slice(0, 10) ?? today,
      tone: better ? "warn" : now === "Off Track" ? "bad" : "warn",
      title: project.name,
      detail: `Moved from ${before.overall} to ${now} this month.`,
      link: { kind: "project", code: project.code },
    });
  }

  // 3. Forecast moved more than the threshold.
  for (const row of input.watch) {
    if (row.change === null) continue;
    const forecast = input.active.find((p) => p.id === row.id)?.forecast ?? 0;
    const previous = forecast - row.change;
    const pct = previous ? (Math.abs(row.change) / Math.abs(previous)) * 100 : 0;
    if (
      Math.abs(row.change) < FORECAST_MOVE_THRESHOLD.amount &&
      pct < FORECAST_MOVE_THRESHOLD.percent
    )
      continue;
    const up = row.change > 0;
    out.push({
      id: `forecast-${row.id}`,
      date: today,
      tone: up ? "bad" : "warn",
      title: row.name,
      detail: `Forecast ${up ? "up" : "down"} ${input.money(Math.abs(row.change))}, now ${input.money(Math.abs(row.variance))} ${row.variance >= 0 ? "over" : "under"} budget.`,
      link: { kind: "project", code: row.code },
    });
  }

  // 4. Report vs data disagree.
  for (const row of input.watch.filter((r) => r.disagree))
    out.push({
      id: `gap-${row.id}`,
      date: today,
      tone: "warn",
      title: row.name,
      detail: `Report says ${row.declared}; the data says ${row.evidenced}.`,
      link: { kind: "project", code: row.code },
    });

  // 5. Milestones forecast to land under 90% of plan.
  if (
    input.milestoneYearEndPercent !== undefined &&
    input.milestoneYearEndPercent < MILESTONE_LANDING_PERCENT
  )
    out.push({
      id: "milestones-landing",
      date: today,
      tone: "warn",
      title: "Milestones forecast",
      detail: `On current forecast dates, ${Math.round(input.milestoneYearEndPercent)}% of this year's milestones land by year end.`,
      link: { kind: "milestones" },
    });

  // 6–8. Benefits pathway.
  const pathway = input.pathway;
  if (pathway) {
    for (const capability of pathway.capabilities.filter((c) => inScope(c.programmeId))) {
      if (worse(capability.rag, input.previousPathwayRag.get(capability.id)))
        out.push({
          id: `cap-rag-${capability.id}`,
          date: capability.updatedAt.slice(0, 10),
          tone: capability.rag === "Off Track" ? "bad" : "warn",
          title: capability.title,
          detail: `Capability turned ${capability.rag}. ${capability.reason}`.trim(),
          link: { kind: "pathway" },
        });
      if (capability.awaitingAcceptancePastTarget)
        out.push({
          id: `cap-accept-${capability.id}`,
          date: capability.targetDate ?? today,
          tone: "warn",
          title: capability.title,
          detail: "Delivered but awaiting acceptance past its target date.",
          link: { kind: "pathway" },
        });
      else if (
        capability.targetDate &&
        capability.targetDate < today &&
        capability.status !== "accepted"
      )
        out.push({
          id: `cap-late-${capability.id}`,
          date: capability.targetDate,
          tone: "bad",
          title: capability.title,
          detail: "Capability is past its target date and not accepted.",
          link: { kind: "pathway" },
        });
    }
    for (const outcome of pathway.outcomes.filter((o) => inScope(o.programmeId)))
      if (worse(outcome.rag, input.previousPathwayRag.get(outcome.id)))
        out.push({
          id: `out-rag-${outcome.id}`,
          date: outcome.updatedAt.slice(0, 10),
          tone: outcome.rag === "Off Track" ? "bad" : "warn",
          title: outcome.title,
          detail: `Outcome turned ${outcome.rag}. ${outcome.reason}`.trim(),
          link: { kind: "pathway" },
        });
    for (const benefit of pathway.benefits.filter((b) => inScope(b.programmeId) && !b.hasPathway))
      out.push({
        id: `benefit-path-${benefit.id}`,
        date: benefit.updatedAt.slice(0, 10),
        tone: "warn",
        title: benefit.title,
        detail: "Benefit has no pathway: it isn't linked to any outcome.",
        link: { kind: "benefit", id: benefit.id },
      });
  }

  return out
    .sort((a, b) => b.date.localeCompare(a.date) || (a.tone === "bad" ? -1 : 1))
    .slice(0, MAX_SIGNALS);
}
