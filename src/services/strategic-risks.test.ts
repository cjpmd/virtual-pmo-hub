import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/data/settings-data";
import type { AppSettings } from "@/data/settings-types";
import { isPathEnabled } from "@/lib/modules";
import {
  inputFromRisk,
  strategicRiskColumns,
  toAssuranceLevels,
  toBand,
  toMatrixLevels,
  toStrategicRiskView,
  trendText,
} from "./strategic-risks";

describe("trendText", () => {
  it("never relies on the arrow alone", () => {
    expect(trendText("new", null)).toBe("New");
    expect(trendText("same", 9)).toBe("No change");
    expect(trendText("up", 9)).toBe("Up from 9");
    expect(trendText("down", 16)).toBe("Down from 16");
  });
});

describe("toBand and level parsing", () => {
  it("reads the band jsonb from the view", () => {
    expect(toBand({ key: "high", label: "High", colour: "#c2410c", rank: 3 })).toEqual({
      key: "high",
      label: "High",
      colour: "#c2410c",
    });
    expect(toBand(null)).toBeNull();
  });
  it("reads matrix levels and drops malformed ones", () => {
    expect(toMatrixLevels([{ value: 1, label: "Rare" }, { label: "x" }, 3])).toEqual([
      { value: 1, label: "Rare" },
    ]);
  });
  it("leaves 'not reported' out of the rating choices", () => {
    const levels = toAssuranceLevels([
      { key: "substantial", label: "Substantial assurance", colour: "#2e7d52" },
      { key: "not_reported", label: "Not reported" },
    ]);
    expect(levels.map((level) => level.key)).toEqual(["substantial"]);
  });
});

describe("strategicRiskColumns", () => {
  it("trims text, blanks empty fields and sends initial and target as pairs", () => {
    const input = {
      ...inputFromRisk(null),
      title: "  Workforce supply ",
      keyControls: "  ",
      initialLikelihood: 4,
      initialConsequence: null,
      targetLikelihood: 2,
      targetConsequence: 3,
    };
    const columns = strategicRiskColumns(input);
    expect(columns.title).toBe("Workforce supply");
    expect(columns.key_controls).toBeNull();
    expect([columns.initial_likelihood, columns.initial_consequence]).toEqual([null, null]);
    expect([columns.target_likelihood, columns.target_consequence]).toEqual([2, 3]);
    expect(columns.current_likelihood).toBe(3);
  });
});

describe("toStrategicRiskView", () => {
  it("maps the view row", () => {
    const view = toStrategicRiskView({
      id: "r1",
      ref: "BAF1",
      title: "Elective recovery",
      trend: "down",
      previous_score: 16,
      current_score: 9,
      current_band: { key: "high", label: "High", colour: "#c2410c" },
      above_appetite: false,
      status: "open",
      current_likelihood: 3,
      current_consequence: 3,
      linked_risk_count: 2,
    } as unknown as Parameters<typeof toStrategicRiskView>[0]);
    expect(view.trend).toBe("down");
    expect(view.currentBand?.label).toBe("High");
    expect(view.linkedRiskCount).toBe(2);
    expect(view.description).toBe("");
  });
});

describe("navigation", () => {
  const settings = (on: boolean): AppSettings => ({
    ...defaultSettings,
    modules: { enabled: { assurance: on }, pack: "general" },
  });
  it("hides Board assurance while the module is off", () => {
    expect(isPathEnabled("/governance/assurance", settings(false))).toBe(false);
    expect(isPathEnabled("/governance/assurance", settings(true))).toBe(true);
    expect(isPathEnabled("/governance/raidd", settings(false))).toBe(true);
  });
});
