// "Update the budget baseline" for an approved change request with a cost impact (design §1.6).
// Offered, never automatic: it creates the next baseline version linked to the change, with
// total = current baseline + cost impact. The database checks the same arithmetic, that the
// change is approved and belongs to the project, and that it is used only once.
import { useState } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBaselinedChanges, useFinancialMutations } from "@/hooks/use-financials";
import { useCan } from "@/hooks/use-permissions";
import { useFormat } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { getCurrentBaseline, type BaselineChange } from "@/services/financials";

/** True when the change can move its project's baseline (approved, has a cost, not yet used). */
function useCanBaselineChange(change: BaselineChange) {
  const used = useBaselinedChanges();
  const isManager = useCan("manager", change.workspaceId);
  return (
    isManager &&
    change.status === "Approved" &&
    change.costImpact !== 0 &&
    Boolean(change.projectId) &&
    used.data !== undefined &&
    !used.data.has(change.id)
  );
}

export function ChangeBaselineAction({ change }: { change: BaselineChange }) {
  const allowed = useCanBaselineChange(change);
  const used = useBaselinedChanges();
  const [open, setOpen] = useState(false);
  if (used.data?.has(change.id))
    return <span className="text-xs text-muted-foreground">In the budget baseline</span>;
  if (!allowed) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Scale />
        Update the budget baseline
      </Button>
      {open && <ChangeBaselineDialog change={change} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangeBaselineDialog({
  change,
  onClose,
}: {
  change: BaselineChange;
  onClose: () => void;
}) {
  const format = useFormat();
  const orgId = useOrgId();
  const projectId = change.projectId ?? "";
  const current = useQuery({
    queryKey: ["org", orgId, "projects", projectId, "current-baseline"],
    queryFn: () => getCurrentBaseline(projectId),
  });
  const { addBaseline } = useFinancialMutations(projectId);
  const previous = current.data?.total ?? null;
  const next = previous === null ? null : Math.round((previous + change.costImpact) * 100) / 100;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update the budget baseline</DialogTitle>
          <DialogDescription>
            {change.ref} · {change.title}
          </DialogDescription>
        </DialogHeader>
        {current.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading the current baseline…</p>
        ) : previous === null ? (
          <p className="text-sm">
            The project has no budget baseline yet. Set the first baseline on its Financials tab,
            then apply this change.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Current baseline (v{current.data?.version})</dt>
            <dd className="text-right tabular-nums">{format.currency(previous)}</dd>
            <dt className="text-muted-foreground">Cost impact of the change</dt>
            <dd className="text-right tabular-nums">
              {change.costImpact > 0 ? "+" : ""}
              {format.currency(change.costImpact)}
            </dd>
            <dt className="font-medium">New baseline (v{(current.data?.version ?? 0) + 1})</dt>
            <dd className="text-right font-semibold tabular-nums">{format.currency(next ?? 0)}</dd>
          </dl>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={next === null || next < 0 || addBaseline.isPending}
            onClick={() =>
              next !== null &&
              addBaseline.mutate(
                { projectId, total: next, source: "change_request", changeRequestId: change.id },
                { onSuccess: onClose },
              )
            }
          >
            Create baseline v{(current.data?.version ?? 0) + 1}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
