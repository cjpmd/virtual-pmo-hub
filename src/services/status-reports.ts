// Project status reports. A submitted report is a point-in-time judgement: the declared RAGs,
// override reasons and narrative are stored as submitted, and the database copies the
// evidenced RAGs from v_project_health on submit (status_reports_20_evidenced trigger), then
// freezes them. Nothing here edits a report after submission.
import type { Database, Json } from "@/integrations/supabase/types";
import type { Health, HealthDimension } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { todayIso } from "@/lib/today";
import { listPeople } from "./hierarchy";
import { healthLabel, toHealth } from "./labels";
import { unwrap } from "./service-error";
import { deleteWhere, insertRow } from "./write";

type Enums = Database["public"]["Enums"];
const healthValue = Object.fromEntries(
  Object.entries(healthLabel).map(([key, value]) => [value, key]),
) as Record<Health, Enums["health"]>;

export interface AiDraft {
  accomplished: string;
  planned: string;
  comments: string;
  exception: boolean;
}

export interface StatusReportView {
  id: string;
  ref: string;
  /** ISO date. */
  reportingDate: string;
  submitter: string;
  overall: Health;
  schedule: Health;
  financial: Health;
  effort: Health;
  issue: Health;
  evidencedOverall: Health | null;
  accomplished: string;
  planned: string;
  comments: string;
  overrideReasons: Partial<Record<HealthDimension, string>>;
  aiDraft?: AiDraft;
  isDraft: boolean;
  updatedAt: string;
  /** Legacy free-text decisions_needed. */
  legacyNotes: string;
  /** Linked decisions (status_report_decisions), in report order. */
  decisionIds: string[];
}

export async function listStatusReports(
  orgId: string,
  projectId: string,
): Promise<StatusReportView[]> {
  const [reports, people] = await Promise.all([
    supabase
      .from("status_reports")
      .select(
        "id, ref, status, updated_at, reporting_date, submitter_id, overall, schedule, financial, effort, issue, evidenced_overall, accomplished, planned, comments, decisions_needed, override_reasons, ai_draft, created_at, status_report_decisions(decision_id, sort_order)",
      )
      .eq("project_id", projectId)
      .order("reporting_date", { ascending: false })
      .order("created_at", { ascending: false }),
    listPeople(orgId),
  ]);
  const names = new Map(people.map((person) => [person.id, person.name]));
  return unwrap(reports, "Loading status reports").map((row) => {
    const draft = row.ai_draft as Partial<AiDraft> | null;
    return {
      id: row.id,
      ref: row.ref,
      reportingDate: row.reporting_date,
      submitter: (row.submitter_id && names.get(row.submitter_id)) || "Unknown",
      overall: toHealth(row.overall),
      schedule: toHealth(row.schedule),
      financial: toHealth(row.financial),
      effort: toHealth(row.effort),
      issue: toHealth(row.issue),
      evidencedOverall: row.evidenced_overall ? toHealth(row.evidenced_overall) : null,
      accomplished: row.accomplished ?? "",
      planned: row.planned ?? "",
      comments: row.comments ?? "",
      overrideReasons: (row.override_reasons ?? {}) as Partial<Record<HealthDimension, string>>,
      isDraft: row.status === "draft",
      updatedAt: row.updated_at,
      legacyNotes: row.decisions_needed ?? "",
      decisionIds: [...(row.status_report_decisions ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((link) => link.decision_id),
      ...(draft?.accomplished !== undefined && {
        aiDraft: {
          accomplished: draft.accomplished ?? "",
          planned: draft.planned ?? "",
          comments: draft.comments ?? "",
          exception: Boolean(draft.exception),
        },
      }),
    };
  });
}

export interface StatusReportInput {
  projectId: string;
  submitterId: string | null;
  health: Record<HealthDimension, Health>;
  accomplished: string;
  planned: string;
  comments: string;
  overrideReasons: Partial<Record<HealthDimension, string>>;
  aiDraft?: AiDraft | undefined;
  /** Legacy free-text notes, sent as decisions_needed. */
  legacyNotes?: string | undefined;
  /** Decisions the report asks for, in order (pending decisions on this project). */
  decisionIds?: string[] | undefined;
  /** Submit an existing draft instead of inserting a new report. */
  reportId?: string | undefined;
  expectedUpdatedAt?: string | undefined;
}

/** Submits a report and its decision links in one transaction (submit_status_report RPC): a new
 * report is inserted as submitted, a draft (reportId) moves to submitted. Links are frozen once
 * the report is submitted. */
export async function submitStatusReport(input: StatusReportInput) {
  return unwrap(
    await supabase.rpc("submit_status_report", {
      p_project_id: input.projectId,
      p_report: {
        reporting_date: todayIso(),
        submitter_id: input.submitterId,
        overall: healthValue[input.health.overall],
        schedule: healthValue[input.health.schedule],
        financial: healthValue[input.health.financial],
        effort: healthValue[input.health.effort],
        issue: healthValue[input.health.issue],
        accomplished: input.accomplished,
        planned: input.planned,
        comments: input.comments || null,
        decisions_needed: input.legacyNotes?.trim() || null,
        override_reasons: input.overrideReasons as Json,
        ai_draft: (input.aiDraft ?? null) as Json,
      },
      p_decision_ids: input.decisionIds ?? [],
      ...(input.reportId ? { p_report_id: input.reportId } : {}),
      ...(input.expectedUpdatedAt ? { p_expected_updated_at: input.expectedUpdatedAt } : {}),
    }),
    "Submitting the status report",
  );
}

/** Link a Pending decision to a draft report (the database refuses once submitted). */
export async function addDraftDecisionLink(input: {
  reportId: string;
  projectId: string;
  decisionId: string;
  sortOrder: number;
}) {
  return insertRow(
    "status_report_decisions",
    {
      status_report_id: input.reportId,
      project_id: input.projectId,
      decision_id: input.decisionId,
      sort_order: input.sortOrder,
    },
    "Linking the decision to the draft",
  );
}

export async function removeDraftDecisionLink(reportId: string, decisionId: string) {
  return deleteWhere(
    "status_report_decisions",
    { status_report_id: reportId, decision_id: decisionId },
    "Removing the decision from the draft",
  );
}
