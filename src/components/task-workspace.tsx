import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Diamond,
  GripVertical,
  LayoutGrid,
  List,
  LoaderCircle,
  Milestone,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Task, TaskSource } from "@/data/types";

type View = "grid" | "board" | "timeline";
type Zoom = "week" | "month";

const people = [
  "Amelia Price",
  "Eva Chen",
  "Freya Walsh",
  "George Clarke",
  "Jacob Cole",
  "Layla Owen",
  "Maya Harrison",
];

const parseDate = (value: string) => {
  const [day = 1, month = 1, year = 1970] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

function AvatarStack({ names }: { names: string[] }) {
  return (
    <span className="flex min-w-16 -space-x-2" aria-label={names.join(", ")}>
      {names.map((name) => (
        <span
          key={name}
          title={name}
          className="grid size-7 place-items-center rounded-full border-2 border-card bg-accent text-[10px] font-semibold text-accent-foreground"
        >
          {initials(name)}
        </span>
      ))}
    </span>
  );
}

function TaskMarker({ task }: { task: Task }) {
  if (task.percentComplete === 100)
    return <CheckCircle2 className="size-4 shrink-0 text-health-good" aria-label="Complete" />;
  if (task.isMilestone)
    return <Diamond className="size-4 shrink-0 fill-primary text-primary" aria-label="Milestone" />;
  return <span className="size-4 shrink-0 rounded border border-border bg-card" aria-hidden="true" />;
}

function AssigneeEditor({ task, update }: { task: Task; update: (patch: Partial<Task>) => void }) {
  const toggle = (person: string) => {
    const selected = task.assignees.includes(person);
    update({ assignees: selected ? task.assignees.filter((name) => name !== person) : [...task.assignees, person] });
  };

  return (
    <details className="group relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center rounded px-2 outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring">
        <AvatarStack names={task.assignees} />
      </summary>
      <div className="absolute left-0 top-10 z-30 w-56 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg">
        {people.map((person) => (
          <label key={person} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs hover:bg-accent">
            <input
              type="checkbox"
              checked={task.assignees.includes(person)}
              onChange={() => toggle(person)}
              className="size-4 accent-primary"
            />
            <span className="grid size-6 place-items-center rounded-full bg-accent text-[9px] font-semibold">{initials(person)}</span>
            <span>{person}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function GridView({ tasks, buckets, update }: { tasks: Task[]; buckets: string[]; update: (id: string, patch: Partial<Task>) => void }) {
  const fieldClass = "h-9 w-full min-w-24 rounded border border-transparent bg-transparent px-2 text-sm outline-none hover:border-input focus:border-ring focus:bg-background";
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead className="sticky top-0 z-20 bg-table-head">
            <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
              <th className="w-10 px-3 py-3"><span className="sr-only">Type</span></th>
              <th className="min-w-64 px-2 py-3">Task</th>
              <th className="w-36 px-2 py-3">Assignees</th>
              <th className="w-36 px-2 py-3">Start</th>
              <th className="w-36 px-2 py-3">Finish</th>
              <th className="w-44 px-2 py-3">Complete</th>
              <th className="w-40 px-2 py-3">Bucket</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-b border-border/70 last:border-0 hover:bg-accent/25">
                <td className="px-3 py-2"><TaskMarker task={task} /></td>
                <td className="px-1 py-2">
                  <input
                    aria-label={`Title for ${task.title}`}
                    value={task.title}
                    onChange={(event) => update(task.id, { title: event.target.value })}
                    className={cn(fieldClass, "min-w-64 font-medium", task.percentComplete === 100 && "text-muted-foreground line-through")}
                  />
                </td>
                <td className="px-1 py-2"><AssigneeEditor task={task} update={(patch) => update(task.id, patch)} /></td>
                <td className="px-1 py-2"><input aria-label={`Start date for ${task.title}`} inputMode="numeric" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" value={task.start} onChange={(event) => update(task.id, { start: event.target.value })} className={fieldClass} /></td>
                <td className="px-1 py-2"><input aria-label={`Finish date for ${task.title}`} inputMode="numeric" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" value={task.finish} onChange={(event) => update(task.id, { finish: event.target.value })} className={fieldClass} /></td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <input aria-label={`Completion for ${task.title}`} type="range" min="0" max="100" step="5" value={task.percentComplete} onChange={(event) => update(task.id, { percentComplete: Number(event.target.value) })} className="h-2 w-24 accent-primary" />
                    <span className="w-10 text-right text-xs tabular-nums">{task.percentComplete}%</span>
                  </div>
                </td>
                <td className="px-1 py-2">
                  <select aria-label={`Bucket for ${task.title}`} value={task.bucket} onChange={(event) => update(task.id, { bucket: event.target.value })} className={fieldClass}>
                    {buckets.map((bucket) => <option key={bucket}>{bucket}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoardView({ tasks, buckets, move }: { tasks: Task[]; buckets: string[]; move: (id: string, bucket: string) => void }) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const moveSideways = (task: Task, direction: -1 | 1) => {
    const index = buckets.indexOf(task.bucket);
    const next = buckets[index + direction];
    if (next) move(task.id, next);
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-max auto-cols-[280px] grid-flow-col gap-4">
        {buckets.map((bucket) => {
          const bucketTasks = tasks.filter((task) => task.bucket === bucket);
          return (
            <section
              key={bucket}
              className={cn("min-h-72 rounded-lg border border-border bg-muted/35 p-3 transition-colors", draggedId && "border-dashed")}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedId) move(draggedId, bucket);
                setDraggedId(null);
              }}
            >
              <header className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{bucket}</h3>
                <span className="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground">{bucketTasks.length}</span>
              </header>
              <div className="space-y-2">
                {bucketTasks.map((task) => (
                  <article
                    key={task.id}
                    draggable
                    tabIndex={0}
                    aria-label={`${task.title}. Drag or use left and right arrow keys to change bucket.`}
                    onDragStart={() => setDraggedId(task.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft") moveSideways(task, -1);
                      if (event.key === "ArrowRight") moveSideways(task, 1);
                    }}
                    className={cn("cursor-grab rounded-md border border-border bg-card p-3 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing", draggedId === task.id && "opacity-50")}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <TaskMarker task={task} />
                      <p className={cn("min-w-0 flex-1 text-sm font-medium leading-5", task.percentComplete === 100 && "text-muted-foreground line-through")}>{task.title}</p>
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase text-muted-foreground">{task.finish}</p>
                        <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${task.percentComplete}%` }} />
                        </div>
                      </div>
                      <AvatarStack names={task.assignees} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({ tasks }: { tasks: Task[] }) {
  const [zoom, setZoom] = useState<Zoom>("week");
  const dayMs = 86_400_000;
  const range = useMemo(() => {
    const starts = tasks.map((task) => parseDate(task.start).getTime());
    const finishes = tasks.map((task) => parseDate(task.finish).getTime());
    const min = Math.min(...starts) - 3 * dayMs;
    const max = Math.max(...finishes) + 7 * dayMs;
    return { min, days: Math.max(1, Math.ceil((max - min) / dayMs)) };
  }, [tasks]);
  const dayWidth = zoom === "week" ? 14 : 5;
  const chartWidth = range.days * dayWidth;
  const rowHeight = 52;
  const ticks = Array.from({ length: Math.ceil(range.days / (zoom === "week" ? 7 : 30)) + 1 }, (_, index) => index * (zoom === "week" ? 7 : 30));
  const taskById = new Map(tasks.map((task, index) => [task.id, { task, index }]));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-table-head px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><Network className="size-4 text-primary" />Delivery timeline</div>
        <div className="flex rounded-md border border-border bg-background p-0.5" aria-label="Timeline zoom">
          {(["week", "month"] as Zoom[]).map((option) => (
            <Button key={option} variant="ghost" size="sm" onClick={() => setZoom(option)} className={cn("h-7 px-3 capitalize", zoom === option && "bg-accent text-accent-foreground")}>{option}</Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-max grid-cols-[240px_auto]">
          <div className="sticky left-0 z-20 border-r border-border bg-card">
            <div className="h-11 border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground">Task</div>
            {tasks.map((task) => (
              <div key={task.id} className="flex h-[52px] items-center gap-2 border-b border-border/70 px-4 last:border-0">
                <TaskMarker task={task} />
                <span className={cn("max-w-44 truncate text-xs font-medium", task.percentComplete === 100 && "text-muted-foreground line-through")}>{task.title}</span>
              </div>
            ))}
          </div>
          <div className="relative" style={{ width: chartWidth }}>
            <div className="relative h-11 border-b border-border bg-table-head">
              {ticks.map((offset) => {
                const date = new Date(range.min + offset * dayMs);
                return <span key={offset} className="absolute top-3 text-[10px] font-medium text-muted-foreground" style={{ left: offset * dayWidth + 6 }}>{zoom === "week" ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}</span>;
              })}
            </div>
            <div className="relative" style={{ height: tasks.length * rowHeight }}>
              {ticks.map((offset) => <span key={offset} className="absolute inset-y-0 border-l border-border/60" style={{ left: offset * dayWidth }} />)}
              {tasks.map((task, index) => {
                const left = ((parseDate(task.start).getTime() - range.min) / dayMs) * dayWidth;
                const duration = Math.max(1, (parseDate(task.finish).getTime() - parseDate(task.start).getTime()) / dayMs + 1);
                return (
                  <div key={task.id} className="absolute left-0 right-0 border-b border-border/70" style={{ top: index * rowHeight, height: rowHeight }}>
                    {task.isMilestone ? (
                      <span title={`${task.title}: ${task.finish}`} className="absolute top-[18px] size-4 rotate-45 border-2 border-primary bg-card" style={{ left }} />
                    ) : (
                      <span title={`${task.start} – ${task.finish}`} className="absolute top-[16px] h-5 min-w-2 overflow-hidden rounded bg-primary/85" style={{ left, width: duration * dayWidth }}>
                        <span className="block h-full bg-primary" style={{ width: `${task.percentComplete}%` }} />
                      </span>
                    )}
                  </div>
                );
              })}
              <svg className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible" aria-label="Task dependencies">
                <defs>
                  <marker id="dependency-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M 0 0 L 6 3 L 0 6 z" fill="currentColor" className="text-muted-foreground" />
                  </marker>
                </defs>
                {tasks.flatMap((task, taskIndex) => task.dependencies.map((dependencyId) => {
                  const source = taskById.get(dependencyId);
                  if (!source) return null;
                  const sourceX = ((parseDate(source.task.finish).getTime() - range.min) / dayMs + 1) * dayWidth;
                  const targetX = ((parseDate(task.start).getTime() - range.min) / dayMs) * dayWidth;
                  const sourceY = source.index * rowHeight + rowHeight / 2;
                  const targetY = taskIndex * rowHeight + rowHeight / 2;
                  const elbow = Math.max(sourceX + 8, targetX - 10);
                  return <path key={`${dependencyId}-${task.id}`} d={`M ${sourceX} ${sourceY} H ${elbow} V ${targetY} H ${targetX - 3}`} fill="none" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#dependency-arrow)" className="text-muted-foreground" />;
                }))}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskWorkspace({ initialTasks, taskSource }: { initialTasks: Task[]; taskSource: TaskSource }) {
  const [tasks, setTasks] = useState(() => initialTasks.map((task) => ({ ...task, assignees: [...task.assignees] })));
  const [view, setView] = useState<View>("grid");
  const [syncing, setSyncing] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlanner = taskSource !== "Native";
  const buckets = useMemo(() => Array.from(new Set(tasks.map((task) => task.bucket))), [tasks]);

  useEffect(() => () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
  }, []);

  const simulateSync = () => {
    if (!isPlanner) return;
    setSyncing(true);
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => setSyncing(false), 1500);
  };

  const update = (id: string, patch: Partial<Task>) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
    simulateSync();
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-fit rounded-md border border-border bg-card p-1 shadow-sm" aria-label="Task views">
          {([
            ["grid", List],
            ["board", LayoutGrid],
            ["timeline", Milestone],
          ] as const).map(([option, Icon]) => (
            <Button key={option} variant="ghost" size="sm" onClick={() => setView(option)} className={cn("capitalize", view === option && "bg-accent text-accent-foreground")}><Icon />{option}</Button>
          ))}
        </div>
        {isPlanner && (
          <div className="flex min-h-8 items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
            {syncing ? <LoaderCircle className="size-3.5 animate-spin text-primary" /> : <Check className="size-3.5 text-health-good" />}
            <span>{syncing ? "Syncing…" : "Synced with Planner"}</span>
          </div>
        )}
      </div>
      {view === "grid" && <GridView tasks={tasks} buckets={buckets} update={update} />}
      {view === "board" && <BoardView tasks={tasks} buckets={buckets} move={(id, bucket) => update(id, { bucket })} />}
      {view === "timeline" && <TimelineView tasks={tasks} />}
    </section>
  );
}