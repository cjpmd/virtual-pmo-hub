import { describe, expect, it } from "vitest";
import type { Health } from "@/data/types";
import type { ProjectHealthMonth } from "./project-overview";
import {
  deliveryProfile,
  dimensionSeries,
  monthSpan,
  rankRaid,
  scheduleStats,
  slipRows,
} from "./project-schedule";

const today = "2026-10-13";
const m = (
  id: string,
  baselineDate: string,
  forecastDate: string,
  actualDate: string | null,
  slipDays: number,
  slipBand: string,
  phaseName: string | null = null,
) => ({
  id,
  title: `M${id}`,
  type: "delivery",
  phaseName,
  baselineDate,
  forecastDate,
  actualDate,
  slipDays,
  slipBand,
});

// ARB-like: one delivered on time, one late gate past baseline, others ahead.
const milestones = [
  m("1", "2026-09-01", "2026-08-17", "2026-09-01", 0, "on_time"),
  m("2", "2026-09-16", "2026-10-26", null, 40, "severe"),
  m("3", "2026-11-09", "2026-11-09", null, 0, "on_time"),
  m("4", "2026-11-27", "2026-12-06", null, 9, "minor"),
  m("5", "2026-08-20", "2026-10-01", null, 42, "severe", "Phase 3"),
];

describe("schedule stats", () => {
  it("applies the Stage 2 rules", () => {
    const stats = scheduleStats(milestones, today);
    expect(stats).toMatchObject({
      total: 5,
      delivered: 1,
      onTime: 1,
      hitBaseline: 100,
      averageSlip: 0,
      overdue: 1, // M5: not delivered, forecast passed
      reforecast: 3, // M2, M4, M5
      baselinedByNow: 3,
      lateDays: 7, // at least 7
    });
  });
});

describe("slip rows", () => {
  it("words each row from phase or type and its state", () => {
    const rows = slipRows(milestones, today, "date");
    expect(rows.map((r) => r.subtitle)).toEqual([
      "Phase 3 · Overdue, forecast 1 Oct",
      "Delivery · Delivered 1 Sep",
      "Delivery · Past baseline, forecast 26 Oct",
      "Delivery · Forecast 9 Nov",
      "Delivery · Forecast 6 Dec",
    ]);
    expect(slipRows(milestones, today, "slip")[0]?.id).toBe("5");
  });
});

describe("delivery profile", () => {
  it("counts plan and sign-offs, marks behind, and forecasts a range", () => {
    const p = deliveryProfile(milestones, monthSpan("2026-08", "2027-01"), today, false);
    expect(p.plannedToDate).toBe(3);
    expect(p.deliveredToDate).toBe(1);
    expect(p.behind).toBe(2);
    expect(p.points.find((x) => x.month === "2026-09")).toMatchObject({
      signedOff: 1,
      late: false,
    });
    expect(p.points.at(-1)?.band).toEqual([5, 5]);
    expect(p.range).toEqual({ early: "2026-12-06", late: "2026-12-13", baseline: "2026-11-27" });
  });

  it("has no forecast band for a closed project", () => {
    const p = deliveryProfile(milestones, monthSpan("2026-08", "2027-01"), today, true);
    expect(p.points.some((x) => x.band)).toBe(false);
    expect(p.range).toBeNull();
  });
});

describe("health by dimension", () => {
  const rag = (h: Health) => ({
    schedule: h,
    financial: h,
    effort: h,
    issue: h,
    benefit: h,
    overall: h,
  });
  const months: ProjectHealthMonth[] = [
    {
      month: "2026-08",
      snapshotDate: "2026-08-05",
      source: "seed",
      evidenced: rag("At Risk"),
      declared: null,
    },
    {
      month: "2026-09",
      snapshotDate: "2026-09-05",
      source: "seed",
      evidenced: rag("At Risk"),
      declared: rag("At Risk"),
    },
    {
      month: "2026-10",
      snapshotDate: "2026-10-13",
      source: "job",
      evidenced: rag("Off Track"),
      declared: rag("At Risk"),
    },
  ];
  it("rings months where the report declared better, and marks sample months", () => {
    const [schedule] = dimensionSeries(months, ["schedule"]);
    expect(schedule?.points.map((p) => [p.declaredBetter, p.sample])).toEqual([
      [false, true],
      [false, true],
      [true, false],
    ]);
    expect(schedule?.declaredBetter).toBe(1);
  });
});

describe("top risks and issues", () => {
  const bands = [
    { label: "Low", minScore: 1 },
    { label: "Elevated", minScore: 8 },
    { label: "Critical", minScore: 15 },
  ];
  const item = (
    id: string,
    kind: "risk" | "issue",
    score: number | null,
    severity: string | null,
    updatedAt: string,
  ) => ({
    kind,
    id,
    ref: id,
    title: id,
    score,
    severity,
    reviewDate: null,
    createdAt: updatedAt,
    updatedAt,
  });
  it("ranks by severity, then by days since last update", () => {
    const ranked = rankRaid(
      [
        item("R-low", "risk", 4, null, "2026-09-01T00:00:00Z"),
        item("I-high", "issue", null, "high", "2026-10-10T00:00:00Z"),
        item("R-crit", "risk", 16, null, "2026-10-12T00:00:00Z"),
        item("I-med-old", "issue", null, "medium", "2026-08-01T00:00:00Z"),
        item("R-elev", "risk", 12, null, "2026-10-01T00:00:00Z"),
      ],
      bands,
      today,
    );
    expect(ranked.map((r) => `${r.item.id}:${r.level}:${r.word}`)).toEqual([
      "R-crit:red:Critical",
      "I-high:red:High",
      "R-elev:amber:Elevated",
    ]);
  });
});
