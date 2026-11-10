import { describe, expect, it } from "vitest";
import { defaultSettings } from "./settings-data";
import {
  benefitCategoriesFor,
  financialYearStartFor,
  sectorOptimismBias,
  tierDefinitionsFor,
  toSector,
} from "./sectors";

const universityWords = /student|research|academic|campus|facult|universit|institution|teaching/i;

describe("sector defaults (mirror migration 20261110113630_gl_8_sector)", () => {
  it("suggests the financial year by sector", () => {
    expect(financialYearStartFor("university")).toBe(8);
    expect(financialYearStartFor("public_sector")).toBe(4);
    expect(financialYearStartFor("general")).toBe(1);
  });

  it("reads a missing or unknown sector as University", () => {
    expect(toSector(undefined)).toBe("university");
    expect(toSector("charity")).toBe("university");
    expect(toSector("general")).toBe("general");
  });

  it("seeds the approved benefit categories", () => {
    expect(benefitCategoriesFor("general")).toEqual([
      "Efficiency",
      "Customer experience",
      "Employee experience",
      "Risk reduction",
      "Compliance",
      "Sustainability",
      "Income",
    ]);
    expect(benefitCategoriesFor("public_sector").slice(1, 3)).toEqual([
      "Service quality",
      "Public outcomes",
    ]);
    expect(benefitCategoriesFor("university").slice(1, 3)).toEqual([
      "Student experience",
      "Research",
    ]);
  });

  it("gives optimism bias for exactly the sector's categories", () => {
    for (const sector of ["university", "public_sector", "general"] as const) {
      const categories = sectorOptimismBias(sector).map((item) => item.category);
      expect([...categories].sort()).toEqual([...benefitCategoriesFor(sector)].sort());
    }
    expect(sectorOptimismBias("general")).toContainEqual({
      category: "Customer experience",
      percentage: 25,
    });
  });

  it("keeps university tier wording only for universities", () => {
    const large = (sector: "university" | "general") =>
      tierDefinitionsFor(sector).find((tier) => tier.tier === "Large")!;
    expect(large("university").guideline).toBe(
      "Over £250k, over 12 months, university-wide impact",
    );
    expect(large("university").description).toContain("institution-wide");
    expect(JSON.stringify(tierDefinitionsFor("general"))).not.toMatch(universityWords);
    expect(JSON.stringify(tierDefinitionsFor("public_sector"))).not.toMatch(universityWords);
  });

  it("ships General defaults with no university wording", () => {
    const { benefits, lists, lifecycle, regional, organisation } = defaultSettings;
    expect(organisation.sector).toBe("general");
    expect(regional.financialYearStartMonth).toBe(1);
    expect(JSON.stringify({ benefits, lists, tiers: lifecycle.tiers })).not.toMatch(
      universityWords,
    );
  });
});
