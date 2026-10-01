import { useMemo, useState } from "react";
import { BoardWorkspace, governanceAutomationRecipes } from "@/components/board-workspace";
import { DecisionPanel, type RecordedOutcome } from "@/components/decision-panel";
import { KpiCard } from "@/components/pmo-ui";
import { decisionColumns, decisionsToRows, decisionViews } from "@/lib/decision-board-data";
import { getDecisionMetrics, getDecisions, madeThisMonth, type ResolvedDecision } from "@/services/decisions";

export function DecisionsWorkspace() {
  const [outcomes, setOutcomes] = useState<Record<string, RecordedOutcome>>({});
  const [selected, setSelected] = useState<ResolvedDecision | null>(null);
  const base = useMemo(() => getDecisions(), []);
  const items: ResolvedDecision[] = base.map(item => {
    const outcome = outcomes[item.id];
    if (!outcome) return item;
    return { ...item, status: "Made", chosenOptionId: outcome.optionId, rationale: outcome.rationale, decisionDate: outcome.decisionDate, overdue: false, chosenOption: item.options.find(option => option.id === outcome.optionId)?.title ?? "—" };
  });
  const metrics = getDecisionMetrics(items);
  const rows = decisionsToRows(items).map(row => ({ ...row, madeThisMonth: madeThisMonth(items.find(item => item.id === row.id) ?? items[0]!) }));

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Pending decisions" value={String(metrics.pending)} detail="Waiting on a forum" icon="projects" />
      <KpiCard label="Overdue" value={String(metrics.overdue)} detail="Past the needed-by date" icon="health" />
      <KpiCard label="Average decision latency" value={`${metrics.averageLatencyDays} days`} detail="Needed-by against decided" icon="forecast" />
      <KpiCard label="Made in the last 30 days" value={String(metrics.madeLast30)} detail={`${metrics.superseded} superseded overall`} icon="budget" />
    </div>
    <BoardWorkspace title="Decision log" itemLabel="decision" rows={rows} columns={decisionColumns} groupOptions={["group", "status", "scope"]} seededViews={decisionViews} seededAutomations={governanceAutomationRecipes}
      renderTitle={row => <button onClick={event => { event.stopPropagation(); setSelected(items.find(item => item.id === row.id) ?? null) }} className="text-left text-primary hover:underline">{String(row["reference"])} · {row.title}</button>} />
    {selected && <DecisionPanel decision={items.find(item => item.id === selected.id) ?? selected} all={items}
      {...(outcomes[selected.id] ? { outcome: outcomes[selected.id] as RecordedOutcome } : {})}
      onRecord={(id, outcome) => { setOutcomes(current => ({ ...current, [id]: outcome })); }} close={() => setSelected(null)} />}
  </div>;
}
