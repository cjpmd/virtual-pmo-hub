import { formatDate } from "@/lib/format";
import { toProjectCode } from "@/services/legacy-bridge";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BellRing, CheckCircle2, CircleAlert, Handshake, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HealthPill } from "@/components/health-pill";
import type { Dependency } from "@/data/types";
import type { ResolvedDependency } from "@/services/dependencies";
import { getProject } from "@/services/pmo";
import { cn } from "@/lib/utils";

export const typeLegend: Array<{ type: Dependency["type"]; line: string; note: string }> = [
  { type: "Sequencing", line: "solid", note: "One side must finish before the other can start" },
  { type: "Alignment", line: "dashed", note: "Both sides must stay consistent with each other" },
  { type: "Information", line: "dotted", note: "One side needs data or insight from the other" },
  { type: "Resource", line: "dashed", note: "Both sides need the same people or kit" },
  { type: "External", line: "solid", note: "A third party outside the portfolio" },
];

export interface AcceptanceState { giver: boolean; receiver: boolean }

/** Side panel for a dependency: acceptance, health explanation and RAID escalation. */
export function DependencyPanel({ dependency, overrides, onAccept, onRaise, close }: {
  dependency: ResolvedDependency;
  overrides: Record<string, AcceptanceState>;
  onAccept: (id: string, side: "giver" | "receiver") => void;
  onRaise: (dependency: ResolvedDependency, kind: "Risk" | "Issue") => void;
  close: () => void;
}) {
  const accepted = overrides[dependency.id] ?? { giver: dependency.giverAccepted, receiver: dependency.receiverAccepted };
  const confirmed = accepted.giver && accepted.receiver;
  const [notified, setNotified] = useState(false);
  const linkedRisks = dependency.riskIds.flatMap(riskId => {
    const project = getProject(dependency.receiver.projectId ?? "") ?? getProject(dependency.giver.projectId ?? "");
    const risk = project?.risks.find(item => item.id === riskId);
    return risk ? [{ risk, projectId: project?.id ?? "" }] : [];
  });

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
        <Side title="Giving side" label={dependency.giverLabel} programme={dependency.giverProgrammeName} owner={dependency.giver.owner} pm={dependency.giverPm} accepted={accepted.giver} onAccept={() => onAccept(dependency.id, "giver")} />
        <Side title="Receiving side" label={dependency.receiverLabel} programme={dependency.receiverProgrammeName} owner={dependency.receiver.owner} pm={dependency.receiverPm} accepted={accepted.receiver} onAccept={() => onAccept(dependency.id, "receiver")} />
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
        <p className="mt-1 text-xs text-muted-foreground">Both owners are notified automatically when a sequencing dependency goes off track.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setNotified(true)} disabled={notified}><BellRing />{notified ? "Owners notified" : "Notify both owners"}</Button>
          <Button size="sm" onClick={() => onRaise(dependency, "Risk")}><ShieldAlert />Raise risk</Button>
          <Button size="sm" variant="outline" onClick={() => onRaise(dependency, "Issue")}><CircleAlert />Raise issue</Button>
        </div>
      </div>}

      {linkedRisks.length > 0 && <div className="mt-5">
        <p className="text-sm font-semibold">Linked RAID items</p>
        <div className="mt-2 space-y-2">{linkedRisks.map(({ risk, projectId }) => <Link key={risk.id} to="/portfolio/projects/$projectCode" params={{ projectCode: toProjectCode(projectId) }} className="block rounded-md border p-3 hover:bg-accent/30">
          <p className="text-sm font-medium">{risk.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">Score {risk.score} · {risk.owner} · review {formatDate(risk.reviewDate)}</p>
        </Link>)}</div>
      </div>}
    </aside>
  </>;
}

function Side({ title, label, programme, owner, pm, accepted, onAccept }: { title: string; label: string; programme: string; owner: string; pm: string; accepted: boolean; onAccept: () => void }) {
  return <div className="rounded-md border p-4">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    <p className="mt-1.5 text-sm font-semibold">{label}</p>
    <p className="mt-1 text-xs text-muted-foreground">{programme}</p>
    <p className="mt-2 text-xs">Owner · <strong>{owner}</strong></p>
    <p className="text-xs text-muted-foreground">PM · {pm}</p>
    {accepted ? <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-health-good-foreground"><CheckCircle2 className="size-4" />Accepted</span>
      : <Button size="sm" variant="outline" className="mt-3" onClick={onAccept}>Accept</Button>}
  </div>;
}
