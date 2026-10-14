import { describe, expect, it } from "vitest";
import { buildProgressChart, type ProgressInputs } from "./progress-chart";
import { getProjectSummaryMetrics } from "./overview";
import { buildProjectSignals } from "./overview-panels";
import { expandTaskMonths } from "./project-overview";

// Shaped like ARB on 13/10/2026 (get_project_overview).
const today = "2026-10-13";
const milestones = [
  {
    id: "1",
    slipBand: "on_time",
    title: "Delivery",
    type: "delivery",
    baselineDate: "2026-09-01",
    forecastDate: "2026-08-17",
    actualDate: "2026-09-01",
    reportToCommittee: false,
  },
  {
    id: "2",
    slipBand: "severe",
    title: "GATE 0",
    type: "gate",
    baselineDate: "2026-09-16",
    forecastDate: "2026-10-26",
    actualDate: null,
    reportToCommittee: true,
  },
  {
    id: "3",
    slipBand: "on_time",
    title: "Design authority",
    type: "gate",
    baselineDate: "2026-11-09",
    forecastDate: "2026-11-09",
    actualDate: null,
    reportToCommittee: true,
  },
  {
    id: "4",
    slipBand: "minor",
    title: "Delivery 2",
    type: "delivery",
    baselineDate: "2026-11-27",
    forecastDate: "2026-12-06",
    actualDate: null,
    reportToCommittee: false,
  },
  {
    id: "5",
    slipBand: "on_time",
    title: "External",
    type: "external_dependency",
    baselineDate: "2026-12-30",
    forecastDate: "2026-12-30",
    actualDate: null,
    reportToCommittee: false,
  },
];
const inputs: ProgressInputs = {
  money: [
    { projectId: "p", month: "2026-09", kind: "actual", amount: 160000 },
    { projectId: "p", month: "2026-10", kind: "forecast", amount: 147500 },
  ],
  tasks: expandTaskMonths([
    { projectId: "p", month: "2026-09-01", due: 1, doneByDue: 1, done: 1 },
    { projectId: "p", month: "2026-10-01", due: 4, doneByDue: 0, done: 0 },
    { projectId: "p", month: "2026-11-01", due: 3, doneByDue: 0, done: 0 },
  ]),
  risks: [
    {
      projectId: "p",
      score: 12,
      createdAt: "2026-10-05T18:27:33Z",
      closedAt: null,
      status: "open",
    },
  ],
  pathway: [],
  pathwayDates: [],
  committees: [{ date: "2026-10-20", title: "Workspace committee" }],
};
const window = {
  startDate: "2026-03-17",
  baselineFinishDate: "2027-03-17",
  forecastFinishDate: "2027-03-17",
  budget: 290000,
  actualsThrough: "2026-09",
  closed: false,
};
const chart = (over: Partial<typeof window> = {}) =>
  buildProgressChart({
    inputs,
    milestones,
    history: [],
    projectHistory: [],
    liveGreen: 0,
    programmeIds: null,
    today,
    fyStartMonth: 8,
    range: "fy",
    project: { ...window, ...over },
  });

describe("project progress chart", () => {
  it("runs from the project start to the later of baseline and forecast finish", () => {
    const data = chart({ forecastFinishDate: "2027-05-02" });
    expect(data.points[0]?.month).toBe("2026-03");
    expect(data.points.at(-1)?.month).toBe("2027-05");
  });

  it("plots spend as % of budget and milestones and tasks as % of the whole project", () => {
    const data = chart();
    expect(data.current.spend).toBeCloseTo(55.2, 1); // 160k of 290k; October is still open
    expect(data.current.milestones).toBe(20); // 1 of 5 delivered
    expect(data.current.tasks).toBe(12.5); // 1 of 8 done
    // No budget profile: even phasing over Mar 26–Mar 27 (13 months), 7 of them by September.
    expect(data.evenPhasing).toBe(true);
    expect(data.points.find((p) => p.month === "2026-09")?.values.plan).toBeCloseTo(53.8, 1);
    expect(data.gap).toBe(35);
    // The open month's forecast is counted from November on.
    expect(data.points.find((p) => p.month === "2026-11")?.values.spend).toBe(100);
  });

  it("marks start, gates, baseline and forecast finish, without workspace committee dates", () => {
    const kinds = chart().markers.map((m) => `${m.kind}:${m.label}`);
    expect(kinds).toEqual([
      "gate:GATE 0",
      "gate:Design authority",
      "start:Start",
      "baseline:Baseline finish",
      "finish:Forecast finish",
    ]);
  });

  it("draws no forecast lines for a closed project", () => {
    const data = chart({ closed: true });
    expect(data.points.filter((p) => p.forecast).every((p) => !Object.keys(p.values).length)).toBe(
      true,
    );
    expect(data.markers.some((m) => m.kind === "finish")).toBe(false);
  });

  it("shows the last plotted month on the chips when the project finished before today", () => {
    const data = chart({
      closed: true,
      baselineFinishDate: "2026-08-20",
      forecastFinishDate: "2026-08-31",
    });
    expect(data.points.at(-1)?.month).toBe("2026-08");
    expect(data.current.milestones).toBe(0);
  });
});

