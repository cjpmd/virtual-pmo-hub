import { formatDate } from "@/lib/format";
import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ClipboardList, Handshake, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BoardWorkspace, dependencyAutomationRecipes } from "@/components/board-workspace";
import { DependencyPanel, type AcceptanceState } from "@/components/dependency-panel";
import { KpiCard } from "@/components/pmo-ui";
import { dependencyColumns, dependenciesToRows, dependencyViews } from "@/lib/dependency-board-data";
import { getDependencies, getDependencyMetrics, getDependencySyncAgenda, type ResolvedDependency } from "@/services/dependencies";
import { cn } from "@/lib/utils";

interface RaidDraft { kind: "Risk" | "Issue"; title: string; description: string; owner: string; dueDate: string; dependency: ResolvedDependency }

export function DependencyWorkspace() {
  const all = useMemo(() => getDependencies(), []);
  const [overrides, setOverrides] = useState<Record<string, AcceptanceState>>({});
  const [selected, setSelected] = useState<ResolvedDependency | null>(null);
  const [sync, setSync] = useState(false);
  const [draft, setDraft] = useState<RaidDraft | null>(null);
  const [raised, setRaised] = useState<string[]>([]);

  const items = all.map(item => {
    const override = overrides[item.id];
    if (!override) return item;
    const confirmed = override.giver && override.receiver;
    return { ...item, giverAccepted: override.giver, receiverAccepted: override.receiver, acceptance: confirmed ? "Confirmed" : override.giver ? "Awaiting receiver" : override.receiver ? "Awaiting giver" : "Awaiting both", validation: confirmed && item.validation !== "Closed" && item.validation !== "Broken" ? "Confirmed" as const : item.validation };
  });
  const metrics = getDependencyMetrics(items);
  const agenda = getDependencySyncAgenda(items);

  const accept = (id: string, side: "giver" | "receiver") => setOverrides(current => {
    const base = current[id] ?? { giver: all.find(item => item.id === id)?.giverAccepted ?? false, receiver: all.find(item => item.id === id)?.receiverAccepted ?? false };
    return { ...current, [id]: { ...base, [side]: true } };
  });
  const raise = (dependency: ResolvedDependency, kind: "Risk" | "Issue") => setDraft({
    kind, dependency,
    title: kind === "Risk" ? `${dependency.reference}: ${dependency.giverLabel} may not deliver by ${formatDate(dependency.requiredBy)}` : `${dependency.reference}: ${dependency.giverLabel} has not delivered by ${formatDate(dependency.requiredBy)}`,
    description: `${dependency.description}\n\n${dependency.healthReason}\n\nGiving owner: ${dependency.giver.owner}. Receiving owner: ${dependency.receiver.owner}. Boundary: ${dependency.boundary}.`,
    owner: dependency.receiver.owner,
    dueDate: dependency.requiredBy,
  });

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Dependencies" value={String(metrics.total)} detail={`${metrics.inferred} inferred and unvalidated`} icon="projects" />
      <KpiCard label="Cross-PM" value={String(metrics.crossPm)} detail="Between different project managers" icon="health" />
      <KpiCard label="Awaiting confirmation" value={String(metrics.awaiting)} detail="One or both owners still to accept" icon="forecast" />
      <KpiCard label="Off track" value={String(metrics.offTrack)} detail={`${metrics.atRisk} more at risk`} icon="health" />
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => setSync(true)}><ClipboardList />Dependency sync</Button>
      <p className="text-sm text-muted-foreground">Generates the agenda for the PM sync: cross-PM dependencies that are off track, awaiting confirmation, or needed in the next 30 days.</p>
    </div>

    <BoardWorkspace title="Dependency register" itemLabel="dependency" rows={dependenciesToRows(items)} columns={dependencyColumns} groupOptions={["group", "boundary", "dependencyType", "validation"]} seededViews={dependencyViews} seededAutomations={dependencyAutomationRecipes}
      renderTitle={row => <button onClick={event => { event.stopPropagation(); setSelected(items.find(item => item.id === row.id) ?? null) }} className="text-left text-primary hover:underline">{String(row["reference"])} · {row.title}</button>} />

    {selected && <DependencyPanel dependency={items.find(item => item.id === selected.id) ?? selected} overrides={overrides} onAccept={accept} onRaise={raise} close={() => setSelected(null)} />}

    {sync && <SyncAgenda agenda={agenda} close={() => setSync(false)} onOpen={dependency => { setSync(false); setSelected(dependency) }} />}

    {draft && <>
      <button aria-label="Close RAID draft" className="fixed inset-0 z-[60] bg-overlay" onClick={() => setDraft(null)} />
      <aside role="dialog" aria-label={`Raise ${draft.kind.toLowerCase()}`} className="fixed inset-y-0 right-0 z-[70] w-full max-w-lg overflow-y-auto border-l bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div><p className="text-xs font-semibold uppercase text-primary">Linked RAID item</p><h2 className="mt-2 font-display text-xl font-semibold">Raise {draft.kind.toLowerCase()}</h2></div>
          <Button size="icon" variant="ghost" onClick={() => setDraft(null)} aria-label="Close"><X /></Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Pre-filled from {draft.dependency.reference}. It will be linked back to the dependency.</p>
        <label className="mt-5 block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Title</span><Input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="mt-4 block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Description</span><Textarea rows={6} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Owner</span><Input value={draft.owner} onChange={event => setDraft({ ...draft, owner: event.target.value })} /></label>
          <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">{draft.kind === "Risk" ? "Review date" : "Due date"}</span><Input value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
        </div>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => { setRaised(current => [...current, `${draft.dependency.reference}-${draft.kind}`]); setDraft(null) }}>{draft.kind === "Risk" ? <ShieldAlert /> : <TriangleAlert />}Create {draft.kind.toLowerCase()}</Button>
          <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
        </div>
      </aside>
    </>}

    {raised.length > 0 && <div className="flex items-center gap-2 rounded-md border border-health-good/40 bg-health-good/10 p-3 text-sm">
      <CheckCircle2 className="size-4 text-health-good-foreground" />{raised.length} RAID item{raised.length === 1 ? "" : "s"} raised from dependencies in this session: {raised.join(", ")}.
    </div>}
  </div>;
}

