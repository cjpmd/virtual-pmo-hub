// @vitest-environment jsdom
// NHS-4 efficiency blocks render the data private.rb_efficiency_* returns (fixture captured from
// the local Postgres with supabase/tests/efficiency_blocks.sql's data, ids anonymised), their empty
// states, and the pure text helpers.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fixtures from "./__fixtures__/efficiency.json";
import "./catalogue";
import { gapText, monthLabel, reasonText, shareText, stageText } from "./catalogue/efficiency";
import { getBlock, resolveConfig } from "./registry";
import type { BlockInstance, RenderContext } from "./types";
import { FALLBACK_SCHEME } from "@/services/reports";
import { isReportBlockEnabled } from "@/lib/modules";
import { defaultSettings } from "@/data/settings-data";

vi.mock("@/components/auth/organisation-provider", () => ({ useOrgId: () => "org-test" }));
afterEach(cleanup);

const KEYS = [
  "efficiency_summary",
  "efficiency_breakdown",
  "efficiency_schemes_at_risk",
  "efficiency_recurrent",
];
const instance = (blockKey: string, config: Record<string, unknown> = {}): BlockInstance => ({
  id: `i-${blockKey}`,
  blockKey,
  blockVersion: 1,
  config,
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
  asAt: "2026-07-15",
  instance: instance(blockKey),
});
function renderBlock(key: string, data: unknown, config: Record<string, unknown> = {}) {
  const definition = getBlock(key)!;
  const Renderer = definition.Renderer;
  return render(
    <Renderer
      data={data}
      config={resolveConfig(definition, instance(key, config))}
      ctx={ctx(key)}
    />,
  );
}

describe("efficiency blocks", () => {
  it("are registered, partner-unsafe and owned by the efficiency module", () => {
    const off = { ...defaultSettings, modules: { enabled: {}, pack: "general" as const } };
    const on = {
      ...defaultSettings,
      modules: { enabled: { efficiency: true }, pack: "general" as const },
    };
    for (const key of KEYS) {
      const definition = getBlock(key);
      expect(definition?.partnerSafe).toBe(false);
      expect(isReportBlockEnabled(key, off)).toBe(false);
      expect(isReportBlockEnabled(key, on)).toBe(true);
    }
  });

  it("summary shows the year, the measures and the gap to target", () => {
    renderBlock("efficiency_summary", fixtures.efficiency_summary);
    expect(screen.getByText(/financial year 2026\/27/)).toBeTruthy();
    expect(screen.getAllByText("Forecast outturn").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/short$/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Cumulative savings by month")).toBeTruthy();
    expect(screen.getByText("Apr 26")).toBeTruthy();
    expect(screen.getByText("Mar 27")).toBeTruthy();
  });

  it("breakdown by unit names units, targets and the forecast against target", () => {
    renderBlock("efficiency_breakdown", fixtures.efficiency_breakdown);
    expect(screen.getByText("Surgery")).toBeTruthy();
    expect(screen.getByText("Estates")).toBeTruthy();
    expect(screen.getByText("Forecast against target")).toBeTruthy();
    expect(screen.getByText("No target")).toBeTruthy();
  });

  it("breakdown by stage uses the stage labels", () => {
    renderBlock("efficiency_breakdown", fixtures.efficiency_breakdown_stage, {
      group_by: "stage",
    });
    expect(screen.getByText("In delivery")).toBeTruthy();
    expect(screen.getByText("On hold")).toBeTruthy();
    expect(screen.queryByText("Forecast against target")).toBeNull();
  });

  it("schemes at risk give the reasons in words", () => {
    renderBlock("efficiency_schemes_at_risk", fixtures.efficiency_schemes_at_risk);
    expect(screen.getByText(/Theatre productivity/)).toBeTruthy();
    expect(
      screen.getByText(
        "Forecast below plan; Actual to date below plan; In delivery without an approved impact assessment",
      ),
    ).toBeTruthy();
    expect(screen.getByText("On hold with planned savings")).toBeTruthy();
    expect(screen.getByText(/more than 10% below plan/)).toBeTruthy();
  });

  it("recurrent split shows the shares and categories", () => {
    renderBlock("efficiency_recurrent", fixtures.efficiency_recurrent);
    expect(screen.getByText("95.2% of the plan")).toBeTruthy();
    expect(screen.getByText("Clinical productivity")).toBeTruthy();
  });

  it("render an empty state for an organisation with nothing (or an outsider's {})", () => {
    for (const key of KEYS) {
      cleanup();
      renderBlock(key, {});
      expect(screen.getByText(/^No /)).toBeTruthy();
    }
  });
});

describe("efficiency block text helpers", () => {
  const money = (n: number) => `£${n}`;
  it("gapText", () => {
    expect(gapText(null, money)).toBe("No target");
    expect(gapText(0, money)).toBe("On target");
    expect(gapText(500, money)).toBe("£500 short");
    expect(gapText("-200", money)).toBe("£200 ahead");
  });
  it("monthLabel, reasonText, stageText, shareText", () => {
    expect(monthLabel("2026-04-01")).toBe("Apr 26");
    expect(reasonText("on_hold")).toBe("On hold with planned savings");
    expect(reasonText("other")).toBe("other");
    expect(stageText("delivered")).toBe("Delivered / closed");
    expect(stageText(null)).toBe("—");
    expect(shareText(95.2)).toBe("95.2%");
    expect(shareText("40.0")).toBe("40%");
    expect(shareText(null)).toBe("—");
  });
});
