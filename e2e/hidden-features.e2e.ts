// GL-3: features that aren't live stay hidden from customers (Planner sync behind
// VITE_PLANNER_SYNC, sprint delivery behind VITE_SPRINT_DELIVERY, the email / Teams / digest
// notification settings until GL-13; Teams until Planner sync; Planner as a task source). Runs
// with the flags at their defaults (off).
import type { Route } from "@playwright/test";
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

test("New project offers no Planner task source", async ({ page }) => {
  await page.goto("/portfolio/projects");
  await settle(page);
  const create = page.getByRole("button", { name: "New project" });
  test.skip(!(await create.isEnabled().catch(() => false)), "The test user can't create projects");
  await create.click();
  await page.getByPlaceholder("e.g. Research data platform").fill("E2E Planner check");
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("planner-coming-later")).toBeVisible();
  await expect(page.getByText("Microsoft Planner", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Premium" })).toHaveCount(0);
  await page.keyboard.press("Escape"); // nothing is created
});

test("a Planner project's tasks read as native", async ({ page }) => {
  // Make every project read as Planner Premium (production can't be changed for a test).
  const asPlanner = async (route: Route) => {
    const response = await route.fetch();
    const body = (await response.json()) as unknown;
    const patch = (row: Record<string, unknown>) =>
      "task_source" in row ? { ...row, task_source: "planner_premium" } : row;
    await route.fulfill({
      response,
      json: Array.isArray(body)
        ? body.map((row) => patch(row as Record<string, unknown>))
        : body && typeof body === "object"
          ? patch(body as Record<string, unknown>)
          : body,
    });
  };
  await page.route((url) => url.pathname.endsWith("/rest/v1/v_projects"), asPlanner);
  await page.goto("/portfolio/projects");
  await settle(page);
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const href = hrefs.find((path) => /^\/portfolio\/projects\/[^/?#]+$/.test(path));
  expect(href, "a project link on /portfolio/projects").toBeTruthy();
  await page.goto(`${href}?tab=plan&sub=tasks`);
  await settle(page);
  await expect(page.getByText("Planner sync not connected", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open in Planner" })).toHaveCount(0);
  await expect(page.getByText("Some fields calculated by Planner")).toHaveCount(0);
  await expect(page.getByText("Planner Premium")).toHaveCount(0);
  await expectNoErrorBoundary(page);
});
