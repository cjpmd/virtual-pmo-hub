// NHS-5 financial case → project financials: "Set the budget baseline" from an approved business
// case version (single-stage, OBC or FBC; an SOC is indicative). The total defaults to the
// preferred option's delivery cost; a different total needs the PMO and a reason, and replacing an
// existing baseline from a later case is the PMO's. private.budget_baseline_guard checks the same
// rules (docs/financials-and-business-cases.md, budget_baselines).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { useOrgId } from "@/components/auth/organisation-provider";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFinancialMutations } from "@/hooks/use-financials";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useCan } from "@/hooks/use-permissions";
import { useFormat } from "@/lib/format";
import type { CaseVersion } from "@/services/business-cases";
import { getCurrentBaseline, listCaseBaselines } from "@/services/financials";
import { canBaselineFrom, parseBaselineAmount, stageShort } from "@/services/five-case";

export function CaseBaselinePanel({
  projectId,
  workspaceId,
  version,
}: {
  projectId: string;
  workspaceId: string;
  version: CaseVersion;
}) {
  const format = useFormat();
  const orgId = useOrgId();
  const writable = useOrgWritable();
  const isManager = useCan("manager", workspaceId);
  const isPmo = useCan("pmo", workspaceId);
  const [open, setOpen] = useState(false);
  const key = ["org", orgId, "projects", projectId, "case-baselines"];
  const baselines = useQuery({ queryKey: key, queryFn: () => listCaseBaselines(projectId) });
  const current = useQuery({
    queryKey: ["org", orgId, "projects", projectId, "current-baseline"],
    queryFn: () => getCurrentBaseline(projectId),
  });
  if (!canBaselineFrom(version)) return null;
  const used = baselines.data?.find((b) => b.versionId === version.id);
  const delivery = version.options.find((o) => o.isPreferred)?.deliveryCost ?? null;
  const hasBaseline = Boolean(current.data);
  // First baseline: manager or PMO; replacing one: PMO (the database checks both).
  const allowed = hasBaseline ? isPmo : isManager;
  return (
    <section className="rounded-xl border border-pmo-line bg-pmo-panel font-geist">
      <header className="border-b border-pmo-line px-4 py-3">
        <h2 className="text-sm font-semibold text-pmo-text">Budget baseline</h2>
        <p className="text-[11px] text-pmo-muted">From the approved financial case</p>
      </header>
      <div className="space-y-2 px-4 py-3 text-sm">
        {used ? (
          <p className="text-pmo-text">
            This version set baseline v{used.baselineVersion}: {format.currency(used.total)}.
          </p>
        ) : (
          <>
            <p className="text-xs text-pmo-muted">
              {delivery === null
                ? "The preferred option has no delivery cost, so the PMO sets the baseline with a reason."
                : `The preferred option's delivery cost, ${format.currency(delivery)}, becomes the project's budget baseline.`}
              {hasBaseline
                ? ` The project's current baseline is v${current.data?.version} (${format.currency(current.data?.total ?? 0)}); only the PMO can replace it.`
                : ""}
            </p>
            {allowed && (
              <ReadOnlyTip readOnly={!writable}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!writable}
                  onClick={() => setOpen(true)}
                >
                  <Scale />
                  Set the budget baseline
                </Button>
              </ReadOnlyTip>
            )}
          </>
        )}
      </div>
      {open && (
        <CaseBaselineDialog
          projectId={projectId}
          version={version}
          delivery={delivery}
          nextVersion={(current.data?.version ?? 0) + 1}
          canDiffer={isPmo}
          onClose={() => setOpen(false)}
          onDone={() => void Promise.all([baselines.refetch(), current.refetch()])}
        />
      )}
    </section>
  );
}

function CaseBaselineDialog({
  projectId,
  version,
  delivery,
  nextVersion,
  canDiffer,
  onClose,
  onDone,
}: {
  projectId: string;
  version: CaseVersion;
  delivery: number | null;
  nextVersion: number;
  canDiffer: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const format = useFormat();
  const { addBaseline } = useFinancialMutations(projectId);
  const [total, setTotal] = useState(delivery === null ? "" : String(delivery));
  const [reason, setReason] = useState("");
  const amount = parseBaselineAmount(total);
  const differs = amount !== null && amount !== delivery;
  const valid = amount !== null && (!differs || (canDiffer && reason.trim() !== ""));
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set the budget baseline</DialogTitle>
          <DialogDescription>
            Baseline v{nextVersion} from v{version.version}
            {version.stage !== "single" ? ` (${stageShort[version.stage]})` : ""} of the business
            case.
            {delivery !== null
              ? ` Delivery cost of the preferred option: ${format.currency(delivery)}.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="case-baseline-total">Total budget</Label>
            <Input
              id="case-baseline-total"
              inputMode="decimal"
              value={total}
              disabled={!canDiffer && delivery !== null}
              onChange={(event) => setTotal(event.target.value)}
            />
            {!canDiffer && (
              <p className="text-[11px] text-muted-foreground">
                Only the PMO can set a different total.
              </p>
            )}
          </div>
          {differs && canDiffer && (
            <div className="grid gap-1.5">
              <Label htmlFor="case-baseline-reason">Reason for the difference</Label>
              <Textarea
                id="case-baseline-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Inflation since approval, agreed with the Director of Finance"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || addBaseline.isPending}
            onClick={() =>
              amount !== null &&
              addBaseline.mutate(
                {
                  projectId,
                  total: amount,
                  source: "business_case",
                  businessCaseVersionId: version.id,
                  ...(differs ? { reason } : {}),
                },
                {
                  onSuccess: () => {
                    onDone();
                    onClose();
                  },
                },
              )
            }
          >
            Create baseline v{nextVersion}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
