import { useSyncExternalStore } from "react";
import { todayIso } from "@/lib/today";
import { getSettings } from "./settings";
import {
  addDays,
  daysBetween,
  getProjectForecast,
  type ForecastInput,
  type ForecastOverrides,
  type ForecastResult,
  type VelocityBasis,
} from "./forecast";

/** Browser-local sprint & work-item store. One work item list per project feeds the backlog,
 *  sprint board, burn charts and forecasts. Shaped so a real backend can replace it later.
 *  Sprints stay in the browser until the sprints phase (schema §6). Each project's delivery
 *  data is keyed by its project code and generated deterministically from the project's
 *  Supabase record, which the screens register first (registerDeliveryProjects). */

/** What the generator needs to know about a project (from Supabase). */
export interface DeliveryProject {
  code: string;
  state: string;
  manager: string;
  taskSource: string;
  people: string[];
}
const registry = new Map<string, DeliveryProject>();
let currentUser = "You";
export function registerDeliveryProjects(list: DeliveryProject[]) {
  for (const project of list) registry.set(project.code, project);
}
export const isDeliveryRegistered = (code: string) => registry.has(code);
/** Name stamped on sprint events and justifications. */
export function setDeliveryUser(name: string) {
  currentUser = name || "You";
}

export type DeliveryApproach = "agile" | "waterfall" | "hybrid";
export type WorkUnit = "points" | "tasks" | "effort_hours";
export type ItemType = "story" | "task" | "bug" | "spike" | "milestone_task";
export type StatusCategory = "todo" | "wip" | "done";
export interface ProjectStatus {
  id: string;
  name: string;
  category: StatusCategory;
  sortOrder: number;
}
export interface WorkItem {
  id: string;
  title: string;
  itemType: ItemType;
  workstream: string;
  estimateUnits: number | null;
  statusId: string;
  sprintId: string | null;
  milestoneId?: string | undefined;
  assignee?: string | undefined;
  backlogRank: number;
  createdAt: string;
  doneAt: string | null;
  deletedAt?: string;
  source: "native" | "planner" | "import";
  externalId?: string;
}
export interface Sprint {
  id: string;
  name: string;
  goal: string;
  start: string;
  end: string;
  status: "planned" | "active" | "closed";
  capacityUnits: number;
  committedUnits?: number;
  completedUnits?: number;
  addedUnits?: number;
  removedUnits?: number;
  closedAt?: string;
}
export interface Commitment {
  sprintId: string;
  workItemId: string;
  unitsAtStart: number;
  addedAfterStart: boolean;
}
export interface WorkItemEvent {
  id: string;
  workItemId: string;
  field: "status" | "estimate" | "sprint" | "created" | "deleted";
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}
export interface DeliverySettings {
  approach: DeliveryApproach;
  workUnit: WorkUnit;
  sprintLengthDays: number;
  baselineScope: number;
  baselineStart: string;
  baselinePeriods: number;
  ragToleranceDays: number;
  planVelocity?: number | undefined;
}
export interface Justification {
  date: string;
  text: string;
  by: string;
}
export interface ProjectDelivery {
  settings: DeliverySettings;
  statuses: ProjectStatus[];
  items: WorkItem[];
  sprints: Sprint[];
  commitments: Commitment[];
  events: WorkItemEvent[];
  estimateDefaults: Partial<Record<ItemType, number>>;
  justifications: Justification[];
}
export interface NonWorkingPeriod {
  id: string;
  name: string;
  start: string;
  end: string;
}

export const TODAY = todayIso();
export const toDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
export const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = toDate(TODAY);

