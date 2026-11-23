import { describe, expect, it } from "vitest";
import { answersToJson, toAnswers, toSteps } from "./impact-assessments";

describe("toAnswers", () => {
  it("keeps well-formed fields and drops the rest", () => {
    const a = toAnswers({
      screening: { workforce: { impact: "negative", consequence: 2, likelihood: "x" } },
      quality: { workforce: { impact: "bad", description: "Text", indicators: ["Falls", 3] } },
      equality: "nope",
    });
    expect(a.screening["workforce"]).toEqual({
      impact: "negative",
      consequence: 2,
      likelihood: undefined,
      note: undefined,
    });
    expect(a.quality["workforce"]?.impact).toBeUndefined();
    expect(a.quality["workforce"]?.indicators).toEqual(["Falls"]);
    expect(a.equality).toEqual({});
  });
});

describe("answersToJson", () => {
  it("drops undefined and empty fields", () => {
    expect(
      answersToJson({ age: { impact: "neutral", evidence: "", mitigation: undefined } }),
    ).toEqual({ age: { impact: "neutral" } });
  });
});

describe("toSteps", () => {
  it("reads the view's steps", () => {
    expect(
      toSteps([
        {
          step_id: "s1",
          order: 1,
          role: "medical_director",
          role_label: "Medical Director",
          decision: "approved",
          decided_at: "2026-11-23",
        },
        {
          step_id: "s2",
          order: 2,
          role: "chief_nurse",
          role_label: "Chief Nurse",
          decision: null,
          decided_at: null,
        },
      ]),
    ).toEqual([
      {
        stepId: "s1",
        order: 1,
        role: "medical_director",
        roleLabel: "Medical Director",
        decision: "approved",
        decidedAt: "2026-11-23",
      },
      {
        stepId: "s2",
        order: 2,
        role: "chief_nurse",
        roleLabel: "Chief Nurse",
        decision: null,
        decidedAt: null,
      },
    ]);
  });
});
