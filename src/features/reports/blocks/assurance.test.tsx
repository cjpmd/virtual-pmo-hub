// @vitest-environment jsdom
// NHS-1 board assurance blocks render the data private.rb_baf_* returns (fixture captured from the
// local Postgres, ids anonymised) and their empty states, with words beside every colour.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fixtures from "./__fixtures__/assurance.json";
import "./catalogue";
import { directionText, trendText, riskWhere, type LinkedRisk } from "./catalogue/assurance";
import { getBlock, resolveConfig } from "./registry";
import type { BlockInstance, RenderContext } from "./types";
import { FALLBACK_SCHEME } from "@/services/reports";

vi.mock("@/components/auth/organisation-provider", () => ({ useOrgId: () => "org-test" }));
afterEach(cleanup);

const instance = (blockKey: string): BlockInstance => ({
  id: `i-${blockKey}`,
  blockKey,
  blockVersion: 1,
  config: {},
  placement: "report",
});
const ctx = (blockKey: string): RenderContext => ({
  scheme: FALLBACK_SCHEME,
  mode: "screen",
  audience: "internal",
  reportId: null,
  entityId: null,
  editable: false,
  source: "snapshot",
  asAt: "2026-11-22",
  instance: instance(blockKey),
});
function renderBlock(key: string, data: unknown) {
  const definition = getBlock(key)!;
  const Renderer = definition.Renderer;
  return render(
    <Renderer data={data} config={resolveConfig(definition, instance(key))} ctx={ctx(key)} />,
  );
}

describe("board assurance blocks", () => {
  it("are registered, partner-unsafe and in the Assurance category", () => {
    for (const key of ["baf_summary", "baf_above_appetite", "baf_linkage"]) {
      const definition = getBlock(key);
      expect(definition?.partnerSafe).toBe(false);
      expect(definition?.category).toBe("assurance");
    }
  });

  it("baf_summary shows the heat map, the register and words beside colours", () => {
    renderBlock("baf_summary", fixtures.baf_summary);
    expect(screen.getByRole("table", { name: /heatmap, 3 open risks/i })).toBeTruthy();
    expect(screen.getByText("Financial sustainability")).toBeTruthy();
    expect(screen.getAllByText("Extreme").length).toBeGreaterThan(0);
    expect(screen.getByText("Limited assurance")).toBeTruthy();
    expect(screen.getByText(/\(above\)/)).toBeTruthy();
    expect(screen.getAllByText("Not rated").length).toBe(2);
  });

  it("baf_above_appetite shows the gap, gaps in control and overdue actions", () => {
    renderBlock("baf_above_appetite", fixtures.baf_above_appetite);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("No recurrent plan yet")).toBeTruthy();
    expect(screen.getByText(/1 open, 1 overdue/)).toBeTruthy();
    expect(screen.getByText(/1 of 3 open strategic risks have no tolerated score/)).toBeTruthy();
  });

  it("baf_linkage groups linked risks under their strategic risk and lists the unlinked", () => {
    renderBlock("baf_linkage", fixtures.baf_linkage);
    expect(screen.getByRole("region", { name: /BAF-001/ })).toBeTruthy();
    expect(screen.getByText(/Supplier staff may not be available/)).toBeTruthy();
    expect(screen.getByText(/BAF-002, BAF-003/)).toBeTruthy();
  });

  it("render their empty states", () => {
    renderBlock("baf_summary", { ...fixtures.baf_summary, total: 0, rows: [] });
    expect(screen.getByText(/No open strategic risks/)).toBeTruthy();
    cleanup();
    renderBlock("baf_above_appetite", { total_open: 0, count: 0, no_appetite: 0, rows: [] });
    expect(screen.getByText(/No strategic risk is above its appetite/)).toBeTruthy();
    cleanup();
    renderBlock("baf_linkage", { in_scope_only: true, linked_total: 0, groups: [], unlinked: [] });
    expect(screen.getByText(/No risks in this report's scope are linked/)).toBeTruthy();
  });

  it("describes trend and location in words", () => {
    expect(trendText("up")).toBe("↑ Worsening");
    expect(trendText("down")).toBe("↓ Improving");
    expect(trendText(null)).toBe("New");
    const risk = {
      project_code: null,
      project_name: null,
      programme_name: "Digital",
    } as LinkedRisk;
    expect(riskWhere(risk)).toBe("Digital");
    expect(riskWhere({ ...risk, project_code: "CMR", project_name: "Case" })).toBe("CMR Case");
  });

  it("assurance_by_programme lists each programme's rating in words", () => {
    renderBlock("assurance_by_programme", fixtures.assurance_by_programme);
    expect(screen.getByText("Digital public services")).toBeTruthy();
    expect(screen.getAllByText(/Limited assurance/).length).toBeGreaterThan(0);
    expect(screen.getByText(/↓ Worse/)).toBeTruthy();
    expect(screen.getByText(/was Reasonable assurance/)).toBeTruthy();
    expect(screen.getByText(/Two milestones missed/)).toBeTruthy();
    cleanup();
    renderBlock("assurance_by_programme", {
      ...fixtures.assurance_by_programme,
      total: 0,
      rows: [],
    });
    expect(screen.getByText(/No programmes in this report's scope/)).toBeTruthy();
  });

  it("describes the direction of a programme rating in words", () => {
    expect(directionText("better")).toBe("↑ Improved");
    expect(directionText("worse")).toBe("↓ Worse");
    expect(directionText("new")).toBe("First rating");
    expect(directionText(null)).toBe("—");
  });
});
