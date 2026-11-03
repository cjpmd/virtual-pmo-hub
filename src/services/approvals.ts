// Approval gates and steps (report builder §5.5, §15): generic gates on a project (stage gate,
// QIA, EqIA, DCB0129/0160, SOC/OBC/FBC …), each with ordered steps decided by a role. Gate
// status follows its steps (decide_approval_step).
import { supabase } from "@/integrations/supabase/client";
import { deleteRows, insertRow, updateRow } from "./write";
import { unwrap, unwrapMaybe } from "./service-error";

export interface ApprovalStep {
  id: string;
  stepOrder: number;
  requiredRole: string;
  approverName: string | null;
  decision: "approved" | "rejected" | null;
  decidedAt: string | null;
  comment: string | null;
}

export interface ApprovalGate {
  id: string;
  name: string;
  gateType: string;
  status: "pending" | "approved" | "rejected" | "waived";
  dueDate: string | null;
  updatedAt: string;
  steps: ApprovalStep[];
}

export const GATE_TYPES = [
  "stage_gate",
  "qia",
  "eqia",
  "dcb0129",
  "dcb0160",
  "soc",
  "obc",
  "fbc",
] as const;

export async function listApprovalGates(projectId: string): Promise<ApprovalGate[]> {
  const rows = unwrap(
    await supabase
      .from("approval_gates")
      .select(
        "id, name, gate_type, status, due_date, updated_at, approval_steps(id, step_order, required_role, decision, decided_at, comment, profiles(display_name))",
      )
      .eq("project_id", projectId)
      .order("due_date", { ascending: true, nullsFirst: false }),
    "Loading approval gates",
  );
  return (
    rows as unknown as Array<{
      id: string;
      name: string;
      gate_type: string;
      status: ApprovalGate["status"];
      due_date: string | null;
      updated_at: string;
      approval_steps: Array<{
        id: string;
        step_order: number;
        required_role: string;
        decision: ApprovalStep["decision"];
        decided_at: string | null;
        comment: string | null;
        profiles: { display_name: string } | null;
      }>;
    }>
  ).map((g) => ({
    id: g.id,
    name: g.name,
    gateType: g.gate_type,
    status: g.status,
    dueDate: g.due_date,
    updatedAt: g.updated_at,
    steps: g.approval_steps
      .map((s) => ({
        id: s.id,
        stepOrder: s.step_order,
        requiredRole: s.required_role,
        approverName: s.profiles?.display_name ?? null,
        decision: s.decision,
        decidedAt: s.decided_at,
        comment: s.comment,
      }))
      .sort((a, b) => a.stepOrder - b.stepOrder),
  }));
}

export async function addApprovalGate(
  projectId: string,
  input: { name: string; gateType: string; dueDate: string | null },
) {
  return insertRow(
    "approval_gates",
    {
      project_id: projectId,
      entity_type: "project",
      entity_id: projectId,
      name: input.name,
      gate_type: input.gateType,
      due_date: input.dueDate,
    },
    "Adding the gate",
  );
}

export async function addApprovalStep(gateId: string, stepOrder: number, requiredRole: string) {
  return insertRow(
    "approval_steps",
    { gate_id: gateId, step_order: stepOrder, required_role: requiredRole },
    "Adding the step",
  );
}

export async function removeApprovalStep(stepId: string) {
  return deleteRows("approval_steps", [stepId], "Removing the step");
}

export async function waiveApprovalGate(gateId: string, lastSeen: string) {
  return updateRow(
    "approval_gates",
    gateId,
    { status: "waived" },
    { context: "Waiving the gate", lastSeen },
  );
}

export async function decideApprovalStep(
  stepId: string,
  decision: "approved" | "rejected",
  comment: string,
) {
  unwrapMaybe(
    await supabase.rpc("decide_approval_step", {
      p_step_id: stepId,
      p_decision: decision,
      p_comment: comment,
    }),
    decision === "approved" ? "Approving" : "Rejecting",
  );
}
