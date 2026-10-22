// Board Calendar view (work package 1.4): opens on the current month, moves between months,
// and shows items on their dates. Read-only, so it runs at both widths. Also checks that board
// automations stay hidden (D4) until work package 4.3.
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Today's year and month in the organisation's time zone (Europe/London). */
function currentMonth() {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return { year: year!, month: month! };
}
const label = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;
const shift = (year: number, month: number, delta: number) => {
  const index = year * 12 + month - 1 + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

async function openMilestones(page: Page) {
  await page.goto("/delivery/milestones");
  await settle(page);
}
const heading = (calendar: Locator) => calendar.locator("h3");

test.describe("Board calendar", () => {
  test("opens on this month and moves between months", async ({ page }) => {
    await openMilestones(page);
    await expect(page.getByRole("button", { name: "Automations" })).toHaveCount(0);
    await page.getByRole("button", { name: "calendar", exact: true }).click();
    const grid = page.getByRole("grid");
    const now = currentMonth();
    await expect(grid).toHaveAttribute("aria-label", label(now.year, now.month));

    // Whole weeks, and the first cell falls on the first weekday heading.
    const cells = grid.getByRole("gridcell");
    expect((await cells.count()) % 7).toBe(0);
    const firstHeader = await grid.getByRole("columnheader").first().textContent();
    const firstDate = (await cells.first().getAttribute("data-date"))!;
    expect(WEEKDAYS[new Date(`${firstDate}T12:00:00Z`).getUTCDay()]).toBe(firstHeader);

    const next = shift(now.year, now.month, 1);
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(grid).toHaveAttribute("aria-label", label(next.year, next.month));
    await expect(cells.filter({ hasText: /^1\b/ }).first()).toHaveAttribute("data-date", /-01$/);

    const previous = shift(now.year, now.month, -1);
    await page.getByRole("button", { name: "Previous month" }).click();
    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(grid).toHaveAttribute("aria-label", label(previous.year, previous.month));

    await page.getByRole("button", { name: "Today" }).click();
    await expect(grid).toHaveAttribute("aria-label", label(now.year, now.month));
    await expectNoErrorBoundary(page);
  });

  test("shows an item on its date", async ({ page }) => {
    await openMilestones(page);
    // A flat table: no grouping, sorted by forecast (the seeded view's sort).
    await page.getByLabel("Group").selectOption("");
    const headers = await page.locator("main table thead th").allTextContents();
    const titleColumn = headers.findIndex((text) => text.trim().startsWith("Milestone"));
    const dateColumn = headers.findIndex((text) => text.trim().startsWith("Forecast"));
    expect(titleColumn, `columns: ${headers.join(" | ")}`).toBeGreaterThan(-1);
    expect(dateColumn).toBeGreaterThan(-1);

    // The first row with a forecast date.
    let item: { title: string; iso: string } | null = null;
    const rows = page.locator("main table tbody tr");
    for (let index = 0; index < Math.min(await rows.count(), 20) && !item; index++) {
      const cells = rows.nth(index).locator("td");
      // Group headers span the table in one cell.
      if ((await cells.count()) <= Math.max(titleColumn, dateColumn)) continue;
      // Editable date cells hold the date in an input; read-only ones as text.
      const dateText = await cells
        .nth(dateColumn)
        .evaluate((cell) =>
          [
            cell.textContent,
            ...[...cell.querySelectorAll("input")].map((input) => input.value),
          ].join(" "),
        );
      const date = /(\d{2})\/(\d{2})\/(\d{4})/.exec(dateText);
      const title = (await cells.nth(titleColumn).locator("button").first().textContent())?.trim();
      if (date && title) item = { title, iso: `${date[3]}-${date[2]}-${date[1]}` };
    }
    test.skip(!item, "No milestone with a forecast date in the default view");

    await page.getByRole("button", { name: "calendar", exact: true }).click();
    const now = currentMonth();
    const year = Number(item!.iso.slice(0, 4));
    const month = Number(item!.iso.slice(5, 7));
    const steps = year * 12 + month - (now.year * 12 + now.month);
    const button = page.getByRole("button", { name: steps > 0 ? "Next month" : "Previous month" });
    for (let step = 0; step < Math.abs(steps); step++) await button.click();
    await expect(page.getByRole("grid")).toHaveAttribute("aria-label", label(year, month));

    // On its date: listed in the day, or counted in "+N more" when the day is full.
    const day = page.locator(`[data-date="${item!.iso}"]`);
    const listed = day.getByRole("button", { name: item!.title, exact: false });
    const more = day.locator("p[title]");
    if ((await listed.count()) === 0)
      await expect(more).toHaveAttribute(
        "title",
        new RegExp(item!.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    else await expect(listed.first()).toBeVisible();
    await expect(day).toHaveAttribute("aria-label", /[1-9]\d* items?$/);
  });
});
