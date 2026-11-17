import { formatDate } from "@/lib/format";
import { TODAY, toDate, toIso, type ItemType } from "@/services/sprints";

export const today = toDate(TODAY);
export const fmt = (d: Date | null | undefined) =>
  d ? formatDate(toIso(d).split("-").reverse().join("/")) : "—";
export const itemTypes: ItemType[] = ["story", "task", "bug", "spike", "milestone_task"];
export const selectCls = "h-8 rounded-md border border-input bg-background px-2 text-xs";
export const views = ["Backlog", "Sprints", "Board", "Reports", "Forecast"] as const;
export type View = (typeof views)[number];
