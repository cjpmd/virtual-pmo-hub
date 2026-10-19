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
import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { parseDate } from "@/lib/format";
import { daysFromToday, today } from "@/lib/today";
import { listPeople, type Person, programmeRefs, projectRefs } from "./hierarchy";
import { ServiceError, unwrap } from "./service-error";
import { deleteRows, deleteWhere, insertRow, insertRows, updateRow } from "./write";

type Enums = Database["public"]["Enums"];
const invert = <K extends string, V extends string>(map: Record<K, V>) =>
  Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<V, K>;

export const decisionStatusLabel: Record<Enums["decision_status"], DecisionStatus> = {
  pending: "Pending",
  made: "Made",
  superseded: "Superseded",
  reversed: "Reversed",
  withdrawn: "Withdrawn",
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

export interface ResolvedDecision extends Omit<
  Decision,
  "forum" | "projectId" | "programmeId" | "actions"
> {
  actions: Array<DecisionAction & { ownerId: string | null; updatedAt: string }>;
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
  /** From v_decisions: Pending past needed-by, in the organisation's today. */
  overdue: boolean;
  daysOverdue: number;
  deferralCount: number;
  pendingSuccessorId: string | null;
  pendingSuccessorRef: string | null;
  supersededByRef: string | null;
  milestoneIds: string[];
  decidedByResourceId: string | null;
  decidedByForumId: string | null;
  /** "Forum: X" or the person's name, for a recorded decision. */
  decidedBy: string;
  recordedBy: string;
  recordedAt: string | null;
  /** From v_decisions, for the signed-in user: may record, defer and reverse (the RPCs' rule). */
  canRecord: boolean;
  /** May edit, withdraw and supersede (the RPCs' rule). */
  canWrite: boolean;
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
  programmes: Array<{ id: string; name: string; workspace_id: string }>;
}

export async function loadGovernance(orgId: string): Promise<GovernanceData> {
  const [decisions, assumptions, changes, lookups, projects, programmes, people, view, profiles] =
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
           decision_actions(id, description, due_date, status, owner_id, updated_at),
           decision_risks(risk_id), decision_issues(issue_id),
           decision_change_requests(change_request_id), decision_dependencies(dependency_id),
           decision_benefits(benefit_id), decision_milestones(milestone_id),
           decided_by_resource_id, decided_by_forum_id, recorded_by, recorded_at`,
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
      projectRefs(orgId),
      programmeRefs(orgId),
      listPeople(orgId),
      supabase
        .from("v_decisions")
        .select(
          "id, overdue, days_overdue, deferral_count, pending_successor_id, pending_successor_ref, superseded_by_id, superseded_by_ref, can_record, can_write",
        )
        .eq("organisation_id", orgId),
      supabase.from("profiles").select("id, display_name"),
    ]);

  const viewById = new Map(
    unwrap(view, "Loading decision status").map((row) => [row.id ?? "", row]),
  );
  // Profiles outside the user's reach simply don't resolve; the name falls back to "Unknown".
  const profileName = new Map((profiles.data ?? []).map((row) => [row.id, row.display_name]));
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
      ownerId: action.owner_id,
      updatedAt: action.updated_at,
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
    const extra = viewById.get(row.id);
    const forumName = label.get(row.decided_by_forum_id ?? "");
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
      overdue: Boolean(extra?.overdue),
      daysOverdue: extra?.days_overdue ?? 0,
      deferralCount: extra?.deferral_count ?? 0,
      pendingSuccessorId: extra?.pending_successor_id ?? null,
      pendingSuccessorRef: extra?.pending_successor_ref ?? null,
      supersededByRef: extra?.superseded_by_ref ?? null,
      ...(extra?.superseded_by_id && { supersededById: extra.superseded_by_id }),
      milestoneIds: (row.decision_milestones ?? []).map((link) => link.milestone_id),
      decidedByResourceId: row.decided_by_resource_id,
      decidedByForumId: row.decided_by_forum_id,
      decidedBy: forumName ? `Forum: ${forumName}` : nameOf(row.decided_by_resource_id) || "",
      recordedBy: (row.recorded_by && profileName.get(row.recorded_by)) || "",
      recordedAt: row.recorded_at,
      canRecord: Boolean(extra?.can_record),
      canWrite: Boolean(extra?.can_write),
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

/** Record the outcome of a pending decision (record_decision RPC: the decision maker or the
 * PMO). It becomes read-only; a recorded successor supersedes its original. */
export async function recordDecision(input: {
  id: string;
  optionId: string;
  rationale: string;
  decisionDate: string;
  lastSeen: string;
  decidedByResourceId?: string | null | undefined;
  decidedByForumId?: string | null | undefined;
  actions?: Array<{ description: string; ownerId?: string | null; dueDate?: string | null }>;
}) {
  return unwrap(await supabase.rpc("record_decision", recordArgs(input)), "Recording the decision");
}

/** record_decision arguments: at most one decider, blank actions dropped. */
export function recordArgs(input: Parameters<typeof recordDecision>[0]) {
  if (!input.rationale.trim())
    throw new ServiceError("invalid", "Record why this option was chosen.");
  if (input.decidedByResourceId && input.decidedByForumId)
    throw new ServiceError("invalid", "Choose either a person or a forum as the decider.");
  const actions = (input.actions ?? [])
    .filter((action) => action.description.trim())
    .map((action) => ({
      description: action.description.trim(),
      ...(action.ownerId && { owner_id: action.ownerId }),
      ...(action.dueDate && { due_date: action.dueDate }),
    }));
  return {
    p_decision_id: input.id,
    p_chosen_option_id: input.optionId,
    p_rationale: input.rationale.trim(),
    p_decision_date: input.decisionDate,
    p_expected_updated_at: input.lastSeen,
    ...(input.decidedByResourceId && { p_decided_by_resource_id: input.decidedByResourceId }),
    ...(input.decidedByForumId && { p_decided_by_forum_id: input.decidedByForumId }),
    p_actions: actions as unknown as Json,
  };
}

const requireText = (value: string, message: string) => {
  if (!value.trim()) throw new ServiceError("invalid", message);
  return value.trim();
};

/** Defer a Pending decision (defer_decision RPC): it stays Pending with a new needed-by. */
export async function deferDecision(input: {
  id: string;
  newNeededBy: string;
  reason: string;
  eventDate?: string | undefined;
  forumId?: string | null | undefined;
  lastSeen: string;
}) {
  return unwrap(
    await supabase.rpc("defer_decision", {
      p_decision_id: input.id,
      p_new_needed_by: input.newNeededBy,
      p_reason: requireText(input.reason, "Give a reason for deferring."),
      ...(input.eventDate && { p_event_date: input.eventDate }),
      ...(input.forumId && { p_forum_id: input.forumId }),
      p_expected_updated_at: input.lastSeen,
    }),
    "Deferring the decision",
  );
}

/** Reverse a Made decision (reverse_decision RPC). */
export async function reverseDecision(input: {
  id: string;
  rationale: string;
  eventDate?: string | undefined;
  lastSeen: string;
}) {
  return unwrap(
    await supabase.rpc("reverse_decision", {
      p_decision_id: input.id,
      p_rationale: requireText(input.rationale, "Give the rationale for reversing."),
      ...(input.eventDate && { p_event_date: input.eventDate }),
      p_expected_updated_at: input.lastSeen,
    }),
    "Reversing the decision",
  );
}

/** Withdraw a Pending decision (withdraw_decision RPC). The record is kept. */
export async function withdrawDecision(input: { id: string; reason: string; lastSeen: string }) {
  return unwrap(
    await supabase.rpc("withdraw_decision", {
      p_decision_id: input.id,
      p_reason: requireText(input.reason, "Give a reason for withdrawing."),
      p_expected_updated_at: input.lastSeen,
    }),
    "Withdrawing the decision",
  );
}

/** Which lifecycle actions a status allows (the database enforces the same). */
export function decisionActionsFor(decision: {
  status: DecisionStatus;
  pendingSuccessorRef?: string | null;
}) {
  const pending = decision.status === "Pending";
  const made = decision.status === "Made";
  return {
    edit: pending,
    record: pending,
    defer: pending,
    withdraw: pending,
    supersede: made && !decision.pendingSuccessorRef,
    reverse: made,
  };
}

// ---- History ------------------------------------------------------------------------------

export interface DecisionEventView {
  id: string;
  type: Enums["decision_event_type"];
  eventDate: string;
  createdAt: string;
  reason: string | null;
  actor: string;
  forum: string;
  decidedBy: string;
  previousNeededBy: string | null;
  newNeededBy: string | null;
  changedFields: string[];
}

export async function listDecisionEvents(
  orgId: string,
  decisionId: string,
): Promise<DecisionEventView[]> {
  const [events, people, forums] = await Promise.all([
    supabase
      .from("decision_events")
      .select(
        "id, event_type, event_date, created_at, reason, actor_id, forum_id, decided_by_resource_id, previous_needed_by, new_needed_by, changes",
      )
      .eq("decision_id", decisionId)
      .order("created_at", { ascending: false }),
    listPeople(orgId),
    supabase
      .from("lookup_values")
      .select("id, label")
      .eq("organisation_id", orgId)
      .eq("list_key", "decision_forum"),
  ]);
  const rows = unwrap(events, "Loading the decision history");
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))] as string[];
  const profiles = actorIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", actorIds)
    : { data: [] };
  const actor = new Map((profiles.data ?? []).map((row) => [row.id, row.display_name]));
  const person = new Map(people.map((row) => [row.id, row.name]));
  const forum = new Map((forums.data ?? []).map((row) => [row.id, row.label]));
  return rows.map((row) => ({
    id: row.id,
    type: row.event_type,
    eventDate: row.event_date,
    createdAt: row.created_at,
    reason: row.reason,
    actor: (row.actor_id && actor.get(row.actor_id)) || "Unknown",
    forum: (row.forum_id && forum.get(row.forum_id)) || "",
    decidedBy: (row.decided_by_resource_id && person.get(row.decided_by_resource_id)) || "",
    previousNeededBy: row.previous_needed_by,
    newNeededBy: row.new_needed_by,
    changedFields: Object.keys((row.changes as Record<string, unknown> | null) ?? {}),
  }));
}

// ---- Create and links ---------------------------------------------------------------------

export type DecisionLinkKind = "risk" | "issue" | "change" | "dependency" | "benefit" | "milestone";
const linkTable = {
  risk: ["decision_risks", "risk_id"],
  issue: ["decision_issues", "issue_id"],
  change: ["decision_change_requests", "change_request_id"],
  dependency: ["decision_dependencies", "dependency_id"],
  benefit: ["decision_benefits", "benefit_id"],
  milestone: ["decision_milestones", "milestone_id"],
} as const;

export interface LinkTarget {
  id: string;
  label: string;
}
export type LinkTargets = Record<DecisionLinkKind, LinkTarget[]>;

/** Records on a project a decision can link to. */
export async function listDecisionLinkTargets(projectId: string): Promise<LinkTargets> {
  const [risks, issues, changes, deps, benefits, milestones] = await Promise.all([
    supabase.from("risks").select("id, ref, title").eq("project_id", projectId).order("ref"),
    supabase.from("issues").select("id, ref, title").eq("project_id", projectId).order("ref"),
    supabase
      .from("change_requests")
      .select("id, ref, title")
      .eq("project_id", projectId)
      .order("ref"),
    supabase
      .from("dependencies")
      .select("id, ref, description")
      .or(`giver_project_id.eq.${projectId},receiver_project_id.eq.${projectId}`)
      .order("ref"),
    supabase
      .from("benefit_projects")
      .select("benefit_id, benefits(ref, title)")
      .eq("project_id", projectId),
    supabase.from("milestones").select("id, ref, title").eq("project_id", projectId).order("ref"),
  ]);
  const titled = (rows: Array<{ id: string; ref: string; title: string }>) =>
    rows.map((row) => ({ id: row.id, label: `${row.ref} · ${row.title}` }));
  return {
    risk: titled(unwrap(risks, "Loading risks")),
    issue: titled(unwrap(issues, "Loading issues")),
    change: titled(unwrap(changes, "Loading change requests")),
    dependency: unwrap(deps, "Loading dependencies").map((row) => ({
      id: row.id,
      label: `${row.ref} · ${row.description ?? ""}`,
    })),
    benefit: unwrap(benefits, "Loading benefits").map((row) => ({
      id: row.benefit_id,
      label: row.benefits ? `${row.benefits.ref} · ${row.benefits.title}` : row.benefit_id,
    })),
    milestone: titled(unwrap(milestones, "Loading milestones")),
  };
}

export interface DecisionOptionInput {
  /** Set for an existing option, so editing keeps its id. */
  id?: string | undefined;
  title: string;
  pros: string[];
  cons: string[];
}

export interface NewDecisionInput {
  scope: { projectId?: string | null; programmeId?: string | null; portfolioId?: string | null };
  title: string;
  context: string;
  options: DecisionOptionInput[];
  decisionMakerId: string | null;
  forumId: string | null;
  neededBy: string;
  impact: Record<"scope" | "cost" | "time" | "benefits", { impacted: boolean; note: string }>;
  evidenceLink: string;
  links: Partial<Record<DecisionLinkKind, string[]>>;
}

const cleanList = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

/** New Pending decision with its options and links (status is always pending on insert). */
export async function createDecision(input: NewDecisionInput) {
  const title = requireText(input.title, "Give the decision a title.");
  const options = input.options.filter((option) => option.title.trim());
  if (options.length < 2) throw new ServiceError("invalid", "Add at least two options.");
  if (!input.neededBy) throw new ServiceError("invalid", "Set a needed-by date.");
  const written = await insertRow(
    "decisions",
    {
      ...(input.scope.projectId && { project_id: input.scope.projectId }),
      ...(input.scope.programmeId && { programme_id: input.scope.programmeId }),
      ...(input.scope.portfolioId && { portfolio_id: input.scope.portfolioId }),
      title,
      context: input.context.trim() || null,
      decision_maker_id: input.decisionMakerId,
      forum_id: input.forumId,
      needed_by_date: input.neededBy,
      ...impactFields(input.impact),
      evidence_link: input.evidenceLink.trim() || null,
    },
    "Creating the decision",
  );
  await insertRows(
    "decision_options",
    options.map((option, index) => ({
      decision_id: written.id,
      title: option.title.trim(),
      pros: cleanList(option.pros),
      cons: cleanList(option.cons),
      sort_order: index,
    })),
    "Saving the options",
  );
  for (const kind of Object.keys(linkTable) as DecisionLinkKind[])
    for (const targetId of input.links[kind] ?? [])
      await addDecisionLink(written.id, kind, targetId);
  return written;
}

const impactFields = (impact: NewDecisionInput["impact"]) => ({
  impact_scope: impact.scope.impacted,
  impact_scope_note: impact.scope.note.trim() || null,
  impact_cost: impact.cost.impacted,
  impact_cost_note: impact.cost.note.trim() || null,
  impact_time: impact.time.impacted,
  impact_time_note: impact.time.note.trim() || null,
  impact_benefits: impact.benefits.impacted,
  impact_benefits_note: impact.benefits.note.trim() || null,
});

/**
 * Edit a Pending decision in one transaction (update_pending_decision RPC): its content, its
 * options (an option with an id is updated in place, one without is added, an unlisted one is
 * removed) and, when given, whole link lists by kind.
 */
export async function updatePendingDecision(
  id: string,
  input: Omit<NewDecisionInput, "scope" | "links"> | null,
  links: Partial<Record<DecisionLinkKind, string[]>> | null,
  lastSeen: string,
) {
  let fields: Json = {};
  let options: Json | null = null;
  if (input) {
    const title = requireText(input.title, "Give the decision a title.");
    const kept = input.options.filter((option) => option.title.trim());
    if (kept.length < 2) throw new ServiceError("invalid", "Add at least two options.");
    if (!input.neededBy) throw new ServiceError("invalid", "Set a needed-by date.");
    fields = {
      title,
      context: input.context.trim() || null,
      decision_maker_id: input.decisionMakerId,
      forum_id: input.forumId,
      needed_by_date: input.neededBy,
      ...impactFields(input.impact),
      evidence_link: input.evidenceLink.trim() || null,
    };
    options = kept.map((option) => ({
      ...(option.id && { id: option.id }),
      title: option.title.trim(),
      pros: cleanList(option.pros),
      cons: cleanList(option.cons),
    }));
  }
  return unwrap(
    await supabase.rpc("update_pending_decision", {
      p_decision_id: id,
      p_decision: fields,
      ...(options && { p_options: options }),
      ...(links && { p_links: links as Json }),
      p_expected_updated_at: lastSeen,
    }),
    "Saving the decision",
  );
}

/** Link a record to a Pending decision (the database refuses once it isn't Pending). */
export async function addDecisionLink(
  decisionId: string,
  kind: DecisionLinkKind,
  targetId: string,
) {
  const [name, column] = linkTable[kind];
  return insertRow(
    name,
    { decision_id: decisionId, [column]: targetId } as never,
    "Linking the record",
  );
}

/** Update a resulting action (editable in every status). */
export async function updateDecisionAction(
  id: string,
  input: { status?: DecisionAction["status"]; ownerId?: string | null; dueDate?: string | null },
  lastSeen?: string | null,
) {
  const value = { Open: "open", "In progress": "in_progress", Done: "done" } as const;
  return updateRow(
    "decision_actions",
    id,
    {
      ...(input.status && { status: value[input.status] }),
      ...(input.ownerId !== undefined && { owner_id: input.ownerId }),
      ...(input.dueDate !== undefined && { due_date: input.dueDate }),
    },
    { context: "Saving the action", lastSeen },
  );
}

/**
 * Supersede a made decision (supersede_decision RPC): a new pending decision with the same
 * scope, content, options and links, pointing back at the original. The original stays Made
 * until the new one is recorded.
 */
export async function supersedeDecision(decision: ResolvedDecision, neededBy: string) {
  return unwrap(
    await supabase.rpc("supersede_decision", {
      p_decision_id: decision.id,
      p_needed_by: neededBy,
      p_expected_updated_at: decision.updatedAt,
    }),
    "Creating the superseding decision",
  );
}

export interface DecisionInput {
  forumId?: string | null;
  neededBy?: string;
  title?: string;
  decisionMakerId?: string | null;
}

export async function updateDecision(id: string, input: DecisionInput, lastSeen?: string | null) {
  const fields = {
    ...(input.title !== undefined && { title: input.title.trim() }),
    ...(input.forumId !== undefined && { forum_id: input.forumId }),
    ...(input.neededBy !== undefined && { needed_by_date: input.neededBy }),
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
