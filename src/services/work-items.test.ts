import { describe, expect, it } from "vitest";
import { effectiveTaskSource, effectiveTaskSourceValue, toTaskSource } from "./work-items";

describe("effectiveTaskSource (GL-3: Planner hidden while sync is off)", () => {
  it("treats Planner projects as native while Planner sync is off", () => {
    expect(effectiveTaskSource("Planner (Basic)", false)).toBe("Native");
    expect(effectiveTaskSource("Planner (Premium)", false)).toBe("Native");
    expect(effectiveTaskSource("Native", false)).toBe("Native");
  });
  it("keeps the stored source once Planner sync is on", () => {
    expect(effectiveTaskSource("Planner (Premium)", true)).toBe("Planner (Premium)");
    expect(effectiveTaskSource("Native", true)).toBe("Native");
  });
  it("defaults to the build's flag, which is off unless VITE_PLANNER_SYNC is true", () => {
    expect(effectiveTaskSource(toTaskSource("planner_premium"))).toBe("Native");
  });
});

describe("effectiveTaskSourceValue", () => {
  it("maps stored Planner values to native while sync is off", () => {
    expect(effectiveTaskSourceValue("planner_basic", false)).toBe("native");
    expect(effectiveTaskSourceValue("planner_premium", false)).toBe("native");
    expect(effectiveTaskSourceValue("native", false)).toBe("native");
    expect(effectiveTaskSourceValue(null, false)).toBe("native");
  });
  it("leaves stored values alone once sync is on", () => {
    expect(effectiveTaskSourceValue("planner_premium", true)).toBe("planner_premium");
    expect(effectiveTaskSourceValue(undefined, true)).toBe("native");
  });
});
