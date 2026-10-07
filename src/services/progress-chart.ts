// The overview's ProgressChart (docs/design/portfolio-overview-spec.md §4).
//
// Every series is "% of its own full-year plan", so different measures share one axis.
// loadProgressInputs() reads the raw records; buildProgressChart() is pure and turns them
// into monthly points. Month-end health values come from health_snapshots and
// pathway_snapshots; nothing here works out a RAG, it only counts recorded ones.
import { supabase } from "@/integrations/supabase/client";
import { toHealth } from "./labels";
import { unwrap } from "./service-error";
import type { Health } from "@/data/types";
import type { PortfolioSnapshot, ProjectSnapshot } from "./trends";

export type SeriesKey =
  | "plan"
  | "spend"
  | "tasks"
  | "milestones"
  | "green"
  | "risks"
  | "capabilities"
  | "outcomes"
  | "benefits"
  | "capabilitiesGreen"
  | "outcomesGreen"
  | "benefitsGreen"
  | "schedule"
  | "financial"
  | "effort"
  | "issue"
  | "benefit";

export type ChartTab = "overlay" | "spend" | "delivery" | "health" | "benefits" | "timeline";
export type ChartRange = "fy" | "12m" | "all";

export interface SeriesMeta {
  key: SeriesKey;
  label: string;
  colour: string;
  unit: "percent" | "count";
  dashed?: boolean;
}

export const SERIES: Record<SeriesKey, SeriesMeta> = {
  plan: { key: "plan", label: "Plan", colour: "var(--pmo-muted)", unit: "percent", dashed: true },
  spend: { key: "spend", label: "Spend", colour: "var(--series-spend)", unit: "percent" },
  tasks: { key: "tasks", label: "Tasks done", colour: "var(--series-tasks)", unit: "percent" },
  milestones: {
    key: "milestones",
    label: "Milestones",
    colour: "var(--series-milestones)",
    unit: "percent",
  },
  green: { key: "green", label: "Projects green", colour: "var(--series-green)", unit: "percent" },
  risks: { key: "risks", label: "Red risks", colour: "var(--pmo-bad)", unit: "count" },
  capabilities: {
    key: "capabilities",
    label: "Capabilities delivered",
    colour: "var(--series-capabilities)",
    unit: "percent",
  },
  outcomes: {
    key: "outcomes",
    label: "Outcomes achieved",
    colour: "var(--series-outcomes)",
    unit: "percent",
  },
  benefits: {
    key: "benefits",
    label: "Benefits realised",
    colour: "var(--series-benefits)",
    unit: "percent",
  },
  capabilitiesGreen: {
    key: "capabilitiesGreen",
    label: "Capabilities green",
    colour: "var(--series-capabilities)",
    unit: "percent",
    dashed: true,
  },
  outcomesGreen: {
    key: "outcomesGreen",
    label: "Outcomes green",
    colour: "var(--series-outcomes)",
    unit: "percent",
    dashed: true,
  },
  benefitsGreen: {
    key: "benefitsGreen",
    label: "Benefits green",
    colour: "var(--series-benefits)",
    unit: "percent",
    dashed: true,
  },
  schedule: { key: "schedule", label: "Schedule", colour: "var(--series-dim-schedule)", unit: "percent" },
  financial: { key: "financial", label: "Financial", colour: "var(--series-dim-financial)", unit: "percent" },
  effort: { key: "effort", label: "Effort", colour: "var(--series-dim-effort)", unit: "percent" },
  issue: { key: "issue", label: "Issues", colour: "var(--series-dim-issue)", unit: "percent" },
  benefit: { key: "benefit", label: "Benefits health", colour: "var(--series-dim-benefit)", unit: "percent" },
};

