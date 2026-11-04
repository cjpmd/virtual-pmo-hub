// The notification feed, worked out from live data the user can see (there is no
// notifications table yet): their overdue tasks, work issued to them awaiting a response,
// decisions past needed-by, overdue measurements on benefits they own and off-track
// dependencies. Read state is a per-browser convenience, shared by the bell and the page.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useMeasurementsDue } from "@/hooks/use-benefits";
import { useDependencies } from "@/hooks/use-dependencies";
import { useGovernance } from "@/hooks/use-governance";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { useIssuedTasks } from "@/hooks/use-issued-tasks";
import { usePortfolioTasks } from "@/hooks/use-work-items";
import { todayIso } from "@/lib/today";
import { measurementDaysOverdue } from "@/services/benefits-value";

export interface FeedItem {
  id: string;
  date: string;
  kind: string;
  text: string;
  channel: "In-app";
}

const READ_KEY = "virtual-pmo-notifications-read";
const listeners = new Set<() => void>();
let cache: string[] | null = null;
const readIds = (): string[] => {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(READ_KEY) ?? "[]") as string[];
  } catch {
    cache = [];
  }
  return cache;
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const EMPTY: string[] = [];

export function useNotifications() {
  const me = useMyResourceId();
  const tasks = usePortfolioTasks().data?.tasks;
  const issued = useIssuedTasks().data?.items;
  const decisions = useGovernance().data?.decisions;
  // Only the measures on the user's own benefits, not the full benefits set: the bell runs on
  // every page.
  const measurements = useMeasurementsDue(me).data;
  const dependencies = useDependencies().data?.dependencies;
  const read = useSyncExternalStore(subscribe, readIds, () => EMPTY);
  const feed = useMemo((): FeedItem[] => {
    const today = todayIso();
    const items: FeedItem[] = [];
    const byProject = new Map<string, number>();
    for (const task of tasks ?? [])
      if (me && task.assigneeIds.includes(me) && task.deliveryStatus === "Overdue")
        byProject.set(task.projectName, (byProject.get(task.projectName) ?? 0) + 1);
    for (const [project, count] of byProject)
      items.push({
        id: `overdue:${project}`,
        date: today,
        kind: "Overdue alert",
        text: `${count} of your ${project} task${count === 1 ? " is" : "s are"} overdue.`,
        channel: "In-app",
      });
    for (const item of (issued ?? []).filter(
      (entry) => entry.assigneeId === me && entry.status === "Issued",
    ))
      items.push({
        id: `issued:${item.offerId}`,
        date: item.issuedAt.slice(0, 10),
        kind: "Approval request",
        text: `${item.issuer} issued you “${item.title}” (${item.projectName}). Accept, decline or propose a date.`,
        channel: "In-app",
      });
    for (const decision of (decisions ?? []).filter(
      (entry) => entry.status === "Pending" && entry.overdue,
    ))
      items.push({
        id: `decision:${decision.id}`,
        date: decision.neededBy,
        kind: "Decision",
        text: `${decision.reference} passed its needed-by date and is still pending at ${decision.forum}.`,
        channel: "In-app",
      });
    for (const due of measurements ?? []) {
      const daysOverdue = measurementDaysOverdue(due.nextDue);
      if (!daysOverdue) continue;
      items.push({
        id: `measure:${due.measureId}:${due.nextDue}`,
        date: due.nextDue,
        kind: "Measurement",
        text: `${due.benefitReference} measurement “${due.measureName}” is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue.`,
        channel: "In-app",
      });
    }
    for (const dependency of (dependencies ?? []).filter((entry) => entry.health === "Off Track"))
      items.push({
        id: `dependency:${dependency.id}`,
        date: dependency.requiredBy,
        kind: "Dependency",
        text: `${dependency.reference} is off track: ${dependency.healthReason}`,
        channel: "In-app",
      });
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [me, tasks, issued, decisions, measurements, dependencies]);
  const markRead = useCallback((ids: string[]) => {
    cache = Array.from(new Set([...readIds(), ...ids]));
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(cache));
    } catch {
      // Not persisted; this tab still updates.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return { feed, read, markRead, unread: feed.filter((item) => !read.includes(item.id)).length };
}