const defaultStatuses: ProjectStatus[] = [
  { id: "backlog", name: "Backlog", category: "todo", sortOrder: 0 },
  { id: "ready", name: "Ready", category: "todo", sortOrder: 1 },
  { id: "in-progress", name: "In Progress", category: "wip", sortOrder: 2 },
  { id: "in-review", name: "In Review", category: "wip", sortOrder: 3 },
  { id: "blocked", name: "Blocked", category: "wip", sortOrder: 4 },
  { id: "done", name: "Done", category: "done", sortOrder: 5 },
];
/** Until someone edits the list, closures are the organisation's holiday calendars (Settings). */
const fromHolidayCalendars = (): NonWorkingPeriod[] =>
  getSettings().workingTime.holidayCalendars.flatMap((calendar) =>
    calendar.dates.map((day, index) => {
      const iso = day.date.split("/").reverse().join("-");
      return { id: `hol-${calendar.id}-${index}`, name: day.name, start: iso, end: iso };
    }),
  );

// ---------- deterministic generator ----------
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const verbs = [
  "Configure",
  "Build",
  "Test",
  "Document",
  "Integrate",
  "Review",
  "Migrate",
  "Design",
  "Automate",
  "Validate",
];
const subjects = [
  "login flow",
  "FAQ intents",
  "handover to agent",
  "analytics dashboard",
  "accessibility audit",
  "data feed",
  "user roles",
  "reporting export",
  "notification rules",
  "search index",
  "content model",
  "SSO integration",
  "error handling",
  "load testing",
  "training material",
  "audit logging",
  "backup routine",
  "service catalogue entry",
];
const workstreams = ["Platform", "Integration", "Content", "Testing"];
const types: ItemType[] = ["story", "story", "story", "task", "bug", "spike"];
const chunks = [1, 2, 3, 5, 8];

function split(total: number, r: () => number) {
  const out: number[] = [];
  let left = Math.round(total);
  while (left > 0) {
    const pick = chunks[Math.floor(r() * chunks.length)]!;
    const size = Math.min(pick, left);
    out.push(size);
    left -= size;
  }
  return out;
}

interface Profile {
  completed: number[];
  growth: number;
  baselineScope: number;
  baselinePeriods: number;
  approach: DeliveryApproach;
  workUnit: WorkUnit;
  stale: boolean;
  active: boolean;
}
function profileFor(project: DeliveryProject): Profile {
  if (project.code === "EBB")
    return {
      completed: [22, 24, 26, 30, 38, 46],
      growth: 5,
      baselineScope: 480,
      baselinePeriods: 12,
      approach: "hybrid",
      workUnit: "points",
      stale: false,
      active: true,
    };
  const r = rng(hash(project.code));
  const closed = project.state === "Closed";
  const n = closed
    ? 6 + Math.floor(r() * 4)
    : project.state === "Proposed"
      ? Math.floor(r() * 3)
      : 2 + Math.floor(r() * 7);
  const base = 14 + Math.floor(r() * 24),
    trend = (r() - 0.35) * 2.5;
  const completed = Array.from({ length: n }, (_, i) =>
    Math.max(3, Math.round(base + trend * i + (r() - 0.5) * 6)),
  );
  const growth = Math.floor(r() * 4) + (r() > 0.9 ? 30 : 0);
  const done = completed.reduce((s, v) => s + v, 0);
  const periods = closed ? n : n + 3 + Math.floor(r() * 6);
  const avg = completed.slice(-3).reduce((s, v) => s + v, 0) / Math.max(1, Math.min(3, n)) || base;
  const baselineScope = closed
    ? Math.max(done - growth * n, 20)
    : Math.max(Math.round(avg * periods * (0.7 + r() * 0.4)), done + 30);
  const approach: DeliveryApproach = r() > 0.6 ? "waterfall" : r() > 0.5 ? "hybrid" : "agile";
  return {
    completed,
    growth: closed ? 0 : growth,
    baselineScope,
    baselinePeriods: periods,
    approach,
    workUnit: approach === "waterfall" ? "tasks" : "points",
    stale: !closed && r() > 0.82,
    active: !closed && project.state !== "Proposed",
  };
}

