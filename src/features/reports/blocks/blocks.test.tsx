// @vitest-environment jsdom
// Component tests (spec §19): every block renders with fixture data (captured from the demo
// seed through report_block_data), with empty data, and the frame handles errors, unknown
// keys and failed loads without breaking the report.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { z } from "zod";
import fixtures from "./__fixtures__/phase1.json";
import fixtures2 from "./__fixtures__/phase2.json";
import fixtures34 from "./__fixtures__/phase34.json";
import fixturesFunding from "./__fixtures__/funding.json";
import { potPosition, realisedWidth, type CoverageData } from "./catalogue/funding";
import { ALL_BLOCKS } from "./catalogue";
import { getBlock, listBlocks, registerBlock, resolveConfig, supportsScope } from "./registry";
import type { BlockInstance, RenderContext } from "./types";
import { FALLBACK_SCHEME } from "@/services/reports";

vi.mock("@/components/auth/organisation-provider", () => ({ useOrgId: () => "org-test" }));
vi.mock("@/services/reports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/reports")>();
  return { ...actual, fetchBlockData: vi.fn().mockRejectedValue(new Error("Network down")) };
});

const { BlockFrame } = await import("../viewer/ReportDocument");

afterEach(cleanup);

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

const instance = (blockKey: string, extra: Partial<BlockInstance> = {}): BlockInstance => ({
  id: `i-${blockKey}`,
  blockKey,
  blockVersion: 1,
  config: {},
  placement: "report",
  ...extra,
});

const ctx = (blockKey: string, entityId: string | null = null): RenderContext => ({
  scheme: FALLBACK_SCHEME,
  mode: "screen",
  audience: "internal",
  reportId: null,
  entityId,
  editable: false,
  source: "snapshot",
  asAt: "2026-11-03",
  instance: instance(blockKey),
});

function renderBlock(key: string, data: unknown, entityId: string | null = null) {
  const definition = getBlock(key)!;
  const Renderer = definition.Renderer;
  return wrap(
    <Renderer
      data={data}
      config={resolveConfig(definition, instance(key))}
      ctx={ctx(key, entityId)}
    />,
  );
}

const EMPTY: Record<string, unknown> = {
  report_cover: {
    title: "T",
    status: "draft",
    as_at: "2026-11-03",
    forum_name: null,
    meeting_date: null,
    overall_rating: null,
    overall_rating_rationale: null,
    author: null,
    scope_label: null,
    project_count: 0,
  },
  executive_summary: { heading: null, narrative: null },
  free_text: { heading: null, narrative: null },
  section_heading: { title: "Section" },
  overall_status: {
    mode: "scope",
    declared: null,
    evidenced: null,
    rationale: null,
    counts: { green: 0, amber: 0, red: 0, not_set: 0 },
    divergent: 0,
  },
  health_by_dimension: { mode: "project", months: [], current: null },
  project_status_grid: { group_by: "programme", rows: [], total: 0 },
  project_summary: null,
  milestone_slippage: { multi: false, rows: [] },
  budget_summary: {
    currency: "GBP",
    rows: [],
    totals: {
      budget: null,
      actual_to_date: null,
      eac: null,
      variance: null,
      variance_percent: null,
      change_period: null,
    },
  },
  decisions_required: { rows: [] },
  top_raid: { matrix: { name: "Standard", bands: [] }, rows: [], open_total: 0 },
  change_requests: { rows: [] },
  highlight_report_summary: { id: null },
};

