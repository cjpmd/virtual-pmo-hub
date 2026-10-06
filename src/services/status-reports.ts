// Project status reports. A submitted report is a point-in-time judgement: the declared RAGs,
// override reasons and narrative are stored as submitted, and the database copies the
// evidenced RAGs from v_project_health at insert (submit_status_report trigger), then freezes
// them. Nothing here edits a report after submission.
import type { Database, Json } from "@/integrations/supabase/types";
import type { Health, HealthDimension } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { todayIso } from "@/lib/today";
import { listPeople } from "./hierarchy";
import { healthLabel, toHealth } from "./labels";
import { unwrap } from "./service-error";
import { insertRow } from "./write";

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
}

export async function listStatusReports(
  orgId: string,
  projectId: string,
): Promise<StatusReportView[]> {
  const [reports, people] = await Promise.all([
    supabase
      .from("status_reports")
      .select(
        "id, ref, reporting_date, submitter_id, overall, schedule, financial, effort, issue, evidenced_overall, accomplished, planned, comments, override_reasons, ai_draft, created_at",
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
}

export async function submitStatusReport(input: StatusReportInput) {
  return insertRow(
    "status_reports",
    {
      project_id: input.projectId,
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
      override_reasons: input.overrideReasons as Json,
      ai_draft: (input.aiDraft ?? null) as Json,
    },
    "Submitting the status report",
  );
}
