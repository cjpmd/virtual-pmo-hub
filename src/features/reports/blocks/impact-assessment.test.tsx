// @vitest-environment jsdom
// NHS-3 impact assessment blocks render the data private.rb_impact_* returns (fixture captured
// from the local Postgres, ids anonymised) and their empty states, with statuses in words.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fixtures from "./__fixtures__/impact-assessment.json";
import "./catalogue";
import { assessmentStatusText, scoreText, signoffText } from "./catalogue/impact-assessment";
import { getBlock, resolveConfig } from "./registry";
import type { BlockInstance, RenderContext } from "./types";
import { FALLBACK_SCHEME } from "@/services/reports";
import { isReportBlockEnabled } from "@/lib/modules";
import { defaultSettings } from "@/data/settings-data";

vi.mock("@/components/auth/organisation-provider", () => ({ useOrgId: () => "org-test" }));
afterEach(cleanup);

const KEYS = ["impact_assessment_status", "impact_assessments_awaiting", "impact_negative_impacts"];
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
  asAt: "2027-12-28",
  instance: instance(blockKey),
});
function renderBlock(key: string, data: unknown) {
  const definition = getBlock(key)!;
  const Renderer = definition.Renderer;
  return render(
    <Renderer data={data} config={resolveConfig(definition, instance(key))} ctx={ctx(key)} />,
  );
}

describe("impact assessment blocks", () => {
  it("are registered, partner-unsafe and owned by the impact_assessment module", () => {
    const off = { ...defaultSettings, modules: { enabled: {}, pack: "general" as const } };
    const on = {
      ...defaultSettings,
      modules: { enabled: { impact_assessment: true }, pack: "general" as const },
    };
    for (const key of KEYS) {
      const definition = getBlock(key);
      expect(definition?.partnerSafe).toBe(false);
      expect(definition?.category).toBe("assurance");
      expect(isReportBlockEnabled(key, off)).toBe(false);
      expect(isReportBlockEnabled(key, on)).toBe(true);
    }
  });

  it("impact_assessment_status shows counts, the register and projects past the gate", () => {
    renderBlock("impact_assessment_status", fixtures.impact_assessment_status);
    expect(screen.getByRole("table", { name: /most urgent first/i })).toBeTruthy();
    expect(screen.getByText("WAR Ward reconfiguration")).toBeTruthy();
    expect(screen.getAllByText("Awaiting sign-off").length).toBeGreaterThan(0);
    expect(screen.getByText("0 of 2 signed off")).toBeTruthy();
    expect(screen.getByText("Full")).toBeTruthy();
    expect(
      screen.getByText(/Past the delivery gate without an approved assessment \(1\)/),
    ).toBeTruthy();
    expect(screen.getByText(/Outpatient redesign/)).toBeTruthy();
  });

  it("impact_assessments_awaiting lists the roles still to decide and the wait", () => {
    renderBlock("impact_assessments_awaiting", fixtures.impact_assessments_awaiting);
    expect(screen.getByText(/Medical Director, Chief Nurse/)).toBeTruthy();
    expect(screen.getByText(/400 days/)).toBeTruthy();
  });

  it("impact_negative_impacts shows the score in words and each mitigation", () => {
    renderBlock("impact_negative_impacts", fixtures.impact_negative_impacts);
    expect(screen.getByText("2 × 3 = 6")).toBeTruthy();
    expect(screen.getByText("Rota gaps on nights")).toBeTruthy();
    expect(screen.getByText("Bank staff cover")).toBeTruthy();
    expect(screen.getByText("Age")).toBeTruthy();
    expect(screen.getByText("Patient transport")).toBeTruthy();
  });

  it("says when a negative impact has no mitigation", () => {
    const data = structuredClone(fixtures.impact_negative_impacts);
    data.quality[0]!.mitigations = null as unknown as string;
    data.unmitigated = 1;
    renderBlock("impact_negative_impacts", data);
    expect(screen.getByText("None recorded")).toBeTruthy();
  });

  it("render their empty states", () => {
    renderBlock("impact_assessment_status", {
      ...fixtures.impact_assessment_status,
      total: 0,
      rows: [],
      gaps: [],
    });
    expect(screen.getByText(/No impact assessments for these projects/)).toBeTruthy();
    cleanup();
    renderBlock("impact_assessments_awaiting", { count: 0, rows: [] });
    expect(screen.getByText(/No impact assessments are awaiting sign-off/)).toBeTruthy();
    cleanup();
    renderBlock("impact_negative_impacts", {
      assessments: 0,
      quality_count: 0,
      equality_count: 0,
      unmitigated: 0,
      quality: [],
      equality: [],
    });
    expect(screen.getByText(/No negative impacts recorded/)).toBeTruthy();
  });

  it("describes status, sign-off and score in words", () => {
    expect(assessmentStatusText("reassessment_required")).toBe("Re-assessment required");
    expect(assessmentStatusText("in_review")).toBe("Awaiting sign-off");
    expect(assessmentStatusText(null)).toBe("—");
    expect(signoffText(1, 2)).toBe("1 of 2 signed off");
    expect(signoffText(0, 0)).toBe("—");
    expect(scoreText(null)).toBe("Not scored");
    expect(scoreText(12)).toBe("12");
    expect(scoreText(12, 3, 4)).toBe("3 × 4 = 12");
  });
});
