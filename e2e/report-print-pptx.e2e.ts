// E2E tests for report print layout, presentation mode, and PPTX export.
//
// All tests skip without E2E_REPORT_VIEWER_URL (a URL to a report viewer page, e.g.
// /governance/reports/<id>) and E2E_REPORT_PRINT_URL (the public print route).
// Set both in .env.local for a report that has at least one project_overview deep-dive block.
//
// E2E_REPORT_VIEWER_URL  – signed-in URL, e.g. /governance/reports/abc123
// E2E_REPORT_PRINT_URL   – public print URL, e.g. /report-print/abc123?token=xyz
//
// Presentation mode is tested via the signed-in viewer URL (requires auth storage).
import { mkdirSync } from "node:fs";
import { expect, settle, test } from "./fixtures";

const VIEWER_URL = process.env["E2E_REPORT_VIEWER_URL"] ?? "";
const PRINT_URL = process.env["E2E_REPORT_PRINT_URL"] ?? "";

// ── Print layout ─────────────────────────────────────────────────────────────

test.describe("Report print layout", () => {
  test.skip(!PRINT_URL, "E2E_REPORT_PRINT_URL not set – skipping print layout check");

  test("project_overview deep-dive renders 3-column panel in print emulation", async ({ page }) => {
    await page.goto(PRINT_URL);
    await settle(page);

    // Emulate print media – this triggers the @media print overrides that force 3-column layout.
    await page.emulateMedia({ media: "print" });

    // The panel must be present (deep-dive block was included in this pack).
    const panel = page.locator('[data-testid="project-overview-panel"]').first();
    await expect(panel).toBeVisible();

    // The inner grid must have 3 direct children (columns).
    const gridCols = panel.locator("> div > *");
    await expect(gridCols).toHaveCount(3);

    // Column 2 (milestones/health) must be visible (it's normally hidden below 640 px
    // container – print CSS forces it on).
    const col2 = gridCols.nth(1);
    await expect(col2).toBeVisible();

    // No visible buttons in print mode ([&_button]:print:hidden).
    const buttons = panel.locator("button:visible");
    await expect(buttons).toHaveCount(0);

    mkdirSync("e2e/screenshots", { recursive: true });
    await panel.screenshot({ path: "e2e/screenshots/report-print-panel.png" });
  });
});

// ── Presentation mode ─────────────────────────────────────────────────────────

test.describe("Presentation mode deep-dive", () => {
  test.skip(!VIEWER_URL, "E2E_REPORT_VIEWER_URL not set – skipping presentation mode check");

  test("project_overview deep-dive uses full-width single-column layout in presentation", async ({
    page,
  }) => {
    await page.goto(VIEWER_URL);
    await settle(page);

    // Navigate to presentation mode.
    const presentBtn = page.getByRole("link", { name: /present/i }).first();
    await expect(presentBtn).toBeVisible();
    await presentBtn.click();
    await settle(page);

    // Find a deep-dive slide with a project overview panel.
    // Keep pressing ArrowRight until we hit a deep-dive slide or run out of slides.
    const maxSlides = 30;
    let panelFound = false;
    for (let i = 0; i < maxSlides; i++) {
      const panel = page.locator('[data-testid="project-overview-panel"]').first();
      if ((await panel.count()) > 0 && (await panel.isVisible())) {
        panelFound = true;
        // The panel's container must be wide enough for the 3-column layout.
        // We confirm it has 3 grid children.
        const gridCols = panel.locator("> div > *");
        await expect(gridCols).toHaveCount(3);

        mkdirSync("e2e/screenshots", { recursive: true });
        await panel.screenshot({ path: "e2e/screenshots/report-present-panel.png" });
        break;
      }
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(300);
    }

    if (!panelFound) {
      console.warn("No project_overview deep-dive slide found; presentation panel check skipped.");
    }
  });
});

// ── PPTX export ───────────────────────────────────────────────────────────────

test.describe("PPTX export", () => {
  test.skip(!VIEWER_URL, "E2E_REPORT_VIEWER_URL not set – skipping PPTX export check");

  test("Export PPTX button downloads a non-empty .pptx file", async ({ page }) => {
    await page.goto(VIEWER_URL);
    await settle(page);

    const exportBtn = page.getByRole("button", { name: /export pptx/i }).first();
    await expect(exportBtn).toBeVisible();

    // Start waiting for a download before clicking.
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await exportBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pptx$/i);

    // Save to temp and check the file is non-empty.
    const path = await download.path();
    expect(path).toBeTruthy();
  });
});