function generate(project: DeliveryProject): ProjectDelivery {
  const p = profileFor(project);
  const r = rng(hash(`${project.code}-items`));
  const people = project.people.length ? project.people : [project.manager];
  const len = 14,
    n = p.completed.length;
  const staleGap = p.stale ? 20 : 0;
  const start = addDays(today, -(n * len) - (p.active && !p.stale ? 6 : 0) - staleGap);
  const pEnd = (k: number) => addDays(start, k * len);
  const names = [
    project.manager,
    ...Array.from({ length: 4 }, () => people[Math.floor(r() * people.length)]!),
  ];
  const items: WorkItem[] = [];
  const events: WorkItemEvent[] = [];
  let rank = 0;
  const make = (units: number, created: Date, extra: Partial<WorkItem>) => {
    const id = `${project.code}-wi-${items.length + 1}`;
    const item: WorkItem = {
      id,
      title: `${verbs[Math.floor(r() * verbs.length)]} ${subjects[Math.floor(r() * subjects.length)]}`,
      itemType: p.workUnit === "tasks" ? "task" : types[Math.floor(r() * types.length)]!,
      workstream: workstreams[Math.floor(r() * workstreams.length)]!,
      estimateUnits: p.workUnit === "tasks" ? null : units,
      statusId: "backlog",
      sprintId: null,
      assignee: names[Math.floor(r() * names.length)],
      backlogRank: rank++,
      createdAt: toIso(created),
      doneAt: null,
      source: project.taskSource === "Native" ? "native" : "planner",
      ...extra,
    };
    items.push(item);
    events.push({
      id: `${id}-e0`,
      workItemId: id,
      field: "created",
      oldValue: "",
      newValue: item.title,
      changedBy: project.manager,
      changedAt: item.createdAt,
    });
    return item;
  };
  const unitsOf = (sizes: number[]) => (p.workUnit === "tasks" ? sizes.map(() => 1) : sizes);
  const sprints: Sprint[] = [];
  const commitments: Commitment[] = [];
  const agile = p.approach !== "waterfall";
  const baseCreated = addDays(start, -3);
  let baseUsed = 0;
  // closed periods
  for (let k = 0; k < n; k++) {
    const sprintId = agile ? `${project.code}-s${k + 1}` : null;
    const sizes =
      p.workUnit === "tasks"
        ? Array.from({ length: p.completed[k]! }, () => 1)
        : split(p.completed[k]!, r);
    for (const size of unitsOf(sizes)) {
      const doneDay = addDays(pEnd(k), 1 + Math.floor(r() * (len - 2)));
      make(size, baseCreated, { statusId: "done", sprintId, doneAt: toIso(doneDay) });
      baseUsed += size;
    }
    if (agile) {
      const carry = Math.round(r() * 8);
      sprints.push({
        id: sprintId!,
        name: `Sprint ${k + 1}`,
        goal: `Deliver ${subjects[k % subjects.length]} increment`,
        start: toIso(pEnd(k)),
        end: toIso(addDays(pEnd(k + 1), -1)),
        status: "closed",
        capacityUnits: Math.round(p.completed[k]! + carry + 4),
        committedUnits: p.completed[k]! + carry - p.growth,
        completedUnits: p.completed[k]!,
        addedUnits: p.growth,
        removedUnits: 0,
        closedAt: toIso(pEnd(k + 1)),
      });
    }
  }
  // scope growth items, created mid-period
  for (let k = 0; k < n; k++)
    for (const size of unitsOf(split(p.growth, r))) make(size, addDays(pEnd(k), 5), {});
  // active sprint
  if (agile && p.active && !p.stale) {
    const sprintId = `${project.code}-s${n + 1}`;
    const target = Math.round(
      p.completed.slice(-3).reduce((s, v) => s + v, 0) / Math.max(1, Math.min(3, n)) || 20,
    );
    const sprintStart = pEnd(n);
    sprints.push({
      id: sprintId,
      name: `Sprint ${n + 1}`,
      goal: "Close the gap on the baseline plan",
      start: toIso(sprintStart),
      end: toIso(addDays(pEnd(n + 1), -1)),
      status: "active",
      capacityUnits: target + 4,
    });
    let i = 0;
    for (const size of unitsOf(split(target, r))) {
      const phase = i++ % 5;
      const statusId =
        phase === 0 || phase === 3
          ? "done"
          : phase === 1
            ? "in-progress"
            : phase === 2
              ? i === 3 && project.code === "EBB"
                ? "blocked"
                : "in-review"
              : "ready";
      const item = make(size, baseCreated, {
        statusId,
        sprintId,
        doneAt: statusId === "done" ? toIso(addDays(sprintStart, 1 + (i % 5))) : null,
      });
      baseUsed += size;
      commitments.push({
        sprintId,
        workItemId: item.id,
        unitsAtStart: size,
        addedAfterStart: false,
      });
      if (statusId === "blocked")
        events.push({
          id: `${item.id}-eb`,
          workItemId: item.id,
          field: "status",
          oldValue: "in-progress",
          newValue: "blocked",
          changedBy: project.manager,
          changedAt: toIso(addDays(today, -15)),
        });
    }
    sprints.push({
      id: `${project.code}-s${n + 2}`,
      name: `Sprint ${n + 2}`,
      goal: "",
      start: toIso(pEnd(n + 1)),
      end: toIso(addDays(pEnd(n + 2), -1)),
      status: "planned",
      capacityUnits: target + 4,
    });
  }
  // remaining baseline backlog
  const left = Math.max(0, p.baselineScope - baseUsed);
  for (const size of unitsOf(
    p.workUnit === "tasks" ? Array.from({ length: left }, () => 1) : split(left, r),
  ))
    make(size, baseCreated, {});
  return {
    settings: {
      approach: p.approach,
      workUnit: p.workUnit,
      sprintLengthDays: len,
      baselineScope: p.baselineScope,
      baselineStart: toIso(start),
      baselinePeriods: p.baselinePeriods,
      ragToleranceDays: 14,
    },
    statuses: defaultStatuses.map((s) => ({ ...s })),
    items,
    sprints,
    commitments,
    events,
    estimateDefaults: { story: 2, bug: 1, task: 1, spike: 1, milestone_task: 1 },
    justifications: [],
  };
}

