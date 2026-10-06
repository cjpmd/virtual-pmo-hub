// Portfolio → programme → project, read from Supabase.
//
// Pattern every Supabase-backed service follows:
//   - plain async functions, no React: (orgId, …args) → Promise<ViewModel>
//   - one supabase-js call per table/view, run in parallel, joined here by id
//   - health and other derived values come from the database views (v_*), never computed here
//   - every result goes through unwrap()/unwrapWrite(), so failures are ServiceErrors
//   - RLS decides visibility; the org filter is for index use and to keep the cache honest
// The React side (TanStack Query hooks) lives in src/hooks/use-hierarchy.ts.
import type { Health } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import {
  entityStateLabel,
  priorityLabel,
  projectStateLabel,
  tierLabel,
  toHealth,
  type EntityStateLabel,
  type ProjectStateLabel,
  type TierLabel,
} from "./labels";
import { ServiceError, unwrap, unwrapMaybe } from "./service-error";
import type { Priority } from "@/data/types";

export interface Person {
  id: string;
  name: string;
  email: string | null;
  jobTitle: string | null;
  isBookable: boolean;
}

export interface Phase {
  id: string;
  name: string;
  shortName: string;
  gateName: string | null;
  index: number;
}

export interface PortfolioSummary {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  state: EntityStateLabel;
  closedReason: string | null;
  ownerId: string | null;
  ownerName: string;
  budget: number;
  health: Health;
  updatedAt: string;
}

export interface ProgrammeSummary {
  id: string;
  portfolioId: string;
  workspaceId: string;
  managerId: string | null;
  sponsorId: string | null;
  projectManagerId: string | null;
  projectOfficerId: string | null;
  closedReason: string | null;
  updatedAt: string;
  name: string;
  description: string | null;
  state: EntityStateLabel;
  managerName: string;
  projectManagerName: string | null;
  projectOfficerName: string | null;
  sponsorName: string;
  startDate: string | null;
  finishDate: string | null;
  budget: number;
  valueStatement: string | null;
  health: Health;
  benefitHealth: Health;
}

export interface ProjectHealth {
  overall: Health;
  schedule: Health;
  financial: Health;
  effort: Health;
  issue: Health;
  benefit: Health;
  isOverridden: boolean;
  forecastFinishDate: string | null;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  workspaceId: string;
  managerId: string | null;
  projectOfficerId: string | null;
  sponsorId: string | null;
  phaseId: string | null;
  closedReason: string | null;
  updatedAt: string | null;
  portfolioId: string | null;
  programmeId: string | null;
  programmeName: string;
  state: ProjectStateLabel;
  priority: Priority;
  tier: TierLabel;
  phaseName: string;
  phaseIndex: number;
  managerName: string;
  projectOfficerName: string | null;
  sponsorName: string;
  startDate: string | null;
  finishDate: string | null;
  baselineFinishDate: string | null;
  budget: number;
  actual: number;
  forecast: number;
  health: ProjectHealth;
  taskCount: number;
  overdueTaskCount: number;
  averagePercentComplete: number;
  openRisks: number;
  openIssues: number;
  /** Reporting date of the latest status report, if any. */
  lastReportDate: string | null;
}

export interface ProjectDetail extends ProjectSummary {
  businessCase: string | null;
  benefitsSummary: string | null;
  taskSource: string;
}

export interface ProjectPermissions {
  canEdit: boolean;
  canDelete: boolean;
  canManageProject: boolean;
}

const nameOf = (
  people: Map<string, Person>,
  id: string | null | undefined,
  fallback = "Unassigned",
) => (id && people.get(id)?.name) || fallback;
const num = (value: number | null | undefined) => Number(value ?? 0);

// ---- Reference data ---------------------------------------------------------------

export async function listPeople(orgId: string): Promise<Person[]> {
  const rows = unwrap(
    await supabase
      .from("resources")
      .select("id, name, email, job_title, is_bookable")
      .eq("organisation_id", orgId)
      .order("name"),
    "Loading people",
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    jobTitle: row.job_title,
    isBookable: row.is_bookable,
  }));
}

