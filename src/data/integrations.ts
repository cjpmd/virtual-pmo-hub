// Mock Microsoft 365 integration data. Shapes mirror the planned sync tables
// (ms_connections, project_plan_links, sync_outbox, sync_conflicts, sync_log)
// so a real backend can replace this file without changing screens.

export type ConnectionStatus = "Not connected" | "Pending approval" | "Connected" | "Needs reconnect";
export type PlanKind = "Basic" | "Premium";

export interface MsPermission { name: string; api: "Microsoft Graph" | "Dataverse"; type: "Delegated" | "Application"; why: string }
export interface MsConnection { tenantName: string; tenantDomain: string; status: ConnectionStatus; connectedBy?: string | undefined; connectedOn?: string | undefined; environments: string[]; adminRequestSentTo?: string | undefined; directorySyncedAt: string; directoryPeople: number }
export interface DiscoveredPlan { id: string; name: string; kind: PlanKind; container: string; tasks: number; suggestedProjectId?: string | undefined; matchReason?: string | undefined }
export interface PlanLink { projectId: string; planId: string; kind: PlanKind; lastSync: string; mode: "Polling (5 min)" | "Live updates" | "Change tracking"; health: "Healthy" | "Warning" | "Failing" }
export interface OutboxItem { id: string; projectId: string; change: string; by: string; queuedAt: string; status: "Queued" | "Sending" | "Retrying" | "Failed"; attempts: number; lastError?: string | undefined }
export interface SyncConflict { id: string; projectId: string; task: string; field: string; plannerValue: string; ourValue: string; changedInPlannerBy: string; at: string; resolved?: "Kept Planner" | "Reapplied" | undefined }
export interface SyncLogEntry { id: string; at: string; projectId?: string | undefined; kind: "Read" | "Write" | "Throttled" | "Failed" | "Deleted" | "Directory"; message: string }

export const requiredPermissions: MsPermission[] = [
  { name: "User.Read, openid, profile, offline_access", api: "Microsoft Graph", type: "Delegated", why: "Sign you in and keep you connected" },
  { name: "Tasks.ReadWrite", api: "Microsoft Graph", type: "Delegated", why: "Edit Planner Basic tasks as yourself" },
  { name: "Group.Read.All", api: "Microsoft Graph", type: "Delegated", why: "List the groups and plans you can see" },
  { name: "Tasks.ReadWrite.All", api: "Microsoft Graph", type: "Application", why: "Keep Planner Basic plans in sync in the background" },
  { name: "User.Read.All, Group.Read.All", api: "Microsoft Graph", type: "Application", why: "Build the people directory and find plans" },
  { name: "user_impersonation", api: "Dataverse", type: "Delegated", why: "Read and update Planner Premium plans as yourself" },
];

export const discoveredPlanSeeds: Omit<DiscoveredPlan, "suggestedProjectId" | "matchReason">[] = [
  { id: "pp-ebbot", name: "Ebbot Chatbot", kind: "Premium", container: "dundee.crm11.dynamics.com", tasks: 48 },
  { id: "pp-vxrail", name: "Improve Infrastructure Resilience (VXRail)", kind: "Premium", container: "dundee.crm11.dynamics.com", tasks: 63 },
  { id: "pp-win11", name: "Windows 11 Rollout", kind: "Premium", container: "dundee.crm11.dynamics.com", tasks: 71 },
  { id: "pp-cyber", name: "Reduce Our Cyber Risk", kind: "Premium", container: "dundee.crm11.dynamics.com", tasks: 55 },
  { id: "pb-acct", name: "Account creation automation", kind: "Basic", container: "DTS Applications team", tasks: 22 },
  { id: "pb-sd", name: "Service Desk improvements", kind: "Basic", container: "DTS Service Desk", tasks: 17 },
  { id: "pb-misc", name: "Team social committee", kind: "Basic", container: "DTS All Staff", tasks: 9 },
];

export const outboxSeed: Omit<OutboxItem, "projectId">[] = [
  { id: "ob1", change: "Set ‘Configure intent library’ to 60% complete", by: "Chris McDonald", queuedAt: "25/09/2026 13:41", status: "Sending", attempts: 1 },
  { id: "ob2", change: "Move finish of ‘UAT sign-off’ to 16/10/2026", by: "Aisha Rahman", queuedAt: "25/09/2026 13:32", status: "Retrying", attempts: 3, lastError: "429 Too many requests. Retrying in 30 seconds" },
  { id: "ob3", change: "Assign Owen Price to ‘Firewall rule review’", by: "Chris McDonald", queuedAt: "25/09/2026 11:05", status: "Failed", attempts: 5, lastError: "Update failed in Planner. Open in Planner to check" },
];

export const conflictSeed: Omit<SyncConflict, "projectId">[] = [
  { id: "cf1", task: "Knowledge base migration", field: "Finish date", plannerValue: "30/10/2026", ourValue: "23/10/2026", changedInPlannerBy: "Aisha Rahman", at: "25/09/2026 10:14" },
  { id: "cf2", task: "Patch cluster nodes", field: "% complete", plannerValue: "40%", ourValue: "55%", changedInPlannerBy: "Owen Price", at: "24/09/2026 16:52" },
];

export const logSeed: Omit<SyncLogEntry, "projectId">[] = [
  { id: "l1", at: "25/09/2026 13:45", kind: "Read", message: "Read 3 changed tasks using change tracking" },
  { id: "l2", at: "25/09/2026 13:33", kind: "Throttled", message: "Microsoft asked us to slow down. Waiting 30 seconds" },
  { id: "l3", at: "25/09/2026 13:20", kind: "Write", message: "Update applied. Planner recalculated 4 dependent tasks" },
  { id: "l4", at: "25/09/2026 11:06", kind: "Failed", message: "Update failed. Open in Planner to check" },
  { id: "l5", at: "25/09/2026 09:12", kind: "Deleted", message: "Task ‘Old test plan’ deleted in Planner. Kept in history" },
  { id: "l6", at: "25/09/2026 02:00", kind: "Directory", message: "Nightly directory sync: 412 people updated" },
];
