// Escalating a project's risks and issues to a forum (report builder §5.4): sets
// escalated_to_forum_id (the database stamps escalated_at). Forum packs list them in the
// escalations block and the escalations_for_forum selection rule.
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "./service-error";
import { updateRow } from "./write";

export interface EscalatableItem {
  kind: "risk" | "issue";
  id: string;
  ref: string | null;
  title: string;
  forumId: string | null;
  escalatedAt: string | null;
  updatedAt: string;
}

export async function listEscalatable(projectId: string): Promise<EscalatableItem[]> {
  const [risks, issues] = await Promise.all([
    supabase
      .from("risks")
      .select("id, ref, title, escalated_to_forum_id, escalated_at, updated_at")
      .eq("project_id", projectId)
      .eq("status", "open"),
    supabase
      .from("issues")
      .select("id, ref, title, escalated_to_forum_id, escalated_at, updated_at")
      .eq("project_id", projectId)
      .eq("status", "open"),
  ]);
  const map =
    (kind: EscalatableItem["kind"]) =>
    (row: {
      id: string;
      ref: string | null;
      title: string;
      escalated_to_forum_id: string | null;
      escalated_at: string | null;
      updated_at: string;
    }) => ({
      kind,
      id: row.id,
      ref: row.ref,
      title: row.title,
      forumId: row.escalated_to_forum_id,
      escalatedAt: row.escalated_at,
      updatedAt: row.updated_at,
    });
  return [
    ...unwrap(risks, "Loading risks").map(map("risk")),
    ...unwrap(issues, "Loading issues").map(map("issue")),
  ];
}

export async function setEscalation(item: EscalatableItem, forumId: string | null) {
  return updateRow(
    item.kind === "risk" ? "risks" : "issues",
    item.id,
    { escalated_to_forum_id: forumId },
    {
      context: forumId ? "Escalating" : "Removing the escalation",
      lastSeen: item.updatedAt,
    },
  );
}
