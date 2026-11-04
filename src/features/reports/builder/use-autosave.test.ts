// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./use-autosave";

describe("useAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("never starts a second save while one is in flight (RB-49)", async () => {
    let finish: () => void = () => {};
    const save = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result, rerender } = renderHook(({ value }) => useAutosave(value, save), {
      initialProps: { value: "a" },
    });
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saving");
    // The save is slower than the debounce: no second save meanwhile.
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(result.current.status).toBe("saved");
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves a change made during a save once that save has finished", async () => {
    let finish: () => void = () => {};
    const save = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { rerender } = renderHook(({ value }) => useAutosave(value, save), {
      initialProps: { value: "a" },
    });
    rerender({ value: "b" });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    rerender({ value: "c" });
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("c");
  });
});
