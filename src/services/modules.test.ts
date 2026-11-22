import { describe, expect, it } from "vitest";
import { parsePackPlan } from "./modules";

describe("parsePackPlan", () => {
  it("reads the RPC's jsonb", () => {
    const plan = parsePackPlan({
      pack: "nhs",
      previous_pack: "general",
      modules_on: ["assurance", "teleport"],
      modules_already_on: ["efficiency"],
      terms_added: { "efficiency.scheme": "CIP scheme", bad: 3 },
      terms_kept: ["orgUnit"],
      seeded: [{ list: "governance_role", value: "medical_director", label: "Medical Director" }],
      financial_year_start_month: 8,
      suggested_financial_year_start_month: 4,
      applied: false,
    });
    expect(plan.modulesOn).toEqual(["assurance"]);
    expect(plan.modulesAlreadyOn).toEqual(["efficiency"]);
    expect(plan.termsAdded).toEqual({ "efficiency.scheme": "CIP scheme" });
    expect(plan.seeded[0]?.label).toBe("Medical Director");
    expect(plan.financialYearStartMonth).toBe(8);
    expect(plan.suggestedFinancialYearStartMonth).toBe(4);
    expect(plan.applied).toBe(false);
  });

  it("is safe on an empty answer", () => {
    const plan = parsePackPlan(null);
    expect(plan.pack).toBe("general");
    expect(plan.modulesOn).toEqual([]);
    expect(plan.suggestedFinancialYearStartMonth).toBeNull();
  });
});
