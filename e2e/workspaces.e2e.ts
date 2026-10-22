// Workspaces (work package 1.6): a second workspace, a user who belongs only to it, and
// Settings › Workspaces. Needs the two logins and the data in docs/sql/1-6-e2e-workspace.sql
// (E2E_ADMIN_* and E2E_MEMBER_* in .env.local); without them these tests skip.
//   * Isolation: the member sees Workspace B's records on every page and nothing of the demo
//     workspace, with no errors.
//   * Management (admin): create, rename, describe, add / change / remove a member, archive,
//     restore and delete a throwaway "E2E temp" workspace. Removed again in afterAll.
//   * Archived: with Workspace B archived the member still reads it, sees the "Archived
//     workspace" badge, is capped at viewer and can't write. Restored in afterAll.
// Writes run at desktop width only.
import { existsSync } from "node:fs";
import { sections, settingsSection } from "../src/lib/navigation";
import { ADMIN_STATE, MEMBER_STATE } from "./global-setup";
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";
import { rest } from "./rest";

const WORKSPACE_B = "E2E Workspace B";
const PROJECT_B = { name: "E2E Project B", code: "E2EB-001" };
const TEMP_PREFIX = "E2E temp";

const haveMember = existsSync(MEMBER_STATE);
const haveAdmin = existsSync(ADMIN_STATE);

const routes = [
  ...new Set(
    [...sections, settingsSection].flatMap((section) => [
      section.to,
      ...section.pages.map((page) => page.to),
    ]),
  ),
];

interface WorkspaceRow {
  id: string;
  name: string;
  archived_at: string | null;
}

async function workspaceB() {
  const rows = await rest<WorkspaceRow[]>(
    `workspaces?select=id,name,archived_at&name=eq.${encodeURIComponent(WORKSPACE_B)}`,
    {},
    "admin",
  );
  if (!rows[0]) throw new Error(`${WORKSPACE_B} not found: run docs/sql/1-6-e2e-workspace.sql`);
  return rows[0];
}

