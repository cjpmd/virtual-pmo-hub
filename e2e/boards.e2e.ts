// Boards (governance forums): list, forum details, meeting details, role controls and one
// write that is reverted. The test user holds the organisation PMO role: PMO rights in every
// workspace, but not organisation admin (canManageForum in src/services/forums.ts).
import { expect, expectNoErrorBoundary, settle, setTheme, test } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

const BOARDS = "/governance/forum";
const TEST_BOARD = "E2E Test Board (automated)";

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

  test("forum details", async ({ page }) => {
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
  });

  // Meetings can't be deleted, only cancelled (src/services/forums.ts:10-11), so this test
  // reuses one meeting on the test board instead of creating and removing one each run. It
  // creates the meeting only when the board has none, and never edits or cancels it, so there
  // is only ever one test meeting.
  test("meeting details on the test board", async ({ page }, testInfo) => {
    await openBoards(page);
    await page.getByRole("link", { name: TEST_BOARD, exact: true }).click();
    await settle(page);
    await expect(
      page.getByRole("heading", { name: TEST_BOARD, level: 2, exact: true }),
    ).toBeVisible();

    const meetings = page.locator(`main a[href*="meeting="]`);
    if ((await meetings.count()) === 0) {
      // Only desktop creates it; with parallel workers the mobile run could add a second one.
      test.skip(testInfo.project.name !== "desktop", "The desktop run creates the test meeting");
      const date = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
      await page.getByRole("button", { name: "Add meeting" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Meeting date").fill(date);
      await dialog.getByRole("button", { name: "Save meeting" }).click();
      await expect(dialog).toBeHidden();
      await expect(meetings).toHaveCount(1);
    }

    const meeting = meetings.first();
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
