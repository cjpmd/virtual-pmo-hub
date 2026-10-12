// Delivery assurance: what the latest submitted status report declares against what the
// evidence shows. Every judgement here (divergence, its kind and length, alerts, justification,
// report due dates, risk score) comes from v_project_divergence; this file only joins the
// project names on and reshapes rows for the screens.
import type { Health } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { sharedProjectList, type ProjectSummary } from "./hierarchy";
import { toHealth, type ProjectStateLabel } from "./labels";
import { unwrap } from "./service-error";
import { insertRow } from "./write";

export type DivergenceKind = "optimistic_at_submission" | "evidence_moved";

export interface AssuranceRow {
  projectId: string;
  code: string;
  name: string;
  programme: string;
  programmeId: string | null;
  state: ProjectStateLabel;
  /** Overall RAG of the latest submitted report; null when the project has never reported. */
  declared: Health | null;
  /** Evidenced overall RAG (v_project_health.computed_overall). */
  evidenced: Health;
  divergent: boolean;
  divergenceKind: DivergenceKind | null;
  divergenceDays: number;
  divergenceAlert: boolean;
  justified: boolean;
  justification: string | null;
  justificationAt: string | null;
  latestReportId: string | null;
  /** Divergent at the end of last month; null when there was nothing to compare. */
  divergentPrevMonthEnd: boolean | null;
  lastReportDate: string | null;
  nextReportDue: string | null;
  reportOverdue: boolean;
  forecastFinishDate: string | null;
  finishVsBaselineDays: number | null;
  riskScore: number;
}

const DIVERGENCE_COLUMNS =
  "project_id, declared, evidenced, divergent, divergence_kind, divergence_days, divergence_alert, justified, justification, justification_at, latest_report_id, divergent_prev_month_end, last_report_date, next_report_due, report_overdue, finish_vs_baseline_days, risk_score";

type DivergenceRow = {
  declared: Parameters<typeof toHealth>[0];
  evidenced: Parameters<typeof toHealth>[0];
  divergent: boolean | null;
  divergence_kind: string | null;
  divergence_days: number | null;
  divergence_alert: boolean | null;
  justified: boolean | null;
  justification: string | null;
  justification_at: string | null;
  latest_report_id: string | null;
  divergent_prev_month_end: boolean | null;
  last_report_date: string | null;
  next_report_due: string | null;
  report_overdue: boolean | null;
  finish_vs_baseline_days: number | null;
  risk_score: number | null;
};

const toAssuranceRow = (
  project: ProjectSummary,
  row: DivergenceRow,
  forecastFinishDate: string | null,
): AssuranceRow => ({
  projectId: project.id,
  code: project.code,
  name: project.name,
  programme: project.programmeId ? project.programmeName : "Direct",
  programmeId: project.programmeId,
  state: project.state,
  declared: row.declared ? toHealth(row.declared) : null,
  evidenced: toHealth(row.evidenced),
  divergent: Boolean(row.divergent),
  divergenceKind: (row.divergence_kind as DivergenceKind | null) ?? null,
  divergenceDays: row.divergence_days ?? 0,
  divergenceAlert: Boolean(row.divergence_alert),
  justified: Boolean(row.justified),
  justification: row.justification,
  justificationAt: row.justification_at,
  latestReportId: row.latest_report_id,
  divergentPrevMonthEnd: row.divergent_prev_month_end,
  lastReportDate: row.last_report_date,
  nextReportDue: row.next_report_due,
  reportOverdue: Boolean(row.report_overdue),
  forecastFinishDate,
  finishVsBaselineDays: row.finish_vs_baseline_days,
  riskScore: row.risk_score ?? 0,
});

/**
 * One project's row, for the project header. Reads only that project's v_project_divergence row
 * (the project page already has the project itself), so it doesn't reload every project.
 */
export async function loadProjectAssurance(
  orgId: string,
  project: ProjectSummary,
): Promise<AssuranceRow | null> {
  const { data, error } = await supabase
    .from("v_project_divergence")
    .select(DIVERGENCE_COLUMNS)
    .eq("organisation_id", orgId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (error) unwrap({ data, error }, "Loading assurance");
  return data ? toAssuranceRow(project, data, project.health.forecastFinishDate) : null;
}

/** One row per non-archived project, highest assurance risk first. */
export async function loadAssurance(orgId: string): Promise<AssuranceRow[]> {
  // The project list is a shared read (the overview loads it too) and already carries
  // v_project_health.forecast_finish_date, so no second health read here.
  const projects = await sharedProjectList(orgId);
  const divergence = await supabase
    .from("v_project_divergence")
    .select(DIVERGENCE_COLUMNS)
    .eq("organisation_id", orgId);
  const byId = new Map(unwrap(divergence, "Loading assurance").map((row) => [row.project_id, row]));
  return projects
    .flatMap((project): AssuranceRow[] => {
      const row = byId.get(project.id);
      if (!row) return [];
      return [toAssuranceRow(project, row, project.health.forecastFinishDate)];
    })
    .sort((a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name));
}

/** The register and roll-ups leave out proposed projects; "live" also leaves out closed ones. */
export const assuredRows = (rows: AssuranceRow[]) => rows.filter((r) => r.state !== "Proposed");
export const liveRows = (rows: AssuranceRow[]) =>
  assuredRows(rows).filter((r) => r.state !== "Closed");

/** Wording for a divergence, by kind (always with the day count, never colour alone). */
export function divergenceText(row: Pick<AssuranceRow, "divergenceKind" | "divergenceDays">) {
  const days = `${row.divergenceDays} day${row.divergenceDays === 1 ? "" : "s"}`;
  return row.divergenceKind === "optimistic_at_submission"
    ? `Report declared better than the evidence (${days})`
    : `Evidence has worsened since the last report (${days}). Next report should reflect this.`;
}

/**
 * Report vs data gaps: open projects whose latest report is better than the evidence, now and at
 * the end of last month. previous is null when no project had anything to compare then.
 */
export function reportGapCounts(rows: AssuranceRow[]) {
  const open = liveRows(rows);
  const compared = open.filter((r) => r.divergentPrevMonthEnd !== null);
  return {
    current: open.filter((r) => r.divergent).length,
    previous: compared.length ? compared.filter((r) => r.divergentPrevMonthEnd).length : null,
  };
}

/**
 * Records why the latest report is better than the evidence. The database ties it to that report
 * and freezes the declared/evidenced ratings and divergence days itself (a trigger, like the
 * tenant guard), so the "at the time" columns sent here are placeholders it overwrites.
 */
export async function addDivergenceJustification(row: AssuranceRow, text: string) {
  if (!row.latestReportId) throw new Error("There is no submitted report to justify.");
  return insertRow(
    "divergence_justifications",
    {
      project_id: row.projectId,
      status_report_id: row.latestReportId,
      text: text.trim(),
      declared_at_time: "not_set",
      evidenced_at_time: "not_set",
      divergence_days_at_time: row.divergenceDays,
    },
    "Saving the justification",
  );
}
