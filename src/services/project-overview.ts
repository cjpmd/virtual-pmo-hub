// One-call project overview (Stage 2: get_project_overview). Maps the RPC's raw rows into the
// shapes the shared overview builders consume with scope = "project" (overview.ts,
// overview-panels.ts, progress-chart.ts). Health, divergence, slip and bands are read as the
// database recorded them; nothing here works a RAG out.
import { supabase } from "@/integrations/supabase/client";
import type { Health } from "@/data/types";
import { toHealth } from "./labels";
import { ServiceError } from "./service-error";
import type { ChartMilestone, ProgressInputs } from "./progress-chart";
import type { ProjectSnapshot } from "./trends";
import {
  toCommittee,
  toMoneyRow,
  toPathwayDate,
  toPathwayRow,
  toProjectSnapshot,
  toRiskRow,
  type RpcMoneyRow,
  type RpcPathwayMonth,
  type RpcPathwayTarget,
  type RpcProjectSnap,
  type RpcRisk,
  type RpcTaskMonth,
} from "./portfolio-overview-rpc";

type RagText = Parameters<typeof toHealth>[0];
const rag = (value: string | null | undefined): Health | null =>
  value ? toHealth(value as RagText) : null;

export interface ProjectOverviewMilestone extends ChartMilestone {
  ref: string | null;
  phaseName: string | null;
  status: string;
  slipDays: number | null;
  slipBand: string | null;
  pastBaseline: boolean;
  updatedAt: string | null;
}

/** project_health_current: the stored copy of v_project_health and v_project_divergence. */
export interface ProjectOverviewHealth {
  overall: Health;
  declared: Health | null;
  evidenced: Health | null;
  divergent: boolean;
  divergenceKind: "optimistic_at_submission" | "evidence_moved" | null;
  divergenceDays: number | null;
  divergenceAlert: boolean;
  justified: boolean;
  lastReportDate: string | null;
  nextReportDue: string | null;
  reportOverdue: boolean;
  forecastFinishDate: string | null;
  forecastBasis: string | null;
  finishSlipHealth: Health | null;
  finishVsBaselineDays: number | null;
  milestonesAfterBaselineFinish: number;
  computedAt: string | null;
}

