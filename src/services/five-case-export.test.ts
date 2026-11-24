import { describe, expect, it } from "vitest";
import type { CaseVersion } from "./business-cases";
import {
  canBaselineFrom,
  fromDraft,
  parseBaselineAmount,
  routeProblems,
  toDraft,
} from "./five-case";
import { caseExportToDocx } from "./five-case-docx";
import { buildCaseExport, inlineRuns, markdownBlocks, safeFileName } from "./five-case-export";

const format = { currency: (n: number) => `£${n.toFixed(0)}`, date: (d: string) => d.slice(0, 10) };

const section = (
  key: string,
  title: string,
  caseGroup: CaseVersion["sections"][number]["caseGroup"],
  content = "Text.",
) => ({
  id: key,
  key,
  title,
  guidance: null,
  isRequired: true,
  content,
  updatedAt: "",
  caseGroup,
});

const version = (over: Partial<CaseVersion> = {}): CaseVersion => ({
  id: "v1",
  version: 2,
  status: "approved",
  wholeLifeCost: 500000,
  fundingRequested: 450000,
  createdAt: "2026-11-01T00:00:00Z",
  submittedAt: "2026-11-02T00:00:00Z",
  submittedBy: "Ann",
  decidedAt: "2026-11-03T00:00:00Z",
  updatedAt: "",
  sections: [
    section("fc_strategic_context", "Strategic context", "strategic"),
    section("fc_case_for_change", "Case for change", "strategic"),
    section("fc_options", "Options framework", "economic"),
    section("fc_funding", "Affordability", "financial", ""),
  ],
  options: [
    {
      id: "o1",
      name: "Do nothing",
      description: null,
      wholeLifeCost: null,
      deliveryCost: null,
      benefitsSummary: null,
      riskSummary: null,
      isPreferred: false,
      updatedAt: "",
      listStage: "long",
      shortlistNote: "Doesn't meet the objectives",
      optimismBiasPct: null,
    },
    {
      id: "o2",
      name: "New build",
      description: null,
      wholeLifeCost: 500000,
      deliveryCost: 400000,
      benefitsSummary: null,
      riskSummary: null,
      isPreferred: true,
      updatedAt: "",
      listStage: "short",
      shortlistNote: null,
      optimismBiasPct: 24,
    },
  ],
  benefits: [],
  stage: "obc",
  discountRate: 3.5,
  appraisalYears: 2,
  priceBaseYear: 2026,
  objectives: [
    {
      id: "x2",
      kind: "critical_success_factor",
      title: "Affordable",
      description: null,
      measure: null,
      sortOrder: 1,
      updatedAt: "",
    },
    {
      id: "x1",
      kind: "spending_objective",
      title: "Cut waits",
      description: null,
      measure: "Weeks",
      sortOrder: 2,
      updatedAt: "",
    },
  ],
  optionYears: [
    {
      id: "y0",
      optionId: "o2",
      yearIndex: 0,
      capitalCost: 400000,
      revenueCost: 0,
      cashBenefit: 0,
      nonCashBenefit: 0,
      updatedAt: "",
    },
    {
      id: "y1",
      optionId: "o2",
      yearIndex: 1,
      capitalCost: 0,
      revenueCost: 20000,
      cashBenefit: 60000,
      nonCashBenefit: 30000,
      updatedAt: "",
    },
  ],
  approval: {
    gateId: "g",
    status: "approved",
    steps: [
      {
        id: "s1",
        stepOrder: 1,
        name: "Trust Board",
        governanceRole: "head_of_pmo",
        decision: "approved",
        decidedAt: "2026-11-03T00:00:00Z",
        approverName: "Bea",
        comment: null,
      },
    ],
  },
  ...over,
});

