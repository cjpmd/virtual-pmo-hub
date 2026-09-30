import { useMemo, useState, type DragEvent } from "react";
import { AlertTriangle, CalendarRange, CheckCircle2, GripVertical, Play, Plus, Square, Trash2 } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { DeliveryChip, HowCalculated, RagPill } from "@/components/evidence-ui";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { addDays, basisLabels, daysBetween, getProjectForecast, getSprintForecast, type ForecastResult, type VelocityBasis } from "@/services/forecast";
import {
  TODAY, activeSprint, addItem, closeSprint, closedPeriodCount, createSprint, deleteItem, effectiveUnits, forecastInputFor, getDelivery, getNonWorkingPeriods,
  isDone, liveItems, periodEndDate, reorderItem, saveNonWorkingPeriods, saveSettings, scopeAt, sprintUnits, startSprint, statusOf, toDate, toIso, unitLabel,
  updateItem, updateSprint, useDeliveryVersion, workingDays, type ItemType, type ProjectDelivery, type Sprint, type WorkItem,
} from "@/services/sprints";

const today = toDate(TODAY);
const fmt = (d: Date | null | undefined) => (d ? formatDate(toIso(d).split("-").reverse().join("/")) : "—");
const itemTypes: ItemType[] = ["story", "task", "bug", "spike", "milestone_task"];
const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-xs";
const views = ["Backlog", "Sprints", "Board", "Reports", "Forecast"] as const;
type View = (typeof views)[number];

export function DeliveryWorkspace({ projectId }: { projectId: string }) {
  useDeliveryVersion();
  const d = getDelivery(projectId);
  const agile = d.settings.approach !== "waterfall";
  const [view, setView] = useState<View>("Backlog");
  const available = views.filter(v => agile || (v !== "Sprints" && v !== "Board"));
  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="font-display text-xl font-semibold">Delivery</h2><p className="mt-1 text-sm text-muted-foreground capitalize">{d.settings.approach} delivery · work measured in {d.settings.workUnit.replace("_", " ")} · {d.settings.sprintLengthDays}-day {agile ? "sprints" : "periods"}</p></div>
      <div className="inline-flex rounded-lg border border-border/70 bg-card p-1 shadow-sm">{available.map(v => <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-3 py-1.5 text-sm", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{v}</button>)}</div>
    </div>
    {view === "Backlog" && <Backlog projectId={projectId} d={d} />}
    {view === "Sprints" && <Sprints projectId={projectId} d={d} />}
    {view === "Board" && <SprintBoard projectId={projectId} d={d} />}
    {view === "Reports" && <Reports projectId={projectId} d={d} />}
    {view === "Forecast" && <ForecastView projectId={projectId} d={d} />}
    <DeliverySettingsPanel projectId={projectId} d={d} />
  </div>;
}

// ---------------- Backlog ----------------
function Backlog({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const [type, setType] = useState(""); const [stream, setStream] = useState(""); const [title, setTitle] = useState(""); const [dragId, setDragId] = useState<string | null>(null);
  const agile = d.settings.approach !== "waterfall";
  const items = liveItems(d).filter(i => !isDone(d, i) && (!agile || !i.sprintId)).filter(i => (!type || i.itemType === type) && (!stream || i.workstream === stream)).sort((a, b) => a.backlogRank - b.backlogRank);
  const streams = Array.from(new Set(liveItems(d).map(i => i.workstream)));
  const total = items.reduce((s, i) => s + effectiveUnits(d, i), 0);
  const unestimated = items.filter(i => i.estimateUnits === null && d.settings.workUnit !== "tasks").length;
  const v = getProjectForecast(forecastInputFor(d)).velocities.rolling3;
  const groups = agile ? [["", items] as const] : streams.map(s => [s, items.filter(i => i.workstream === s)] as const).filter(([, list]) => list.length);
  const u = unitLabel(d);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-card p-4 text-sm shadow-sm">
      <span><strong>{total}</strong> {u} in backlog</span><span><strong>{unestimated}</strong> unestimated</span>
      <span>{v > 0 ? <>About <strong>{Math.ceil(total / v)}</strong> {agile ? "sprints" : "periods"} at {v} {u} per {agile ? "sprint" : "period"}</> : "Close 3 sprints to see how long the backlog will take."}</span>
      <div className="ml-auto flex gap-2"><select aria-label="Filter by type" className={selectCls} value={type} onChange={e => setType(e.target.value)}><option value="">All types</option>{itemTypes.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select>
        <select aria-label="Filter by workstream" className={selectCls} value={stream} onChange={e => setStream(e.target.value)}><option value="">All workstreams</option>{streams.map(s => <option key={s}>{s}</option>)}</select></div>
    </div>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (title.trim()) { addItem(projectId, title.trim()); setTitle(""); } }}><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a work item to the backlog" /><Button type="submit"><Plus />Add</Button></form>
    {groups.map(([group, list]) => <div key={group} className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
      {group && <div className="border-b border-border/70 bg-muted/40 px-4 py-2 text-sm font-semibold">{group} <span className="font-normal text-muted-foreground">· {list.length} items</span></div>}
      {list.map((item, index) => <div key={item.id} draggable onDragStart={e => { setDragId(item.id); e.dataTransfer.setData("text/plain", item.id); }} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragId && dragId !== item.id) reorderItem(projectId, dragId, item.id); setDragId(null); }}
        className={cn("flex items-center gap-3 border-b border-border/50 px-3 py-2 text-sm last:border-0", dragId === item.id && "opacity-50")}>
        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden /><span className="w-6 text-xs text-muted-foreground">{index + 1}</span>
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[11px] capitalize sm:inline">{item.itemType.replace("_", " ")}</span>
        <span className="hidden w-24 text-xs text-muted-foreground md:inline">{item.workstream}</span>
        <select aria-label="Status" className={selectCls} value={item.statusId} onChange={e => updateItem(projectId, item.id, { statusId: e.target.value })}>{d.statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        {d.settings.workUnit !== "tasks" && <Input aria-label="Estimate" type="number" min={0} className="h-8 w-16 text-xs" value={item.estimateUnits ?? ""} placeholder={String(d.estimateDefaults[item.itemType] ?? 1)} onChange={e => updateItem(projectId, item.id, { estimateUnits: e.target.value === "" ? null : Number(e.target.value) })} />}
        <Button variant="ghost" size="icon" className="size-8" aria-label="Delete item" onClick={() => deleteItem(projectId, item.id)}><Trash2 className="size-4" /></Button>
      </div>)}
      {!list.length && <p className="p-6 text-center text-sm text-muted-foreground">The backlog is empty. Add a work item above.</p>}
    </div>)}
  </div>;
}

