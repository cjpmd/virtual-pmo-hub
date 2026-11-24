import { describe, expect, it } from "vitest";
import {
  adjacentStages,
  filterSchemes,
  pipelineColumns,
  schemePermissions,
  STAGES,
  type EfficiencyStage,
} from "./efficiency";

const scheme = (
  over: Partial<{
    stage: EfficiencyStage;
    planInYear: number;
    riskAdjustedInYear: number;
    workspaceId: string;
    businessUnit: string | null;
    category: string | null;
    ref: string;
    title: string;
  }> = {},
) => ({
  stage: "idea" as EfficiencyStage,
  planInYear: 0,
  riskAdjustedInYear: 0,
  workspaceId: "w1",
  businessUnit: null,
  category: null,
  ref: "EFF-1",
  title: "Agency reduction",
  ...over,
});

describe("pipelineColumns", () => {
  it("keeps every stage in order, with totals, and marks rejected as not counted", () => {
    const cols = pipelineColumns([
      scheme({ stage: "idea", planInYear: 100.1, riskAdjustedInYear: 20.02 }),
      scheme({ stage: "idea", planInYear: 0.2, riskAdjustedInYear: 0.04 }),
      scheme({ stage: "rejected", planInYear: 50 }),
    ]);
    expect(cols.map((c) => c.stage)).toEqual(STAGES);
    const idea = cols[0]!;
    expect(idea.schemes).toHaveLength(2);
    expect(idea.plan).toBe(100.3);
    expect(idea.riskAdjusted).toBe(20.06);
    expect(cols.find((c) => c.stage === "rejected")).toMatchObject({ plan: 50, counted: false });
    expect(cols.find((c) => c.stage === "in_delivery")).toMatchObject({ schemes: [], plan: 0 });
  });
});

describe("adjacentStages", () => {
  it("steps along the pipeline and stops at the ends", () => {
    expect(adjacentStages("idea")).toEqual({ back: null, forward: "opportunity" });
    expect(adjacentStages("fully_developed")).toEqual({
      back: "plan_in_progress",
      forward: "in_delivery",
    });
    expect(adjacentStages("delivered")).toEqual({ back: "in_delivery", forward: null });
  });
  it("gives on hold and rejected no neighbours", () => {
    expect(adjacentStages("on_hold")).toEqual({ back: null, forward: null });
    expect(adjacentStages("rejected")).toEqual({ back: null, forward: null });
  });
});

describe("filterSchemes", () => {
  const rows = [
    scheme({
      ref: "EFF-1",
      title: "Agency reduction",
      businessUnit: "Surgery",
      category: "agency_bank",
    }),
    scheme({
      ref: "EFF-2",
      title: "Theatre productivity",
      workspaceId: "w2",
      stage: "in_delivery",
    }),
    scheme({ ref: "EFF-3", title: "Old idea", stage: "rejected" }),
    scheme({ ref: "EFF-4", title: "Done", stage: "delivered" }),
  ];
  it("hides delivered and rejected unless asked", () => {
    expect(filterSchemes(rows, {}).map((r) => r.ref)).toEqual(["EFF-1", "EFF-2"]);
    expect(filterSchemes(rows, { showClosed: true })).toHaveLength(4);
  });
  it("filters by workspace, unit, category and search (ref or title, any case)", () => {
    expect(filterSchemes(rows, { workspaceId: "w2" }).map((r) => r.ref)).toEqual(["EFF-2"]);
    expect(filterSchemes(rows, { businessUnit: "Surgery" }).map((r) => r.ref)).toEqual(["EFF-1"]);
    expect(filterSchemes(rows, { category: "agency_bank" }).map((r) => r.ref)).toEqual(["EFF-1"]);
    expect(filterSchemes(rows, { search: " theatre " }).map((r) => r.ref)).toEqual(["EFF-2"]);
    expect(filterSchemes(rows, { search: "eff-1" }).map((r) => r.ref)).toEqual(["EFF-1"]);
  });
});

describe("schemePermissions", () => {
  const base = {
    myResourceId: "me",
    schemeLeadId: null,
    financeLeadId: null,
    moduleOn: true,
    writable: true,
  };
  it("lets managers edit, PMO validate, and viewers do nothing", () => {
    expect(schemePermissions({ ...base, role: "manager" })).toEqual({
      canEdit: true,
      canEditValues: true,
      canValidate: false,
    });
    expect(schemePermissions({ ...base, role: "pmo" }).canValidate).toBe(true);
    expect(schemePermissions({ ...base, role: "viewer" })).toEqual({
      canEdit: false,
      canEditValues: false,
      canValidate: false,
    });
  });
  it("lets the scheme lead edit values and the finance lead validate, as contributors", () => {
    expect(schemePermissions({ ...base, role: "contributor", schemeLeadId: "me" })).toEqual({
      canEdit: false,
      canEditValues: true,
      canValidate: false,
    });
    expect(schemePermissions({ ...base, role: "contributor", financeLeadId: "me" })).toEqual({
      canEdit: false,
      canEditValues: true,
      canValidate: true,
    });
    // A free viewer who leads the scheme can't write (RLS needs contributor).
    expect(schemePermissions({ ...base, role: "viewer", financeLeadId: "me" }).canValidate).toBe(
      false,
    );
  });
  it("allows nothing while the module is off or the organisation is read-only", () => {
    const none = { canEdit: false, canEditValues: false, canValidate: false };
    expect(schemePermissions({ ...base, role: "admin", moduleOn: false })).toEqual(none);
    expect(schemePermissions({ ...base, role: "admin", writable: false })).toEqual(none);
  });
});

describe("efficiency navigation", () => {
  it("shows Portfolio › Efficiency and its scheme pages only while the module is on", async () => {
    const { isPathEnabled } = await import("@/lib/modules");
    const { defaultSettings } = await import("@/data/settings-data");
    const settings = (on: boolean) => ({
      ...defaultSettings,
      modules: { enabled: { efficiency: on }, pack: "general" as const },
    });
    expect(isPathEnabled("/portfolio/efficiency", settings(false))).toBe(false);
    expect(isPathEnabled("/portfolio/efficiency/abc", settings(false))).toBe(false);
    expect(isPathEnabled("/portfolio/efficiency", settings(true))).toBe(true);
  });
});