export async function listPhases(orgId: string): Promise<Phase[]> {
  const rows = unwrap(
    await supabase
      .from("lifecycle_phases")
      .select("id, name, short_name, gate_name, sort_order")
      .eq("organisation_id", orgId)
      .order("sort_order"),
    "Loading lifecycle phases",
  );
  return rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    gateName: row.gate_name,
    index,
  }));
}

// ---- Portfolios and programmes ------------------------------------------------------

export async function listPortfolios(orgId: string): Promise<PortfolioSummary[]> {
  const [portfolios, health, people] = await Promise.all([
    supabase
      .from("portfolios")
      .select(
        "id, workspace_id, name, description, state, closed_reason, owner_id, budget, updated_at",
      )
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("v_portfolio_health")
      .select("portfolio_id, overall")
      .eq("organisation_id", orgId),
    listPeople(orgId),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const healthById = new Map(
    unwrap(health, "Loading portfolio health").map((h) => [h.portfolio_id, h.overall]),
  );
  return unwrap(portfolios, "Loading portfolios").map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    state: entityStateLabel[row.state],
    closedReason: row.closed_reason,
    ownerId: row.owner_id,
    ownerName: nameOf(byId, row.owner_id),
    budget: num(row.budget),
    health: toHealth(healthById.get(row.id)),
    updatedAt: row.updated_at,
  }));
}

