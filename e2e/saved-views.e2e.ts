// Saved board views and dashboards (work package 1.3): save, persist across a reload, make the
// default, delete. Writes run at desktop width only, and every row this spec creates is named
// "E2E …"; afterAll deletes any the test user still owns, so a failed run leaves nothing behind.
import { readFileSync } from "node:fs";
import { expect, settle, test } from "./fixtures";
import type { Page } from "@playwright/test";

const PREFIX = "E2E";

/** Deletes the test user's own "E2E …" rows through the REST API, as that user. */
async function cleanUp() {
  const url = process.env["VITE_SUPABASE_URL"]!;
  const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
  const state = JSON.parse(readFileSync("e2e/.auth/user.json", "utf8")) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  const entry = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name.endsWith("-auth-token"));
  if (!entry) throw new Error("No session in e2e/.auth/user.json");
  const session = JSON.parse(entry.value) as { access_token: string; user: { id: string } };
  for (const table of ["saved_views", "dashboards"]) {
    const response = await fetch(
      `${url}/rest/v1/${table}?owner_id=eq.${session.user.id}&name=like.${PREFIX}*`,
      {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
      },
    );
    if (!response.ok) throw new Error(`Cleaning up ${table}: ${response.status}`);
  }
}

/** Answers the next prompt or confirm with `answer` (a confirm is accepted). */
function answerNextDialog(page: Page, answer?: string) {
  page.once("dialog", (dialog) => void dialog.accept(answer));
}

test.describe("Saved views and dashboards", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Writes run at desktop width only");
  });
  test.afterAll(cleanUp);

  test("a board view is saved, becomes my default and is deleted", async ({ page }) => {
    const name = `${PREFIX} view ${Date.now()}`;
    const select = page.getByRole("combobox", { name: "Saved views" });
    await page.goto("/portfolio/projects");
    await settle(page);

    answerNextDialog(page, name);
    await page.getByRole("button", { name: "Save view" }).click();
    await expect(select.locator("option", { hasText: name })).toHaveCount(1);
    await expect(page.getByText(`${name} saved`)).toBeVisible();

    // Persisted: still there after a reload, and the board opens on the seeded default.
    await page.reload();
    await settle(page);
    await expect(select.locator("option", { hasText: name })).toHaveCount(1);
    await select.selectOption({ label: name });
    await page.getByRole("button", { name: "Default" }).click();
    await expect(page.getByText(`${name} is now your default`)).toBeVisible();

    // My default opens first.
    await page.reload();
    await settle(page);
    await expect(select.locator("option:checked")).toHaveText(new RegExp(name));

    await page.locator("summary", { hasText: /^View$/ }).click();
    answerNextDialog(page);
    await page.getByRole("button", { name: "Delete view" }).click();
    await expect(page.getByText(`${name} deleted`)).toBeVisible();
    await page.reload();
    await settle(page);
    await expect(select.locator("option", { hasText: name })).toHaveCount(0);
  });

  test("a dashboard is saved, opens by default and is deleted", async ({ page }) => {
    const name = `${PREFIX} dashboard ${Date.now()}`;
    const select = page.getByRole("combobox", { name: "Dashboard" });
    await page.goto("/insights/dashboards");
    await settle(page);
    await expect(select.locator("option:checked")).toHaveText(/built-in/);
    const widgets = page.locator("main section[draggable]");
    const before = await widgets.count();

    // Edit the built-in dashboard, then keep the change as a new one.
    await page.getByRole("button", { name: "Remove KPI number" }).click();
    await expect(page.getByText("Unsaved changes: save as new to keep them")).toBeVisible();
    answerNextDialog(page, name);
    await page.getByRole("button", { name: "Save as new" }).click();
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

    // Persisted, but the built-in one still opens until this is the default.
    await page.reload();
    await settle(page);
    await expect(select.locator("option:checked")).toHaveText(/built-in/);
    await select.selectOption({ label: name });
    await expect(widgets).toHaveCount(before - 1);
    await expect(page.getByRole("heading", { name: "KPI number" })).toHaveCount(0);
    await page.locator("summary", { hasText: "Dashboard" }).click();
    await page.getByRole("button", { name: "Open this by default" }).click();
    await expect(page.getByText(`${name} now opens by default`)).toBeVisible();

    await page.reload();
    await settle(page);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

    await page.locator("summary", { hasText: "Dashboard" }).click();
    answerNextDialog(page);
    await page.getByRole("button", { name: "Delete dashboard" }).click();
    await expect(page.getByText(`${name} deleted`)).toBeVisible();
    await expect(select.locator("option", { hasText: name })).toHaveCount(0);
  });
});
