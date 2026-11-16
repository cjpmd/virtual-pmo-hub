import { describe, expect, it } from "vitest";
import {
  OVERFLOW_ALERT_AT,
  moveStagedSnapshots,
  sha256Hex,
  type OverflowDeps,
  type StagedSnapshot,
} from "./snapshot-overflow";

const row = async (id: string, payload: string, overrides: Partial<StagedSnapshot> = {}): Promise<StagedSnapshot> => ({
  snapshot_id: id,
  report_id: "r1",
  organisation_id: "o1",
  storage_path: `o1/r1/${id}.json`,
  payload,
  sha256: await sha256Hex(payload),
  attempts: 0,
  ...overrides,
});

function deps(rows: StagedSnapshot[], store: Map<string, string> = new Map()) {
  const calls: string[] = [];
  const d: OverflowDeps = {
    staged: async () => rows,
    upload: async (path, text) => {
      calls.push(`upload ${path}`);
      if (store.has(path)) return "exists";
      store.set(path, text);
      return "uploaded";
    },
    download: async (path) => store.get(path) ?? "",
    complete: async (id, path, hash) => {
      calls.push(`complete ${id} ${path} ${hash.slice(0, 8)}`);
    },
    fail: async (id) => {
      calls.push(`fail ${id}`);
      return (rows.find((r) => r.snapshot_id === id)?.attempts ?? 0) + 1;
    },
    sha256Hex,
  };
  return { d, calls, store };
}

describe("sha256Hex", () => {
  it("hashes UTF-8 text as Postgres digest(text, 'sha256') does", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex('{"name": "Café"}')).toHaveLength(64);
  });
});

describe("moveStagedSnapshots", () => {
  it("uploads each staged payload as published and completes it", async () => {
    const rows = [await row("s1", '{"a": 1}'), await row("s2", '{"b": 2}')];
    const { d, calls, store } = deps(rows);
    const result = await moveStagedSnapshots(d, "r1");
    expect(result).toEqual({ moved: 2, failed: [], alert: [] });
    expect(store.get("o1/r1/s1.json")).toBe('{"a": 1}');
    expect(calls.filter((c) => c.startsWith("complete"))).toHaveLength(2);
  });

  it("refuses a staged payload that no longer matches its hash", async () => {
    const rows = [await row("s1", '{"a": 1}', { payload: '{"a": 2}' })];
    const { d, calls, store } = deps(rows);
    const result = await moveStagedSnapshots(d, null);
    expect(result.moved).toBe(0);
    expect(result.failed[0]?.error).toMatch(/doesn't match/);
    expect(store.size).toBe(0);
    expect(calls).toContain("fail s1");
  });

  it("accepts an identical object left by an earlier attempt, refuses a different one", async () => {
    const same = await row("s1", '{"a": 1}');
    const other = await row("s2", '{"b": 2}');
    const store = new Map([
      [same.storage_path, '{"a": 1}'],
      [other.storage_path, '{"b": 3}'],
    ]);
    const { d } = deps([same, other], store);
    const result = await moveStagedSnapshots(d, null);
    expect(result.moved).toBe(1);
    expect(result.failed.map((f) => f.snapshot_id)).toEqual(["s2"]);
  });

  it("flags a snapshot for ops when it reaches the alert count, once", async () => {
    const rows = [
      await row("s1", "{}", { payload: "x", attempts: OVERFLOW_ALERT_AT - 1 }),
      await row("s2", "{}", { payload: "x", attempts: OVERFLOW_ALERT_AT }),
    ];
    const { d } = deps(rows);
    const result = await moveStagedSnapshots(d, null);
    expect(result.alert).toEqual(["s1"]);
  });
});
