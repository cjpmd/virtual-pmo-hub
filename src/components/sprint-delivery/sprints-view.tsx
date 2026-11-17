import { useState, type DragEvent } from "react";
import { CheckCircle2, GripVertical, Play, Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChartCard } from "@/components/charts/chart-card";
import { cn } from "@/lib/utils";
import { getProjectForecast } from "@/services/forecast";
import {
  closeSprint,
  createSprint,
  effectiveUnits,
  forecastInputFor,
  isDone,
  liveItems,
  sprintUnits,
  startSprint,
  statusOf,
  toDate,
  unitLabel,
  updateItem,
  updateSprint,
  type ProjectDelivery,
  type Sprint,
} from "@/services/sprints";
import { fmt } from "./shared";

function CapacityBar({
  used,
  capacity,
  velocity,
}: {
  used: number;
  capacity: number;
  velocity: number;
}) {
  const max = Math.max(used, capacity, velocity, 1);
  return (
    <div className="space-y-1">
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className={cn("h-2 rounded-full", used > capacity ? "bg-health-bad" : "bg-primary")}
          style={{ width: `${(used / max) * 100}%` }}
        />
        {velocity > 0 && (
          <div
            className="absolute -top-1 h-4 w-0.5 bg-foreground/60"
            style={{ left: `${(velocity / max) * 100}%` }}
            title={`Rolling velocity ${velocity}`}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {used} committed of {capacity} capacity
        {velocity > 0 ? ` · rolling velocity ${velocity} (marker)` : ""}
      </p>
    </div>
  );
}

export function Sprints({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const [closing, setClosing] = useState<Sprint | null>(null);
  const [message, setMessage] = useState("");
  const v = getProjectForecast(forecastInputFor(d)).velocities.rolling3;
  const open = d.sprints
    .filter((s) => s.status !== "closed")
    .sort((a, b) => a.start.localeCompare(b.start));
  const closed = d.sprints
    .filter((s) => s.status === "closed")
    .sort((a, b) => b.start.localeCompare(a.start));
  const backlog = liveItems(d)
    .filter((i) => !i.sprintId && !isDone(d, i))
    .sort((a, b) => a.backlogRank - b.backlogRank);
  const drop = (sprintId: string | null) => (e: DragEvent) => {
    const id = e.dataTransfer.getData("text/plain");
    if (id) updateItem(projectId, id, { sprintId, ...(sprintId ? {} : { statusId: "backlog" }) });
  };
  const u = unitLabel(d);
  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-8">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Sprint plan</h3>
          <Button variant="outline" onClick={() => createSprint(projectId)}>
            <Plus />
            Plan a sprint
          </Button>
        </div>
        {message && (
          <p
            role="alert"
            className="rounded-md border border-health-warn/30 bg-health-warn/10 p-3 text-sm"
          >
            {message}
          </p>
        )}
        {open.map((sprint) => {
          const items = liveItems(d).filter((i) => i.sprintId === sprint.id);
          const used = sprintUnits(d, sprint.id);
          return (
            <section
              key={sprint.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={drop(sprint.id)}
              className="space-y-3 rounded-lg border border-border/70 bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{sprint.name}</h4>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        sprint.status === "active"
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {sprint.status === "active" ? "Active" : "Planned"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmt(toDate(sprint.start))} – {fmt(toDate(sprint.end))}
                  </p>
                </div>
                <Label className="text-xs">
                  Capacity
                  <Input
                    type="number"
                    className="mt-1 h-8 w-20"
                    value={sprint.capacityUnits}
                    onChange={(e) =>
                      updateSprint(projectId, sprint.id, { capacityUnits: Number(e.target.value) })
                    }
                  />
                </Label>
                {sprint.status === "planned" ? (
                  <Button
                    size="sm"
                    onClick={() => setMessage(startSprint(projectId, sprint.id) ?? "")}
                  >
                    <Play />
                    Start sprint
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setClosing(sprint)}>
                    <Square />
                    Close sprint
                  </Button>
                )}
              </div>
              <Input
                placeholder="Sprint goal"
                value={sprint.goal}
                onChange={(e) => updateSprint(projectId, sprint.id, { goal: e.target.value })}
                className="h-8 text-sm"
              />
              <CapacityBar used={used} capacity={sprint.capacityUnits} velocity={v} />
              <div className="divide-y divide-border/50 rounded-md border border-dashed border-border">
                {items.map((i) => (
                  <div
                    key={i.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm"
                  >
                    <GripVertical className="size-3.5 text-muted-foreground" aria-hidden />
                    {isDone(d, i) && (
                      <CheckCircle2 className="size-4 text-health-good" aria-label="Done" />
                    )}
                    <span
                      className={cn(
                        "flex-1 truncate",
                        isDone(d, i) && "text-muted-foreground line-through",
                      )}
                    >
                      {i.title}
                    </span>
                    <span className="text-xs text-muted-foreground">{statusOf(d, i).name}</span>
                    <span className="w-12 text-right text-xs">
                      {effectiveUnits(d, i)} {u}
                    </span>
                  </div>
                ))}
                {!items.length && (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    Drag backlog items here.
                  </p>
                )}
              </div>
            </section>
          );
        })}
        <ChartCard
          title="Closed sprints"
          subtitle="Metrics recorded when each sprint closed"
          csv={{
            name: "closed-sprints",
            columns: ["Sprint", "Committed", "Completed", "Added", "Removed"],
            rows: closed.map((s) => [
              s.name,
              s.committedUnits,
              s.completedUnits,
              s.addedUnits,
              s.removedUnits,
            ]),
          }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2">Sprint</th>
                <th>Dates</th>
                <th className="text-right">Committed</th>
                <th className="text-right">Completed</th>
                <th className="text-right">Added</th>
                <th className="text-right">Removed</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((s) => (
                <tr key={s.id} className="border-t border-border/50">
                  <td className="py-2 font-medium">{s.name}</td>
                  <td className="text-xs text-muted-foreground">
                    {fmt(toDate(s.start))} – {fmt(toDate(s.end))}
                  </td>
                  <td className="text-right">{s.committedUnits}</td>
                  <td className="text-right">{s.completedUnits}</td>
                  <td className="text-right">{s.addedUnits}</td>
                  <td className="text-right">{s.removedUnits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!closed.length && (
            <p className="py-4 text-sm text-muted-foreground">
              No sprints closed yet. Close 3 sprints to unlock forecasting.
            </p>
          )}
        </ChartCard>
      </div>
      <aside
        onDragOver={(e) => e.preventDefault()}
        onDrop={drop(null)}
        className="space-y-2 rounded-lg border border-border/70 bg-card p-4 shadow-sm xl:col-span-4"
      >
        <h3 className="font-semibold">Backlog</h3>
        <p className="text-xs text-muted-foreground">
          Drag items into a sprint, or drop them back here.
        </p>
        <div className="max-h-[640px] space-y-1 overflow-y-auto">
          {backlog.map((i) => (
            <div
              key={i.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
              className="flex cursor-grab items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-sm hover:bg-accent/40"
            >
              <GripVertical className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="flex-1 truncate">{i.title}</span>
              <span className="text-xs text-muted-foreground">{effectiveUnits(d, i)}</span>
            </div>
          ))}
        </div>
      </aside>
      {closing && (
        <CloseSprintDialog
          projectId={projectId}
          d={d}
          sprint={closing}
          onClose={() => setClosing(null)}
        />
      )}
    </div>
  );
}

function CloseSprintDialog({
  projectId,
  d,
  sprint,
  onClose,
}: {
  projectId: string;
  d: ProjectDelivery;
  sprint: Sprint;
  onClose: () => void;
}) {
  const [carry, setCarry] = useState<"next" | "backlog">("next");
  const incomplete = liveItems(d).filter((i) => i.sprintId === sprint.id && !isDone(d, i));
  const done = liveItems(d)
    .filter((i) => i.sprintId === sprint.id && isDone(d, i))
    .reduce((s, i) => s + effectiveUnits(d, i), 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {sprint.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {done} {unitLabel(d)} completed. {incomplete.length} item
          {incomplete.length === 1 ? " is" : "s are"} not finished:
        </p>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {incomplete.map((i) => (
            <li key={i.id} className="flex justify-between border-b border-border/50 py-1">
              <span className="truncate">{i.title}</span>
              <span className="text-xs text-muted-foreground">{statusOf(d, i).name}</span>
            </li>
          ))}
        </ul>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Unfinished items</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={carry === "next"} onChange={() => setCarry("next")} />
            Move to next sprint
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={carry === "backlog"}
              onChange={() => setCarry("backlog")}
            />
            Return to backlog
          </label>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              closeSprint(projectId, sprint.id, carry);
              onClose();
            }}
          >
            Close sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
