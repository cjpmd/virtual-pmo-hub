// GL-22 collection management: create a funding collection, edit its pot, add and remove
// projects, set an award, link from the project page, archive / restore, and delete with a typed
// confirmation. The "archive instead" offer is driven by replacing the reports list with one
// published pack for the new collection (no real report is created).
//
// Writes run at desktop width only and need the test user to be PMO or admin in a workspace
// (otherwise the spec skips). Every collection it creates is named "E2E …"; afterAll deletes any
// that are left. Run against a Supabase branch or the local stack, never production (build plan,
// Phase 6).
import { expect, settle, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { rest } from "./rest";

const PREFIX = "E2E collection";

async function cleanUp() {
  const left = await rest<Array<{ id: string; archived_at: string | null }>>(
    `collections?select=id,archived_at&name=like.${encodeURIComponent(PREFIX)}*`,
  );
  for (const row of left) {
    // An archived collection must be restored before its links can change; delete works either way.
    await rest(`collections?id=eq.${row.id}`, { method: "DELETE" });
  }
}

/** Opens Collections and creates a funding collection; returns its id (from the URL). */
async function createFunding(page: Page, name: string, pot: string) {
  await page.goto("/portfolio/collections");
  await settle(page);
  const create = page.getByRole("button", { name: "New collection" });
  test.skip((await create.count()) === 0, "The test user isn't PMO or admin in a workspace");
  await create.click();
  const dialog = page.getByRole("dialog", { name: "New collection" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Type").selectOption({ label: "Funding stream" });
  const workspace = dialog.getByLabel("Workspace");
  if (await workspace.count()) await workspace.selectOption({ index: 1 });
  await dialog.getByLabel(/^Pot/).fill(pot);
  await dialog.getByRole("button", { name: "Create collection" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** A published pack scoped to the collection, added to the real reports list. */
async function pretendPublishedReport(page: Page, collectionId: string) {
  await page.route(
    (url) => url.pathname.endsWith("/rest/v1/reports") && url.search.includes("forums"),
    async (route) => {
      const response = await route.fetch();
      const rows = (await response.json()) as unknown[];
      const now = new Date().toISOString();
      rows.unshift({
        id: "00000000-0000-4000-8000-0000000022aa",
        organisation_id: null,
        workspace_id: null,
        title: `${PREFIX} published pack`,
        template_id: null,
        template_version: null,
        forum_id: null,
        meeting_id: null,
        scope_type: "collection",
        scope_entity_id: collectionId,
        scope_items: null,
        as_at: now.slice(0, 10),
        blocks: [],
        selection_rules: null,
        rating_scheme_id: null,
        overall_rating: null,
        overall_rating_rationale: null,
        status: "published",
        previous_report_id: null,
        submitted_at: now,
        approved_at: now,
        published_at: now,
        created_at: now,
        created_by: null,
        updated_at: now,
        forums: null,
        meetings: null,
        report_templates: null,
      });
      await route.fulfill({ response, json: rows });
    },
  );
}

test.describe("Collection management", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Writes run at desktop width only");
  });
  test.afterAll(cleanUp);

  test("create, edit, add and remove projects, set an award, link from a project, delete", async ({
    page,
  }) => {
    const name = `${PREFIX} ${Date.now()}`;
    await createFunding(page, name, "500000");

    // Edit the pot.
    await page.getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit collection" });
    await expect(edit.getByLabel(/^Pot/)).toHaveValue("500000");
    await edit.getByLabel(/^Pot/).fill("£750,000");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Collection saved")).toBeVisible();

    // Add the first project the picker offers, then give it an award.
    await page.getByRole("button", { name: "Manage projects" }).click();
    const manage = page.getByRole("dialog", { name: `Projects in ${name}` });
    const first = manage.getByTestId("collection-picker").getByRole("checkbox").first();
    const label = (await first.getAttribute("aria-label"))!;
    const projectName = label.replace(/^Add /, "");
    await first.check();
    await manage.getByRole("button", { name: "Add project" }).click();
    await expect(page.getByText("Project added")).toBeVisible();
    const members = manage.getByTestId("collection-members");
    await expect(members.getByText(projectName)).toBeVisible();
    // Search narrows the picker and no longer offers the member.
    await manage.getByLabel("Search projects").fill(projectName);
    await expect(
      manage.getByTestId("collection-picker").getByRole("checkbox", { name: label }),
    ).toHaveCount(0);
    const award = members.getByLabel(`Award for ${projectName}`);
    await award.fill("125000");
    await award.press("Enter");
    await expect(page.getByText(`Award saved for ${projectName}`)).toBeVisible();
    await manage.getByRole("button", { name: "Done" }).click();

    // The funding table shows the award, and the project page lists the collection.
    await expect(page.getByRole("link", { name: projectName }).first()).toBeVisible();
    await page.getByRole("link", { name: projectName }).first().click();
    await settle(page);
    const chips = page.getByTestId("project-collections");
    await expect(chips.getByRole("link", { name })).toBeVisible();

    // Remove it from the project page.
    await chips.getByRole("button", { name: "Manage collections" }).click();
    await page.getByRole("checkbox", { name }).uncheck();
    await expect(page.getByText(`Removed from ${name}`)).toBeVisible();
    await expect(chips.getByRole("link", { name })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Delete with a typed confirmation.
    await page.goto("/portfolio/collections");
    await settle(page);
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete collection…" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete collection" });
    const remove = confirm.getByRole("button", { name: "Delete collection" });
    await expect(remove).toBeDisabled();
    await confirm.getByLabel("Type the collection's name to confirm").fill(name);
    await remove.click();
    await expect(page).toHaveURL(/\/portfolio\/collections$/);
    await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  });

  test("a collection with published reports is archived instead, then restored", async ({
    page,
  }) => {
    const name = `${PREFIX} ${Date.now()} archived`;
    const id = await createFunding(page, name, "");
    await pretendPublishedReport(page, id);
    await page.reload();
    await settle(page);
    await expect(page.getByTestId("collection-reports")).toContainText(`${PREFIX} published pack`);

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Delete collection…" }).click();
    const offer = page.getByRole("dialog", { name: "This collection can't be deleted" });
    await expect(offer).toContainText("1 published report is scoped");
    await offer.getByRole("button", { name: "Archive instead" }).click();
    await expect(page.getByTestId("collection-archived")).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage projects" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

    // Hidden from the list unless archived ones are shown.
    await page.goto("/portfolio/collections");
    await settle(page);
    await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
    await page.getByText(/Show archived/).click();
    await page.getByRole("link", { name: new RegExp(name) }).click();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Restore collection" }).click();
    await expect(page.getByText("Collection restored")).toBeVisible();
    await expect(page.getByTestId("collection-archived")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });
});
