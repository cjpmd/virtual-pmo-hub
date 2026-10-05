// Milestones and RAID (risks, issues) for one project, read and written through Supabase.
// Writes are gated by RLS: inserts/updates need can_edit_project(), deletes need a workspace
// manager. Each write selects the row back, so a write RLS silently filtered becomes a
// ServiceError("forbidden") instead of a false success.
import type { MilestoneStatus, MilestoneType } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { forInsert, type Update } from "./db";
import {
  milestoneStatusLabel,
  milestoneTypeLabel,
  milestoneTypeValue,
  openClosedLabel,
  openClosedValue,
  responseLabel,
  responseValue,
  severityLabel,
  severityValue,
  type OpenClosedLabel,
  type ResponseLabel,
  type SeverityLabel,
} from "./labels";
import { ServiceError, unwrap, unwrapWrite } from "./service-error";

export interface MilestoneItem {
  id: string;
  projectId: string;
  ref: string;
  title: string;
  type: MilestoneType;
  ownerId: string | null;
  baselineDate: string;
  forecastDate: string;
  actualDate: string | null;
  status: MilestoneStatus;
  slipDays: number;
  reportToCommittee: boolean;
}

export interface RiskItem {
  id: string;
  ref: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  probability: number;
  impact: number;
  score: number;
  response: ResponseLabel;
  status: OpenClosedLabel;
  reviewDate: string | null;
}

export interface IssueItem {
  id: string;
  ref: string;
  title: string;
  description: string | null;
  ownerId: string | null;
  severity: SeverityLabel;
  status: OpenClosedLabel;
  dueDate: string | null;
}

// ---- Milestones -----------------------------------------------------------------------

export async function listMilestones(projectIds: string[]): Promise<MilestoneItem[]> {
  if (!projectIds.length) return [];
  const rows = unwrap(
    await supabase
      .from("v_milestones")
      .select(
        "id, project_id, ref, title, type, owner_id, baseline_date, forecast_date, actual_date, status, slip_days, report_to_committee",
      )
      .in("project_id", projectIds)
      .order("forecast_date"),
    "Loading milestones",
  );
  return rows.map((row) => ({
    id: row.id ?? "",
    projectId: row.project_id ?? "",
    ref: row.ref ?? "",
    title: row.title ?? "",
    type: milestoneTypeLabel[row.type ?? "delivery"],
    ownerId: row.owner_id,
    baselineDate: row.baseline_date ?? "",
    forecastDate: row.forecast_date ?? "",
    actualDate: row.actual_date,
    status: milestoneStatusLabel(row.status),
    slipDays: row.slip_days ?? 0,
    reportToCommittee: row.report_to_committee ?? false,
  }));
}

export interface MilestoneInput {
  title?: string;
  type?: MilestoneType;
  ownerId?: string | null;
  baselineDate?: string;
  forecastDate?: string;
  actualDate?: string | null;
  reportToCommittee?: boolean;
}

const milestoneFields = (input: MilestoneInput): Update<"milestones"> => ({
  ...(input.title !== undefined && { title: input.title.trim() }),
  ...(input.type !== undefined && { type: milestoneTypeValue[input.type] }),
  ...(input.ownerId !== undefined && { owner_id: input.ownerId }),
  ...(input.baselineDate !== undefined && { baseline_date: input.baselineDate }),
  ...(input.forecastDate !== undefined && { forecast_date: input.forecastDate }),
  ...(input.actualDate !== undefined && { actual_date: input.actualDate }),
  ...(input.reportToCommittee !== undefined && { report_to_committee: input.reportToCommittee }),
});

export async function createMilestone(
  projectId: string,
  input: MilestoneInput & { title: string; forecastDate: string },
) {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give the milestone a title.");
  const fields = milestoneFields(input);
  return unwrapWrite(
    await supabase
      .from("milestones")
      .insert(
        forInsert<"milestones">({
          ...fields,
          project_id: projectId,
          title: input.title.trim(),
          forecast_date: input.forecastDate,
          baseline_date: input.baselineDate ?? input.forecastDate,
        }),
      )
      .select("id")
      .single(),
    "Adding the milestone",
  );
}

/** Forecast changes are recorded in milestone_forecast_history by a database trigger. */
export async function updateMilestone(id: string, input: MilestoneInput) {
  const fields = milestoneFields(input);
  if (!Object.keys(fields).length) return;
  unwrapWrite(
    await supabase.from("milestones").update(fields).eq("id", id).select("id"),
    "Saving the milestone",
  );
}

export async function deleteMilestone(id: string) {
  unwrapWrite(
    await supabase.from("milestones").delete().eq("id", id).select("id"),
    "Deleting the milestone",
  );
}

// ---- RAID -------------------------------------------------------------------------------

