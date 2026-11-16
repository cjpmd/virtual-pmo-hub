import { describe, expect, it } from "vitest";
import {
  buildProgressChart,
  committeeDatesFromReports,
  fyStart,
  type ProgressInputs,
  type PublishedPackRow,
} from "./progress-chart";

const empty: ProgressInputs = {
  money: [],
  tasks: [],
  risks: [],
  pathway: [],
  pathwayDates: [],
  committees: [],
};
const base = {
  milestones: [],
  history: [],
  projectHistory: [],
  liveGreen: 50,
  programmeIds: null,
  today: "2026-09-21",
  fyStartMonth: 8,
  range: "fy" as const,
};

describe("progress chart", () => {
  it("starts the financial year on the configured month", () => {
    expect(fyStart("2026-09", 8)).toBe("2026-08");
    expect(fyStart("2026-07", 8)).toBe("2025-08");
  });

  it("shows the gap callout only when spend leads milestones by more than 15 points", () => {
    const money = (amount: number) => [
      { projectId: "p", month: "2026-08", kind: "budget" as const, amount: 1000 },
      { projectId: "p", month: "2026-09", kind: "actual" as const, amount },
    ];
    const milestones = [
      {
        id: "m",
        title: "M",
        type: "Delivery",
        baselineDate: "2027-01-01",
        forecastDate: "2027-01-01",
        actualDate: null,
        reportToCommittee: false,
      },
    ];
    expect(
      buildProgressChart({ ...base, milestones, inputs: { ...empty, money: money(160) } }).gap,
    ).toBe(16);
    expect(
      buildProgressChart({ ...base, milestones, inputs: { ...empty, money: money(150) } }).gap,
    ).toBeNull();
  });

  it("hides benefits-chain series until pathway snapshots exist", () => {
    const chart = buildProgressChart({ ...base, inputs: empty });
    expect(chart.available.has("capabilities")).toBe(false);
  });
});

describe("committeeDatesFromReports (GL-14 Phase C)", () => {
  const row = (over: Partial<PublishedPackRow>): PublishedPackRow => ({
    title: "Pack",
    as_at: "2026-10-01",
    scope_type: "project",
    forum: null,
    meeting: null,
    ...over,
  });

  it("keeps committee, portfolio board and collection packs, dated by meeting else as-at", () => {
    expect(
      committeeDatesFromReports([
        row({ title: "Board", forum: { forum_type: "project_board" } }),
        row({ title: "Ad hoc" }),
        row({
          title: "Committee",
          forum: { forum_type: "committee" },
          meeting: { meeting_date: "2026-11-03" },
        }),
        row({ title: "Portfolio", forum: { forum_type: "portfolio_board" }, as_at: "2026-09-15" }),
        row({ title: "Funding", scope_type: "collection", as_at: "2026-10-20" }),
      ]),
    ).toEqual([
      { date: "2026-09-15", title: "Portfolio" },
      { date: "2026-10-20", title: "Funding" },
      { date: "2026-11-03", title: "Committee" },
    ]);
  });
});
