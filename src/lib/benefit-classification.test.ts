import { describe, expect, it } from "vitest";
import {
  cashSplit,
  CLASSIFICATION_VALUE,
  defaultClassification,
  isCashReleasing,
  notionalValue,
} from "./benefit-classification";

const benefits = {
  categoryClassification: {
    cash_releasing_efficiency: "cash_releasing" as const,
    bed_days_saved: "non_cash_releasing" as const,
    odd: "nonsense" as never,
  },
  categoryKeys: {
    "Cash-releasing efficiency": "cash_releasing_efficiency",
    "Beds freed": "bed_days_saved",
  },
};

describe("defaultClassification", () => {
  it("reads the map by lookup value", () => {
    expect(defaultClassification({ value: "cash_releasing_efficiency" }, benefits)).toBe(
      "Cash-releasing",
    );
  });
  it("reads by label through categoryKeys (a renamed category keeps its value)", () => {
    expect(defaultClassification({ label: "Beds freed" }, benefits)).toBe("Non-cash-releasing");
  });
  it("returns null when unmapped, unknown or invalid", () => {
    expect(defaultClassification({ value: "research" }, benefits)).toBeNull();
    expect(defaultClassification({ label: "Unknown" }, benefits)).toBeNull();
    expect(defaultClassification({ value: "odd" }, benefits)).toBeNull();
    expect(defaultClassification({ value: "bed_days_saved" }, undefined)).toBeNull();
  });
});

describe("cashSplit", () => {
  it("keeps cash-releasing and non-cash apart and ignores negatives", () => {
    expect(
      cashSplit([
        { classification: "Cash-releasing", planned: 100, realised: 40 },
        { classification: "Non-cash-releasing", planned: 50, realised: 10 },
        { classification: "Qualitative", planned: 20, realised: 0 },
        { classification: "Societal", planned: -5, realised: -1 },
      ]),
    ).toEqual({ cashPlanned: 100, cashRealised: 40, nonCashPlanned: 70, nonCashRealised: 10 });
  });
  it("is zero for no benefits", () => {
    expect(cashSplit([])).toEqual({
      cashPlanned: 0,
      cashRealised: 0,
      nonCashPlanned: 0,
      nonCashRealised: 0,
    });
  });
});

describe("helpers", () => {
  it("recognises cash-releasing by label or value", () => {
    expect(isCashReleasing("Cash-releasing")).toBe(true);
    expect(isCashReleasing("cash_releasing")).toBe(true);
    expect(isCashReleasing("Non-cash-releasing")).toBe(false);
    expect(CLASSIFICATION_VALUE["Societal"]).toBe("societal");
  });
  it("works out a notional value only with a valid factor", () => {
    expect(notionalValue(120, 32.5)).toBe(3900);
    expect(notionalValue(120, null)).toBeNull();
    expect(notionalValue(120, -1)).toBeNull();
    expect(notionalValue(Number.NaN, 2)).toBeNull();
  });
});
