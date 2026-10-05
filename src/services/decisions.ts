// Decisions, assumptions and change requests (the "D", "A" and change parts of RAIDD), read from
// and written to Supabase.
//
// Decisions embed their options, actions and link tables. decision_options is related to
// decisions twice (options.decision_id, and decisions.chosen_option_id), so that embed names its
// FK explicitly; the rest are single-FK one-to-many embeds. People resolve through one parallel
// resources query, forums and change types through lookup_values.
import type {
  Assumption,
  AssumptionStatus,
  ChangeRequest,
  Decision,
  DecisionAction,
  DecisionStatus,
} from "@/data/types";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { parseDate } from "@/lib/format";
import { daysFromToday, today } from "@/lib/today";
import { listPeople, type Person } from "./hierarchy";
import { ServiceError, unwrap } from "./service-error";
import { insertRow, insertRows, updateRow } from "./write";

type Enums = Database["public"]["Enums"];
const invert = <K extends string, V extends string>(map: Record<K, V>) =>
  Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<V, K>;

export const decisionStatusLabel: Record<Enums["decision_status"], DecisionStatus> = {
  pending: "Pending",
  made: "Made",
  superseded: "Superseded",
  reversed: "Reversed",
};
export const decisionStatusValue = invert(decisionStatusLabel);
const actionStatusLabel: Record<Enums["action_status"], DecisionAction["status"]> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};
export const assumptionStatusLabel: Record<Enums["assumption_status"], AssumptionStatus> = {
  open: "Open",
  validated: "Validated",
  invalidated: "Invalidated",
};
export const assumptionStatusValue = invert(assumptionStatusLabel);
export const changeStatusLabel: Record<Enums["change_status"], ChangeRequest["status"]> = {
  proposed: "Proposed",
  approved: "Approved",
  rejected: "Rejected",
};

export interface ScopeRef {
  projectId: string | null;
  programmeId: string | null;
  portfolioId: string | null;
  workspaceId: string;
}

export interface ResolvedDecision extends Omit<Decision, "forum" | "projectId" | "programmeId"> {
  forum: string;
  forumId: string | null;
  projectId?: string;
  programmeId?: string;
  projectCode: string | null;
  scope: ScopeRef;
  decisionMakerId: string | null;
  ownerLabel: string;
  scopeName: string;
  programmeName: string;
  overdue: boolean;
  daysToNeededBy: number;
  latencyDays: number | undefined;
  chosenOption: string;
  impactSummary: string;
  openActions: number;
  updatedAt: string;
}

export interface ResolvedAssumption extends Omit<Assumption, "projectId" | "programmeId"> {
  projectId?: string;
  programmeId?: string;
  scope: ScopeRef;
  ownerId: string | null;
  scopeName: string;
  overdue: boolean;
  daysToValidation: number;
  updatedAt: string;
}

export interface ChangeView extends ChangeRequest {
  ref: string;
  scope: ScopeRef;
  projectCode: string | null;
  projectName: string;
  programmeId: string;
  programmeName: string;
  updatedAt: string;
}

export interface GovernanceData {
  decisions: ResolvedDecision[];
  assumptions: ResolvedAssumption[];
  changes: ChangeView[];
  forums: Array<{ id: string; label: string }>;
  changeTypes: Array<{ id: string; label: string }>;
  people: Person[];
  projects: Array<{
    id: string;
    code: string;
    name: string;
    programmeId: string | null;
    workspaceId: string;
    portfolioId: string | null;
  }>;
  programmes: Array<{ id: string; name: string }>;
}

