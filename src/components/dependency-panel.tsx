import { formatDate } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import { BellRing, CheckCircle2, CircleAlert, Handshake, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HealthPill } from "@/components/health-pill";
import type { Dependency } from "@/data/types";
import type { ResolvedDependency } from "@/services/dependencies";
import { useDependencyMutations } from "@/hooks/use-dependencies";
import { useOrgRaid, usePeople } from "@/hooks/use-hierarchy";
import { useCan } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

export const typeLegend: Array<{ type: Dependency["type"]; line: string; note: string }> = [
  { type: "Sequencing", line: "solid", note: "One side must finish before the other can start" },
  { type: "Alignment", line: "dashed", note: "Both sides must stay consistent with each other" },
  { type: "Information", line: "dotted", note: "One side needs data or insight from the other" },
  { type: "Resource", line: "dashed", note: "Both sides need the same people or kit" },
  { type: "External", line: "solid", note: "A third party outside the portfolio" },
];

/** Side panel for a dependency: acceptance, health explanation and RAID escalation. */
export function DependencyPanel({ dependency, onRaise, close }: {
  dependency: ResolvedDependency;
  onRaise?: (dependency: ResolvedDependency, kind: "Risk" | "Issue") => void;
  close: () => void;
}) {
  const canEdit = useCan("contributor", dependency.workspaceId);
  const { update } = useDependencyMutations();
  const accepted = { giver: dependency.giverAccepted, receiver: dependency.receiverAccepted };
  const confirmed = accepted.giver && accepted.receiver;
  const onAccept = (side: "giver" | "receiver") => {
    const next = { giverAccepted: side === "giver" ? true : accepted.giver, receiverAccepted: side === "receiver" ? true : accepted.receiver };
    const nowConfirmed = next.giverAccepted && next.receiverAccepted;
    update.mutate({ id: dependency.id, input: { ...(side === "giver" ? { giverAccepted: true } : { receiverAccepted: true }), ...(nowConfirmed && dependency.validation !== "Closed" && dependency.validation !== "Broken" ? { validation: "Confirmed" as const } : {}) }, lastSeen: dependency.updatedAt });
  };
  const people = usePeople().data ?? [];
  const emails = [dependency.giver.ownerId, dependency.receiver.ownerId].map(id => people.find(person => person.id === id)?.email).filter(Boolean);
  const notifyHref = `mailto:${emails.join(",")}?subject=${encodeURIComponent(`${dependency.reference} is off track`)}&body=${encodeURIComponent(`${dependency.giverLabel} → ${dependency.receiverLabel}\n\n${dependency.healthReason}\n\nRequired by ${formatDate(dependency.requiredBy)}.`)}`;
  const raid = useOrgRaid().data;
  const linkedRisks = dependency.riskIds.flatMap(riskId => raid?.risks.find(item => item.id === riskId) ?? []);
  const linkedIssues = dependency.issueIds.flatMap(issueId => raid?.issues.find(item => item.id === issueId) ?? []);

  return <>
    <button aria-label="Close dependency detail" className="fixed inset-0 z-40 bg-overlay" onClick={close} />
    <aside role="dialog" aria-label={`${dependency.reference} detail`} className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background p-6 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{dependency.reference} · {dependency.type}</p>
          <h2 className="mt-2 font-display text-xl font-semibold">{dependency.giverLabel} → {dependency.receiverLabel}</h2>
        </div>
        <Button size="icon" variant="ghost" onClick={close} aria-label="Close"><X /></Button>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">{dependency.description}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Side title="Giving side" label={dependency.giverLabel} programme={dependency.giverProgrammeName} owner={dependency.giver.owner} pm={dependency.giverPm} accepted={accepted.giver} {...(canEdit ? { onAccept: () => onAccept("giver") } : {})} />
        <Side title="Receiving side" label={dependency.receiverLabel} programme={dependency.receiverProgrammeName} owner={dependency.receiver.owner} pm={dependency.receiverPm} accepted={accepted.receiver} {...(canEdit ? { onAccept: () => onAccept("receiver") } : {})} />
      </div>

      <div className={cn("mt-4 flex items-center gap-2 rounded-md border p-3 text-sm", confirmed ? "border-health-good/40 bg-health-good/10" : "border-health-warn/40 bg-health-warn/10")}>
        {confirmed ? <CheckCircle2 className="size-4 text-health-good-foreground" /> : <Handshake className="size-4 text-health-warn-foreground" />}
        <span className="font-medium">{confirmed ? "Confirmed — both owners have accepted." : accepted.giver ? "Awaiting receiver" : accepted.receiver ? "Awaiting giver" : "Awaiting both owners"}</span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-xs text-muted-foreground">Boundary</dt><dd className="mt-1 font-medium">{dependency.boundary}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Criticality</dt><dd className="mt-1 font-medium">{dependency.criticality}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Required by</dt><dd className="mt-1 font-medium">{formatDate(dependency.requiredBy)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Validation status</dt><dd className="mt-1 font-medium">{dependency.validation}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Raised</dt><dd className="mt-1 font-medium">{formatDate(dependency.raisedDate)} by {dependency.raisedBy}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Health</dt><dd className="mt-1"><HealthPill health={dependency.health} /></dd></div>
      </dl>

      <div className="mt-5 rounded-md border p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">{dependency.health === "On Track" ? <CheckCircle2 className="size-4 text-health-good-foreground" /> : <CircleAlert className="size-4 text-health-warn-foreground" />}Health calculation</p>
        <p className="mt-2 text-sm text-muted-foreground">{dependency.healthReason}</p>
        {dependency.giverMilestone && <p className="mt-2 text-xs text-muted-foreground">Giving milestone: {dependency.giverMilestone.title} · baseline {formatDate(dependency.giverMilestone.baselineDate)} · forecast {formatDate(dependency.giverMilestone.forecastDate)}</p>}
      </div>

      {dependency.health === "Off Track" && <div className="mt-4 rounded-md border border-health-bad/40 bg-health-bad/10 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><TriangleAlert className="size-4 text-health-bad-foreground" />This dependency is off track</p>
        <p className="mt-1 text-xs text-muted-foreground">Tell both owners, then record the consequence as a risk or an issue linked to this dependency.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {emails.length > 0 && <Button asChild size="sm" variant="outline"><a href={notifyHref}><BellRing />Email both owners</a></Button>}
          {canEdit && onRaise && <><Button size="sm" onClick={() => onRaise(dependency, "Risk")}><ShieldAlert />Raise risk</Button>
          <Button size="sm" variant="outline" onClick={() => onRaise(dependency, "Issue")}><CircleAlert />Raise issue</Button></>}
        </div>
      </div>}

      {(linkedRisks.length > 0 || linkedIssues.length > 0) && <div className="mt-5">
        <p className="text-sm font-semibold">Linked RAID items</p>
        <div className="mt-2 space-y-2">{[...linkedRisks.map(risk => ({ id: risk.id, title: risk.title, code: risk.projectCode, detail: `Risk · score ${risk.score}${risk.reviewDate ? ` · review ${formatDate(risk.reviewDate)}` : ""}` })), ...linkedIssues.map(issue => ({ id: issue.id, title: issue.title, code: issue.projectCode, detail: `Issue · ${issue.severity} severity${issue.dueDate ? ` · due ${formatDate(issue.dueDate)}` : ""}` }))].map(item => item.code
          ? <Link key={item.id} to="/portfolio/projects/$projectCode" params={{ projectCode: item.code }} className="block rounded-md border p-3 hover:bg-accent/30"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></Link>
          : <div key={item.id} className="rounded-md border p-3"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div>)}</div>
      </div>}
    </aside>
  </>;
}

function Side({ title, label, programme, owner, pm, accepted, onAccept }: { title: string; label: string; programme: string; owner: string; pm: string; accepted: boolean; onAccept?: () => void }) {
  return <div className="rounded-md border p-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    <p className="mt-1.5 text-sm font-semibold">{label}</p>
    <p className="mt-1 text-xs text-muted-foreground">{programme}</p>
    <p className="mt-2 text-xs">Owner · <strong>{owner || "Unassigned"}</strong></p>
    <p className="text-xs text-muted-foreground">PM · {pm}</p>
    {accepted ? <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-health-good-foreground"><CheckCircle2 className="size-4" />Accepted</span>
      : onAccept ? <Button size="sm" variant="outline" className="mt-3" onClick={onAccept}>Accept</Button> : <span className="mt-3 inline-block text-xs text-muted-foreground">Not yet accepted</span>}
  </div>;
}
