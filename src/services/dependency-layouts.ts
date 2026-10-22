// The shared dependency map layout on Supabase (dependency_map_layouts, work package 1.5).
// Today's map is organisation-wide: one row with no portfolio or programme. Everyone reads it;
// PMO / admin save it. The update sends positions only (the only column the update grant
// allows) with the updated_at it loaded, through the shared write helper.
//
// Concurrent drags: when a save finds someone else saved first (a conflict), the caller
// reloads the saved layout, re-applies only the nodes this user moved since loading
// (mergeMovedNodes) and saves again.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { NewRow } from "./db";
import { isServiceError, unwrapMaybe } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

export type NodePositions = Record<string, { x: number; y: number }>;

export interface SavedLayout {
  id: string;
  positions: NodePositions;
  updatedAt: string;
}

/** Positions from stored JSON; entries that aren't {x, y} numbers are dropped. */
export function parsePositions(raw: unknown): NodePositions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: NodePositions = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const point = value as { x?: unknown; y?: unknown } | null;
    if (
      point &&
      typeof point.x === "number" &&
      typeof point.y === "number" &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
    )
      result[id] = { x: point.x, y: point.y };
  }
  return result;
}

/**
 * The layout to save after a conflict: the latest saved layout, with this user's moves (the
 * nodes in `moved`, at their positions in `mine`) on top. Everyone else's moves are kept.
 */
export function mergeMovedNodes(
  latest: NodePositions,
  mine: NodePositions,
  moved: Iterable<string>,
): NodePositions {
  const merged = { ...latest };
  for (const id of moved) {
    const point = mine[id];
    if (point) merged[id] = point;
  }
  return merged;
}

/** The organisation's map layout, or null when none has been saved. */
export async function getOrganisationLayout(orgId: string): Promise<SavedLayout | null> {
  const row = unwrapMaybe(
    await supabase
      .from("dependency_map_layouts")
      .select("id, positions, updated_at")
      .eq("organisation_id", orgId)
      .is("portfolio_id", null)
      .is("programme_id", null)
      .maybeSingle(),
    "Loading the map layout",
  );
  return row
    ? { id: row.id, positions: parsePositions(row.positions), updatedAt: row.updated_at }
    : null;
}

/** Save the organisation's layout: create it the first time, then update it with concurrency. */
export function saveOrganisationLayout(
  orgId: string,
  saved: Pick<SavedLayout, "id" | "updatedAt"> | null,
  positions: NodePositions,
) {
  return saved
    ? updateRow(
        "dependency_map_layouts",
        saved.id,
        { positions: positions as Json },
        { context: "Saving the map layout", lastSeen: saved.updatedAt },
      )
    : insertRow(
        "dependency_map_layouts",
        {
          organisation_id: orgId,
          positions: positions as Json,
        } as NewRow<"dependency_map_layouts">,
        "Saving the map layout",
      );
}

/**
 * Save this user's layout. If someone else saved since it was loaded, reload the saved
 * layout, re-apply only the nodes this user moved, and save once more. Returns the layout as
 * saved, so the map can show everyone's moves.
 */
export async function saveLayoutMerging(input: {
  orgId: string;
  saved: SavedLayout | null;
  positions: NodePositions;
  moved: Iterable<string>;
}): Promise<SavedLayout> {
  const moved = [...input.moved];
  try {
    const written = await saveOrganisationLayout(input.orgId, input.saved, input.positions);
    return { id: written.id, positions: input.positions, updatedAt: written.updatedAt ?? "" };
  } catch (error) {
    if (!isServiceError(error) || error.kind !== "conflict") throw error;
    const latest = await getOrganisationLayout(input.orgId);
    const merged = mergeMovedNodes(latest?.positions ?? {}, input.positions, moved);
    const written = await saveOrganisationLayout(input.orgId, latest, merged);
    return { id: written.id, positions: merged, updatedAt: written.updatedAt ?? "" };
  }
}

/** Reset: delete the saved layout, so the map goes back to its automatic arrangement. */
export const deleteLayout = (id: string) =>
  deleteRows("dependency_map_layouts", [id], "Resetting the map layout");
