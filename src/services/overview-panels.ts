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
import { divergenceText } from "./assurance";
import type { OpenRaidItem, ProjectOverviewHealth } from "./project-overview";

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
  /** Sponsor and project manager, resolved by the hierarchy loader ("Unassigned" when unset). */
  sponsorName: string;
  managerName: string;
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
  /** From v_project_divergence; declared is "Not Set" when the project has never reported. */
  declared: Map<string, { declared: Health; evidenced: Health; divergent: boolean }>;
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
      sponsorName: p.sponsorName,
      managerName: p.managerName,
      declared: assurance?.declared ?? p.health.overall,
      evidenced: assurance?.evidenced ?? p.health.overall,
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
    | { kind: "milestones" }
    | {
        kind: "projectTab";
        code: string;
        tab: "overview" | "status" | "raid" | "financials" | "plan";
        sub?: "risks" | "milestones" | "gates";
        dialog?: "justify";
      };
  /** Button text for project signals ("Add justification", "Open financials"). */
  action?: string;
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

// ---- Project signals (project overview, Stage 3) ----------------------------------------

/** A report due within this many days is a signal. */
export const REPORT_DUE_SOON_DAYS = 7;
/** A red risk not updated for this many days is a signal. */
export const RED_RISK_STALE_DAYS = 14;
/** A gate this many days away (or fewer) with an incomplete checklist is a signal. */
export const GATE_SOON_DAYS = 30;

export interface ProjectSignalInput {
  code: string;
  today: string;
  closed: boolean;
  health: Pick<
    ProjectOverviewHealth,
    | "declared"
    | "evidenced"
    | "divergent"
    | "divergenceKind"
    | "divergenceDays"
    | "divergenceAlert"
    | "justified"
    | "lastReportDate"
    | "nextReportDue"
    | "reportOverdue"
    | "finishVsBaselineDays"
    | "finishSlipHealth"
    | "milestonesAfterBaselineFinish"
  > | null;
  openRaid: OpenRaidItem[];
  redRiskMinScore: number;
  /**
   * At the last closed month: cumulative spend and plan as % of budget (the chart's values; the
   * plan is even phasing when there is no budget profile). Undefined when nothing is closed.
   */
  spendVsPlan: { month: string; spend: number; plan: number } | undefined;
  /** Milestones baselined on or before today, and milestones delivered. */
  milestonesBaselinedByNow: number;
  milestonesDelivered: number;
  /**
   * The next undelivered gate milestone (forecast on or after today) and the current phase's
   * gate checklist: how many items are done of how many.
   */
  nextGate?: { title: string; date: string; passed: number; total: number } | undefined;
  date: (iso: string) => string;
}

const RAG_WORD: Record<Health, string> = {
  "On Track": "green",
  "At Risk": "amber",
  "Off Track": "red",
  "Not Set": "not set",
};
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
      Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) /
      86_400_000,
  );
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Rule-generated signals for one project, serious first, at most five, each opening the tab or
 * dialog that deals with it. Every RAG, due date and tolerance is read as recorded.
 */
