// Decision cards for one project or programme (brief §2), with "New decision" and the drawer.
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DecisionPanel, type DecisionCreateScope } from "@/components/decision-panel";
import { DecisionFlags, DecisionStatusPill } from "@/components/decision-pills";
import { QueryState } from "@/components/query-state";
import { useGovernance } from "@/hooks/use-governance";
import { scopedTo, type ResolvedDecision } from "@/services/decisions";

export function DecisionLog({
  scope,
  createScope,
  canCreate,
  initialOpenId,
}: {
  scope: { projectId?: string; programmeId?: string };
  createScope: DecisionCreateScope;
  canCreate: boolean;
  /** Open this decision on first render (e.g. from a highlight report link). */
  initialOpenId?: string | undefined;
}) {
  const governance = useGovernance();
  return (
    <QueryState query={governance}>
      {(data) => (
        <Cards
          all={data.decisions}
          scope={scope}
          createScope={createScope}
          canCreate={canCreate}
          initialOpenId={initialOpenId}
        />
      )}
    </QueryState>
  );
}

function Cards({
  all,
  scope,
  createScope,
  canCreate,
  initialOpenId,
}: {
  all: ResolvedDecision[];
  scope: { projectId?: string; programmeId?: string };
  createScope: DecisionCreateScope;
  canCreate: boolean;
  initialOpenId: string | undefined;
}) {
  const items = useMemo(() => scopedTo(all, scope), [all, scope]);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [creating, setCreating] = useState(false);
  const open = all.find((item) => item.id === openId);

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus />
            New decision
          </Button>
        </div>
      )}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => setOpenId(item.id)}
                className="text-left text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {item.reference} · {item.title}
              </button>
              <div className="flex flex-wrap gap-1.5">
                <DecisionStatusPill status={item.status} />
                <DecisionFlags
                  overdue={item.overdue}
                  daysOverdue={item.daysOverdue}
                  deferralCount={item.deferralCount}
                />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {item.forum || "No forum"} · {item.decisionMaker || "No decision maker"} · needed by{" "}
              {formatDate(item.neededBy)}
              {item.decisionDate ? ` · decided ${formatDate(item.decisionDate)}` : ""}
            </p>
            {item.context && (
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.context}</p>
            )}
            {item.status === "Made" && item.pendingSuccessorRef && item.pendingSuccessorId && (
              <p className="mt-2 text-xs">
                Replacement proposed:{" "}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => setOpenId(item.pendingSuccessorId)}
                >
                  {item.pendingSuccessorRef}
                </button>
              </p>
            )}
          </li>
        ))}
        {!items.length && (
          <li className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No decisions recorded yet.
          </li>
        )}
      </ul>
      {(open || creating) && (
        <DecisionPanel
          decision={creating ? undefined : open}
          all={all}
          createScope={createScope}
          close={() => {
            setOpenId(null);
            setCreating(false);
          }}
          onOpen={(id) => {
            setCreating(false);
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}
