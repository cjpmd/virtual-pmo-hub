// One-call portfolio overview (docs/design/portfolio-overview-spec.md §6).
// get_portfolio_overview returns every figure the overview page needs as JSON; this service
// maps that JSON into the shapes the page's pure builders already consume, so the page makes
// a single RPC call instead of per-widget queries. Health is never computed here: every RAG
// comes from the database's snapshots and views, passed through toHealth.
import { supabase } from "@/integrations/supabase/client";
import type { Health } from "@/data/types";
import { toHealth } from "./labels";
import { ServiceError } from "./service-error";
import type { ProgressInputs } from "./progress-chart";
import type { ForecastPoint } from "./overview-panels";
import type { PortfolioSnapshot, ProjectSnapshot } from "./trends";

export interface OverviewRpcResult {
  inputs: ProgressInputs;
  forecasts: ForecastPoint[];
  history: PortfolioSnapshot[];
  projectHistory: ProjectSnapshot[];
  /** Latest data change across the scope, from the database — not the page load time. */
  asOf: string | null;
  /** The organisation's today (private.org_today), so the page and database agree. */
  today: string;
  cutoffMonth: string | null;
  redRiskMinScore: number;
}

// ---- RPC JSON row shapes -------------------------------------------------------------

interface RpcProjectSnap {
  project_id: string;
  snapshot_date: string;
  overall: string;
  schedule: string;
  financial: string;
  effort: string;
  issue: string;
  benefit: string;
}

interface RpcRollupSnap {
  snapshot_date: string;
  overall: string;
  metrics: Record<string, unknown> | null;
  portfolio_id: string | null;
  programme_id: string | null;
}

interface RpcMoneyRow {
  project_id: string;
  month: string;
  kind: "budget" | "actual" | "forecast";
  amount: number;
}

interface RpcTaskMonth {
  projectId: string;
  month: string;
  due: number;
  doneByDue: number;
  done: number;
}

interface RpcRisk {
  project_id: string | null;
  score: number | null;
  created_at: string;
  closed_at: string | null;
  status: string;
}

interface RpcPathwayMonth {
  snapshot_date: string;
  programme_id: string | null;
  capability_id: string | null;
  outcome_id: string | null;
  benefit_id: string | null;
  rag: string;
  is_complete: boolean;
  due_in_fy: boolean;
  realised_value: number | null;
  fy_profile_value: number | null;
}

interface RpcPathwayTarget {
  capability_id: string | null;
  outcome_id: string | null;
  target_date: string | null;
  status: string;
}

interface RpcForecast {
  project_id: string;
  month: string;
  budget: number;
  eac: number;
}

interface RpcPayload {
  asOf: string | null;
  today: string;
  fyStart: string;
  cutoffMonth: string | null;
  redRiskMinScore: number;
  portfolioSnapshots: RpcRollupSnap[];
  projectSnapshots: RpcProjectSnap[];
  moneyByMonth: RpcMoneyRow[];
  tasksByMonth: RpcTaskMonth[];
  risks: RpcRisk[];
  pathwayMonthEnd: RpcPathwayMonth[];
  pathwayTargets: RpcPathwayTarget[];
  forecastHistory: RpcForecast[];
  committeeDates: Array<{ date: string; title: string | null }>;
}

const metric = (metrics: Record<string, unknown> | null, key: string) => {
  const value = metrics?.[key];
  return typeof value === "number" ? value : undefined;
};

/**
 * The RPC returns task figures as monthly aggregates; the chart builder counts per-task rows.
 * These synthetic rows reproduce the same counts exactly: `due` tasks finishing mid-month,
 * of which `doneByDue` are done. (`done` — completions of tasks due in other months — is not
 * part of the chart's "done ÷ due this FY" series.)
 */
function expandTasks(rows: RpcTaskMonth[]): ProgressInputs["tasks"] {
  const tasks: ProgressInputs["tasks"] = [];
  for (const row of rows) {
    const finish = `${row.month}-15`;
    for (let i = 0; i < row.due; i++) {
      const done = i < row.doneByDue;
      tasks.push({
        projectId: row.projectId,
        finish,
        status: done ? "done" : "todo",
        doneAt: done ? finish : null,
      });
    }
  }
  return tasks;
}

