import { formatDate } from "@/lib/format";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleDot, FileText, Lock, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DecisionImpact } from "@/data/types";
import { isDecisionReadOnly, type ResolvedDecision } from "@/services/decisions";
import { useGovernanceMutations } from "@/hooks/use-governance";
import { useCan } from "@/hooks/use-permissions";
import { addDaysIso, todayIso } from "@/lib/today";
import { cn } from "@/lib/utils";

const impactKeys: Array<keyof DecisionImpact> = ["scope", "cost", "time", "benefits"];
const impactLabels: Record<keyof DecisionImpact, string> = { scope: "Scope", cost: "Cost", time: "Time", benefits: "Benefits" };

/** Decision detail. Contributors on the decision's workspace can record the outcome or supersede it. */
export function DecisionPanel({ decision, all, close }: {
  decision: ResolvedDecision;
  all: ResolvedDecision[];
  close: () => void;
}) {
  const canWrite = useCan("contributor", decision.scope.workspaceId);
  const mutations = useGovernanceMutations();
  const onRecord = canWrite ? true : undefined;
  const readOnly = isDecisionReadOnly(decision);
  const [optionId, setOptionId] = useState(decision.chosenOptionId ?? decision.options[0]?.id ?? "");
  const [rationale, setRationale] = useState(decision.rationale ?? "");
  const [decisionDate, setDecisionDate] = useState(decision.decisionDate ?? todayIso());
  const superseding = mutations.supersede.isSuccess;
  const chosenId = decision.chosenOptionId;
  const supersedes = decision.supersedesId ? all.find(item => item.id === decision.supersedesId) : undefined;
  const supersededBy = decision.supersededById ? all.find(item => item.id === decision.supersededById) : undefined;

  return <>
    <button aria-label="Close decision detail" className="fixed inset-0 z-40 bg-overlay" onClick={close} />
    <aside role="dialog" aria-label={`${decision.reference} detail`} className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l bg-background p-6 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{decision.reference} · {decision.forum}</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{decision.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{decision.scopeName} · decision maker {decision.decisionMaker}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={close} aria-label="Close"><X /></Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("rounded-full px-2.5 py-1 font-semibold", decision.status === "Made" ? "bg-health-good/20 text-health-good-foreground" : decision.status === "Pending" ? (decision.overdue ? "bg-health-bad/20 text-health-bad-foreground" : "bg-health-warn/25 text-health-warn-foreground") : "bg-muted text-muted-foreground")}>{decision.status}{decision.overdue ? " · overdue" : ""}</span>
        <span className="text-muted-foreground">Needed by {formatDate(decision.neededBy)}</span>
        {decision.decisionDate && <span className="text-muted-foreground">· Decided {formatDate(decision.decisionDate)}</span>}
        {readOnly && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground"><Lock className="size-3" />Read-only</span>}
      </div>

      {supersedes && <p className="mt-3 rounded-md border bg-muted/40 p-3 text-xs">Supersedes <strong>{supersedes.reference}</strong> · {supersedes.title}</p>}
      {supersededBy && <p className="mt-3 rounded-md border border-health-warn/40 bg-health-warn/10 p-3 text-xs">Superseded by <strong>{supersededBy.reference}</strong> · {supersededBy.title}</p>}

      <section className="mt-5">
        <h3 className="text-sm font-semibold">Context</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{decision.context}</p>
      </section>

      <section className="mt-5">
        <h3 className="text-sm font-semibold">Options considered</h3>
        <div className="mt-3 space-y-3">
          {decision.options.map(option => <div key={option.id} className={cn("rounded-md border p-4", chosenId === option.id && "border-primary bg-primary/5")}>
            <div className="flex items-start gap-2">
              {!readOnly && onRecord
                ? <input type="radio" name={`option-${decision.id}`} checked={optionId === option.id} onChange={() => setOptionId(option.id)} className="mt-1" aria-label={`Choose ${option.title}`} />
                : <CircleDot className={cn("mt-0.5 size-4", chosenId === option.id ? "text-primary" : "text-muted-foreground")} />}
              <p className="flex-1 text-sm font-semibold">{option.title}{chosenId === option.id && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">Chosen</span>}</p>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div><p className="flex items-center gap-1.5 text-xs font-semibold text-health-good-foreground"><ThumbsUp className="size-3.5" />Pros</p><ul className="mt-1 space-y-1 text-xs text-muted-foreground">{option.pros.map(pro => <li key={pro}>• {pro}</li>)}</ul></div>
              <div><p className="flex items-center gap-1.5 text-xs font-semibold text-health-bad-foreground"><ThumbsDown className="size-3.5" />Cons</p><ul className="mt-1 space-y-1 text-xs text-muted-foreground">{option.cons.map(con => <li key={con}>• {con}</li>)}</ul></div>
            </div>
          </div>)}
        </div>
      </section>

      {decision.rationale && <section className="mt-5"><h3 className="text-sm font-semibold">Rationale</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{decision.rationale}</p></section>}

      {!readOnly && onRecord && <section className="mt-5 rounded-md border border-primary/30 bg-primary/5 p-4">
        <h3 className="text-sm font-semibold">Record the outcome</h3>
        <label className="mt-3 block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Rationale</span><Textarea rows={3} value={rationale} onChange={event => setRationale(event.target.value)} placeholder="Why this option was chosen…" /></label>
        <label className="mt-3 block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Decision date</span><Input type="date" value={decisionDate} onChange={event => setDecisionDate(event.target.value)} className="w-44" /></label>
        <Button className="mt-3" disabled={!optionId || !rationale.trim() || !decisionDate || mutations.recordDecision.isPending} onClick={() => mutations.recordDecision.mutate({ id: decision.id, optionId, rationale, decisionDate, lastSeen: decision.updatedAt })}><CheckCircle2 />Record decision</Button>
        <p className="mt-2 text-xs text-muted-foreground">Once recorded, a decision is read-only. Changing it later creates a new decision that supersedes this one.</p>
      </section>}

      {readOnly && decision.status === "Made" && canWrite && <section className="mt-5 rounded-md border p-4">
        <h3 className="text-sm font-semibold">Change this decision</h3>
        <p className="mt-1 text-xs text-muted-foreground">Made decisions cannot be edited. Raising a change creates a new decision that supersedes {decision.reference}; both stay linked.</p>
        {superseding
          ? <p className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">A superseding decision for {decision.reference} has been created with the same context and options. It is pending at {decision.forum}, needed within two weeks.</p>
          : <Button className="mt-3" variant="outline" disabled={mutations.supersede.isPending} onClick={() => mutations.supersede.mutate({ decision, neededBy: addDaysIso(14) })}>Supersede with a new decision</Button>}
      </section>}

      <section className="mt-5">
        <h3 className="text-sm font-semibold">Impact</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {impactKeys.map(key => <div key={key} className="rounded-md border p-3">
            <p className="flex items-center justify-between text-xs font-semibold">{impactLabels[key]}<span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", decision.impact[key].impacted ? "bg-health-warn/25 text-health-warn-foreground" : "bg-muted text-muted-foreground")}>{decision.impact[key].impacted ? "Yes" : "No"}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">{decision.impact[key].note}</p>
          </div>)}
        </div>
      </section>

      {decision.actions.length > 0 && <section className="mt-5">
        <h3 className="text-sm font-semibold">Resulting actions</h3>
        <div className="mt-2 divide-y rounded-md border">
          {decision.actions.map(action => <div key={action.id} className="flex items-start gap-3 p-3">
            <CheckCircle2 className={cn("mt-0.5 size-4 shrink-0", action.status === "Done" ? "text-health-good-foreground" : "text-muted-foreground")} />
            <div className="flex-1"><p className="text-sm">{action.description}</p><p className="mt-0.5 text-xs text-muted-foreground">{action.owner} · due {formatDate(action.dueDate)}</p></div>
            <span className="text-xs font-semibold text-muted-foreground">{action.status}</span>
          </div>)}
        </div>
      </section>}

      <section className="mt-5 grid gap-3 sm:grid-cols-2 text-sm">
        {decision.projectCode && <Link to="/portfolio/projects/$projectCode" params={{ projectCode: decision.projectCode }} className="font-semibold text-primary hover:underline">Open the project →</Link>}
        {decision.dependencyIds.length > 0 && <Link to="/delivery/dependencies" className="font-semibold text-primary hover:underline">{decision.dependencyIds.length} linked dependenc{decision.dependencyIds.length === 1 ? "y" : "ies"} →</Link>}
        {decision.benefitIds.length > 0 && <Link to="/benefits/register" className="font-semibold text-primary hover:underline">{decision.benefitIds.length} linked benefit{decision.benefitIds.length === 1 ? "" : "s"} →</Link>}
        {decision.evidenceLink && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="size-3.5" />{decision.evidenceLink}</span>}
      </section>
    </aside>
  </>;
}
