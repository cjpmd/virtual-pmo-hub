// Workspaces and workspace membership (work package 1.6). Organisation admins create, rename,
// describe, archive and delete workspaces; organisation admins and the workspace's own admins
// manage its members (RLS). An archived workspace is read-only and stays visible: the role
// helpers cap everyone at viewer there. The database keeps one active workspace per
// organisation, and a workspace holding records can't be deleted (foreign keys), only archived.
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "./auth";
import type { NewRow } from "./db";
import { ServiceError, unwrap } from "./service-error";
import { deleteRow, deleteRows, insertRow, updateRow } from "./write";

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  updatedAt: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  profileId: string;
  name: string;
  email: string;
  role: AppRole;
  updatedAt: string;
}

/** The organisation's workspaces the user can see (all of them for PMO / admin), active first. */
export async function listWorkspaces(orgId: string): Promise<Workspace[]> {
  const rows = unwrap(
    await supabase
      .from("workspaces")
      .select("id, name, description, archived_at, updated_at")
      .eq("organisation_id", orgId)
      .order("name"),
    "Loading workspaces",
  );
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      archivedAt: row.archived_at,
      updatedAt: row.updated_at,
    }))
    .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt));
}

export interface WorkspaceInput {
  name: string;
  description: string;
}

const cleaned = (input: WorkspaceInput) => {
  const name = input.name.trim();
  if (!name) throw new ServiceError("invalid", "Give the workspace a name.");
  return { name, description: input.description.trim() || null };
};

export async function createWorkspace(orgId: string, input: WorkspaceInput) {
  // The organisation is a workspace's own column, not one the tenant guard fills.
  const row: NewRow<"workspaces"> & { organisation_id: string } = {
    organisation_id: orgId,
    ...cleaned(input),
  };
  return insertRow("workspaces", row, "Creating the workspace");
}

export async function updateWorkspace(workspace: Workspace, input: WorkspaceInput) {
  return updateRow("workspaces", workspace.id, cleaned(input), {
    context: "Saving the workspace",
    lastSeen: workspace.updatedAt,
  });
}

/** Archive (read-only, still visible) or bring back. The database stamps archived_by. */
export async function setWorkspaceArchived(workspace: Workspace, archived: boolean) {
  return updateRow(
    "workspaces",
    workspace.id,
    { archived_at: archived ? new Date().toISOString() : null },
    {
      context: archived ? "Archiving the workspace" : "Restoring the workspace",
      lastSeen: workspace.updatedAt,
    },
  );
}

/** Only an empty workspace can be deleted; one holding records is archived instead. */
export async function deleteWorkspace(workspace: Workspace) {
  try {
    await deleteRows("workspaces", [workspace.id], "Deleting the workspace");
  } catch (error) {
    if (error instanceof ServiceError && error.code === "23503")
      throw new ServiceError(
        "invalid",
        `Deleting the workspace: ${workspace.name} still holds records. Archive it instead.`,
        { code: error.code, detail: error.detail, cause: error },
      );
    throw error;
  }
}

/** Members listed on the workspace (organisation PMO / admin act in every workspace as well). */
export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const rows = unwrap(
    await supabase
      .from("workspace_members")
      .select("workspace_id, profile_id, role, updated_at")
      .eq("workspace_id", workspaceId),
    "Loading workspace members",
  );
  const ids = rows.map((row) => row.profile_id);
  const profiles = ids.length
    ? unwrap(
        await supabase.from("profiles").select("id, display_name, email").in("id", ids),
        "Loading workspace members",
      )
    : [];
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return rows
    .map((row) => ({
      workspaceId: row.workspace_id,
      profileId: row.profile_id,
      name: byId.get(row.profile_id)?.display_name ?? "Unknown",
      email: byId.get(row.profile_id)?.email ?? "",
      role: row.role,
      updatedAt: row.updated_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addWorkspaceMember(workspaceId: string, profileId: string, role: AppRole) {
  // The trigger fills organisation_id from the workspace; workspace_id is part of the key.
  const row: NewRow<"workspace_members"> & { workspace_id: string } = {
    workspace_id: workspaceId,
    profile_id: profileId,
    role,
  };
  return insertRow("workspace_members", row, "Adding the member");
}

export async function changeWorkspaceMemberRole(member: WorkspaceMember, role: AppRole) {
  return updateRow(
    "workspace_members",
    { workspace_id: member.workspaceId, profile_id: member.profileId },
    { role },
    { context: `Changing ${member.name}'s role`, lastSeen: member.updatedAt },
  );
}

export async function removeWorkspaceMember(member: WorkspaceMember) {
  await deleteRow(
    "workspace_members",
    { workspace_id: member.workspaceId, profile_id: member.profileId },
    `Removing ${member.name}`,
  );
}