describe("buildCaseExport", () => {
  it("orders a Five Case Model version by case, with the extras in the right case", () => {
    const model = buildCaseExport({ title: "Outpatients hub" }, version(), format, {
      preparedOn: "23/11/2026",
    });
    const h1 = model.blocks
      .filter((b) => b.kind === "heading" && b.level === 1)
      .map((b) => (b as { text: string }).text);
    expect(h1).toEqual(["Strategic case", "Economic case", "Financial case", "Approval record"]);
    const headings = model.blocks.flatMap((b) => (b.kind === "heading" ? [b.text] : []));
    // Objectives follow the case for change; options and appraisal sit in the economic case.
    expect(headings.indexOf("Spending objectives and critical success factors")).toBe(
      headings.indexOf("Case for change") + 1,
    );
    expect(headings.indexOf("Appraisal summary")).toBeGreaterThan(
      headings.indexOf("Economic case"),
    );
    expect(headings.indexOf("Affordability of the preferred option")).toBeGreaterThan(
      headings.indexOf("Financial case"),
    );
    expect(model.subtitle).toBe("Outline Business Case");
    expect(model.fileName).toBe("Outpatients hub OBC v2");
  });

  it("marks empty sections and lists spending objectives first", () => {
    const model = buildCaseExport({ title: "X" }, version(), format);
    expect(model.blocks).toContainEqual({ kind: "note", text: "Not written yet." });
    const objectives = model.blocks.find((b) => b.kind === "table" && b.columns[0] === "Type");
    expect(objectives && objectives.kind === "table" && objectives.rows.map((r) => r[0])).toEqual([
      "Spending objective",
      "Critical success factor",
    ]);
  });

  it("appraises short-listed options only, with optimism bias on costs", () => {
    const model = buildCaseExport({ title: "X" }, version(), format);
    const table = model.blocks.find(
      (b) => b.kind === "table" && b.columns[0] === "Option" && b.columns.includes("NPV"),
    );
    expect(table && table.kind === "table" && table.rows).toHaveLength(1);
    // PV costs: (400000 + 20000 / 1.035) × 1.24
    expect(table && table.kind === "table" && table.rows[0]![1]).toBe(
      `£${((400000 + 20000 / 1.035) * 1.24).toFixed(0)}`,
    );
  });

  it("keeps a standard case in its own order without case headings", () => {
    const model = buildCaseExport(
      { title: "Plain" },
      version({
        stage: "single",
        approval: null,
        objectives: [],
        sections: [section("summary", "Summary", null)],
      }),
      format,
    );
    expect(model.blocks.some((b) => b.kind === "heading" && b.level === 1)).toBe(false);
    expect(model.subtitle).toBe("Business case");
    expect(model.fileName).toBe("Plain v2");
  });
});

describe("markdown for Word", () => {
  it("splits headings, lists and paragraphs", () => {
    expect(markdownBlocks("# Aim\nOne\ntwo\n\n- a\n- b\n1. c").map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "bullet",
      "bullet",
      "number",
    ]);
  });
  it("reads bold, italic and code", () => {
    expect(inlineRuns("a **b** _c_ `d`")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", code: true },
    ]);
  });
  it("makes safe file names", () => {
    expect(safeFileName("A/B: c?  d")).toBe("A B c d");
    expect(safeFileName("///")).toBe("Business case");
  });
});

describe("caseExportToDocx", () => {
  it("builds a .docx (a zip) from the model", async () => {
    const blob = await caseExportToDocx(buildCaseExport({ title: "X" }, version(), format));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
  });
});

describe("approval route editing", () => {
  it("round-trips routes through the editing copy", () => {
    const routes = { soc: [{ name: "Board", governanceRole: "head_of_pmo", minValue: 1000 }] };
    const back = fromDraft(toDraft(routes));
    expect(back.soc).toEqual(routes.soc);
    expect(back.fbc).toEqual([]);
  });
  it("reports what the database would refuse", () => {
    const draft = toDraft({});
    draft.obc = [{ name: " ", governanceRole: "astronaut", minValue: "-5" }];
    expect(routeProblems(fromDraft(draft), ["head_of_pmo"])).toEqual([
      "OBC step 1 needs a name.",
      "OBC step 1 needs a governance role.",
      "OBC step 1: the threshold must be a number of 0 or more.",
    ]);
    draft.obc = [{ name: "Board", governanceRole: "head_of_pmo", minValue: "£1,000,000" }];
    expect(routeProblems(fromDraft(draft), ["head_of_pmo"])).toEqual([]);
    expect(fromDraft(draft).obc?.[0]?.minValue).toBe(1000000);
  });
});

describe("budget baseline from a case", () => {
  it("only approved versions other than an SOC", () => {
    expect(canBaselineFrom({ status: "approved", stage: "obc" })).toBe(true);
    expect(canBaselineFrom({ status: "approved", stage: "single" })).toBe(true);
    expect(canBaselineFrom({ status: "approved", stage: "soc" })).toBe(false);
    expect(canBaselineFrom({ status: "submitted", stage: "fbc" })).toBe(false);
    expect(canBaselineFrom({ status: "superseded", stage: "fbc" })).toBe(false);
  });
  it("parses typed amounts", () => {
    expect(parseBaselineAmount("£1,250,000.50")).toBe(1250000.5);
    expect(parseBaselineAmount("12a")).toBeNull();
    expect(parseBaselineAmount("")).toBeNull();
  });
});
