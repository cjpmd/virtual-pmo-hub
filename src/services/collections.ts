// Collections (governance groups, priority sets, funding streams) and the project facts a
// committee pack shows. Collections embed their project links (one FK); the collection type
// is an organisation list read alongside. Pack facts come from the same sources as every other
// screen: health from v_project_health (via listProjects), milestones from v_milestones, open
// risks, and each project's latest submitted status report.
import type { Health } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { listProjects, type ProjectSummary } from "./hierarchy";
import { listMilestones, type MilestoneItem } from "./project-records";
import { unwrap } from "./service-error";

export type CollectionType = "Governance" | "Priority set" | "Funding stream";

export interface CollectionView {
  id: string;
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
      .select("id, name, type_id, pot_amount, collection_projects(project_id, award_amount)")
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

export interface PackProject extends ProjectSummary {
  milestones: MilestoneItem[];
  /** Open risks, highest score first. */
  risks: { id: string; title: string; description: string; score: number }[];
  report: { accomplished: string; planned: string; comments: string; date: string } | null;
}

/** Everything a committee pack shows for the given projects. */
export async function loadPackProjects(
  orgId: string,
  projectIds: string[],
): Promise<PackProject[]> {
  if (!projectIds.length) return [];
  const [projects, milestones, risks, reports] = await Promise.all([
    listProjects(orgId),
    listMilestones(projectIds),
    supabase
      .from("risks")
      .select("id, project_id, title, description, score, probability, impact")
      .in("project_id", projectIds)
      .eq("status", "open"),
    supabase
      .from("status_reports")
      .select("project_id, reporting_date, accomplished, planned, comments, created_at")
      .in("project_id", projectIds)
      .order("reporting_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  const riskRows = unwrap(risks, "Loading risks");
  const latest = new Map<string, PackProject["report"]>();
  for (const row of unwrap(reports, "Loading status reports"))
    if (!latest.has(row.project_id))
      latest.set(row.project_id, {
        accomplished: row.accomplished ?? "",
        planned: row.planned ?? "",
        comments: row.comments ?? "",
        date: row.reporting_date,
      });
  const wanted = new Set(projectIds);
  return projects
    .filter((project) => wanted.has(project.id))
    .map((project) => ({
      ...project,
      milestones: milestones
        .filter((item) => item.projectId === project.id)
        .sort((a, b) => a.forecastDate.localeCompare(b.forecastDate)),
      risks: riskRows
        .filter((row) => row.project_id === project.id)
        .map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description ?? "",
          score: row.score ?? row.probability * row.impact,
        }))
        .sort((a, b) => b.score - a.score),
      report: latest.get(project.id) ?? null,
    }));
}
