// Plan tab actions: Issue task sits in the Plan › Tasks toolbar (the header hides its copy there),
// and the project and programme Dependencies tabs open the dependency editor with this work as
// the receiving side. Nothing is saved, so it runs at both widths. The test user is organisation
// PMO, so the create buttons show.
import { expect, settle, test } from "./fixtures";
import type { Page } from "@playwright/test";

/** Follows the first detail link on a list page and returns its path. */
async function openFirst(page: Page, list: string, link: RegExp) {
  await page.goto(list);
  await settle(page);
  const href = (
    await page
      .locator("a[href]")
      .evaluateAll((links) => links.map((item) => item.getAttribute("href") ?? ""))
  ).find((path) => link.test(path));
  expect(href, `a link on ${list}`).toBeTruthy();
  await page.locator(`a[href="${href}"]`).filter({ visible: true }).first().click();
  await settle(page);
  return href!;
}

/** The New dependency editor opens with `name` as the receiving side, then closes unsaved. */
async function checkNewDependency(page: Page, name: string) {
  await page.getByRole("button", { name: "New dependency" }).click();
  const editor = page.getByRole("dialog", { name: "New dependency" });
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Receiving side").locator("option:checked")).toHaveText(name);
  await editor.getByRole("button", { name: "Close editor" }).click();
  await expect(editor).toHaveCount(0);
}

test.describe("Plan actions", () => {
  test("Issue task moves into the Plan › Tasks toolbar", async ({ page }) => {
    const href = await openFirst(page, "/portfolio/projects", /^\/portfolio\/projects\/[^/?#]+$/);
    const issueTask = page.getByRole("button", { name: "Issue task" });
    await expect(issueTask).toHaveCount(1);

    await page.goto(`${href}?tab=plan&sub=tasks`);
    await settle(page);
    await expect(page.getByText(/All changes saved|Saved · Planner/)).toBeVisible();
    await expect(issueTask).toHaveCount(1);
    await issueTask.click();
    await expect(page.getByRole("dialog", { name: "Issue task" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("project Dependencies tab adds a dependency", async ({ page }) => {
    const href = await openFirst(page, "/portfolio/projects", /^\/portfolio\/projects\/[^/?#]+$/);
    const name = (await page.locator("h1").first().textContent())!.trim();
    await page.goto(`${href}?tab=plan&sub=dependencies`);
    await settle(page);
    await checkNewDependency(page, name);
  });

  test("programme Dependencies tab adds a dependency", async ({ page }) => {
    await openFirst(page, "/portfolio/programmes", /^\/portfolio\/programmes\/[^/?#]+$/);
    const name = (await page.locator("h1").first().textContent())!.trim();
    await page.getByRole("button", { name: "Dependencies", exact: true }).click();
    await checkNewDependency(page, name);
  });
});
