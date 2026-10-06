// Microsoft 365 / Planner integration state, on Supabase: the organisation's connection
// (ms_connections, one row per organisation), plan links, the outbox of changes waiting to
// go to Planner, conflicts and the sync log.
//
// There is no live Microsoft connection yet (no Entra app registration or sync backend), so
// nothing here pretends to talk to Microsoft. What the screens can do for real is record an
// admin-consent request, unlink a plan, resolve a recorded conflict and re-queue a failed
// change; the sync backend will fill the rest of these tables when it exists.
import type { Database } from "@/integrations/supabase/types";
import type {
  ConnectionStatus,
  OutboxItem,
  PlanLink,
  SyncConflict,
  SyncLogEntry,
} from "@/data/integrations";
import { supabase } from "@/integrations/supabase/client";
import { listPeople } from "./hierarchy";
import type { NewRow } from "./db";
import { unwrap, unwrapMaybe } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

type Enums = Database["public"]["Enums"];

const statusLabel: Record<Enums["ms_connection_status"], ConnectionStatus> = {
  not_connected: "Not connected",
  pending_approval: "Pending approval",
  connected: "Connected",
  needs_reconnect: "Needs reconnect",
};
const modeLabel: Record<Enums["sync_mode"], PlanLink["mode"]> = {
  polling: "Polling (5 min)",
  live_updates: "Live updates",
  change_tracking: "Change tracking",
};
const healthLabel: Record<Enums["sync_health"], PlanLink["health"]> = {
  healthy: "Healthy",
  warning: "Warning",
  failing: "Failing",
};
const outboxLabel: Record<Enums["outbox_status"], OutboxItem["status"]> = {
  queued: "Queued",
  sending: "Sending",
  retrying: "Retrying",
  failed: "Failed",
};
const logLabel: Record<Enums["sync_log_kind"], SyncLogEntry["kind"]> = {
  read: "Read",
  write: "Write",
  throttled: "Throttled",
  failed: "Failed",
  deleted: "Deleted",
  directory: "Directory",
};
const stamp = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export interface ConnectionView {
  exists: boolean;
  status: ConnectionStatus;
  tenantName: string | null;
  tenantDomain: string | null;
  connectedBy: string | null;
  connectedOn: string | null;
  environments: string[];
  adminRequestSentTo: string | null;
  directorySyncedAt: string | null;
  directoryPeople: number;
}

export interface IntegrationsData {
  connection: ConnectionView;
  links: PlanLink[];
  outbox: (OutboxItem & { updatedAt: string })[];
  conflicts: (SyncConflict & { updatedAt: string })[];
  log: SyncLogEntry[];
  projects: { id: string; code: string; name: string }[];
}

