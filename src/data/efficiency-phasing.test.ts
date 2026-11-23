// NHS-4 part 2: the phasing grid and year-summary helpers. The same worked example as
// supabase/tests/efficiency_summary.sql, so the screens and public.efficiency_summary agree.
import { describe, expect, it } from "vitest";
import {
  buildGrid,
  copyKind,
  financialYearMonths,
  gapToTarget,
  gridChanges,
  gridKey,
  parseAmount,
  toSummary,
  workspaceTarget,
  yearTotals,
  type MonthValue,
} from "./efficiency";

const months = financialYearMonths(2026, 4);
const values: (MonthValue & { id: string; updatedAt: string; validatedAt: string | null })[] = [
  {
    id: "a",
    updatedAt: "t1",
    validatedAt: null,
    month: "2026-04-01",
    kind: "plan",
    recurrent: 10000,
    nonRecurrent: 0,
  },
  {
    id: "b",
    updatedAt: "t1",
    validatedAt: null,
    month: "2026-05-01",
    kind: "plan",
    recurrent: 10000,
    nonRecurrent: 5000,
  },
  {
    id: "c",
    updatedAt: "t1",
    validatedAt: null,
    month: "2027-03-01",
    kind: "plan",
    recurrent: 12000,
    nonRecurrent: 0,
  },
  {
    id: "d",
    updatedAt: "t1",
    validatedAt: null,
    month: "2026-05-01",
    kind: "forecast",
    recurrent: 8000,
    nonRecurrent: 0,
  },
  {
    id: "e",
    updatedAt: "t1",
    validatedAt: "2026-05-02",
    month: "2026-04-01",
    kind: "actual",
    recurrent: 9000,
    nonRecurrent: 0,
  },
  {
    id: "f",
    updatedAt: "t1",
    validatedAt: null,
    month: "2027-04-01",
    kind: "plan",
    recurrent: 12000,
    nonRecurrent: 0,
  },
];

describe("phasing grid", () => {
  it("builds a full year with zeros, keeps stored ids and leaves other years out", () => {
    const grid = buildGrid(values, months);
    expect(Object.keys(grid)).toHaveLength(36);
    expect(grid[gridKey("plan", "2026-05-01")]).toEqual({
      recurrent: 10000,
      nonRecurrent: 5000,
      id: "b",
      updatedAt: "t1",
      validated: false,
    });
    expect(grid[gridKey("actual", "2026-04-01")]?.validated).toBe(true);
    expect(grid["plan:2027-04"]).toBeUndefined();
    expect(grid[gridKey("forecast", "2026-06-01")]).toEqual({ recurrent: 0, nonRecurrent: 0 });
  });

  it("works out the year totals, forecast outturn and carry-forward", () => {
    expect(yearTotals(buildGrid(values, months), months)).toEqual({
      plan: 37000,
      planRecurrent: 32000,
      planNonRecurrent: 5000,
      forecast: 8000,
      // April actual 9,000 + May forecast 8,000 + March plan 12,000.
      forecastOutturn: 29000,
      actual: 9000,
      carryForward: 144000,
    });
  });

  it("counts a stored actual of zero as recorded in the outturn", () => {
    const grid = buildGrid(
      [
        { month: "2026-04-01", kind: "plan", recurrent: 100, nonRecurrent: 0 },
        {
          id: "z",
          updatedAt: "t",
          validatedAt: null,
          month: "2026-04-01",
          kind: "actual",
          recurrent: 0,
          nonRecurrent: 0,
        },
      ],
      months,
    );
    expect(yearTotals(grid, months).forecastOutturn).toBe(0);
  });

  it("lists only changed cells, with the stored row for updates, and skips new zero cells", () => {
    const stored = buildGrid(values, months);
    let edited = { ...stored };
    edited[gridKey("plan", "2026-04-01")] = {
      ...stored[gridKey("plan", "2026-04-01")]!,
      recurrent: 11000,
    };
    edited[gridKey("actual", "2026-06-01")] = { recurrent: 500, nonRecurrent: 0 };
    edited[gridKey("forecast", "2026-07-01")] = { recurrent: 0, nonRecurrent: 0 };
    expect(gridChanges(stored, edited)).toEqual([
      {
        kind: "plan",
        month: "2026-04-01",
        recurrent: 11000,
        nonRecurrent: 0,
        existing: { id: "a", updatedAt: "t1" },
      },
      { kind: "actual", month: "2026-06-01", recurrent: 500, nonRecurrent: 0 },
    ]);
    edited = copyKind(stored, "plan", "forecast", months);
    const changes = gridChanges(stored, edited);
    // Plan April (new forecast), May (updates the stored forecast), March (new); zero months skipped.
    expect(changes.map((c) => [c.kind, c.month, c.recurrent, c.existing?.id ?? null])).toEqual([
      ["forecast", "2026-04-01", 10000, null],
      ["forecast", "2026-05-01", 10000, "d"],
      ["forecast", "2027-03-01", 12000, null],
    ]);
  });

  it("parses typed amounts", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("1250")).toBe(1250);
    expect(parseAmount("£1,250.50")).toBe(1250.5);
    expect(parseAmount("-300")).toBe(-300);
    expect(parseAmount("12.345")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1e5")).toBeNull();
  });
});

describe("targets and summary", () => {
  const targets = [
    { workspaceId: "w1", financialYear: 2026, businessUnit: null, amount: 500000 },
    { workspaceId: "w1", financialYear: 2026, businessUnit: "Surgery", amount: 120000 },
    { workspaceId: "w2", financialYear: 2026, businessUnit: "Surgery", amount: 100000 },
    { workspaceId: "w2", financialYear: 2026, businessUnit: "Estates", amount: 30000 },
  ];
  it("takes the whole-workspace target, else the sum of unit targets", () => {
    expect(workspaceTarget(targets, "w1", 2026)).toBe(500000);
    expect(workspaceTarget(targets, "w2", 2026)).toBe(130000);
    expect(workspaceTarget(targets, "w1", 2027)).toBeNull();
  });

  it("gap is target minus value (positive = short)", () => {
    expect(gapToTarget(500000, 42000)).toBe(458000);
    expect(gapToTarget(100, 150)).toBe(-50);
    expect(gapToTarget(null, 10)).toBeNull();
  });

  it("reads the RPC's JSON, defaulting missing numbers to zero and dropping unknown stages", () => {
    const summary = toSummary({
      year: 2026,
      startMonth: 4,
      totals: {
        schemes: 2,
        target: null,
        plan: "42000.00",
        riskAdjusted: 19500,
        carryForward: 144000,
      },
      months: [{ month: "2026-04-01", plan: 10000, hasActual: true, cumPlan: 10000 }],
      byUnit: [{ key: null, target: 5, plan: 1 }],
      byCategory: [{ key: "medicines", plan: 5000 }],
      byStage: [{ stage: "opportunity", schemes: 1 }, { stage: "nonsense" }],
    });
    expect(summary?.totals).toMatchObject({
      target: null,
      plan: 42000,
      actual: 0,
      carryForward: 144000,
    });
    expect(summary?.months[0]).toMatchObject({ month: "2026-04-01", hasActual: true, actual: 0 });
    expect(summary?.byUnit[0]).toMatchObject({ key: null, target: 5, plan: 1, schemes: 0 });
    expect(summary?.byStage).toEqual([
      { stage: "opportunity", schemes: 1, plan: 0, riskAdjusted: 0 },
    ]);
    expect(toSummary(null)).toBeNull();
  });
});
