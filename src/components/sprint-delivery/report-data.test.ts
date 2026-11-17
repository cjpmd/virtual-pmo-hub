import { describe, expect, it } from "vitest";
import {
  closedPeriodCount,
  getDelivery,
  getForecastFor,
  registerDeliveryProjects,
} from "@/services/sprints";
import { burnUpSeries, sprintDaily } from "./report-data";

// The browser-local sprint store generates a deterministic project from these fields.
const code = "GL20C-TEST";
registerDeliveryProjects([
  { code, state: "In delivery", manager: "Ada Lovelace", taskSource: "Native", people: ["Ada"] },
]);

describe("burnUpSeries", () => {
  const d = getDelivery(code);
  const f = getForecastFor(code);
  const rows = burnUpSeries(d, f);
  const n = closedPeriodCount(d);

  it("has one row per period from 0, in order", () => {
    expect(rows.length).toBeGreaterThan(n);
    rows.forEach((row, index) => expect(row.period).toBe(index));
  });
  it("starts at the baseline scope with nothing done", () => {
    expect(rows[0]?.scope).toBe(d.settings.baselineScope);
    expect(rows[0]?.done).toBe(0);
  });
  it("never plans more than the baseline scope", () => {
    for (const row of rows) expect(row.planned).toBeLessThanOrEqual(d.settings.baselineScope);
    expect(rows.at(-1)?.planned).toBe(
      Math.round(
        Math.min(
          d.settings.baselineScope,
          ((rows.length - 1) * d.settings.baselineScope) / d.settings.baselinePeriods,
        ),
      ),
    );
  });
  it("forecasts from the last closed period, inside its range and the forecast scope", () => {
    for (const row of rows.slice(n)) {
      expect(row.forecast).toBeLessThanOrEqual(row.forecastScope!);
      expect(row.cone?.length).toBe(2);
    }
    for (const row of rows.slice(0, n)) expect(row.forecast).toBeUndefined();
  });
});

describe("sprintDaily", () => {
  const d = getDelivery(code);
  const sprint = d.sprints.find((s) => s.status === "active") ?? d.sprints[0];

  it("gives an ideal line from the commitment down to zero", () => {
    if (!sprint) return;
    const result = sprintDaily(d, sprint);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0]?.ideal).toBe(Math.round(result.committed * 10) / 10);
    if (result.rows.length > 1) expect(result.rows.at(-1)?.ideal).toBe(0);
    for (const row of result.rows) expect(row.ideal).toBeLessThanOrEqual(result.committed);
  });
});
