// Portfolios, programmes and projects: create, edit, close/reopen and archive.
//
// Closing keeps the item in reports and history (state = closed, with a reason); archiving
// hides it everywhere (archived_at). Nothing in the hierarchy is ever deleted: clients have no
// delete grant on these tables. Rights follow RLS: portfolios need PMO, programmes and
// projects need manager in the workspace.
import type { Database } from "@/integrations/supabase/types";
import type { Priority } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import type { NewRow } from "./db";
import { unwrap } from "./service-error";
import { priorityValue, projectStateValue, type ProjectStateLabel } from "./labels";
import { insertRow, insertRows, rememberOwnWrite, updateRow, versionToSend } from "./write";

type Enums = Database["public"]["Enums"];
type Tier = "Small" | "Medium" | "Large";
const tierValue: Record<Tier, Enums["project_tier"]> = {
  Small: "small",
  Medium: "medium",
  Large: "large",
};

export type Kind = "portfolios" | "programmes" | "projects";
const noun: Record<Kind, string> = {
  portfolios: "portfolio",
  programmes: "programme",
  projects: "project",
};

// ---- Close, reopen, archive (all three levels) --------------------------------------------

export async function closeEntity(kind: Kind, id: string, reason: string, lastSeen: string | null) {
  return updateRow(kind, id, { state: "closed", closed_reason: reason.trim() } as never, {
    context: `Closing the ${noun[kind]}`,
    lastSeen,
  });
}

export async function reopenEntity(kind: Kind, id: string, lastSeen: string | null) {
  return updateRow(kind, id, { state: "active", closed_reason: null } as never, {
    context: `Reopening the ${noun[kind]}`,
    lastSeen,
  });
}

/** Hide the item everywhere. Archived items stay in the database for audit. */
export async function archiveEntity(kind: Kind, id: string, lastSeen: string | null) {
  return updateRow(
    kind,
    id,
    { archived_at: new Date().toISOString() },
    {
      context: `Archiving the ${noun[kind]}`,
      lastSeen,
    },
  );
}

// ---- Portfolios ----------------------------------------------------------------------------

export interface PortfolioInput {
  name: string;
  description: string;
  ownerId: string | null;
  budget: number;
}

export async function createPortfolio(workspaceId: string, input: PortfolioInput) {
  // The workspace is the portfolio's parent; the tenant guard fills organisation_id from it.
  const row = {
    workspace_id: workspaceId,
    name: input.name.trim(),
    description: input.description.trim() || null,
    owner_id: input.ownerId,
    budget: input.budget,
  } as unknown as NewRow<"portfolios">;
  return insertRow("portfolios", row, "Creating the portfolio");
}

export async function updatePortfolio(id: string, input: PortfolioInput, lastSeen: string | null) {
  return updateRow(
    "portfolios",
    id,
    {
      name: input.name.trim(),
      description: input.description.trim() || null,
      owner_id: input.ownerId,
      budget: input.budget,
    },
    { context: "Saving the portfolio", lastSeen },
  );
}

// ---- Programmes ----------------------------------------------------------------------------

export interface ProgrammeInput {
  portfolioId: string;
  name: string;
  description: string;
  managerId: string | null;
  sponsorId: string | null;
  projectManagerId: string | null;
  projectOfficerId: string | null;
  startDate: string | null;
  finishDate: string | null;
  budget: number;
  valueStatement: string;
}

const programmeFields = (input: ProgrammeInput) => ({
  portfolio_id: input.portfolioId,
  name: input.name.trim(),
  description: input.description.trim() || null,
  manager_id: input.managerId,
  sponsor_id: input.sponsorId,
  project_manager_id: input.projectManagerId,
  project_officer_id: input.projectOfficerId,
  start_date: input.startDate,
  finish_date: input.finishDate,
  budget: input.budget,
  value_statement: input.valueStatement.trim() || null,
});

export async function createProgramme(input: ProgrammeInput) {
  return insertRow("programmes", programmeFields(input), "Creating the programme");
}

export async function updateProgramme(id: string, input: ProgrammeInput, lastSeen: string | null) {
  return updateRow("programmes", id, programmeFields(input), {
    context: "Saving the programme",
    lastSeen,
  });
}

// ---- Projects ------------------------------------------------------------------------------

export interface ProjectInput {
  name: string;
  programmeId: string | null;
  phaseId: string | null;
  state: ProjectStateLabel;
  priority: Priority;
  managerId: string | null;
  projectOfficerId: string | null;
  sponsorId: string | null;
  startDate: string | null;
  finishDate: string | null;
  businessCase: string;
}

