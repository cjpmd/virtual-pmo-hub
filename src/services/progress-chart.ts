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
  | "benefit"
  | "pathway";

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
  schedule: {
    key: "schedule",
    label: "Schedule",
    colour: "var(--series-dim-schedule)",
    unit: "percent",
  },
  financial: {
    key: "financial",
    label: "Financial",
    colour: "var(--series-dim-financial)",
    unit: "percent",
  },
  effort: { key: "effort", label: "Effort", colour: "var(--series-dim-effort)", unit: "percent" },
  issue: { key: "issue", label: "Issues", colour: "var(--series-dim-issue)", unit: "percent" },
  benefit: {
    key: "benefit",
    label: "Benefits health",
    colour: "var(--series-dim-benefit)",
    unit: "percent",
  },
  pathway: {
    key: "pathway",
    label: "Capabilities & outcomes",
    colour: "var(--series-capabilities)",
    unit: "percent",
  },
};

/** Chips shown for each tab, and which start switched on. */
export const TABS: Record<ChartTab, { label: string; chips: SeriesKey[]; on: SeriesKey[] }> = {
  overlay: {
    label: "Overlay",
    chips: [
      "plan",
      "spend",
      "tasks",
      "milestones",
      "green",
      "risks",
      "capabilities",
      "outcomes",
      "benefits",
    ],
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
    chips: [
      "capabilities",
      "outcomes",
      "benefits",
      "capabilitiesGreen",
      "outcomesGreen",
      "benefitsGreen",
    ],
    on: [
      "capabilities",
      "outcomes",
      "benefits",
      "capabilitiesGreen",
      "outcomesGreen",
      "benefitsGreen",
    ],
  },
  timeline: { label: "Timeline", chips: ["milestones"], on: ["milestones"] },
};

/** Presets for scope = "project" (project overview design): no health or risk lines. */
export type ProjectChartTab = "overlay" | "spend" | "delivery" | "benefits";
export const PROJECT_TABS: Record<
  ProjectChartTab,
  { label: string; chips: SeriesKey[]; on: SeriesKey[] }
> = {
  overlay: {
    label: "Overlay",
    chips: ["plan", "spend", "milestones", "tasks", "pathway"],
    on: ["plan", "spend", "milestones", "tasks"],
  },
  spend: { label: "Spend", chips: ["plan", "spend"], on: ["plan", "spend"] },
  delivery: {
    label: "Delivery",
    chips: ["plan", "milestones", "tasks"],
    on: ["plan", "milestones", "tasks"],
  },
  benefits: { label: "Benefits", chips: ["plan", "pathway"], on: ["plan", "pathway"] },
};

// ---- Inputs -------------------------------------------------------------------------

