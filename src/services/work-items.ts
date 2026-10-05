// Project tasks (work_items) on Supabase.
//
// The task screen (grid, board, timeline, details panel) edits a list of tasks in memory and
// hands this service the before and after lists. `saveTaskChanges` works out what changed and
// writes only that:
//   - a task with a temporary id is inserted; a real id that reappears (undo) is restored,
//   - a task that disappeared is soft-deleted (deleted_at): clients never hard-delete,
//   - changed fields are one update per task, guarded by its updated_at (optimistic concurrency),
//   - assignees, dependencies (work_item_links) and checklist items are diffed row by row,
//   - list order is backlog_rank, renumbered only where it moved.
// Reads come from v_work_items (delivery status, checklist counts) plus the child tables, each
// filtered by project in parallel: views can't be embedded.
import type { Database } from "@/integrations/supabase/types";
import type { Priority, Task, TaskSource } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import { todayIso } from "@/lib/today";
import { listPeople, type Person } from "./hierarchy";
import { priorityLabel, priorityValue } from "./labels";
import { unwrap } from "./service-error";
import { deleteWhere, insertRow, insertRows, updateRow, deleteRows } from "./write";

type Enums = Database["public"]["Enums"];

export const taskSourceLabel: Record<Enums["task_source"], TaskSource> = {
  native: "Native",
  planner_basic: "Planner (Basic)",
  planner_premium: "Planner (Premium)",
};
export const toTaskSource = (value: string | null | undefined): TaskSource =>
  taskSourceLabel[value as Enums["task_source"]] ?? "Native";

export interface TaskView extends Task {
  ref: string;
  status: Enums["work_item_status"];
  updatedAt: string | null;
  attachments: string[];
  checklistItems: { id: string; label: string; done: boolean }[];
}

export interface ProjectTasks {
  tasks: TaskView[];
  buckets: { id: string; name: string }[];
  people: Person[];
}