/**
 * Change a project's tier (PMO and admins only; the database refuses a plain update of `tier`).
 * The reason is stored in the audit log. Returns the project's new updated_at.
 */
export async function changeProjectTier(
  id: string,
  tier: Tier,
  reason: string,
  lastSeen: string | null,
) {
  const updatedAt = unwrap(
    await supabase.rpc("change_project_tier", {
      p_project: id,
      p_tier: tierValue[tier],
      p_reason: reason.trim(),
      ...(lastSeen ? { p_last_seen: versionToSend("projects", id, lastSeen) ?? lastSeen } : {}),
    }),
    "Changing the tier",
  );
  rememberOwnWrite("projects", id, updatedAt);
  return updatedAt;
}

export interface TierChange {
  changedAt: string;
  from: Tier;
  to: Tier;
  reason: string | null;
  changedBy: string | null;
}

type TierHistoryRow = Database["public"]["Functions"]["project_tier_history"]["Returns"][number];
const tierName: Record<Enums["project_tier"], Tier> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/** A history row as the screens use it. */
export const toTierChange = (row: TierHistoryRow): TierChange => ({
  changedAt: row.changed_at,
  from: tierName[row.from_tier],
  to: tierName[row.to_tier],
  reason: row.reason?.trim() || null,
  changedBy: row.changed_by || null,
});

/** The project's tier changes, newest first, with reasons (from the audit log). */
export async function getProjectTierHistory(projectId: string): Promise<TierChange[]> {
  const rows = unwrap(
    await supabase.rpc("project_tier_history", { p_project: projectId }),
    "Loading the tier history",
  );
  return (rows ?? []).map(toTierChange);
}

/**
 * Budget, actuals and forecast are no longer project fields: they live in the financials
 * (budget baselines, cost lines and monthly values; docs/financials-and-business-cases.md).
 */
export async function updateProject(id: string, input: ProjectInput, lastSeen: string | null) {
  return updateRow(
    "projects",
    id,
    {
      name: input.name.trim(),
      programme_id: input.programmeId,
      phase_id: input.phaseId,
      state: projectStateValue[input.state],
      ...(input.state !== "Closed" && { closed_reason: null }),
      priority: priorityValue[input.priority],
      manager_id: input.managerId,
      project_officer_id: input.projectOfficerId,
      sponsor_id: input.sponsorId,
      start_date: input.startDate,
      finish_date: input.finishDate,
      business_case: input.businessCase.trim() || null,
    },
    { context: "Saving the project", lastSeen },
  );
}

export interface NewProjectInput {
  name: string;
  portfolioId: string;
  programmeId: string | null;
  phaseId: string | null;
  tier: Tier;
  managerId: string | null;
  sponsorId: string | null;
  startDate: string | null;
  finishDate: string | null;
  budget: number;
  businessCase: string;
  taskSource: Enums["task_source"];
  collectionIds: string[];
}

/**
 * Create a project (the database assigns its code) and add it to collections. A budget above 0
 * becomes the project's first budget baseline (source "initial"). Returns the id and code.
 */
export async function createProject(input: NewProjectInput) {
  const project = await insertRow(
    "projects",
    {
      name: input.name.trim(),
      // A project under a programme takes its portfolio from the programme.
      ...(input.programmeId
        ? { programme_id: input.programmeId }
        : { portfolio_id: input.portfolioId }),
      phase_id: input.phaseId,
      state: "active",
      priority: "moderate",
      tier: tierValue[input.tier],
      manager_id: input.managerId,
      sponsor_id: input.sponsorId,
      start_date: input.startDate,
      finish_date: input.finishDate,
      baseline_finish_date: input.finishDate,
      business_case: input.businessCase.trim() || null,
      task_source: input.taskSource,
    } as NewRow<"projects">,
    "Creating the project",
  );
  if (input.budget > 0)
    await insertRow(
      "budget_baselines",
      {
        project_id: project.id,
        total: input.budget,
        source: "initial",
      } as NewRow<"budget_baselines">,
      "Setting the project budget",
    );
  await insertRows(
    "collection_projects",
    input.collectionIds.map((collectionId) => ({
      collection_id: collectionId,
      project_id: project.id,
    })),
    "Adding the project to collections",
  );
  const row = unwrap(
    await supabase.from("projects").select("code").eq("id", project.id).single(),
    "Loading the new project",
  );
  return { id: project.id, code: row.code };
}
