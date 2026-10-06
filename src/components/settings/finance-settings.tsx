// Settings → Finance: month-end close (design §1.1, §3). Closing a month locks its values for
// every project in the organisation, moves the actuals cut-off and captures each project's
// forecast history. Months close in order; only the latest closed month can be reopened, with
// a reason. The PMO can also import actuals for a whole workspace from here.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Lock, LockOpen } from "lucide-react";
import { ActualsImportDialog } from "@/components/actuals-import-dialog";
import { useOrgId } from "@/components/auth/organisation-provider";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFinancialMutations, useFinancialPeriods } from "@/hooks/use-financials";
import { useWorkspaceRoles } from "@/hooks/use-permissions";
import { useFormat } from "@/lib/format";
import { todayIso } from "@/lib/today";
import { monthLabel } from "@/services/actuals-import";
import { atLeast, getWorkspaces } from "@/services/auth";
import {
  addMonths,
  latestClosedMonth,
  monthOf,
  nextMonthToClose,
} from "@/services/financials-calc";
import type { FinancialPeriod } from "@/services/financials";
import { SettingsCard, useCanEditSettings } from "./settings-shell";

export function FinanceSettings() {
  const periods = useFinancialPeriods();
  return (
    <>
      <QueryState query={periods}>{(data) => <MonthEndClose periods={data} />}</QueryState>
      <WorkspaceImport />
    </>
  );
}

function MonthEndClose({ periods }: { periods: FinancialPeriod[] }) {
  const format = useFormat();
  const canEdit = useCanEditSettings("pmo");
  const { closePeriod, reopenPeriod } = useFinancialMutations();
  const [confirming, setConfirming] = useState<"close" | "reopen" | null>(null);
  const [reason, setReason] = useState("");
  const today = todayIso(format.settings.regional.timeZone);
  const next = nextMonthToClose(periods, today);
  const latest = latestClosedMonth(periods);
  const cutoff = latest ?? addMonths(monthOf(today), -1);

  return (
    <SettingsCard
      requires="pmo"
      title="Month-end close"
      description="Closing a month locks its budget, actuals and forecast for every project, makes it the actuals cut-off and records each project's forecast for the month. Close months in order."
      actions={
        <div className="flex flex-wrap gap-2">
          {latest && (
            <Button variant="outline" onClick={() => setConfirming("reopen")}>
              <LockOpen />
              Reopen {monthLabel(latest)}
            </Button>
          )}
          <Button disabled={!next} onClick={() => setConfirming("close")}>
            <Lock />
            {next ? `Close ${monthLabel(next)}` : "Nothing to close yet"}
          </Button>
        </div>
      }
    >
      <p className="text-sm">
        Actuals are counted to the end of <strong>{monthLabel(cutoff)}</strong>
        {latest
          ? " (the latest closed month)."
          : ". No month is closed yet, so the cut-off is last month."}{" "}
        Later months count forecast.
      </p>
      {periods.length ? (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Month</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Closed</th>
              <th className="py-2 font-medium">Last reopened</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.periodMonth} className="border-t border-border/60 align-top">
                <td className="py-2 pr-3 font-medium">{monthLabel(period.periodMonth)}</td>
                <td className="py-2 pr-3">{period.closed ? "Closed" : "Open"}</td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">
                  {period.closedAt
                    ? `${format.date(period.closedAt)}${period.closedBy ? ` · ${period.closedBy}` : ""}`
                    : "—"}
                </td>
                <td className="py-2 text-xs text-muted-foreground">
                  {period.reopenedAt
                    ? `${format.date(period.reopenedAt)}${period.reopenedBy ? ` · ${period.reopenedBy}` : ""} · “${period.reopenReason ?? ""}”`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No month has been closed yet.</p>
      )}

      <Dialog
        open={canEdit && confirming === "close"}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close {next ? monthLabel(next) : ""}?</DialogTitle>
            <DialogDescription>
              Every project's values for the month are locked, the actuals cut-off moves to{" "}
              {next ? monthLabel(next) : ""}, and each project's forecast is recorded. Only the PMO
              can reopen it, with a reason.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!next || closePeriod.isPending}
              onClick={() =>
                next && closePeriod.mutate(next, { onSuccess: () => setConfirming(null) })
              }
            >
              Close the month
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={canEdit && confirming === "reopen"}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
          setReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen {latest ? monthLabel(latest) : ""}?</DialogTitle>
            <DialogDescription>
              Values for the month can be changed again and the cut-off moves back. The forecast
              recorded at close is kept; closing again doesn't record a second one.
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">
              Reason <span className="text-destructive">*</span>
            </span>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Late supplier invoice for the network upgrade"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!latest || !reason.trim() || reopenPeriod.isPending}
              onClick={() =>
                latest &&
                reopenPeriod.mutate(
                  { month: latest, reason },
                  {
                    onSuccess: () => {
                      setConfirming(null);
                      setReason("");
                    },
                  },
                )
              }
            >
              Reopen the month
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

function WorkspaceImport() {
  const orgId = useOrgId();
  const roles = useWorkspaceRoles();
  const workspaces = useQuery({
    queryKey: ["org", orgId, "workspaces"],
    queryFn: () => getWorkspaces(orgId),
    staleTime: 5 * 60_000,
  });
  const pmoWorkspaces = (workspaces.data ?? []).filter((workspace) =>
    atLeast(roles.data?.find((row) => row.workspaceId === workspace.id)?.role, "pmo"),
  );
  const [workspaceId, setWorkspaceId] = useState("");
  const [open, setOpen] = useState(false);
  const chosen = workspaceId || pmoWorkspaces[0]?.id || "";
  return (
    <SettingsCard
      requires="pmo"
      title="Import actuals"
      description="Import a finance-system export for many projects at once. The file needs a project code column; each row is checked before anything is saved."
    >
      {pmoWorkspaces.length ? (
        <div className="flex flex-wrap items-end gap-3">
          {pmoWorkspaces.length > 1 && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Workspace</span>
              <Select value={chosen} onValueChange={setWorkspaceId}>
                <SelectTrigger className="w-64" aria-label="Workspace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pmoWorkspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          <Button onClick={() => setOpen(true)} disabled={!chosen}>
            <FileUp />
            Import actuals
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          You need the PMO role in a workspace to import actuals.
        </p>
      )}
      {open && (
        <ActualsImportDialog
          open
          onOpenChange={(value) => !value && setOpen(false)}
          workspaceId={chosen}
          defaultProject={null}
        />
      )}
    </SettingsCard>
  );
}