// ---------------- Sprints ----------------
function CapacityBar({ used, capacity, velocity }: { used: number; capacity: number; velocity: number }) {
  const max = Math.max(used, capacity, velocity, 1);
  return <div className="space-y-1"><div className="relative h-2 rounded-full bg-muted"><div className={cn("h-2 rounded-full", used > capacity ? "bg-health-bad" : "bg-primary")} style={{ width: `${(used / max) * 100}%` }} />
    {velocity > 0 && <div className="absolute -top-1 h-4 w-0.5 bg-foreground/60" style={{ left: `${(velocity / max) * 100}%` }} title={`Rolling velocity ${velocity}`} />}</div>
    <p className="text-xs text-muted-foreground">{used} committed of {capacity} capacity{velocity > 0 ? ` · rolling velocity ${velocity} (marker)` : ""}</p></div>;
}

function Sprints({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const [closing, setClosing] = useState<Sprint | null>(null); const [message, setMessage] = useState("");
  const v = getProjectForecast(forecastInputFor(d)).velocities.rolling3;
  const open = d.sprints.filter(s => s.status !== "closed").sort((a, b) => a.start.localeCompare(b.start));
  const closed = d.sprints.filter(s => s.status === "closed").sort((a, b) => b.start.localeCompare(a.start));
  const backlog = liveItems(d).filter(i => !i.sprintId && !isDone(d, i)).sort((a, b) => a.backlogRank - b.backlogRank);
  const drop = (sprintId: string | null) => (e: DragEvent) => { const id = e.dataTransfer.getData("text/plain"); if (id) updateItem(projectId, id, { sprintId, ...(sprintId ? {} : { statusId: "backlog" }) }); };
  const u = unitLabel(d);
  return <div className="grid gap-6 xl:grid-cols-12">
    <div className="space-y-4 xl:col-span-8">
      <div className="flex items-center justify-between"><h3 className="font-display text-lg font-semibold">Sprint plan</h3><Button variant="outline" onClick={() => createSprint(projectId)}><Plus />Plan a sprint</Button></div>
      {message && <p role="alert" className="rounded-md border border-health-warn/30 bg-health-warn/10 p-3 text-sm">{message}</p>}
      {open.map(sprint => { const items = liveItems(d).filter(i => i.sprintId === sprint.id); const used = sprintUnits(d, sprint.id);
        return <section key={sprint.id} onDragOver={e => e.preventDefault()} onDrop={drop(sprint.id)} className="space-y-3 rounded-lg border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h4 className="font-semibold">{sprint.name}</h4><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", sprint.status === "active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{sprint.status === "active" ? "Active" : "Planned"}</span></div>
            <p className="text-xs text-muted-foreground">{fmt(toDate(sprint.start))} – {fmt(toDate(sprint.end))}</p></div>
            <Label className="text-xs">Capacity<Input type="number" className="mt-1 h-8 w-20" value={sprint.capacityUnits} onChange={e => updateSprint(projectId, sprint.id, { capacityUnits: Number(e.target.value) })} /></Label>
            {sprint.status === "planned" ? <Button size="sm" onClick={() => setMessage(startSprint(projectId, sprint.id) ?? "")}><Play />Start sprint</Button> : <Button size="sm" variant="outline" onClick={() => setClosing(sprint)}><Square />Close sprint</Button>}</div>
          <Input placeholder="Sprint goal" value={sprint.goal} onChange={e => updateSprint(projectId, sprint.id, { goal: e.target.value })} className="h-8 text-sm" />
          <CapacityBar used={used} capacity={sprint.capacityUnits} velocity={v} />
          <div className="divide-y divide-border/50 rounded-md border border-dashed border-border">{items.map(i => <div key={i.id} draggable onDragStart={e => e.dataTransfer.setData("text/plain", i.id)} className="flex items-center gap-2 px-3 py-1.5 text-sm"><GripVertical className="size-3.5 text-muted-foreground" aria-hidden />{isDone(d, i) && <CheckCircle2 className="size-4 text-health-good" aria-label="Done" />}<span className={cn("flex-1 truncate", isDone(d, i) && "text-muted-foreground line-through")}>{i.title}</span><span className="text-xs text-muted-foreground">{statusOf(d, i).name}</span><span className="w-12 text-right text-xs">{effectiveUnits(d, i)} {u}</span></div>)}
            {!items.length && <p className="p-4 text-center text-xs text-muted-foreground">Drag backlog items here.</p>}</div>
        </section>; })}
      <ChartCard title="Closed sprints" subtitle="Metrics recorded when each sprint closed" csv={{ name: "closed-sprints", columns: ["Sprint", "Committed", "Completed", "Added", "Removed"], rows: closed.map(s => [s.name, s.committedUnits, s.completedUnits, s.addedUnits, s.removedUnits]) }}>
        <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">Sprint</th><th>Dates</th><th className="text-right">Committed</th><th className="text-right">Completed</th><th className="text-right">Added</th><th className="text-right">Removed</th></tr></thead>
          <tbody>{closed.map(s => <tr key={s.id} className="border-t border-border/50"><td className="py-2 font-medium">{s.name}</td><td className="text-xs text-muted-foreground">{fmt(toDate(s.start))} – {fmt(toDate(s.end))}</td><td className="text-right">{s.committedUnits}</td><td className="text-right">{s.completedUnits}</td><td className="text-right">{s.addedUnits}</td><td className="text-right">{s.removedUnits}</td></tr>)}</tbody></table>
        {!closed.length && <p className="py-4 text-sm text-muted-foreground">No sprints closed yet. Close 3 sprints to unlock forecasting.</p>}
      </ChartCard>
    </div>
    <aside onDragOver={e => e.preventDefault()} onDrop={drop(null)} className="space-y-2 rounded-lg border border-border/70 bg-card p-4 shadow-sm xl:col-span-4">
      <h3 className="font-semibold">Backlog</h3><p className="text-xs text-muted-foreground">Drag items into a sprint, or drop them back here.</p>
      <div className="max-h-[640px] space-y-1 overflow-y-auto">{backlog.map(i => <div key={i.id} draggable onDragStart={e => e.dataTransfer.setData("text/plain", i.id)} className="flex cursor-grab items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-sm hover:bg-accent/40"><GripVertical className="size-3.5 text-muted-foreground" aria-hidden /><span className="flex-1 truncate">{i.title}</span><span className="text-xs text-muted-foreground">{effectiveUnits(d, i)}</span></div>)}</div>
    </aside>
    {closing && <CloseSprintDialog projectId={projectId} d={d} sprint={closing} onClose={() => setClosing(null)} />}
  </div>;
}

function CloseSprintDialog({ projectId, d, sprint, onClose }: { projectId: string; d: ProjectDelivery; sprint: Sprint; onClose: () => void }) {
  const [carry, setCarry] = useState<"next" | "backlog">("next");
  const incomplete = liveItems(d).filter(i => i.sprintId === sprint.id && !isDone(d, i));
  const done = liveItems(d).filter(i => i.sprintId === sprint.id && isDone(d, i)).reduce((s, i) => s + effectiveUnits(d, i), 0);
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent><DialogHeader><DialogTitle>Close {sprint.name}</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">{done} {unitLabel(d)} completed. {incomplete.length} item{incomplete.length === 1 ? " is" : "s are"} not finished:</p>
    <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">{incomplete.map(i => <li key={i.id} className="flex justify-between border-b border-border/50 py-1"><span className="truncate">{i.title}</span><span className="text-xs text-muted-foreground">{statusOf(d, i).name}</span></li>)}</ul>
    <fieldset className="space-y-2 text-sm"><legend className="font-medium">Unfinished items</legend>
      <label className="flex items-center gap-2"><input type="radio" checked={carry === "next"} onChange={() => setCarry("next")} />Move to next sprint</label>
      <label className="flex items-center gap-2"><input type="radio" checked={carry === "backlog"} onChange={() => setCarry("backlog")} />Return to backlog</label></fieldset>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { closeSprint(projectId, sprint.id, carry); onClose(); }}>Close sprint</Button></DialogFooter>
  </DialogContent></Dialog>;
}

