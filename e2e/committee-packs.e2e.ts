// Committee pack PDF export (work package 1.2). window.print is replaced so no print dialog
// opens: the stub fires beforeprint/afterprint like the browser does and records what the page
// looked like in between. Never issues a pack: issued packs can't be changed or deleted.
import { expect, expectNoErrorBoundary, settle, setTheme, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const PACKS = "/governance/committee-packs";

interface PrintState {
  calls: number;
  dark: boolean;
  title: string;
  pages: number;
}

async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    const state = { calls: 0, dark: false, title: "", pages: 0 };
    (window as unknown as { __print: typeof state }).__print = state;
    window.print = () => {
      window.dispatchEvent(new Event("beforeprint"));
      state.calls++;
      state.dark = document.documentElement.classList.contains("dark");
      state.title = document.title;
      state.pages = document.querySelectorAll(".pack-print-root .pack-print-page").length;
      window.dispatchEvent(new Event("afterprint"));
    };
  });
}
const printState = (page: Page) =>
  page.evaluate(() => (window as unknown as { __print: PrintState }).__print);

/** Exports the open pack and checks the print flow: light theme, every page, theme restored. */
async function exportOpenPack(page: Page, dialog: Locator) {
  const header = dialog.locator("header");
  const pageCount = Number(
    (await header.getByText(/· \d+ pages/).textContent())!.match(/(\d+) pages/)![1],
  );
  const before = (await printState(page)).calls;
  await dialog.getByRole("button", { name: "Export to PDF" }).click();
  const state = await printState(page);
  expect(state.calls).toBe(before + 1);
  expect(state.dark, "prints in the light theme").toBe(false);
  expect(state.title).toMatch(/pack – /);
  expect(state.pages).toBe(pageCount);
  // afterprint puts the dark theme back.
  await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);

  // In print media only the pack pages show, in the order they were built.
  await page.emulateMedia({ media: "print" });
  await expect(dialog).toBeHidden();
  await expect(page.locator(".pack-print-root")).toBeVisible();
  await expect(page.locator(".pack-print-page")).toHaveCount(pageCount);
  await expect(page.locator(".pack-print-page").first()).toBeVisible();
  await page.emulateMedia({ media: null });
  await expect(dialog).toBeVisible();
  await expectNoErrorBoundary(page);
}

test.describe("Committee packs", () => {
  test.beforeEach(async ({ page }) => {
    await stubPrint(page);
    await page.goto(PACKS);
    await settle(page);
    await expect(page.getByRole("heading", { name: "Committee packs", level: 1 })).toBeVisible();
    await setTheme(page, "dark");
  });

  test("a draft pack exports to PDF through the print flow", async ({ page }) => {
    const generate = page.getByRole("button", { name: "Generate pack" });
    test.skip((await generate.count()) === 0, "No governance collections in the demo organisation");
    await generate.first().click();
    const dialog = page.getByRole("dialog", { name: "Committee pack preview" });
    await expect(dialog.getByText(/Preview · \d+ pages/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Export to PowerPoint" })).toHaveCount(0);
    await settle(page);
    await exportOpenPack(page, dialog);
  });

  test("an issued pack exports from its stored snapshot", async ({ page }) => {
    const exports = page.locator("main").getByRole("button", { name: "Export to PDF" });
    test.skip((await exports.count()) === 0, "No issued packs in the demo organisation");
    await exports.first().click();
    const dialog = page.getByRole("dialog", { name: "Committee pack preview" });
    await expect(dialog.getByText(/Issued · read-only · \d+ pages/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Issue pack" })).toHaveCount(0);
    await settle(page);
    await exportOpenPack(page, dialog);
  });
});
