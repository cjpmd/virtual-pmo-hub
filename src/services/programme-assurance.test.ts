import { describe, expect, it } from "vitest";
import {
  directionOf,
  pickAssuranceScheme,
  ratingChoices,
  type AssuranceScheme,
  type ProgrammeRating,
} from "./programme-assurance";

const level = (key: string) => ({ key, label: key, colour: null });
const nhs: AssuranceScheme = {
  id: "s-nhs",
  key: "nhs_assurance",
  name: "NHS",
  organisationId: null,
  levels: ["substantial", "reasonable", "limited", "no_assurance", "not_reported"].map(level),
};
const own: AssuranceScheme = {
  id: "s-own",
  key: "audit",
  name: "Internal audit",
  organisationId: "org",
  levels: ["full", "partial", "none"].map(level),
};
const other: AssuranceScheme = { ...own, id: "s-other", organisationId: "other" };
const rating = (key: string): ProgrammeRating => ({
  id: key,
  rating: key,
  label: key,
  colour: null,
  rationale: "",
  forumId: null,
  ratedOn: "2026-11-01",
  createdBy: null,
});

describe("pickAssuranceScheme", () => {
  it("uses the scheme named in settings, the organisation's own first", () => {
    expect(pickAssuranceScheme([nhs, other, own], "org", "audit")?.id).toBe("s-own");
    expect(pickAssuranceScheme([nhs, own], "org", "nhs_assurance")?.id).toBe("s-nhs");
  });
  it("falls back to the organisation's own scheme, then the system NHS scheme", () => {
    expect(pickAssuranceScheme([nhs, own], "org", null)?.id).toBe("s-own");
    expect(pickAssuranceScheme([nhs, other], "org", "missing")?.id).toBe("s-nhs");
    expect(pickAssuranceScheme([other], "org", null)).toBeNull();
  });
});

describe("directionOf", () => {
  it("compares the two newest ratings by position in the scheme", () => {
    expect(directionOf([], nhs)).toBe("new");
    expect(directionOf([rating("limited")], nhs)).toBe("new");
    expect(directionOf([rating("limited"), rating("reasonable")], nhs)).toBe("worse");
    expect(directionOf([rating("substantial"), rating("reasonable")], nhs)).toBe("better");
    expect(directionOf([rating("limited"), rating("limited")], nhs)).toBe("same");
    expect(directionOf([rating("limited"), rating("unknown")], nhs)).toBe("same");
  });
});

describe("ratingChoices", () => {
  it("leaves out the not-reported placeholder", () => {
    expect(ratingChoices(nhs).map((l) => l.key)).toEqual([
      "substantial",
      "reasonable",
      "limited",
      "no_assurance",
    ]);
    expect(ratingChoices(null)).toEqual([]);
  });
});
