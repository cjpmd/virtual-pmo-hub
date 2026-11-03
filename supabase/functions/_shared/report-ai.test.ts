import { describe, expect, it } from "vitest";
import { draftToMarkdown, evidenceFrom, userPrompt } from "./report-ai";

const evidence = evidenceFrom({
  context: {
    title: "Programme pack",
    as_at: "2026-11-05",
    scope_type: "programme",
    forum: { name: "Digital Care Programme Board" },
    scheme: { levels: [{ key: "limited", label: "Limited assurance", rag: "red" }] },
  },
  metrics: [
    {
      code: "RD04",
      name: "Clinical Messaging",
      programme: "Digital Care",
      metrics: {
        evidenced_rating: "red",
        max_milestone_slip_days: 40,
        owner_email: "x@y.z",
        budget: 1000000,
      },
    },
  ],
  inclusions: [{ code: "RD04", reasons: [{ label: "Schedule slip beyond tolerance" }] }],
});

describe("evidenceFrom", () => {
  it("keeps only the listed metrics (no people, no free text)", () => {
    expect(evidence.projects[0]?.metrics).toEqual({
      evidenced_rating: "red",
      max_milestone_slip_days: 40,
    });
    expect(JSON.stringify(evidence)).not.toContain("x@y.z");
  });
  it("carries the scheme labels and deep-dive reasons", () => {
    expect(evidence.scheme[0]?.label).toBe("Limited assurance");
    expect(evidence.deep_dives[0]?.reasons).toEqual(["Schedule slip beyond tolerance"]);
    expect(userPrompt(evidence)).toContain("Digital Care Programme Board");
  });
});

describe("draftToMarkdown", () => {
  it("formats summary, key points and asks", () => {
    const md = draftToMarkdown(
      JSON.stringify({
        summary: "Mostly on track.",
        key_points: ["RD04 slipped 40 days"],
        decisions_or_asks: [],
      }),
    );
    expect(md).toBe("Mostly on track.\n\n**Key points**\n\n- RD04 slipped 40 days");
  });
  it("rejects an empty summary", () => {
    expect(() =>
      draftToMarkdown(JSON.stringify({ summary: " ", key_points: [], decisions_or_asks: [] })),
    ).toThrow();
  });
});
