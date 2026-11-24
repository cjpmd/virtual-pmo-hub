import { describe, expect, it } from "vitest";
import {
  defaultImpactTemplate,
  missingItems,
  screeningResult,
  signoffRoute,
  toImpactTemplate,
  type AssessmentAnswers,
} from "./impact-assessment";

const nhs = defaultImpactTemplate("nhs");
const neutral = (keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, { impact: "neutral" as const, description: "None" }]));
const base = (): AssessmentAnswers => ({
  screening: neutral(nhs.domains.map((d) => d.key)),
  quality: {},
  equality: neutral(nhs.equality.map((d) => d.key)),
});

describe("default templates", () => {
  it("NHS: five quality domains, the nine protected characteristics plus two, MD then CN", () => {
    expect(nhs.domains).toHaveLength(5);
    expect(nhs.equality.map((e) => e.key)).toContain("sexual_orientation");
    expect(nhs.equality.map((e) => e.key)).toContain("health_inequalities");
    expect(nhs.equality).toHaveLength(11);
    expect(nhs.signoff).toEqual(["medical_director", "chief_nurse"]);
  });
  it("general: neutral wording and a quality lead", () => {
    const general = defaultImpactTemplate("general");
    expect(general.domains.map((d) => d.label).join(" ")).not.toMatch(/patient/i);
    expect(general.equality).toHaveLength(10);
    expect(general.signoff).toEqual(["quality_lead"]);
  });
});

describe("screeningResult", () => {
  it("all neutral: score 0, no full assessment", () => {
    expect(screeningResult(nhs, base())).toEqual({ maxScore: 0, fullRequired: false });
  });
  it("takes the highest negative score and compares it with the threshold", () => {
    const a = base();
    a.screening["workforce"] = { impact: "negative", consequence: 2, likelihood: 2 };
    expect(screeningResult(nhs, a)).toEqual({ maxScore: 4, fullRequired: false });
    a.screening["patient_safety"] = { impact: "negative", consequence: 4, likelihood: 2 };
    expect(screeningResult(nhs, a)).toEqual({ maxScore: 8, fullRequired: true });
  });
  it("ignores positive impacts and out-of-range levels", () => {
    const a = base();
    a.screening["workforce"] = { impact: "positive", consequence: 5, likelihood: 5 };
    a.screening["patient_safety"] = { impact: "negative", consequence: 9, likelihood: 5 };
    expect(screeningResult(nhs, a).maxScore).toBe(0);
  });
  it("a negative equality impact needs a full assessment unless the template says not", () => {
    const a = base();
    a.equality["disability"] = { impact: "negative" };
    expect(screeningResult(nhs, a).fullRequired).toBe(true);
    expect(screeningResult({ ...nhs, equalityNegativeRequiresFull: false }, a).fullRequired).toBe(
      false,
    );
  });
});

describe("missingItems", () => {
  it("lists unanswered screening and equality items", () => {
    const missing = missingItems(nhs, { screening: {}, quality: {}, equality: {} });
    expect(missing).toContain("Screening: Patient safety");
    expect(missing).toContain("Equality: Age");
    expect(missing.some((m) => m.startsWith("Full assessment"))).toBe(false);
  });
  it("a negative screening answer needs both levels", () => {
    const a = base();
    a.screening["workforce"] = { impact: "negative", consequence: 2 };
    expect(missingItems(nhs, a)).toEqual(["Screening: Workforce and staff wellbeing"]);
  });
  it("a full assessment needs every domain described, negatives mitigated and equality evidenced", () => {
    const a = base();
    a.equality["disability"] = { impact: "negative" };
    const missing = missingItems(nhs, a);
    expect(missing).toContain("Equality: Disability");
    expect(missing.filter((m) => m.startsWith("Full assessment"))).toHaveLength(5);
    a.equality["disability"] = { impact: "negative", evidence: "Survey", mitigation: "Ramp" };
    a.quality = neutral(nhs.domains.map((d) => d.key));
    a.quality["patient_safety"] = {
      impact: "negative",
      description: "Fewer beds",
      consequence: 2,
      likelihood: 2,
    };
    expect(missingItems(nhs, a)).toEqual(["Full assessment: Patient safety"]);
    a.quality["patient_safety"] = {
      ...a.quality["patient_safety"],
      mitigations: "Escalation beds",
    };
    expect(missingItems(nhs, a)).toEqual([]);
  });
});

describe("signoffRoute and toImpactTemplate", () => {
  it("adds the full route only for a full assessment, without repeats", () => {
    const t = { ...nhs, fullSignoff: ["head_of_pmo", "chief_nurse"] };
    expect(signoffRoute(t, false)).toEqual(["medical_director", "chief_nurse"]);
    expect(signoffRoute(t, true)).toEqual(["medical_director", "chief_nurse", "head_of_pmo"]);
  });
  it("reads a stored template and falls back to the pack default for missing parts", () => {
    const t = toImpactTemplate({ version: 3, fullAssessmentMinScore: 4, domains: "bad" }, "nhs");
    expect(t.version).toBe(3);
    expect(t.fullAssessmentMinScore).toBe(4);
    expect(t.domains).toEqual(nhs.domains);
    expect(t.signoff).toEqual(nhs.signoff);
  });
});