// ---------------- Board ----------------
function SprintBoard({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const sprint = activeSprint(d); const [who, setWho] = useState("");
  if (!sprint) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No active sprint. Start one from the Sprints view.</p>;
  const items = liveItems(d).filter(i => i.sprintId === sprint.id); const names = Array.from(new Set(items.map(i => i.assignee).filter(Boolean))) as string[];
  const shown = items.filter(i => !who || i.assignee === who);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{sprint.name}</h3><span className="text-sm text-muted-foreground">{sprint.goal}</span>
      <div className="ml-auto flex flex-wrap gap-1">{["", ...names].map(n => <button key={n || "all"} onClick={() => setWho(n)} className={cn("rounded-full border px-2.5 py-1 text-xs", who === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{n || "Everyone"}</button>)}</div></div>
    <div className="grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">{d.statuses.map(status => { const list = shown.filter(i => i.statusId === status.id);
      return <div key={status.id} onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData("text/plain"); if (id) updateItem(projectId, id, { statusId: status.id }); }} className="min-h-40 rounded-lg border border-border/70 bg-muted/30 p-2">
        <p className="mb-2 flex justify-between px-1 text-xs font-semibold"><span>{status.name}</span><span className="text-muted-foreground">{list.reduce((s, i) => s + effectiveUnits(d, i), 0)}</span></p>
        <div className="space-y-2">{list.map(i => <div key={i.id} draggable onDragStart={e => e.dataTransfer.setData("text/plain", i.id)} className={cn("cursor-grab rounded-md border bg-card p-2 text-sm shadow-sm", status.id === "blocked" ? "border-health-bad/40" : "border-border/70")}>
          <p className="leading-5">{i.title}</p><div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{i.assignee ?? "Unassigned"}</span><span>{effectiveUnits(d, i)} {unitLabel(d)}</span></div></div>)}</div>
      </div>; })}</div>
  </div>;
}

// ---------------- Reports ----------------
interface BurnRow { label: string; period: number; scope?: number | undefined; done?: number | undefined; planned: number; forecast?: number | undefined; forecastScope?: number | undefined; cone?: number[] | undefined }
function burnUpSeries(d: ProjectDelivery, f: ForecastResult) {
  const n = closedPeriodCount(d); const input = forecastInputFor(d); const rows: BurnRow[] = [];
  let done = 0;
  for (let k = 0; k <= n; k++) { if (k > 0) done += input.completed[k - 1]!; rows.push({ label: fmt(periodEndDate(d, k)), period: k, scope: k === 0 ? d.settings.baselineScope : input.scopeHistory[k - 1]!, done, planned: Math.round(Math.min(d.settings.baselineScope, (k * d.settings.baselineScope) / d.settings.baselinePeriods)) }); }
  const last = Math.min(Math.max(f.finishPeriod ?? n + 8, d.settings.baselinePeriods, f.range.worst ? daysBetween(toDate(d.settings.baselineStart), f.range.worst) / d.settings.sprintLengthDays : 0) + 1, n + 40);
  const worstPeriods = f.velocities.worst, bestPeriods = f.velocities.best;
  for (let k = n; k <= last; k++) {
    const step = k - n; const row: BurnRow = rows[k] ?? { label: fmt(periodEndDate(d, k)), period: k, planned: Math.round(Math.min(d.settings.baselineScope, (k * d.settings.baselineScope) / d.settings.baselinePeriods)) };
    const scopeF = f.scopeNow + f.scopeGrowth * step;
    row.forecastScope = Math.round(scopeF);
    row.forecast = Math.min(Math.round(f.doneNow + f.velocity * step), Math.round(scopeF));
    row.cone = [Math.round(Math.min(f.doneNow + worstPeriods * step, scopeF)), Math.round(Math.min(f.doneNow + bestPeriods * step, scopeF))];
    rows[k] = row;
  }
  return rows;
}

function BurnUpChart({ d, f, height = 300 }: { d: ProjectDelivery; f: ForecastResult; height?: number }) {
  const rows = useMemo(() => burnUpSeries(d, f), [d, f]);
  const recovery = f.recoveryPeriod !== null && f.gapUnits > 0 ? rows[f.recoveryPeriod] : undefined;
  return <div style={{ height }}><ResponsiveContainer><ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
    <CartesianGrid vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} /><YAxis tick={{ fontSize: 11 }} width={40} /><Tooltip />
    <Area dataKey="cone" name="Best–worst range" stroke="none" fill="var(--viz-cat-2)" fillOpacity={0.15} isAnimationActive={false} />
    <Line dataKey="scope" name="Scope" stroke="var(--viz-ink-muted)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
    <Line dataKey="forecastScope" name="Forecast scope" stroke="var(--viz-ink-muted)" strokeDasharray="1 4" dot={false} isAnimationActive={false} />
    <Line dataKey="planned" name="Baseline plan" stroke="var(--viz-cat-1)" strokeDasharray="6 4" dot={false} isAnimationActive={false} />
    <Line dataKey="done" name="Done" stroke="var(--viz-good)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
    <Line dataKey="forecast" name="Forecast" stroke="var(--viz-cat-2)" strokeWidth={2} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
    <ReferenceLine x={fmt(periodEndDate(d, closedPeriodCount(d)))} stroke="var(--viz-axis)" label={{ value: "Today", fontSize: 10, position: "top" }} />
    {recovery && <ReferenceDot x={recovery.label} y={recovery.planned} r={6} fill="var(--viz-cat-2)" stroke="var(--background)" />}
  </ComposedChart></ResponsiveContainer></div>;
}
const burnLegend = <><LegendItem colour="var(--viz-ink-muted)" label="Scope" shape="dashed" /><LegendItem colour="var(--viz-cat-1)" label="Baseline plan" shape="dashed" /><LegendItem colour="var(--viz-good)" label="Done" shape="line" /><LegendItem colour="var(--viz-cat-2)" label="Forecast and best–worst range" shape="dot" /></>;