/** Chips shown for each tab, and which start switched on. */
export const TABS: Record<ChartTab, { label: string; chips: SeriesKey[]; on: SeriesKey[] }> = {
  overlay: {
    label: "Overlay",
    chips: ["plan", "spend", "tasks", "milestones", "green", "risks", "capabilities", "outcomes", "benefits"],
    on: ["spend", "tasks", "milestones", "green", "capabilities"],
  },
  spend: { label: "Spend", chips: ["plan", "spend"], on: ["plan", "spend"] },
  delivery: { label: "Delivery", chips: ["tasks", "milestones"], on: ["tasks", "milestones"] },
  health: {
    label: "Health",
    chips: ["green", "schedule", "financial", "effort", "issue", "benefit"],
    on: ["green", "schedule", "financial", "effort", "issue", "benefit"],
  },
  benefits: {
    label: "Benefits",
    chips: ["capabilities", "outcomes", "benefits", "capabilitiesGreen", "outcomesGreen", "benefitsGreen"],
    on: ["capabilities", "outcomes", "benefits", "capabilitiesGreen", "outcomesGreen", "benefitsGreen"],
  },
  timeline: { label: "Timeline", chips: ["milestones"], on: ["milestones"] },
};

// ---- Inputs -------------------------------------------------------------------------

export interface ProgressInputs {
  money: Array<{ projectId: string; month: string; kind: "budget" | "actual" | "forecast"; amount: number }>;
  tasks: Array<{ projectId: string; finish: string | null; status: string | null; doneAt: string | null }>;
  risks: Array<{ projectId: string | null; score: number; createdAt: string; closedAt: string | null; status: string }>;
  pathway: Array<{
    date: string;
    programmeId: string | null;
    item: string;
    kind: "capability" | "outcome" | "benefit";
    rag: Health;
    complete: boolean;
    dueInFy: boolean;
    realised: number | null;
    profile: number | null;
  }>;
  pathwayDates: Array<{ kind: "capability" | "outcome"; programmeId: string; date: string | null; done: boolean }>;
  committees: Array<{ date: string; title: string }>;
}

export interface ChartMilestone {
  id: string;
  title: string;
  type: string;
  baselineDate: string;
  forecastDate: string;
  actualDate: string | null;
  reportToCommittee: boolean;
}

export async function loadProgressInputs(orgId: string, projectIds: string[]): Promise<ProgressInputs> {
  const ids = projectIds.length ? projectIds : ["00000000-0000-0000-0000-000000000000"];
  const [money, tasks, risks, pathway, capabilities, outcomes, packs] = await Promise.all([
    supabase
      .from("financial_values")
      .select("project_id, period_month, kind, amount")
      .eq("organisation_id", orgId)
      .in("project_id", ids)
      .range(0, 49999),
    supabase
      .from("v_work_items")
      .select("project_id, finish_date, status, done_at")
      .eq("organisation_id", orgId)
      .in("project_id", ids)
      .range(0, 49999),
    supabase
      .from("risks")
      .select("project_id, score, created_at, closed_at, status")
      .eq("organisation_id", orgId)
      .in("project_id", ids)
      .range(0, 9999),
    supabase
      .from("pathway_snapshots")
      .select(
        "snapshot_date, programme_id, capability_id, outcome_id, benefit_id, rag, is_complete, due_in_fy, realised_value, fy_profile_value",
      )
      .eq("organisation_id", orgId)
      .order("snapshot_date")
      .range(0, 49999),
    supabase
      .from("capabilities")
      .select("programme_id, forecast_date, target_date, status")
      .eq("organisation_id", orgId)
      .is("archived_at", null),
    supabase.from("outcomes").select("programme_id, target_date, status").eq("organisation_id", orgId),
    supabase
      .from("committee_packs")
      .select("meeting_date, title")
      .eq("organisation_id", orgId)
      .range(0, 499),
  ]);
  return {
    money: unwrap(money, "Loading monthly spend").map((row) => ({
      projectId: row.project_id,
      month: row.period_month.slice(0, 7),
      kind: row.kind,
      amount: Number(row.amount),
    })),
    tasks: unwrap(tasks, "Loading tasks").map((row) => ({
      projectId: row.project_id ?? "",
      finish: row.finish_date,
      status: row.status,
      doneAt: row.done_at,
    })),
    risks: unwrap(risks, "Loading risks").map((row) => ({
      projectId: row.project_id,
      score: Number(row.score ?? 0),
      createdAt: row.created_at,
      closedAt: row.closed_at,
      status: row.status,
    })),
    pathway: unwrap(pathway, "Loading benefits history").map((row) => ({
      date: row.snapshot_date,
      programmeId: row.programme_id,
      item: row.capability_id ?? row.outcome_id ?? row.benefit_id ?? "",
      kind: row.capability_id ? "capability" : row.outcome_id ? "outcome" : "benefit",
      rag: toHealth(row.rag),
      complete: row.is_complete,
      dueInFy: row.due_in_fy,
      realised: row.realised_value === null ? null : Number(row.realised_value),
      profile: row.fy_profile_value === null ? null : Number(row.fy_profile_value),
    })),
    pathwayDates: [
      ...unwrap(capabilities, "Loading capabilities").map((row) => ({
        kind: "capability" as const,
        programmeId: row.programme_id,
        date: row.forecast_date ?? row.target_date,
        done: row.status === "accepted",
      })),
      ...unwrap(outcomes, "Loading outcomes").map((row) => ({
        kind: "outcome" as const,
        programmeId: row.programme_id,
        date: row.target_date,
        done: row.status === "achieved",
      })),
    ],
    committees: unwrap(packs, "Loading committee dates").map((row) => ({
      date: row.meeting_date,
      title: row.title ?? "Committee",
    })),
  };
}

