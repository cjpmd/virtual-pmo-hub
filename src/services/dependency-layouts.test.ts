import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "./service-error";

// The write helper and the one read are faked: the first save can be made to lose a race.
const writes: { kind: "insert" | "update"; values: unknown; lastSeen?: string | null }[] = [];
let failNextUpdate: false | "conflict" | "forbidden" = false;
let latestRow: { id: string; positions: unknown; updated_at: string } | null = null;

vi.mock("./write", () => ({
  insertRow: async (_table: string, values: unknown) => {
    writes.push({ kind: "insert", values });
    return { id: "new", updatedAt: "t-insert" };
  },
  updateRow: async (
    _table: string,
    id: string,
    values: unknown,
    options: { lastSeen?: string | null },
  ) => {
    writes.push({ kind: "update", values, lastSeen: options.lastSeen ?? null });
    if (failNextUpdate) {
      const kind = failNextUpdate;
      failNextUpdate = false;
      throw new ServiceError(kind, `Refused (${kind})`);
    }
    return { id, updatedAt: `t-${writes.length}` };
  },
  deleteRows: async () => undefined,
}));
vi.mock("@/integrations/supabase/client", () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    maybeSingle: async () => ({ data: latestRow, error: null }),
  };
  return { supabase: { from: () => builder } };
});

const { mergeMovedNodes, parsePositions, saveLayoutMerging } = await import("./dependency-layouts");

describe("mergeMovedNodes", () => {
  const latest = { a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, c: { x: 3, y: 3 } };
  const mine = { a: { x: 10, y: 10 }, b: { x: 20, y: 20 }, d: { x: 40, y: 40 } };

  it("keeps everyone else's moves and puts only my moved nodes on top", () => {
    expect(mergeMovedNodes(latest, mine, ["a", "d"])).toEqual({
      a: { x: 10, y: 10 },
      b: { x: 2, y: 2 }, // I loaded b but didn't move it: theirs wins
      c: { x: 3, y: 3 },
      d: { x: 40, y: 40 }, // new to the saved layout
    });
  });

  it("ignores moved ids I have no position for, and leaves the inputs alone", () => {
    const before = JSON.stringify(latest);
    expect(mergeMovedNodes(latest, mine, ["zzz"])).toEqual(latest);
    expect(mergeMovedNodes(latest, {}, new Set(["a"]))).toEqual(latest);
    expect(JSON.stringify(latest)).toBe(before);
  });
});

describe("parsePositions", () => {
  it("keeps finite {x, y} entries only", () => {
    expect(
      parsePositions({
        a: { x: 1, y: 2 },
        b: { x: "1", y: 2 },
        c: null,
        d: { x: Number.NaN, y: 1 },
        e: { x: 0, y: -5 },
      }),
    ).toEqual({ a: { x: 1, y: 2 }, e: { x: 0, y: -5 } });
    expect(parsePositions([])).toEqual({});
    expect(parsePositions("x")).toEqual({});
  });
});

describe("saveLayoutMerging", () => {
  beforeEach(() => {
    writes.length = 0;
    failNextUpdate = false;
    latestRow = null;
  });

  it("creates the layout the first time, then updates it with the loaded updated_at", async () => {
    const first = await saveLayoutMerging({
      orgId: "org",
      saved: null,
      positions: { a: { x: 1, y: 1 } },
      moved: ["a"],
    });
    expect(writes[0]).toEqual({
      kind: "insert",
      values: { organisation_id: "org", positions: { a: { x: 1, y: 1 } } },
    });
    await saveLayoutMerging({ orgId: "org", saved: first, positions: {}, moved: [] });
    // The update sends positions only: the one column the update grant allows.
    expect(writes[1]).toEqual({ kind: "update", values: { positions: {} }, lastSeen: "t-insert" });
  });

  it("after a conflict, reloads, re-applies only my moved nodes and saves again", async () => {
    failNextUpdate = "conflict";
    latestRow = {
      id: "L",
      positions: { a: { x: 1, y: 1 }, b: { x: 99, y: 99 } }, // someone else moved b
      updated_at: "t-theirs",
    };
    const result = await saveLayoutMerging({
      orgId: "org",
      saved: { id: "L", positions: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } }, updatedAt: "t-old" },
      positions: { a: { x: 50, y: 50 }, b: { x: 2, y: 2 } }, // I moved a only
      moved: ["a"],
    });
    expect(writes.map((write) => write.lastSeen)).toEqual(["t-old", "t-theirs"]);
    expect(result.positions).toEqual({ a: { x: 50, y: 50 }, b: { x: 99, y: 99 } });
    expect(writes[1]!.values).toEqual({ positions: result.positions });
  });

  it("passes other errors through without retrying", async () => {
    failNextUpdate = "forbidden";
    await expect(
      saveLayoutMerging({
        orgId: "org",
        saved: { id: "L", positions: {}, updatedAt: "t" },
        positions: {},
        moved: [],
      }),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(writes).toHaveLength(1);
  });
});
