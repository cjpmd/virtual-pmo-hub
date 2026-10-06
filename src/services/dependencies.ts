// Dependencies between programmes, projects, milestones and external parties, read from and
// written to Supabase. The register, the map and the project/programme tabs all use this one
// service, so their linked endpoints stay valid across views.
//
// Health, boundary and acceptance come from v_dependency_health. Risk and issue links embed
// (single FK each). Endpoint names come from parallel project, programme and milestone reads,
// because a dependency points at each of those twice (giver and receiver), which would make
// embedding ambiguous.
import type {
  Dependency,
  DependencyBoundary,
  DependencyEnd,
  DependencyType,
  Health,
} from "@/data/types";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { daysFromToday } from "@/lib/today";
import { listPeople, type Person } from "./hierarchy";
import { healthLabel, toHealth } from "./labels";
import { ServiceError, unwrap } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

type Enums = Database["public"]["Enums"];
const invert = <K extends string, V extends string>(map: Record<K, V>) =>
  Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<V, K>;

export const dependencyTypeLabel: Record<Enums["dependency_type"], DependencyType> = {
  sequencing: "Sequencing",
  alignment: "Alignment",
  information: "Information",
  resource: "Resource",
  external: "External",
};
const dependencyTypeValue = invert(dependencyTypeLabel);
export const validationLabel: Record<Enums["dependency_validation"], Dependency["validation"]> = {
  inferred: "Inferred",
  proposed: "Proposed",
  confirmed: "Confirmed",
  closed: "Closed",
  broken: "Broken",
};
const validationValue = invert(validationLabel);
const criticalityLabel: Record<Enums["criticality"], Dependency["criticality"]> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
const criticalityValue = invert(criticalityLabel);
const boundaryLabel: Record<string, DependencyBoundary> = {
  within_programme: "Within programme",
  cross_programme: "Cross-programme",
  cross_pm: "Cross-PM",
  cross_portfolio: "Cross-portfolio",
};
const acceptanceLabel: Record<string, string> = {
  closed: "Closed",
  confirmed: "Confirmed",
  awaiting_both: "Awaiting both",
  awaiting_giver: "Awaiting giver",
  awaiting_receiver: "Awaiting receiver",
};
const healthValue = invert(healthLabel);

export const dependencyTypes: DependencyType[] = [
  "Sequencing",
  "Alignment",
  "Information",
  "Resource",
  "External",
];
export const dependencyValidations: Dependency["validation"][] = [
  "Inferred",
  "Proposed",
  "Confirmed",
  "Closed",
  "Broken",
];

/** An endpoint with the names the screens show, resolved at load. */
export interface ResolvedEnd extends DependencyEnd {
  ownerId: string | null;
  projectName?: string;
  projectCode?: string;
  programmeName?: string;
  programmeManager?: string;
  milestoneTitle?: string;
}

export interface EndMilestone {
  id: string;
  title: string;
  forecastDate: string;
  baselineDate: string;
  actualDate: string | null;
}

export interface ResolvedDependency extends Omit<Dependency, "giver" | "receiver"> {
  giver: ResolvedEnd;
  receiver: ResolvedEnd;
  workspaceId: string;
  giverLabel: string;
  receiverLabel: string;
  giverProgrammeId: string | undefined;
  receiverProgrammeId: string | undefined;
  giverProgrammeName: string;
  receiverProgrammeName: string;
  giverPm: string;
  receiverPm: string;
  boundary: DependencyBoundary;
  health: Health;
  healthReason: string;
  acceptance: string;
  daysToRequiredBy: number;
  giverMilestone: EndMilestone | undefined;
  updatedAt: string;
}

export interface DependencyProject {
  id: string;
  code: string;
  name: string;
  programmeId: string | null;
  workspaceId: string;
  managerName: string;
  milestones: EndMilestone[];
}
export interface DependencyProgramme {
  id: string;
  name: string;
  workspaceId: string;
  manager: string;
}

