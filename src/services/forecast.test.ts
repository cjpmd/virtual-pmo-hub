import { describe, expect, it } from "vitest";
import { getProjectForecast, type ForecastInput } from "./forecast";

// "Forecast Demo" worked example from the brief.
const input: ForecastInput = {
  baselineStart: new Date(2026, 0, 5),
  periodLengthDays: 14,
  baselinePeriods: 12,
  baselineScope: 480,
  completed: [22, 24, 26, 30, 38, 46],
  scopeHistory: [485, 490, 495, 500, 505, 510],
  ragToleranceDays: 14,
};

describe("forecast engine — Forecast Demo", () => {
  it("gap is 54 at end of sprint 6", () => expect(getProjectForecast(input).gapUnits).toBe(54));
  it("velocities: rolling3 38, last 46", () => {
    const f = getProjectForecast(input);
    expect(f.velocities.rolling3).toBe(38);
    expect(f.velocities.last).toBe(46);
  });
  it("v=46: no recovery, finish in sprint 14, recovering_late", () => {
    const f = getProjectForecast(input, "last");
    expect(f.recoveryPeriod).toBeNull();
    expect(f.finishPeriod).toBe(14);
    expect(f.deliveryStatus).toBe("recovering_late");
  });
  it("v=60: recovery at end of sprint 9", () =>
    expect(getProjectForecast(input, "last", { velocity: 60 }).recoveryPeriod).toBe(9));
  it("v=5: not converging", () => {
    const f = getProjectForecast(input, "last", { velocity: 5 });
    expect(f.converging).toBe(false);
    expect(f.deliveryStatus).toBe("not_converging");
  });
  it("fewer than 3 periods is insufficient evidence", () => {
    const f = getProjectForecast({ ...input, completed: [22, 24], scopeHistory: [485, 490] });
    expect(f.deliveryStatus).toBe("insufficient_evidence");
    expect(f.evidencedRag).toBe("Grey");
  });
});