// ---- Pure building ------------------------------------------------------------------

export interface ChartPoint {
  month: string; // YYYY-MM
  label: string; // "Sep 26"
  forecast: boolean; // after the current month
  values: Partial<Record<SeriesKey, number | undefined>>;
}

export interface ChartMarker {
  month: string;
  date: string;
  label: string;
  kind: "milestone" | "gate" | "committee";
}

export interface ProgressChartData {
  points: ChartPoint[];
  currentMonth: string;
  /** Today's value per series (current month), for the chips. */
  current: Partial<Record<SeriesKey, number | undefined>>;
  /** Series with no underlying records are hidden (e.g. pathway before BP2 data exists). */
  available: Set<SeriesKey>;
  markers: ChartMarker[];
  /** Spend minus milestones in points at the current month, when over 15. */
  gap: number | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (month: string) =>
  `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(2, 4)}`;

export const addMonths = (month: string, n: number) => {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7)) - 1 + n;
  const year = y + Math.floor(m / 12),
    mm = ((m % 12) + 12) % 12;
  return `${year}-${String(mm + 1).padStart(2, "0")}`;
};

/** First month (YYYY-MM) of the financial year containing `month`. */
export function fyStart(month: string, startMonth: number) {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7));
  return `${m < startMonth ? y - 1 : y}-${String(startMonth).padStart(2, "0")}`;
}

const monthEnd = (month: string) => `${addMonths(month, 1)}-01`; // exclusive bound
const pct = (part: number, whole: number) => (whole > 0 ? Math.min(100, (100 * part) / whole) : undefined);
const round1 = (value: number | undefined) => (value === undefined ? undefined : Math.round(value * 10) / 10);

/** Months shown for a range: FY = the current FY; 12m = trailing year; all = earliest record to FY end. */
export function rangeMonths(range: ChartRange, today: string, fyStartMonth: number, earliest?: string) {
  const current = today.slice(0, 7);
  const start = fyStart(current, fyStartMonth);
  const end = addMonths(start, 11);
  const first = range === "fy" ? start : range === "12m" ? addMonths(current, -11) : earliest && earliest < start ? earliest : start;
  const last = range === "12m" ? current : end;
  const months: string[] = [];
  for (let m = first; m <= last && months.length < 120; m = addMonths(m, 1)) months.push(m);
  return months;
}

export interface BuildInput {
  inputs: ProgressInputs;
  milestones: ChartMilestone[];
  history: PortfolioSnapshot[];
  projectHistory: ProjectSnapshot[];
  /** Live % of active projects green, from the health views. */
  liveGreen: number;
  programmeIds: Set<string> | null;
  today: string;
  fyStartMonth: number;
  range: ChartRange;
}