export interface DependenciesData {
  dependencies: ResolvedDependency[];
  projects: DependencyProject[];
  programmes: DependencyProgramme[];
  people: Person[];
}

export async function loadDependencies(orgId: string): Promise<DependenciesData> {
  const [dependencies, health, projects, programmes, milestones, people] = await Promise.all([
    supabase
      .from("dependencies")
      .select(
        `id, ref, workspace_id, giver_programme_id, giver_project_id, giver_milestone_id,
         receiver_programme_id, receiver_project_id, receiver_milestone_id, giver_external_name,
         receiver_external_name, type, description, required_by_date, criticality, validation,
         giver_accepted, receiver_accepted, health_override, raised_date, giver_owner_id,
         receiver_owner_id, raised_by_id, updated_at,
         dependency_risks(risk_id), dependency_issues(issue_id)`,
      )
      .eq("organisation_id", orgId)
      .order("ref"),
    supabase
      .from("v_dependency_health")
      .select("dependency_id, health, boundary, acceptance_state, slip_working_days")
      .eq("organisation_id", orgId),
    supabase
      .from("v_projects")
      .select("id, code, name, programme_id, workspace_id, manager_id")
      .eq("organisation_id", orgId)
      .order("name"),
    supabase
      .from("programmes")
      .select("id, name, workspace_id, manager_id, project_manager_id")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("milestones")
      .select("id, project_id, title, forecast_date, baseline_date, actual_date")
      .eq("organisation_id", orgId)
      .order("forecast_date"),
    listPeople(orgId),
  ]);
  const names = new Map(people.map((person) => [person.id, person.name]));
  const nameOf = (id: string | null | undefined) => (id && names.get(id)) || "";
  const milestoneRows = unwrap(milestones, "Loading milestones");
  const milestonesByProject = new Map<string, EndMilestone[]>();
  for (const row of milestoneRows)
    milestonesByProject.set(row.project_id, [
      ...(milestonesByProject.get(row.project_id) ?? []),
      {
        id: row.id,
        title: row.title,
        forecastDate: row.forecast_date,
        baselineDate: row.baseline_date,
        actualDate: row.actual_date,
      },
    ]);
  const projectRows: DependencyProject[] = unwrap(projects, "Loading projects").map((row) => ({
    id: row.id ?? "",
    code: row.code ?? "",
    name: row.name ?? "",
    programmeId: row.programme_id,
    workspaceId: row.workspace_id ?? "",
    managerName: nameOf(row.manager_id),
    milestones: milestonesByProject.get(row.id ?? "") ?? [],
  }));
  const programmeRows: DependencyProgramme[] = unwrap(programmes, "Loading programmes").map(
    (row) => ({
      id: row.id,
      name: row.name,
      workspaceId: row.workspace_id,
      // Boundary follows the programmes' assigned project managers (Prompt I1).
      manager: nameOf(row.project_manager_id) || nameOf(row.manager_id),
    }),
  );
  const projectById = new Map(projectRows.map((row) => [row.id, row]));
  const programmeById = new Map(programmeRows.map((row) => [row.id, row]));
  const healthById = new Map(
    unwrap(health, "Loading dependency health").map((row) => [row.dependency_id, row]),
  );

  const end = (
    programmeId: string | null,
    projectId: string | null,
    milestoneId: string | null,
    externalName: string | null,
    ownerId: string | null,
  ): ResolvedEnd => {
    const project = projectId ? projectById.get(projectId) : undefined;
    const programme = programmeById.get(programmeId ?? project?.programmeId ?? "");
    const milestone = milestoneId
      ? project?.milestones.find((item) => item.id === milestoneId)
      : undefined;
    const kind: DependencyEnd["kind"] = externalName
      ? "External"
      : milestoneId
        ? "Milestone"
        : projectId
          ? "Project"
          : "Programme";
    return {
      kind,
      owner: nameOf(ownerId),
      ownerId,
      ...(programme && {
        programmeId: programme.id,
        programmeName: programme.name,
        programmeManager: programme.manager,
      }),
      ...(project && {
        projectId: project.id,
        projectName: project.name,
        projectCode: project.code,
      }),
      ...(milestoneId && { milestoneId }),
      ...(milestone && { milestoneTitle: milestone.title }),
      ...(externalName && { externalName }),
    };
  };

  const items = unwrap(dependencies, "Loading dependencies").map((row): ResolvedDependency => {
    const giver = end(
      row.giver_programme_id,
      row.giver_project_id,
      row.giver_milestone_id,
      row.giver_external_name,
      row.giver_owner_id,
    );
    const receiver = end(
      row.receiver_programme_id,
      row.receiver_project_id,
      row.receiver_milestone_id,
      row.receiver_external_name,
      row.receiver_owner_id,
    );
    const view = healthById.get(row.id);
    const giverMilestone =
      giver.milestoneId && giver.projectId
        ? projectById.get(giver.projectId)?.milestones.find((item) => item.id === giver.milestoneId)
        : undefined;
    const validation = validationLabel[row.validation];
    const type = dependencyTypeLabel[row.type];
    const acceptance = acceptanceLabel[view?.acceptance_state ?? ""] ?? "Awaiting both";
    const requiredBy = row.required_by_date ?? "";
    return {
      id: row.id,
      reference: row.ref,
      giver,
      receiver,
      type,
      description: row.description ?? "",
      requiredBy,
      criticality: criticalityLabel[row.criticality],
      validation,
      giverAccepted: row.giver_accepted,
      receiverAccepted: row.receiver_accepted,
      riskIds: (row.dependency_risks ?? []).map((link) => link.risk_id),
      issueIds: (row.dependency_issues ?? []).map((link) => link.issue_id),
      ...(row.health_override && { healthOverride: toHealth(row.health_override) }),
      raisedDate: row.raised_date ?? "",
      raisedBy: nameOf(row.raised_by_id),
      workspaceId: row.workspace_id,
      giverLabel: describeEnd(giver),
      receiverLabel: describeEnd(receiver),
      giverProgrammeId: giver.programmeId,
      receiverProgrammeId: receiver.programmeId,
      giverProgrammeName: giver.programmeName ?? giver.externalName ?? "External",
      receiverProgrammeName: receiver.programmeName ?? receiver.externalName ?? "External",
      giverPm: giver.programmeManager || "External",
      receiverPm: receiver.programmeManager || "External",
      boundary: boundaryLabel[view?.boundary ?? ""] ?? "Cross-programme",
      health: toHealth(view?.health),
      healthReason: healthReason({
        validation,
        type,
        giverMilestone,
        slip: view?.slip_working_days ?? null,
        requiredBy,
        confirmed: acceptance === "Confirmed" || acceptance === "Closed",
      }),
      acceptance,
      daysToRequiredBy: daysFromToday(requiredBy) ?? 0,
      giverMilestone,
      updatedAt: row.updated_at,
    };
  });
  return { dependencies: items, projects: projectRows, programmes: programmeRows, people };
}