export interface OpenRaidItem {
  kind: "risk" | "issue";
  id: string;
  ref: string | null;
  title: string;
  score: number | null;
  severity: string | null;
  reviewDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectOverviewData {
  /** When the stored health was last refreshed. */
  asOf: string | null;
  today: string;
  fyStart: string;
  /** Latest closed financial month (YYYY-MM-01), or null when none is closed. */
  cutoffMonth: string | null;
  redRiskMinScore: number;
  project: {
    id: string;
    code: string;
    name: string;
    state: string;
    startDate: string | null;
    finishDate: string | null;
    baselineFinishDate: string | null;
    updatedAt: string | null;
  };
  health: ProjectOverviewHealth | null;
  milestones: ProjectOverviewMilestone[];
  financials: {
    budget: number;
    eac: number;
    variance: number;
    actualToDate: number;
    actualsThrough: string | null;
  } | null;
  /** Month-end budget / EAC / actuals (financial_forecast_history); empty until the first close. */
  forecastHistory: Array<{ month: string; budget: number; eac: number; actualToDate: number }>;
  projectHistory: ProjectSnapshot[];
  latestReport: { reportingDate: string; submittedAt: string | null; author: string | null } | null;
  openRaid: OpenRaidItem[];
  inputs: ProgressInputs;
}

/** The project_health_current columns the overview reads. */
interface RpcHealth {
  overall: string;
  declared: string | null;
  evidenced: string | null;
  divergent: boolean | null;
  divergence_kind: string | null;
  divergence_days: number | null;
  divergence_alert: boolean | null;
  justified: boolean | null;
  last_report_date: string | null;
  next_report_due: string | null;
  report_overdue: boolean | null;
  forecast_finish_date: string | null;
  forecast_basis: string | null;
  finish_slip_health: string | null;
  finish_vs_baseline_days: number | null;
  milestones_after_baseline_finish: number | null;
  computed_at: string | null;
}

interface RpcPayload {
  asOf: string | null;
  today: string;
  fyStart: string;
  cutoffMonth: string | null;
  redRiskMinScore: number;
  project: {
    id: string;
    code: string;
    name: string;
    state: string;
    start_date: string | null;
    finish_date: string | null;
    baseline_finish_date: string | null;
    updated_at: string | null;
  };
  health: RpcHealth | null;
  milestones: Array<{
    id: string;
    ref: string | null;
    title: string;
    type: string;
    phase_name: string | null;
    baseline_date: string;
    forecast_date: string;
    actual_date: string | null;
    status: string;
    slip_days: number | null;
    slip_band: string | null;
    past_baseline: boolean;
    report_to_committee: boolean;
    updated_at: string | null;
  }>;
  financials: {
    budget: number;
    eac: number;
    variance: number;
    actual_to_date: number;
    actuals_through: string | null;
  } | null;
  moneyByMonth: RpcMoneyRow[];
  forecastHistory: Array<{ month: string; budget: number; eac: number; actual_to_date: number }>;
  projectSnapshots: RpcProjectSnap[];
  latestReport: {
    reporting_date: string;
    submitted_at: string | null;
    author: string | null;
  } | null;
  openRaid: Array<{
    kind: "risk" | "issue";
    id: string;
    ref: string | null;
    title: string;
    score: number | null;
    severity: string | null;
    review_date: string | null;
    created_at: string;
    updated_at: string;
  }>;
  risks: RpcRisk[];
  tasksByMonth: RpcTaskMonth[];
  pathwayMonthEnd: RpcPathwayMonth[];
  pathwayTargets: RpcPathwayTarget[];
  committeeDates: Array<{ date: string; title: string | null }>;
}

/**
 * The RPC returns work items as monthly aggregates (due by finish month, done by done month).
 * These rows reproduce both counts so the chart builder can count them: `due` items per finish
 * month, of which the earliest-finishing are marked done in the months they were completed.
 */
export function expandTaskMonths(rows: RpcTaskMonth[]): ProgressInputs["tasks"] {
  const tasks: ProgressInputs["tasks"] = [];
  for (const row of [...rows].sort((a, b) => a.month.localeCompare(b.month)))
    for (let i = 0; i < row.due; i++)
      tasks.push({
        projectId: row.projectId,
        finish: `${row.month.slice(0, 7)}-15`,
        status: "todo",
        doneAt: null,
      });
  const doneMonths = [...rows]
    .sort((a, b) => a.month.localeCompare(b.month))
    .flatMap((row) => Array.from({ length: row.done }, () => `${row.month.slice(0, 7)}-15`));
  doneMonths.slice(0, tasks.length).forEach((doneAt, i) => {
    const task = tasks[i];
    if (task) {
      task.status = "done";
      task.doneAt = doneAt;
    }
  });
  return tasks;
}

const num = (value: number | null) => (value === null ? null : Number(value));

function toHealthRow(h: RpcHealth): ProjectOverviewHealth {
  const kind = h.divergence_kind;
  return {
    overall: toHealth(h.overall as RagText),
    declared: rag(h.declared),
    evidenced: rag(h.evidenced),
    divergent: h.divergent === true,
    divergenceKind: kind === "optimistic_at_submission" || kind === "evidence_moved" ? kind : null,
    divergenceDays: num(h.divergence_days),
    divergenceAlert: h.divergence_alert === true,
    justified: h.justified === true,
    lastReportDate: h.last_report_date,
    nextReportDue: h.next_report_due,
    reportOverdue: h.report_overdue === true,
    forecastFinishDate: h.forecast_finish_date,
    forecastBasis: h.forecast_basis,
    finishSlipHealth: rag(h.finish_slip_health),
    finishVsBaselineDays: num(h.finish_vs_baseline_days),
    milestonesAfterBaselineFinish: num(h.milestones_after_baseline_finish) ?? 0,
    computedAt: h.computed_at,
  };
}

/** Everything the project overview shows, in one call. Null when the project isn't visible. */
export async function getProjectOverviewData(
  projectId: string,
): Promise<ProjectOverviewData | null> {
  const { data, error } = await supabase.rpc("get_project_overview", { p_project: projectId });
  if (error)
    throw new ServiceError("unknown", "Loading the project overview failed.", {
      detail: error.message,
    });
  if (!data) return null;
  const rpc = data as unknown as RpcPayload;
  return {
    asOf: rpc.asOf,
    today: rpc.today,
    fyStart: rpc.fyStart,
    cutoffMonth: rpc.cutoffMonth,
    redRiskMinScore: rpc.redRiskMinScore,
    project: {
      id: rpc.project.id,
      code: rpc.project.code,
      name: rpc.project.name,
      state: rpc.project.state,
      startDate: rpc.project.start_date,
      finishDate: rpc.project.finish_date,
      baselineFinishDate: rpc.project.baseline_finish_date,
      updatedAt: rpc.project.updated_at,
    },
    health: rpc.health ? toHealthRow(rpc.health) : null,
    milestones: rpc.milestones.map((m) => ({
      id: m.id,
      ref: m.ref,
      title: m.title,
      type: m.type,
      phaseName: m.phase_name,
      baselineDate: m.baseline_date,
      forecastDate: m.forecast_date,
      actualDate: m.actual_date,
      status: m.status,
      slipDays: m.slip_days,
      slipBand: m.slip_band,
      pastBaseline: m.past_baseline,
      reportToCommittee: m.report_to_committee,
      updatedAt: m.updated_at,
    })),
    financials: rpc.financials && {
      budget: Number(rpc.financials.budget),
      eac: Number(rpc.financials.eac),
      variance: Number(rpc.financials.variance),
      actualToDate: Number(rpc.financials.actual_to_date),
      actualsThrough: rpc.financials.actuals_through,
    },
    forecastHistory: rpc.forecastHistory.map((row) => ({
      month: row.month.slice(0, 7),
      budget: Number(row.budget),
      eac: Number(row.eac),
      actualToDate: Number(row.actual_to_date),
    })),
    projectHistory: rpc.projectSnapshots.map(toProjectSnapshot),
    latestReport: rpc.latestReport && {
      reportingDate: rpc.latestReport.reporting_date,
      submittedAt: rpc.latestReport.submitted_at,
      author: rpc.latestReport.author,
    },
    openRaid: rpc.openRaid.map((row) => ({
      kind: row.kind,
      id: row.id,
      ref: row.ref,
      title: row.title,
      score: row.score,
      severity: row.severity,
      reviewDate: row.review_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    inputs: {
      money: rpc.moneyByMonth.map(toMoneyRow),
      tasks: expandTaskMonths(rpc.tasksByMonth),
      risks: rpc.risks.map(toRiskRow),
      pathway: rpc.pathwayMonthEnd.map(toPathwayRow),
      pathwayDates: rpc.pathwayTargets.map(toPathwayDate),
      committees: rpc.committeeDates.map(toCommittee),
    },
  };
}
