// Insights dashboards on Supabase (dashboards, work package 1.3). A dashboard is an ordered
// list of widgets owned by one person; shared dashboards are read by everyone in the
// organisation and edited by their owner or PMO / admin. Each person may mark one of their
// own dashboards as their default (is_default); the page opens it, else the seeded dashboard.
//
// layout is jsonb the database only caps in size (64 KB); parseDashboardLayout keeps the
// widgets this version of the app knows and drops the rest.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { NewRow } from "./db";
import { unwrap } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

export const DASHBOARD_WIDGETS = [
  "KPI number",
  "RAG donut",
  "Bar chart",
  "Table",
  "Timeline",
  "Milestone list",
  "Workload",
] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

export interface DashboardRecord {
  id: string;
  name: string;
  ownerId: string;
  isShared: boolean;
  isDefault: boolean;
  updatedAt: string;
  widgets: DashboardWidget[];
}

/** The widgets in a stored layout, in order; unknown or malformed entries are dropped. */
export function parseDashboardLayout(raw: unknown): DashboardWidget[] {
  const widgets =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)["widgets"]
      : undefined;
  if (!Array.isArray(widgets)) return [];
  return widgets.flatMap((item) => {
    const type =
      item && typeof item === "object" ? (item as Record<string, unknown>)["type"] : undefined;
    const known = DASHBOARD_WIDGETS.find((widget) => widget === type);
    return known ? [known] : [];
  });
}

export const dashboardLayoutJson = (widgets: DashboardWidget[]): Json => ({
  version: 1,
  widgets: widgets.map((type) => ({ type })),
});

/** Whether the signed-in user can change or delete a dashboard (mirrors the RLS policies). */
export const canEditDashboard = (
  dashboard: DashboardRecord,
  me: string,
  canManageShared: boolean,
) => dashboard.ownerId === me || (dashboard.isShared && canManageShared);

/** The dashboard the page opens on: my default, else null (the seeded dashboard). */
export const defaultDashboardId = (records: DashboardRecord[], me: string) =>
  records.find((record) => record.isDefault && record.ownerId === me)?.id ?? null;

export async function listDashboards(orgId: string): Promise<DashboardRecord[]> {
  const rows = unwrap(
    await supabase
      .from("dashboards")
      .select("id, name, owner_id, is_shared, is_default, updated_at, layout")
      .eq("organisation_id", orgId)
      .order("name"),
    "Loading dashboards",
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    isShared: row.is_shared,
    isDefault: row.is_default,
    updatedAt: row.updated_at,
    widgets: parseDashboardLayout(row.layout),
  }));
}

/** Save a new private dashboard (organisation-wide). */
export function createDashboard(input: {
  orgId: string;
  name: string;
  widgets: DashboardWidget[];
}) {
  return insertRow(
    "dashboards",
    {
      organisation_id: input.orgId,
      name: input.name.trim(),
      layout: dashboardLayoutJson(input.widgets),
    } as NewRow<"dashboards">,
    "Saving the dashboard",
  );
}

export interface DashboardPatch {
  name?: string;
  widgets?: DashboardWidget[];
  isShared?: boolean;
  isDefault?: boolean;
}

export function updateDashboard(id: string, patch: DashboardPatch, lastSeen: string) {
  return updateRow(
    "dashboards",
    id,
    {
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.widgets && { layout: dashboardLayoutJson(patch.widgets) }),
      ...(patch.isShared !== undefined && { is_shared: patch.isShared }),
      ...(patch.isDefault !== undefined && { is_default: patch.isDefault }),
    },
    { context: "Saving the dashboard", lastSeen },
  );
}

export const deleteDashboard = (id: string) =>
  deleteRows("dashboards", [id], "Deleting the dashboard");
