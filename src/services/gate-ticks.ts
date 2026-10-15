// Gate checklist ticks (gate_checklist_ticks): one row per ticked criterion per gate milestone.
// Who ticked and when are set by the database; unticking deletes the row (audited). Reads for
// workspace members, writes for project members with edit rights (RLS).
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "./service-error";
import { deleteWhere, insertRow } from "./write";

export interface GateTick {
  milestoneId: string;
  criterionId: string;
  tickedBy: string | null;
  tickedAt: string;
}

export async function listGateTicks(projectId: string): Promise<GateTick[]> {
  const rows = unwrap(
    await supabase
      .from("gate_checklist_ticks")
      .select("milestone_id, criterion_id, ticked_by, ticked_at")
      .eq("project_id", projectId),
    "Loading the gate checklist",
  );
  return rows.map((row) => ({
    milestoneId: row.milestone_id,
    criterionId: row.criterion_id,
    tickedBy: row.ticked_by,
    tickedAt: row.ticked_at,
  }));
}

export interface GateTickInput {
  projectId: string;
  milestoneId: string;
  criterionId: string;
}

export async function tickGateCriterion(input: GateTickInput) {
  return insertRow(
    "gate_checklist_ticks",
    {
      project_id: input.projectId,
      milestone_id: input.milestoneId,
      criterion_id: input.criterionId,
    },
    "Ticking the checklist item",
  );
}

export async function untickGateCriterion(input: GateTickInput) {
  await deleteWhere(
    "gate_checklist_ticks",
    { milestone_id: input.milestoneId, criterion_id: input.criterionId },
    "Unticking the checklist item",
  );
}
