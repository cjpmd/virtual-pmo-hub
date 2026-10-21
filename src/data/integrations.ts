// Microsoft 365 integration types and the static list of Microsoft permissions the connect flow
// explains. The records themselves (ms_connections, project_plan_links, sync_outbox,
// sync_conflicts, sync_log) are read and written through services/integrations.ts.

export type ConnectionStatus =
  "Not connected" | "Pending approval" | "Connected" | "Needs reconnect";
export type PlanKind = "Basic" | "Premium";

export interface MsPermission {
  name: string;
  api: "Microsoft Graph" | "Dataverse";
  type: "Delegated" | "Application";
  why: string;
}
export interface MsConnection {
  tenantName: string;
  tenantDomain: string;
  status: ConnectionStatus;
  connectedBy?: string | undefined;
  connectedOn?: string | undefined;
  environments: string[];
  adminRequestSentTo?: string | undefined;
  directorySyncedAt: string;
  directoryPeople: number;
}
export interface DiscoveredPlan {
  id: string;
  name: string;
  kind: PlanKind;
  container: string;
  tasks: number;
  suggestedProjectId?: string | undefined;
  matchReason?: string | undefined;
}
export interface PlanLink {
  projectId: string;
  planId: string;
  kind: PlanKind;
  lastSync: string;
  mode: "Polling (5 min)" | "Live updates" | "Change tracking";
  health: "Healthy" | "Warning" | "Failing";
}
export interface OutboxItem {
  id: string;
  projectId: string;
  change: string;
  by: string;
  queuedAt: string;
  status: "Queued" | "Sending" | "Retrying" | "Failed";
  attempts: number;
  lastError?: string | undefined;
}
export interface SyncConflict {
  id: string;
  projectId: string;
  task: string;
  field: string;
  plannerValue: string;
  ourValue: string;
  changedInPlannerBy: string;
  at: string;
  resolved?: "Kept Planner" | "Reapplied" | undefined;
}
export interface SyncLogEntry {
  id: string;
  at: string;
  projectId?: string | undefined;
  kind: "Read" | "Write" | "Throttled" | "Failed" | "Deleted" | "Directory";
  message: string;
}

export const requiredPermissions: MsPermission[] = [
  {
    name: "User.Read, openid, profile, offline_access",
    api: "Microsoft Graph",
    type: "Delegated",
    why: "Sign you in and keep you connected",
  },
  {
    name: "Tasks.ReadWrite",
    api: "Microsoft Graph",
    type: "Delegated",
    why: "Edit Planner Basic tasks as yourself",
  },
  {
    name: "Group.Read.All",
    api: "Microsoft Graph",
    type: "Delegated",
    why: "List the groups and plans you can see",
  },
  {
    name: "Tasks.ReadWrite.All",
    api: "Microsoft Graph",
    type: "Application",
    why: "Keep Planner Basic plans in sync in the background",
  },
  {
    name: "User.Read.All, Group.Read.All",
    api: "Microsoft Graph",
    type: "Application",
    why: "Build the people directory and find plans",
  },
  {
    name: "user_impersonation",
    api: "Dataverse",
    type: "Delegated",
    why: "Read and update Planner Premium plans as yourself",
  },
];
