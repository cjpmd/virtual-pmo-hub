import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake PostgREST: one row per table, updated only when the updated_at filter matches.
const db = new Map<string, { id: string; updated_at: string }>();
const sent: (string | undefined)[] = [];
let clock = 0;
const stamp = () => `2026-10-06T10:00:00.${String(++clock).padStart(6, "0")}+00:00`;

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let op: "update" | "select" = "select";
    const builder = {
      update: () => ((op = "update"), builder),
      select: () => builder,
      eq: (column: string, value: unknown) => ((filters[column] = value), builder),
      maybeSingle: async () => ({ data: db.get(table) ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => {
        const row = db.get(table);
        if (op === "update") sent.push(filters["updated_at"] as string | undefined);
        const matches = row && (!filters["updated_at"] || filters["updated_at"] === row.updated_at);
        if (op === "update" && row && matches) row.updated_at = stamp();
        resolve({ data: matches && row ? [{ ...row }] : [], error: null });
      },
    };
    return builder;
  };
  return { supabase: { from } };
});

const { latest, sameInstant, updateRow } = await import("./write");
const save = (lastSeen: string) =>
  updateRow("risks", "r1", { title: "x" }, { context: "Saving", lastSeen });

describe("updateRow optimistic concurrency", () => {
  beforeEach(() => {
    sent.length = 0;
    db.set("risks", { id: "r1", updated_at: stamp() });
  });

  it("sends its own newer write, not a stale copy the screen still holds", async () => {
    const loaded = db.get("risks")!.updated_at;
    await save(loaded);
    // The screen hasn't refetched: it still passes the version it loaded.
    await expect(save(loaded)).resolves.toMatchObject({ id: "r1" });
    expect(sent[1]).not.toBe(loaded);
  });

  it("still reports someone else's later change as a conflict", async () => {
    const loaded = db.get("risks")!.updated_at;
    await save(loaded);
    db.get("risks")!.updated_at = stamp(); // another user saves
    await expect(save(loaded)).rejects.toMatchObject({ kind: "conflict" });
  });

  it("uses the caller's copy when it is newer than our last write", async () => {
    const loaded = db.get("risks")!.updated_at;
    await save(loaded);
    db.get("risks")!.updated_at = stamp(); // another user saves; the screen refetches
    const refreshed = db.get("risks")!.updated_at;
    await save(refreshed);
    expect(sent.at(-1)).toBe(refreshed);
  });
});

describe("updated_at comparison", () => {
  it("keeps microseconds and accepts both textual forms", () => {
    expect(sameInstant("2026-10-06 10:00:00.123456+00", "2026-10-06T10:00:00.123456+00:00")).toBe(
      true,
    );
    expect(latest("2026-10-06T10:00:00.123456+00:00", "2026-10-06T10:00:00.123457+00:00")).toBe(
      "2026-10-06T10:00:00.123457+00:00",
    );
    expect(latest(null, "2026-10-06T10:00:00.1+00:00")).toBe("2026-10-06T10:00:00.1+00:00");
  });
});
