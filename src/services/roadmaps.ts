// Roadmaps: rows, items and key dates. Linked items take their title, dates, progress, health
// and owner from the project through v_roadmap_items; key date status comes from
// v_roadmap_key_dates. Rows embed under the roadmap (single FK); items and key dates are read
// from the views, which PostgREST can't embed.
import type { Priority, RoadmapHealth, RoadmapKeyDate } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { listPeople } from "./hierarchy";
import { milestoneStatusLabel, priorityLabel } from "./labels";
import { unwrap } from "./service-error";
import { updateRow } from "./write";

export interface RoadmapRowView {
  id: string;
  name: string;
  programmeId: string | null;
  collectionId: string | null;
}

export interface ResolvedRoadmapItem {
  id: string;
  rowId: string;
  title: string;
  kind: "Linked" | "Standalone";
  projectId?: string;
  projectCode?: string;
  start: string;
  finish: string;
  progress: number;
  health: RoadmapHealth;
  owner?: string;
  priority?: Priority;
  collectionIds: string[];
  collectionNames: string[];
  programmeId?: string;
  programmeName: string;
  projectManager: string;
  updatedAt: string | null;
}

export interface RoadmapView {
  id: string;
  name: string;
  description: string;
  owner: string;
  portfolioId: string | null;
  workspaceId: string;
  rows: RoadmapRowView[];
  items: ResolvedRoadmapItem[];
  keyDates: RoadmapKeyDate[];
}

/** v_roadmap_items health → roadmap label. Red is always "High risk" (see migration roadmap_red_is_red). */
const roadmapHealth = (health: string | null, done: boolean | null): RoadmapHealth =>
  done
    ? "Done"
    : health === "red"
      ? "High risk"
      : health === "amber"
        ? "At risk"
        : health === "green"
          ? "On track"
          : "Not set";

export async function listRoadmaps(orgId: string): Promise<RoadmapView[]> {
  const [
    roadmaps,
    items,
    keyDates,
    itemCollections,
    collections,
    projects,
    programmes,
    raw,
    people,
  ] = await Promise.all([
    supabase
      .from("roadmaps")
      .select(
        "id, name, description, owner_id, portfolio_id, workspace_id, roadmap_rows(id, name, programme_id, collection_id, sort_order)",
      )
      .eq("organisation_id", orgId)
      .order("name"),
    supabase
      .from("v_roadmap_items")
      .select(
        "id, roadmap_id, row_id, project_id, sort_order, is_linked, title, start_date, finish_date, progress, health, is_done, owner_id, priority, programme_id",
      )
      .eq("organisation_id", orgId)
      .order("sort_order"),
    supabase
      .from("v_roadmap_key_dates")
      .select("id, roadmap_id, title, date, owner_id, status")
      .eq("organisation_id", orgId)
      .order("date"),
    supabase
      .from("roadmap_item_collections")
      .select("roadmap_item_id, collection_id")
      .eq("organisation_id", orgId),
    supabase.from("collections").select("id, name").eq("organisation_id", orgId),
    supabase.from("v_projects").select("id, code, manager_id").eq("organisation_id", orgId),
    supabase.from("programmes").select("id, name").eq("organisation_id", orgId),
    // updated_at for standalone items, which can be rescheduled by dragging.
    supabase.from("roadmap_items").select("id, updated_at").eq("organisation_id", orgId),
    listPeople(orgId),
  ]);
  const names = new Map(people.map((person) => [person.id, person.name]));
  const nameOf = (id: string | null | undefined) => (id && names.get(id)) || "";
  const collectionName = new Map(
    unwrap(collections, "Loading collections").map((row) => [row.id, row.name]),
  );
  const programmeName = new Map(
    unwrap(programmes, "Loading programmes").map((row) => [row.id, row.name]),
  );
  const projectById = new Map(
    unwrap(projects, "Loading projects").map((row) => [row.id ?? "", row]),
  );
  const updatedAt = new Map(
    unwrap(raw, "Loading roadmap items").map((row) => [row.id, row.updated_at]),
  );
  const links = unwrap(itemCollections, "Loading roadmap collections");
  const itemRows = unwrap(items, "Loading roadmap items");
  const dateRows = unwrap(keyDates, "Loading key dates");
  return unwrap(roadmaps, "Loading roadmaps").map((roadmap) => ({
    id: roadmap.id,
    name: roadmap.name,
    description: roadmap.description ?? "",
    owner: nameOf(roadmap.owner_id) || "Unassigned",
    portfolioId: roadmap.portfolio_id,
    workspaceId: roadmap.workspace_id,
    rows: [...(roadmap.roadmap_rows ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) => ({
        id: row.id,
        name: row.name,
        programmeId: row.programme_id,
        collectionId: row.collection_id,
      })),
    items: itemRows
      .filter((item) => item.roadmap_id === roadmap.id)
      .map((item): ResolvedRoadmapItem => {
        const project = item.project_id ? projectById.get(item.project_id) : undefined;
        const collectionIds = links
          .filter((link) => link.roadmap_item_id === item.id)
          .map((link) => link.collection_id);
        return {
          id: item.id ?? "",
          rowId: item.row_id ?? "",
          title: item.title ?? "",
          kind: item.is_linked ? "Linked" : "Standalone",
          ...(item.project_id && { projectId: item.project_id }),
          ...(project?.code && { projectCode: project.code }),
          start: item.start_date ?? "",
          finish: item.finish_date ?? "",
          progress: item.progress ?? 0,
          health: roadmapHealth(item.health, item.is_done),
          ...(item.owner_id && { owner: nameOf(item.owner_id) }),
          ...(item.priority && { priority: priorityLabel[item.priority] }),
          collectionIds,
          collectionNames: collectionIds.map((id) => collectionName.get(id) ?? ""),
          ...(item.programme_id && { programmeId: item.programme_id }),
          programmeName:
            (item.programme_id && programmeName.get(item.programme_id)) || "No programme",
          projectManager: nameOf(project?.manager_id ?? item.owner_id) || "Unassigned",
          updatedAt: updatedAt.get(item.id ?? "") ?? null,
        };
      }),
    keyDates: dateRows
      .filter((date) => date.roadmap_id === roadmap.id)
      .map((date) => ({
        id: date.id ?? "",
        title: date.title ?? "",
        date: date.date ?? "",
        status: milestoneStatusLabel(date.status),
        owner: nameOf(date.owner_id),
      })),
  }));
}

/** Reschedule a standalone (unlinked) roadmap item. PMO only (RLS). */
export async function rescheduleRoadmapItem(
  id: string,
  start: string,
  finish: string,
  lastSeen: string | null,
) {
  return updateRow(
    "roadmap_items",
    id,
    { start_date: start, finish_date: finish },
    { context: "Moving the roadmap item", lastSeen },
  );
}