function sprintDaily(d: ProjectDelivery, sprint: Sprint) {
  const start = toDate(sprint.start), end = toDate(sprint.end); const commits = d.commitments.filter(c => c.sprintId === sprint.id);
  const items = liveItems(d).filter(i => i.sprintId === sprint.id || commits.some(c => c.workItemId === i.id));
  const committed = commits.filter(c => !c.addedAfterStart).reduce((s, c) => s + c.unitsAtStart, 0) || items.reduce((s, i) => s + effectiveUnits(d, i), 0);
  const work = workingDays(start, end); const rows: { label: string; remaining?: number | undefined; ideal: number; added?: number | undefined }[] = [];
  const dailyDone: number[] = [];
  work.forEach((day, idx) => {
    const ideal = Math.round((committed * (1 - idx / Math.max(1, work.length - 1))) * 10) / 10;
    if (day > today) { rows.push({ label: fmt(day), ideal }); return; }
    const next = addDays(day, 1);
    const scope = items.filter(i => { const c = commits.find(x => x.workItemId === i.id); return !c?.addedAfterStart || toDate(i.createdAt) < next; }).reduce((s, i) => s + effectiveUnits(d, i), 0);
    const doneBy = items.filter(i => i.doneAt && toDate(i.doneAt) < next).reduce((s, i) => s + effectiveUnits(d, i), 0);
    const doneToday = items.filter(i => i.doneAt && toIso(toDate(i.doneAt)) === toIso(day)).reduce((s, i) => s + effectiveUnits(d, i), 0);
    dailyDone.push(doneToday);
    const added = commits.filter(c => c.addedAfterStart && items.find(i => i.id === c.workItemId && toIso(toDate(i.createdAt)) === toIso(day))).reduce((s, c) => s + c.unitsAtStart, 0);
    rows.push({ label: fmt(day), remaining: scope - doneBy, ideal, added: added || undefined });
  });
  const remaining = rows.filter(r => r.remaining !== undefined).at(-1)?.remaining ?? committed;
  return { rows, committed, remaining, forecast: getSprintForecast({ committed, remaining, start, end, today, dailyDone }) };
}

