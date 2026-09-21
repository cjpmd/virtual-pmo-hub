import { formatDate } from "@/lib/format";
import { useMemo, useState } from "react";
import { DecisionPanel } from "@/components/decision-panel";
import { getDecisionsFor, getDecisionMetrics, type ResolvedDecision } from "@/services/decisions";
import { KpiCard } from "@/components/pmo-ui";
import { cn } from "@/lib/utils";

/** Decisions raised anywhere in a programme, including its projects. */
export function ProgrammeDecisions({ programmeId }: { programmeId: string }) {
  const items = useMemo(() => getDecisionsFor({ programmeId }), [programmeId]);
  const metrics = getDecisionMetrics(items);
  const [open, setOpen] = useState<ResolvedDecision | null>(null);
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Pending" value={String(metrics.pending)} detail="Waiting on a forum" icon="projects" />
      <KpiCard label="Overdue" value={String(metrics.overdue)} detail="Past the needed-by date" icon="health" />
      <KpiCard label="Average latency" value={`${metrics.averageLatencyDays} days`} detail="Needed-by against decided" icon="forecast" />
      <KpiCard label="Made in 30 days" value={String(metrics.madeLast30)} detail={`${metrics.superseded} superseded`} icon="budget" />
    </div>
    <div className="space-y-3">
      {items.map(item => <button key={item.id} onClick={() => setOpen(item)} className="block w-full rounded-lg border bg-card p-4 text-left shadow-sm hover:bg-accent/30">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm font-semibold">{item.reference} · {item.title}</p>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", item.status === "Made" ? "bg-health-good/20 text-health-good-foreground" : item.overdue ? "bg-health-bad/20 text-health-bad-foreground" : item.status === "Pending" ? "bg-health-warn/25 text-health-warn-foreground" : "bg-muted text-muted-foreground")}>{item.status}{item.overdue ? " · overdue" : ""}</span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{item.scopeName} · {item.forum} · {item.decisionMaker} · needed by {formatDate(item.neededBy)}</p>
        <p className="mt-2 text-sm text-muted-foreground">{item.context}</p>
      </button>)}
      {!items.length && <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No decisions recorded for this programme.</p>}
    </div>
    {open && <DecisionPanel decision={open} all={items} close={() => setOpen(null)} />}
  </div>;
}
