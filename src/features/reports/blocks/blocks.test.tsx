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
import "./catalogue";
import { getBlock, listBlocks, registerBlock, resolveConfig } from "./registry";
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

describe("blocks render empty data", () => {
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