const TEMP_PREFIX = "new-";
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);
export const tempId = () => `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export async function loadProjectTasks(orgId: string, projectId: string): Promise<ProjectTasks> {
  const [items, assignees, links, checklist, attachments, buckets, people] = await Promise.all([
    supabase
      .from("v_work_items")
      .select(
        "id, ref, title, description, item_type, status, bucket_id, parent_id, priority, start_date, finish_date, baseline_finish_date, percent_complete, estimated_effort_hours, effort_completed_hours, labels, backlog_rank, updated_at",
      )
      .eq("project_id", projectId)
      .order("backlog_rank"),
    supabase
      .from("work_item_assignees")
      .select("work_item_id, resource_id")
      .eq("project_id", projectId),
    supabase
      .from("work_item_links")
      .select("predecessor_id, successor_id")
      .eq("project_id", projectId),
    supabase
      .from("work_item_checklist_items")
      .select("id, work_item_id, label, is_done, sort_order")
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("work_item_attachments")
      .select("work_item_id, file_name")
      .eq("project_id", projectId)
      .order("created_at"),
    supabase
      .from("project_buckets")
      .select("id, name, sort_order")
      .eq("project_id", projectId)
      .order("sort_order"),
    listPeople(orgId),
  ]);
  const names = new Map(people.map((person) => [person.id, person.name]));
  const bucketRows = unwrap(buckets, "Loading buckets");
  const bucketName = new Map(bucketRows.map((row) => [row.id, row.name]));
  const group = <T extends { work_item_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) map.set(row.work_item_id, [...(map.get(row.work_item_id) ?? []), row]);
    return map;
  };
  const assigneesBy = group(unwrap(assignees, "Loading task assignees"));
  const checklistBy = group(unwrap(checklist, "Loading checklists"));
  const attachmentsBy = group(unwrap(attachments, "Loading attachments"));
  const linkRows = unwrap(links, "Loading task dependencies");
  const today = todayIso();
  const tasks = unwrap(items, "Loading tasks").map((row): TaskView => {
    const id = row.id ?? "";
    const start = row.start_date ?? row.finish_date ?? today;
    const finish = row.finish_date ?? start;
    const items = (checklistBy.get(id) ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      done: item.is_done,
    }));
    return {
      id,
      ref: row.ref ?? "",
      title: row.title ?? "",
      bucket: (row.bucket_id && bucketName.get(row.bucket_id)) || "Unassigned",
      assignees: (assigneesBy.get(id) ?? []).map((item) => names.get(item.resource_id) ?? ""),
      start: fromIsoDate(start),
      finish: fromIsoDate(finish),
      ...(row.baseline_finish_date && { baselineFinish: fromIsoDate(row.baseline_finish_date) }),
      percentComplete: row.percent_complete ?? (row.status === "done" ? 100 : 0),
      ...(row.estimated_effort_hours != null && {
        estimatedEffortHours: Number(row.estimated_effort_hours),
      }),
      ...(row.effort_completed_hours != null && {
        effortCompletedHours: Number(row.effort_completed_hours),
      }),
      priority: priorityLabel[row.priority ?? "moderate"],
      isMilestone: row.item_type === "milestone_task",
      checklistCount: items.length,
      checklistItems: items,
      dependencies: linkRows
        .filter((link) => link.successor_id === id)
        .map((link) => link.predecessor_id),
      ...(row.description != null && { notes: row.description }),
      labels: row.labels ?? [],
      ...(row.parent_id && { parentId: row.parent_id }),
      status: row.status ?? "not_started",
      updatedAt: row.updated_at,
      attachments: (attachmentsBy.get(id) ?? []).map((item) => item.file_name),
    };
  });
  return {
    tasks,
    buckets: bucketRows.map((row) => ({ id: row.id, name: row.name })),
    people,
  };
}

/** Work status that follows % complete, keeping issued/blocked/cancelled unless the task is done. */
export function statusFor(task: Task, current: Enums["work_item_status"] | undefined) {
  if (task.percentComplete >= 100) return "done" as const;
  if (current && ["issued", "blocked", "cancelled"].includes(current)) return current;
  return task.percentComplete > 0 ? ("in_progress" as const) : ("not_started" as const);
}

const iso = (value: string | undefined) => (value ? (toIsoDate(value) ?? null) : null);

function fieldsOf(
  task: Task,
  context: { bucketId: (name: string) => string | null; status?: Enums["work_item_status"] },
) {
  return {
    title: task.title.trim() || "Untitled task",
    description: task.notes ?? null,
    item_type: task.isMilestone ? ("milestone_task" as const) : ("task" as const),
    bucket_id: context.bucketId(task.bucket),
    parent_id: task.parentId && !isTempId(task.parentId) ? task.parentId : null,
    priority: priorityValue[task.priority as Priority] ?? "moderate",
    start_date: iso(task.start),
    finish_date: iso(task.finish),
    percent_complete: Math.max(0, Math.min(100, Math.round(task.percentComplete))),
    status: statusFor(task, context.status),
    estimated_effort_hours: task.estimatedEffortHours ?? null,
    effort_completed_hours: task.effortCompletedHours ?? null,
    labels: task.labels ?? [],
  };
}
type Fields = ReturnType<typeof fieldsOf>;

/** Only the fields that differ (so an edit never rewrites what someone else just changed). */
function changedFields(before: Fields, after: Fields) {
  const patch: Partial<Fields> = {};
  for (const key of Object.keys(after) as (keyof Fields)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      (patch as Record<string, unknown>)[key] = after[key];
  }
  return patch;
}

export interface SaveResult {
  /** Temporary id → database id for tasks inserted by this save. */
  ids: Map<string, string>;
  /** New updated_at per task written. */
  updatedAt: Map<string, string | null>;
  /** Temporary checklist item id → database id. */
  checklistIds: Map<string, string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Write the difference between two task lists for one project. `prev` is what the database
 * holds (as last loaded or saved), `next` is the screen's list.
 */
export async function saveTaskChanges(input: {
  projectId: string;
  buckets: { id: string; name: string }[];
  people: Person[];
  prev: TaskView[];
  next: TaskView[];
}): Promise<SaveResult> {
  const { projectId, prev, next } = input;
  const ids = new Map<string, string>();
  const updatedAt = new Map<string, string | null>();
  const checklistIds = new Map<string, string>();
  const resolve = (id: string) => ids.get(id) ?? id;
  const bucketId = (name: string) =>
    input.buckets.find((bucket) => bucket.name === name)?.id ?? null;
  const personId = new Map(input.people.map((person) => [person.name, person.id]));
  const before = new Map(prev.map((task) => [task.id, task]));
  const after = new Set(next.map((task) => task.id));

  // 1. Removed tasks are soft-deleted (subtasks go with their parent on screen already).
  for (const task of prev.filter((item) => !after.has(item.id))) {
    const written = await updateRow(
      "work_items",
      task.id,
      { deleted_at: new Date().toISOString() },
      { context: `Deleting "${task.title}"`, lastSeen: task.updatedAt },
    );
    updatedAt.set(task.id, written.updatedAt);
  }

  // 2. New tasks: parents first so subtasks can point at them. Restored ones are undeleted.
  const ordered = [...next].sort(
    (a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)),
  );
  for (const task of ordered.filter((item) => !before.has(item.id))) {
    const fields = fieldsOf(
      { ...task, ...(task.parentId && { parentId: resolve(task.parentId) }) },
      { bucketId },
    );
    if (isTempId(task.id)) {
      const written = await insertRow(
        "work_items",
        { ...fields, project_id: projectId, backlog_rank: 0 },
        "Adding the task",
      );
      ids.set(task.id, written.id);
      updatedAt.set(task.id, written.updatedAt);
    } else {
      const written = await updateRow(
        "work_items",
        task.id,
        { ...fields, deleted_at: null },
        { context: `Restoring "${task.title}"` },
      );
      updatedAt.set(task.id, written.updatedAt);
    }
  }

  // 3. Changed fields on tasks that were already there.
  for (const task of next.filter((item) => before.has(item.id))) {
    const old = before.get(task.id)!;
    const patch = changedFields(
      fieldsOf(old, { bucketId, status: old.status }),
      fieldsOf(
        { ...task, ...(task.parentId && { parentId: resolve(task.parentId) }) },
        {
          bucketId,
          status: old.status,
        },
      ),
    );
    if (!Object.keys(patch).length) continue;
    const written = await updateRow("work_items", task.id, patch, {
      context: `Saving "${task.title}"`,
      lastSeen: old.updatedAt,
    });
    updatedAt.set(task.id, written.updatedAt);
  }

  // 4. Assignees, dependencies and checklist items.
  for (const task of next) {
    const id = resolve(task.id);
    const old = before.get(task.id);
    const oldNames = new Set(old?.assignees ?? []);
    const newNames = new Set(task.assignees);
    const added = task.assignees.filter((name) => !oldNames.has(name) && personId.has(name));
    await insertRows(
      "work_item_assignees",
      added.map((name) => ({
        work_item_id: id,
        project_id: projectId,
        resource_id: personId.get(name)!,
      })),
      "Assigning the task",
    );
    for (const name of [...oldNames].filter((item) => !newNames.has(item) && personId.has(item)))
      await deleteWhere(
        "work_item_assignees",
        { work_item_id: id, resource_id: personId.get(name)! },
        "Removing the assignee",
      );

    const oldDeps = new Set(old?.dependencies ?? []);
    const newDeps = task.dependencies.map(resolve);
    await insertRows(
      "work_item_links",
      newDeps
        .filter((dep) => !oldDeps.has(dep) && !isTempId(dep))
        .map((dep) => ({ predecessor_id: dep, successor_id: id, project_id: projectId })),
      "Adding the dependency",
    );
    for (const dep of [...oldDeps].filter((item) => !newDeps.includes(item)))
      await deleteWhere(
        "work_item_links",
        { predecessor_id: dep, successor_id: id },
        "Removing the dependency",
      );

    const oldItems = new Map((old?.checklistItems ?? []).map((item) => [item.id, item]));
    const newItems = task.checklistItems ?? [];
    await deleteRows(
      "work_item_checklist_items",
      [...oldItems.keys()].filter(
        (key) => UUID.test(key) && !newItems.some((item) => item.id === key),
      ),
      "Removing checklist items",
    );
    for (const [index, item] of newItems.entries()) {
      const existing = oldItems.get(item.id);
      if (!existing) {
        const written = await insertRow(
          "work_item_checklist_items",
          {
            work_item_id: id,
            project_id: projectId,
            label: item.label,
            is_done: item.done,
            sort_order: index,
          },
          "Adding the checklist item",
        );
        checklistIds.set(item.id, written.id);
      } else if (existing.label !== item.label || existing.done !== item.done)
        await updateRow(
          "work_item_checklist_items",
          item.id,
          { label: item.label, is_done: item.done },
          { context: "Saving the checklist item" },
        );
    }
  }

  // 5. Order: renumber backlog_rank where the sequence changed.
  const prevOrder = prev.map((task) => task.id).filter((id) => after.has(id));
  const nextOrder = next.map((task) => task.id);
  const moved =
    nextOrder.length !== prevOrder.length || nextOrder.some((id, index) => prevOrder[index] !== id);
  if (moved)
    for (const [index, task] of next.entries()) {
      const prevIndex = prevOrder.indexOf(task.id);
      if (prevIndex === index && !isTempId(task.id) && before.has(task.id)) continue;
      const written = await updateRow(
        "work_items",
        resolve(task.id),
        { backlog_rank: index + 1 },
        { context: "Reordering tasks" },
      );
      updatedAt.set(task.id, written.updatedAt);
    }

  return { ids, updatedAt, checklistIds };
}
