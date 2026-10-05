import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Trash2 } from "lucide-react";
import type { Dependency, DependencyEnd, DependencyType } from "@/data/types";
import { nextDependencyReference, saveDependency, deleteDependency } from "@/services/dependency-store";
import { buildDependencyGraph, nodeForEnd, type GraphNode } from "@/services/dependency-graph";
import { getDependencies } from "@/services/dependencies";

const kinds: DependencyType[] = ["Sequencing", "Alignment", "Information", "Resource", "External"];
const today = "21/09/2026";
function options() {
  const graph = buildDependencyGraph(getDependencies(), "milestone");
  return Array.from(graph.nodes.values()).sort((a, b) => a.label.localeCompare(b.label));
}
function endFromNode(node: GraphNode, previous?: DependencyEnd): DependencyEnd {
  return { kind: node.kind, ...(node.programmeId ? { programmeId: node.programmeId } : {}), ...(node.projectId ? { projectId: node.projectId } : {}), ...(node.kind === "Milestone" ? { milestoneId: node.id.split(":").slice(2).join(":") } : {}), ...(node.kind === "External" ? { externalName: node.label } : {}), owner: previous?.owner ?? "Unassigned" };
}

export function DependencyEditor({ item, fromId, toId, onClose }: { item?: Dependency; fromId?: string; toId?: string; onClose: () => void }) {
  const nodes = options();
  const [giverId, setGiverId] = useState(fromId ?? (item ? nodeForEnd(item.giver, "milestone")?.id : "") ?? "");
  const [receiverId, setReceiverId] = useState(toId ?? (item ? nodeForEnd(item.receiver, "milestone")?.id : "") ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [givingOwner, setGivingOwner] = useState(item?.giver.owner ?? "");
  const [receivingOwner, setReceivingOwner] = useState(item?.receiver.owner ?? "");
  const [type, setType] = useState<DependencyType>(item?.type ?? "Sequencing");
  const [requiredBy, setRequiredBy] = useState(item?.requiredBy ?? "");
  const [criticality, setCriticality] = useState<Dependency["criticality"]>(item?.criticality ?? "Medium");
  const [validation, setValidation] = useState<Dependency["validation"]>(item?.validation ?? "Proposed");
  const giver = nodes.find(node => node.id === giverId), receiver = nodes.find(node => node.id === receiverId);
  const validDate = /^(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])\/\d{4}$/.test(requiredBy);
  const valid = Boolean(giver && receiver && giverId !== receiverId && description.trim() && givingOwner.trim() && receivingOwner.trim() && validDate);
  const submit = () => {
    if (!valid || !giver || !receiver) return;
    const reference = item?.reference ?? nextDependencyReference();
    saveDependency({ id: item?.id ?? `dep-${crypto.randomUUID()}`, reference, giver: endFromNode(giver, item?.giver), receiver: endFromNode(receiver, item?.receiver), type, description: description.trim(), requiredBy, criticality, validation, giverAccepted: item?.giverAccepted ?? false, receiverAccepted: item?.receiverAccepted ?? false, riskIds: item?.riskIds ?? [], issueIds: item?.issueIds ?? [], raisedDate: item?.raisedDate ?? today, raisedBy: item?.raisedBy ?? "Chris McDonald", ...(item?.healthOverride ? { healthOverride: item.healthOverride } : {}) , });
    onClose();
  };
  return <>
    <div className="fixed inset-0 z-40 bg-overlay" onClick={onClose} />
    <aside role="dialog" aria-label={item ? "Edit dependency" : "New dependency"} className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background p-6 shadow-xl">
      <div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-primary">{item?.reference ?? "Workshop"}</p><h2 className="mt-2 font-display text-xl font-semibold">{item ? "Edit dependency" : "New dependency"}</h2></div><Button size="icon" variant="ghost" aria-label="Close editor" onClick={onClose}><X /></Button></div>
      <form className="mt-6 space-y-4" onSubmit={event => { event.preventDefault(); submit(); }}>
        <label className="block space-y-1 text-sm font-medium">Giving side<select aria-label="Giving side" value={giverId} onChange={event => setGiverId(event.target.value)} className="mt-1 w-full rounded-md border bg-background p-2 text-sm"><option value="">Select giving side</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.label} · {node.sublabel}</option>)}</select></label>
        <label className="block space-y-1 text-sm font-medium">Giving owner<Input value={givingOwner} onChange={event => setGivingOwner(event.target.value)} /></label>
        <label className="block space-y-1 text-sm font-medium">Receiving side<select aria-label="Receiving side" value={receiverId} onChange={event => setReceiverId(event.target.value)} className="mt-1 w-full rounded-md border bg-background p-2 text-sm"><option value="">Select receiving side</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.label} · {node.sublabel}</option>)}</select></label>
        <label className="block space-y-1 text-sm font-medium">Receiving owner<Input value={receivingOwner} onChange={event => setReceivingOwner(event.target.value)} /></label>
        <label className="block space-y-1 text-sm font-medium">Dependency description<Textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm font-medium">Type<select value={type} onChange={event => setType(event.target.value as DependencyType)} className="w-full rounded-md border bg-background p-2 text-sm">{kinds.map(kind => <option key={kind}>{kind}</option>)}</select></label><label className="block space-y-1 text-sm font-medium">Criticality<select value={criticality} onChange={event => setCriticality(event.target.value as Dependency["criticality"])} className="w-full rounded-md border bg-background p-2 text-sm">{["Low", "Medium", "High"].map(value => <option key={value}>{value}</option>)}</select></label></div>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm font-medium">Required by (DD/MM/YYYY)<Input value={requiredBy} onChange={event => setRequiredBy(event.target.value)} placeholder="DD/MM/YYYY" /></label><label className="block space-y-1 text-sm font-medium">Validation<select value={validation} onChange={event => setValidation(event.target.value as Dependency["validation"])} className="w-full rounded-md border bg-background p-2 text-sm">{["Inferred", "Proposed", "Confirmed", "Closed", "Broken"].map(value => <option key={value}>{value}</option>)}</select></label></div>
        {giverId && giverId === receiverId && <p className="text-sm text-health-bad-foreground">Giving and receiving sides must be different.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-5">{item ? <Button type="button" variant="outline" className="text-health-bad-foreground" onClick={() => { if (window.confirm(`Delete ${item.reference}?`)) { deleteDependency(item.id); onClose(); } }}><Trash2 className="size-4" />Delete</Button> : <span />}<div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid}>Save dependency</Button></div></div>
      </form>
    </aside>
  </>;
}