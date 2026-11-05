// Typed links between records (report builder §16): project ↔ project / risk / issue / benefit
// / lesson, with a link type. Dependencies stay in their own table and show alongside
// (v_record_links). Feeds the linked_records block; later modules add link types (BAF, hazards).
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "./service-error";
import { deleteRows, insertRow } from "./write";

export const LINK_TYPES = [
  "relates_to",
  "depends_on",
  "mitigates",
  "contributes_to",
  "maps_to_baf",
] as const;
export const TARGET_TYPES = ["project", "risk", "issue", "benefit", "lesson"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export interface RecordLink {
  id: string;
  source: "record_links" | "dependencies";
  linkType: string;
  direction: "out" | "in";
  otherType: string;
  otherId: string;
}

export async function listProjectLinks(projectId: string): Promise<RecordLink[]> {
  const rows = unwrap(
    await supabase
      .from("v_record_links")
      .select("id, source, link_type, from_type, from_id, to_type, to_id")
      .or(
        `and(from_type.eq.project,from_id.eq.${projectId}),and(to_type.eq.project,to_id.eq.${projectId})`,
      ),
    "Loading links",
  );
  return rows.map((row) => {
    const out = row.from_type === "project" && row.from_id === projectId;
    return {
      id: row.id!,
      source: row.source as RecordLink["source"],
      linkType: row.link_type!,
      direction: out ? "out" : "in",
      otherType: (out ? row.to_type : row.from_type)!,
      otherId: (out ? row.to_id : row.from_id)!,
    };
  });
}

const TABLE: Record<
  TargetType,
  { table: "projects" | "risks" | "issues" | "benefits" | "lessons"; label: string }
> = {
  project: { table: "projects", label: "code, name" },
  risk: { table: "risks", label: "ref, title" },
  issue: { table: "issues", label: "ref, title" },
  benefit: { table: "benefits", label: "ref, title" },
  lesson: { table: "lessons", label: "ref, summary" },
};

/** Records to link to, by text (first 20). */
export async function searchLinkTargets(type: TargetType, query: string) {
  const { table, label } = TABLE[type];
  const [a, b] = label.split(", ") as [string, string];
  const q = query.replace(/[%,()]/g, " ").trim();
  let request = supabase.from(table).select(`id, ${label}`).limit(20);
  if (q) request = request.or(`${a}.ilike.%${q}%,${b}.ilike.%${q}%`);
  const rows = unwrap(await request, "Searching records") as unknown as Array<
    Record<string, string>
  >;
  return rows.map((row) => ({ id: row["id"]!, label: `${row[a] ?? ""} ${row[b] ?? ""}`.trim() }));
}

export async function labelsFor(links: RecordLink[]) {
  const out = new Map<string, string>();
  for (const type of TARGET_TYPES) {
    const ids = links.filter((l) => l.otherType === type).map((l) => l.otherId);
    if (!ids.length) continue;
    const { table, label } = TABLE[type];
    const [a, b] = label.split(", ") as [string, string];
    const rows = unwrap(
      await supabase.from(table).select(`id, ${label}`).in("id", ids),
      "Loading links",
    ) as unknown as Array<Record<string, string>>;
    for (const row of rows) out.set(row["id"]!, `${row[a] ?? ""} ${row[b] ?? ""}`.trim());
  }
  return out;
}

export async function addProjectLink(
  projectId: string,
  toType: TargetType,
  toId: string,
  linkType: string,
) {
  const project = unwrap(
    await supabase.from("projects").select("workspace_id").eq("id", projectId).single(),
    "Adding the link",
  );
  return insertRow(
    "record_links",
    {
      workspace_id: project.workspace_id,
      from_type: "project",
      from_id: projectId,
      to_type: toType,
      to_id: toId,
      link_type: linkType,
    } as never,
    "Adding the link",
  );
}

export async function removeLink(id: string) {
  return deleteRows("record_links", [id], "Removing the link");
}