export function buildProjectSignals(input: ProjectSignalInput): Signal[] {
  const { code, today, health } = input;
  const out: Signal[] = [];
  const tab = (
    to: Extract<Signal["link"], { kind: "projectTab" }>["tab"],
    extra: { sub?: "risks" | "milestones" | "gates"; dialog?: "justify" } = {},
  ): Signal["link"] => ({ kind: "projectTab", code, tab: to, ...extra });

  // 1. Report vs evidence, or Justified.
  if (health?.divergent && health.declared && health.evidenced) {
    const words = `Report says ${RAG_WORD[health.declared]}, evidence says ${RAG_WORD[health.evidenced]}`;
    out.push(
      health.justified
        ? {
            id: "divergence",
            date: today,
            tone: "warn",
            title: `Justified: ${words.charAt(0).toLowerCase()}${words.slice(1)}`,
            detail: "The difference has a recorded justification for the latest report.",
            link: tab("status"),
            action: "Open status",
          }
        : {
            id: "divergence",
            date: today,
            tone: health.divergenceAlert || health.evidenced === "Off Track" ? "bad" : "warn",
            title: words,
            detail: divergenceText({
              divergenceKind: health.divergenceKind,
              divergenceDays: health.divergenceDays ?? 0,
            }),
            link: tab("overview", { dialog: "justify" }),
            action: "Add justification",
          },
    );
  }

  // 2. Report due or overdue.
  if (!input.closed && health?.nextReportDue) {
    const days = daysBetween(today, health.nextReportDue);
    const last = health.lastReportDate
      ? `Last submitted ${input.date(health.lastReportDate)}.`
      : "No report submitted yet.";
    if (health.reportOverdue || days < 0)
      out.push({
        id: "report",
        date: today,
        tone: "bad",
        title: `Status report overdue by ${plural(Math.max(1, -days), "day")}`,
        detail: `Was due ${input.date(health.nextReportDue)}. ${last}`,
        link: tab("status"),
        action: "Start report",
      });
    else if (days <= REPORT_DUE_SOON_DAYS)
      out.push({
        id: "report",
        date: today,
        tone: "warn",
        title:
          days === 0 ? "Status report due today" : `Status report due in ${plural(days, "day")}`,
        detail: last,
        link: tab("status"),
        action: "Start report",
      });
  }

  // 3. Red risks not updated (there is no review history yet, so updated_at stands in).
  if (!input.closed)
    for (const risk of input.openRaid
      .filter((r) => r.kind === "risk" && (r.score ?? 0) >= input.redRiskMinScore)
      .map((r) => ({ ...r, days: daysBetween(r.updatedAt.slice(0, 10), today) }))
      .filter((r) => r.days >= RED_RISK_STALE_DAYS)
      .sort((a, b) => b.days - a.days))
      out.push({
        id: `risk-${risk.id}`,
        date: today,
        tone: "warn",
        title: `Red risk not updated in ${plural(risk.days, "day")}`,
        detail: `${risk.ref ? `${risk.ref} ` : ""}${risk.title}`,
        link: tab("raid", { sub: "risks" }),
        action: "Review risk",
      });

  // 4. Spending ahead of plan while delivery is behind: both must hold.
  const plan = input.spendVsPlan;
  const behind = input.milestonesBaselinedByNow - input.milestonesDelivered;
  if (!input.closed && plan) {
    const lead = Math.round(plan.spend - plan.plan);
    if (lead > SPEND_LEAD_POINTS && behind > 0)
      out.push({
        id: "spend-lead",
        date: today,
        tone: "bad",
        title: `Spending ahead of plan while delivery is behind (spend +${lead} pts, ${plural(behind, "milestone")} behind)`,
        detail: `${Math.round(plan.spend)}% of budget spent against ${Math.round(plan.plan)}% planned by the end of ${plan.month}; ${input.milestonesDelivered} of ${input.milestonesBaselinedByNow} milestones due by now delivered.`,
        link: tab("financials"),
        action: "Open financials",
      });
  }

  // 5. Forecast finish beyond baseline, within or beyond tolerance (finish_slip_health).
  if (!input.closed && health?.finishVsBaselineDays && health.finishVsBaselineDays > 0) {
    const beyond = health.finishSlipHealth === "Off Track";
    out.push({
      id: "finish",
      date: today,
      tone: beyond ? "bad" : "warn",
      title: `Forecast finish ${plural(health.finishVsBaselineDays, "day")} beyond baseline`,
      detail: beyond ? "Beyond the schedule tolerance." : "Within the schedule tolerance.",
      link: tab("plan", { sub: "milestones" }),
      action: "Open milestones",
    });
  }

  // 6. Next gate within 30 days with its checklist incomplete.
  const gate = input.nextGate;
  if (!input.closed && gate && gate.passed < gate.total) {
    const days = daysBetween(today, gate.date);
    if (days >= 0 && days <= GATE_SOON_DAYS)
      out.push({
        id: "gate",
        date: today,
        tone: days <= 7 ? "bad" : "warn",
        title: `Gate ${gate.title.replace(/^gate\s*/i, "")} in ${plural(days, "day")}, ${gate.passed} of ${gate.total} checklist items done`,
        detail: `Forecast ${input.date(gate.date)}. Complete the checklist before the gate.`,
        link: tab("plan", { sub: "gates" }),
        action: "Open gates",
      });
  }

  // 7. Data quality: milestones baselined after the project's baseline finish.
  const late = health?.milestonesAfterBaselineFinish ?? 0;
  if (late > 0)
    out.push({
      id: "milestones-after-finish",
      date: today,
      tone: "warn",
      title: `${plural(late, "milestone")} baselined after project finish`,
      detail: "Data quality: check the baseline dates or the project's baseline finish.",
      link: tab("plan", { sub: "milestones" }),
      action: "Open milestones",
    });

  return out
    .map((signal, i) => ({ signal, i }))
    .sort((a, b) => Number(a.signal.tone !== "bad") - Number(b.signal.tone !== "bad") || a.i - b.i)
    .map(({ signal }) => signal)
    .slice(0, MAX_SIGNALS);
}
