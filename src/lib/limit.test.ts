import { describe, expect, it } from "vitest";
import { createLimiter } from "./limit";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createLimiter", () => {
  it("runs at most `max` tasks at once, in order, and returns their results", async () => {
    const limit = createLimiter(2);
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        limit(async () => {
          started.push(n);
          running += 1;
          peak = Math.max(peak, running);
          await tick();
          running -= 1;
          return n * 10;
        }),
      ),
    );
    expect(peak).toBe(2);
    expect(started).toEqual([1, 2, 3, 4, 5]);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("frees the slot when a task fails", async () => {
    const limit = createLimiter(1);
    await expect(limit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(limit(async () => "ok")).resolves.toBe("ok");
  });
});
