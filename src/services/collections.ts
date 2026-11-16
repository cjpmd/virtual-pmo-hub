// Collections (governance groups, priority sets, funding streams). Collections embed their
// project links (one FK); the collection type is an organisation list read alongside. Their
// packs come from the report builder (collection scope, GL-14).
import type { Health } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { listProjects, type ProjectSummary } from "./hierarchy";
import { unwrap } from "./service-error";

export type CollectionType = "Governance" | "Priority set" | "Funding stream";

export interface CollectionView {
  id: string;
  workspaceId: string;
  name: string;
  type: CollectionType;
  potAmount: number | null;
  projectIds: string[];
  /** Award per project id (funding streams). */
  awards: Record<string, number>;
}

const asType = (label: string | undefined): CollectionType =>
  label === "Priority set" || label === "Funding stream" ? label : "Governance";

export async function listCollections(orgId: string): Promise<CollectionView[]> {
  const [collections, types] = await Promise.all([
    supabase
      .from("collections")
      .select(
        "id, workspace_id, name, type_id, pot_amount, collection_projects(project_id, award_amount)",
      )
      .eq("organisation_id", orgId)
      .order("name"),
    supabase
      .from("lookup_values")
      .select("id, label")
      .eq("organisation_id", orgId)
      .eq("list_key", "collection_type"),
  ]);
  const label = new Map(
    unwrap(types, "Loading collection types").map((row) => [row.id, row.label]),
  );
  return unwrap(collections, "Loading collections").map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: asType(label.get(row.type_id)),
    potAmount: row.pot_amount == null ? null : Number(row.pot_amount),
    projectIds: (row.collection_projects ?? []).map((link) => link.project_id),
    awards: Object.fromEntries(
      (row.collection_projects ?? [])
        .filter((link) => link.award_amount != null)
        .map((link) => [link.project_id, Number(link.award_amount)]),
    ),
  }));
}

export function collectionMetrics(projects: ProjectSummary[]) {
  const count = (health: Health) =>
    projects.filter((project) => project.health.overall === health).length;
  return {
    projectCount: projects.length,
    budget: projects.reduce((sum, project) => sum + project.budget, 0),
    forecast: projects.reduce((sum, project) => sum + project.forecast, 0),
    rag: { green: count("On Track"), amber: count("At Risk"), red: count("Off Track") },
  };
}
