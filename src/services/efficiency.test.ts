import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEIGHTS,
  defaultCategories,
  financialYearLabel,
  financialYearMonths,
  financialYearOf,
  riskAdjusted,
  runRateFullYearEffect,
  stageRank,
  toEfficiencySettings,
} from "@/data/efficiency";
import { schemeFields, toScheme, toValue } from "./efficiency";

describe("efficiency data helpers", () => {
  it("ranks the pipeline and leaves on hold / rejected outside it", () => {
    expect(stageRank("idea")).toBe(1);
    expect(stageRank("fully_developed")).toBe(4);
    expect(stageRank("in_delivery")).toBe(5);
    expect(stageRank("delivered")).toBe(6);
    expect(stageRank("on_hold")).toBe(0);
    expect(stageRank("rejected")).toBe(0);
  });

  it("works out financial years like private.financial_year_of", () => {
    expect(financialYearOf("2026-04-01", 4)).toBe(2026);
    expect(financialYearOf("2027-03-01", 4)).toBe(2026);
    expect(financialYearOf("2026-03-01", 4)).toBe(2025);
    expect(financialYearOf("2026-07-01", 8)).toBe(2025);
    expect(financialYearOf("2026-01-01", 1)).toBe(2026);
    expect(financialYearLabel(2026, 4)).toBe("2026/27");
    expect(financialYearLabel(2099, 4)).toBe("2099/00");
    expect(financialYearLabel(2026, 1)).toBe("2026");
  });

  it("lists a financial year's twelve months across the calendar year", () => {
    const months = financialYearMonths(2026, 4);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-04-01");
    expect(months[8]).toBe("2026-12-01");
    expect(months[9]).toBe("2027-01-01");
    expect(months[11]).toBe("2027-03-01");
  });

  it("risk-adjusts by confidence weight, zero without a confidence", () => {
    expect(riskAdjusted(1000, "plans_in_progress")).toBe(500);
    expect(riskAdjusted(333.33, "fully_developed_not_started")).toBe(266.66);
    expect(riskAdjusted(1000, null)).toBe(0);
    expect(riskAdjusted(1000, "opportunity", { ...DEFAULT_WEIGHTS, opportunity: 0.1 })).toBe(100);
  });

  it("suggests the run-rate full-year effect from the last three planned months", () => {
    expect(runRateFullYearEffect([])).toBeNull();
    expect(
      runRateFullYearEffect([
        { month: "2026-04-01", kind: "plan", recurrent: 10000, nonRecurrent: 0 },
        { month: "2026-05-01", kind: "plan", recurrent: 10000, nonRecurrent: 5000 },
        { month: "2026-06-01", kind: "plan", recurrent: 13000, nonRecurrent: 0 },
        { month: "2027-04-01", kind: "plan", recurrent: 13000, nonRecurrent: 0 },
        { month: "2027-05-01", kind: "actual", recurrent: 99999, nonRecurrent: 0 },
      ]),
    ).toBe(144000);
  });

  it("fills settings defaults and drops bad weights", () => {
    expect(toEfficiencySettings(null)).toEqual({
      requireAssessment: true,
      requireFinanceValidation: true,
      confidenceWeights: DEFAULT_WEIGHTS,
    });
    const s = toEfficiencySettings({
      requireAssessment: false,
      confidenceWeights: { opportunity: 0.1, plans_in_progress: 3, unknown: 1 },
    });
    expect(s.requireAssessment).toBe(false);
    expect(s.requireFinanceValidation).toBe(true);
    expect(s.confidenceWeights.opportunity).toBe(0.1);
    expect(s.confidenceWeights.plans_in_progress).toBe(0.5);
  });

  it("has NHS and neutral default categories", () => {
    expect(defaultCategories("nhs").map((c) => c.value)).toContain("agency_bank");
    expect(defaultCategories("general").map((c) => c.value)).toContain("process_improvement");
    expect(defaultCategories("nhs")).toHaveLength(8);
  });
});

describe("efficiency service mapping", () => {
  it("maps a scheme view row, falling back on unknown values", () => {
    const s = toScheme({
      id: "s1",
      organisation_id: "o",
      workspace_id: "w",
      ref: "EFF-1",
      title: "Agency reduction",
      stage: "warp",
      confidence: "maybe",
      savings_type: "pay",
      recurrence: null,
      plan_in_year: 38000,
      risk_adjusted_in_year: 19000,
      full_year_effect: null,
      financial_year: 2026,
    } as unknown as Parameters<typeof toScheme>[0]);
    expect(s.stage).toBe("idea");
    expect(s.confidence).toBeNull();
    expect(s.savingsType).toBe("pay");
    expect(s.recurrence).toBe("recurrent");
    expect(s.planInYear).toBe(38000);
    expect(s.actualInYear).toBe(0);
    expect(s.fullYearEffect).toBeNull();
  });

  it("maps a value row", () => {
    const v = toValue({
      id: "v",
      scheme_id: "s",
      month: "2026-04-01",
      kind: "actual",
      recurrent: 9000,
      non_recurrent: null,
      financial_year: 2026,
      validated_at: null,
      updated_at: "t",
    } as unknown as Parameters<typeof toValue>[0]);
    expect(v).toMatchObject({
      kind: "actual",
      recurrent: 9000,
      nonRecurrent: 0,
      financialYear: 2026,
    });
  });

  it("sends only the fields edited, normalised", () => {
    expect(schemeFields({ title: "  X  " })).toEqual({ title: "X" });
    expect(
      schemeFields({ startMonth: "2026-05-17", category: "", deliveryPlan: " ", confidence: null }),
    ).toEqual({ start_month: "2026-05-01", category: null, delivery_plan: null, confidence: null });
    expect(schemeFields({})).toEqual({});
  });
});
