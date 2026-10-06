import { describe, expect, it } from "vitest";
import { todayIso } from "./today";

describe("todayIso", () => {
  it("uses the organisation's time zone, not UTC", () => {
    // 23:30 UTC on 5 October is already 6 October in London (BST, UTC+1).
    expect(todayIso("Europe/London", new Date("2026-10-05T23:30:00Z"))).toBe("2026-10-06");
    expect(todayIso("UTC", new Date("2026-10-05T23:30:00Z"))).toBe("2026-10-05");
  });
});
