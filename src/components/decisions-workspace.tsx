import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BoardWorkspace, governanceAutomationRecipes } from "@/components/board-workspace";
import { DecisionPanel } from "@/components/decision-panel";
import { KpiCard } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { useGovernance, useGovernanceMutations } from "@/hooks/use-governance";
import { useCan } from "@/hooks/use-permissions";
import { decisionColumnsFor, decisionInputFromBoard, decisionsToRows, decisionViews } from "@/lib/decision-board-data";
import { getDecisionMetrics, madeThisMonth, type DecisionInput, type GovernanceData } from "@/services/decisions";

export function DecisionsWorkspace() {
  const governance = useGovernance();
  return <QueryState query={governance}>{data => <Decisions data={data} />}</QueryState>;
}

function Decisions({ data }: { data: GovernanceData }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = data.decisions;
  const canEdit = useCan("contributor");
  const mutations = useGovernanceMutations();
  const metrics = getDecisionMetrics(items);
  const rows = useMemo(() => decisionsToRows(items).map(row => ({ ...row, madeThisMonth: madeThisMonth(items.find(item => item.id === row.id) ?? items[0]!) })), [items]);
  const columns = decisionColumnsFor(data.forums.map(forum => forum.label));
  const onRecordChange = useBoardRecordSync<DecisionInput>({
    toInput: patch => decisionInputFromBoard(patch, data.forums),
    create: () => toast.error("Raise new decisions from the project or programme they belong to."),
    update: (id, input, lastSeen) => mutations.updateDecision.mutateAsync({ id, input, lastSeen }),
    remove: () => toast.error("Decisions are kept for the record. Supersede a decision instead of deleting it."),
    lastSeen: id => items.find(item => item.id === id)?.updatedAt,
  });
  const selected = items.find(item => item.id === selectedId);

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Pending decisions" value={String(metrics.pending)} detail="Waiting on a forum" icon="projects" />
      <KpiCard label="Overdue" value={String(metrics.overdue)} detail="Past the needed-by date" icon="health" />
      <KpiCard label="Average decision latency" value={`${metrics.averageLatencyDays} days`} detail="Needed-by against decided" icon="forecast" />
      <KpiCard label="Made in the last 30 days" value={String(metrics.madeLast30)} detail={`${metrics.superseded} superseded overall`} icon="budget" />
    </div>
    <BoardWorkspace key={String(canEdit)} title="Decision log" itemLabel="decision" rows={rows} columns={canEdit ? columns : columns.map(column => ({ ...column, editable: false }))} manage={canEdit} canDelete={false} canCreate={false} onRecordChange={onRecordChange} groupOptions={["group", "status", "scope"]} seededViews={decisionViews} seededAutomations={governanceAutomationRecipes}
      renderTitle={row => <button onClick={event => { event.stopPropagation(); setSelectedId(row.id) }} className="text-left text-primary hover:underline">{String(row["reference"])} · {row.title}</button>} />
    {selected && <DecisionPanel decision={selected} all={items} close={() => setSelectedId(null)} />}
  </div>;
}
