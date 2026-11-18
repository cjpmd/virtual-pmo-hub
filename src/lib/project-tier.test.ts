import { describe, expect, it } from "vitest";
import type { TierDefinition } from "@/data/types";
import {
  TIER_REASON_MAX,
  tierChangeActivity,
  tierChangeTitle,
  tierDisplayName,
  tierOptions,
  tierReasonError,
} from "./project-tier";

const defs: TierDefinition[] = [
  { tier: "Large", description: "", guideline: "Over £250k", label: "Major programme" },
  { tier: "Small", description: "", guideline: "Under £50k", label: "  Minor change " },
  { tier: "Medium", description: "", guideline: "£50k–£250k", label: "   " },
];

describe("tierDisplayName", () => {
  it("uses the organisation's trimmed label", () => {
    expect(tierDisplayName("Small", defs)).toBe("Minor change");
    expect(tierDisplayName("Large", defs)).toBe("Major programme");
  });
  it("falls back to the stored name for a blank or missing label", () => {
    expect(tierDisplayName("Medium", defs)).toBe("Medium");
    expect(tierDisplayName("Small", [])).toBe("Small");
  });
});

describe("tierOptions", () => {
  it("lists every tier in size order, whatever order settings hold them in", () => {
    expect(tierOptions(defs)).toEqual([
      { value: "Small", label: "Minor change", guideline: "Under £50k" },
      { value: "Medium", label: "Medium", guideline: "£50k–£250k" },
      { value: "Large", label: "Major programme", guideline: "Over £250k" },
    ]);
  });
  it("still offers all three tiers with no definitions", () => {
    expect(tierOptions([]).map((item) => item.label)).toEqual(["Small", "Medium", "Large"]);
  });
});

describe("tierReasonError", () => {
  it("needs at least three characters after trimming", () => {
    expect(tierReasonError("")).not.toBeNull();
    expect(tierReasonError("  ab  ")).not.toBeNull();
    expect(tierReasonError(" abc ")).toBeNull();
  });
  it("refuses more than the database's limit", () => {
    expect(tierReasonError("x".repeat(TIER_REASON_MAX))).toBeNull();
    expect(tierReasonError("x".repeat(TIER_REASON_MAX + 1))).toMatch(/under 500/);
  });
});

describe("tierChangeTitle", () => {
  it("names both tiers in the organisation's labels", () => {
    expect(tierChangeTitle("Small", "Large", defs)).toBe(
      "Tier changed: Minor change → Major programme",
    );
  });
});

describe("tierChangeActivity", () => {
  it("builds a timeline entry with labels, reason and who", () => {
    const entry = tierChangeActivity(
      {
        changedAt: "2026-11-18T10:15:00+00:00",
        from: "Small",
        to: "Large",
        reason: "Scope now covers three directorates",
        changedBy: "Alex Kim",
      },
      defs,
    );
    expect(entry.kind).toBe("Tier changed");
    expect(entry.label).toBe("Tier changed: Minor change → Major programme");
    expect(entry.detail).toBe("Scope now covers three directorates · Alex Kim");
    expect(entry.date).toMatch(/^2026-11-1[78]$/);
  });
  it("says so when an older change has no reason or no recorded person", () => {
    const entry = tierChangeActivity(
      {
        changedAt: "2025-01-02T12:00:00Z",
        from: "Large",
        to: "Medium",
        reason: null,
        changedBy: null,
      },
      [],
    );
    expect(entry.label).toBe("Tier changed: Large → Medium");
    expect(entry.detail).toBe("No reason recorded · Unknown");
    expect(entry.date).toBe("2025-01-02");
  });
});
