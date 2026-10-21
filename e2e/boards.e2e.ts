// Boards (governance forums): list, forum details, meeting details, role controls and one
// write that is reverted. The test user holds the organisation PMO role: PMO rights in every
// workspace, but not organisation admin (canManageForum in src/services/forums.ts).
import { expect, expectNoErrorBoundary, settle, setTheme, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const BOARDS = "/governance/forum";

/** The forum rows in a list section ("Organisation" or a workspace name). */
const forumSections = (page: Page) =>
  page.locator("main section").filter({ has: page.locator("h2") });
const forumLinks = (scope: Locator) => scope.locator(`a[href*="forum="]:not([href*="meeting="])`);

async function openBoards(page: Page) {
  await page.goto(BOARDS);
  await settle(page);
  await expect(page.getByRole("heading", { name: "Boards", level: 1 })).toBeVisible();
}

test.describe("Boards", () => {
  test("list renders in light and dark", async ({ page }) => {
    await openBoards(page);
    await expect(forumLinks(page.locator("main")).first()).toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      await setTheme(page, theme);
      await expectNoErrorBoundary(page);
    }
  });

  test("forum details and meeting details", async ({ page }) => {
    await openBoards(page);
    const forum = forumLinks(page.locator("main")).first();
    const name = (await forum.textContent())!.trim();
    await forum.click();
    await settle(page);
    await expect(page).toHaveURL(/forum=/);
    await expect(page.getByRole("heading", { name, level: 2, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Upcoming meetings" })).toBeVisible();
    await expectNoErrorBoundary(page);

    // Meeting details: the first meeting of any forum that has one. Back to the list in the
    // app rather than reloading it, so its data comes from the query cache.
    await page.goBack();
    await settle(page);
    const meeting = page.locator(`main a[href*="meeting="]`).first();
    test.skip((await meeting.count()) === 0, "No forum in the demo data has a meeting");
    await meeting.click();
    await settle(page);
    await expect(page).toHaveURL(/meeting=/);
    await expect(
      page.getByRole("heading", { name: "Decisions targeted at this meeting" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Agenda" })).toBeVisible();
    await expectNoErrorBoundary(page);
  });

  test("role controls follow the PMO role", async ({ page }) => {
    await openBoards(page);
    await expect(page.getByRole("button", { name: "Add forum" })).toBeVisible();
    const sectionsList = forumSections(page);
    const count = await sectionsList.count();
    let workspaceForums = 0;
    for (let index = 0; index < count; index++) {
      const section = sectionsList.nth(index);
      const heading = (await section.locator("h2").textContent())?.trim();
      const names = (await forumLinks(section).allTextContents()).map((text) => text.trim());
      for (const name of names) {
        const edit = section.getByRole("button", { name: `Edit ${name}`, exact: true });
        if (heading === "Organisation") await expect(edit).toHaveCount(0);
        else {
          await expect(edit).toBeVisible();
          workspaceForums++;
        }
      }
    }
    expect(workspaceForums, "at least one workspace forum the PMO role can edit").toBeGreaterThan(
      0,
    );
  });

  test("editing a forum saves, then is reverted", async ({ page }, testInfo) => {
    // One write per run: the mobile project would race the desktop one on the same record.
    test.skip(testInfo.project.name !== "desktop", "The write runs once, on desktop");
    await openBoards(page);
    const section = forumSections(page)
      .filter({ hasNot: page.getByRole("heading", { name: "Organisation", exact: true }) })
      .first();
    await forumLinks(section).first().click();
    await settle(page);

    const days = page.getByText(/^Papers due \d+ days before$/);
    const original = Number((await days.textContent())!.match(/\d+/)![0]);
    const changed = original === 60 ? 59 : original + 1;
    const save = async (value: number) => {
      const dialog = page.getByRole("dialog");
      // A failed first save can leave its dialog open; close it before restoring.
      if (await dialog.isVisible()) await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Edit forum" }).click();
      await dialog.getByLabel("Papers deadline days").fill(String(value));
      await dialog.getByRole("button", { name: "Save forum" }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByText(`Papers due ${value} days before`, { exact: true }),
      ).toBeVisible();
    };
    try {
      await save(changed);
      await page.reload();
      await settle(page);
      await expect(
        page.getByText(`Papers due ${changed} days before`, { exact: true }),
      ).toBeVisible();
    } finally {
      await save(original);
    }
  });
});
