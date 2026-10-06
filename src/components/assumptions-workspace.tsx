import { formatDate } from "@/lib/format";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BoardWorkspace, governanceAutomationRecipes } from "@/components/board-workspace";
import { KpiCard } from "@/components/pmo-ui";
import {
  assumptionColumns,
  assumptionInputFromBoard,
  assumptionsToRows,
  assumptionViews,
} from "@/lib/decision-board-data";
import {
  getAssumptionMetrics,
  scopedTo,
  type AssumptionInput,
  type GovernanceData,
  type ResolvedAssumption,
} from "@/services/decisions";
import { toast } from "sonner";
import { QueryState } from "@/components/query-state";
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { useGovernance, useGovernanceMutations } from "@/hooks/use-governance";
import { useCan } from "@/hooks/use-permissions";
import { addDaysIso } from "@/lib/today";
import { cn } from "@/lib/utils";

interface IssueDraft {
  assumption: ResolvedAssumption;
  title: string;
  description: string;
  owner: string;
  dueDate: string;
}

type Scope = { projectId?: string; programmeId?: string };

export function AssumptionsWorkspace({
  scope,
  compact = false,
}: {
  scope?: Scope;
  compact?: boolean;
}) {
  const governance = useGovernance();
  return (
    <QueryState query={governance}>
      {(data) => <Assumptions data={data} {...(scope ? { scope } : {})} compact={compact} />}
    </QueryState>
  );
}

