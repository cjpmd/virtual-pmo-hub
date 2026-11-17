import { describe, expect, it } from "vitest";
import type { Task } from "@/data/types";
import {
  buildRows,
  checklistOf,
  fromDate,
  fromIso,
  initials,
  kidsOf,
  toDate,
  toIso,
  wouldLoop,
} from "./task-helpers";

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  bucket: "To do",
  assignees: [],
  start: "01/03/2026",
  finish: "10/03/2026",
  percentComplete: 0,
  priority: "Moderate" as Task["priority"],
  isMilestone: false,
  checklistCount: 0,
  dependencies: [],
  ...extra,
});

describe("dates", () => {
  it("converts between DD/MM/YYYY, Date and ISO", () => {
    expect(toDate("05/03/2026")).toEqual(new Date(2026, 2, 5));
    expect(fromDate(new Date(2026, 2, 5))).toBe("05/03/2026");
    expect(toIso("05/03/2026")).toBe("2026-03-05");
    expect(fromIso("2026-03-05")).toBe("05/03/2026");
  });
});

describe("initials", () => {
  it("takes up to two initials", () => {
    expect(initials("Ada Byron King")).toBe("AB");
  });
});

describe("checklistOf", () => {
  it("uses stored checklist items when present", () => {
    const items = [{ id: "x", label: "Do it", done: true }];
    expect(checklistOf(task("t", { checklistItems: items }))).toBe(items);
  });
  it("derives up to four items and marks them done by % complete", () => {
    const list = checklistOf(task("t", { checklistCount: 6, percentComplete: 50 }));
    expect(list.map((i) => i.label)).toEqual([
      "Checklist item 1",
      "Checklist item 2",
      "Checklist item 3",
      "Checklist item 4",
    ]);
    expect(list.map((i) => i.done)).toEqual([true, true, false, false]);
    expect(list[0]?.id).toBe("t-c0");
  });
  it("uses checklist labels and marks all done at 100%", () => {
    const list = checklistOf(
      task("t", { checklist: ["A", "B"], checklistCount: 2, percentComplete: 100 }),
    );
    expect(list).toEqual([
      { id: "t-c0", label: "A", done: true },
      { id: "t-c1", label: "B", done: true },
    ]);
  });
});

describe("wouldLoop", () => {
  const tasks = [task("a", { dependencies: ["b"] }), task("b", { dependencies: ["c"] }), task("c")];
  it("detects a dependency that would make a cycle", () => {
    expect(wouldLoop(tasks, "c", "a")).toBe(true);
    expect(wouldLoop(tasks, "a", "a")).toBe(true);
  });
  it("allows a dependency that doesn't", () => {
    expect(wouldLoop(tasks, "a", "c")).toBe(false);
  });
});

describe("buildRows", () => {
  const tasks = [
    task("p", { start: "01/01/2026", finish: "02/01/2026", percentComplete: 0 }),
    task("k1", {
      parentId: "p",
      start: "05/03/2026",
      finish: "10/03/2026",
      percentComplete: 100,
    }),
    task("k2", {
      parentId: "p",
      start: "01/03/2026",
      finish: "20/03/2026",
      percentComplete: 0,
    }),
    task("solo"),
  ];
  it("lists parents with their subtasks and rolls up dates and %", () => {
    expect(kidsOf(tasks, "p").map((t) => t.id)).toEqual(["k1", "k2"]);
    const rows = buildRows(tasks, new Set());
    expect(rows.map((r) => [r.task.id, r.depth, r.kids])).toEqual([
      ["p", 0, 2],
      ["k1", 1, 0],
      ["k2", 1, 0],
      ["solo", 0, 0],
    ]);
    expect(rows[0]?.task.start).toBe("01/03/2026");
    expect(rows[0]?.task.finish).toBe("20/03/2026");
    expect(rows[0]?.task.percentComplete).toBe(50);
  });
  it("hides a collapsed parent's subtasks", () => {
    expect(buildRows(tasks, new Set(["p"])).map((r) => r.task.id)).toEqual(["p", "solo"]);
  });
  it("shows a subtask whose parent is missing as a top-level row", () => {
    expect(buildRows([task("orphan", { parentId: "gone" })], new Set())[0]?.depth).toBe(0);
  });
});
