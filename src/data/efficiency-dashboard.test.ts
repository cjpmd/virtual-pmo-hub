// NHS-4 part 4: the dashboard's pure helpers (cumulative chart points and the recurrent share).
import { describe, expect, it } from "vitest";
import { cumulativePoints, recurrentShare, toSummary } from "./efficiency";

const summary = toSummary({
  year: 2026,
  startMonth: 4,
  totals: {
    schemes: 2,
    target: 100,
    plan: 40,
    planRecurrent: 30,
    riskAdjusted: 20,
    forecastOutturn: 35,
    actual: 9,
    fullYearEffect: 0,
    carryForward: 0,
  },
  months: [
    {
      month: "2026-04-01",
      plan: 10,
      riskAdjusted: 5,
      forecastOutturn: 9,
      actual: 9,
      hasActual: true,
      cumPlan: 10,
      cumRiskAdjusted: 5,
      cumForecastOutturn: 9,
      cumActual: 9,
    },
    {
      month: "2026-05-01",
      plan: 10,
      riskAdjusted: 5,
      forecastOutturn: 8,
      actual: 0,
      hasActual: false,
      cumPlan: 20,
      cumRiskAdjusted: 10,
      cumForecastOutturn: 17,
      cumActual: 9,
    },
    {
      month: "2026-06-01",
      plan: 20,
      riskAdjusted: 10,
      forecastOutturn: 18,
      actual: 0,
      hasActual: false,
      cumPlan: 40,
      cumRiskAdjusted: 20,
      cumForecastOutturn: 35,
      cumActual: 9,
    },
  ],
  byUnit: [],
  byCategory: [],
  byStage: [],
})!;

describe("cumulativePoints", () => {
  it("plots the plan, actuals up to the last reported month and a risk-adjusted to outturn band", () => {
    const points = cumulativePoints(summary, (m) => m.slice(0, 7));
    expect(points).toEqual([
      { period: "2026-04", planned: 10, actual: 9, band: [5, 9] },
      { period: "2026-05", planned: 20, actual: undefined, band: [10, 17] },
      { period: "2026-06", planned: 40, actual: undefined, band: [20, 35] },
    ]);
  });
  it("orders the band when the outturn is below the risk-adjusted value", () => {
    const low = {
      ...summary,
      months: [{ ...summary.months[0]!, cumRiskAdjusted: 8, cumForecastOutturn: 2 }],
    };
    expect(cumulativePoints(low, (m) => m)[0]?.band).toEqual([2, 8]);
  });
  it("has no actual line before any actual is recorded", () => {
    const none = { ...summary, months: summary.months.map((m) => ({ ...m, hasActual: false })) };
    expect(cumulativePoints(none, (m) => m).every((p) => p.actual === undefined)).toBe(true);
  });
});

describe("recurrentShare", () => {
  it("is the recurrent share of the plan to one decimal place", () => {
    expect(recurrentShare(summary.totals)).toBe(75);
    expect(recurrentShare({ ...summary.totals, plan: 3, planRecurrent: 2 })).toBe(66.7);
  });
  it("is null without a plan", () => {
    expect(recurrentShare({ ...summary.totals, plan: 0, planRecurrent: 0 })).toBeNull();
  });
});
