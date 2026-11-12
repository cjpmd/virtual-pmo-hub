// Row ordering for BoardWorkspace's Sort control (GL-12, build plan 1.7). Date columns sort by
// calendar date (the board shows DD/MM/YYYY, so comparing the text ordered by day of the month);
// everything else keeps the board's text comparison with numeric collation. Blanks, "—" and dates
// that can't be read go last in both directions.
import { toIsoDay } from "./calendar";

export type SortDirection = "asc" | "desc";

/** A Sort value as stored in a view: "key" (ascending) or "-key" (descending). */
export function parseSortKey(sortKey: string): { key: string; direction: SortDirection } {
  return sortKey.startsWith("-")
    ? { key: sortKey.slice(1), direction: "desc" }
    : { key: sortKey, direction: "asc" };
}

export function formatSortKey(key: string, direction: SortDirection): string {
  return key && direction === "desc" ? `-${key}` : key;
}

/** Date columns: type "date", the start / finish fields, and a timeline (by start, else finish). */
export function isDateSort(key: string, type: string | undefined): boolean {
  return type === "date" || type === "timeline" || key === "start" || key === "finish";
}

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" &&
    (value.trim() === "" || value.trim() === "—" || value.trim() === "-")) ||
  (Array.isArray(value) && value.length === 0);

type Row = Record<string, unknown>;

/** The value a row sorts on: a YYYY-MM-DD day for date columns, else the cell value. */
function sortValue(row: Row, key: string, type: string | undefined): unknown {
  if (type === "timeline") return toIsoDay(row["start"]) ?? toIsoDay(row["finish"]);
  if (isDateSort(key, type)) return toIsoDay(row[key]);
  return row[key];
}

/**
 * A comparator for Array.prototype.sort. `type` is the column's BoardColumnType (undefined when
 * the key isn't a column). Blank values are last whichever the direction.
 */
export function compareBoardRows(key: string, type: string | undefined, direction: SortDirection) {
  const sign = direction === "desc" ? -1 : 1;
  return (a: Row, b: Row): number => {
    const left = sortValue(a, key, type);
    const right = sortValue(b, key, type);
    const leftBlank = isBlank(left);
    const rightBlank = isBlank(right);
    if (leftBlank || rightBlank) return leftBlank === rightBlank ? 0 : leftBlank ? 1 : -1;
    return (
      sign *
      String(left).localeCompare(String(right), "en-GB", {
        numeric: true,
      })
    );
  };
}