describe("Phase 1 blocks render fixture data", () => {
  for (const [key, data] of Object.entries(fixtures.scope)) {
    it(`${key} (scope)`, () => {
      const { container } = renderBlock(key, data);
      if (key !== "section_heading") expect(container.textContent?.length).toBeGreaterThan(0);
    });
  }
  for (const [key, data] of Object.entries(fixtures.project)) {
    it(`${key} (deep-dive project)`, () => {
      const { container } = renderBlock(key, data, "d0000000-0000-4000-8000-000000001001");
      expect(container.textContent?.length).toBeGreaterThan(0);
    });
  }
  it("the grid shows every project with scheme labels", () => {
    renderBlock("project_status_grid", fixtures.scope.project_status_grid);
    expect(screen.getByText("Electronic Patient Record")).toBeTruthy();
    expect(screen.getAllByText("Red").length).toBeGreaterThan(0);
  });
  it("overall status shows declared vs evidenced and the divergence", () => {
    renderBlock("overall_status", fixtures.project.overall_status, "p");
    expect(screen.getByText(/Declared better than the evidence/)).toBeTruthy();
  });
  it("decisions show their options", () => {
    renderBlock("decisions_required", fixtures.scope.decisions_required);
    expect(screen.getByText("Supplier B (recommended)")).toBeTruthy();
  });
});

const EMPTY2: Record<string, unknown> = {
  rating_distribution: { total: 0, declared: null, evidenced: null },
  divergence_list: { rows: [] },
  milestone_timeline: {
    from: "2026-10-01",
    to: "2027-04-01",
    as_at: "2026-11-03",
    multi: false,
    rows: [],
  },
  roadmap: { from: "2026-08-01", to: "2027-11-01", as_at: "2026-11-03", rows: [] },
  burnup_forecast: null,
  stage_gates: { rows: [] },
  spend_profile: { rows: [], actuals_through: null },
  budget_movers: { overspend: [], movers: [] },
  resource_summary: { people: [], over_allocated: 0, unfilled: 0, team_size: 0 },
  decisions_taken: { since: "2026-10-01", rows: [] },
  risk_heatmap: {
    matrix: { name: "M", bands: [], likelihood: null, consequence: null },
    cells: [],
    total: 0,
  },
  escalations: { rows: [] },
  dependencies: { rows: [] },
  benefits_summary: { rows: [], planned: null, realised: null, capabilities: null, outcomes: null },
  requests_pipeline: { rows: [] },
  actions_log: { since: "2026-10-01", open: [], closed: [], overdue_count: 0 },
  data_quality: { since: "2026-10-01", stale_days: 30, rows: [], clean: 0 },
  approvals_status: { rows: [] },
  project_overview: {
    summary: null,
    health: {
      mode: "project",
      declared: null,
      evidenced: "not_set",
      divergence_days: 0,
      rating_rank_delta: null,
      divergence_alert: null,
      justified: null,
      justification: null,
      last_report_date: null,
      report_overdue: null,
      trend: [],
    },
    history: { mode: "project", months: [], current: null },
    milestones: { multi: false, rows: [] },
    raid: { matrix: { name: "M", bands: [] }, rows: [], open_total: 0 },
    highlight: { id: null },
  },
};

describe("Phase 2 blocks render fixture data", () => {
  for (const [key, data] of Object.entries(fixtures2.scope)) {
    it(`${key} (portfolio scope)`, () => {
      const { container } = renderBlock(key, data);
      expect(container.textContent?.length).toBeGreaterThan(0);
    });
  }
  for (const [key, data] of Object.entries(fixtures2.project)) {
    it(`${key} (deep-dive project)`, () => {
      const { container } = renderBlock(key, data, "d0000000-0000-4000-8000-000000001001");
      expect(container.textContent?.length).toBeGreaterThan(0);
    });
  }
  it("resource summary flags the over-allocated PM", () => {
    renderBlock("resource_summary", fixtures2.scope.resource_summary);
    expect(screen.getByText("Pete Manager")).toBeTruthy();
  });
  it("NHS assurance relabels ratings", () => {
    const definition = getBlock("rating_distribution")!;
    const Renderer = definition.Renderer;
    const nhs = {
      id: "nhs",
      key: "nhs_assurance",
      name: "NHS",
      isAssurance: true,
      levels: [
        {
          key: "substantial",
          label: "Substantial assurance",
          colour: "#2e7d52",
          rank: 1,
          rag: "green" as const,
        },
        {
          key: "reasonable",
          label: "Reasonable assurance",
          colour: "#ca8a04",
          rank: 2,
          rag: "amber" as const,
        },
        {
          key: "limited",
          label: "Limited assurance",
          colour: "#c2410c",
          rank: 3,
          rag: "red" as const,
        },
        { key: "no_assurance", label: "No assurance", colour: "#7f1d1d", rank: 4, rag: null },
      ],
    };
    wrap(
      <Renderer
        data={fixtures2.scope.rating_distribution}
        config={{}}
        ctx={{ ...ctx("rating_distribution"), scheme: nhs }}
      />,
    );
    expect(screen.getAllByText(/Limited assurance/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\bRed\b/)).toBeNull();
  });
});

