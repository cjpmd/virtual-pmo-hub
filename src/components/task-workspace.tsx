import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useOrgId } from "@/components/auth/organisation-provider";
import { QueryState } from "@/components/query-state";
import { useProjectPermissions } from "@/hooks/use-hierarchy";
import { useOrgWritable } from "@/hooks/use-org-access";
import { ReadOnlyTip, READ_ONLY_TIP } from "@/components/org-access-banner";
import { invalidateRollups } from "@/hooks/use-project-records";
import { useProjectTasks } from "@/hooks/use-work-items";
import { effectiveTaskSource } from "@/services/work-items";
import { qk } from "@/services/query-keys";
import {
  saveTaskChanges,
  statusFor,
  tempId,
  type ProjectTasks,
  type TaskView,
} from "@/services/work-items";
import { Check, ExternalLink, ListPlus, LoaderCircle, Lock, X } from "lucide-react";
import { BoardWorkspace } from "@/components/board-workspace";
import { openIssueTask } from "@/components/issue-task-sheet";
import { taskColumns, tasksToRows } from "@/lib/board-data";
import { Button } from "@/components/ui/button";
import type { Priority, TaskSource } from "@/data/types";
import { wouldLoop, kidsOf, buildRows } from "./tasks/task-helpers";
import { type Actions } from "./tasks/task-actions";
import { GridView } from "./tasks/grid-view";
import { TimelineView } from "./tasks/timeline-view";
import { TaskPanel } from "./tasks/task-panel";

/** A project's tasks, loaded from and saved to Supabase (services/work-items.ts). */
export function TaskWorkspace({
  projectId,
  taskSource,
}: {
  projectId: string;
  taskSource: TaskSource;
}) {
  const query = useProjectTasks(projectId);
  return (
    <QueryState query={query}>
      {(data) => (
        <TaskEditor
          data={data}
          projectId={projectId}
          taskSource={effectiveTaskSource(taskSource)}
        />
      )}
    </QueryState>
  );
}

