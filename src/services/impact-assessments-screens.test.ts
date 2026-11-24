// NHS-3 part 2: pure helpers behind the assessment panel, register and settings.
import { describe, expect, it } from "vitest";
import { defaultImpactTemplate, templateKey } from "@/data/impact-assessment";
import { isPathEnabled } from "@/lib/modules";
import { defaultSettings } from "@/data/settings-data";
import type { AppSettings } from "@/data/settings-types";
import {
  cleanAnswers,
  decidableSteps,
  filterRegister,
  needsAttention,
  type AssessmentRegisterRow,
  type AssessmentStep,
} from "./impact-assessments";
import { impactGatePhaseOf } from "./org-settings";

const row = (patch: Partial<AssessmentRegisterRow>): AssessmentRegisterRow => ({
  id: "a",
  entityType: "project",
  entityId: "p",
  targetName: "Project",
  projectCode: "P1",
  title: "QIA",
  status: "draft",
  version: 1,
  fullRequired: false,
  screeningMaxScore: 0,
  reviewDate: null,
  reviewOverdue: false,
  negativeDomains: 0,
  negativeEquality: 0,
  stepsTotal: 0,
  stepsApproved: 0,
  steps: [],
  hasConditions: false,
  isSample: false,
  ...patch,
});

describe("register filters", () => {
  const rows = [
    row({ id: "1", status: "draft" }),
    row({ id: "2", status: "in_review" }),
    row({ id: "3", status: "approved", reviewOverdue: true }),
    row({ id: "4", status: "approved" }),
    row({ id: "5", status: "reassessment_required" }),
  ];
  it("needs attention: awaiting sign-off, re-assessment or an overdue review", () => {
    expect(rows.filter(needsAttention).map((r) => r.id)).toEqual(["2", "3", "5"]);
  });
  it("filters by chip", () => {
    expect(filterRegister(rows, "all")).toHaveLength(5);
    expect(filterRegister(rows, "attention").map((r) => r.id)).toEqual(["2", "3", "5"]);
    expect(filterRegister(rows, "approved").map((r) => r.id)).toEqual(["3", "4"]);
  });
});

describe("decidableSteps", () => {
  const steps: AssessmentStep[] = [
    {
      stepId: "s1",
      order: 1,
      role: "medical_director",
      roleLabel: "MD",
      decision: "approved",
      decidedAt: "2026-11-01",
    },
    {
      stepId: "s2",
      order: 2,
      role: "chief_nurse",
      roleLabel: "CN",
      decision: null,
      decidedAt: null,
    },
    { stepId: "s3", order: 3, role: null, roleLabel: "", decision: null, decidedAt: null },
  ];
  it("only undecided steps for roles the person holds, while awaiting sign-off", () => {
    const held = new Set(["medical_director", "chief_nurse"]);
    expect(decidableSteps("in_review", steps, held).map((s) => s.stepId)).toEqual(["s2"]);
    expect(decidableSteps("approved", steps, held)).toEqual([]);
    expect(decidableSteps("in_review", steps, new Set(["medical_director"]))).toEqual([]);
  });
});

describe("cleanAnswers", () => {
  const template = defaultImpactTemplate("general");
  it("trims text, drops blank indicators and keys not in the template", () => {
    const clean = cleanAnswers(template, {
      screening: { safety: { impact: "neutral", note: "  " }, gone: { impact: "negative" } },
      quality: {
        safety: { impact: "neutral", description: " Fine ", indicators: ["A ", "", " "] },
      },
      equality: { age: { impact: "neutral", evidence: " e " } },
    });
    expect(clean.screening).toEqual({ safety: { impact: "neutral", note: undefined } });
    expect(clean.quality["safety"]).toMatchObject({ description: "Fine", indicators: ["A"] });
    expect(clean.equality["age"]).toMatchObject({ evidence: "e", mitigation: undefined });
    expect(
      cleanAnswers(template, {
        screening: {},
        quality: { safety: { indicators: [""] } },
        equality: {},
      }).quality["safety"]?.indicators,
    ).toBeUndefined();
  });
});

describe("templateKey", () => {
  it("makes a valid, unique key from a label", () => {
    const valid = /^[a-z][a-z0-9_]{1,39}$/;
    expect(templateKey("Carers' needs", [])).toBe("carers_needs");
    expect(templateKey("Carers needs", ["carers_needs"])).toBe("carers_needs_2");
    expect(templateKey("2nd language", [])).toBe("nd_language");
    for (const label of ["!", "x", "é", "A".repeat(80)])
      expect(templateKey(label, [])).toMatch(valid);
  });
});

describe("impact gate setting", () => {
  it("reads settings.impactAssessment.gate.phaseId", () => {
    expect(impactGatePhaseOf({ gate: { phaseId: "ph" } })).toBe("ph");
    expect(impactGatePhaseOf({ gate: null })).toBeNull();
    expect(impactGatePhaseOf(undefined)).toBeNull();
  });
  it("hides the register while the module is off", () => {
    const settings = (on: boolean): AppSettings => ({
      ...defaultSettings,
      modules: { enabled: { impact_assessment: on }, pack: "general" },
    });
    expect(isPathEnabled("/governance/impact-assessments", settings(false))).toBe(false);
    expect(isPathEnabled("/governance/impact-assessments", settings(true))).toBe(true);
  });
});