describe("blocks render empty data", () => {
  for (const [key, data] of Object.entries(EMPTY2)) {
    it(`${key} (phase 2)`, () => {
      expect(() => renderBlock(key, data)).not.toThrow();
    });
  }
  it("covers every Phase 2 block", () => {
    const phase2 = listBlocks()
      .filter((b) => b.phase === 2)
      .map((b) => b.key)
      .sort();
    expect(Object.keys(EMPTY2).sort()).toEqual(phase2);
  });
  for (const [key, data] of Object.entries(EMPTY)) {
    it(key, () => {
      expect(() => renderBlock(key, data)).not.toThrow();
    });
  }
  it("covers every Phase 1 block", () => {
    const phase1 = listBlocks()
      .filter((b) => b.phase === 1)
      .map((b) => b.key)
      .sort();
    expect(Object.keys(EMPTY).sort()).toEqual(phase1);
  });
});

describe("configs", () => {
  it("every default config passes its schema", () => {
    for (const definition of listBlocks()) {
      expect(
        definition.configSchema.safeParse(definition.defaultConfig).success,
        definition.key,
      ).toBe(true);
    }
  });
  it("bad config falls back to defaults", () => {
    const definition = getBlock("top_raid")!;
    expect(resolveConfig(definition, instance("top_raid", { config: { limit: "lots" } }))).toEqual(
      definition.defaultConfig,
    );
    expect(resolveConfig(definition, instance("top_raid", { config: { limit: 3 } }))).toMatchObject(
      { limit: 3 },
    );
  });
  it("older block versions migrate", () => {
    const def = registerBlock({
      key: "test_migrating",
      version: 2,
      name: "Migrating",
      category: "layout",
      description: "",
      supportedScopes: ["project"],
      perEntity: false,
      configSchema: z.object({ count: z.number() }),
      defaultConfig: { count: 1 },
      migrateConfig: (old) => ({ count: Number((old as { n?: number }).n ?? 1) }),
      Renderer: () => null,
      partnerSafe: true,
      phase: 4,
    });
    expect(resolveConfig(def, instance("test_migrating", { config: { n: 7 } }))).toEqual({
      count: 7,
    });
  });
});

