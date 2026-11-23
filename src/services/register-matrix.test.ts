import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  isRegisterCompatible,
  registerChoices,
  registerMatrixOf,
  rescoreItems,
  type RegisterMatrixOption,
  type RescoreCandidate,
} from "./register-matrix";

const five = [1, 2, 3, 4, 5].map((value) => ({ value, label: `L${value}` }));
const three = [1, 2, 3].map((value) => ({ value, label: `L${value}` }));
const ORG = "org-1";

const matrix = (over: Partial<RegisterMatrixOption>): RegisterMatrixOption => ({
  id: over.key ?? "m",
  key: "m",
  name: "M",
  organisationId: null,
  isDefault: false,
  likelihoodLevels: five,
  consequenceLevels: five,
  scoreMethod: "product",
  bands: [{ min: 1, label: "Low" }],
  ...over,
});

const systemDefault = matrix({
  id: "sys-default",
  key: "default",
  name: "Standard 5×5",
  isDefault: true,
});
const systemNhs = matrix({ id: "sys-nhs", key: "nhs_5x5", name: "NHS 5×5" });

describe("isRegisterCompatible", () => {
  it("accepts a 5 × 5 product matrix", () => {
    expect(isRegisterCompatible(systemNhs)).toBe(true);
  });
  it("refuses other sizes and lookup scoring", () => {
    expect(isRegisterCompatible(matrix({ likelihoodLevels: three }))).toBe(false);
    expect(isRegisterCompatible(matrix({ consequenceLevels: three }))).toBe(false);
    expect(isRegisterCompatible(matrix({ scoreMethod: "lookup" }))).toBe(false);
  });
});

describe("registerMatrixOf", () => {
  it("falls back to the system default", () => {
    expect(registerMatrixOf([systemDefault, systemNhs], ORG)).toEqual({
      matrix: systemDefault,
      own: false,
    });
  });
  it("prefers the organisation's own default", () => {
    const own = matrix({ id: "org-nhs", key: "nhs_5x5", organisationId: ORG, isDefault: true });
    expect(registerMatrixOf([systemDefault, systemNhs, own], ORG)).toEqual({
      matrix: own,
      own: true,
    });
  });
  it("ignores another organisation's default", () => {
    const other = matrix({ id: "x", key: "x", organisationId: "org-2", isDefault: true });
    expect(registerMatrixOf([systemDefault, other], ORG).own).toBe(false);
  });
});

describe("registerChoices", () => {
  it("lists compatible matrices once per key, the organisation's copy first", () => {
    const ownNhs = matrix({ id: "org-nhs", key: "nhs_5x5", name: "NHS 5×5", organisationId: ORG });
    const small = matrix({
      id: "small",
      key: "small",
      organisationId: ORG,
      likelihoodLevels: three,
    });
    const choices = registerChoices([systemDefault, systemNhs, ownNhs, small], ORG);
    expect(choices.map((c) => c.id)).toEqual(["org-nhs", "sys-default"]);
  });
});

describe("rescoreItems", () => {
  it("sends the proposal with the updated_at it was made against", () => {
    const candidate = {
      riskId: "r1",
      proposedProbability: 2,
      proposedImpact: 5,
      updatedAt: "2026-11-23T09:00:00Z",
    } as RescoreCandidate;
    expect(rescoreItems([candidate])).toEqual([
      { id: "r1", probability: 2, impact: 5, updated_at: "2026-11-23T09:00:00Z" },
    ]);
  });
});
