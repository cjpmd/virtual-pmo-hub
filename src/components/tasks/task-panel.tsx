import { useState } from "react";
import { tempId, type TaskView } from "@/services/work-items";
import { CheckCircle2, Circle, Link2, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Priority, Task } from "@/data/types";
import {
  toDate,
  toIso,
  fromIso,
  DAY,
  initials,
  priorities,
  checklistOf,
  wouldLoop,
} from "./task-helpers";
import { type Actions } from "./task-actions";
import { DotsMenu, Tick } from "./task-row-parts";

export function TaskPanel({
  task,
  tasks,
  people,
  buckets,
  premium,
  a,
  update,
  close,
}: {
  task: TaskView;
  tasks: Task[];
  people: string[];
  buckets: string[];
  premium: boolean;
  a: Actions;
  update: (patch: Partial<Task>) => void;
  close: () => void;
}) {
  const [more, setMore] = useState(false),
    [newItem, setNewItem] = useState(""),
    [label, setLabel] = useState(""),
    [depPick, setDepPick] = useState("");
  const files = task.attachments;
  const done = task.percentComplete === 100,
    checklist = checklistOf(task),
    total = task.estimatedEffortHours ?? 0,
    completed =
      task.effortCompletedHours ?? Math.round(((total * task.percentComplete) / 100) * 10) / 10;
  const duration =
    Math.round((toDate(task.finish).getTime() - toDate(task.start).getTime()) / DAY) + 1;
  const setChecklist = (items: typeof checklist) =>
    update({ checklistItems: items, checklistCount: items.length });
  const candidates = tasks.filter(
    (t) =>
      t.id !== task.id && !task.dependencies.includes(t.id) && !wouldLoop(tasks, task.id, t.id),
  );
  const field =
    "mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60";
  const notes = task.notes ?? "";
  return (
    <>
      <button aria-label="Close task" className="fixed inset-0 z-40 bg-overlay" onClick={close} />
      <aside
        role="dialog"
        aria-label={`${task.title} details`}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg space-y-5 overflow-y-auto border-l bg-background p-6 shadow-xl"
      >
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Copy link to task"
            onClick={() => a.link(task.id)}
          >
            <Link2 />
          </Button>
          <DotsMenu task={task} tasks={tasks} a={a} />
          <Button size="icon" variant="ghost" aria-label="Close" onClick={close}>
            <X />
          </Button>
        </div>
        <div className="flex items-start gap-2">
          <div className="pt-2">
            <Tick task={task} a={a} />
          </div>
          <input
            aria-label="Task title"
            value={task.title}
            onChange={(e) => update({ title: e.target.value })}
            className={cn(
              "flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-lg font-semibold",
              done && "text-muted-foreground line-through",
            )}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {task.assignees.map((n) => (
            <span
              key={n}
              className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs"
            >
              <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                {initials(n)}
              </span>
              {n}
              <button
                aria-label={`Remove ${n}`}
                onClick={() => update({ assignees: task.assignees.filter((x) => x !== n) })}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <select
            aria-label="Add assignee"
            value=""
            onChange={(e) =>
              e.target.value && update({ assignees: [...task.assignees, e.target.value] })
            }
            className="h-7 rounded-md border bg-background px-1 text-xs"
          >
            <option value="">+ Assign</option>
            {people
              .filter((p) => !task.assignees.includes(p))
              .map((p) => (
                <option key={p}>{p}</option>
              ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(task.labels ?? []).map((l) => (
            <span
              key={l}
              className="inline-flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground"
            >
              {l}
              <button
                aria-label={`Remove ${l}`}
                onClick={() => update({ labels: (task.labels ?? []).filter((x) => x !== l) })}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (label.trim()) update({ labels: [...(task.labels ?? []), label.trim()] });
              setLabel("");
            }}
          >
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="+ Add label"
              className="h-7 w-28 rounded-md border bg-background px-2 text-xs"
            />
          </form>
        </div>
        <div>
          <p className="text-xs font-semibold">Notes</p>
          <textarea
            aria-label="Notes"
            value={notes}
            onChange={(e) => update({ notes: e.target.value })}
            rows={more ? 8 : 3}
            className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
          />
          <button onClick={() => setMore(!more)} className="text-xs font-semibold text-primary">
            {more ? "Show less" : "Show more"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <label>
            Start{premium && task.isMilestone ? null : null}
            <input
              type="date"
              disabled={premium && task.dependencies.length > 0 && false}
              value={toIso(task.start)}
              onChange={(e) => e.target.value && update({ start: fromIso(e.target.value) })}
              className={field}
            />
          </label>
          <label>
            Finish
            <input
              type="date"
              value={toIso(task.finish)}
              onChange={(e) => e.target.value && update({ finish: fromIso(e.target.value) })}
              className={field}
            />
          </label>
          <label>
            <span className="inline-flex items-center gap-1">
              Duration{premium && <Lock className="size-3" aria-label="Calculated by Planner" />}
            </span>
            <input
              disabled
              value={`${duration} day${duration === 1 ? "" : "s"}`}
              className={field}
            />
          </label>
          <label>
            % Complete
            <input
              type="number"
              min={0}
              max={100}
              value={task.percentComplete}
              onChange={(e) =>
                update({ percentComplete: Math.max(0, Math.min(100, Number(e.target.value))) })
              }
              className={field}
            />
          </label>
          <label>
            Bucket
            <select
              value={task.bucket}
              onChange={(e) => update({ bucket: e.target.value })}
              className={field}
            >
              {buckets.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={task.priority}
              onChange={(e) => update({ priority: e.target.value as Priority })}
              className={field}
            >
              {priorities.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold">
              Checklist {checklist.filter((c) => c.done).length} / {checklist.length}
            </p>
            <div className="h-1 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${checklist.length ? (checklist.filter((c) => c.done).length / checklist.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {checklist.map((c) => (
              <div key={c.id} className="group flex items-center gap-2 text-sm">
                <button
                  aria-label={c.done ? "Untick" : "Tick"}
                  onClick={() =>
                    setChecklist(
                      checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)),
                    )
                  }
                >
                  {c.done ? (
                    <CheckCircle2 className="size-4 fill-primary text-primary-foreground" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                </button>
                <input
                  value={c.label}
                  onChange={(e) =>
                    setChecklist(
                      checklist.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  className={cn(
                    "flex-1 bg-transparent",
                    c.done && "line-through text-muted-foreground",
                  )}
                />
                <button
                  aria-label="Remove item"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newItem.trim())
                  setChecklist([
                    ...checklist,
                    { id: tempId(), label: newItem.trim(), done: false },
                  ]);
                setNewItem("");
              }}
              className="flex items-center gap-2"
            >
              <Circle className="size-4 text-muted-foreground/50" />
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Add an item"
                className="flex-1 bg-transparent text-sm"
              />
            </form>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Effort</p>
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-2 text-xs">
            <label>
              Completed
              <input
                type="number"
                min={0}
                value={completed}
                onChange={(e) => update({ effortCompletedHours: Number(e.target.value) })}
                className={field}
              />
            </label>
            <span className="pb-2">+</span>
            <label>
              Remaining
              <input
                disabled
                value={`${Math.max(0, Math.round((total - completed) * 10) / 10)} hours`}
                className={field}
              />
            </label>
            <span className="pb-2">=</span>
            <label>
              Total
              <input
                type="number"
                min={0}
                value={total}
                onChange={(e) => update({ estimatedEffortHours: Number(e.target.value) })}
                className={field}
              />
            </label>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Depends on</p>
          {task.dependencies.length ? (
            <div className="mt-1 space-y-1">
              {task.dependencies.map((d) => {
                const p = tasks.find((t) => t.id === d);
                return (
                  <div
                    key={d}
                    className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm"
                  >
                    <span>
                      {p?.title ?? d}
                      <span className="ml-2 text-xs text-muted-foreground">
                        Finish-to-start · {p?.finish}
                      </span>
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Remove dependency"
                      onClick={() => a.removeDep(task.id, d)}
                    >
                      <X />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              This task doesn't depend on other tasks
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <select
              aria-label="Choose dependency"
              value={depPick}
              onChange={(e) => setDepPick(e.target.value)}
              className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Choose a task…</option>
              {candidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!depPick}
              onClick={() => {
                a.addDep(task.id, depPick);
                setDepPick("");
              }}
            >
              Add dependency
            </Button>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Attachments</p>
          {files.map((f) => (
            <p key={f} className="mt-1 rounded-md border px-2 py-1.5 text-sm">
              {f}
            </p>
          ))}
          {!files.length && <p className="mt-1 text-xs text-muted-foreground">No attachments.</p>}
        </div>
      </aside>
    </>
  );
}