function SyncAgenda({ agenda, close, onOpen }: { agenda: ReturnType<typeof getDependencySyncAgenda>; close: () => void; onOpen: (dependency: ResolvedDependency) => void }) {
  const sections: Array<{ title: string; note: string; items: ResolvedDependency[]; tone: string; Icon: typeof TriangleAlert }> = [
    { title: "Off track", note: "The giving side will miss the required-by date.", items: agenda.offTrack, tone: "border-health-bad/40 bg-health-bad/5", Icon: TriangleAlert },
    { title: "Awaiting confirmation", note: "One or both owners have not accepted the dependency.", items: agenda.awaitingConfirmation, tone: "border-health-warn/40 bg-health-warn/5", Icon: Handshake },
    { title: "Required in the next 30 days", note: "Close enough to need a check-in at this sync.", items: agenda.dueSoon, tone: "border-border", Icon: CalendarClock },
  ];
  return <>
    <button aria-label="Close sync agenda" className="fixed inset-0 z-40 bg-overlay" onClick={close} />
    <aside role="dialog" aria-label="Dependency sync agenda" className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l bg-background p-6 shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-primary">Project manager sync</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">Dependency sync agenda</h2>
          <p className="mt-2 text-sm text-muted-foreground">Cross-PM and external dependencies needing a conversation · generated 21/09/2026</p>
        </div>
        <Button size="icon" variant="ghost" onClick={close} aria-label="Close"><X /></Button>
      </div>
      <div className="mt-6 space-y-5">
        {sections.map(({ title, note, items, tone, Icon }) => <section key={title} className={cn("rounded-md border p-4", tone)}>
          <p className="flex items-center gap-2 font-semibold"><Icon className="size-4" />{title} <span className="text-xs font-normal text-muted-foreground">({items.length})</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          <div className="mt-3 space-y-2">
            {items.map(item => <button key={item.id} onClick={() => onOpen(item)} className="block w-full rounded-md border bg-background p-3 text-left hover:bg-accent/30">
              <p className="text-sm font-medium">{item.reference} · {item.giverLabel} → {item.receiverLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.giverPm} → {item.receiverPm} · required by {formatDate(item.requiredBy)} · {item.type} · {item.criticality} criticality</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.healthReason}</p>
            </button>)}
            {!items.length && <p className="text-xs text-muted-foreground">Nothing to discuss in this section.</p>}
          </div>
        </section>)}
      </div>
      <div className="mt-6 flex gap-2"><Button variant="outline" onClick={close}>Close</Button><Button onClick={close}>Send agenda to PMs</Button></div>
    </aside>
  </>;
}