function Assumptions({
  data,
  scope,
  compact,
}: {
  data: GovernanceData;
  scope?: Scope;
  compact: boolean;
}) {
  const [draft, setDraft] = useState<IssueDraft | null>(null);
  const mutations = useGovernanceMutations();
  const canEdit = useCan("contributor");
  const items = useMemo(
    () => (scope ? scopedTo(data.assumptions, scope) : data.assumptions),
    [data.assumptions, scope],
  );
  const metrics = getAssumptionMetrics(items);
  const onRecordChange = useBoardRecordSync<AssumptionInput>({
    toInput: assumptionInputFromBoard,
    create: () =>
      toast.error("Raise new assumptions from the project or programme they belong to."),
    update: (id, input, lastSeen) =>
      mutations.updateAssumption.mutateAsync({ id, input, lastSeen }),
    remove: () =>
      toast.error(
        "Assumptions are kept for the record. Mark them validated or invalidated instead.",
      ),
    lastSeen: (id) => data.assumptions.find((item) => item.id === id)?.updatedAt,
  });
  const setStatus = (item: ResolvedAssumption, status: ResolvedAssumption["status"]) =>
    mutations.updateAssumption.mutate({ id: item.id, input: { status }, lastSeen: item.updatedAt });

  const invalidate = (assumption: ResolvedAssumption) => {
    setDraft({
      assumption,
      title: `${assumption.reference} invalidated: ${assumption.assumption}`,
      description: `The assumption "${assumption.assumption}" has been invalidated.\n\nRationale recorded when it was raised: ${assumption.rationale}\n\nOwner: ${assumption.owner}. Validation was due ${formatDate(assumption.validationDate)}.`,
      owner: assumption.owner,
      dueDate: addDaysIso(14),
    });
  };

  return (
    <div className="space-y-6">
      {!compact && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Open assumptions"
            value={String(metrics.open)}
            detail="Still to be validated"
            icon="projects"
          />
          <KpiCard
            label="Validation overdue"
            value={String(metrics.overdue)}
            detail="Past the validation date"
            icon="health"
          />
          <KpiCard
            label="Validated"
            value={String(metrics.validated)}
            detail="Confirmed as true"
            icon="forecast"
          />
          <KpiCard
            label="Invalidated"
            value={String(metrics.invalidated)}
            detail="Each one should have an issue"
            icon="health"
          />
        </div>
      )}

      <BoardWorkspace
        key={String(canEdit)}
        title="Assumption log"
        itemLabel="assumption"
        rows={assumptionsToRows(items)}
        columns={
          canEdit
            ? assumptionColumns
            : assumptionColumns.map((column) => ({ ...column, editable: false }))
        }
        manage={canEdit}
        canDelete={false}
        canCreate={false}
        onRecordChange={onRecordChange}
        groupOptions={["group", "scope"]}
        seededViews={assumptionViews}
        seededAutomations={governanceAutomationRecipes}
      />

      <section className="rounded-lg border border-border/70 bg-card shadow-sm">
        <header className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Validate or invalidate</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Invalidating an assumption prompts you to raise an issue.
          </p>
        </header>
        <div className="divide-y">
          {items
            .filter((item) => item.status === "Open")
            .map((item) => (
              <div key={item.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="text-sm font-medium">
                    {item.reference} · {item.assumption}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.scopeName} · {item.owner} · validation due{" "}
                    {formatDate(item.validationDate)}
                    {item.overdue ? " · overdue" : ""}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutations.updateAssumption.isPending}
                      onClick={() => setStatus(item, "Validated")}
                    >
                      <CheckCircle2 />
                      Validate
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => invalidate(item)}>
                      <TriangleAlert />
                      Invalidate
                    </Button>
                  </div>
                )}
              </div>
            ))}
          {!items.filter((item) => item.status === "Open").length && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No open assumptions here.
            </p>
          )}
        </div>
      </section>

      {items.some((item) => item.status === "Invalidated") && (
        <section className="rounded-lg border border-health-warn/40 bg-health-warn/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CircleAlert className="size-4 text-health-warn-foreground" />
            Invalidated assumptions
          </p>
          <div className="mt-2 space-y-2">
            {items
              .filter((item) => item.status === "Invalidated")
              .map((item) => (
                <div key={item.id} className="rounded-md border bg-background p-3">
                  <p className="text-sm font-medium">
                    {item.reference} · {item.assumption}
                  </p>
                  {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
                  <p
                    className={cn(
                      "mt-1 text-xs font-semibold",
                      item.raisedIssueId
                        ? "text-health-good-foreground"
                        : "text-health-bad-foreground",
                    )}
                  >
                    {item.raisedIssueId ? "Issue raised and linked" : "No issue raised yet"}
                  </p>
                </div>
              ))}
          </div>
        </section>
      )}

      {draft && (
        <>
          <button
            aria-label="Close issue draft"
            className="fixed inset-0 z-40 bg-overlay"
            onClick={() => setDraft(null)}
          />
          <aside
            role="dialog"
            aria-label="Raise issue from invalidated assumption"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l bg-background p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">
                  Assumption invalidated
                </p>
                <h2 className="mt-2 font-display text-xl font-semibold">Raise an issue?</h2>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setDraft(null)} aria-label="Close">
                <X />
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {draft.assumption.reference} is being invalidated. Raising an issue keeps the
              consequence visible and linked to the assumption.
            </p>
            <label className="mt-5 block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Title</span>
              <Input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </label>
            <label className="mt-4 block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Description</span>
              <Textarea
                rows={6}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Owner</span>
                <Input
                  list="assumption-people"
                  value={draft.owner}
                  onChange={(event) => setDraft({ ...draft, owner: event.target.value })}
                />
                <datalist id="assumption-people">
                  {data.people.map((person) => (
                    <option key={person.id} value={person.name} />
                  ))}
                </datalist>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Due date</span>
                <Input
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
                />
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <Button
                disabled={mutations.raiseIssue.isPending}
                onClick={() =>
                  mutations.raiseIssue.mutate(
                    {
                      assumption: draft.assumption,
                      title: draft.title,
                      description: draft.description,
                      ownerId:
                        data.people.find((person) => person.name === draft.owner)?.id ?? null,
                      dueDate: draft.dueDate || null,
                    },
                    { onSuccess: () => setDraft(null) },
                  )
                }
              >
                <TriangleAlert />
                Raise issue
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStatus(draft.assumption, "Invalidated");
                  setDraft(null);
                }}
              >
                Invalidate without an issue
              </Button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