// ---------- store ----------
// v2: keyed by project code (v1 used prototype project ids).
const KEY = "virtual-pmo-delivery-v2";
const cache = new Map<string, ProjectDelivery>();
let saved: { projects: Record<string, ProjectDelivery>; nonWorking?: NonWorkingPeriod[] } = {
  projects: {},
};
let nonWorking: NonWorkingPeriod[] | null = null;
let loaded = false,
  version = 0;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = { projects: {}, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  for (const [id, data] of Object.entries(saved.projects)) cache.set(id, data);
  if (saved.nonWorking) nonWorking = saved.nonWorking;
}
function commit(projectId?: string) {
  if (projectId) saved.projects[projectId] = cache.get(projectId)!;
  if (nonWorking) saved.nonWorking = nonWorking;
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* ignore */
  }
  version += 1;
  listeners.forEach((l) => l());
}
export function useDeliveryVersion() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0,
  );
}
export function resetDelivery(projectId: string) {
  cache.delete(projectId);
  delete saved.projects[projectId];
  commit();
}

export function getDelivery(projectId: string): ProjectDelivery {
  load();
  let data = cache.get(projectId);
  if (!data) {
    const project = registry.get(projectId);
    if (!project) throw new Error(`Unknown project ${projectId}`);
    data = generate(project);
    cache.set(projectId, data);
  }
  return data;
}
export const getNonWorkingPeriods = () => {
  load();
  return nonWorking ?? fromHolidayCalendars();
};
export function saveNonWorkingPeriods(list: NonWorkingPeriod[]) {
  nonWorking = list;
  commit();
}

// ---------- derived helpers ----------
export const statusOf = (d: ProjectDelivery, item: WorkItem) =>
  d.statuses.find((s) => s.id === item.statusId) ?? d.statuses[0]!;
