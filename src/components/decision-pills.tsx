import type { DecisionStatus } from "@/data/types";
import { cn } from "@/lib/utils";

const statusTone: Record<DecisionStatus, string> = {
  Pending: "bg-health-warn/25 text-health-warn-foreground",
  Made: "bg-health-good/20 text-health-good-foreground",
  Superseded: "bg-muted text-muted-foreground",
  Reversed: "bg-muted text-muted-foreground",
  Withdrawn: "bg-muted text-muted-foreground",
};

/** Decision status as text plus colour, so colour is never the only signal. */
export function DecisionStatusPill({ status }: { status: DecisionStatus }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", statusTone[status])}>
      {status}
    </span>
  );
}

/** Overdue and deferral flags from v_decisions. */
export function DecisionFlags({
  overdue,
  daysOverdue,
  deferralCount,
}: {
  overdue: boolean;
  daysOverdue: number;
  deferralCount: number;
}) {
  return (
    <>
      {overdue && (
        <span className="rounded-full bg-health-bad/20 px-2.5 py-1 text-xs font-semibold text-health-bad-foreground">
          Overdue {daysOverdue} day{daysOverdue === 1 ? "" : "s"}
        </span>
      )}
      {deferralCount > 0 && (
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          Deferred ×{deferralCount}
        </span>
      )}
    </>
  );
}
