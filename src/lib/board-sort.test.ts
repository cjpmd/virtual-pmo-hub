import { describe, expect, it } from "vitest";
import { compareBoardRows, formatSortKey, isDateSort, parseSortKey } from "./board-sort";

const rows = (values: unknown[], key = "finish") =>
  values.map((value, index) => ({ id: String(index), title: `R${index}`, [key]: value }));
const order = (list: Record<string, unknown>[], key: string) => list.map((row) => row[key]);

describe("compareBoardRows", () => {
  const dates = ["05/03/2026", "—", "28/01/2026", "", "12/11/2025", undefined, "2026-02-01"];

  it("sorts DD/MM/YYYY and ISO dates by calendar date, blanks last (ascending)", () => {
    const sorted = rows(dates).sort(compareBoardRows("finish", "date", "asc"));
    expect(order(sorted, "finish").slice(0, 4)).toEqual([
      "12/11/2025",
      "28/01/2026",
      "2026-02-01",
      "05/03/2026",
    ]);
    expect(
      order(sorted, "finish")
        .slice(4)
        .every((v) => v === undefined || v === "" || v === "—"),
    ).toBe(true);
  });

  it("keeps blanks last when descending", () => {
    const sorted = rows(dates).sort(compareBoardRows("finish", "date", "desc"));
    expect(order(sorted, "finish").slice(0, 4)).toEqual([
      "05/03/2026",
      "2026-02-01",
      "28/01/2026",
      "12/11/2025",
    ]);
    expect(
      order(sorted, "finish")
        .slice(4)
        .every((v) => v === undefined || v === "" || v === "—"),
    ).toBe(true);
  });

  it("treats start / finish as dates even without a date column type", () => {
    const sorted = rows(["01/12/2026", "02/01/2026"], "start").sort(
      compareBoardRows("start", undefined, "asc"),
    );
    expect(order(sorted, "start")).toEqual(["02/01/2026", "01/12/2026"]);
  });

  it("puts unreadable dates with the blanks", () => {
    const sorted = rows(["31/02/2026", "01/01/2026"]).sort(
      compareBoardRows("finish", "date", "asc"),
    );
    expect(order(sorted, "finish")).toEqual(["01/01/2026", "31/02/2026"]);
  });

  it("sorts a timeline column by start, else finish", () => {
    const list = [
      { id: "a", title: "a", start: "10/02/2026", finish: "01/03/2026" },
      { id: "b", title: "b", finish: "05/01/2026" },
      { id: "c", title: "c" },
      { id: "d", title: "d", start: "09/01/2026" },
    ];
    expect(list.sort(compareBoardRows("timeline", "timeline", "asc")).map((r) => r.id)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ]);
  });

  it("keeps text and number sorting as before (numeric collation)", () => {
    const text = rows(["Beta", "alpha", "Gamma"], "title2").sort(
      compareBoardRows("title2", "text", "asc"),
    );
    expect(order(text, "title2")).toEqual(["alpha", "Beta", "Gamma"]);
    const codes = rows(["P-10", "P-2", "P-1"], "code").sort(
      compareBoardRows("code", "text", "asc"),
    );
    expect(order(codes, "code")).toEqual(["P-1", "P-2", "P-10"]);
    const numbers = rows([10, 9, 100], "number").sort(compareBoardRows("number", "number", "desc"));
    expect(order(numbers, "number")).toEqual([100, 10, 9]);
  });
});

describe("sort keys", () => {
  it("round-trips direction through the stored key", () => {
    expect(parseSortKey("finish")).toEqual({ key: "finish", direction: "asc" });
    expect(parseSortKey("-finish")).toEqual({ key: "finish", direction: "desc" });
    expect(formatSortKey("finish", "desc")).toBe("-finish");
    expect(formatSortKey("", "desc")).toBe("");
  });

  it("recognises date columns", () => {
    expect(isDateSort("baseline", "date")).toBe(true);
    expect(isDateSort("finish", "text")).toBe(true);
    expect(isDateSort("owner", "people")).toBe(false);
  });
});
