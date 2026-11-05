// Gate editor on the project page (spec §15): add a gate of any type, add steps with the role
// that decides each, approve or reject a step with a comment. Gates show in packs through the
// stage_gates and approvals_status blocks.
import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApprovalGates, useApprovalMutations } from "@/hooks/use-approvals";
import { GATE_TYPES, type ApprovalGate } from "@/services/approvals";
import { formatDate } from "@/lib/format";
import { errorMessage } from "@/services/service-error";

const TYPE_LABEL: Record<string, string> = {
  stage_gate: "Stage gate",
  qia: "QIA",
  eqia: "EqIA",
  dcb0129: "DCB0129",
  dcb0160: "DCB0160",
  soc: "SOC",
  obc: "OBC",
  fbc: "FBC",
};

export function ApprovalGatesPanel({
  projectId,
  canEdit,
}: {
  projectId: string;
  canEdit: boolean;
}) {
  const gates = useApprovalGates(projectId);
  const m = useApprovalMutations(projectId);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("stage_gate");
  const [due, setDue] = useState("");
  const fail = (e: unknown) => toast.error(errorMessage(e));
  return (
    <section aria-label="Approval gates" className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h2 className="font-semibold">Approval gates</h2>
        <p className="text-sm text-muted-foreground">
          Sign-offs that need named roles: stage gates, QIA / EqIA, clinical safety, business case
          stages.
        </p>
      </div>
      {(gates.data ?? []).map((gate) => (
        <Gate key={gate.id} gate={gate} canEdit={canEdit} m={m} fail={fail} />
      ))}
      {gates.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">No approval gates yet.</p>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <Input
            className="h-9 w-56"
            placeholder="Gate name"
            aria-label="Gate name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="Gate type"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {GATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <Input
            className="h-9 w-40"
            type="date"
            aria-label="Due date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!name.trim() || m.addGate.isPending}
            onClick={() =>
              m.addGate.mutate(
                { name: name.trim(), gateType: type, dueDate: due || null },
                {
                  onSuccess: () => {
                    setName("");
                    setDue("");
                  },
                  onError: fail,
                },
              )
            }
          >
            <Plus className="mr-1 size-3.5" /> Add gate
          </Button>
        </div>
      )}
    </section>
  );
}

function Gate({
  gate,
  canEdit,
  m,
  fail,
}: {
  gate: ApprovalGate;
  canEdit: boolean;
  m: ReturnType<typeof useApprovalMutations>;
  fail: (e: unknown) => void;
}) {
  const [role, setRole] = useState("");
  const [comment, setComment] = useState("");
  const next = gate.steps.find((s) => !s.decision);
  return (
    <div className="rounded-md border p-3 text-sm" data-gate={gate.name}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{gate.name}</span>
        <Badge variant="outline">{TYPE_LABEL[gate.gateType] ?? gate.gateType}</Badge>
        <Badge
          variant={
            gate.status === "approved"
              ? "default"
              : gate.status === "rejected"
                ? "destructive"
                : "secondary"
          }
        >
          {gate.status}
        </Badge>
        {gate.dueDate && (
          <span className="text-muted-foreground">due {formatDate(gate.dueDate)}</span>
        )}
        {canEdit && gate.status === "pending" && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7"
            onClick={() =>
              m.waive.mutate({ gateId: gate.id, lastSeen: gate.updatedAt }, { onError: fail })
            }
          >
            Waive
          </Button>
        )}
      </div>
      <ol className="mt-2 space-y-1">
        {gate.steps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <span className="w-5 text-muted-foreground">{s.stepOrder}.</span>
            <span>{s.requiredRole}</span>
            {s.decision ? (
              <span
                className={
                  s.decision === "approved"
                    ? "text-health-good-foreground"
                    : "text-health-bad-foreground"
                }
              >
                {s.decision}
                {s.approverName && ` by ${s.approverName}`}
                {s.comment && ` — ${s.comment}`}
              </span>
            ) : (
              <span className="text-muted-foreground">waiting</span>
            )}
            {canEdit && !s.decision && (
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={`Remove step ${s.requiredRole}`}
                onClick={() => m.removeStep.mutate(s.id, { onError: fail })}
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </li>
        ))}
      </ol>
      {gate.status === "pending" && next && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-64"
            placeholder={`Comment for ${next.requiredRole}`}
            aria-label="Decision comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() =>
              m.decide.mutate(
                { stepId: next.id, decision: "approved", comment },
                { onSuccess: () => setComment(""), onError: fail },
              )
            }
          >
            <Check className="mr-1 size-3.5" /> Approve step {next.stepOrder}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() =>
              m.decide.mutate(
                { stepId: next.id, decision: "rejected", comment },
                { onSuccess: () => setComment(""), onError: fail },
              )
            }
          >
            <X className="mr-1 size-3.5" /> Reject
          </Button>
        </div>
      )}
      {canEdit && gate.status === "pending" && (
        <div className="mt-2 flex gap-2">
          <Input
            className="h-8 w-56"
            placeholder="Role, e.g. Medical director"
            aria-label="Step role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={!role.trim()}
            onClick={() =>
              m.addStep.mutate(
                {
                  gateId: gate.id,
                  order: (gate.steps.at(-1)?.stepOrder ?? 0) + 1,
                  role: role.trim(),
                },
                { onSuccess: () => setRole(""), onError: fail },
              )
            }
          >
            <Plus className="mr-1 size-3.5" /> Add step
          </Button>
        </div>
      )}
    </div>
  );
}