export interface ProgressInputs {
  money: Array<{
    projectId: string;
    month: string;
    kind: "budget" | "actual" | "forecast";
    amount: number;
  }>;
  tasks: Array<{
    projectId: string;
    finish: string | null;
    status: string | null;
    doneAt: string | null;
  }>;
  risks: Array<{
    projectId: string | null;
    score: number;
    createdAt: string;
    closedAt: string | null;
    status: string;
  }>;
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
  pathwayDates: Array<{
    kind: "capability" | "outcome";
    programmeId: string;
    date: string | null;
    done: boolean;
  }>;
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

export async function loadProgressInputs(
  orgId: string,
  projectIds: string[],
): Promise<ProgressInputs> {
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
    supabase
      .from("outcomes")
      .select("programme_id, target_date, status")
      .eq("organisation_id", orgId),
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
  kind: "milestone" | "gate" | "committee" | "start" | "baseline" | "finish";
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
  /** Project with no budget profile: the plan line is even phasing (start to baseline finish). */
  evenPhasing?: boolean;
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
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, (100 * part) / whole) : undefined;
const round1 = (value: number | undefined) =>
  value === undefined ? undefined : Math.round(value * 10) / 10;

/** Months shown for a range: FY = the current FY; 12m = trailing year; all = earliest record to FY end. */
export function rangeMonths(
  range: ChartRange,
  today: string,
  fyStartMonth: number,
  earliest?: string,
) {
  const current = today.slice(0, 7);
  const start = fyStart(current, fyStartMonth);
  const end = addMonths(start, 11);
  const first =
    range === "fy"
      ? start
      : range === "12m"
        ? addMonths(current, -11)
        : earliest && earliest < start
          ? earliest
          : start;
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
  /** Red-risk threshold from the organisation's risk bands; 15 when unset. */
  redRiskMinScore?: number;
  /**
   * scope = "project": plot the project's own window (start to the later of baseline and
   * forecast finish) with every series as % of its whole-project plan instead of the year's.
   */
  project?: ProjectWindow | undefined;
}

export interface ProjectWindow {
  startDate: string | null;
  baselineFinishDate: string | null;
  forecastFinishDate: string | null;
  /** Approved budget: spend is plotted as % of it. */
  budget: number;
  /** Latest closed month (YYYY-MM): later months' spend forecast comes from forecast values. */
  actualsThrough: string | null;
  /** Closed projects draw no forecast lines. */
  closed: boolean;
}

/** Months a project chart covers: start month to the later of baseline and forecast finish. */
export function projectMonths(window: ProjectWindow, today: string) {
  const ends = [window.baselineFinishDate, window.forecastFinishDate]
    .filter((d): d is string => !!d)
    .map((d) => d.slice(0, 7))
    .sort();
  const first = (window.startDate ?? today).slice(0, 7);
  const last = ends.at(-1) ?? today.slice(0, 7);
  const months: string[] = [];
  for (let m = first; m <= last && months.length < 120; m = addMonths(m, 1)) months.push(m);
  return months.length ? months : [today.slice(0, 7)];
}

/** Start, baseline finish and (open projects only) forecast finish, for the project chart. */
function projectMarkers(window: ProjectWindow): ChartMarker[] {
  const mark = (date: string | null, label: string, kind: ChartMarker["kind"]) =>
    date ? [{ month: date.slice(0, 7), date, label, kind }] : [];
  return [
    ...mark(window.startDate, "Start", "start"),
    ...mark(window.baselineFinishDate, "Baseline finish", "baseline"),
    ...(window.closed ? [] : mark(window.forecastFinishDate, "Forecast finish", "finish")),
  ];
}

export function buildProgressChart(input: BuildInput): ProgressChartData {
  const { inputs, milestones, history, projectHistory, today, fyStartMonth } = input;
  const currentMonth = today.slice(0, 7);
  const inProgramme = (id: string | null) =>
    !input.programmeIds || (id !== null && input.programmeIds.has(id));
  const pathway = inputs.pathway.filter((row) => inProgramme(row.programmeId));
  const earliestCandidates = [
    ...inputs.money.map((row) => row.month),
    ...history.map((row) => row.date.slice(0, 7)),
    ...milestones.map((row) => row.baselineDate.slice(0, 7)),
  ].sort();
  const project = input.project;
  const months = project
    ? projectMonths(project, today)
    : rangeMonths(input.range, today, fyStartMonth, earliestCandidates[0]);
  const available = new Set<SeriesKey>();

  // Money by month and kind.
  const money = new Map<string, { budget: number; actual: number; forecast: number }>();
  for (const row of inputs.money) {
    const cell = money.get(row.month) ?? { budget: 0, actual: 0, forecast: 0 };
    cell[row.kind] += row.amount;
    money.set(row.month, cell);
  }
  // A project with no budget profile gets an even plan from its start to its baseline finish,
  // so spend still has something to be measured against.
  const evenPhasing =
    !!project &&
    project.budget > 0 &&
    !!project.startDate &&
    !!project.baselineFinishDate &&
    ![...money.values()].some((cell) => cell.budget);
  if (evenPhasing && project?.startDate && project.baselineFinishDate) {
    const span: string[] = [];
    const last = project.baselineFinishDate.slice(0, 7);
    for (let m = project.startDate.slice(0, 7); m <= last && span.length < 120; m = addMonths(m, 1))
      span.push(m);
    for (const m of span) {
      const cell = money.get(m) ?? { budget: 0, actual: 0, forecast: 0 };
      cell.budget += project.budget / span.length;
      money.set(m, cell);
    }
  }

  // The plan period each value is measured against: the financial year, or for a project its
  // whole life (every month with money, plus the chart window).
  const projectPlan = project ? [...new Set([...months, ...money.keys()])].sort() : undefined;
  const fyMonths = (month: string) => {
    if (projectPlan) return projectPlan;
    const start = fyStart(month, fyStartMonth);
    return Array.from({ length: 12 }, (_, i) => addMonths(start, i));
  };
  const inPlan = (ym: string, first: string, last: string) =>
    project ? true : ym >= first && ym <= last;
  if ([...money.values()].some((cell) => cell.budget)) available.add("plan");
  if (
    [...money.values()].some((cell) => cell.actual || cell.forecast) &&
    (!project || project.budget > 0)
  )
    available.add("spend");

  // Pathway: the last snapshot per item in each month.
  const pathwayByMonth = new Map<string, Map<string, (typeof pathway)[number]>>();
  for (const row of pathway) {
    const key = row.date.slice(0, 7);
    const bucket = pathwayByMonth.get(key) ?? new Map();
    bucket.set(row.item, row);
    pathwayByMonth.set(key, bucket);
  }
  if (pathway.some((row) => row.kind === "capability"))
    available.add("capabilities").add("capabilitiesGreen");
  if (pathway.some((row) => row.kind === "outcome")) available.add("outcomes").add("outcomesGreen");
  if (pathway.some((row) => row.kind === "benefit")) available.add("benefits").add("benefitsGreen");
  if (project && pathway.some((row) => row.kind !== "benefit")) available.add("pathway");
  const latestPathwayMonth = [...pathwayByMonth.keys()].sort().pop();

  // Project snapshots: the last per project in each month.
  const projectByMonth = new Map<string, Map<string, ProjectSnapshot>>();
  for (const row of [...projectHistory].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = row.date.slice(0, 7);
    const bucket = projectByMonth.get(key) ?? new Map();
    bucket.set(row.projectId, row);
    projectByMonth.set(key, bucket);
  }
  if (projectHistory.length)
    ["schedule", "financial", "effort", "issue", "benefit"].forEach((k) =>
      available.add(k as SeriesKey),
    );
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

    // Plan and spend: cumulative from FY start over the FY budget. A project's spend is over its
    // approved budget and counts actuals only for closed months (matching spent to date in
    // v_project_financials); its forecast months add forecast values after the last closed month.
    const fyBudget = fy.reduce((sum, m) => sum + (money.get(m)?.budget ?? 0), 0);
    const spendBase = project ? project.budget : fyBudget;
    const closedTo = project ? (project.actualsThrough ?? "") : currentMonth;
    const monthSpend = (m: string) => {
      const cell = money.get(m);
      if (!project) return m <= currentMonth ? (cell?.actual ?? 0) : (cell?.forecast ?? 0);
      if (m <= closedTo) return cell?.actual ?? 0;
      return forecast ? (cell?.forecast ?? 0) : 0;
    };
    if (fyBudget > 0)
      values.plan = pct(
        upTo.reduce((sum, m) => sum + (money.get(m)?.budget ?? 0), 0),
        fyBudget,
      );
    if (spendBase > 0) {
      const spent = upTo.reduce((sum, m) => sum + monthSpend(m), 0);
      values.spend = pct(spent, spendBase);
    }

    // Tasks done ÷ tasks due this FY; forecast from the run rate so far.
    const dueTasks = liveTasks.filter((task) =>
      inPlan((task.finish as string).slice(0, 7), fyFirst, fyLast),
    );
    if (dueTasks.length) {
      const doneBy = (bound: string) =>
        dueTasks.filter((task) => task.status === "done" && task.doneAt && task.doneAt < bound)
          .length;
      if (!forecast) values.tasks = pct(doneBy(end), dueTasks.length);
      else {
        const elapsed = Math.max(1, fy.filter((m) => m <= currentMonth).length);
        const doneNow = doneBy(monthEnd(currentMonth));
        const ahead = fy.filter((m) => m > currentMonth && m <= month).length;
        values.tasks = pct(doneNow + (doneNow / elapsed) * ahead, dueTasks.length);
      }
    }

    // Milestones signed off ÷ baselined this FY; forecast from forecast dates.
    const baselined = milestones.filter((m) => inPlan(m.baselineDate.slice(0, 7), fyFirst, fyLast));
    if (baselined.length) {
      const landed = baselined.filter((m) =>
        forecast
          ? (m.actualDate ?? m.forecastDate) < end
          : m.actualDate !== null && m.actualDate < end,
      ).length;
      values.milestones = pct(landed, baselined.length);
    }

    // Projects green: month-end snapshot, live for the current month.
    if (month === currentMonth) values.green = input.liveGreen;
    else if (!forecast && greenByMonth.get(month) !== undefined)
      values.green = greenByMonth.get(month);

    // Red risks open at month end.
    if (!forecast && inputs.risks.length) {
      values.risks = inputs.risks.filter(
        (risk) =>
          risk.score >= (input.redRiskMinScore ?? 15) &&
          risk.createdAt < end &&
          (risk.closedAt === null ? risk.status === "open" : risk.closedAt >= end),
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
      values.benefits = pct(
        benefits.reduce((sum, row) => sum + (row.realised ?? 0), 0),
        profile,
      );
      values.benefitsGreen = pct(
        benefits.filter((row) => row.rag === "On Track").length,
        benefits.length,
      );
    }
    // Project: capabilities and outcomes as one line, complete ÷ all linked (whole life).
    if (project && !forecast && bucket) {
      const items = [...bucket.values()].filter((row) => row.kind !== "benefit");
      values.pathway = pct(items.filter((row) => row.complete).length, items.length);
    }
    if (project && forecast && latestPathwayMonth) {
      const items = [...(pathwayByMonth.get(latestPathwayMonth)?.values() ?? [])].filter(
        (row) => row.kind !== "benefit",
      );
      const landing = inputs.pathwayDates.filter(
        (row) => !row.done && row.date && row.date >= `${currentMonth}-01` && row.date < end,
      ).length;
      if (items.length)
        values.pathway = pct(items.filter((row) => row.complete).length + landing, items.length);
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
          (row) =>
            row.kind === kind &&
            !row.done &&
            inProgramme(row.programmeId) &&
            row.date &&
            row.date >= `${currentMonth}-01` &&
            row.date < end &&
            row.date.slice(0, 7) <= fyLast,
        ).length;
        values[key] = pct(done + landing, due.length);
      }
    }

