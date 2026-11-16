// GL-3: features that aren't live stay hidden from customers (Planner sync behind
// VITE_PLANNER_SYNC, sprint delivery behind VITE_SPRINT_DELIVERY, the email / Teams / digest
// notification settings until GL-13; Teams until Planner sync). Runs with the flags at their
// defaults (off).
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";

test("/connect-microsoft redirects to Settings", async ({ page }) => {
  await page.goto("/connect-microsoft");
  await expect(page).toHaveURL(/\/settings(\/[^/?#]*)?$/);
  await expectNoErrorBoundary(page);
});

test("Settings › Integrations says Planner sync is coming later", async ({ page }) => {
  await page.goto("/settings/integrations");
  await settle(page);
  await expect(page.getByText("Planner sync is coming later.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect Microsoft 365" })).toHaveCount(0);
  await expectNoErrorBoundary(page);
});

test("Settings › Notifications offers In-app and Email, not Teams", async ({ page }) => {
  // GL-13 brought back Email and the digest; Teams waits for Planner sync.
  await page.goto("/settings/notifications");
  await settle(page);
  await expect(page.getByRole("switch", { name: "In-app", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Email", exact: true })).toBeVisible();
  await expect(page.getByLabel("Default email digest")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Microsoft Teams", exact: true })).toHaveCount(0);
  // Only events the database raises are offered.
  await expect(page.getByRole("switch", { name: "Gate criteria failing" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Task overdue" })).toBeVisible();
  await expectNoErrorBoundary(page);
});

test("a project has no Delivery tab, and ?tab=delivery opens Overview", async ({ page }) => {
  await page.goto("/portfolio/projects");
  await settle(page);
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const href = hrefs.find((path) => /^\/portfolio\/projects\/[^/?#]+$/.test(path));
  expect(href, "a project link on /portfolio/projects").toBeTruthy();
  await page.goto(`${href}?tab=delivery`);
  await settle(page);
  const tabs = page.getByRole("tablist", { name: "Project sections" });
  await expect(tabs.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(tabs.getByRole("tab", { name: "Delivery" })).toHaveCount(0);
  await expect(page.getByText("No sprint data yet.")).toHaveCount(0);
  await expectNoErrorBoundary(page);
});