export function describeEnd(end: ResolvedEnd) {
  if (end.kind === "External") return end.externalName ?? "External party";
  if (end.kind === "Milestone")
    return end.milestoneTitle
      ? `${end.projectName ?? "Project"} · ${end.milestoneTitle}`
      : (end.projectName ?? "Project");
  if (end.projectId) return end.projectName ?? "Project";
  return end.programmeName ?? "Programme";
}
export const getEndProgrammeId = (end: ResolvedEnd) => end.programmeId;

/** Why the dependency has its health, in words. The health itself comes from the view. */
function healthReason(input: {
  validation: Dependency["validation"];
  type: DependencyType;
  giverMilestone: EndMilestone | undefined;
  slip: number | null;
  requiredBy: string;
  confirmed: boolean;
}) {
  const { validation, type, giverMilestone, slip, requiredBy, confirmed } = input;
  if (validation === "Broken")
    return "The giving side has confirmed it cannot meet this dependency.";
  if (type === "Sequencing" && giverMilestone && !giverMilestone.actualDate && slip !== null) {
    if (slip > 0)
      return `${giverMilestone.title} is forecast ${slip} working days after the required-by date.`;
    return `${giverMilestone.title} is forecast ${-slip} working days before the required-by date.`;
  }
  if ((daysFromToday(requiredBy) ?? 0) < 0 && validation !== "Closed")
    return "The required-by date has passed.";
  if (!confirmed) return "Both owners must accept before this dependency is confirmed.";
  return "Forecast to be met before the required-by date.";
}

