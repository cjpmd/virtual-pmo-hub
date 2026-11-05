import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBatcher, type BatchOutcome } from "./batch";

describe("createBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = (maxSize = 60) => {
    const run = vi.fn(
      async (_group: string, items: number[]): Promise<Array<BatchOutcome<number>>> =>
        items.map((n) =>
          n < 0 ? { ok: false, error: new Error(`bad ${n}`) } : { ok: true, value: n * 10 },
        ),
    );
    return {
      run,
      load: createBatcher<string, number, number>({ groupKey: (g) => g, run, maxSize }),
    };
  };

  it("sends calls made in the same window as one request per group", async () => {
    const { run, load } = make();
    const a = load("r1", 1);
    const b = load("r1", 2);
    const c = load("r2", 3);
    await vi.advanceTimersByTimeAsync(10);
    await expect(Promise.all([a, b, c])).resolves.toEqual([10, 20, 30]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith("r1", [1, 2]);
    expect(run).toHaveBeenCalledWith("r2", [3]);
  });

  it("rejects only the item that failed", async () => {
    const { load } = make();
    const ok = load("r", 1);
    const bad = expect(load("r", -1)).rejects.toThrow("bad -1");
    await vi.advanceTimersByTimeAsync(10);
    await expect(ok).resolves.toBe(10);
    await bad;
  });

  it("rejects every item when the request fails", async () => {
    const run = vi.fn(async () => {
      throw new Error("timeout");
    });
    const load = createBatcher<string, number, number>({ groupKey: (g) => g, run });
    const a = load("r", 1);
    const b = load("r", 2);
    const settled = Promise.allSettled([a, b]);
    await vi.advanceTimersByTimeAsync(10);
    expect((await settled).map((s) => s.status)).toEqual(["rejected", "rejected"]);
  });

  it("splits a large group and starts a new batch after a flush", async () => {
    const { run, load } = make(2);
    const first = [1, 2, 3].map((n) => load("r", n));
    await vi.advanceTimersByTimeAsync(10);
    await expect(Promise.all(first)).resolves.toEqual([10, 20, 30]);
    expect(run.mock.calls.map((c) => c[1])).toEqual([[1, 2], [3]]);
    const later = load("r", 4);
    await vi.advanceTimersByTimeAsync(10);
    await expect(later).resolves.toBe(40);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