function TaskEditor({
  data,
  projectId,
  taskSource,
}: {
  data: ProjectTasks;
  projectId: string;
  taskSource: TaskSource;
}) {
  const [tasks, setTasksState] = useState<TaskView[]>(data.tasks),
    [view, setView] = useState<"grid" | "board" | "timeline">("grid"),
    [openId, setOpenId] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [clip, setClip] = useState<{ task: TaskView; cut: boolean } | null>(null),
    [notice, setNotice] = useState<{ text: string; undo?: TaskView[] | undefined } | null>(null),
    [confirm, setConfirm] = useState<string | null>(null),
    [syncing, setSyncing] = useState(false),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => buildRows(tasks, collapsed), [tasks, collapsed]);
  const planner = taskSource !== "Native";
  const { canEdit } = useProjectPermissions(projectId);
  const writable = useOrgWritable();
  const orgId = useOrgId(),
    queryClient = useQueryClient(),
    router = useRouter();
  // Saving: the screen edits `tasks`; `saved` is what the database holds. Edits are written after
  // a short pause (structural changes straight away), one save at a time, and never dropped:
  // pending edits flush on route change, tab hide and unmount.
  const latest = useRef(tasks),
    saved = useRef<TaskView[]>(data.tasks),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    dirty = useRef(false),
    chain = useRef<Promise<void>>(Promise.resolve()),
    inFlight = useRef(0);
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return chain.current;
    dirty.current = false;
    chain.current = chain.current.then(async () => {
      const next = latest.current,
        prev = saved.current;
      inFlight.current++;
      setSyncing(true);
      try {
        const r = await saveTaskChanges({
          projectId,
          buckets: data.buckets,
          people: data.people,
          prev,
          next,
        });
        const id = (value: string) => r.ids.get(value) ?? value;
        const fix = (t: TaskView): TaskView => ({
          ...t,
          id: id(t.id),
          ...(t.parentId ? { parentId: id(t.parentId) } : {}),
          dependencies: t.dependencies.map(id),
          updatedAt: r.updatedAt.has(t.id) ? (r.updatedAt.get(t.id) ?? null) : t.updatedAt,
          status: statusFor(t, t.status),
          checklistItems: t.checklistItems.map((c) => ({
            ...c,
            id: r.checklistIds.get(c.id) ?? c.id,
          })),
        });
        saved.current = next.map(fix);
        latest.current = latest.current.map(fix);
        setTasksState(latest.current);
        setOpenId((v) => v && id(v));
        setSelected((v) => v && id(v));
        setNotice((n) => (n?.undo ? { ...n, undo: n.undo.map(fix) } : n));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The tasks could not be saved.");
        // Show what the database holds now; anything typed since this save started is kept as pending.
        const key = qk.projects.tasks(orgId, projectId);
        await queryClient.refetchQueries({ queryKey: key });
        const fresh = queryClient.getQueryData<ProjectTasks>(key)?.tasks;
        if (fresh && !dirty.current) {
          saved.current = fresh;
          latest.current = fresh;
          setTasksState(fresh);
        }
      } finally {
        inFlight.current--;
        if (!inFlight.current) setSyncing(false);
        void invalidateRollups(queryClient, orgId);
      }
    });
    return chain.current;
  }, [projectId, data.buckets, data.people, queryClient, orgId]);
  const schedule = (delay: number) => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delay);
  };
  const setTasks = (value: TaskView[] | ((current: TaskView[]) => TaskView[]), delay = 700) => {
    if (!canEdit) {
      toast.error("You can view this project's tasks but not change them.");
      return;
    }
    if (!writable) {
      toast.error(READ_ONLY_TIP);
      return;
    }
    const next = typeof value === "function" ? value(latest.current) : value;
    latest.current = next;
    setTasksState(next);
    schedule(delay);
  };
  // Take the server's copy whenever nothing is waiting to be written (after a save, a reload,
  // or a failed save, which reset `saved` so the screen shows the database again).
  useEffect(() => {
    if (dirty.current || inFlight.current || timer.current) return;
    saved.current = data.tasks;
    latest.current = data.tasks;
    setTasksState(data.tasks);
  }, [data.tasks]);
  useEffect(() => {
    const off = router.subscribe("onBeforeNavigate", () => void flush());
    const hide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        void flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("beforeunload", leave);
    return () => {
      off();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("beforeunload", leave);
      void flush();
    };
  }, [router, flush]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("task");
    if (id && data.tasks.some((t) => t.id === id)) setOpenId(id);
  }, [data.tasks]);
  const commit = (next: TaskView[], text?: string, undo?: TaskView[]) => {
    setTasks(next, 0);
    if (text) setNotice({ text, undo });
  };
  const people = useMemo(() => data.people.map((p) => p.name).sort(), [data.people]);
  const buckets = useMemo(
    () => Array.from(new Set([...data.buckets.map((b) => b.name), ...tasks.map((t) => t.bucket)])),
    [data.buckets, tasks],
  );
  const find = (id: string) => tasks.find((t) => t.id === id);
  const blank = (ref: TaskView, parentId?: string): TaskView => ({
    id: tempId(),
    ref: "",
    status: "not_started",
    updatedAt: null,
    attachments: [],
    title: parentId ? "New subtask" : "New task",
    bucket: ref.bucket,
    assignees: [],
    start: ref.start,
    finish: ref.start,
    percentComplete: 0,
    priority: "Moderate" as Priority,
    isMilestone: false,
    checklistCount: 0,
    checklistItems: [],
    dependencies: [],
    labels: [],
    ...(parentId ? { parentId } : {}),
  });
  const prevTop = (id: string) => {
    const i = rows.findIndex((r) => r.task.id === id);
    for (let j = i - 1; j >= 0; j--) if (rows[j]!.depth === 0) return rows[j]!.task.id;
    return undefined;
  };
  const a: Actions = {
    canPaste: !!clip,
    collapsed,
    toggleCollapse: (id) =>
      setCollapsed((c) => {
        const n = new Set(c);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    canDemote: (id) => !kidsOf(tasks, id).length && !!prevTop(id),
    addSub: (id) => {
      const ref = find(id);
      if (!ref || ref.parentId) return;
      const kids = kidsOf(tasks, id);
      const last = kids.length
        ? tasks.findIndex((t) => t.id === kids[kids.length - 1]!.id)
        : tasks.findIndex((t) => t.id === id);
      const item = blank(ref, id);
      const next = [...tasks];
      next.splice(last + 1, 0, item);
      setCollapsed((c) => {
        const n = new Set(c);
        n.delete(id);
        return n;
      });
      commit(next, "Subtask added.", tasks);
      setOpenId(item.id);
    },
    demote: (id) => {
      const p = prevTop(id);
      if (!p || kidsOf(tasks, id).length) return;
      setCollapsed((c) => {
        const n = new Set(c);
        n.delete(p);
        return n;
      });
      commit(
        tasks.map((t) => (t.id === id ? { ...t, parentId: p } : t)),
        `Now a subtask of "${find(p)?.title}".`,
        tasks,
      );
    },
    promote: (id) => {
      const t = find(id);
      if (!t?.parentId) return;
      const pid = t.parentId;
      const base = tasks.filter((x) => x.id !== id);
      let last = base.findIndex((x) => x.id === pid);
      base.forEach((x, i) => {
        if (x.parentId === pid) last = Math.max(last, i);
      });
      const { parentId: _p, ...rest } = t;
      const next = [...base];
      next.splice(last + 1, 0, rest);
      commit(next, `"${t.title}" is now a main task.`, tasks);
    },
    open: (id) => setOpenId(id),
    cut: (id) => {
      const t = find(id);
      if (t) {
        setClip({ task: t, cut: true });
        setNotice({ text: `Cut "${t.title}". Choose Paste on another task to move it.` });
      }
    },
    copy: (id) => {
      const t = find(id);
      if (t) {
        setClip({ task: t, cut: false });
        setNotice({ text: `Copied "${t.title}".` });
      }
    },
    paste: (id) => {
      if (!clip) return;
      const base = clip.cut ? tasks.filter((t) => t.id !== clip.task.id) : tasks;
      const i = base.findIndex((t) => t.id === id);
      const ref = find(id);
      const par =
        ref?.parentId && clip.task.id !== ref.parentId && !kidsOf(tasks, clip.task.id).length
          ? ref.parentId
          : undefined;
      const { parentId: _x, ...clipBase } = clip.task;
      const item: TaskView = {
        ...(clip.cut
          ? clipBase
          : {
              ...clipBase,
              id: tempId(),
              ref: "",
              updatedAt: null,
              attachments: [],
              checklistItems: clipBase.checklistItems.map((c) => ({ ...c, id: tempId() })),
              title: `${clip.task.title} (copy)`,
              dependencies: [...clip.task.dependencies],
            }),
        ...(par ? { parentId: par } : {}),
      };
      const next = [...base];
      next.splice(i + 1, 0, item);
      commit(next, clip.cut ? `Moved "${item.title}".` : `Pasted "${item.title}".`, tasks);
      if (clip.cut) setClip(null);
    },
    insertAbove: (id) => {
      const ref = find(id);
      if (!ref) return;
      const i = tasks.findIndex((t) => t.id === id);
      const item = blank(ref, ref.parentId);
      const next = [...tasks];
      next.splice(i, 0, item);
      commit(next, "Task inserted.");
      setOpenId(item.id);
    },
    remove: (id) => setConfirm(id),
    link: (id) => {
      const url = `${window.location.origin}${window.location.pathname}?task=${id}`;
      navigator.clipboard?.writeText(url).catch(() => undefined);
      setNotice({ text: "Link copied." });
    },
    addDep: (id, dep) => {
      if (wouldLoop(tasks, id, dep))
        return setNotice({ text: "That would create a loop of dependencies." });
      commit(
        tasks.map((t) => (t.id === id ? { ...t, dependencies: [...t.dependencies, dep] } : t)),
        "Dependency added.",
      );
    },
    removeDep: (id, dep) =>
      commit(
        tasks.map((t) =>
          t.id === id ? { ...t, dependencies: t.dependencies.filter((d) => d !== dep) } : t,
        ),
        "Dependency removed.",
      ),
    toggle: (id) =>
      commit(
        tasks.map((t) =>
          t.id === id ? { ...t, percentComplete: t.percentComplete === 100 ? 0 : 100 } : t,
        ),
      ),
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || openId || view !== "grid") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "x") a.cut(selected);
      else if (mod && e.key === "c") a.copy(selected);
      else if (mod && e.key === "v") a.paste(selected);
      else if (e.key === "Delete") a.remove(selected);
      else if (e.key === "Enter") a.open(selected);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const open = openId ? find(openId) : undefined,
    confirmTask = confirm ? find(confirm) : undefined;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border bg-card p-0.5">
          {(["grid", "board", "timeline"] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "secondary" : "ghost"}
              onClick={() => setView(v)}
              className="capitalize"
            >
              {v}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2" role="status">
            {syncing ? (
              <LoaderCircle className="size-3.5 animate-spin text-primary" />
            ) : (
              <Check className="size-3.5 text-health-good" />
            )}
            {syncing
              ? "Saving…"
              : planner
                ? "Saved · Planner sync not connected yet"
                : "All changes saved"}
          </span>
          {taskSource === "Planner (Premium)" && (
            <span
              className="inline-flex items-center gap-1"
              title="Planner Premium calculates summary task dates and remaining effort, so they can only be changed in Planner."
            >
              <Lock className="size-3.5" />
              Some fields calculated by Planner
            </span>
          )}
          {planner && (
            <a
              href="https://planner.cloud.microsoft"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" />
              Open in Planner
            </a>
          )}
          {/* Plan › Tasks shows Issue task here; the project header hides its copy on this tab. */}
          <ReadOnlyTip readOnly={!writable}>
            <Button disabled={!writable} onClick={() => openIssueTask(projectId)}>
              <ListPlus />
              Issue task
            </Button>
          </ReadOnlyTip>
        </div>
      </div>
      {notice && (
        <div
          role="status"
          className="flex items-center justify-between rounded-md border bg-accent/40 px-3 py-2 text-sm"
        >
          <span>{notice.text}</span>
          <div className="flex gap-1">
            {notice.undo && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTasks(notice.undo!, 0);
                  setNotice(null);
                }}
              >
                Undo
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
            >
              <X />
            </Button>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Right-click a task, or use its ⋯ button, for subtasks, cut, copy, paste, dependencies and
        more.
      </p>
      {view === "grid" && (
        <GridView rows={rows} tasks={tasks} a={a} selected={selected} setSelected={setSelected} />
      )}
      {view === "timeline" && <TimelineView rows={rows} all={tasks} a={a} />}
      {view === "board" && (
        <BoardWorkspace
          key={tasks.map((t) => `${t.id}${t.bucket}${t.percentComplete}`).join()}
          title="Tasks"
          boardKey="project-tasks"
          manage={false}
          rows={tasksToRows(tasks)}
          columns={taskColumns}
          groupOptions={["group", "deliveryStatus", "priority"]}
          initialView="kanban"
          planner={false}
          onRowsChange={(rows) =>
            setTasks(
              (ts) =>
                ts.map((t) => {
                  const r = rows.find((x) => x.id === t.id);
                  return r ? { ...t, bucket: String(r.group ?? r.status ?? t.bucket) } : t;
                }),
              0,
            )
          }
        />
      )}
      {open && (
        <TaskPanel
          key={open.id}
          task={open}
          tasks={tasks}
          people={people}
          buckets={buckets}
          premium={taskSource === "Planner (Premium)"}
          a={a}
          update={(patch) =>
            setTasks((ts) => ts.map((t) => (t.id === open.id ? { ...t, ...patch } : t)))
          }
          close={() => setOpenId(null)}
        />
      )}
      {confirmTask && (
        <>
          <div className="fixed inset-0 z-50 bg-overlay" onClick={() => setConfirm(null)} />
          <div
            role="alertdialog"
            aria-label="Delete task"
            className="fixed left-1/2 top-1/3 z-50 w-full max-w-sm -translate-x-1/2 rounded-lg border bg-background p-5 shadow-xl"
          >
            <p className="font-semibold">Delete task?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              "{confirmTask.title}" will be removed, along with{" "}
              {kidsOf(tasks, confirmTask.id).length ? "its subtasks and " : ""}any dependencies on
              it.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  const prev = tasks;
                  const gone = new Set([
                    confirmTask.id,
                    ...kidsOf(tasks, confirmTask.id).map((k) => k.id),
                  ]);
                  commit(
                    tasks
                      .filter((t) => !gone.has(t.id))
                      .map((t) => ({
                        ...t,
                        dependencies: t.dependencies.filter((d) => !gone.has(d)),
                      })),
                    `Deleted "${confirmTask.title}".`,
                    prev,
                  );
                  if (openId === confirmTask.id) setOpenId(null);
                  setConfirm(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
