import { describe, expect, it } from "vitest";
import { emptySampleIds, isSample, type SampleIds } from "./sample-data";

const ids: SampleIds = {
  ...emptySampleIds,
  project: new Set(["p1"]),
  projectCode: new Set(["CRM"]),
  risk: new Set(["r1"]),
  active: true,
};

describe("isSample", () => {
  it("matches only ids of the given kind", () => {
    expect(isSample(ids, "project", "p1")).toBe(true);
    expect(isSample(ids, "risk", "p1")).toBe(false);
    expect(isSample(ids, "projectCode", "CRM")).toBe(true);
    expect(isSample(ids, "project", "p2")).toBe(false);
  });
  it("reads as not sample before the ids load, or with no id", () => {
    expect(isSample(undefined, "project", "p1")).toBe(false);
    expect(isSample(ids, "project", null)).toBe(false);
    expect(isSample(ids, "project", "")).toBe(false);
  });
});
