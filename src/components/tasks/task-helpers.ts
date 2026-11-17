import type { Priority, Task } from "@/data/types";

export const toDate = (s: string) => {
  const [d, m, y] = s.split("/").map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
};
export const fromDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
export const toIso = (s: string) => s.split("/").reverse().join("-");
export const fromIso = (s: string) => s.split("-").reverse().join("/");
export const DAY = 86400000;
export const initials = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
export const priorities: Priority[] = ["Low", "Moderate", "High", "Critical"] as Priority[];
export const checklistOf = (t: Task) =>
  t.checklistItems ??
  (
    t.checklist ??
    Array.from({ length: Math.min(t.checklistCount, 4) }, (_, i) => `Checklist item ${i + 1}`)
  ).map((label, i) => ({
    id: `${t.id}-c${i}`,
    label,
    done:
      t.percentComplete === 100 ||
      i < Math.round((Math.min(t.checklistCount, 4) * t.percentComplete) / 100),
  }));
export const wouldLoop = (tasks: Task[], from: string, dep: string) => {
  const seen = new Set<string>();
  const walk = (id: string): boolean => {
    if (id === from) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (tasks.find((t) => t.id === id)?.dependencies ?? []).some(walk);
  };
  return walk(dep);
};
export type Row = { task: Task; depth: number; kids: number };
export const kidsOf = (tasks: Task[], id: string) => tasks.filter((t) => t.parentId === id);
/** Parents in list order, each followed by its subtasks; parent dates and % roll up from subtasks. */
export function buildRows(tasks: Task[], collapsed: Set<string>): Row[] {
  const ids = new Set(tasks.map((t) => t.id));
  const out: Row[] = [];
  for (const t of tasks) {
    if (t.parentId && ids.has(t.parentId)) continue;
    const kids = kidsOf(tasks, t.id);
    let task = t;
    if (kids.length) {
      const s = Math.min(...kids.map((k) => toDate(k.start).getTime())),
        f = Math.max(...kids.map((k) => toDate(k.finish).getTime()));
      task = {
        ...t,
        start: fromDate(new Date(s)),
        finish: fromDate(new Date(f)),
        percentComplete: Math.round(kids.reduce((n, k) => n + k.percentComplete, 0) / kids.length),
      };
    }
    out.push({ task, depth: 0, kids: kids.length });
    if (!collapsed.has(t.id)) kids.forEach((k) => out.push({ task: k, depth: 1, kids: 0 }));
  }
  return out;
}
