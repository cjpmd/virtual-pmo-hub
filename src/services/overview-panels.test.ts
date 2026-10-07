import { describe, expect, it } from "vitest";
import { buildSignals, type SignalInput } from "./overview-panels";

const base: SignalInput = {
  today: "2026-09-21",
  scopeName: "DTS",
  spendPercent: undefined,
  milestonePercent: undefined,
  milestoneYearEndPercent: undefined,
  active: [],
  projectHistory: [],
  watch: [],
  pathway: undefined,
  previousPathwayRag: new Map(),
  programmeIds: null,
  money: (v) => `£${v}`,
};
const benefit = (id: string, hasPathway: boolean) =>
  ({ id, title: id, programmeId: "p", updatedAt: "2026-09-01", hasPathway }) as never;

describe("overview signals", () => {
  it("flags spend leading milestones only above 15 points", () => {
    expect(buildSignals({ ...base, spendPercent: 51, milestonePercent: 35 })[0]?.id).toBe(
      "spend-lead",
    );
    expect(buildSignals({ ...base, spendPercent: 50, milestonePercent: 35 })).toHaveLength(0);
  });
  it("flags milestones forecast to land under 90% of plan", () => {
    expect(buildSignals({ ...base, milestoneYearEndPercent: 88 })[0]?.id).toBe(
      "milestones-landing",
    );
    expect(buildSignals({ ...base, milestoneYearEndPercent: 90 })).toHaveLength(0);
  });
  it("flags benefits with no pathway and caps the list at five", () => {
    const benefits = Array.from({ length: 7 }, (_, i) => benefit(`b${i}`, false));
    const out = buildSignals({
      ...base,
      pathway: { capabilities: [], outcomes: [], benefits: [...benefits, benefit("ok", true)] },
    });
    expect(out).toHaveLength(5);
    expect(out.every((s) => s.id.startsWith("benefit-path-"))).toBe(true);
  });
  it("flags a capability awaiting acceptance past its target date", () => {
    const capability = {
      id: "c",
      title: "C",
      programmeId: "p",
      updatedAt: "2026-09-01",
      rag: "On Track",
      reason: "",
      status: "delivered",
      targetDate: "2026-09-01",
      awaitingAcceptancePastTarget: true,
    } as never;
    const out = buildSignals({
      ...base,
      pathway: { capabilities: [capability], outcomes: [], benefits: [] },
    });
    expect(out.map((s) => s.id)).toEqual(["cap-accept-c"]);
  });
});