export async function loadIntegrations(orgId: string): Promise<IntegrationsData> {
  const [connection, links, outbox, conflicts, log, projects, people] = await Promise.all([
    supabase
      .from("ms_connections")
      .select(
        "status, tenant_name, tenant_domain, connected_by_id, connected_on, environments, admin_request_sent_to, directory_synced_at, directory_people",
      )
      .eq("organisation_id", orgId)
      .maybeSingle(),
    supabase
      .from("project_plan_links")
      .select("project_id, plan_id, kind, last_sync_at, mode, health")
      .eq("organisation_id", orgId),
    supabase
      .from("sync_outbox")
      .select(
        "id, project_id, change, queued_by_id, queued_at, status, attempts, last_error, updated_at",
      )
      .eq("organisation_id", orgId)
      .order("queued_at", { ascending: false }),
    supabase
      .from("sync_conflicts")
      .select(
        "id, project_id, task, field, planner_value, our_value, changed_in_planner_by, occurred_at, resolution, updated_at",
      )
      .eq("organisation_id", orgId)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("sync_log")
      .select("id, project_id, kind, message, occurred_at")
      .eq("organisation_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase.from("projects").select("id, code, name").eq("organisation_id", orgId).order("name"),
    listPeople(orgId),
  ]);
  const names = new Map(people.map((person) => [person.id, person.name]));
  const row = unwrapMaybe(connection, "Loading the Microsoft 365 connection");
  return {
    connection: {
      exists: Boolean(row),
      status: row ? statusLabel[row.status] : "Not connected",
      tenantName: row?.tenant_name ?? null,
      tenantDomain: row?.tenant_domain ?? null,
      connectedBy: (row?.connected_by_id && names.get(row.connected_by_id)) || null,
      connectedOn: row?.connected_on ?? null,
      environments: row?.environments ?? [],
      adminRequestSentTo: row?.admin_request_sent_to ?? null,
      directorySyncedAt: row?.directory_synced_at ? stamp(row.directory_synced_at) : null,
      directoryPeople: row?.directory_people ?? 0,
    },
    links: unwrap(links, "Loading linked plans").map((link) => ({
      projectId: link.project_id,
      planId: link.plan_id,
      kind: link.kind === "basic" ? "Basic" : "Premium",
      lastSync: stamp(link.last_sync_at) || "Never",
      mode: modeLabel[link.mode],
      health: healthLabel[link.health],
    })),
    outbox: unwrap(outbox, "Loading pending changes").map((item) => ({
      id: item.id,
      projectId: item.project_id,
      change: item.change,
      by: (item.queued_by_id && names.get(item.queued_by_id)) || "Unknown",
      queuedAt: stamp(item.queued_at),
      status: outboxLabel[item.status],
      attempts: item.attempts,
      ...(item.last_error && { lastError: item.last_error }),
      updatedAt: item.updated_at,
    })),
    conflicts: unwrap(conflicts, "Loading conflicts").map((item) => ({
      id: item.id,
      projectId: item.project_id,
      task: item.task,
      field: item.field,
      plannerValue: item.planner_value ?? "",
      ourValue: item.our_value ?? "",
      changedInPlannerBy: item.changed_in_planner_by ?? "someone",
      at: stamp(item.occurred_at),
      ...(item.resolution && {
        resolved:
          item.resolution === "kept_planner" ? ("Kept Planner" as const) : ("Reapplied" as const),
      }),
      updatedAt: item.updated_at,
    })),
    log: unwrap(log, "Loading the sync log").map((entry) => ({
      id: entry.id,
      at: stamp(entry.occurred_at),
      ...(entry.project_id && { projectId: entry.project_id }),
      kind: logLabel[entry.kind],
      message: entry.message,
    })),
    projects: unwrap(projects, "Loading projects"),
  };
}

/** Record that a Microsoft 365 admin has been asked to approve access (admins and PMO). */
export async function requestAdminConsent(orgId: string, exists: boolean, adminEmail: string) {
  const fields = { status: "pending_approval" as const, admin_request_sent_to: adminEmail.trim() };
  if (exists)
    return updateRow("ms_connections", orgId, fields, { context: "Recording the consent request" });
  // ms_connections is keyed by organisation and has no tenant trigger, so the id is sent.
  const row = { organisation_id: orgId, ...fields } as unknown as NewRow<"ms_connections">;
  return insertRow("ms_connections", row, "Recording the consent request");
}

export async function unlinkPlan(projectId: string) {
  return deleteRows("project_plan_links", [projectId], "Unlinking the plan");
}

export async function resolveConflict(
  id: string,
  resolution: "Kept Planner" | "Reapplied",
  lastSeen: string,
) {
  return updateRow(
    "sync_conflicts",
    id,
    { resolution: resolution === "Kept Planner" ? "kept_planner" : "reapplied" },
    { context: "Resolving the conflict", lastSeen },
  );
}

/** Put a failed change back in the queue for the sync service to send. */
export async function retryOutbox(item: { id: string; attempts: number; updatedAt: string }) {
  return updateRow(
    "sync_outbox",
    item.id,
    { status: "queued", last_error: null },
    { context: "Re-queuing the change", lastSeen: item.updatedAt },
  );
}
