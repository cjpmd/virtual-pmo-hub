import { useEffect, useState, type ReactNode } from "react";
import { Archive, Check, FolderOpen, Pencil, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Portfolio, Priority, Programme, Project, ProjectState } from "@/data/types";
import { getPeople, getPortfolios, getAllProgrammes, getStageNames } from "@/services/pmo";
import { getCurrentPortfolioId, resetEntities, savePortfolio, saveProgramme, saveProject, setCurrentPortfolio, slugId } from "@/services/entity-store";
import { currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";

const toInput = (value?: string) => { const [d, m, y] = (value ?? "").split("/"); return d && m && y ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : ""; };
const fromInput = (value: string) => { const [y, m, d] = value.split("-"); return d && m && y ? `${d}/${m}/${y}` : ""; };
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function Field({ label, required, children, wide }: { label: string; required?: boolean; children: ReactNode; wide?: boolean }) {
  return <div className={cn("space-y-1.5", wide && "sm:col-span-2")}><Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>{children}</div>;
}
function PeopleList() { return <datalist id="vpmo-people">{getPeople().map(p => <option key={p.id} value={p.name} />)}</datalist>; }
function useDraft<T>(open: boolean, initial: () => T) { const [draft, setDraft] = useState<T>(initial); useEffect(() => { if (open) setDraft(initial()); }, [open]); return [draft, (patch: Partial<T>) => setDraft(d => ({ ...d, ...patch }))] as const; }

export function StateBadge({ state }: { state?: string }) {
  if (state !== "Closed") return null;
  return <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"><Archive className="size-3" />Closed</span>;
}

/* ---------- Close / reopen confirmation ---------- */
export function CloseDialog({ open, onOpenChange, kind, name, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; kind: string; name: string; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Close {kind}</DialogTitle><DialogDescription>“{name}” will be marked as closed. It stays in reports and history, and you can reopen it later.</DialogDescription></DialogHeader>
    <Field label="Reason for closing" required><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. All objectives delivered and handed over to BAU" /></Field>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!reason.trim()} onClick={() => { onConfirm(reason.trim()); onOpenChange(false); }}><Archive />Close {kind}</Button></DialogFooter></DialogContent></Dialog>;
}

/* ---------- Portfolio ---------- */
function PortfolioForm({ open, onOpenChange, portfolio }: { open: boolean; onOpenChange: (o: boolean) => void; portfolio?: Portfolio }) {
  const [d, set] = useDraft<Portfolio>(open, () => portfolio ? { ...portfolio } : { id: "", name: "", description: "", owner: "Chris McDonald", budget: 0, state: "Active" });
  const [error, setError] = useState("");
  const submit = () => { if (!d.name.trim() || !d.owner.trim()) { setError("Name and owner are required."); return; } const item = { ...d, name: d.name.trim(), id: d.id || slugId("portfolio", d.name) }; savePortfolio(item); if (!portfolio) setCurrentPortfolio(item.id); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{portfolio ? "Edit portfolio" : "New portfolio"}</DialogTitle><DialogDescription>{portfolio ? "Update the portfolio details." : "Create a portfolio. You will switch to it straight away."}</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2"><PeopleList />
      <Field label="Name" required wide><Input value={d.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. DTS 2026/27" autoFocus /></Field>
      <Field label="Owner" required><Input list="vpmo-people" value={d.owner} onChange={e => set({ owner: e.target.value })} /></Field>
      <Field label={`Budget (${currencySymbol()})`}><Input type="number" min="0" step="1000" value={d.budget} onChange={e => set({ budget: Number(e.target.value) || 0 })} /></Field>
      <Field label="Description" wide><Textarea value={d.description} onChange={e => set({ description: e.target.value })} /></Field>
    </div>{error && <p className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}><Check />{portfolio ? "Save changes" : "Create portfolio"}</Button></DialogFooter></DialogContent></Dialog>;
}

export function PortfolioManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [editing, setEditing] = useState<Portfolio | undefined>(), [formOpen, setFormOpen] = useState(false), [closing, setClosing] = useState<Portfolio | undefined>();
  const current = getCurrentPortfolioId();
  const programmes = getAllProgrammes();
  return <><Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Manage portfolios</DialogTitle><DialogDescription>Add, edit, close or switch portfolios. The Portfolio, Programmes and Projects pages show the selected portfolio.</DialogDescription></DialogHeader>
    <div className="divide-y divide-border/70 rounded-lg border border-border/70">{getPortfolios().map(p => { const count = programmes.filter(g => g.portfolioId === p.id).length; return <div key={p.id} className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-medium">{p.name}</p>{p.id === current && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Selected</span>}<StateBadge state={p.state} /></div><p className="text-xs text-muted-foreground">{p.owner} · {count} programme{count === 1 ? "" : "s"}{p.closedReason ? ` · Closed: ${p.closedReason}` : ""}</p></div>
      {p.id !== current && <Button size="sm" variant="outline" onClick={() => { setCurrentPortfolio(p.id); onOpenChange(false); }}><FolderOpen />Open</Button>}
      <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setFormOpen(true); }}><Pencil />Edit</Button>
      {p.state === "Closed" ? <Button size="sm" variant="ghost" onClick={() => savePortfolio({ ...p, state: "Active", closedReason: "" })}><RotateCcw />Reopen</Button> : <Button size="sm" variant="ghost" onClick={() => setClosing(p)}><Archive />Close</Button>}
    </div>; })}</div>
    <DialogFooter className="sm:justify-between"><Button variant="ghost" size="sm" onClick={() => { if (confirm("Remove every portfolio, programme and project you added or edited, and restore the sample data?")) { resetEntities(); onOpenChange(false); } }}><RotateCcw />Restore sample data</Button><Button onClick={() => { setEditing(undefined); setFormOpen(true); }}><Plus />New portfolio</Button></DialogFooter>
  </DialogContent></Dialog>
    <PortfolioForm open={formOpen} onOpenChange={setFormOpen} portfolio={editing} />
    <CloseDialog open={Boolean(closing)} onOpenChange={o => !o && setClosing(undefined)} kind="portfolio" name={closing?.name ?? ""} onConfirm={reason => closing && savePortfolio({ ...closing, state: "Closed", closedReason: reason })} />
  </>;
}

/* ---------- Programme ---------- */
export function ProgrammeFormDialog({ open, onOpenChange, programme, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; programme?: Programme; onSaved?: (p: Programme) => void }) {
  const [d, set] = useDraft<Programme>(open, () => programme ? { ...programme } : { id: "", portfolioId: getCurrentPortfolioId(), name: "", description: "", manager: "", sponsor: "", start: "01/10/2026", end: "31/07/2027", budget: 0, valueStatement: "", state: "Active" });
  const [error, setError] = useState("");
  const submit = () => { if (!d.name.trim() || !d.manager.trim() || !d.sponsor.trim()) { setError("Name, programme manager and sponsor are required."); return; } if (d.start && d.end && toInput(d.end) < toInput(d.start)) { setError("End date must be after the start date."); return; } const item = { ...d, name: d.name.trim(), id: d.id || slugId("programme", d.name) }; saveProgramme(item); onSaved?.(item); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{programme ? "Edit programme" : "New programme"}</DialogTitle><DialogDescription>{programme ? "Update the programme details." : "Add a programme to a portfolio."}</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2"><PeopleList />
      <Field label="Name" required wide><Input value={d.name} onChange={e => set({ name: e.target.value })} autoFocus placeholder="e.g. Research Computing" /></Field>
      <Field label="Portfolio" required><select className={selectClass} value={d.portfolioId} onChange={e => set({ portfolioId: e.target.value })}>{getPortfolios().map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label={`Budget (${currencySymbol()})`}><Input type="number" min="0" step="1000" value={d.budget} onChange={e => set({ budget: Number(e.target.value) || 0 })} /></Field>
      <Field label="Programme manager" required><Input list="vpmo-people" value={d.manager} onChange={e => set({ manager: e.target.value })} /></Field>
      <Field label="Sponsor" required><Input list="vpmo-people" value={d.sponsor} onChange={e => set({ sponsor: e.target.value })} /></Field>
      <Field label="Assigned project manager"><Input list="vpmo-people" value={d.projectManager ?? ""} onChange={e => set({ projectManager: e.target.value || undefined })} /></Field>
      <Field label="Assigned project officer"><Input list="vpmo-people" value={d.projectOfficer ?? ""} onChange={e => set({ projectOfficer: e.target.value || undefined })} /></Field>
      <Field label="Start date"><Input type="date" value={toInput(d.start)} onChange={e => set({ start: fromInput(e.target.value) })} /></Field>
      <Field label="End date"><Input type="date" value={toInput(d.end)} onChange={e => set({ end: fromInput(e.target.value) })} /></Field>
      <Field label="Description" wide><Textarea value={d.description} onChange={e => set({ description: e.target.value })} /></Field>
      <Field label="Value statement" wide><Textarea value={d.valueStatement} onChange={e => set({ valueStatement: e.target.value })} /></Field>
    </div>{error && <p className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}><Check />{programme ? "Save changes" : "Create programme"}</Button></DialogFooter></DialogContent></Dialog>;
}

/* ---------- Project ---------- */
const states: ProjectState[] = ["Proposed", "Active", "On Hold", "Closed"];
const priorities: Priority[] = ["Low", "Moderate", "High", "Critical"];
export function ProjectEditDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project: Project }) {
  const [d, set] = useDraft<Project>(open, () => ({ ...project }));
  const [error, setError] = useState("");
  const submit = () => { if (!d.name.trim() || !d.manager.trim() || !d.sponsor.trim()) { setError("Name, project manager and sponsor are required."); return; } if (toInput(d.finish) < toInput(d.start)) { setError("Finish date must be after the start date."); return; } saveProject({ ...d, name: d.name.trim() }); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Edit project</DialogTitle><DialogDescription>Update the core project details. Health is still worked out automatically.</DialogDescription></DialogHeader>
    <div className="grid gap-4 sm:grid-cols-2"><PeopleList />
      <Field label="Name" required wide><Input value={d.name} onChange={e => set({ name: e.target.value })} /></Field>
      <Field label="Programme"><select className={selectClass} value={d.programmeId} onChange={e => set({ programmeId: e.target.value })}>{getAllProgrammes().map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Phase"><select className={selectClass} value={d.stage} onChange={e => set({ stage: e.target.value })}>{getStageNames().map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="State"><select className={selectClass} value={d.state} onChange={e => set({ state: e.target.value as ProjectState })}>{states.map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Priority"><select className={selectClass} value={d.priority} onChange={e => set({ priority: e.target.value as Priority })}>{priorities.map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Project manager" required><Input list="vpmo-people" value={d.manager} onChange={e => set({ manager: e.target.value })} /></Field>
      <Field label="Project officer"><Input list="vpmo-people" value={d.projectOfficer ?? ""} onChange={e => set({ projectOfficer: e.target.value || undefined })} /></Field>
      <Field label="Sponsor" required><Input list="vpmo-people" value={d.sponsor} onChange={e => set({ sponsor: e.target.value })} /></Field>
      <Field label="Tier"><select className={selectClass} value={d.tier} onChange={e => set({ tier: e.target.value as Project["tier"] })}>{["Small", "Medium", "Large"].map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Start date"><Input type="date" value={toInput(d.start)} onChange={e => set({ start: fromInput(e.target.value) })} /></Field>
      <Field label="Finish date"><Input type="date" value={toInput(d.finish)} onChange={e => set({ finish: fromInput(e.target.value) })} /></Field>
      <Field label={`Budget (${currencySymbol()})`}><Input type="number" min="0" step="1000" value={d.budget} onChange={e => set({ budget: Number(e.target.value) || 0 })} /></Field>
      <Field label={`Forecast (${currencySymbol()})`}><Input type="number" min="0" step="1000" value={d.forecast} onChange={e => set({ forecast: Number(e.target.value) || 0 })} /></Field>
      <Field label="Business case summary" wide><Textarea value={d.businessCase} onChange={e => set({ businessCase: e.target.value })} /></Field>
    </div>{error && <p className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit}><Check />Save changes</Button></DialogFooter></DialogContent></Dialog>;
}