const setArchived = (id: string, archived: boolean) =>
  rest(
    `workspaces?id=eq.${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ archived_at: archived ? new Date().toISOString() : null }),
    },
    "admin",
  );

// Runs for everyone (no extra logins): the main test user is organisation PMO, not admin.
test("Settings › Workspaces lists the workspaces, read-only for PMO", async ({ page }) => {
  await page.goto("/settings/workspaces");
  await settle(page);
  await expect(page.getByTestId("workspace-row").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New workspace" })).toHaveCount(0);
  await expect(page.getByText("Only organisation admins can change these settings.")).toBeVisible();
  await expectNoErrorBoundary(page);
});

test.describe("A user in one workspace", () => {
  test.skip(
    !haveMember || !haveAdmin,
    "Needs E2E_MEMBER_* and E2E_ADMIN_* (see docs/sql/1-6-e2e-workspace.sql)",
  );
  test.use({ storageState: MEMBER_STATE });

  // Demo-workspace project names the member must never see.
  let hidden: string[] = [];
  test.beforeAll(async () => {
    const b = await workspaceB();
    if (b.archived_at) await setArchived(b.id, false); // a failed earlier run
    const projects = await rest<{ name: string; workspace_id: string }[]>(
      "v_projects?select=name,workspace_id",
    );
    hidden = projects
      .filter((project) => project.workspace_id !== b.id)
      .map((project) => project.name)
      .filter((name) => name.length > 12)
      .slice(0, 8);
    expect(hidden.length, "demo projects to compare with").toBeGreaterThan(0);
  });

  test("the database shows only Workspace B", async () => {
    const workspaces = await rest<WorkspaceRow[]>("workspaces?select=id,name", {}, "member");
    expect(workspaces.map((row) => row.name)).toEqual([WORKSPACE_B]);
    const projects = await rest<{ name: string }[]>("v_projects?select=name", {}, "member");
    expect(projects.map((row) => row.name)).toEqual([PROJECT_B.name]);
  });

  test("lists show Workspace B's project", async ({ page }) => {
    await page.goto("/portfolio/projects");
    await settle(page);
    await expect(page.getByText(PROJECT_B.name).first()).toBeVisible();
    await expectNoErrorBoundary(page);
  });

  for (const route of routes)
    test(`page ${route} shows nothing from the demo workspace`, async ({ page }) => {
      test.skip(test.info().project.name !== "desktop", "The sweep runs at desktop width");
      await page.goto(route);
      await settle(page);
      await expectNoErrorBoundary(page);
      const text = await page.locator("body").innerText();
      for (const name of hidden) expect(text, `${route} shows "${name}"`).not.toContain(name);
    });
});

test.describe("Settings › Workspaces", () => {
  test.skip(
    !haveMember || !haveAdmin,
    "Needs E2E_MEMBER_* and E2E_ADMIN_* (see docs/sql/1-6-e2e-workspace.sql)",
  );
  test.use({ storageState: ADMIN_STATE });

  test.afterAll(async () => {
    if (!haveAdmin) return;
    const temps = await rest<WorkspaceRow[]>(
      `workspaces?select=id,name,archived_at&name=like.${encodeURIComponent(`${TEMP_PREFIX}*`)}`,
      {},
      "admin",
    );
    for (const temp of temps) {
      if (temp.archived_at) await setArchived(temp.id, false);
      await rest(`workspace_members?workspace_id=eq.${temp.id}`, { method: "DELETE" }, "admin");
      await rest(`workspaces?id=eq.${temp.id}`, { method: "DELETE" }, "admin");
    }
  });

  test("create, rename, manage members, archive, restore and delete", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Writes run at desktop width only");
    const memberEmail = process.env["E2E_MEMBER_EMAIL"]!;
    const name = `${TEMP_PREFIX} ${Date.now()}`;
    const renamed = `${name} renamed`;
    await page.goto("/settings/workspaces");
    await settle(page);
    const row = (label: string) =>
      page.getByTestId("workspace-row").filter({ has: page.getByText(label, { exact: true }) });

    // Create
    await page.getByRole("button", { name: "New workspace" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Description").fill("Created by the e2e suite.");
    await dialog.getByRole("button", { name: "Create workspace" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row(name)).toBeVisible();

    // Rename and describe
    await row(name).getByRole("button", { name: "Edit" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(renamed);
    await dialog.getByLabel("Description").fill("Renamed by the e2e suite.");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(row(renamed)).toContainText("Renamed by the e2e suite.");

    // Members: add, change role, remove
    await page.getByLabel("Workspace", { exact: true }).selectOption({ label: renamed });
    const candidate = page.getByLabel("Organisation member to add");
    const value = await candidate
      .locator("option", { hasText: memberEmail })
      .first()
      .getAttribute("value");
    expect(value, `${memberEmail} in the member picker`).toBeTruthy();
    await candidate.selectOption(value!);
    await page.getByLabel("Role for the new member").selectOption("viewer");
    await page.getByRole("button", { name: "Add to workspace" }).click();
    const memberRow = page.locator("tr", { hasText: memberEmail });
    await expect(memberRow.getByRole("combobox")).toHaveValue("viewer");
    await memberRow.getByRole("combobox").selectOption("contributor");
    await expect
      .poll(async () => {
        const rows = await rest<{ role: string }[]>(
          `workspace_members?select=role&profile_id=eq.${value}&workspace_id=eq.${await idOf(renamed)}`,
          {},
          "admin",
        );
        return rows[0]?.role;
      })
      .toBe("contributor");
    await memberRow.getByRole("button", { name: /^Remove / }).click();
    await expect(memberRow).toHaveCount(0);

    // Archive and restore
    await row(renamed).getByRole("button", { name: "Archive" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Archive workspace" }).click();
    await expect(row(renamed)).toContainText("Archived");
    await row(renamed).getByRole("button", { name: "Restore" }).click();
    await expect(row(renamed).getByRole("button", { name: "Archive" })).toBeVisible();

    // Delete (empty, so allowed)
    await row(renamed).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete workspace" }).click();
    await expect(row(renamed)).toHaveCount(0);
  });

  // Through the API: the refusal is an HTTP error, which the page fixture counts as a failure.
  test("a workspace holding records can't be deleted", async () => {
    test.skip(test.info().project.name !== "desktop", "Writes run at desktop width only");
    const b = await workspaceB();
    await expect(rest(`workspaces?id=eq.${b.id}`, { method: "DELETE" }, "admin")).rejects.toThrow(
      /23503|foreign key/,
    );
    expect((await workspaceB()).id).toBe(b.id);
  });
});

async function idOf(name: string) {
  const rows = await rest<WorkspaceRow[]>(
    `workspaces?select=id&name=eq.${encodeURIComponent(name)}`,
    {},
    "admin",
  );
  return rows[0]?.id ?? "";
}

test.describe("An archived workspace", () => {
  test.skip(
    !haveMember || !haveAdmin,
    "Needs E2E_MEMBER_* and E2E_ADMIN_* (see docs/sql/1-6-e2e-workspace.sql)",
  );
  test.use({ storageState: MEMBER_STATE });

  let id = "";
  test.beforeAll(async () => {
    if (test.info().project.name !== "desktop") return;
    id = (await workspaceB()).id;
    await setArchived(id, true);
  });
  test.afterAll(async () => {
    if (id) await setArchived(id, false);
  });

  test("stays readable, shows the badge and refuses writes", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Archiving runs at desktop width only");
    const roles = await rest<{ workspace_id: string; role: string }[]>(
      "rpc/my_workspace_roles",
      { method: "POST", body: "{}" },
      "member",
    );
    expect(roles.find((row) => row.workspace_id === id)?.role).toBe("viewer");

    const [project] = await rest<{ id: string }[]>(
      `projects?select=id&code=eq.${PROJECT_B.code}`,
      {},
      "member",
    );
    expect(project, "the member still reads the project").toBeTruthy();
    await expect(
      rest(
        "risks",
        {
          method: "POST",
          body: JSON.stringify({
            project_id: project!.id,
            title: "E2E refused",
            probability: 1,
            impact: 1,
          }),
        },
        "member",
      ),
    ).rejects.toThrow(/403|42501|row-level security/);

    await page.goto(`/portfolio/projects/${PROJECT_B.code}`);
    await settle(page);
    await expect(page.getByText("Archived workspace").first()).toBeVisible();
    await expectNoErrorBoundary(page);
  });
});
