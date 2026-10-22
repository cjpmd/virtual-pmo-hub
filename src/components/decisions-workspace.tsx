import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { BoardWorkspace, governanceAutomationRecipes } from "@/components/board-workspace";
import { DecisionPanel, type DecisionCreateScope } from "@/components/decision-panel";
import { KpiCard } from "@/components/pmo-ui";
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
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { useGovernance, useGovernanceMutations } from "@/hooks/use-governance";
import { usePortfolioNames } from "@/hooks/use-hierarchy";
import { useCan } from "@/hooks/use-permissions";
import type { DecisionStatus } from "@/data/types";
import {
  decisionColumnsFor,
  decisionInputFromBoard,
  decisionsToRows,
  decisionViews,
} from "@/lib/decision-board-data";
import {
  getDecisionMetrics,
  madeThisMonth,
  type DecisionInput,
  type GovernanceData,
} from "@/services/decisions";

const statuses: DecisionStatus[] = ["Pending", "Made", "Superseded", "Reversed", "Withdrawn"];
const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DecisionsWorkspace() {
  const governance = useGovernance();
  return <QueryState query={governance}>{(data) => <Decisions data={data} />}</QueryState>;
}

function Decisions({ data }: { data: GovernanceData }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createScope, setCreateScope] = useState<DecisionCreateScope | null>(null);
  const [pickingScope, setPickingScope] = useState(false);
  const [forum, setForum] = useState("");
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const items = data.decisions;
  const canEdit = useCan("contributor");
  const mutations = useGovernanceMutations();
  const metrics = getDecisionMetrics(items);
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (!forum || item.forum === forum) &&
          (!status || item.status === status) &&
          (!overdueOnly || item.overdue),
      ),
    [items, forum, status, overdueOnly],
  );
  const rows = useMemo(
    () =>
      decisionsToRows(filtered).map((row) => ({
        ...row,
        madeThisMonth: madeThisMonth(filtered.find((item) => item.id === row.id) ?? filtered[0]!),
      })),
    [filtered],
  );
  const columns = decisionColumnsFor(data.forums.map((item) => item.label));
  const onRecordChange = useBoardRecordSync<DecisionInput>({
    toInput: (patch) => decisionInputFromBoard(patch, data.forums),
    create: () => setPickingScope(true),
    update: (id, input, lastSeen) => mutations.updateDecision.mutateAsync({ id, input, lastSeen }),
    remove: (ids) => {
      const pending = items.some((item) => ids.includes(item.id) && item.status === "Pending");
      toast.error(
        pending
          ? "Withdraw a Pending decision instead of deleting it, so the record is kept."
          : "Decisions are kept for the record. Supersede a decision instead of deleting it.",
      );
    },
    lastSeen: (id) => items.find((item) => item.id === id)?.updatedAt,
  });
  const selected = items.find((item) => item.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pending decisions"
          value={String(metrics.pending)}
          detail="Waiting on a forum"
          icon="projects"
        />
        <KpiCard
          label="Overdue"
          value={String(metrics.overdue)}
          detail="Past the needed-by date"
          icon="health"
        />
        <KpiCard
          label="Average decision latency"
          value={`${metrics.averageLatencyDays} days`}
          detail="Needed-by against decided"
          icon="forecast"
        />
        <KpiCard
          label="Made in the last 30 days"
          value={String(metrics.madeLast30)}
          detail={`${metrics.superseded} superseded overall`}
          icon="budget"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filter decisions">
        <label className="space-y-1 text-xs font-semibold text-muted-foreground">
          <span className="block">Forum</span>
          <select className={selectClass} value={forum} onChange={(e) => setForum(e.target.value)}>
            <option value="">All forums</option>
            {data.forums.map((item) => (
              <option key={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted-foreground">
          <span className="block">Status</span>
          <select
            className={selectClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          Overdue only
        </label>
        {canEdit && (
          <Button className="ml-auto" onClick={() => setPickingScope(true)}>
            <Plus />
            New decision
          </Button>
        )}
      </div>
      <BoardWorkspace
        key={String(canEdit)}
        title="Decision log"
        boardKey="decisions"
        itemLabel="decision"
        rows={rows}
        columns={canEdit ? columns : columns.map((column) => ({ ...column, editable: false }))}
        manage={canEdit}
        canDelete={false}
        canCreate={false}
        onRecordChange={onRecordChange}
        rowEditable={(row) => row.status === "Pending"}
        // Status changes only through the decision RPCs, so cards don't drag between statuses.
        lockedGroups={["status"]}
        onOpenRow={(row) => setSelectedId(row.id)}
        groupOptions={["group", "status", "scope"]}
        seededViews={decisionViews}
        seededAutomations={governanceAutomationRecipes}
        renderTitle={(row) => (
          <button
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(row.id);
            }}
            className="text-left text-primary hover:underline"
          >
            {String(row["reference"])} · {row.title}
          </button>
        )}
      />
      {pickingScope && (
        <ScopePicker
          data={data}
          close={() => setPickingScope(false)}
          pick={(scope) => {
            setPickingScope(false);
            setCreateScope(scope);
          }}
        />
      )}
      {(selected || createScope) && (
        <DecisionPanel
          decision={createScope ? undefined : selected}
          all={items}
          {...(createScope && { createScope })}
          close={() => {
            setSelectedId(null);
            setCreateScope(null);
          }}
          onOpen={(id) => {
            setCreateScope(null);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

function ScopePicker({
  data,
  close,
  pick,
}: {
  data: GovernanceData;
  close: () => void;
  pick: (scope: DecisionCreateScope) => void;
}) {
  const portfolios = usePortfolioNames().data ?? [];
  const [kind, setKind] = useState<"project" | "programme" | "portfolio">("project");
  const [id, setId] = useState("");
  const choices =
    kind === "project"
      ? data.projects.map((item) => ({
          id: item.id,
          label: `${item.code} · ${item.name}`,
          workspaceId: item.workspaceId,
        }))
      : kind === "programme"
        ? data.programmes.map((item) => ({
            id: item.id,
            label: item.name,
            workspaceId: item.workspace_id,
          }))
        : portfolios.map((item) => ({
            id: item.id,
            label: item.name,
            workspaceId: item.workspaceId,
          }));
  const chosen = choices.find((item) => item.id === id);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New decision</DialogTitle>
          <DialogDescription>Choose where the decision belongs.</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="sr-only">Scope</legend>
          {(["project", "programme", "portfolio"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 capitalize">
              <input
                type="radio"
                name="decision-scope"
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  setId("");
                }}
              />
              {value}
            </label>
          ))}
        </fieldset>
        <label className="block space-y-1 text-xs font-semibold text-muted-foreground">
          <span className="block capitalize">{kind}</span>
          <select
            className={`${selectClass} w-full`}
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            <option value="">Choose…</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!chosen}
            onClick={() =>
              chosen &&
              pick({
                [`${kind}Id`]: chosen.id,
                workspaceId: chosen.workspaceId,
              } as DecisionCreateScope)
            }
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