export async function listRaid(
  projectId: string,
): Promise<{ risks: RiskItem[]; issues: IssueItem[] }> {
  const [risks, issues] = await Promise.all([
    supabase
      .from("risks")
      .select(
        "id, ref, title, description, owner_id, probability, impact, score, response, status, review_date",
      )
      .eq("project_id", projectId)
      .order("score", { ascending: false })
      .order("ref"),
    supabase
      .from("issues")
      .select("id, ref, title, description, owner_id, severity, status, due_date")
      .eq("project_id", projectId)
      .order("ref"),
  ]);
  return {
    risks: unwrap(risks, "Loading risks").map((row) => ({
      id: row.id,
      ref: row.ref,
      title: row.title,
      description: row.description,
      ownerId: row.owner_id,
      probability: row.probability,
      impact: row.impact,
      score: row.score ?? row.probability * row.impact,
      response: responseLabel[row.response],
      status: openClosedLabel[row.status],
      reviewDate: row.review_date,
    })),
    issues: unwrap(issues, "Loading issues").map((row) => ({
      id: row.id,
      ref: row.ref,
      title: row.title,
      description: row.description,
      ownerId: row.owner_id,
      severity: severityLabel[row.severity],
      status: openClosedLabel[row.status],
      dueDate: row.due_date,
    })),
  };
}

export interface RiskInput {
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  probability?: number;
  impact?: number;
  response?: ResponseLabel;
  status?: OpenClosedLabel;
  reviewDate?: string | null;
}

const scale = (value: number, label: string) => {
  if (!Number.isInteger(value) || value < 1 || value > 5)
    throw new ServiceError("invalid", `${label} must be a whole number from 1 to 5.`);
  return value;
};

const riskFields = (input: RiskInput): Update<"risks"> => ({
  ...(input.title !== undefined && { title: input.title.trim() }),
  ...(input.description !== undefined && { description: input.description }),
  ...(input.ownerId !== undefined && { owner_id: input.ownerId }),
  ...(input.probability !== undefined && { probability: scale(input.probability, "Probability") }),
  ...(input.impact !== undefined && { impact: scale(input.impact, "Impact") }),
  ...(input.response !== undefined && { response: responseValue[input.response] }),
  ...(input.status !== undefined && {
    status: openClosedValue[input.status],
    closed_at: input.status === "Closed" ? new Date().toISOString() : null,
  }),
  ...(input.reviewDate !== undefined && { review_date: input.reviewDate }),
});

export async function createRisk(projectId: string, input: RiskInput & { title: string }) {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give the risk a title.");
  return unwrapWrite(
    await supabase
      .from("risks")
      .insert(
        forInsert<"risks">({
          probability: 3,
          impact: 3,
          ...riskFields(input),
          title: input.title.trim(),
          project_id: projectId,
        }),
      )
      .select("id")
      .single(),
    "Adding the risk",
  );
}

export async function updateRisk(id: string, input: RiskInput) {
  const fields = riskFields(input);
  if (!Object.keys(fields).length) return;
  unwrapWrite(
    await supabase.from("risks").update(fields).eq("id", id).select("id"),
    "Saving the risk",
  );
}

/** Managers only (RLS). The audit log keeps a copy of the deleted row. */
export async function deleteRisks(ids: string[]) {
  unwrapWrite(await supabase.from("risks").delete().in("id", ids).select("id"), "Deleting risks");
}

export interface IssueInput {
  title?: string;
  description?: string | null;
  ownerId?: string | null;
  severity?: SeverityLabel;
  status?: OpenClosedLabel;
  dueDate?: string | null;
}

const issueFields = (input: IssueInput): Update<"issues"> => ({
  ...(input.title !== undefined && { title: input.title.trim() }),
  ...(input.description !== undefined && { description: input.description }),
  ...(input.ownerId !== undefined && { owner_id: input.ownerId }),
  ...(input.severity !== undefined && { severity: severityValue[input.severity] }),
  ...(input.status !== undefined && {
    status: openClosedValue[input.status],
    closed_at: input.status === "Closed" ? new Date().toISOString() : null,
  }),
  ...(input.dueDate !== undefined && { due_date: input.dueDate }),
});

export async function createIssue(projectId: string, input: IssueInput & { title: string }) {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give the issue a title.");
  return unwrapWrite(
    await supabase
      .from("issues")
      .insert(
        forInsert<"issues">({
          ...issueFields(input),
          title: input.title.trim(),
          project_id: projectId,
        }),
      )
      .select("id")
      .single(),
    "Adding the issue",
  );
}

export async function updateIssue(id: string, input: IssueInput) {
  const fields = issueFields(input);
  if (!Object.keys(fields).length) return;
  unwrapWrite(
    await supabase.from("issues").update(fields).eq("id", id).select("id"),
    "Saving the issue",
  );
}

export async function deleteIssues(ids: string[]) {
  unwrapWrite(await supabase.from("issues").delete().in("id", ids).select("id"), "Deleting issues");
}