export const isDone = (d: ProjectDelivery, item: WorkItem) => statusOf(d, item).category === "done";
export function effectiveUnits(d: ProjectDelivery, item: WorkItem) {
  if (d.settings.workUnit === "tasks") return 1;
  return item.estimateUnits ?? d.estimateDefaults[item.itemType] ?? 1;
}
export const liveItems = (d: ProjectDelivery) => d.items.filter((i) => !i.deletedAt);
export const unitLabel = (d: ProjectDelivery) =>
  d.settings.workUnit === "points" ? "pts" : d.settings.workUnit === "tasks" ? "tasks" : "hrs";
export const activeSprint = (d: ProjectDelivery) => d.sprints.find((s) => s.status === "active");
export const periodEndDate = (d: ProjectDelivery, k: number) =>
  addDays(toDate(d.settings.baselineStart), k * d.settings.sprintLengthDays);

export function closedPeriodCount(d: ProjectDelivery) {
  if (d.settings.approach !== "waterfall" && d.sprints.length)
    return d.sprints.filter((s) => s.status === "closed").length;
  return Math.max(
    0,
    Math.floor(daysBetween(toDate(d.settings.baselineStart), today) / d.settings.sprintLengthDays),
  );
}
export function scopeAt(d: ProjectDelivery, when: Date) {
  return d.items
    .filter((i) => toDate(i.createdAt) < when && (!i.deletedAt || toDate(i.deletedAt) >= when))
    .reduce((s, i) => s + effectiveUnits(d, i), 0);
}
export function doneBetween(d: ProjectDelivery, from: Date, to: Date) {
  return liveItems(d)
    .filter((i) => i.doneAt && toDate(i.doneAt) >= from && toDate(i.doneAt) < to)
    .reduce((s, i) => s + effectiveUnits(d, i), 0);
}

export function forecastInputFor(
  d: ProjectDelivery,
  periods = closedPeriodCount(d),
): ForecastInput {
  const completed: number[] = [],
    scopeHistory: number[] = [];
  for (let k = 0; k < periods; k++) {
    completed.push(
      doneBetween(d, k === 0 ? new Date(0) : periodEndDate(d, k), periodEndDate(d, k + 1)),
    );
    scopeHistory.push(scopeAt(d, periodEndDate(d, k + 1)));
  }
  return {
    baselineStart: toDate(d.settings.baselineStart),
    periodLengthDays: d.settings.sprintLengthDays,
    baselinePeriods: d.settings.baselinePeriods,
    baselineScope: d.settings.baselineScope,
    completed,
    scopeHistory,
    planVelocity: d.settings.planVelocity,
    ragToleranceDays: d.settings.ragToleranceDays,
  };
}
export function getForecastFor(
  projectId: string,
  basis: VelocityBasis = "rolling3",
  overrides: ForecastOverrides = {},
): ForecastResult {
  return getProjectForecast(forecastInputFor(getDelivery(projectId)), basis, overrides);
}

export function forecastHistory(projectId: string) {
  const d = getDelivery(projectId);
  const n = closedPeriodCount(d);
  const out: {
    date: Date;
    finish: Date | null;
    rag: ForecastResult["evidencedRag"];
    status: ForecastResult["deliveryStatus"];
  }[] = [];
  for (let k = 1; k <= n; k++) {
    const f = getProjectForecast(forecastInputFor(d, k));
    out.push({
      date: periodEndDate(d, k),
      finish: f.forecastFinishDate,
      rag: f.evidencedRag,
      status: f.deliveryStatus,
    });
  }
  return out;
}
export function lastActivity(d: ProjectDelivery) {
  let max = toDate(d.settings.baselineStart);
  for (const i of d.items)
    for (const v of [i.createdAt, i.doneAt, i.deletedAt])
      if (v && toDate(v) > max && toDate(v) <= today) max = toDate(v);
  for (const e of d.events)
    if (toDate(e.changedAt) > max && toDate(e.changedAt) <= today) max = toDate(e.changedAt);
  return max;
}
export const isStale = (d: ProjectDelivery) => daysBetween(lastActivity(d), today) >= 14;

