import { formatDate } from "@/lib/format";
import { useState } from "react";
import { CalendarClock, CheckCircle2, ClipboardList, Handshake, Plus, ShieldAlert, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BoardWorkspace, dependencyAutomationRecipes } from "@/components/board-workspace";
import { DependencyPanel } from "@/components/dependency-panel";
import { QueryState } from "@/components/query-state";
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { useDependencies, useDependencyMutations } from "@/hooks/use-dependencies";
import { useCan } from "@/hooks/use-permissions";
import { toast } from "sonner";
import { KpiCard } from "@/components/pmo-ui";
import { dependencyColumns, dependenciesToRows, dependencyInputFromBoard, dependencyViews } from "@/lib/dependency-board-data";
import { getDependencyMetrics, getDependencySyncAgenda, type DependenciesData, type DependencyInput, type ResolvedDependency } from "@/services/dependencies";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/today";
import { DependencyEditor } from "@/components/dependency-editor";

interface RaidDraft { kind: "Risk" | "Issue"; title: string; description: string; owner: string; dueDate: string; dependency: ResolvedDependency }

export function DependencyWorkspace() {
  const dependencies = useDependencies();
  return <QueryState query={dependencies}>{data => <Workspace data={data} />}</QueryState>;
}

function Workspace({ data }: { data: DependenciesData }) {
  const items = data.dependencies;
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sync, setSync] = useState(false);
  const [draft, setDraft] = useState<RaidDraft | null>(null);
  const canEdit = useCan("contributor"), canDelete = useCan("manager");
  const mutations = useDependencyMutations();
  const editing = editingId === "new" ? "new" : items.find(item => item.id === editingId);
  const selected = items.find(item => item.id === selectedId);
  const metrics = getDependencyMetrics(items);
  const agenda = getDependencySyncAgenda(items);
  const onRecordChange = useBoardRecordSync<DependencyInput>({
    toInput: dependencyInputFromBoard,
    create: () => setEditingId("new"),
    update: (id, input, lastSeen) => mutations.update.mutateAsync({ id, input, lastSeen }),
    remove: ids => mutations.remove.mutate(ids),
    lastSeen: id => items.find(item => item.id === id)?.updatedAt,
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
      {canEdit && <Button variant="outline" onClick={() => setEditingId("new")}><Plus />New dependency</Button>}
      <p className="text-sm text-muted-foreground">Generates the agenda for the PM sync: cross-PM dependencies that are off track, awaiting confirmation, or needed in the next 30 days.</p>
    </div>

    <BoardWorkspace key={String(canEdit)} title="Dependency register" itemLabel="dependency" manage={canEdit} canDelete={canDelete} canCreate={false} onRecordChange={onRecordChange} rows={dependenciesToRows(items)} columns={canEdit ? dependencyColumns : dependencyColumns.map(column => ({ ...column, editable: false }))} groupOptions={["group", "boundary", "dependencyType", "validation"]} seededViews={dependencyViews} seededAutomations={dependencyAutomationRecipes}
      renderTitle={row => <Button variant="link" className="h-auto p-0 text-left" onClick={event => { event.stopPropagation(); if (canEdit) setEditingId(row.id); else setSelectedId(row.id) }}>{String(row["reference"])} · {row.title}</Button>} />

    {editing && <DependencyEditor data={data} {...(editing === "new" ? {} : { item: editing })} onClose={() => setEditingId(null)} />}

    {selected && <DependencyPanel dependency={selected} onRaise={raise} close={() => setSelectedId(null)} />}

    {sync && <SyncAgenda agenda={agenda} people={data.people} close={() => setSync(false)} onOpen={dependency => { setSync(false); setSelectedId(dependency.id) }} />}

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
          <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Owner</span><Input list="raid-draft-people" value={draft.owner} onChange={event => setDraft({ ...draft, owner: event.target.value })} /><datalist id="raid-draft-people">{data.people.map(person => <option key={person.id} value={person.name} />)}</datalist></label>
          <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">{draft.kind === "Risk" ? "Review date" : "Due date"}</span><Input type="date" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} /></label>
        </div>
        <div className="mt-6 flex gap-2">
          <Button disabled={mutations.raise.isPending} onClick={() => mutations.raise.mutate({ dependency: draft.dependency, kind: draft.kind, title: draft.title, description: draft.description, ownerId: data.people.find(person => person.name === draft.owner)?.id ?? null, date: draft.dueDate || null }, { onSuccess: () => { toast.success(`${draft.kind} raised and linked to ${draft.dependency.reference}.`); setDraft(null) } })}>{draft.kind === "Risk" ? <ShieldAlert /> : <TriangleAlert />}Create {draft.kind.toLowerCase()}</Button>
          <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
        </div>
      </aside>
    </>}

  </div>;
}

function SyncAgenda({ agenda, people, close, onOpen }: { agenda: ReturnType<typeof getDependencySyncAgenda>; people: DependenciesData["people"]; close: () => void; onOpen: (dependency: ResolvedDependency) => void }) {
  const items = [...agenda.offTrack, ...agenda.awaitingConfirmation, ...agenda.dueSoon];
  const ownerIds = new Set(items.flatMap(item => [item.giver.ownerId, item.receiver.ownerId]));
  const emails = people.filter(person => ownerIds.has(person.id) && person.email).map(person => person.email);
  const body = [["Off track", agenda.offTrack], ["Awaiting confirmation", agenda.awaitingConfirmation], ["Required in the next 30 days", agenda.dueSoon]].map(([title, list]) => `${title as string}\n${(list as ResolvedDependency[]).map(item => `- ${item.reference} ${item.giverLabel} -> ${item.receiverLabel} (required by ${formatDate(item.requiredBy)})`).join("\n") || "- None"}`).join("\n\n");
  const mailto = `mailto:${emails.join(",")}?subject=${encodeURIComponent("Dependency sync agenda")}&body=${encodeURIComponent(body)}`;
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
          <p className="mt-2 text-sm text-muted-foreground">Cross-PM and external dependencies needing a conversation · generated {formatDate(todayIso())}</p>
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
      <div className="mt-6 flex gap-2"><Button variant="outline" onClick={close}>Close</Button>{emails.length > 0 && <Button asChild><a href={mailto}>Email agenda to owners</a></Button>}</div>
    </aside>
  </>;
}