export async function loadGovernance(orgId: string): Promise<GovernanceData> {
  const [decisions, assumptions, changes, lookups, projects, programmes, people] =
    await Promise.all([
      supabase
        .from("decisions")
        .select(
          `id, ref, workspace_id, portfolio_id, programme_id, project_id, title, context,
           chosen_option_id, rationale, needed_by_date, decision_date, status,
           impact_scope, impact_scope_note, impact_cost, impact_cost_note, impact_time,
           impact_time_note, impact_benefits, impact_benefits_note, evidence_link, supersedes_id,
           decision_maker_id, forum_id, updated_at,
           decision_options!decision_options_decision_id_workspace_id_fkey(id, title, pros, cons, sort_order),
           decision_actions(id, description, due_date, status, owner_id),
           decision_risks(risk_id), decision_issues(issue_id),
           decision_change_requests(change_request_id), decision_dependencies(dependency_id),
           decision_benefits(benefit_id)`,
        )
        .eq("organisation_id", orgId)
        .order("ref"),
      supabase
        .from("assumptions")
        .select(
          "id, ref, workspace_id, portfolio_id, programme_id, project_id, assumption, rationale, validation_date, status, notes, owner_id, raised_issue_id, updated_at",
        )
        .eq("organisation_id", orgId)
        .order("ref"),
      supabase
        .from("change_requests")
        .select(
          "id, ref, workspace_id, portfolio_id, programme_id, project_id, title, cost_impact, schedule_impact_days, status, requested_by_id, type_id, updated_at",
        )
        .eq("organisation_id", orgId)
        .order("ref"),
      supabase
        .from("lookup_values")
        .select("id, list_key, label, sort_order, is_active")
        .eq("organisation_id", orgId)
        .in("list_key", ["decision_forum", "change_type"])
        .order("sort_order"),
      supabase
        .from("v_projects")
        .select("id, code, name, programme_id, workspace_id, effective_portfolio_id")
        .eq("organisation_id", orgId),
      supabase.from("programmes").select("id, name").eq("organisation_id", orgId),
      listPeople(orgId),
    ]);

  const names = new Map(people.map((person) => [person.id, person.name]));
  const nameOf = (id: string | null | undefined) => (id && names.get(id)) || "";
  const lookupRows = unwrap(lookups, "Loading lists");
  const label = new Map(lookupRows.map((row) => [row.id, row.label]));
  const projectRows = unwrap(projects, "Loading projects").map((row) => ({
    id: row.id ?? "",
    code: row.code ?? "",
    name: row.name ?? "",
    programmeId: row.programme_id,
    workspaceId: row.workspace_id ?? "",
    portfolioId: row.effective_portfolio_id,
  }));
  const projectById = new Map(projectRows.map((row) => [row.id, row]));
  const programmeRows = unwrap(programmes, "Loading programmes");
  const programmeName = new Map(programmeRows.map((row) => [row.id, row.name]));
  const scopeOf = (row: {
    project_id: string | null;
    programme_id: string | null;
    portfolio_id: string | null;
    workspace_id: string;
  }) => {
    const project = row.project_id ? projectById.get(row.project_id) : undefined;
    const programmeId = row.programme_id ?? project?.programmeId ?? null;
    return {
      ref: {
        projectId: row.project_id,
        programmeId: row.programme_id,
        portfolioId: row.portfolio_id,
        workspaceId: row.workspace_id,
      },
      project,
      programmeId,
      scopeName: project?.name ?? (programmeId && programmeName.get(programmeId)) ?? "Portfolio",
      programmeName: (programmeId && programmeName.get(programmeId)) || "Portfolio",
    };
  };

  const decisionViews = unwrap(decisions, "Loading decisions").map((row): ResolvedDecision => {
    const scope = scopeOf(row);
    const options = [...(row.decision_options ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((option) => ({
        id: option.id,
        title: option.title,
        pros: option.pros ?? [],
        cons: option.cons ?? [],
      }));
    const impact = {
      scope: { impacted: row.impact_scope, note: row.impact_scope_note ?? "" },
      cost: { impacted: row.impact_cost, note: row.impact_cost_note ?? "" },
      time: { impacted: row.impact_time, note: row.impact_time_note ?? "" },
      benefits: { impacted: row.impact_benefits, note: row.impact_benefits_note ?? "" },
    };
    const actions = (row.decision_actions ?? []).map((action) => ({
      id: action.id,
      description: action.description,
      owner: nameOf(action.owner_id),
      dueDate: action.due_date ?? "",
      status: actionStatusLabel[action.status],
    }));
    const neededBy = row.needed_by_date ?? "";
    const toNeededBy = daysFromToday(neededBy) ?? 0;
    const latency =
      row.decision_date && neededBy
        ? Math.round(
            ((parseDate(row.decision_date)?.getTime() ?? 0) -
              (parseDate(neededBy)?.getTime() ?? 0)) /
              86_400_000,
          )
        : undefined;
    const impacted = (["scope", "cost", "time", "benefits"] as const).filter(
      (key) => impact[key].impacted,
    );
    const status = decisionStatusLabel[row.status];
    return {
      id: row.id,
      reference: row.ref,
      ...(row.project_id && { projectId: row.project_id }),
      ...(scope.programmeId && { programmeId: scope.programmeId }),
      projectCode: scope.project?.code ?? null,
      scope: scope.ref,
      title: row.title,
      context: row.context ?? "",
      options,
      ...(row.chosen_option_id && { chosenOptionId: row.chosen_option_id }),
      ...(row.rationale && { rationale: row.rationale }),
      decisionMaker: nameOf(row.decision_maker_id),
      decisionMakerId: row.decision_maker_id,
      forum: label.get(row.forum_id ?? "") ?? "",
      forumId: row.forum_id,
      neededBy,
      ...(row.decision_date && { decisionDate: row.decision_date }),
      status,
      impact,
      riskIds: (row.decision_risks ?? []).map((link) => link.risk_id),
      issueIds: (row.decision_issues ?? []).map((link) => link.issue_id),
      changeIds: (row.decision_change_requests ?? []).map((link) => link.change_request_id),
      dependencyIds: (row.decision_dependencies ?? []).map((link) => link.dependency_id),
      benefitIds: (row.decision_benefits ?? []).map((link) => link.benefit_id),
      actions,
      ...(row.evidence_link && { evidenceLink: row.evidence_link }),
      ...(row.supersedes_id && { supersedesId: row.supersedes_id }),
      ownerLabel: nameOf(row.decision_maker_id),
      scopeName: scope.scopeName,
      programmeName: scope.programmeName,
      overdue: status === "Pending" && toNeededBy < 0,
      daysToNeededBy: toNeededBy,
      latencyDays: latency,
      chosenOption: options.find((option) => option.id === row.chosen_option_id)?.title ?? "—",
      impactSummary: impacted.length
        ? impacted.map((key) => key[0]?.toUpperCase() + key.slice(1)).join(", ")
        : "None",
      openActions: actions.filter((action) => action.status !== "Done").length,
      updatedAt: row.updated_at,
    };
  });
  // supersededById is derived: only supersedes_id is stored.
  for (const decision of decisionViews)
    if (decision.supersedesId) {
      const older = decisionViews.find((item) => item.id === decision.supersedesId);
      if (older) older.supersededById = decision.id;
    }

  return {
    decisions: decisionViews,
    assumptions: unwrap(assumptions, "Loading assumptions").map((row): ResolvedAssumption => {
      const scope = scopeOf(row);
      const toValidation = daysFromToday(row.validation_date) ?? 0;
      const status = assumptionStatusLabel[row.status];
      return {
        id: row.id,
        reference: row.ref,
        ...(row.project_id && { projectId: row.project_id }),
        ...(scope.programmeId && { programmeId: scope.programmeId }),
        scope: scope.ref,
        assumption: row.assumption,
        owner: nameOf(row.owner_id),
        ownerId: row.owner_id,
        rationale: row.rationale ?? "",
        validationDate: row.validation_date ?? "",
        status,
        ...(row.raised_issue_id && { raisedIssueId: row.raised_issue_id }),
        ...(row.notes && { notes: row.notes }),
        scopeName: scope.scopeName,
        overdue: status === "Open" && toValidation < 0,
        daysToValidation: toValidation,
        updatedAt: row.updated_at,
      };
    }),
    changes: unwrap(changes, "Loading change requests").map((row): ChangeView => {
      const scope = scopeOf(row);
      return {
        id: row.id,
        ref: row.ref,
        scope: scope.ref,
        title: row.title,
        type: (label.get(row.type_id ?? "") ?? "Scope") as ChangeRequest["type"],
        costImpact: Number(row.cost_impact ?? 0),
        scheduleImpactDays: row.schedule_impact_days ?? 0,
        status: changeStatusLabel[row.status],
        requestedBy: nameOf(row.requested_by_id),
        projectCode: scope.project?.code ?? null,
        projectName: scope.project?.name ?? scope.scopeName,
        programmeId: scope.programmeId ?? "",
        programmeName: scope.programmeName,
        updatedAt: row.updated_at,
      };
    }),
    forums: lookupRows
      .filter((row) => row.list_key === "decision_forum" && row.is_active)
      .map((row) => ({ id: row.id, label: row.label })),
    changeTypes: lookupRows
      .filter((row) => row.list_key === "change_type" && row.is_active)
      .map((row) => ({ id: row.id, label: row.label })),
    people,
    projects: projectRows,
    programmes: programmeRows,
  };
}

// ---- Pure helpers -------------------------------------------------------------------------

export function getDecisionMetrics(items: ResolvedDecision[]) {
  const made = items.filter((item) => item.status === "Made" && item.decisionDate);
  const latencies = made
    .map((item) => item.latencyDays)
    .filter((value): value is number => value !== undefined);
  const madeLast30 = made.filter(
    (item) => item.decisionDate && (daysFromToday(item.decisionDate) ?? -999) >= -30,
  );
  return {
    pending: items.filter((item) => item.status === "Pending").length,
    overdue: items.filter((item) => item.overdue).length,
    averageLatencyDays: latencies.length
      ? Math.round((latencies.reduce((sum, value) => sum + value, 0) / latencies.length) * 10) / 10
      : 0,
    madeLast30: madeLast30.length,
    superseded: items.filter((item) => item.status === "Superseded").length,
  };
}

export const madeThisMonth = (decision: ResolvedDecision) => {
  const date = decision.decisionDate ? parseDate(decision.decisionDate) : undefined;
  const now = today();
  return Boolean(
    date && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(),
  );
};
/** Made on or after an ISO date. */
export const madeSince = (decision: ResolvedDecision, since: string) =>
  Boolean(decision.decisionDate && decision.decisionDate >= since);

/** Pending decisions for a forum, used to build the meeting agenda. */
export function getForumAgenda(forum: string, items: ResolvedDecision[]) {
  const pending = items
    .filter((item) => item.forum === forum && item.status === "Pending")
    .sort((a, b) => a.daysToNeededBy - b.daysToNeededBy);
  const recent = items
    .filter((item) => item.forum === forum && item.status !== "Pending" && item.decisionDate)
    .sort((a, b) => (b.decisionDate ?? "").localeCompare(a.decisionDate ?? ""))
    .slice(0, 5);
  return { pending, recent, overdue: pending.filter((item) => item.overdue) };
}

/** Records for a project, or for a programme including its projects. */
export function scopedTo<T extends { projectId?: string; programmeId?: string }>(
  items: T[],
  scope: { projectId?: string; programmeId?: string },
): T[] {
  return items.filter((item) => {
    if (scope.projectId) return item.projectId === scope.projectId;
    if (scope.programmeId) return item.programmeId === scope.programmeId;
    return true;
  });
}

export function getAssumptionMetrics(items: ResolvedAssumption[]) {
  return {
    open: items.filter((item) => item.status === "Open").length,
    validated: items.filter((item) => item.status === "Validated").length,
    invalidated: items.filter((item) => item.status === "Invalidated").length,
    overdue: items.filter((item) => item.overdue).length,
  };
}

/** A decision that has been made is read-only; changing it creates a superseding decision. */
export const isDecisionReadOnly = (decision: { status: DecisionStatus }) =>
  decision.status !== "Pending";

// ---- Writes -------------------------------------------------------------------------------

/** Record the outcome of a pending decision. It becomes read-only. */
export async function recordDecision(input: {
  id: string;
  optionId: string;
  rationale: string;
  decisionDate: string;
  lastSeen: string;
}) {
  if (!input.rationale.trim())
    throw new ServiceError("invalid", "Record why this option was chosen.");
  return updateRow(
    "decisions",
    input.id,
    {
      status: "made",
      chosen_option_id: input.optionId,
      rationale: input.rationale.trim(),
      decision_date: input.decisionDate,
    },
    { context: "Recording the decision", lastSeen: input.lastSeen },
  );
}

/**
 * Supersede a made decision: a new pending decision with the same scope, context, forum and
 * options, pointing back at the original, which becomes Superseded.
 */
export async function supersedeDecision(decision: ResolvedDecision, neededBy: string) {
  const written = await insertRow(
    "decisions",
    {
      title: decision.title,
      context: decision.context,
      project_id: decision.scope.projectId,
      programme_id: decision.scope.programmeId,
      portfolio_id: decision.scope.portfolioId,
      forum_id: decision.forumId,
      decision_maker_id: decision.decisionMakerId,
      needed_by_date: neededBy,
      supersedes_id: decision.id,
      status: "pending",
      impact_scope: decision.impact.scope.impacted,
      impact_scope_note: decision.impact.scope.note || null,
      impact_cost: decision.impact.cost.impacted,
      impact_cost_note: decision.impact.cost.note || null,
      impact_time: decision.impact.time.impacted,
      impact_time_note: decision.impact.time.note || null,
      impact_benefits: decision.impact.benefits.impacted,
      impact_benefits_note: decision.impact.benefits.note || null,
    },
    "Creating the superseding decision",
  );
  if (decision.options.length)
    await insertRows(
      "decision_options",
      decision.options.map((option, index) => ({
        decision_id: written.id,
        title: option.title,
        pros: option.pros,
        cons: option.cons,
        sort_order: index,
      })),
      "Copying the options",
    );
  await updateRow(
    "decisions",
    decision.id,
    { status: "superseded" },
    { context: "Marking the original as superseded", lastSeen: decision.updatedAt },
  );
  return written;
}

export interface DecisionInput {
  forumId?: string | null;
  neededBy?: string;
  status?: DecisionStatus;
  title?: string;
  decisionMakerId?: string | null;
}

export async function updateDecision(id: string, input: DecisionInput, lastSeen?: string | null) {
  const fields = {
    ...(input.title !== undefined && { title: input.title.trim() }),
    ...(input.forumId !== undefined && { forum_id: input.forumId }),
    ...(input.neededBy !== undefined && { needed_by_date: input.neededBy }),
    ...(input.status !== undefined && { status: decisionStatusValue[input.status] }),
    ...(input.decisionMakerId !== undefined && { decision_maker_id: input.decisionMakerId }),
  };
  if (!Object.keys(fields).length) return;
  return updateRow("decisions", id, fields, { context: "Saving the decision", lastSeen });
}

export interface AssumptionInput {
  status?: AssumptionStatus;
  validationDate?: string;
  assumption?: string;
  ownerId?: string | null;
  raisedIssueId?: string | null;
}

export async function updateAssumption(
  id: string,
  input: AssumptionInput,
  lastSeen?: string | null,
) {
  const fields = {
    ...(input.assumption !== undefined && { assumption: input.assumption.trim() }),
    ...(input.status !== undefined && { status: assumptionStatusValue[input.status] }),
    ...(input.validationDate !== undefined && { validation_date: input.validationDate }),
    ...(input.ownerId !== undefined && { owner_id: input.ownerId }),
    ...(input.raisedIssueId !== undefined && { raised_issue_id: input.raisedIssueId }),
  };
  if (!Object.keys(fields).length) return;
  return updateRow("assumptions", id, fields, { context: "Saving the assumption", lastSeen });
}

/** Raise an issue from an invalidated assumption, in the assumption's scope, and link it. */
export async function raiseIssueFromAssumption(input: {
  assumption: ResolvedAssumption;
  title: string;
  description: string;
  ownerId: string | null;
  dueDate: string | null;
}) {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give the issue a title.");
  const scope = input.assumption.scope;
  const issue = await insertRow(
    "issues",
    {
      title: input.title.trim(),
      description: input.description,
      owner_id: input.ownerId,
      due_date: input.dueDate,
      project_id: scope.projectId,
      programme_id: scope.projectId ? null : scope.programmeId,
      portfolio_id: scope.projectId || scope.programmeId ? null : scope.portfolioId,
    },
    "Raising the issue",
  );
  await updateAssumption(
    input.assumption.id,
    { status: "Invalidated", raisedIssueId: issue.id },
    input.assumption.updatedAt,
  );
  return issue;
}

export interface ChangeInput {
  status?: ChangeRequest["status"];
  typeId?: string;
  title?: string;
}

/** Change requests: contributors on the project (can_write). */
export async function updateChange(id: string, input: ChangeInput, lastSeen?: string | null) {
  const statusValue = invert(changeStatusLabel);
  const fields = {
    ...(input.title !== undefined && { title: input.title.trim() }),
    ...(input.status !== undefined && { status: statusValue[input.status] }),
    ...(input.typeId !== undefined && { type_id: input.typeId }),
  };
  if (!Object.keys(fields).length) return;
  return updateRow("change_requests", id, fields, {
    context: "Saving the change request",
    lastSeen,
  });
}
