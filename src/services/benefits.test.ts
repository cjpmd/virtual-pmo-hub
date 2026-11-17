import { describe, expect, it } from "vitest";
import {
  benefitStatusLabel,
  benefitStatusValue,
  classificationLabel,
  classificationValue,
  confidenceLabel,
  confidenceValue,
  frequencyLabel,
  frequencyValue,
  measurementStatusLabel,
  periodFor,
  type BenefitPeriod,
} from "./benefits";

describe("benefit labels", () => {
  it("round-trips every database value through its label", () => {
    const pairs = [
      [benefitStatusLabel, benefitStatusValue],
      [classificationLabel, classificationValue],
      [confidenceLabel, confidenceValue],
      [frequencyLabel, frequencyValue],
    ] as const;
    for (const [labels, values] of pairs) {
      for (const [value, label] of Object.entries(labels)) {
        expect((values as Record<string, string>)[label]).toBe(value);
      }
    }
  });
  it("labels the database enums as the screens show them", () => {
    expect(benefitStatusLabel.in_realisation).toBe("In realisation");
    expect(frequencyLabel.annually).toBe("Annually");
    expect(measurementStatusLabel.queried).toBe("Queried");
  });
});

describe("periodFor", () => {
  const periods: BenefitPeriod[] = [
    { id: "p1", period: "Q1", start: "2026-08-01", end: "2026-10-31" },
    { id: "p2", period: "Q2", start: "2026-11-01", end: "2027-01-31" },
  ];
  it("finds the period holding the date", () => {
    expect(periodFor(periods, "2026-08-01")?.id).toBe("p1");
    expect(periodFor(periods, "2026-12-25")?.id).toBe("p2");
  });
  it("falls back to the latest period that has started, else none", () => {
    expect(periodFor(periods, "2027-06-01")?.id).toBe("p2");
    expect(periodFor(periods, "2026-01-01")).toBeUndefined();
  });
});