/** The workspace the overview reads from (one per organisation today). */
export async function getWorkspaceId(orgId: string): Promise<string> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("id")
    .eq("organisation_id", orgId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new ServiceError("unavailable", "Loading the workspace failed.", error.message);
  if (!data) throw new ServiceError("not_found", "This organisation has no workspace yet.");
  return data.id;
}

/**
 * The whole overview in one call. Range stays 'all' so the chart's FY / 12m / all switcher
 * works from one cached result; the programme filter stays client-side for the same reason.
 */
export async function getPortfolioOverviewData(
  workspaceId: string,
  portfolioId: string,
): Promise<OverviewRpcResult> {
  const { data, error } = await supabase.rpc("get_portfolio_overview", {
    p_workspace: workspaceId,
    p_portfolio: portfolioId,
    p_range: "all",
  });
  if (error)
    throw new ServiceError("unavailable", "Loading the portfolio overview failed.", error.message);
  const rpc = data as unknown as RpcPayload;

  return {
    asOf: rpc.asOf,
    today: rpc.today,
    cutoffMonth: rpc.cutoffMonth,
    redRiskMinScore: rpc.redRiskMinScore,
    history: rpc.portfolioSnapshots.map((row) => ({
      date: row.snapshot_date,
      overall: toHealth(row.overall as Parameters<typeof toHealth>[0]),
      activeProjects: metric(row.metrics, "activeProjects"),
      budget: metric(row.metrics, "budget"),
      forecast: metric(row.metrics, "forecast"),
      spend: metric(row.metrics, "spend"),
      variance: metric(row.metrics, "variance"),
      percentOnTrack: metric(row.metrics, "percentOnTrack"),
      milestonesDue30: metric(row.metrics, "milestonesDue30"),
    })),
    projectHistory: rpc.projectSnapshots.map((row) => ({
      date: row.snapshot_date,
      projectId: row.project_id,
      overall: toHealth(row.overall as Parameters<typeof toHealth>[0]),
      schedule: toHealth(row.schedule as Parameters<typeof toHealth>[0]),
      financial: toHealth(row.financial as Parameters<typeof toHealth>[0]),
      effort: toHealth(row.effort as Parameters<typeof toHealth>[0]),
      issue: toHealth(row.issue as Parameters<typeof toHealth>[0]),
      benefit: toHealth(row.benefit as Parameters<typeof toHealth>[0]),
    })),
    forecasts: rpc.forecastHistory.map((row) => ({
      projectId: row.project_id,
      month: row.month.slice(0, 7),
      eac: Number(row.eac),
      budget: Number(row.budget),
    })),
    inputs: {
      money: rpc.moneyByMonth.map((row) => ({
        projectId: row.project_id,
        month: row.month.slice(0, 7),
        kind: row.kind,
        amount: Number(row.amount),
      })),
      tasks: expandTasks(rpc.tasksByMonth),
      risks: rpc.risks.map((row) => ({
        projectId: row.project_id,
        score: Number(row.score ?? 0),
        createdAt: row.created_at,
        closedAt: row.closed_at,
        status: row.status,
      })),
      pathway: rpc.pathwayMonthEnd.map((row) => ({
        date: row.snapshot_date,
        programmeId: row.programme_id,
        item: row.capability_id ?? row.outcome_id ?? row.benefit_id ?? "",
        kind: row.capability_id
          ? ("capability" as const)
          : row.outcome_id
            ? ("outcome" as const)
            : ("benefit" as const),
        rag: toHealth(row.rag as Parameters<typeof toHealth>[0]) as Health,
        complete: row.is_complete,
        dueInFy: row.due_in_fy,
        realised: row.realised_value === null ? null : Number(row.realised_value),
        profile: row.fy_profile_value === null ? null : Number(row.fy_profile_value),
      })),
      pathwayDates: rpc.pathwayTargets.map((row) => ({
        kind: row.capability_id ? ("capability" as const) : ("outcome" as const),
        programmeId: "", // not needed for counting; the chart filters by date and kind
        date: row.target_date,
        done: row.status === "accepted" || row.status === "achieved",
      })),
      committees: rpc.committeeDates.map((row) => ({
        date: row.date,
        title: row.title ?? "Committee",
      })),
    },
  };
}
