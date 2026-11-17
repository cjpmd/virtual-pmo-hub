import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closedStatusFor,
  editableField,
  getDeliveryStatus,
  initials,
  isClosedRow,
  matchesFilter,
  parseDate,
  reopenStatusFor,
  statusTone,
  toggleViewColumn,
} from "./board-helpers";
import type { BoardColumn, BoardRow, SavedView } from "./types";

const row = (extra: Partial<BoardRow> = {}): BoardRow => ({ id: "r1", title: "Row", ...extra });

describe("closedStatusFor / reopenStatusFor", () => {
  it("picks the first closing status the board offers, else Closed", () => {
    expect(closedStatusFor(["Open", "Done", "Closed"])).toBe("Closed");
    expect(closedStatusFor(["Open", "Realised"])).toBe("Realised");
    expect(closedStatusFor(["Open"])).toBe("Closed");
    expect(closedStatusFor(undefined)).toBe("Closed");
  });
  it("reopens to the first open status, else Open", () => {
    expect(reopenStatusFor(["Done", "In progress", "Open"])).toBe("In progress");
    expect(reopenStatusFor(["Done", "Rejected"])).toBe("Open");
    expect(reopenStatusFor(undefined)).toBe("Open");
  });
});

describe("isClosedRow", () => {
  it("treats Closed, Done and Completed as closed", () => {
    expect(isClosedRow(row({ status: "Done" }))).toBe(true);
    expect(isClosedRow(row({ status: "Completed" }))).toBe(true);
  });
  it("needs a closing note for the other closing statuses", () => {
    expect(isClosedRow(row({ status: "Approved" }))).toBe(false);
    expect(isClosedRow(row({ status: "Approved", closedNote: "" }))).toBe(true);
    expect(isClosedRow(row({ status: "Open", closedNote: "x" }))).toBe(false);
  });
});

describe("matchesFilter", () => {
  const r = row({ status: "Open", tags: ["a", "b"], owner: "", flag: 1 });
  it("handles each operator", () => {
    expect(matchesFilter(r, { key: "status", operator: "equals", value: "Open" })).toBe(true);
    expect(matchesFilter(r, { key: "status", operator: "notEquals", value: "Open" })).toBe(false);
    expect(matchesFilter(r, { key: "tags", operator: "includes", value: "b" })).toBe(true);
    expect(matchesFilter(r, { key: "status", operator: "includes", value: "pe" })).toBe(true);
    expect(matchesFilter(r, { key: "status", operator: "oneOf", value: ["Open", "x"] })).toBe(true);
    expect(matchesFilter(r, { key: "status", operator: "oneOf", value: "Open" })).toBe(false);
    expect(matchesFilter(r, { key: "owner", operator: "truthy" })).toBe(false);
    expect(matchesFilter(r, { key: "flag", operator: "truthy" })).toBe(true);
  });
});

describe("toggleViewColumn", () => {
  const view = (id: string, visible: string[]): SavedView => ({
    id,
    name: id,
    type: "table",
    groupBy: "",
    sortKey: "",
    filter: "",
    visible,
    isDefault: false,
  });
  it("hides a shown column and shows a hidden one in the active view only", () => {
    const views = [view("a", ["title", "status"]), view("b", ["title"])];
    expect(toggleViewColumn(views, "a", "status").map((v) => v.visible)).toEqual([
      ["title"],
      ["title"],
    ]);
    expect(toggleViewColumn(views, "b", "status").map((v) => v.visible)).toEqual([
      ["title", "status"],
      ["title", "status"],
    ]);
  });
});

describe("small helpers", () => {
  it("parses DD/MM/YYYY", () => {
    expect(parseDate("05/03/2026")).toEqual(new Date(2026, 2, 5));
    // A blank value reads as day 0 of January 1970 (current behaviour, kept as is).
    expect(parseDate(undefined)).toEqual(new Date(1970, 0, 0));
  });
  it("takes up to two initials", () => {
    expect(initials("Ada Byron King")).toBe("AB");
    expect(initials("Ada")).toBe("A");
  });
  it("colours statuses by tone", () => {
    expect(statusTone("On Track")).toContain("health-good");
    expect(statusTone("Overdue")).toContain("health-bad");
    expect(statusTone("At Risk")).toContain("health-warn");
    expect(statusTone("Whatever")).toContain("bg-muted");
  });
  it("lets formula, timeline and link columns be read-only in forms", () => {
    const col = (type: BoardColumn["type"]): BoardColumn => ({ key: "k", label: "K", type });
    expect(editableField(col("text"))).toBe(true);
    expect(editableField(col("formula"))).toBe(false);
    expect(editableField(col("timeline"))).toBe(false);
    expect(editableField(col("link"))).toBe(false);
  });
});

describe("getDeliveryStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("is Completed when complete or at 100%", () => {
    expect(getDeliveryStatus(row({ complete: true, finish: "01/01/2020" }))).toBe("Completed");
    expect(getDeliveryStatus(row({ progress: 100 }))).toBe("Completed");
  });
  it("is Overdue when the finish has passed", () => {
    expect(getDeliveryStatus(row({ finish: "14/06/2026" }))).toBe("Overdue");
  });
  it("is Late when the finish is after the baseline", () => {
    expect(getDeliveryStatus(row({ finish: "20/07/2026", baselineFinish: "10/07/2026" }))).toBe(
      "Late",
    );
  });
  it("is Future when it hasn't started, else On Track", () => {
    expect(getDeliveryStatus(row({ start: "01/07/2026", finish: "20/07/2026" }))).toBe("Future");
    expect(getDeliveryStatus(row({ start: "01/06/2026", finish: "20/07/2026" }))).toBe("On Track");
  });
});