describe("error states", () => {
  const props = {
    blocks: [],
    deepDives: [],
    scheme: FALLBACK_SCHEME,
    asAt: "2026-11-03",
    mode: "screen" as const,
    audience: "internal" as const,
    reportId: null,
    editable: false,
  };
  it("an unknown block key shows a placeholder", () => {
    wrap(
      <BlockFrame
        instance={instance("no_such_block")}
        entityId={null}
        props={{ ...props, snapshot: () => ({}) }}
      />,
    );
    expect(screen.getByText(/It may come from a newer version/)).toBeTruthy();
  });
  it("a renderer that throws is contained", () => {
    registerBlock({
      key: "test_throws",
      version: 1,
      name: "Thrower",
      category: "layout",
      description: "",
      supportedScopes: ["project"],
      perEntity: false,
      configSchema: z.object({}),
      defaultConfig: {},
      Renderer: () => {
        throw new Error("boom");
      },
      partnerSafe: true,
      phase: 4,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    wrap(
      <BlockFrame
        instance={instance("test_throws")}
        entityId={null}
        props={{ ...props, snapshot: () => ({}) }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("boom");
  });
  it("a snapshot without the block says so", () => {
    wrap(
      <BlockFrame
        instance={instance("top_raid")}
        entityId={null}
        props={{ ...props, snapshot: () => undefined }}
      />,
    );
    expect(screen.getByText("Not stored in this snapshot.")).toBeTruthy();
  });
  it("a failed live load offers a retry", async () => {
    wrap(
      <BlockFrame
        instance={instance("top_raid")}
        entityId={null}
        props={{ ...props, live: { report_id: "r1" } }}
      />,
    );
    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Network down");
  });
  it("partner audience drops partner-unsafe blocks", () => {
    registerBlock({
      key: "test_unsafe",
      version: 1,
      name: "Unsafe",
      category: "resources",
      description: "",
      supportedScopes: ["project"],
      perEntity: false,
      configSchema: z.object({}),
      defaultConfig: {},
      Renderer: () => <p>secret names</p>,
      partnerSafe: false,
      phase: 4,
    });
    const { container } = wrap(
      <BlockFrame
        instance={instance("test_unsafe")}
        entityId={null}
        props={{ ...props, audience: "partner", snapshot: () => ({}) }}
      />,
    );
    expect(container.textContent).not.toContain("secret names");
    cleanup();
    wrap(
      <BlockFrame
        instance={instance("test_unsafe")}
        entityId={null}
        props={{ ...props, showPartnerPlaceholders: true, snapshot: () => ({}) }}
      />,
    );
    expect(screen.getByText(/Hidden from partner organisations/)).toBeTruthy();
  });
});

describe("Phase 3 and 4 blocks", () => {
  for (const [key, data] of Object.entries(fixtures34)) {
    it(`${key} renders fixture data`, () => {
      const { container } = renderBlock(key, data);
      expect(container.textContent?.length).toBeGreaterThan(0);
    });
  }
  it("changes since last lists RD04's slip", () => {
    renderBlock("changes_since_last", fixtures34.changes_since_last);
    expect(screen.getByText(/Largest slip 5 → 40 days/)).toBeTruthy();
  });
  const EMPTY34: Record<string, unknown> = {
    changes_since_last: { previous: null },
    raid_movement: { since: "2026-10-01", has_previous: false, new: [], closed: [], rescored: [] },
    lessons_learned: { since: "2026-10-01", rows: [] },
    linked_records: { rows: [] },
    programme_coverage: {
      currency: "GBP",
      rows: [],
      totals: { projects: 0, budget: null, forecast: null },
      collection: null,
    },
    benefits_value: {
      currency: "GBP",
      benefits: 0,
      planned: 0,
      realised: 0,
      percent: 0,
      cash_releasing_realised: 0,
      cash_releasing_planned: 0,
      at_risk: 0,
      disbenefit_value: 0,
      objectives: [],
      behind_count: 0,
      behind: [],
      overdue_count: 0,
      overdue: [],
    },
  };
  for (const [key, data] of Object.entries(EMPTY34)) {
    it(`${key} renders empty data`, () => {
      expect(() => renderBlock(key, data)).not.toThrow();
    });
  }
  it("covers every Phase 3 and 4 block", () => {
    const keys = listBlocks()
      .filter((b) => (b.phase === 3 || b.phase === 4) && !b.key.startsWith("test_"))
      .map((b) => b.key)
      .sort();
    expect(Object.keys(EMPTY34).sort()).toEqual(keys);
  });
});

describe("ALL_BLOCKS registry (tree-shaking guard)", () => {
  it("ALL_BLOCKS contains exactly 39 definitions", () => {
    // This test fails if a new block is added without updating catalogue/index.ts,
    // or if the explicit import chain is broken and blocks get tree-shaken.
    expect(ALL_BLOCKS).toHaveLength(39);
  });
  it("ALL_BLOCKS matches what the registry contains", () => {
    const registryKeys = listBlocks()
      .filter((b) => !b.key.startsWith("test_"))
      .map((b) => b.key)
      .sort();
    const catalogueKeys = ALL_BLOCKS.map((b) => b.key).sort();
    expect(catalogueKeys).toEqual(registryKeys);
  });
});

describe("data basis (A2)", () => {
  it("the cover shows what the figures are as at", () => {
    renderBlock("report_cover", {
      ...fixtures.scope.report_cover,
      data_basis:
        "Ratings as at 31 Oct 2026; financials and RAID current at publish (no history before 4 Nov 2026)",
    });
    expect(screen.getByText(/Data basis: Ratings as at 31 Oct 2026/)).toBeTruthy();
  });
});

describe("funding pack blocks (GL-14)", () => {
  for (const [key, data] of Object.entries(fixturesFunding)) {
    it(`${key} renders fixture data`, () => {
      const { container } = renderBlock(key, data);
      expect(container.textContent?.length).toBeGreaterThan(0);
    });
  }
  it("programme coverage shows the pot against what is requested", () => {
    renderBlock("programme_coverage", fixturesFunding.programme_coverage);
    expect(screen.getByText("Digital Care")).toBeTruthy();
    expect(screen.getByText("Over the pot")).toBeTruthy();
    expect(screen.getByText("Budgets of the projects in the collection")).toBeTruthy();
  });
  it("programme coverage outside a collection has no pot", () => {
    const { container } = renderBlock("programme_coverage", {
      ...fixturesFunding.programme_coverage,
      collection: null,
    });
    expect(container.querySelector("[data-pot]")).toBeNull();
  });
  it("potPosition: over, under and no pot", () => {
    const base: NonNullable<CoverageData["collection"]> = {
      name: "Fund",
      pot: 100,
      requested: 150,
      awarded: 0,
      remaining: 100,
    };
    expect(potPosition(base)).toEqual({ over: true, amount: 50 });
    expect(potPosition({ ...base, requested: "40" })).toEqual({ over: false, amount: 60 });
    expect(potPosition({ ...base, pot: null })).toBeNull();
  });
  it("benefits value lists objectives, behind profile and overdue measurements", () => {
    renderBlock("benefits_value", fixturesFunding.benefits_value);
    expect(screen.getByText("Better patient flow")).toBeTruthy();
    expect(screen.getByText(/Agency spend/)).toBeTruthy();
    expect(screen.getByText(/10 days overdue, unowned/)).toBeTruthy();
    expect(screen.getByText("and 1 more")).toBeTruthy();
    expect(screen.getByText(/Disbenefits planned/)).toBeTruthy();
  });
  it("realisedWidth caps at 100 and survives a zero plan", () => {
    expect(realisedWidth(200, 50)).toBe(25);
    expect(realisedWidth(100, 250)).toBe(100);
    expect(realisedWidth(0, 0)).toBe(0);
  });
  it("the cover shows its cover text", () => {
    const { container } = renderBlock("report_cover", {
      ...fixtures.scope.report_cover,
      cover_text: "Papers for the funding round.",
    });
    expect(container.querySelector("[data-cover-text]")?.textContent).toBe(
      "Papers for the funding round.",
    );
  });
  it("a collection scope accepts the blocks a custom list does", () => {
    expect(supportsScope(getBlock("project_status_grid")!, "collection")).toBe(true);
    expect(supportsScope(getBlock("requests_pipeline")!, "collection")).toBe(true);
    expect(supportsScope(getBlock("programme_coverage")!, "project")).toBe(false);
    expect(supportsScope(getBlock("programme_coverage")!, "any")).toBe(true);
  });
});
