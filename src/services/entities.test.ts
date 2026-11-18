import { describe, expect, it } from "vitest";
import { toTierChange } from "./entities";

describe("toTierChange", () => {
  it("maps a project_tier_history row to the screen's shape", () => {
    expect(
      toTierChange({
        changed_at: "2026-11-18T10:15:00+00:00",
        from_tier: "small",
        to_tier: "large",
        reason: "  Scope grew  ",
        changed_by: "Alex Kim",
      }),
    ).toEqual({
      changedAt: "2026-11-18T10:15:00+00:00",
      from: "Small",
      to: "Large",
      reason: "Scope grew",
      changedBy: "Alex Kim",
    });
  });
  it("treats a missing reason or name as null (changes from before reasons were kept)", () => {
    const row = toTierChange({
      changed_at: "2025-01-02T12:00:00Z",
      from_tier: "large",
      to_tier: "medium",
      reason: null as unknown as string,
      changed_by: "",
    });
    expect(row.reason).toBeNull();
    expect(row.changedBy).toBeNull();
  });
});