export function workingDays(from: Date, to: Date) {
  const days: Date[] = [];
  const closures = getNonWorkingPeriods();
  for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
    const dow = day.getDay();
    const iso = toIso(day);
    if (dow === 0 || dow === 6 || closures.some((c) => iso >= c.start && iso <= c.end)) continue;
    days.push(new Date(day));
  }
  return days;
}
export function sprintCommittedUnits(d: ProjectDelivery, sprint: Sprint) {
  return d.commitments
    .filter((c) => c.sprintId === sprint.id)
    .reduce((s, c) => s + c.unitsAtStart, 0);
}
export function sprintUnits(d: ProjectDelivery, sprintId: string) {
  return liveItems(d)
    .filter((i) => i.sprintId === sprintId)
    .reduce((s, i) => s + effectiveUnits(d, i), 0);
}

// ---------- mutations ----------
function now() {
  return TODAY;
}
function log(
  d: ProjectDelivery,
  item: WorkItem,
  field: WorkItemEvent["field"],
  oldValue: unknown,
  newValue: unknown,
) {
  d.events.push({
    id: `${item.id}-e${d.events.length}-${Date.now()}`,
    workItemId: item.id,
    field,
    oldValue: String(oldValue ?? ""),
    newValue: String(newValue ?? ""),
    changedBy: currentUser,
    changedAt: now(),
  });
}

