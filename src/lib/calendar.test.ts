import { describe, expect, it } from "vitest";
import { monthGrid, shiftMonth, toIsoDay, weekdayLabels } from "./calendar";

describe("toIsoDay", () => {
  it("reads the board's DD/MM/YYYY and ISO dates", () => {
    expect(toIsoDay("22/10/2026")).toBe("2026-10-22");
    expect(toIsoDay("1/2/2026")).toBe("2026-02-01");
    expect(toIsoDay("2026-10-22")).toBe("2026-10-22");
    expect(toIsoDay("2026-10-22T23:30:00+00:00")).toBe("2026-10-22");
  });

  it("rejects blanks, placeholders and dates that don't exist", () => {
    for (const value of [
      "",
      "—",
      "Not set",
      "31/02/2026",
      "29/02/2026",
      "2026-13-01",
      undefined,
      5,
    ])
      expect(toIsoDay(value)).toBeNull();
    expect(toIsoDay("29/02/2028")).toBe("2028-02-29");
  });
});

describe("shiftMonth", () => {
  it("crosses year boundaries", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 10, 0)).toEqual({ year: 2026, month: 10 });
    expect(shiftMonth(2026, 10, -22)).toEqual({ year: 2024, month: 12 });
  });
});

describe("monthGrid", () => {
  it("starts on Monday with the previous month's days filling the first week", () => {
    // 1 October 2026 is a Thursday.
    const grid = monthGrid(2026, 10, 1);
    expect(grid).toHaveLength(35);
    expect(grid.slice(0, 4).map((day) => [day.iso, day.inMonth])).toEqual([
      ["2026-09-28", false],
      ["2026-09-29", false],
      ["2026-09-30", false],
      ["2026-10-01", true],
    ]);
    expect(grid.at(-1)).toEqual({ iso: "2026-11-01", day: 1, inMonth: false });
    expect(grid.filter((day) => day.inMonth)).toHaveLength(31);
  });

  it("follows the week start setting (Sunday)", () => {
    const grid = monthGrid(2026, 10, 0);
    expect(grid[0]!.iso).toBe("2026-09-27");
    expect(grid[4]!.iso).toBe("2026-10-01");
  });

  it("has four, five or six weeks as the month needs", () => {
    // February 2027 starts on a Monday and has 28 days: exactly four weeks.
    expect(monthGrid(2027, 2, 1)).toHaveLength(28);
    expect(monthGrid(2027, 2, 1)[0]!.iso).toBe("2027-02-01");
    // February 2028 is a leap month starting on a Tuesday.
    const leap = monthGrid(2028, 2, 1);
    expect(leap).toHaveLength(35);
    expect(leap.filter((day) => day.inMonth).at(-1)!.iso).toBe("2028-02-29");
    // March 2026 starts on a Sunday: six weeks when the week starts on Monday.
    expect(monthGrid(2026, 3, 1)).toHaveLength(42);
    expect(monthGrid(2026, 3, 0)).toHaveLength(35);
  });

  it("puts every grid day on the right weekday", () => {
    for (const weekStart of [0, 1, 6]) {
      const grid = monthGrid(2026, 7, weekStart);
      grid.forEach((day, index) => {
        const weekday = new Date(`${day.iso}T12:00:00Z`).getUTCDay();
        expect(weekday).toBe((weekStart + index) % 7);
      });
    }
  });
});

describe("weekdayLabels", () => {
  it("rotates to the week start", () => {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    expect(weekdayLabels(1, names)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(weekdayLabels(0, names)[0]).toBe("Sun");
  });
});
