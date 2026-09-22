import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileText, Gavel, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { DecisionPanel } from "@/components/decision-panel";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { getValidationQueue } from "@/services/benefits-value";
import { getDecisions, type ResolvedDecision } from "@/services/decisions";
import { getCurrentUser, useSettings } from "@/services/settings";
import { cn } from "@/lib/utils";

const title = "Approvals — Virtual PMO", description = "Decisions and measurement records waiting on you.";
export const Route = createFileRoute("/home/approvals")({ head: () => ({ meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: Page });

function Page() {
  useSettings();
  const user = getCurrentUser();
  const [decided, setDecided] = useState<Record<string, "Validated" | "Queried">>({});
  const [open, setOpen] = useState<ResolvedDecision | null>(null);
  const [mine, setMine] = useState(true);

  const allDecisions = useMemo(() => getDecisions(), []);
  const queue = useMemo(() => getValidationQueue(), []);
  const pending = allDecisions.filter(item => item.status === "Pending" && (!mine || item.decisionMaker === user?.name));
  const outstanding = queue.filter(item => !decided[item.record.id]);

  return <div className="space-y-6">
    <AutoBreadcrumbs />
    <PageHeader eyebrow="Personal workspace" title="Approvals" description="Everything waiting on a decision or a validation from you, in one queue."
      actions={<Button variant={mine ? "default" : "outline"} onClick={() => setMine(value => !value)}>{mine ? "Showing mine" : "Showing everyone's"}</Button>} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Decisions awaiting me" value={String(pending.length)} detail={`${pending.filter(item => item.overdue).length} past the needed-by date`} icon="projects" />
      <KpiCard label="Measurements to validate" value={String(outstanding.length)} detail="Submitted evidence in the queue" icon="health" />
      <KpiCard label="Handled in this session" value={String(Object.keys(decided).length)} detail="Validated or queried" icon="forecast" />
      <KpiCard label="Your role" value={user?.role ?? "—"} detail={user?.name ?? ""} icon="budget" />
    </div>

    <section className="rounded-lg border bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b p-5"><Gavel className="size-5 text-primary" /><div><h2 className="font-display text-lg font-semibold">Decisions awaiting approval</h2><p className="mt-0.5 text-sm text-muted-foreground">Open one to review the options and record the outcome.</p></div></header>
      <div className="divide-y">
        {pending.map(item => <button key={item.id} onClick={() => setOpen(item)} className="grid w-full gap-2 p-4 text-left hover:bg-accent/30 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold">{item.reference} · {item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.scopeName} · {item.forum} · {item.options.length} options · impact on {item.impactSummary.toLowerCase()}</p>
          </div>
          <span className={cn("justify-self-start rounded-full px-2.5 py-1 text-xs font-semibold lg:justify-self-auto", item.overdue ? "bg-health-bad/20 text-health-bad-foreground" : "bg-health-warn/25 text-health-warn-foreground")}>Needed by {formatDate(item.neededBy)}{item.overdue ? " · overdue" : ""}</span>
        </button>)}
        {!pending.length && <p className="p-8 text-center text-sm text-muted-foreground">No decisions are waiting on you.</p>}
      </div>
    </section>

    <section className="rounded-lg border bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b p-5"><ShieldCheck className="size-5 text-primary" /><div><h2 className="font-display text-lg font-semibold">Measurements awaiting validation</h2><p className="mt-0.5 text-sm text-muted-foreground">Benefit evidence submitted by owners for PMO validation.</p></div></header>
      <div className="divide-y">
        {queue.map(item => {
          const outcome = decided[item.record.id];
          const profile = item.measure.targetProfile.find(target => target.period === item.record.period)?.value ?? 0;
          return <div key={item.record.id} className="grid gap-3 p-5 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-semibold"><Link to="/benefits/$benefitId" params={{ benefitId: item.benefit.id }} className="text-primary hover:underline">{item.benefit.reference}</Link> · {item.measure.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.record.period} · submitted by {item.record.submittedBy}{item.record.submittedDate ? ` on ${formatDate(item.record.submittedDate)}` : ""}</p>
              <p className="mt-2 text-sm">Reported <strong>{item.measure.unit === "currency" ? formatCurrency(item.record.actualValue) : `${item.record.actualValue.toLocaleString()} ${item.measure.unit}`}</strong> against a profile of {item.measure.unit === "currency" ? formatCurrency(profile) : `${profile.toLocaleString()} ${item.measure.unit}`}.</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="size-3.5" />{item.record.evidence}</p>
            </div>
            <div className="flex items-start gap-2">
              {outcome
                ? <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", outcome === "Validated" ? "bg-health-good/20 text-health-good-foreground" : "bg-health-warn/25 text-health-warn-foreground")}><CheckCircle2 className="size-4" />{outcome}</span>
                : <><Button size="sm" onClick={() => setDecided(current => ({ ...current, [item.record.id]: "Validated" }))}><ClipboardCheck />Validate</Button>
                  <Button size="sm" variant="outline" onClick={() => setDecided(current => ({ ...current, [item.record.id]: "Queried" }))}><MessageCircleQuestion />Query</Button></>}
            </div>
          </div>;
        })}
        {!queue.length && <p className="p-8 text-center text-sm text-muted-foreground">Nothing is waiting for validation.</p>}
      </div>
    </section>

    {open && <DecisionPanel decision={open} all={allDecisions} onRecord={() => setOpen(null)} close={() => setOpen(null)} />}
  </div>;
}
