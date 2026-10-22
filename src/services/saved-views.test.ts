import { describe, expect, it } from "vitest";
import {
  canEditView,
  parseViewConfig,
  resolveDefaultView,
  viewConfigJson,
  type SavedViewRecord,
  type ViewConfig,
} from "./saved-views";
import {
  canEditDashboard,
  dashboardLayoutJson,
  defaultDashboardId,
  parseDashboardLayout,
  type DashboardRecord,
} from "./dashboards";

const fallback: ViewConfig = {
  type: "table",
  groupBy: "status",
  sortKey: "",
  filter: "",
  visible: ["title", "status"],
};

describe("saved view config", () => {
  it("round-trips through the stored JSON", () => {
    const config: ViewConfig = {
      type: "kanban",
      groupBy: "owner",
      sortKey: "due",
      filter: "gate",
      filters: [{ key: "status", operator: "oneOf", value: ["Open", "Late"] }],
      visible: ["title"],
    };
    expect(parseViewConfig(JSON.parse(JSON.stringify(viewConfigJson(config))), fallback)).toEqual(
      config,
    );
  });

  it("falls back field by field on missing or malformed values", () => {
    expect(parseViewConfig(null, fallback)).toEqual(fallback);
    expect(
      parseViewConfig(
        {
          type: "gantt",
          groupBy: 3,
          visible: ["a", 1, "b"],
          filters: [
            { key: "x", operator: "like" },
            { operator: "truthy" },
            { key: "y", operator: "truthy" },
          ],
        },
        fallback,
      ),
    ).toEqual({ ...fallback, visible: ["a", "b"], filters: [{ key: "y", operator: "truthy" }] });
  });
});

const view = (overrides: Partial<SavedViewRecord>): SavedViewRecord => ({
  id: "v",
  name: "View",
  ownerId: "me",
  isShared: false,
  isDefault: false,
  updatedAt: "2026-10-22T10:00:00Z",
  config: fallback,
  ...overrides,
});

describe("default view", () => {
  it("prefers my default, then the shared default, then the seeded default", () => {
    const mine = view({ id: "mine", isDefault: true });
    const theirs = view({ id: "theirs", ownerId: "other", isDefault: true });
    const shared = view({ id: "shared", ownerId: "other", isShared: true, isDefault: true });
    expect(resolveDefaultView([shared, mine], "me", "seeded")).toBe("mine");
    expect(resolveDefaultView([shared, theirs], "me", "seeded")).toBe("shared");
    expect(resolveDefaultView([view({})], "me", "seeded")).toBe("seeded");
    expect(resolveDefaultView([], "me", null)).toBeNull();
  });
});

describe("who can edit (mirrors RLS)", () => {
  it("owners edit their own views, except a shared view that is the board default", () => {
    expect(canEditView(view({}), "me", false)).toBe(true);
    expect(canEditView(view({ isShared: true }), "me", false)).toBe(true);
    expect(canEditView(view({ isShared: true, isDefault: true }), "me", false)).toBe(false);
    expect(canEditView(view({ ownerId: "other" }), "me", true)).toBe(false);
  });

  it("PMO and admins edit any shared view", () => {
    expect(canEditView(view({ ownerId: "other", isShared: true }), "me", true)).toBe(true);
    expect(
      canEditView(view({ ownerId: "other", isShared: true, isDefault: true }), "me", true),
    ).toBe(true);
    expect(canEditView(view({ ownerId: "other", isShared: true }), "me", false)).toBe(false);
  });
});

const dashboard = (overrides: Partial<DashboardRecord>): DashboardRecord => ({
  id: "d",
  name: "Dashboard",
  ownerId: "me",
  isShared: false,
  isDefault: false,
  updatedAt: "2026-10-22T10:00:00Z",
  widgets: [],
  ...overrides,
});

describe("dashboards", () => {
  it("keeps known widgets in order and drops the rest", () => {
    expect(
      parseDashboardLayout({
        version: 1,
        widgets: [{ type: "Table" }, { type: "Sparkline" }, "RAG donut", { type: "KPI number" }],
      }),
    ).toEqual(["Table", "KPI number"]);
    expect(parseDashboardLayout([])).toEqual([]);
    expect(parseDashboardLayout(null)).toEqual([]);
    expect(parseDashboardLayout(dashboardLayoutJson(["Workload", "Timeline"]))).toEqual([
      "Workload",
      "Timeline",
    ]);
  });

  it("opens my own default only", () => {
    expect(
      defaultDashboardId(
        [
          dashboard({ id: "theirs", ownerId: "other", isShared: true, isDefault: true }),
          dashboard({ id: "mine", isDefault: true }),
        ],
        "me",
      ),
    ).toBe("mine");
    expect(
      defaultDashboardId([dashboard({ ownerId: "other", isShared: true, isDefault: true })], "me"),
    ).toBeNull();
  });

  it("owners edit their own; PMO and admins edit shared ones", () => {
    expect(canEditDashboard(dashboard({}), "me", false)).toBe(true);
    expect(canEditDashboard(dashboard({ ownerId: "other", isShared: true }), "me", false)).toBe(
      false,
    );
    expect(canEditDashboard(dashboard({ ownerId: "other", isShared: true }), "me", true)).toBe(
      true,
    );
    expect(canEditDashboard(dashboard({ ownerId: "other" }), "me", true)).toBe(false);
  });
});