    for (const key of Object.keys(values) as SeriesKey[]) values[key] = round1(values[key]);
    // A closed project has nothing left to forecast.
    if (project?.closed && forecast)
      return { month, label: monthLabel(month), forecast, values: {} };
    return { month, label: monthLabel(month), forecast, values };
  });

  // A finished project's window can end before today: its chips show the last month plotted.
  const current =
    points.find((point) => point.month === currentMonth)?.values ??
    (project && (points.at(-1)?.month ?? "") < currentMonth ? points.at(-1)?.values : undefined) ??
    {};
  const markers: ChartMarker[] = [
    ...milestones
      .filter((m) => m.reportToCommittee || m.type.toLowerCase() === "gate")
      .map((m) => ({
        month: (m.actualDate ?? m.forecastDate).slice(0, 7),
        date: m.actualDate ?? m.forecastDate,
        label: m.title,
        kind: m.type.toLowerCase() === "gate" ? ("gate" as const) : ("milestone" as const),
      })),
    ...(project ? [] : inputs.committees).map((c) => ({
      month: c.date.slice(0, 7),
      date: c.date,
      label: c.title,
      kind: "committee" as const,
    })),
    ...(project ? projectMarkers(project) : []),
  ].filter((marker) => months.includes(marker.month));

  const lead = (current.spend ?? 0) - (current.milestones ?? 0);
  const gap =
    current.spend !== undefined && current.milestones !== undefined && lead > 15
      ? Math.round(lead)
      : null;
  return { points, currentMonth, current, available, markers, gap, evenPhasing };
}