export function updateItem(projectId: string, itemId: string, patch: Partial<WorkItem>) {
  const d = getDelivery(projectId);
  const item = d.items.find((i) => i.id === itemId);
  if (!item) return;
  if (patch.statusId !== undefined && patch.statusId !== item.statusId) {
    log(d, item, "status", item.statusId, patch.statusId);
    const toDone = d.statuses.find((s) => s.id === patch.statusId)?.category === "done";
    patch.doneAt = toDone ? (item.doneAt ?? now()) : null;
  }
  if (patch.estimateUnits !== undefined && patch.estimateUnits !== item.estimateUnits)
    log(d, item, "estimate", item.estimateUnits, patch.estimateUnits);
  if (patch.sprintId !== undefined && patch.sprintId !== item.sprintId) {
    log(d, item, "sprint", item.sprintId, patch.sprintId);
    const target = d.sprints.find((s) => s.id === patch.sprintId);
    if (
      target?.status === "active" &&
      !d.commitments.some((c) => c.sprintId === target.id && c.workItemId === item.id)
    )
      d.commitments.push({
        sprintId: target.id,
        workItemId: item.id,
        unitsAtStart: effectiveUnits(d, item),
        addedAfterStart: true,
      });
  }
  Object.assign(item, patch);
  commit(projectId);
}
export function addItem(projectId: string, title: string, extra: Partial<WorkItem> = {}) {
  const d = getDelivery(projectId);
  const item: WorkItem = {
    id: `${projectId}-wi-${Date.now().toString(36)}`,
    title,
    itemType: d.settings.workUnit === "tasks" ? "task" : "story",
    workstream: "Platform",
    estimateUnits: null,
    statusId: "backlog",
    sprintId: null,
    backlogRank: Math.max(0, ...d.items.map((i) => i.backlogRank)) + 1,
    createdAt: now(),
    doneAt: null,
    source: "native",
    ...extra,
  };
  d.items.push(item);
  log(d, item, "created", "", title);
  const sprint = d.sprints.find((s) => s.id === item.sprintId);
  if (sprint?.status === "active")
    d.commitments.push({
      sprintId: sprint.id,
      workItemId: item.id,
      unitsAtStart: effectiveUnits(d, item),
      addedAfterStart: true,
    });
  commit(projectId);
  return item;
}
export function deleteItem(projectId: string, itemId: string) {
  const d = getDelivery(projectId);
  const item = d.items.find((i) => i.id === itemId);
  if (!item) return;
  item.deletedAt = now();
  log(d, item, "deleted", item.title, "");
  commit(projectId);
}
export function reorderItem(projectId: string, itemId: string, beforeId: string | null) {
  const d = getDelivery(projectId);
  const ordered = [...d.items]
    .sort((a, b) => a.backlogRank - b.backlogRank)
    .filter((i) => i.id !== itemId);
  const moving = d.items.find((i) => i.id === itemId);
  if (!moving) return;
  const index = beforeId ? ordered.findIndex((i) => i.id === beforeId) : ordered.length;
  ordered.splice(index < 0 ? ordered.length : index, 0, moving);
  ordered.forEach((item, i) => {
    item.backlogRank = i;
  });
  commit(projectId);
}
export function saveSettings(projectId: string, patch: Partial<DeliverySettings>) {
  const d = getDelivery(projectId);
  Object.assign(d.settings, patch);
  commit(projectId);
}
export function createSprint(projectId: string) {
  const d = getDelivery(projectId);
  const last = [...d.sprints].sort((a, b) => a.end.localeCompare(b.end)).at(-1);
  const start = last ? addDays(toDate(last.end), 1) : today;
  const sprint: Sprint = {
    id: `${projectId}-s-${Date.now().toString(36)}`,
    name: `Sprint ${d.sprints.length + 1}`,
    goal: "",
    start: toIso(start),
    end: toIso(addDays(start, d.settings.sprintLengthDays - 1)),
    status: "planned",
    capacityUnits: last?.capacityUnits ?? 30,
  };
  d.sprints.push(sprint);
  commit(projectId);
  return sprint;
}
export function updateSprint(projectId: string, sprintId: string, patch: Partial<Sprint>) {
  const d = getDelivery(projectId);
  const s = d.sprints.find((x) => x.id === sprintId);
  if (s) {
    Object.assign(s, patch);
    commit(projectId);
  }
}
export function startSprint(projectId: string, sprintId: string): string | null {
  const d = getDelivery(projectId);
  if (activeSprint(d)) return "Close the active sprint before starting another.";
  const sprint = d.sprints.find((s) => s.id === sprintId);
  if (!sprint) return "Sprint not found.";
  sprint.status = "active";
  d.commitments = d.commitments.filter((c) => c.sprintId !== sprintId);
  for (const item of liveItems(d).filter((i) => i.sprintId === sprintId))
    d.commitments.push({
      sprintId,
      workItemId: item.id,
      unitsAtStart: effectiveUnits(d, item),
      addedAfterStart: false,
    });
  commit(projectId);
  return null;
}
export function closeSprint(projectId: string, sprintId: string, carryOver: "next" | "backlog") {
  const d = getDelivery(projectId);
  const sprint = d.sprints.find((s) => s.id === sprintId);
  if (!sprint) return;
  const commits = d.commitments.filter((c) => c.sprintId === sprintId);
  const items = liveItems(d).filter((i) => i.sprintId === sprintId);
  sprint.committedUnits = commits
    .filter((c) => !c.addedAfterStart)
    .reduce((s, c) => s + c.unitsAtStart, 0);
  sprint.addedUnits = commits
    .filter((c) => c.addedAfterStart)
    .reduce((s, c) => s + c.unitsAtStart, 0);
  sprint.removedUnits = commits
    .filter((c) => {
      const it = d.items.find((i) => i.id === c.workItemId);
      return !it || it.deletedAt || it.sprintId !== sprintId;
    })
    .reduce((s, c) => s + c.unitsAtStart, 0);
  sprint.completedUnits = items
    .filter((i) => isDone(d, i))
    .reduce((s, i) => s + effectiveUnits(d, i), 0);
  sprint.status = "closed";
  sprint.closedAt = now();
  let next = d.sprints
    .filter((s) => s.status === "planned")
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (carryOver === "next" && !next) next = createSprint(projectId);
  for (const item of items.filter((i) => !isDone(d, i))) {
    const target = carryOver === "next" ? next!.id : null;
    log(d, item, "sprint", item.sprintId, target);
    item.sprintId = target;
    if (!target) item.statusId = "backlog";
  }
  commit(projectId);
}
export function addJustification(projectId: string, text: string) {
  const d = getDelivery(projectId);
  d.justifications.unshift({ date: TODAY, text, by: currentUser });
  commit(projectId);
}
