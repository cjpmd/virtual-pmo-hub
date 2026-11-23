import { describe, expect, it } from "vitest";
import {
  allowedNextStages,
  appraiseOption,
  costsByYear,
  readApprovalRoutes,
  routeStepsFor,
} from "./five-case";

const year = (yearIndex: number, capital = 0, revenue = 0, cash = 0, nonCash = 0) => ({
  yearIndex,
  capitalCost: capital,
  revenueCost: revenue,
  cashBenefit: cash,
  nonCashBenefit: nonCash,
});

describe("appraiseOption", () => {
  it("leaves year 0 undiscounted and discounts later years", () => {
    const r = appraiseOption([year(0, 100), year(1, 0, 0, 103.5)], {
      discountRatePct: 3.5,
      appraisalYears: 2,
    });
    expect(r.pvCost).toBeCloseTo(100);
    expect(r.pvCashBenefit).toBeCloseTo(100);
    expect(r.npv).toBeCloseTo(0);
    expect(r.bcr).toBeCloseTo(1);
  });

  it("applies optimism bias to costs only", () => {
    const r = appraiseOption([year(0, 100, 0, 150)], {
      discountRatePct: 3.5,
      appraisalYears: 1,
      optimismBiasPct: 24,
    });
    expect(r.pvCostAdjusted).toBeCloseTo(124);
    expect(r.pvCashBenefit).toBeCloseTo(150);
    expect(r.npv).toBeCloseTo(26);
  });

  it("counts non-cash benefits in NPSV but not NPV", () => {
    const r = appraiseOption([year(0, 100, 0, 50, 80)], { discountRatePct: 0, appraisalYears: 1 });
    expect(r.npv).toBeCloseTo(-50);
    expect(r.npsv).toBeCloseTo(30);
    expect(r.bcr).toBeCloseTo(1.3);
  });

  it("ignores years outside the appraisal period", () => {
    const r = appraiseOption([year(0, 10), year(5, 1000)], { discountRatePct: 0, appraisalYears: 3 });
    expect(r.pvCost).toBe(10);
    expect(r.years).toBe(3);
  });

  it("has no ratio without costs", () => {
    expect(appraiseOption([year(1, 0, 0, 10)], { discountRatePct: 3.5, appraisalYears: 5 }).bcr).toBeNull();
  });
});

describe("costsByYear", () => {
  it("fills every year of the period", () => {
    expect(costsByYear([year(1, 5, 2)], 3)).toEqual([
      { yearIndex: 0, capital: 0, revenue: 0 },
      { yearIndex: 1, capital: 5, revenue: 2 },
      { yearIndex: 2, capital: 0, revenue: 0 },
    ]);
  });
});

describe("allowedNextStages", () => {
  it("allows any stage before anything is approved", () => {
    expect(allowedNextStages([])).toEqual(["single", "soc", "obc", "fbc"]);
  });
  it("moves one stage at a time and never back", () => {
    expect(allowedNextStages(["soc"])).toEqual(["soc", "obc"]);
    expect(allowedNextStages(["soc", "obc"])).toEqual(["obc", "fbc"]);
  });
  it("keeps a single-stage case single-stage", () => {
    expect(allowedNextStages(["single"])).toEqual(["single"]);
  });
});

describe("approval routes", () => {
  const routes = readApprovalRoutes({
    obc: [
      { name: "Finance", governanceRole: "director_of_finance", minValue: null },
      { name: "ICB", governanceRole: "head_of_pmo", minValue: 15_000_000 },
      { name: "", governanceRole: "x" },
      "bad",
    ],
    nonsense: [{ name: "X", governanceRole: "y" }],
  });

  it("drops bad shapes and unknown stages", () => {
    expect(Object.keys(routes)).toEqual(["obc"]);
    expect(routes.obc).toHaveLength(2);
  });

  it("applies a threshold step only at or above its value", () => {
    expect(routeStepsFor(routes, "obc", 1_000_000).map((s) => s.name)).toEqual(["Finance"]);
    expect(routeStepsFor(routes, "obc", 15_000_000).map((s) => s.name)).toEqual(["Finance", "ICB"]);
    expect(routeStepsFor(routes, "fbc", 1)).toEqual([]);
  });

  it("reads nothing from a non-object", () => {
    expect(readApprovalRoutes(null)).toEqual({});
    expect(readApprovalRoutes([])).toEqual({});
  });
});