function Reports({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const f = getProjectForecast(forecastInputFor(d));
  const sprint = activeSprint(d);
  const closed = d.sprints.filter(s => s.status === "closed").sort((a, b) => a.start.localeCompare(b.start));
  const velocityRows = closed.map((s, i) => { const last3 = closed.slice(Math.max(0, i - 2), i + 1); return { label: s.name, committed: s.committedUnits ?? 0, completed: s.completedUnits ?? 0, average: Math.round((last3.reduce((a, x) => a + (x.completedUnits ?? 0), 0) / last3.length) * 10) / 10 }; });
  const n = closedPeriodCount(d); const input = forecastInputFor(d);
  const cfd = Array.from({ length: n + 1 }, (_, k) => { const at = k === n ? addDays(today, 1) : periodEndDate(d, k); const scope = scopeAt(d, at); const done = liveItems(d).filter(i => i.doneAt && toDate(i.doneAt) < at).reduce((s, i) => s + effectiveUnits(d, i), 0);
    const wip = k === n ? liveItems(d).filter(i => statusOf(d, i).category === "wip").reduce((s, i) => s + effectiveUnits(d, i), 0) : Math.round((input.completed[k] ?? 0) * 0.6); return { label: k === n ? "Today" : fmt(at), done, wip, todo: Math.max(0, scope - done - wip) }; });
  const blocked = liveItems(d).filter(i => i.statusId === "blocked").map(i => { const ev = [...d.events].reverse().find(e => e.workItemId === i.id && e.field === "status"); const since = ev ? toDate(ev.changedAt) : toDate(i.createdAt); return { item: i, days: workingDays(since, today).length }; }).filter(x => x.days > 10);
  const burn = sprint ? sprintDaily(d, sprint) : null;
  const bu = burnUpSeries(d, f);
  return <div className="grid gap-6 xl:grid-cols-2">
    <ChartCard className="xl:col-span-2" title="Project burn-up" subtitle="Scope, baseline plan and delivered work, with the forecast from today" info="Grey dashed is total scope, blue dashed is the baseline plan, green is work done. The orange dotted line is the forecast at the 3-sprint average." legend={burnLegend}
      csv={{ name: `${projectId}-burn-up`, columns: ["Period end", "Scope", "Planned", "Done", "Forecast"], rows: bu.map(r => [r.label, r.scope, r.planned, r.done, r.forecast]) }}
      table={<SimpleTable columns={["Period end", "Scope", "Planned", "Done"]} rows={bu.filter(r => r.done !== undefined).map(r => [String(r.label), String(r.scope), String(r.planned), String(r.done)])} />}
      empty={n < 1 ? { title: "No history yet", detail: "Close the first sprint to start the burn-up." } : undefined}><BurnUpChart d={d} f={f} /></ChartCard>
    <ChartCard title="Sprint burndown" subtitle={sprint ? `${sprint.name} · weekends and closure days skipped` : "No active sprint"} info="Remaining units each working day against an ideal straight line. Orange bars mark scope added mid-sprint."
      aside={burn && <RagPill rag={burn.forecast.willLand ? "Green" : "Red"} label={burn.forecast.willLand ? "Will land" : "Won't land"} />}
      csv={{ name: `${projectId}-burndown`, columns: ["Day", "Remaining", "Ideal", "Added"], rows: (burn?.rows ?? []).map(r => [r.label, r.remaining, r.ideal, r.added]) }}
      table={burn && <SimpleTable columns={["Day", "Remaining", "Ideal"]} rows={burn.rows.map(r => [r.label, String(r.remaining ?? "—"), String(r.ideal)])} />}
      empty={!burn ? { title: "No active sprint", detail: "Start a sprint to see its burndown." } : undefined}
      footer={burn && <p className="text-xs text-muted-foreground">{burn.remaining} {unitLabel(d)} left, completing about {burn.forecast.rate} a day over the last 3 days. {burn.forecast.willLand ? `On course to finish by ${fmt(burn.forecast.landDate)}.` : burn.forecast.landDate ? `At this rate it finishes ${fmt(burn.forecast.landDate)}, after the sprint ends.` : "Nothing completed recently, so it won't finish at this rate."}</p>}>
      {burn && <div className="h-64"><ResponsiveContainer><ComposedChart data={burn.rows}><CartesianGrid vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={20} /><YAxis width={34} tick={{ fontSize: 11 }} /><Tooltip />
        <Bar dataKey="added" name="Added" fill="var(--viz-cat-2)" barSize={6} /><Line dataKey="ideal" name="Ideal" stroke="var(--viz-ink-muted)" strokeDasharray="5 4" dot={false} isAnimationActive={false} /><Line dataKey="remaining" name="Remaining" stroke="var(--viz-cat-1)" strokeWidth={2} dot={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div>}
    </ChartCard>
    <ChartCard title="Velocity" subtitle="Committed and completed per closed sprint" info="Bars compare what was committed with what was completed. The line is the rolling 3-sprint average."
      legend={<><LegendItem colour="var(--viz-track)" label="Committed" /><LegendItem colour="var(--viz-cat-1)" label="Completed" /><LegendItem colour="var(--viz-cat-2)" label="3-sprint average" shape="line" /></>}
      csv={{ name: `${projectId}-velocity`, columns: ["Sprint", "Committed", "Completed", "3-sprint average"], rows: velocityRows.map(r => [r.label, r.committed, r.completed, r.average]) }}
      table={<SimpleTable columns={["Sprint", "Committed", "Completed", "Average"]} rows={velocityRows.map(r => [r.label, String(r.committed), String(r.completed), String(r.average)])} />}
      empty={!velocityRows.length ? { title: "No closed sprints", detail: "Close a sprint to record velocity." } : undefined}>
      <div className="h-64"><ResponsiveContainer><ComposedChart data={velocityRows}><CartesianGrid vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis width={34} tick={{ fontSize: 11 }} /><Tooltip />
        <Bar dataKey="committed" name="Committed" fill="var(--viz-track)" /><Bar dataKey="completed" name="Completed" fill="var(--viz-cat-1)" /><Line dataKey="average" name="3-sprint average" stroke="var(--viz-cat-2)" strokeWidth={2} dot={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div>
    </ChartCard>
    <ChartCard className="xl:col-span-2" title="Cumulative flow" subtitle="To do, in progress and done over time" info="Stacked units by status category at the end of each period. A widening middle band means work is piling up in progress."
      legend={<><LegendItem colour="var(--viz-track)" label="To do" /><LegendItem colour="var(--viz-cat-4)" label="In progress" /><LegendItem colour="var(--viz-good)" label="Done" /></>}
      csv={{ name: `${projectId}-cumulative-flow`, columns: ["Date", "To do", "In progress", "Done"], rows: cfd.map(r => [r.label, r.todo, r.wip, r.done]) }}
      table={<SimpleTable columns={["Date", "To do", "In progress", "Done"]} rows={cfd.map(r => [r.label, String(r.todo), String(r.wip), String(r.done)])} />}
      footer={blocked.length > 0 && <p className="flex items-center gap-2 text-sm text-health-bad-foreground"><AlertTriangle className="size-4" />{blocked.map(b => `"${b.item.title}" has been Blocked for ${b.days} working days`).join("; ")}.</p>}>
      <div className="h-64"><ResponsiveContainer><ComposedChart data={cfd}><CartesianGrid vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} /><YAxis width={40} tick={{ fontSize: 11 }} /><Tooltip />
        <Area dataKey="done" stackId="a" name="Done" fill="var(--viz-good)" stroke="var(--viz-good)" fillOpacity={0.6} isAnimationActive={false} /><Area dataKey="wip" stackId="a" name="In progress" fill="var(--viz-cat-4)" stroke="var(--viz-cat-4)" fillOpacity={0.6} isAnimationActive={false} /><Area dataKey="todo" stackId="a" name="To do" fill="var(--viz-track)" stroke="var(--viz-axis)" fillOpacity={0.6} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div>
    </ChartCard>
    <RecoveryPlan projectId={projectId} d={d} />
  </div>;
}

function SimpleTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return <table className="w-full text-sm"><thead><tr>{columns.map(c => <th key={c} className="py-1 text-left text-xs text-muted-foreground">{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border/50">{r.map((c, j) => <td key={j} className="py-1">{c}</td>)}</tr>)}</tbody></table>;
}

function RecoveryPlan({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const [value, setValue] = useState(String(d.settings.planVelocity ?? ""));
  return <div className="rounded-lg border border-border/70 bg-card p-5 shadow-sm xl:col-span-2"><h3 className="font-semibold">Recovery plan</h3><p className="mt-1 text-sm text-muted-foreground">Set the velocity the team is committing to for recovery. The "Recovery plan" forecast basis uses it.</p>
    <div className="mt-3 flex items-end gap-2"><Label className="text-xs">Target {unitLabel(d)} per {d.settings.approach === "waterfall" ? "period" : "sprint"}<Input type="number" className="mt-1 w-32" value={value} onChange={e => setValue(e.target.value)} /></Label><Button variant="outline" onClick={() => saveSettings(projectId, value ? { planVelocity: Number(value) } : {})}>Save plan</Button></div></div>;
}

// ---------------- Forecast ----------------
export function ForecastPanel({ projectId, compact }: { projectId: string; compact?: boolean }) {
  useDeliveryVersion();
  const d = getDelivery(projectId); const f = getProjectForecast(forecastInputFor(d)); const u = unitLabel(d);
  if (f.deliveryStatus === "insufficient_evidence") return <div className="rounded-lg border border-dashed border-border bg-card p-5 text-sm"><p className="font-semibold">Evidence-based forecast</p><p className="mt-1 text-muted-foreground">{f.explanation}</p></div>;
  return <div className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Evidence-based forecast</h3><div className="flex gap-1.5"><DeliveryChip status={f.deliveryStatus} /><RagPill rag={f.evidencedRag} prefix="Evidenced" /></div></div>
    <p className="mt-2 text-sm text-muted-foreground">{f.explanation}</p>
    <dl className={cn("mt-4 grid gap-4", compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
      <Metric label="Gap to plan" value={`${f.gapUnits > 0 ? f.gapUnits : 0} ${u}`} detail={f.gapUnits > 0 ? "behind baseline" : `${Math.abs(f.gapUnits)} ahead`} how={<>Planned so far ({f.plannedNow}) minus done so far ({f.doneNow}). The plan is a straight line from baseline scope {d.settings.baselineScope} over {d.settings.baselinePeriods} periods.</>} />
      <Metric label="Recovery date" value={f.gapUnits <= 0 ? "Not needed" : fmt(f.recoveryDate)} detail={f.gapUnits > 0 && !f.recoveryDate ? "No recovery before baseline end" : "When done catches the plan"} how={<>Adds {f.velocity} per period ({basisLabels[f.basis].toLowerCase()}) to work done and finds the first period end where done reaches the baseline plan. Blank if that is after the baseline end ({fmt(f.baselineEndDate)}).</>} />
      <Metric label="Forecast finish" value={f.converging ? fmt(f.forecastFinishDate) : "Not converging"} detail={f.daysVsBaseline === null ? "Scope grows faster than delivery" : f.daysVsBaseline > 0 ? `${f.daysVsBaseline} days late` : `${Math.abs(f.daysVsBaseline)} days early`} how={<>Each period, scope grows by {f.scopeGrowth} (average of the last 3) and done grows by {f.velocity}. The finish is the first period where done reaches scope. Range: {fmt(f.range.best)} (best) to {fmt(f.range.worst)} (worst).</>} />
      <Metric label="Required velocity" value={f.requiredVelocity === null ? "—" : `${f.requiredVelocity} ${u}`} detail={<span className="capitalize">{f.plausibility}</span>} how={<>(Scope {f.scopeNow} − done {f.doneNow}) ÷ periods left before baseline end, plus scope growth {f.scopeGrowth}. Realistic if at or below the best of the last 6 ({f.velocities.best}); stretch if within 25% of it.</>} />
    </dl>
  </div>;
}
function Metric({ label, value, detail, how }: { label: string; value: string; detail: React.ReactNode; how: React.ReactNode }) {
  return <div><dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}<HowCalculated title={label}>{how}</HowCalculated></dt><dd className="mt-1 text-lg font-semibold">{value}</dd><p className="text-xs text-muted-foreground">{detail}</p></div>;
}

function ForecastView({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const input = forecastInputFor(d);
  const [basis, setBasis] = useState<VelocityBasis>("rolling3");
  const base = getProjectForecast(input, basis);
  const [v, setV] = useState<number | null>(null); const [g, setG] = useState<number | null>(null);
  const f = getProjectForecast(input, basis, { velocity: v ?? undefined, scopeGrowth: g ?? undefined });
  const sprint = activeSprint(d); const burn = sprint ? sprintDaily(d, sprint) : null;
  return <div className="space-y-6">
    <ForecastPanel projectId={projectId} />
    <ChartCard title="Burn-up with forecast" subtitle={`${basisLabels[basis]} · diamond marks the recovery point`} legend={burnLegend}
      controls={<div className="flex flex-wrap gap-1">{(["last", "rolling3", "plan"] as VelocityBasis[]).map(b => <button key={b} onClick={() => { setBasis(b); setV(null); }} className={cn("rounded-full border px-2.5 py-1 text-xs", basis === b ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{basisLabels[b]}</button>)}</div>}
      empty={input.completed.length < 3 ? { title: "Not enough evidence", detail: "Close 3 sprints to unlock forecasting." } : undefined}>
      <BurnUpChart d={d} f={f} height={340} />
    </ChartCard>
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5 rounded-lg border border-border/70 bg-card p-5 shadow-sm"><div><h3 className="font-semibold">What if?</h3><p className="text-sm text-muted-foreground">Try a different velocity or scope growth. This only previews the result; nothing is saved.</p></div>
        <div><div className="flex justify-between text-sm"><Label>Velocity per period</Label><span className="font-medium">{f.velocity}</span></div><Slider className="mt-2" min={0} max={Math.max(80, Math.ceil(base.velocities.best * 2))} step={1} value={[f.velocity]} onValueChange={([x]) => setV(x ?? 0)} /></div>
        <div><div className="flex justify-between text-sm"><Label>Scope growth per period</Label><span className="font-medium">{f.scopeGrowth}</span></div><Slider className="mt-2" min={-10} max={30} step={1} value={[f.scopeGrowth]} onValueChange={([x]) => setG(x ?? 0)} /></div>
        <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Recovery</dt><dd className="font-semibold">{f.gapUnits <= 0 ? "Not needed" : fmt(f.recoveryDate)}</dd></div><div><dt className="text-muted-foreground">Finish</dt><dd className="font-semibold">{f.converging ? fmt(f.forecastFinishDate) : "Not converging"}</dd></div><div><dt className="text-muted-foreground">Status</dt><dd><DeliveryChip status={f.deliveryStatus} /></dd></div><div><dt className="text-muted-foreground">Evidenced RAG</dt><dd><RagPill rag={f.evidencedRag} /></dd></div></dl>
        {(v !== null || g !== null) && <Button variant="outline" size="sm" onClick={() => { setV(null); setG(null); }}>Reset to evidence</Button>}
      </div>
      <div className="rounded-lg border border-border/70 bg-card p-5 shadow-sm"><h3 className="flex items-center gap-2 font-semibold"><CalendarRange className="size-4" />Sprint dashboard</h3>
        {burn && sprint ? <div className="mt-3 space-y-2 text-sm"><p><strong>{sprint.name}</strong> · ends {fmt(toDate(sprint.end))}</p><RagPill rag={burn.forecast.willLand ? "Green" : "Red"} label={burn.forecast.willLand ? "This sprint will land" : "This sprint won't land"} />
          <p className="text-muted-foreground">{burn.committed} committed, {burn.remaining} left, {burn.forecast.daysLeft} days to go, completing about {burn.forecast.rate} a day recently.</p></div>
          : <p className="mt-3 text-sm text-muted-foreground">No active sprint.</p>}</div>
    </div>
  </div>;
}

// ---------------- Settings ----------------
function DeliverySettingsPanel({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const [open, setOpen] = useState(false); const s = d.settings; const closures = getNonWorkingPeriods();
  const [closure, setClosure] = useState({ name: "", start: "", end: "" });
  return <details open={open} onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
    <summary className="cursor-pointer text-sm font-semibold">Delivery settings and closure days</summary>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Label className="text-xs">Delivery approach<select className={cn(selectCls, "mt-1 w-full")} value={s.approach} onChange={e => saveSettings(projectId, { approach: e.target.value as typeof s.approach })}><option value="agile">Agile</option><option value="hybrid">Hybrid</option><option value="waterfall">Waterfall</option></select></Label>
      <Label className="text-xs">Work unit<select className={cn(selectCls, "mt-1 w-full")} value={s.workUnit} onChange={e => saveSettings(projectId, { workUnit: e.target.value as typeof s.workUnit })}><option value="points">Story points</option><option value="tasks">Task count</option><option value="effort_hours">Effort hours</option></select></Label>
      <Label className="text-xs">Sprint length (days)<Input type="number" className="mt-1" value={s.sprintLengthDays} onChange={e => saveSettings(projectId, { sprintLengthDays: Number(e.target.value) || 14 })} /></Label>
      <Label className="text-xs">RAG tolerance (days)<Input type="number" className="mt-1" value={s.ragToleranceDays} onChange={e => saveSettings(projectId, { ragToleranceDays: Number(e.target.value) })} /></Label>
      <Label className="text-xs">Baseline scope<Input type="number" className="mt-1" value={s.baselineScope} onChange={e => saveSettings(projectId, { baselineScope: Number(e.target.value) })} /></Label>
      <Label className="text-xs">Baseline start<Input type="date" className="mt-1" value={s.baselineStart} onChange={e => e.target.value && saveSettings(projectId, { baselineStart: e.target.value })} /></Label>
      <Label className="text-xs">Baseline periods<Input type="number" className="mt-1" value={s.baselinePeriods} onChange={e => saveSettings(projectId, { baselinePeriods: Math.max(1, Number(e.target.value)) })} /></Label>
      <div className="text-xs"><p className="font-medium">Baseline end</p><p className="mt-2 text-sm">{fmt(periodEndDate(d, s.baselinePeriods))}</p></div>
    </div>
    <div className="mt-5"><p className="text-sm font-medium">Organisation closure days</p><p className="text-xs text-muted-foreground">Shared by every project. Burndown ideal lines skip these days.</p>
      <ul className="mt-2 space-y-1 text-sm">{closures.map(c => <li key={c.id} className="flex items-center gap-2"><span className="flex-1">{c.name} · {fmt(toDate(c.start))}{c.end !== c.start ? ` – ${fmt(toDate(c.end))}` : ""}</span><Button variant="ghost" size="icon" className="size-7" aria-label={`Remove ${c.name}`} onClick={() => saveNonWorkingPeriods(closures.filter(x => x.id !== c.id))}><Trash2 className="size-3.5" /></Button></li>)}</ul>
      <div className="mt-2 flex flex-wrap gap-2"><Input className="h-8 w-48" placeholder="Name" value={closure.name} onChange={e => setClosure({ ...closure, name: e.target.value })} /><Input className="h-8 w-40" type="date" value={closure.start} onChange={e => setClosure({ ...closure, start: e.target.value })} /><Input className="h-8 w-40" type="date" value={closure.end} onChange={e => setClosure({ ...closure, end: e.target.value })} />
        <Button size="sm" variant="outline" onClick={() => { if (closure.name && closure.start) { saveNonWorkingPeriods([...closures, { id: `nw-${Date.now()}`, name: closure.name, start: closure.start, end: closure.end || closure.start }]); setClosure({ name: "", start: "", end: "" }); } }}><Plus />Add closure</Button></div></div>
  </details>;
}
