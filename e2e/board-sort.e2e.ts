// GL-12 (build plan 1.7): a board sorted by a date column is in calendar order, not by day of the
// month, with blanks last in both directions. Read-only, so it runs at both widths.
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";
import type { Page } from "@playwright/test";

/** The Forecast column's dates (YYYY-MM-DD, null for blank) in table order. */
async function forecastColumn(page: Page) {
  const headers = await page.locator("main table thead th").allTextContents();
  const dateColumn = headers.findIndex((text) => text.trim().startsWith("Forecast"));
  expect(dateColumn, `columns: ${headers.join(" | ")}`).toBeGreaterThan(-1);
  const rows = page.locator("main table tbody tr");
  const values: (string | null)[] = [];
  for (let index = 0; index < Math.min(await rows.count(), 40); index++) {
    const cells = rows.nth(index).locator("td");
    // Group headers span the table in one cell.
    if ((await cells.count()) <= dateColumn) continue;
    const text = await cells
      .nth(dateColumn)
      .evaluate((cell) =>
        [cell.textContent, ...[...cell.querySelectorAll("input")].map((input) => input.value)].join(
          " ",
        ),
      );
    const display = /(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
    const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
    values.push(display ? `${display[3]}-${display[2]}-${display[1]}` : iso ? iso[0] : null);
  }
  return values;
}

function expectOrdered(values: (string | null)[], direction: "asc" | "desc") {
  const dates = values.filter((value): value is string => value !== null);
  const firstBlank = values.indexOf(null);
  if (firstBlank >= 0) expect(values.slice(firstBlank).every((value) => value === null)).toBe(true);
  const sorted = [...dates].sort();
  expect(dates).toEqual(direction === "asc" ? sorted : sorted.reverse());
}

test("a board sorted by a date column is in date order", async ({ page }) => {
  await page.goto("/delivery/milestones");
  await settle(page);
  await page.getByLabel("Group").selectOption("");
  await page.getByLabel("Sort").selectOption("finish");
  const ascending = await forecastColumn(page);
  test.skip(
    new Set(ascending.filter(Boolean).map((iso) => iso!.slice(0, 7))).size < 2,
    "Needs milestones in at least two months",
  );
  expectOrdered(ascending, "asc");

  await page.getByTestId("board-sort-direction").click();
  expectOrdered(await forecastColumn(page), "desc");
  await expectNoErrorBoundary(page);
});
