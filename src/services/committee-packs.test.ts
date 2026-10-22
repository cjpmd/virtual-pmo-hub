import { describe, expect, it } from "vitest";
import { addDaysIso } from "@/lib/today";
import type { BenefitsData, BenefitView } from "./benefits";
import type { ResolvedDecision } from "./decisions";
import {
  buildBenefitsSection,
  buildDecisionsSection,
  issuedPackPages,
  packPages,
} from "./committee-packs";

const projects = [
  { id: "p1", name: "Portal" },
  { id: "p2", name: "Payroll" },
];

describe("pack pages", () => {
  it("follows the template order, skips unknown names and adds highlights last", () => {
    const pages = packPages(
      ["Cover", "Decisions", "Unknown", "Project highlights", "Portfolio summary"],
      projects,
    );
    expect(pages.map((page) => [page.type, page.label])).toEqual([
      ["cover", "Cover"],
      ["decisions", "Decisions"],
      ["summary", "Portfolio summary"],
      ["project", "Portal"],
      ["project", "Payroll"],
    ]);
  });

  it("rebuilds an issued pack from its stored labels, keeping same-named projects", () => {
    const twins = [
      { id: "a", name: "Refresh" },
      { id: "b", name: "Refresh" },
    ];
    const pages = issuedPackPages(["Cover", "Refresh", "Exceptions", "Refresh", "Gone"], twins);
    expect(pages.map((page) => [page.type, page.project?.id ?? page.id])).toEqual([
      ["cover", "cover"],
      ["project", "a"],
      ["exceptions", "exceptions"],
      ["project", "b"],
    ]);
  });
});

const benefit = (overrides: Record<string, unknown>) =>
  ({
    id: "b1",
    reference: "BEN-1",
    title: "Faster payroll",
    type: "Benefit",
    classification: "Cash-releasing",
    confidence: "High",
    owner: "Sam Lee",
    plannedTotalValue: 1000,
    realisation: { realised: 250, percent: 25, behindProfile: false },
    strategicObjectiveIds: ["o1"],
    enablingProjects: [{ projectId: "p1" }],
    measures: [],
    ...overrides,
  }) as unknown as BenefitView;

describe("benefits section", () => {
  it("covers only benefits enabled by the pack's projects", () => {
    const data = {
      objectives: [{ id: "o1", title: "Efficiency" }],
      benefits: [
        benefit({}),
        benefit({
          id: "b2",
          reference: "BEN-2",
          title: "Behind",
          plannedTotalValue: 500,
          realisation: { realised: 0, percent: 0, behindProfile: true },
          measures: [{ id: "m1", name: "Hours saved", nextDue: addDaysIso(-3), records: [] }],
        }),
        benefit({ id: "b3", enablingProjects: [{ projectId: "elsewhere" }] }),
      ],
    } as unknown as BenefitsData;
    const section = buildBenefitsSection(data, ["p1"]);
    expect(section.metrics).toMatchObject({ planned: 1500, realised: 250, atRisk: 1 });
    expect(section.objectives).toEqual([
      { id: "o1", name: "Efficiency", planned: 1500, realised: 250 },
    ]);
    expect(section.behind).toEqual([
      { id: "b2", reference: "BEN-2", title: "Behind", percent: 0, realised: 0 },
    ]);
    expect(section.overdue).toEqual([
      {
        id: "m1",
        reference: "BEN-2",
        measureName: "Hours saved",
        daysOverdue: 3,
        owner: "Sam Lee",
      },
    ]);
    // Stored as plain data: it survives the jsonb round trip unchanged.
    expect(JSON.parse(JSON.stringify(section))).toEqual(section);
  });
});

const decision = (overrides: Record<string, unknown>) =>
  ({
    id: "d1",
    reference: "DEC-1",
    title: "Choose supplier",
    status: "Pending",
    projectCode: "PORT",
    neededBy: "2026-11-01",
    daysToNeededBy: 10,
    overdue: false,
    scopeName: "Portal",
    forum: "Digital board",
    decisionMaker: "Board",
    context: "Two bids.",
    options: [{ title: "A" }, { title: "B" }],
    decisionDate: null,
    chosenOption: "",
    impactSummary: "",
    ...overrides,
  }) as unknown as ResolvedDecision;

describe("decisions section", () => {
  it("keeps the pack's decisions: pending soonest first, and those made in the last 31 days", () => {
    const section = buildDecisionsSection(
      [
        decision({}),
        decision({ id: "d2", reference: "DEC-2", daysToNeededBy: 2, projectCode: null }),
        decision({ id: "d3", projectCode: "OTHER" }),
        decision({
          id: "d4",
          status: "Approved",
          decisionDate: addDaysIso(-5),
          chosenOption: "A",
        }),
        decision({ id: "d5", status: "Approved", decisionDate: addDaysIso(-40) }),
      ],
      ["PORT"],
    );
    expect(section.required.map((item) => item.id)).toEqual(["d2", "d1"]);
    expect(section.required[0]!.options).toEqual(["A", "B"]);
    expect(section.made.map((item) => [item.id, item.chosenOption])).toEqual([["d4", "A"]]);
  });
});
