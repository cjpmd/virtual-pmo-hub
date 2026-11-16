// GL-14 Phase B: Funding packs are retired. The old route redirects to Reports (keeping a
// collection filter), "Funding packs" is gone from navigation, and a governance collection
// starts a collection-scoped report instead of generating a pack. Nothing is written.
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";

test("/governance/committee-packs redirects to Reports", async ({ page }) => {
  await page.goto("/governance/committee-packs");
  await expect(page).toHaveURL(/\/governance\/reports\/?(\?.*)?$/);
  await settle(page);
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  await expectNoErrorBoundary(page);
});

test("the redirect keeps a collection filter", async ({ page }) => {
  await page.goto("/governance/committee-packs?collection=00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/governance\/reports\/?\?collection=0{8}-/);
  await expectNoErrorBoundary(page);
});

test("navigation has no Funding packs entry", async ({ page }) => {
  await page.goto("/governance/reports");
  await settle(page);
  await expect(page.getByRole("link", { name: "Funding packs" })).toHaveCount(0);
  await expect(page.locator('a[href="/governance/committee-packs"]')).toHaveCount(0);
});

test("Settings › Templates has pack branding and no Funding pack template", async ({ page }) => {
  await page.goto("/settings/templates");
  await settle(page);
  await expect(page.getByText("Board and committee packs")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show logo" })).toBeVisible();
  await expect(page.getByText("Funding pack template")).toHaveCount(0);
  await expectNoErrorBoundary(page);
});

test("a governance collection starts a collection report", async ({ page }) => {
  await page.goto("/portfolio/collections");
  await settle(page);
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const collections = [
    ...new Set(hrefs.filter((path) => /^\/portfolio\/collections\/[^/?#]+$/.test(path))),
  ];
  let found = false;
  for (const href of collections) {
    await page.goto(href);
    await settle(page);
    const start = page.getByRole("link", { name: "New report for this collection" });
    if ((await start.count()) === 0) continue;
    found = true;
    await expect(page.getByRole("button", { name: "Generate funding pack" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Reports for this collection" })).toBeVisible();
    await start.click();
    const dialog = page.getByRole("dialog", { name: "New report" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/^Scope/)).toHaveValue("collection");
    await expect(dialog.getByLabel("Scope item")).toHaveValue(href.split("/").pop()!);
    await expectNoErrorBoundary(page);
    break;
  }
  test.skip(!found, "No governance collection the user can start a report for");
});
