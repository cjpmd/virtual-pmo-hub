import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "./hierarchy";
import type { PortfolioMilestone } from "./analytics";
import {
  changeTone,
  dataAsOf,
  getSummaryMetrics,
  periodStatus,
  type MetricKey,
  type SummaryMetric,
} from "./overview";

const project = (id: string, over: Partial<ProjectSummary>) =>
  ({
    id,
    state: "Active",
    programmeId: "p1",
    budget: 100,
    actual: 40,
    forecast: 110,
    health: { overall: "On Track" },
    ...over,
  }) as unknown as ProjectSummary;
const milestone = (projectId: string, forecastDate: string, status = "Not Started") =>
  ({ projectId, forecastDate, status }) as unknown as PortfolioMilestone;

const today = "2026-10-07";
const projects = [
  project("a", {}),
  project("b", { health: { overall: "At Risk" } as ProjectSummary["health"], programmeId: "p2" }),
  // Closed projects never count, whatever their figures.
  project("c", { state: "Closed", budget: 999, forecast: 5000, actual: 999 }),
];
const metrics = (programmeId?: string) =>
  Object.fromEntries<SummaryMetric>(
    getSummaryMetrics({
      projects,
      milestones: [
        milestone("a", "2026-10-20"),
        milestone("b", "2026-12-01"),
        milestone("a", "2026-09-01", "Overdue"),
        milestone("c", "2026-10-10"),
      ],
      history: [
        { date: "2026-08-31", budget: 150, forecast: 150, spend: 50, variance: 0 },
        { date: "2026-09-30", budget: 200, forecast: 210, spend: 60, variance: 10 },
        { date: "2026-10-05", budget: 999, forecast: 999, spend: 999, variance: 999 },
      ] as never,
      projectHistory: [
        { date: "2026-09-30", projectId: "a", overall: "At Risk" },
        { date: "2026-09-30", projectId: "b", overall: "On Track" },
        { date: "2026-09-30", projectId: "c", overall: "On Track" },
      ] as never,
      gaps: { current: 3, previous: 1 },
      programmeId,
      today,
    }).map((metric) => [metric.key, metric]),
  ) as Record<MetricKey, SummaryMetric>;

describe("summary strip", () => {
  it("counts active projects only and compares with last month-end", () => {
    const m = metrics();
    expect(m.budget).toMatchObject({ value: 200, change: 0 });
    expect(m.forecast).toMatchObject({ value: 220, change: 10 });
    expect(m.variance).toMatchObject({ value: 10, money: 20, change: 10 });
    expect(m.spend).toMatchObject({ value: 80, change: 20 });
    expect(m.spend.detail?.text).toBe("40% of budget");
    // a is green now (amber before), b amber now (green before), c closed: net no change.
    expect(m.onTrack).toMatchObject({ value: 1, of: 2, change: 0 });
    expect(m.milestones).toMatchObject({ value: 1, change: null });
    expect(m.milestones.detail).toEqual({ text: "1 overdue", tone: "bad" });
    expect(m.gaps).toMatchObject({ value: 3, change: 2 });
  });

  it("filters to a programme; money history is portfolio-wide so has no change there", () => {
    const m = metrics("p1");
    expect(m.budget).toMatchObject({ value: 100, change: null });
    expect(m.onTrack).toMatchObject({ value: 1, of: 1, change: 1 });
  });

  it("colours by good or bad, never up or down", () => {
    expect(changeTone("forecast", 10)).toBe("bad");
    expect(changeTone("forecast", -10)).toBe("good");
    expect(changeTone("onTrack", 2)).toBe("good");
    expect(changeTone("onTrack", -2)).toBe("bad");
    expect(changeTone("budget", 50)).toBe("neutral");
    expect(changeTone("gaps", 0)).toBe("neutral");
  });
});

describe("status bar", () => {
  it("names the latest closed month and the open one after it", () => {
    expect(periodStatus(["2026-08-01", "2026-09-01"], today)).toEqual({
      closed: "Sep",
      open: "Oct",
    });
    expect(periodStatus(["2025-12-01"], today)).toEqual({ closed: "Dec", open: "Jan" });
    expect(periodStatus([], today)).toEqual({ closed: null, open: "Oct" });
  });

  it("uses the latest data change, not the load time", () => {
    expect(dataAsOf([null, "2026-10-01", "2026-10-06T09:14:00Z", undefined])).toBe(
      "2026-10-06T09:14:00Z",
    );
    expect(dataAsOf([])).toBeNull();
  });
});
