import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import {
  addMonths,
  gridMonths,
  monthRange,
  monthlySeries,
  nextMonthToClose,
  parseAmount,
  parseMonth,
  summarise,
  type MonthValue,
} from "./financials-calc";
import {
  buildPreview,
  guessMapping,
  importTotals,
  toCommitRows,
  type ImportContext,
} from "./actuals-import";

describe("parseCsv", () => {
  it("reads quoted fields, escaped quotes, commas and line breaks", () => {
    const text =
      '﻿Date,Amount,Note\r\n2026-03-01,"1,250.00","He said ""hi"""\r\n\r\n2026-04-01,10,"two\nlines"\n';
    expect(parseCsv(text)).toEqual([
      ["Date", "Amount", "Note"],
      ["2026-03-01", "1,250.00", 'He said "hi"'],
      ["2026-04-01", "10", "two\nlines"],
    ]);
  });
  it("handles CR-only endings, a missing final newline and empty fields", () => {
    expect(parseCsv("a,b\r1,\r,2")).toEqual([
      ["a", "b"],
      ["1", ""],
      ["", "2"],
    ]);
  });
});

describe("months", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(monthRange("2026-11-15", "2027-01-31")).toEqual([
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]);
  });
  it("reads the dates finance exports use", () => {
    expect(parseMonth("2026-03-14")).toBe("2026-03-01");
    expect(parseMonth("2026-03")).toBe("2026-03-01");
    expect(parseMonth("14/03/2026")).toBe("2026-03-01");
    expect(parseMonth("03/2026")).toBe("2026-03-01");
    expect(parseMonth("Mar 2026")).toBe("2026-03-01");
    expect(parseMonth("March-26")).toBe("2026-03-01");
    expect(parseMonth("13/2026")).toBeNull();
    expect(parseMonth("soon")).toBeNull();
  });
  it("reads amounts with symbols, separators and credits", () => {
    expect(parseAmount("£1,250.50")).toBe(1250.5);
    expect(parseAmount("(300.00)")).toBe(-300);
    expect(parseAmount("-12")).toBe(-12);
    expect(parseAmount("45.00CR")).toBe(-45);
    expect(parseAmount("12a")).toBeNull();
  });
  it("offers the month after the latest closed one, once it has ended", () => {
    const periods = [
      { periodMonth: "2026-07-01", closed: true },
      { periodMonth: "2026-08-01", closed: true },
    ];
    expect(nextMonthToClose(periods, "2026-10-06")).toBe("2026-09-01");
    expect(
      nextMonthToClose([...periods, { periodMonth: "2026-09-01", closed: true }], "2026-10-06"),
    ).toBeNull();
    expect(nextMonthToClose([], "2026-10-06")).toBe("2026-09-01");
  });
});