// ---- Pure helpers -------------------------------------------------------------------------

export function getDependencyMetrics(items: ResolvedDependency[]) {
  return {
    total: items.length,
    crossPm: items.filter((item) => item.boundary === "Cross-PM").length,
    awaiting: items.filter((item) => item.acceptance.startsWith("Awaiting")).length,
    offTrack: items.filter((item) => item.health === "Off Track").length,
    atRisk: items.filter((item) => item.health === "At Risk").length,
    inferred: items.filter((item) => item.validation === "Inferred").length,
    external: items.filter(
      (item) =>
        item.type === "External" ||
        item.giver.kind === "External" ||
        item.receiver.kind === "External",
    ).length,
  };
}

/** Dependencies touching a project or programme, split into what it relies on and what relies on it. */
export function getDependenciesFor(
  scope: { projectId?: string; programmeId?: string },
  items: ResolvedDependency[],
) {
  const matches = (end: ResolvedEnd) =>
    (scope.projectId ? end.projectId === scope.projectId : false) ||
    (scope.programmeId ? end.programmeId === scope.programmeId : false);
  return {
    weDependOn: items.filter((item) => matches(item.receiver)),
    dependsOnUs: items.filter((item) => matches(item.giver)),
  };
}

/** Agenda for the PM sync: cross-PM dependencies that need a conversation (Prompt I1). */
export function getDependencySyncAgenda(items: ResolvedDependency[]) {
  const crossPm = items.filter(
    (item) => item.boundary === "Cross-PM" || item.boundary === "Cross-portfolio",
  );
  return {
    offTrack: crossPm.filter((item) => item.health === "Off Track"),
    awaitingConfirmation: crossPm.filter((item) => item.acceptance.startsWith("Awaiting")),
    dueSoon: crossPm.filter((item) => item.daysToRequiredBy >= 0 && item.daysToRequiredBy <= 30),
  };
}

export const dependencyLineStyle = (type: DependencyType) =>
  type === "Sequencing"
    ? "solid"
    : type === "Alignment"
      ? "dashed"
      : type === "Information"
        ? "dotted"
        : type === "Resource"
          ? "dashed"
          : "solid";
export const dependencyStrokeDash = (type: DependencyType) =>
  type === "Sequencing"
    ? undefined
    : type === "Alignment"
      ? "8 5"
      : type === "Information"
        ? "2 4"
        : type === "Resource"
          ? "12 4"
          : "6 3";
export const healthStroke = (health: Health) =>
  health === "Off Track"
    ? "var(--health-bad)"
    : health === "At Risk"
      ? "var(--health-warn)"
      : health === "On Track"
        ? "var(--health-good)"
        : "var(--border)";

// ---- Writes -------------------------------------------------------------------------------

export interface EndInput {
  kind: DependencyEnd["kind"];
  programmeId?: string | null;
  projectId?: string | null;
  milestoneId?: string | null;
  externalName?: string | null;
  ownerId?: string | null;
}

export interface DependencyInput {
  giver?: EndInput;
  receiver?: EndInput;
  type?: DependencyType;
  description?: string;
  requiredBy?: string;
  criticality?: Dependency["criticality"];
  validation?: Dependency["validation"];
  giverAccepted?: boolean;
  receiverAccepted?: boolean;
  healthOverride?: Health | null;
  healthOverrideReason?: string | null;
}

