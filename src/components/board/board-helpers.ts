import { today as todayDate } from "@/lib/today";
import type { BoardColumn, BoardFilter, BoardRow, SavedView } from "./types";

export function closedStatusFor(options: string[] | undefined): string {
  const order = ["Closed", "Done", "Completed", "Realised", "Embedded", "Superseded", "Approved"];
  return order.find((s) => options?.includes(s)) ?? "Closed";
}
/** The status a reopened item goes back to when it has no previous status: the first open one. */
export function reopenStatusFor(options: string[] | undefined): string {
  return (
    options?.find(
      (o) =>
        !["Closed", "Done", "Completed", "Realised", "Embedded", "Superseded", "Rejected"].includes(
          o,
        ),
    ) ?? "Open"
  );
}
/** Whether the item panel treats a row as closed (Reopen instead of Close). */
export const isClosedRow = (row: BoardRow) =>
  [
    "Closed",
    "Done",
    "Completed",
    "Realised",
    "Embedded",
    "Superseded",
    "Rejected",
    "Approved",
  ].includes(String(row.status ?? "")) &&
  Boolean(
    row["closedNote"] !== undefined ||
    row.status === "Closed" ||
    row.status === "Done" ||
    row.status === "Completed",
  );
/** Whether a row passes one of a saved view's filters. */
export const matchesFilter = (row: BoardRow, item: BoardFilter) => {
  const actual = row[item.key];
  if (item.operator === "truthy") return Boolean(actual);
  if (item.operator === "includes")
    return Array.isArray(actual)
      ? actual.map(String).includes(String(item.value))
      : String(actual ?? "").includes(String(item.value ?? ""));
  if (item.operator === "oneOf")
    return Array.isArray(item.value) && item.value.includes(String(actual ?? ""));
  if (item.operator === "notEquals") return String(actual ?? "") !== String(item.value ?? "");
  return String(actual ?? "") === String(item.value ?? "");
};
export const parseDate = (value?: string) => {
  const [d = 1, m = 1, y = 1970] = (value ?? "").split("/").map(Number);
  return new Date(y, m - 1, d);
};
export const initials = (name: string) =>
  name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
export const statusTone = (status?: string) =>
  status === "Completed" ||
  status === "On Track" ||
  status === "Approved" ||
  status === "Realised" ||
  status === "High"
    ? "bg-health-good/20 text-health-good-foreground"
    : status === "Overdue" ||
        status === "Off Track" ||
        status === "Rejected" ||
        status === "Not realised" ||
        status === "Disbenefit" ||
        status === "Low"
      ? "bg-health-bad/20 text-health-bad-foreground"
      : status === "Late" ||
          status === "At Risk" ||
          status === "On Hold" ||
          status === "Partially realised" ||
          status === "Medium"
        ? "bg-health-warn/25 text-health-warn-foreground"
        : "bg-muted text-muted-foreground";
export function getDeliveryStatus(row: BoardRow) {
  if (row.complete || row.progress === 100) return "Completed";
  const finish = parseDate(row.finish);
  const baseline = parseDate(row.baselineFinish);
  const today = todayDate();
  if (row.finish && finish < today) return "Overdue";
  if (row.baselineFinish && finish > baseline) return "Late";
  if (row.start && parseDate(row.start) > today) return "Future";
  return "On Track";
}
export const editableField = (column: BoardColumn) =>
  column.type !== "formula" && column.type !== "timeline" && column.type !== "link";
/** Shows or hides one column in the view with id `viewId`; other views are unchanged. */
export const toggleViewColumn = (views: SavedView[], viewId: string, key: string): SavedView[] =>
  views.map((item) =>
    item.id === viewId
      ? {
          ...item,
          visible: item.visible.includes(key)
            ? item.visible.filter((k) => k !== key)
            : [...item.visible, key],
        }
      : item,
  );
