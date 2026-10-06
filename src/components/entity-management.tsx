// Create, edit, close/reopen and archive portfolios, programmes and projects, on Supabase.
// Buttons only appear for people whose role allows the action (RLS is the real check):
// portfolios need PMO; programmes and projects need manager in the workspace.
import { useEffect, useState, type ReactNode } from "react";
import { Archive, Check, FolderOpen, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Priority } from "@/data/types";
import { useCurrentPortfolio } from "@/hooks/use-current-portfolio";
import { useEntityMutations } from "@/hooks/use-entities";
import { usePeople, usePhases, usePortfolios, useProgrammes } from "@/hooks/use-hierarchy";
import { useCan, useWorkspaceRoles } from "@/hooks/use-permissions";
import { currencySymbol } from "@/lib/format";
import { atLeast } from "@/services/auth";
import type { Kind } from "@/services/entities";
import type { PortfolioSummary, ProgrammeSummary, ProjectSummary } from "@/services/hierarchy";
import type { ProjectStateLabel } from "@/services/labels";
import { cn } from "@/lib/utils";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const fail = (error: Error) => toast.error(error.message);

function Field({ label, required, children, wide }: { label: string; required?: boolean; children: ReactNode; wide?: boolean }) {
  return <label className={cn("block space-y-1.5", wide && "sm:col-span-2")}><span className="text-xs font-medium">{label}{required && <span className="text-destructive"> *</span>}</span>{children}</label>;
}
/** Form state that resets each time the dialog opens (during render, so nothing typed is lost). */
function useDraft<T>(open: boolean, initial: () => T) {
  const [draft, setDraft] = useState<T>(initial);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initial());
  }
  return [draft, (patch: Partial<T>) => setDraft(d => ({ ...d, ...patch }))] as const;
}
/** People picker by id (names can repeat). */
function PersonSelect({ value, onChange, allowEmpty = true }: { value: string | null; onChange: (id: string | null) => void; allowEmpty?: boolean }) {
  const people = usePeople().data ?? [];
  return <select className={selectClass} value={value ?? ""} onChange={e => onChange(e.target.value || null)}>
    {allowEmpty && <option value="">Unassigned</option>}
    {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
  </select>;
}

export function StateBadge({ state }: { state?: string | undefined }) {
  if (state !== "Closed") return null;
  return <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"><Archive className="size-3" />Closed</span>;
}

/* ---------- Close and archive confirmations ---------- */
export function CloseDialog({ open, onOpenChange, kind, name, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; kind: string; name: string; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Close {kind}</DialogTitle><DialogDescription>“{name}” will be marked as closed. It stays in reports and history, and you can reopen it later.</DialogDescription></DialogHeader>
    <Field label="Reason for closing" required><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. All objectives delivered and handed over to BAU" /></Field>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!reason.trim()} onClick={() => { onConfirm(reason.trim()); onOpenChange(false); }}><Archive />Close {kind}</Button></DialogFooter></DialogContent></Dialog>;
}

/** Archiving replaces deletion: the item disappears from every list but is kept for audit. */
export function ArchiveDialog({ open, onOpenChange, kind, name, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; kind: string; name: string; onConfirm: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Archive {kind}</DialogTitle><DialogDescription>“{name}” will be removed from every list, report and roll-up. It is kept in the database for audit, and an administrator can restore it. Close it instead if it should still count in reports.</DialogDescription></DialogHeader>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="destructive" onClick={() => { onConfirm(); onOpenChange(false); }}><Archive />Archive {kind}</Button></DialogFooter></DialogContent></Dialog>;
}

/** Close / reopen / archive buttons for any level. */
function LifecycleButtons({ kind, label, id, name, state, updatedAt, onArchived }: { kind: Kind; label: string; id: string; name: string; state: string; updatedAt: string | null; onArchived?: () => void }) {
  const mutations = useEntityMutations();
  const [closing, setClosing] = useState(false), [archiving, setArchiving] = useState(false);
  return <>
    {state === "Closed"
      ? <Button size="sm" variant="outline" disabled={mutations.reopen.isPending} onClick={() => mutations.reopen.mutate({ kind, id, lastSeen: updatedAt }, { onError: fail })}><RotateCcw />Reopen</Button>
      : <Button size="sm" variant="outline" onClick={() => setClosing(true)}><Archive />Close {label}</Button>}
    <Button size="sm" variant="ghost" onClick={() => setArchiving(true)}>Archive</Button>
    <CloseDialog open={closing} onOpenChange={setClosing} kind={label} name={name} onConfirm={reason => mutations.close.mutate({ kind, id, reason, lastSeen: updatedAt }, { onError: fail })} />
    <ArchiveDialog open={archiving} onOpenChange={setArchiving} kind={label} name={name} onConfirm={() => mutations.archive.mutate({ kind, id, lastSeen: updatedAt }, { onError: fail, onSuccess: () => { toast.success(`${name} archived`); onArchived?.(); } })} />
  </>;
}

/* ---------- Portfolio ---------- */
function PortfolioForm({ open, onOpenChange, portfolio, workspaceId }: { open: boolean; onOpenChange: (o: boolean) => void; portfolio?: PortfolioSummary | undefined; workspaceId: string | undefined }) {
  const mutations = useEntityMutations();
  const { select } = useCurrentPortfolio();
  const [d, set] = useDraft(open, () => ({ name: portfolio?.name ?? "", description: portfolio?.description ?? "", ownerId: portfolio?.ownerId ?? null, budget: portfolio?.budget ?? 0 }));
  const [error, setError] = useState("");
  const pending = mutations.createPortfolio.isPending || mutations.updatePortfolio.isPending;
  const submit = () => {
    if (!d.name.trim()) { setError("A name is required."); return; }
    const done = { onSuccess: () => onOpenChange(false), onError: (e: Error) => setError(e.message) };
    if (portfolio) mutations.updatePortfolio.mutate({ id: portfolio.id, input: d, lastSeen: portfolio.updatedAt }, done);
    else if (workspaceId) mutations.createPortfolio.mutate({ workspaceId, input: d }, { ...done, onSuccess: written => { select(written.id); onOpenChange(false); } });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{portfolio ? "Edit portfolio" : "New portfolio"}</DialogTitle><DialogDescription>{portfolio ? "Update the portfolio details." : "Create a portfolio. You will switch to it straight away."}</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" required wide><Input value={d.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Digital portfolio 2026/27" autoFocus /></Field>
      <Field label="Owner"><PersonSelect value={d.ownerId} onChange={ownerId => set({ ownerId })} /></Field>
      <Field label={`Budget (${currencySymbol()})`}><Input type="number" min="0" step="1000" value={d.budget} onChange={e => set({ budget: Number(e.target.value) || 0 })} /></Field>
      <Field label="Description" wide><Textarea value={d.description} onChange={e => set({ description: e.target.value })} /></Field>
    </div>{error && <p className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={pending} onClick={submit}><Check />{portfolio ? "Save changes" : "Create portfolio"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function PortfolioManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [editing, setEditing] = useState<PortfolioSummary | undefined>(), [formOpen, setFormOpen] = useState(false);
  const { portfolio: current, select } = useCurrentPortfolio();
  const portfolios = usePortfolios().data ?? [];
  const programmes = useProgrammes().data ?? [];
  const roles = useWorkspaceRoles().data ?? [];
  const pmoWorkspace = roles.find(role => atLeast(role.role, "pmo"))?.workspaceId;
  const canManage = (workspaceId: string) => roles.some(role => role.workspaceId === workspaceId && atLeast(role.role, "pmo"));
  return <><Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Portfolios</DialogTitle><DialogDescription>Switch, add, edit, close or archive portfolios. The Portfolio, Programmes and Projects pages show the selected portfolio.</DialogDescription></DialogHeader>
    <div className="divide-y divide-border/70 rounded-lg border border-border/70">{portfolios.map(p => { const count = programmes.filter(g => g.portfolioId === p.id).length; return <div key={p.id} className="flex flex-wrap items-center gap-2 p-3">
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-medium">{p.name}</p>{p.id === current?.id && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Selected</span>}<StateBadge state={p.state} /></div><p className="text-xs text-muted-foreground">{p.ownerName} · {count} programme{count === 1 ? "" : "s"}{p.closedReason ? ` · Closed: ${p.closedReason}` : ""}</p></div>
      {p.id !== current?.id && <Button size="sm" variant="outline" onClick={() => { select(p.id); onOpenChange(false); }}><FolderOpen />Open</Button>}
      {canManage(p.workspaceId) && <><Button size="sm" variant="ghost" onClick={() => { setEditing(p); setFormOpen(true); }}><Pencil />Edit</Button>
        <LifecycleButtons kind="portfolios" label="portfolio" id={p.id} name={p.name} state={p.state} updatedAt={p.updatedAt} /></>}
    </div>; })}{!portfolios.length && <p className="p-6 text-center text-sm text-muted-foreground">No portfolios yet.</p>}</div>
    <DialogFooter>{pmoWorkspace && <Button onClick={() => { setEditing(undefined); setFormOpen(true); }}><Plus />New portfolio</Button>}</DialogFooter>
  </DialogContent></Dialog>
    <PortfolioForm open={formOpen} onOpenChange={setFormOpen} portfolio={editing} workspaceId={pmoWorkspace} />
  </>;
}

/* ---------- Programme ---------- */
export function ProgrammeFormDialog({ open, onOpenChange, programme }: { open: boolean; onOpenChange: (o: boolean) => void; programme?: ProgrammeSummary }) {
  const mutations = useEntityMutations();
  const { portfolio } = useCurrentPortfolio();
  const portfolios = (usePortfolios().data ?? []).filter(item => item.state === "Active" || item.id === programme?.portfolioId);
  const [d, set] = useDraft(open, () => ({
    portfolioId: programme?.portfolioId ?? portfolio?.id ?? "", name: programme?.name ?? "", description: programme?.description ?? "",
    managerId: programme?.managerId ?? null, sponsorId: programme?.sponsorId ?? null, projectManagerId: programme?.projectManagerId ?? null, projectOfficerId: programme?.projectOfficerId ?? null,
    startDate: programme?.startDate ?? null, finishDate: programme?.finishDate ?? null, budget: programme?.budget ?? 0, valueStatement: programme?.valueStatement ?? "",
  }));
  const [error, setError] = useState("");
  // The current portfolio may still be loading when the dialog opens.
  const portfolioId = d.portfolioId || portfolio?.id || portfolios[0]?.id || "";
  const submit = () => {
    const input = { ...d, portfolioId };
    if (!d.name.trim() || !portfolioId) { setError("Name and portfolio are required."); return; }
    if (d.startDate && d.finishDate && d.finishDate < d.startDate) { setError("End date must be after the start date."); return; }
    const done = { onSuccess: () => onOpenChange(false), onError: (e: Error) => setError(e.message) };
    if (programme) mutations.updateProgramme.mutate({ id: programme.id, input, lastSeen: programme.updatedAt }, done);
    else mutations.createProgramme.mutate(input, done);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{programme ? "Edit programme" : "New programme"}</DialogTitle><DialogDescription>{programme ? "Update the programme details." : "Add a programme to a portfolio."}</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" required wide><Input value={d.name} onChange={e => set({ name: e.target.value })} autoFocus placeholder="e.g. Research Computing" /></Field>
      <Field label="Portfolio" required><select className={selectClass} value={portfolioId} onChange={e => set({ portfolioId: e.target.value })}>{!portfolios.length && <option value="">Loading portfolios…</option>}{portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label={`Budget (${currencySymbol()})`}><Input type="number" min="0" step="1000" value={d.budget} onChange={e => set({ budget: Number(e.target.value) || 0 })} /></Field>
      <Field label="Programme manager"><PersonSelect value={d.managerId} onChange={managerId => set({ managerId })} /></Field>
      <Field label="Sponsor"><PersonSelect value={d.sponsorId} onChange={sponsorId => set({ sponsorId })} /></Field>
      <Field label="Assigned project manager"><PersonSelect value={d.projectManagerId} onChange={projectManagerId => set({ projectManagerId })} /></Field>
      <Field label="Assigned project officer"><PersonSelect value={d.projectOfficerId} onChange={projectOfficerId => set({ projectOfficerId })} /></Field>
      <Field label="Start date"><Input type="date" value={d.startDate ?? ""} onChange={e => set({ startDate: e.target.value || null })} /></Field>
      <Field label="End date"><Input type="date" value={d.finishDate ?? ""} onChange={e => set({ finishDate: e.target.value || null })} /></Field>
      <Field label="Description" wide><Textarea value={d.description} onChange={e => set({ description: e.target.value })} /></Field>
      <Field label="Value statement" wide><Textarea value={d.valueStatement} onChange={e => set({ valueStatement: e.target.value })} /></Field>
    </div>{error && <p className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!portfolioId || mutations.createProgramme.isPending || mutations.updateProgramme.isPending} onClick={submit}><Check />{programme ? "Save changes" : "Create programme"}</Button></DialogFooter></DialogContent></Dialog>;
}

/* ---------- Project ---------- */
const states: ProjectStateLabel[] = ["Proposed", "Active", "On Hold", "Closed"];
const priorities: Priority[] = ["Low", "Moderate", "High", "Critical"];
export function ProjectEditDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project: ProjectSummary & { businessCase?: string | null } }) {
  const mutations = useEntityMutations();
  const programmes = useProgrammes().data ?? [];
  const phases = usePhases().data ?? [];
  const [d, set] = useDraft(open, () => ({
    name: project.name, programmeId: project.programmeId, phaseId: project.phaseId, state: project.state, priority: project.priority, tier: project.tier,
    managerId: project.managerId, projectOfficerId: project.projectOfficerId, sponsorId: project.sponsorId, startDate: project.startDate, finishDate: project.finishDate,
    budget: project.budget, forecast: project.forecast, businessCase: project.businessCase ?? "",
  }));
  const [error, setError] = useState("");
  const submit = () => {
    if (!d.name.trim()) { setError("A name is required."); return; }
    if (d.startDate && d.finishDate && d.finishDate < d.startDate) { setError("Finish date must be after the start date."); return; }
    mutations.updateProject.mutate({ id: project.id, input: d, lastSeen: project.updatedAt }, { onSuccess: () => onOpenChange(false), onError: e => setError(e.message) });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Edit project</DialogTitle><DialogDescription>Update the core project details. Health is still worked out automatically.</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" required wide><Input value={d.name} onChange={e => set({ name: e.target.value })} /></Field>
      <Field label="Programme"><select className={selectClass} value={d.programmeId ?? ""} onChange={e => set({ programmeId: e.target.value || null })}><option value="">No programme</option>{programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Phase"><select className={selectClass} value={d.phaseId ?? ""} onChange={e => set({ phaseId: e.target.value || null })}>{phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="State"><select className={selectClass} value={d.state} onChange={e => set({ state: e.target.value as ProjectStateLabel })}>{states.map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Priority"><select className={selectClass} value={d.priority} onChange={e => set({ priority: e.target.value as Priority })}>{priorities.map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Project manager"><PersonSelect value={d.managerId} onChange={managerId => set({ managerId })} /></Field>
      <Field label="Project officer"><PersonSelect value={d.projectOfficerId} onChange={projectOfficerId => set({ projectOfficerId })} /></Field>
      <Field label="Sponsor"><PersonSelect value={d.sponsorId} onChange={sponsorId => set({ sponsorId })} /></Field>
      <Field label="Tier"><select className={selectClass} value={d.tier} onChange={e => set({ tier: e.target.value as typeof d.tier })}>{["Small", "Medium", "Large"].map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Start date"><Input type="date" value={d.startDate ?? ""} onChange={e => set({ startDate: e.target.value || null })} /></Field>
      <Field label="Finish date"><Input type="date" value={d.finishDate ?? ""} onChange={e => set({ finishDate: e.target.value || null })} /></Field>
      <Field label={`Budget (${currencySymbol()})`}><Input type="number" min="0" step="1000" value={d.budget} onChange={e => set({ budget: Number(e.target.value) || 0 })} /></Field>
      <Field label={`Forecast (${currencySymbol()})`}><Input type="number" min="0" step="1000" value={d.forecast} onChange={e => set({ forecast: Number(e.target.value) || 0 })} /></Field>
      <Field label="Business case summary" wide><Textarea value={d.businessCase} onChange={e => set({ businessCase: e.target.value })} /></Field>
    </div>{error && <p className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={mutations.updateProject.isPending} onClick={submit}><Check />Save changes</Button></DialogFooter></DialogContent></Dialog>;
}

/* ---------- Ready-made header buttons ---------- */
export function ManagePortfoliosButton() {
  const [open, setOpen] = useState(false);
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}><FolderOpen />Portfolios</Button><PortfolioManagerDialog open={open} onOpenChange={setOpen} /></>;
}
export function NewProgrammeButton() {
  const [open, setOpen] = useState(false);
  const { portfolio } = useCurrentPortfolio();
  const allowed = useCan("manager", portfolio?.workspaceId);
  if (!allowed) return null;
  return <><Button onClick={() => setOpen(true)}><Plus />New programme</Button><ProgrammeFormDialog open={open} onOpenChange={setOpen} /></>;
}
export function ProgrammeActions({ programme, onArchived }: { programme: ProgrammeSummary; onArchived?: () => void }) {
  const [edit, setEdit] = useState(false);
  const allowed = useCan("manager", programme.workspaceId);
  if (!allowed) return <StateBadge state={programme.state} />;
  return <div className="flex flex-wrap items-center gap-2"><StateBadge state={programme.state} /><Button size="sm" variant="outline" onClick={() => setEdit(true)}><Pencil />Edit</Button>
    <LifecycleButtons kind="programmes" label="programme" id={programme.id} name={programme.name} state={programme.state} updatedAt={programme.updatedAt} {...(onArchived ? { onArchived } : {})} />
    <ProgrammeFormDialog open={edit} onOpenChange={setEdit} programme={programme} /></div>;
}
export function ProjectEditButton({ project, onArchived }: { project: ProjectSummary & { businessCase?: string | null }; onArchived?: () => void }) {
  const [edit, setEdit] = useState(false);
  const allowed = useCan("manager", project.workspaceId);
  if (!allowed) return null;
  return <><Button size="sm" variant="outline" onClick={() => setEdit(true)}><Pencil />Edit</Button>
    <LifecycleButtons kind="projects" label="project" id={project.id} name={project.name} state={project.state} updatedAt={project.updatedAt} {...(onArchived ? { onArchived } : {})} />
    <ProjectEditDialog open={edit} onOpenChange={setEdit} project={project} /></>;
}