const endFields = (side: "giver" | "receiver", end: EndInput) => {
  const external = end.kind === "External";
  return {
    [`${side}_programme_id`]: external ? null : (end.programmeId ?? null),
    [`${side}_project_id`]: external ? null : (end.projectId ?? null),
    [`${side}_milestone_id`]: end.kind === "Milestone" ? (end.milestoneId ?? null) : null,
    [`${side}_external_name`]: external ? end.externalName?.trim() || "External party" : null,
    [`${side}_owner_id`]: end.ownerId ?? null,
  };
};

const dependencyFields = (input: DependencyInput) => ({
  ...(input.giver && endFields("giver", input.giver)),
  ...(input.receiver && endFields("receiver", input.receiver)),
  ...(input.type !== undefined && { type: dependencyTypeValue[input.type] }),
  ...(input.description !== undefined && { description: input.description.trim() }),
  ...(input.requiredBy !== undefined && { required_by_date: input.requiredBy }),
  ...(input.criticality !== undefined && { criticality: criticalityValue[input.criticality] }),
  ...(input.validation !== undefined && { validation: validationValue[input.validation] }),
  ...(input.giverAccepted !== undefined && { giver_accepted: input.giverAccepted }),
  ...(input.receiverAccepted !== undefined && { receiver_accepted: input.receiverAccepted }),
  ...(input.healthOverride !== undefined && {
    health_override: input.healthOverride ? healthValue[input.healthOverride] : null,
    health_override_reason: input.healthOverride
      ? (input.healthOverrideReason ?? "Set by PMO")
      : null,
  }),
});

export async function createDependency(
  input: DependencyInput & { giver: EndInput; receiver: EndInput; requiredBy: string },
  raisedById: string | null,
  today: string,
) {
  if (!input.description?.trim())
    throw new ServiceError("invalid", "Describe what the receiving side needs.");
  return insertRow(
    "dependencies",
    {
      ...dependencyFields(input),
      raised_by_id: raisedById,
      raised_date: today,
    } as never,
    "Adding the dependency",
  );
}

export async function updateDependency(
  id: string,
  input: DependencyInput,
  lastSeen?: string | null,
) {
  const fields = dependencyFields(input);
  if (!Object.keys(fields).length) return;
  return updateRow("dependencies", id, fields as never, {
    context: "Saving the dependency",
    lastSeen,
  });
}

/** Managers only (RLS). */
export async function deleteDependencies(ids: string[]) {
  await deleteRows("dependencies", ids, "Deleting the dependency");
}

/**
 * Raise a risk or issue from a dependency, in the receiving project (or the giving one when the
 * receiver is a programme or external), and link it back to the dependency.
 */
export async function raiseFromDependency(input: {
  dependency: ResolvedDependency;
  kind: "Risk" | "Issue";
  title: string;
  description: string;
  ownerId: string | null;
  date: string | null;
}) {
  const { dependency } = input;
  const projectId = dependency.receiver.projectId ?? dependency.giver.projectId;
  const programmeId = dependency.receiver.programmeId ?? dependency.giver.programmeId;
  if (!projectId && !programmeId)
    throw new ServiceError(
      "invalid",
      "This dependency has no project or programme to hold the item.",
    );
  if (!input.title.trim()) throw new ServiceError("invalid", "Give it a title.");
  const scope = projectId ? { project_id: projectId } : { programme_id: programmeId ?? null };
  if (input.kind === "Risk") {
    const risk = await insertRow(
      "risks",
      {
        ...scope,
        title: input.title.trim(),
        description: input.description,
        owner_id: input.ownerId,
        review_date: input.date,
        probability: 3,
        impact: 4,
      },
      "Raising the risk",
    );
    await insertRow(
      "dependency_risks",
      { dependency_id: dependency.id, risk_id: risk.id },
      "Linking the risk",
    );
    return risk;
  }
  const issue = await insertRow(
    "issues",
    {
      ...scope,
      title: input.title.trim(),
      description: input.description,
      owner_id: input.ownerId,
      due_date: input.date,
    },
    "Raising the issue",
  );
  await insertRow(
    "dependency_issues",
    { dependency_id: dependency.id, issue_id: issue.id },
    "Linking the issue",
  );
  return issue;
}