export function buildProgressChart(input: BuildInput): ProgressChartData {
  const { inputs, milestones, history, projectHistory, today, fyStartMonth } = input;
  const currentMonth = today.slice(0, 7);
  const inProgramme = (id: string | null) => !input.programmeIds || (id !== null && input.programmeIds.has(id));
  const pathway = inputs.pathway.filter((row) => inProgramme(row.programmeId));
  const earliestCandidates = [
    ...inputs.money.map((row) => row.month),
    ...history.map((row) => row.date.slice(0, 7)),
    ...milestones.map((row) => row.baselineDate.slice(0, 7)),
  ].sort();
  const months = rangeMonths(input.range, today, fyStartMonth, earliestCandidates[0]);
  const available = new Set<SeriesKey>();

  // Money by month and kind.
  const money = new Map<string, { budget: number; actual: number; forecast: number }>();
  for (const row of inputs.money) {
    const cell = money.get(row.month) ?? { budget: 0, actual: 0, forecast: 0 };
    cell[row.kind] += row.amount;
    money.set(row.month, cell);
  }
  const fyMonths = (month: string) => {
    const start = fyStart(month, fyStartMonth);
    return Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  };
  if ([...money.values()].some((cell) => cell.budget)) available.add("plan");
  if ([...money.values()].some((cell) => cell.actual || cell.forecast)) available.add("spend");

  // Pathway: the last snapshot per item in each month.
  const pathwayByMonth = new Map<string, Map<string, (typeof pathway)[number]>>();
  for (const row of pathway) {
    const key = row.date.slice(0, 7);
    const bucket = pathwayByMonth.get(key) ?? new Map();
    bucket.set(row.item, row);
    pathwayByMonth.set(key, bucket);
  }
  if (pathway.some((row) => row.kind === "capability")) available.add("capabilities").add("capabilitiesGreen");
  if (pathway.some((row) => row.kind === "outcome")) available.add("outcomes").add("outcomesGreen");
  if (pathway.some((row) => row.kind === "benefit")) available.add("benefits").add("benefitsGreen");
  const latestPathwayMonth = [...pathwayByMonth.keys()].sort().pop();

  // Project snapshots: the last per project in each month.
  const projectByMonth = new Map<string, Map<string, ProjectSnapshot>>();
  for (const row of [...projectHistory].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = row.date.slice(0, 7);
    const bucket = projectByMonth.get(key) ?? new Map();
    bucket.set(row.projectId, row);
    projectByMonth.set(key, bucket);
  }
  if (projectHistory.length) ["schedule", "financial", "effort", "issue", "benefit"].forEach((k) => available.add(k as SeriesKey));
  const greenByMonth = new Map(history.map((row) => [row.date.slice(0, 7), row.percentOnTrack]));
  available.add("green");

  const liveTasks = inputs.tasks.filter((task) => task.status !== "cancelled" && task.finish);
  if (liveTasks.length) available.add("tasks");
  if (milestones.length) available.add("milestones");
  if (inputs.risks.length) available.add("risks");

  const points: ChartPoint[] = months.map((month) => {
    const forecast = month > currentMonth;
    const end = monthEnd(month);
    const fy = fyMonths(month);
    const fyFirst = fy[0] as string,
      fyLast = fy[11] as string;
    const upTo = fy.filter((m) => m <= month);
    const values: Partial<Record<SeriesKey, number | undefined>> = {};

    // Plan and spend: cumulative from FY start over the FY budget.
    const fyBudget = fy.reduce((sum, m) => sum + (money.get(m)?.budget ?? 0), 0);
    if (fyBudget > 0) {
      values.plan = pct(upTo.reduce((sum, m) => sum + (money.get(m)?.budget ?? 0), 0), fyBudget);
      const spent = upTo.reduce(
        (sum, m) => sum + (m <= currentMonth ? (money.get(m)?.actual ?? 0) : (money.get(m)?.forecast ?? 0)),
        0,
      );
      values.spend = pct(spent, fyBudget);
    }

    // Tasks done ÷ tasks due this FY; forecast from the run rate so far.
    const dueTasks = liveTasks.filter((task) => (task.finish as string).slice(0, 7) >= fyFirst && (task.finish as string).slice(0, 7) <= fyLast);
    if (dueTasks.length) {
      const doneBy = (bound: string) => dueTasks.filter((task) => task.status === "done" && task.doneAt && task.doneAt < bound).length;
      if (!forecast) values.tasks = pct(doneBy(end), dueTasks.length);
      else {
        const elapsed = Math.max(1, fy.filter((m) => m <= currentMonth).length);
        const doneNow = doneBy(monthEnd(currentMonth));
        const ahead = fy.filter((m) => m > currentMonth && m <= month).length;
        values.tasks = pct(doneNow + (doneNow / elapsed) * ahead, dueTasks.length);
      }
    }

    // Milestones signed off ÷ baselined this FY; forecast from forecast dates.
    const baselined = milestones.filter((m) => m.baselineDate.slice(0, 7) >= fyFirst && m.baselineDate.slice(0, 7) <= fyLast);
    if (baselined.length) {
      const landed = baselined.filter((m) =>
        forecast ? (m.actualDate ?? m.forecastDate) < end : m.actualDate !== null && m.actualDate < end,
      ).length;
      values.milestones = pct(landed, baselined.length);
    }

    // Projects green: month-end snapshot, live for the current month.
    if (month === currentMonth) values.green = input.liveGreen;
    else if (!forecast && greenByMonth.get(month) !== undefined) values.green = greenByMonth.get(month);

    // Red risks open at month end.
    if (!forecast && inputs.risks.length) {
      values.risks = inputs.risks.filter(
        (risk) => risk.score >= 15 && risk.createdAt < end && (risk.closedAt === null ? risk.status === "open" : risk.closedAt >= end),
      ).length;
    }

    // Health by dimension: % green of the month-end project snapshots.
    const snaps = projectByMonth.get(month);
    if (!forecast && snaps?.size) {
      const list = [...snaps.values()];
      for (const key of ["schedule", "financial", "effort", "issue", "benefit"] as const)
        values[key] = pct(list.filter((row) => row[key] === "On Track").length, list.length);
    }

    // Benefits chain from pathway_snapshots.
    const bucket = pathwayByMonth.get(month);
    if (!forecast && bucket) {
      const rows = [...bucket.values()];
      for (const [kind, key, greenKey] of [
        ["capability", "capabilities", "capabilitiesGreen"],
        ["outcome", "outcomes", "outcomesGreen"],
      ] as const) {
        const items = rows.filter((row) => row.kind === kind);
        const due = items.filter((row) => row.dueInFy);
        values[key] = pct(due.filter((row) => row.complete).length, due.length);
        values[greenKey] = pct(items.filter((row) => row.rag === "On Track").length, items.length);
      }
      const benefits = rows.filter((row) => row.kind === "benefit");
      const profile = benefits.reduce((sum, row) => sum + (row.profile ?? 0), 0);
      values.benefits = pct(benefits.reduce((sum, row) => sum + (row.realised ?? 0), 0), profile);
      values.benefitsGreen = pct(benefits.filter((row) => row.rag === "On Track").length, benefits.length);
    }
    // Capability and outcome forecasts: the latest recorded position plus items forecast to land.
    if (forecast && latestPathwayMonth) {
      const latest = [...(pathwayByMonth.get(latestPathwayMonth)?.values() ?? [])];
      for (const [kind, key] of [
        ["capability", "capabilities"],
        ["outcome", "outcomes"],
      ] as const) {
        const due = latest.filter((row) => row.kind === kind && row.dueInFy);
        if (!due.length) continue;
        const done = due.filter((row) => row.complete).length;
        const landing = inputs.pathwayDates.filter(
          (row) => row.kind === kind && !row.done && inProgramme(row.programmeId) && row.date && row.date >= `${currentMonth}-01` && row.date < end && row.date.slice(0, 7) <= fyLast,
        ).length;
        values[key] = pct(done + landing, due.length);
      }
    }

    for (const key of Object.keys(values) as SeriesKey[]) values[key] = round1(values[key]);
    return { month, label: monthLabel(month), forecast, values };
  });

  const current = points.find((point) => point.month === currentMonth)?.values ?? {};
  const markers: ChartMarker[] = [
    ...milestones
      .filter((m) => m.reportToCommittee || m.type.toLowerCase() === "gate")
      .map((m) => ({
        month: (m.actualDate ?? m.forecastDate).slice(0, 7),
        date: m.actualDate ?? m.forecastDate,
        label: m.title,
        kind: m.type.toLowerCase() === "gate" ? ("gate" as const) : ("milestone" as const),
      })),
    ...inputs.committees.map((c) => ({ month: c.date.slice(0, 7), date: c.date, label: c.title, kind: "committee" as const })),
  ].filter((marker) => months.includes(marker.month));

  const lead = (current.spend ?? 0) - (current.milestones ?? 0);
  const gap = current.spend !== undefined && current.milestones !== undefined && lead > 15 ? Math.round(lead) : null;
  return { points, currentMonth, current, available, markers, gap };
}
