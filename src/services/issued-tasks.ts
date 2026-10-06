// Issued tasks: a work item offered to a named person (work_item_offers), read through
// v_issued_work_items, which gives each item's latest offer, the derived status and the
// Planner sync state. Offers are append-only: the response is recorded once (the database
// stamps who and when), and accepting assigns the person and moves the item to not started.
import type { Database } from "@/integrations/supabase/types";
import type { IssuedTaskStatus, PlannerSyncState, Priority } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { listPeople, type Person } from "./hierarchy";
import { priorityLabel, priorityValue } from "./labels";
import { unwrap } from "./service-error";
import { insertRow, insertRows, updateRow } from "./write";

type Enums = Database["public"]["Enums"];

const statusLabel: Record<string, IssuedTaskStatus> = {
  issued: "Issued",
  accepted: "Accepted",
  declined: "Declined",
  proposed_new_date: "Proposed new date",
  in_progress: "In progress",
  done: "Done",
};
const syncLabel: Record<string, PlannerSyncState> = {
  not_applicable: "Not applicable",
  pending_acceptance: "Pending acceptance",
  syncing: "Syncing",
  created_in_planner: "Created in Planner",
};

export interface IssuedTaskView {
  workItemId: string;
  offerId: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  issuerId: string;
  issuer: string;
  assigneeId: string;
  assignee: string;
  assigneeEmail: string | null;
  issuedAt: string;
  acknowledgementDue: string | null;
  dueDate: string | null;
  estimatedEffortHours: number;
  priority: Priority;
  status: IssuedTaskStatus;
  responseReason: string | null;
  proposedDate: string | null;
  reminderSentAt: string | null;
  plannerSync: PlannerSyncState;
}

export interface IssuedTasksData {
  items: IssuedTaskView[];
  people: Person[];
  projects: { id: string; name: string; taskSource: Enums["task_source"] }[];
}

export async function loadIssuedTasks(orgId: string): Promise<IssuedTasksData> {
  const [items, projects, people] = await Promise.all([
    supabase
      .from("v_issued_work_items")
      .select(
        "id, offer_id, project_id, title, description, issued_by, issued_to, issued_at, acknowledgement_due_date, finish_date, estimated_effort_hours, priority, issued_status, response_comment, proposed_date, reminder_sent_at, planner_sync",
      )
      .eq("organisation_id", orgId)
      .order("issued_at", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name, task_source")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    listPeople(orgId),
  ]);
  const byId = new Map(people.map((person) => [person.id, person]));
  const projectRows = unwrap(projects, "Loading projects").map((row) => ({
    id: row.id,
    name: row.name,
    taskSource: row.task_source,
  }));
  const projectName = new Map(projectRows.map((row) => [row.id, row.name]));
  return {
    items: unwrap(items, "Loading issued tasks").map((row) => ({
      workItemId: row.id ?? "",
      offerId: row.offer_id ?? "",
      projectId: row.project_id ?? "",
      projectName: projectName.get(row.project_id ?? "") ?? "Project",
      title: row.title ?? "",
      description: row.description ?? "",
      issuerId: row.issued_by ?? "",
      issuer: byId.get(row.issued_by ?? "")?.name ?? "Unknown",
      assigneeId: row.issued_to ?? "",
      assignee: byId.get(row.issued_to ?? "")?.name ?? "Unknown",
      assigneeEmail: byId.get(row.issued_to ?? "")?.email ?? null,
      issuedAt: row.issued_at ?? "",
      acknowledgementDue: row.acknowledgement_due_date,
      dueDate: row.finish_date,
      estimatedEffortHours: Number(row.estimated_effort_hours ?? 0),
      priority: priorityLabel[row.priority ?? "moderate"],
      status: statusLabel[row.issued_status ?? "issued"] ?? "Issued",
      responseReason: row.response_comment,
      proposedDate: row.proposed_date,
      reminderSentAt: row.reminder_sent_at,
      plannerSync: syncLabel[row.planner_sync ?? "not_applicable"] ?? "Not applicable",
    })),
    people,
    projects: projectRows,
  };
}

export interface IssueInput {
  projectId: string;
  title: string;
  description: string;
  dueDate: string;
  acknowledgementDue: string;
  estimatedEffortHours: number;
  priority: Priority;
  checklist: string[];
  issuerId: string;
  recipientIds: string[];
}

/** One work item and one offer per recipient (the same request to several people). */
export async function issueTasks(input: IssueInput) {
  for (const recipientId of input.recipientIds) {
    const item = await insertRow(
      "work_items",
      {
        project_id: input.projectId,
        title: input.title.trim(),
        description: input.description.trim() || null,
        finish_date: input.dueDate,
        estimated_effort_hours: input.estimatedEffortHours || null,
        priority: priorityValue[input.priority] ?? "moderate",
        backlog_rank: 0,
      },
      "Issuing the task",
    );
    await insertRows(
      "work_item_checklist_items",
      input.checklist.map((label, index) => ({
        work_item_id: item.id,
        project_id: input.projectId,
        label,
        sort_order: index,
      })),
      "Adding the checklist",
    );
    await insertRow(
      "work_item_offers",
      {
        work_item_id: item.id,
        project_id: input.projectId,
        issued_by: input.issuerId,
        issued_to: recipientId,
        acknowledgement_due_date: input.acknowledgementDue,
      },
      "Issuing the task",
    );
  }
  return input.recipientIds.length;
}

export type OfferResponse =
  | { response: "accepted" }
  | { response: "declined"; comment: string }
  | { response: "proposed_date"; proposedDate: string; comment: string };

/** Record the one response to an offer (the person, the issuer, or PMO on their behalf). */
export async function respondToOffer(offerId: string, answer: OfferResponse) {
  return updateRow(
    "work_item_offers",
    offerId,
    {
      response: answer.response,
      ...(answer.response !== "accepted" && { comment: answer.comment }),
      ...(answer.response === "proposed_date" && { proposed_date: answer.proposedDate }),
      // The database replaces this with now() and records who responded.
      responded_at: new Date().toISOString(),
    },
    { context: "Recording your response" },
  );
}

export async function markReminderSent(offerId: string) {
  return updateRow(
    "work_item_offers",
    offerId,
    { reminder_sent_at: new Date().toISOString() },
    { context: "Recording the reminder" },
  );
}
