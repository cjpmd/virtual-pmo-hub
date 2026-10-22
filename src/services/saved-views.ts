// Board saved views on Supabase (saved_views, work package 1.3). A view belongs to a board
// (board_key) and an owner; shared views are read by everyone in the organisation and edited
// by their owner or PMO / admin. Seeded views stay in code as read-only defaults.
//
// Defaults: a private default is the owner's default for the board; a shared default is the
// board's default for everyone (PMO / admin only). The database keeps one of each and clears
// the previous one when a new one is set. resolveDefaultView picks: my default, else the
// shared default, else the seeded default.
//
// config is jsonb the database only caps in size (32 KB); parseViewConfig reads it defensively,
// so a row written by an older or newer version of the app still opens.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { NewRow } from "./db";
import { unwrap } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

export const BOARD_VIEW_TYPES = ["table", "kanban", "timeline", "calendar", "chart"] as const;
export type BoardViewKind = (typeof BOARD_VIEW_TYPES)[number];

export interface ViewFilter {
  key: string;
  operator: "equals" | "notEquals" | "includes" | "oneOf" | "truthy";
  value?: string | string[];
}
const OPERATORS: ViewFilter["operator"][] = ["equals", "notEquals", "includes", "oneOf", "truthy"];

/** What a view stores: the board settings it applies. */
export interface ViewConfig {
  type: BoardViewKind;
  groupBy: string;
  sortKey: string;
  filter: string;
  filters?: ViewFilter[];
  visible: string[];
}

export interface SavedViewRecord {
  id: string;
  name: string;
  ownerId: string;
  isShared: boolean;
  isDefault: boolean;
  updatedAt: string;
  config: ViewConfig;
}

const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** A stored config as a ViewConfig; anything missing or malformed falls back to `fallback`. */
export function parseViewConfig(raw: unknown, fallback: ViewConfig): ViewConfig {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const type = BOARD_VIEW_TYPES.find((kind) => kind === value["type"]) ?? fallback.type;
  const filters = Array.isArray(value["filters"])
    ? value["filters"].flatMap((item): ViewFilter[] => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        const operator = OPERATORS.find((op) => op === entry["operator"]);
        if (typeof entry["key"] !== "string" || !operator) return [];
        const filterValue = Array.isArray(entry["value"])
          ? strings(entry["value"])
          : typeof entry["value"] === "string"
            ? entry["value"]
            : undefined;
        return [
          {
            key: entry["key"],
            operator,
            ...(filterValue === undefined ? {} : { value: filterValue }),
          },
        ];
      })
    : undefined;
  return {
    type,
    groupBy: text(value["groupBy"], fallback.groupBy),
    sortKey: text(value["sortKey"], fallback.sortKey),
    filter: text(value["filter"], fallback.filter),
    ...(filters?.length ? { filters } : {}),
    visible: Array.isArray(value["visible"]) ? strings(value["visible"]) : fallback.visible,
  };
}

/** The config as stored (versioned, so the shape can change later). */
export const viewConfigJson = (config: ViewConfig): Json =>
  ({ version: 1, ...config }) as unknown as Json;

/**
 * Which view a board opens on: my private default, else the shared (board) default, else the
 * seeded default. Returns the view id, or null when there is nothing to choose.
 */
export function resolveDefaultView(
  records: SavedViewRecord[],
  me: string,
  seededDefaultId: string | null,
): string | null {
  const mine = records.find((view) => view.isDefault && !view.isShared && view.ownerId === me);
  if (mine) return mine.id;
  const shared = records.find((view) => view.isDefault && view.isShared);
  return shared?.id ?? seededDefaultId;
}

/** Whether the signed-in user can change or delete a view (mirrors the RLS policies). */
export function canEditView(view: SavedViewRecord, me: string, canManageShared: boolean) {
  if (view.isShared && canManageShared) return true;
  return view.ownerId === me && !(view.isShared && view.isDefault);
}

export async function listSavedViews(
  orgId: string,
  boardKey: string,
  fallback: ViewConfig,
): Promise<SavedViewRecord[]> {
  const rows = unwrap(
    await supabase
      .from("saved_views")
      .select("id, name, owner_id, is_shared, is_default, updated_at, config")
      .eq("organisation_id", orgId)
      .eq("board_key", boardKey)
      .order("name"),
    "Loading saved views",
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    isShared: row.is_shared,
    isDefault: row.is_default,
    updatedAt: row.updated_at,
    config: parseViewConfig(row.config, fallback),
  }));
}

/** Save a new private view (organisation-wide) for the board. */
export function createSavedView(input: {
  orgId: string;
  boardKey: string;
  name: string;
  config: ViewConfig;
}) {
  return insertRow(
    "saved_views",
    {
      organisation_id: input.orgId,
      board_key: input.boardKey,
      name: input.name.trim(),
      config: viewConfigJson(input.config),
    } as NewRow<"saved_views">,
    "Saving the view",
  );
}

export interface SavedViewPatch {
  name?: string;
  config?: ViewConfig;
  isShared?: boolean;
  isDefault?: boolean;
}

export function updateSavedView(id: string, patch: SavedViewPatch, lastSeen: string) {
  return updateRow(
    "saved_views",
    id,
    {
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.config && { config: viewConfigJson(patch.config) }),
      ...(patch.isShared !== undefined && { is_shared: patch.isShared }),
      ...(patch.isDefault !== undefined && { is_default: patch.isDefault }),
    },
    { context: "Saving the view", lastSeen },
  );
}

export const deleteSavedView = (id: string) => deleteRows("saved_views", [id], "Deleting the view");