describe("project summary metrics", () => {
  const metrics = getProjectSummaryMetrics({
    financials: { budget: 290000, eac: 307500, actualToDate: 160000 },
    forecastHistory: [],
    milestones,
    risks: [
      { score: 12, createdAt: "2026-10-05T00:00:00Z", closedAt: null, status: "open" },
      { score: 16, createdAt: "2026-10-02T00:00:00Z", closedAt: null, status: "open" },
    ],
    redRiskMinScore: 15,
    forecastFinish: "2027-03-17",
    finishVsBaselineDays: 0,
    today,
  });
  const by = (key: string) => metrics.find((m) => m.key === key);

  it("has the eight cells in order, with no money change before the first month-end", () => {
    expect(metrics.map((m) => m.key)).toEqual([
      "budget",
      "forecast",
      "variance",
      "spend",
      "delivered",
      "milestones",
      "redRisks",
      "finish",
    ]);
    expect(by("forecast")?.change).toBeNull();
    expect(by("spend")?.detail?.text).toBe("55% of budget");
  });

  it("counts milestones delivered with on-time %, next 30 days with at-risk, and red risks", () => {
    expect(by("delivered")).toMatchObject({ value: 1, of: 5, change: 0 });
    expect(by("delivered")?.detail?.text).toBe("100% on time");
    expect(by("milestones")).toMatchObject({ value: 2 }); // 26/10 and 09/11
    expect(by("milestones")?.detail).toEqual({ text: "1 at risk", tone: "bad" });
    expect(by("redRisks")).toMatchObject({ value: 1, change: 1 });
    expect(by("finish")?.detail?.text).toBe("on baseline");
  });
});

describe("project signals", () => {
  const base = {
    code: "ARB",
    today,
    closed: false,
    health: {
      declared: "At Risk" as const,
      evidenced: "Off Track" as const,
      divergent: true,
      divergenceKind: "evidence_moved" as const,
      divergenceDays: 4,
      divergenceAlert: false,
      justified: false,
      lastReportDate: "2026-09-11",
      nextReportDue: "2026-10-11",
      reportOverdue: true,
      finishVsBaselineDays: 0,
      finishSlipHealth: "On Track" as const,
      milestonesAfterBaselineFinish: 0,
    },
    openRaid: [],
    redRiskMinScore: 15,
    spendVsPlan: { month: "September", spend: 55.2, plan: 53.8 },
    milestonesBaselinedByNow: 2,
    milestonesDelivered: 1,
    date: (iso: string) => iso.split("-").reverse().join("/"),
  };

  it("lists ARB's divergence and overdue report; spend is within 15 points of plan", () => {
    const signals = buildProjectSignals(base);
    expect(signals.map((s) => s.title)).toEqual([
      "Report says amber, evidence says red",
      "Status report overdue by 2 days",
    ]);
    expect(signals[0]?.link).toEqual({
      kind: "projectTab",
      code: "ARB",
      tab: "overview",
      dialog: "justify",
    });
  });

  it("words stale red risks, finish slip and late baselines", () => {
    const signals = buildProjectSignals({
      ...base,
      health: {
        ...base.health,
        divergent: false,
        reportOverdue: false,
        nextReportDue: "2026-10-16",
        finishVsBaselineDays: 12,
        finishSlipHealth: "At Risk",
        milestonesAfterBaselineFinish: 2,
      },
      spendVsPlan: undefined,
      openRaid: [
        {
          kind: "risk",
          id: "r",
          ref: "R-07",
          title: "Vendor shortlist delayed",
          score: 16,
          severity: null,
          reviewDate: null,
          createdAt: "2026-09-01T00:00:00Z",
          updatedAt: "2026-09-22T00:00:00Z",
        },
      ],
    });
    expect(signals.map((s) => s.title)).toEqual([
      "Status report due in 3 days",
      "Red risk not updated in 21 days",
      "Forecast finish 12 days beyond baseline",
      "2 milestones baselined after project finish",
    ]);
    expect(signals[2]?.detail).toBe("Within the schedule tolerance.");
  });

  it("shows Justified instead of the divergence once it is justified", () => {
    const signals = buildProjectSignals({ ...base, health: { ...base.health, justified: true } });
    expect(signals.find((s) => s.id === "divergence")?.title).toBe(
      "Justified: report says amber, evidence says red",
    );
  });

  it("raises the spend signal only when spend leads plan and delivery is behind", () => {
    const ahead = { month: "September", spend: 80, plan: 50 };
    const fired = buildProjectSignals({ ...base, spendVsPlan: ahead });
    expect(fired.find((s) => s.id === "spend-lead")?.title).toBe(
      "Spending ahead of plan while delivery is behind (spend +30 pts, 1 milestone behind)",
    );
    const onTrack = buildProjectSignals({ ...base, spendVsPlan: ahead, milestonesDelivered: 2 });
    expect(onTrack.some((s) => s.id === "spend-lead")).toBe(false);
  });

  it("flags the next gate within 30 days while its checklist is incomplete", () => {
    const gate = { title: "GATE 0 - Ready to Design", date: "2026-10-26", passed: 2, total: 7 };
    const signals = buildProjectSignals({ ...base, nextGate: gate });
    const signal = signals.find((s) => s.id === "gate");
    expect(signal?.title).toBe("Gate 0 - Ready to Design in 13 days, 2 of 7 checklist items done");
    expect(signal?.link).toEqual({ kind: "projectTab", code: "ARB", tab: "plan", sub: "gates" });
    const done = buildProjectSignals({ ...base, nextGate: { ...gate, passed: 7 } });
    expect(done.some((s) => s.id === "gate")).toBe(false);
    const far = buildProjectSignals({ ...base, nextGate: { ...gate, date: "2026-11-20" } });
    expect(far.some((s) => s.id === "gate")).toBe(false);
  });
});