describe("cut-off and EAC (agrees with v_project_financials)", () => {
  const values: MonthValue[] = [
    { costLineId: "a", periodMonth: "2026-08-01", kind: "budget", amount: 1000 },
    { costLineId: "a", periodMonth: "2026-09-01", kind: "budget", amount: 1000 },
    { costLineId: "a", periodMonth: "2026-10-01", kind: "budget", amount: 1000 },
    { costLineId: "a", periodMonth: "2026-08-01", kind: "actual", amount: 900 },
    { costLineId: "a", periodMonth: "2026-09-01", kind: "actual", amount: 1100 },
    { costLineId: "a", periodMonth: "2026-10-01", kind: "actual", amount: 400 },
    { costLineId: "a", periodMonth: "2026-08-01", kind: "forecast", amount: 999 },
    { costLineId: "a", periodMonth: "2026-10-01", kind: "forecast", amount: 1200 },
  ];
  it("counts actuals to the cut-off and forecast after it", () => {
    expect(summarise(values, "2026-09-01")).toEqual({
      budgetPhased: 3000,
      actualToDate: 2000,
      actualOpenMonths: 400,
      forecastRemaining: 1200,
      eac: 3200,
    });
  });
  it("builds the cumulative chart series with the cut-off join", () => {
    const series = monthlySeries(values, "2026-09-01", ["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(series.map((point) => point.cumulativeBudget)).toEqual([1000, 2000, 3000]);
    expect(series.map((point) => point.cumulativeActual)).toEqual([900, 2000, null]);
    expect(series.map((point) => point.cumulativeForecast)).toEqual([null, 2000, 3200]);
  });
  it("shows every month with a value, plus the project's dates", () => {
    const months = gridMonths(values, "2026-09-10", "2026-09-20", "2026-09-01");
    expect(months).toEqual(["2026-08-01", "2026-09-01", "2026-10-01"]);
  });
});

describe("actuals import preview", () => {
  const context: ImportContext = {
    workspaceId: "ws",
    defaultProjectId: null,
    projects: [
      { id: "p1", code: "ABC", name: "A", workspaceId: "ws" },
      { id: "p2", code: "XYZ", name: "X", workspaceId: "other" },
    ],
    lines: [
      { id: "l1", projectId: "p1", name: "Licences", categoryId: "c-lic", archived: false },
      { id: "l2", projectId: "p1", name: "Staff A", categoryId: "c-staff", archived: false },
      { id: "l3", projectId: "p1", name: "Staff B", categoryId: "c-staff", archived: false },
    ],
    categories: [
      { id: "c-lic", label: "Licences" },
      { id: "c-staff", label: "Staff" },
      { id: "c-hw", label: "Hardware" },
    ],
    closedMonths: new Set(["2026-08-01"]),
    existingReferences: new Set(["inv-old"]),
    createMissingLines: false,
  };
  const csv = parseCsv(
    [
      "Project,Date,Category,Amount,Ref",
      "ABC,2026-09-03,Licences,100,INV-1",
      "ABC,2026-09-05,Hardware,50,INV-2",
      "ABC,2026-09-05,Staff,20,INV-3",
      "XYZ,2026-09-05,Licences,20,INV-4",
      "NOPE,2026-09-05,Licences,20,INV-5",
      "ABC,2026-08-30,Licences,20,INV-6",
      "ABC,someday,Licences,abc,INV-7",
      "ABC,2026-09-09,Licences,(10),INV-8",
      "ABC,2026-09-09,Licences,10,INV-8",
      "ABC,2026-09-09,Licences,10,INV-OLD",
    ].join("\n"),
  );
  const mapping = guessMapping(csv[0]!);

  it("guesses the mapping from the header", () => {
    expect(mapping).toMatchObject({
      project: 0,
      date: 1,
      category: 2,
      amount: 3,
      reference: 4,
      line: -1,
    });
  });

  it("resolves rows and reports every problem", () => {
    const preview = buildPreview(csv, mapping, context);
    const errorsOf = (row: number) => preview.find((item) => item.rowNumber === row)!.errors;
    expect(preview[0]).toMatchObject({
      rowNumber: 2,
      projectId: "p1",
      costLineId: "l1",
      month: "2026-09-01",
      amount: 100,
      errors: [],
    });
    expect(errorsOf(3)).toEqual(["ABC has no Hardware line"]);
    expect(errorsOf(4)).toEqual(["ABC has 2 Staff lines; map the line"]);
    expect(errorsOf(5)).toEqual(["XYZ is in a different workspace"]);
    expect(errorsOf(6)).toEqual(['Unknown project code "NOPE"']);
    expect(errorsOf(7)).toEqual(["Aug 2026 is closed"]);
    expect(errorsOf(8)).toEqual(['Can\'t read the date "someday"', 'Can\'t read the amount "abc"']);
    expect(errorsOf(9)).toEqual(["Reference INV-8 appears more than once"]);
    expect(preview.find((item) => item.rowNumber === 9)!.warnings).toEqual([
      "Credit (negative actual)",
    ]);
    expect(errorsOf(11)).toEqual(["Reference INV-OLD was imported before"]);
  });

  it("creates a line per missing category when asked", () => {
    const preview = buildPreview(csv, mapping, { ...context, createMissingLines: true });
    expect(preview[1]).toMatchObject({
      costLineId: null,
      categoryId: "c-hw",
      lineLabel: "New line: Hardware",
      errors: [],
    });
  });

  it("commits only clean rows and totals them", () => {
    const preview = buildPreview(csv, mapping, { ...context, createMissingLines: true });
    const bad = new Set(preview.filter((row) => row.errors.length).map((row) => row.rowNumber));
    expect(() => toCommitRows(preview, new Set())).toThrow(/^Row 4:/);
    expect(toCommitRows(preview, bad)).toEqual([
      {
        row_number: 2,
        project_id: "p1",
        cost_line_id: "l1",
        period_month: "2026-09-01",
        amount: 100,
        reference: "INV-1",
      },
      {
        row_number: 3,
        project_id: "p1",
        category_id: "c-hw",
        period_month: "2026-09-01",
        amount: 50,
        reference: "INV-2",
      },
    ]);
    expect(importTotals(preview, bad)).toEqual({
      total: 150,
      byMonth: [{ month: "2026-09-01", total: 150 }],
      byProject: [{ projectCode: "ABC", total: 150, rows: 2 }],
    });
  });

  it("sends rows to the project's own tab when there is no project column", () => {
    const rows = parseCsv("Date,Line,Amount\n2026-09-01,licences,5");
    const preview = buildPreview(rows, guessMapping(rows[0]!), {
      ...context,
      defaultProjectId: "p1",
    });
    expect(preview[0]).toMatchObject({ projectId: "p1", costLineId: "l1", errors: [] });
  });
});