export async function listProgrammes(orgId: string): Promise<ProgrammeSummary[]> {
  const [programmes, health, people] = await Promise.all([
    supabase
      .from("programmes")
      .select(
        "id, portfolio_id, workspace_id, name, description, state, closed_reason, manager_id, project_manager_id, project_officer_id, sponsor_id, start_date, finish_date, budget, value_statement, updated_at",
      )
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("v_programme_health")
      .select("programme_id, overall, benefit")
      .eq("organisation_id", orgId),
    listPeople(orgId),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const healthById = new Map(
    unwrap(health, "Loading programme health").map((h) => [h.programme_id, h]),
  );
  return unwrap(programmes, "Loading programmes").map((row) => ({
    id: row.id,
    portfolioId: row.portfolio_id,
    workspaceId: row.workspace_id,
    managerId: row.manager_id,
    sponsorId: row.sponsor_id,
    projectManagerId: row.project_manager_id,
    projectOfficerId: row.project_officer_id,
    closedReason: row.closed_reason,
    updatedAt: row.updated_at,
    name: row.name,
    description: row.description,
    state: entityStateLabel[row.state],
    managerName: nameOf(byId, row.manager_id),
    projectManagerName: row.project_manager_id ? nameOf(byId, row.project_manager_id) : null,
    projectOfficerName: row.project_officer_id ? nameOf(byId, row.project_officer_id) : null,
    sponsorName: nameOf(byId, row.sponsor_id),
    startDate: row.start_date,
    finishDate: row.finish_date,
    budget: num(row.budget),
    valueStatement: row.value_statement,
    health: toHealth(healthById.get(row.id)?.overall),
    benefitHealth: toHealth(healthById.get(row.id)?.benefit),
  }));
}

export async function getProgramme(orgId: string, programmeId: string): Promise<ProgrammeSummary> {
  const programme = (await listProgrammes(orgId)).find((item) => item.id === programmeId);
  if (!programme)
    throw new ServiceError(
      "not_found",
      "We couldn't find that programme. It may have been archived, or you may not have access.",
    );
  return programme;
}

// ---- Projects -----------------------------------------------------------------------

const PROJECT_COLUMNS =
  "id, code, name, workspace_id, effective_portfolio_id, programme_id, state, closed_reason, priority, tier, phase_id, phase_index, manager_id, project_officer_id, sponsor_id, start_date, finish_date, baseline_finish_date, budget, actual, forecast, business_case, benefits_summary, task_source, updated_at";

type ProjectRow = {
  id: string | null;
  code: string | null;
  name: string | null;
  workspace_id: string | null;
  effective_portfolio_id: string | null;
  programme_id: string | null;
  state: keyof typeof projectStateLabel | null;
  priority: keyof typeof priorityLabel | null;
  tier: keyof typeof tierLabel | null;
  phase_id: string | null;
  phase_index: number | null;
  manager_id: string | null;
  project_officer_id: string | null;
  sponsor_id: string | null;
  start_date: string | null;
  finish_date: string | null;
  baseline_finish_date: string | null;
  budget: number | null;
  actual: number | null;
  forecast: number | null;
  business_case: string | null;
  benefits_summary: string | null;
  task_source: string | null;
  closed_reason: string | null;
  updated_at: string | null;
};

/** Everything a project list or page needs besides the project rows themselves. */
async function loadProjectContext(orgId: string, projectIds?: string[]) {
  const scope = <T extends { in: (column: string, values: string[]) => T }>(
    query: T,
    column = "project_id",
  ) => (projectIds ? query.in(column, projectIds) : query);
  const [health, stats, risks, issues, reports, programmes, people, phases] = await Promise.all([
    scope(
      supabase
        .from("v_project_health")
        .select(
          "project_id, overall, schedule, financial, effort, issue, benefit, is_overridden, forecast_finish_date",
        )
        .eq("organisation_id", orgId),
    ),
    scope(
      supabase
        .from("v_project_task_stats")
        .select("project_id, task_count, overdue_count, avg_percent_complete")
        .eq("organisation_id", orgId),
    ),
    scope(
      supabase
        .from("risks")
        .select("project_id")
        .eq("organisation_id", orgId)
        .eq("status", "open")
        .not("project_id", "is", null),
    ),
    scope(
      supabase
        .from("issues")
        .select("project_id")
        .eq("organisation_id", orgId)
        .eq("status", "open")
        .not("project_id", "is", null),
    ),
    scope(
      supabase
        .from("status_reports")
        .select("project_id, reporting_date")
        .eq("organisation_id", orgId)
        .order("reporting_date", { ascending: false }),
    ),
    supabase.from("programmes").select("id, name").eq("organisation_id", orgId),
    listPeople(orgId),
    listPhases(orgId),
  ]);
  const count = (rows: { project_id: string | null }[]) => {
    const map = new Map<string, number>();
    for (const row of rows)
      if (row.project_id) map.set(row.project_id, (map.get(row.project_id) ?? 0) + 1);
    return map;
  };
  return {
    health: new Map(unwrap(health, "Loading project health").map((h) => [h.project_id, h])),
    stats: new Map(unwrap(stats, "Loading task progress").map((s) => [s.project_id, s])),
    openRisks: count(unwrap(risks, "Loading risks")),
    openIssues: count(unwrap(issues, "Loading issues")),
    lastReport: unwrap(reports, "Loading status reports").reduce((map, row) => {
      if (!map.has(row.project_id)) map.set(row.project_id, row.reporting_date);
      return map;
    }, new Map<string, string>()),
    programmes: new Map(unwrap(programmes, "Loading programmes").map((p) => [p.id, p.name])),
    people: new Map(people.map((p) => [p.id, p])),
    phases: new Map(phases.map((p) => [p.id, p])),
  };
}

function toProjectSummary(
  row: ProjectRow,
  context: Awaited<ReturnType<typeof loadProjectContext>>,
): ProjectSummary {
  const id = row.id ?? "";
  const health = context.health.get(id);
  const stats = context.stats.get(id);
  const phase = row.phase_id ? context.phases.get(row.phase_id) : undefined;
  return {
    id,
    code: row.code ?? "",
    managerId: row.manager_id,
    projectOfficerId: row.project_officer_id,
    sponsorId: row.sponsor_id,
    phaseId: row.phase_id,
    closedReason: row.closed_reason,
    updatedAt: row.updated_at,
    name: row.name ?? "",
    workspaceId: row.workspace_id ?? "",
    portfolioId: row.effective_portfolio_id,
    programmeId: row.programme_id,
    programmeName: (row.programme_id && context.programmes.get(row.programme_id)) || "No programme",
    state: projectStateLabel[row.state ?? "proposed"],
    priority: priorityLabel[row.priority ?? "moderate"],
    tier: tierLabel[row.tier ?? "medium"],
    phaseName: phase?.name ?? "Not set",
    phaseIndex: row.phase_index ?? phase?.index ?? 0,
    managerName: nameOf(context.people, row.manager_id),
    projectOfficerName: row.project_officer_id
      ? nameOf(context.people, row.project_officer_id)
      : null,
    sponsorName: nameOf(context.people, row.sponsor_id),
    startDate: row.start_date,
    finishDate: row.finish_date,
    baselineFinishDate: row.baseline_finish_date,
    budget: num(row.budget),
    actual: num(row.actual),
    forecast: num(row.forecast),
    health: {
      overall: toHealth(health?.overall),
      schedule: toHealth(health?.schedule),
      financial: toHealth(health?.financial),
      effort: toHealth(health?.effort),
      issue: toHealth(health?.issue),
      benefit: toHealth(health?.benefit),
      isOverridden: health?.is_overridden ?? false,
      forecastFinishDate: health?.forecast_finish_date ?? null,
    },
    taskCount: stats?.task_count ?? 0,
    overdueTaskCount: stats?.overdue_count ?? 0,
    averagePercentComplete: Math.round(num(stats?.avg_percent_complete)),
    openRisks: context.openRisks.get(id) ?? 0,
    openIssues: context.openIssues.get(id) ?? 0,
    lastReportDate: context.lastReport.get(id) ?? null,
  };
}

/** Every visible, non-archived project in the organisation (v_projects excludes archived rows). */
export async function listProjects(orgId: string): Promise<ProjectSummary[]> {
  const [projects, context] = await Promise.all([
    supabase.from("v_projects").select(PROJECT_COLUMNS).eq("organisation_id", orgId).order("name"),
    loadProjectContext(orgId),
  ]);
  return unwrap(projects, "Loading projects").map((row) => toProjectSummary(row, context));
}

/** One project by its code (codes are unique per organisation, uppercase). */
export async function getProjectByCode(orgId: string, code: string): Promise<ProjectDetail> {
  const row = unwrapMaybe(
    await supabase
      .from("v_projects")
      .select(PROJECT_COLUMNS)
      .eq("organisation_id", orgId)
      .eq("code", code.toUpperCase())
      .maybeSingle(),
    "Loading the project",
  );
  if (!row?.id)
    throw new ServiceError(
      "not_found",
      `We couldn't find project ${code.toUpperCase()}. It may have been archived, or you may not have access.`,
    );
  const context = await loadProjectContext(orgId, [row.id]);
  return {
    ...toProjectSummary(row, context),
    businessCase: row.business_case,
    benefitsSummary: row.benefits_summary,
    taskSource: row.task_source ?? "manual",
  };
}

export async function getProjectPermissions(projectId: string): Promise<ProjectPermissions> {
  const rows = unwrap(
    await supabase.rpc("project_permissions", { p_project: projectId }),
    "Checking your permissions",
  );
  const row = rows[0];
  return {
    canEdit: row?.can_edit ?? false,
    canDelete: row?.can_delete ?? false,
    canManageProject: row?.can_manage_project ?? false,
  };
}

/** The signed-in user's own resource (person) record in the organisation, if linked. */
export async function getMyResourceId(orgId: string, userId: string): Promise<string | null> {
  const row = unwrapMaybe(
    await supabase
      .from("resources")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("profile_id", userId)
      .maybeSingle(),
    "Loading your profile",
  );
  return row?.id ?? null;
}
