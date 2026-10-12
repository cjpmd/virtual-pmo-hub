import { describe, expect, it, vi } from "vitest";

// Fresh module state per test (the store is module-level).
const load = async () => {
  vi.resetModules();
  return import("./health-pending");
};

describe("health pending", () => {
  it("clears once computed_at is later than the write's updated_at", async () => {
    const h = await load();
    h.noteComputedAt("2026-10-12 12:00:00+00");
    h.markHealthPending("2026-10-12 12:01:00+00");
    expect(h.getHealthPending()).not.toBeNull();
    expect(h.noteComputedAt("2026-10-12 12:00:30+00")).toBe(false);
    expect(h.getHealthPending()).not.toBeNull();
    expect(h.noteComputedAt("2026-10-12 12:01:03+00")).toBe(true);
    expect(h.getHealthPending()).toBeNull();
  });

  it("without a server time, waits for a newer computed_at than last seen", async () => {
    const h = await load();
    h.noteComputedAt("2026-10-12 12:00:00+00");
    h.markHealthPending(null);
    expect(h.noteComputedAt("2026-10-12 12:00:00+00")).toBe(false);
    expect(h.noteComputedAt("2026-10-12 12:00:06+00")).toBe(true);
  });

  it("gives up after the timeout", async () => {
    const h = await load();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
    h.markHealthPending("2026-10-12 12:00:00+00");
    vi.setSystemTime(new Date(Date.now() + h.HEALTH_PENDING_TIMEOUT_MS + 1));
    expect(h.noteComputedAt(null)).toBe(true);
    vi.useRealTimers();
  });

  it("only tables that feed health mark it", async () => {
    const h = await load();
    expect(h.HEALTH_TABLES.has("milestones")).toBe(true);
    expect(h.HEALTH_TABLES.has("lessons")).toBe(false);
  });
});
