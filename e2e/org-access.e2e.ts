// GL-5: the trial and read-only banner, and New project disabled while read-only. The test user
// belongs to the demo organisation (always writable, never bannered), and a real organisation
// can't be made read-only on production, so the responses that decide the banner are replaced:
// the membership says a non-demo organisation where the user is admin, the workspace roles say
// admin, and organisation_writable / organisation_subscriptions answer as the test needs. Every
// other request goes to the live project unchanged.
import type { Page, Route } from "@playwright/test";
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";

const DAY = 86_400_000;

async function patchJson(route: Route, edit: (body: unknown) => unknown) {
  const response = await route.fetch();
  const body = (await response.json()) as unknown;
  await route.fulfill({ response, json: edit(body) });
}

async function pretendAdminOfPaidOrg(
  page: Page,
  writable: boolean,
  subscription: Record<string, unknown>,
) {
  await page.route(
    (url) =>
      url.pathname.endsWith("/rest/v1/organisation_members") && url.search.includes("is_demo"),
    (route) =>
      patchJson(route, (rows) =>
        (rows as Array<{ role: string; organisations: { is_demo: boolean } }>).map((row) => ({
          ...row,
          role: "admin",
          organisations: { ...row.organisations, is_demo: false },
        })),
      ),
  );
  await page.route("**/rest/v1/rpc/my_workspace_roles", (route) =>
    patchJson(route, (rows) =>
      (rows as Array<Record<string, unknown>>).map((row) => ({ ...row, role: "admin" })),
    ),
  );
  // Admin-only reads the pretend role would otherwise make; the real user may not be an admin.
  await page.route("**/rest/v1/organisation_join_requests?*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/rest/v1/rpc/organisation_writable", (route) =>
    route.fulfill({ json: writable }),
  );
  await page.route("**/rest/v1/organisation_subscriptions?*", (route) =>
    route.fulfill({
      json: {
        plan: "trial",
        status: "",
        billing_interval: null,
        seats_total: 0,
        trial_ends_at: null,
        current_period_end: null,
        status_changed_at: null,
        cancel_at_period_end: false,
        billing_contact: null,
        stripe_customer_id: null,
        ...subscription,
      },
    }),
  );
}

test("a trial organisation shows the days left to admins", async ({ page }) => {
  await pretendAdminOfPaidOrg(page, true, {
    trial_ends_at: new Date(Date.now() + 10 * DAY - 60_000).toISOString(),
  });
  await page.goto("/portfolio/projects");
  await settle(page);
  const banner = page.locator('[data-banner="trial"]');
  await expect(banner).toContainText("10 days left in your trial");
  await expect(banner.getByRole("link", { name: "Subscribe" })).toBeVisible();
  await expectNoErrorBoundary(page);
});

test("a read-only organisation shows the banner and a disabled New project", async ({ page }) => {
  await pretendAdminOfPaidOrg(page, false, {
    trial_ends_at: new Date(Date.now() - 2 * DAY).toISOString(),
  });
  await page.goto("/portfolio/projects");
  await settle(page);
  const banner = page.locator('[data-banner="read_only"]');
  await expect(banner).toContainText("This organisation is read-only.");
  await expect(banner.getByRole("link", { name: "Subscribe" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New project" })).toBeDisabled();
  await expectNoErrorBoundary(page);
});

test("the demo organisation shows no banner", async ({ page }) => {
  await page.goto("/portfolio/projects");
  await settle(page);
  await expect(page.locator("[data-banner]")).toHaveCount(0);
});

// GL-11: a pending deletion shows to everyone, with the date, and admins get Cancel in Settings.
test("an organisation scheduled for deletion shows the date and Cancel deletion", async ({
  page,
}) => {
  await pretendAdminOfPaidOrg(page, false, { status: "active" });
  const purgeAfter = new Date(Date.now() + 20 * DAY).toISOString();
  await page.route("**/rest/v1/organisation_deletions?*", (route) =>
    route.fulfill({
      json: {
        requested_at: new Date(Date.now() - 10 * DAY).toISOString(),
        purge_after: purgeAfter,
        cancelled_at: null,
      },
    }),
  );
  await page.goto("/portfolio/projects");
  await settle(page);
  const banner = page.locator('[data-banner="pending_deletion"]');
  await expect(banner).toContainText("scheduled for deletion on");
  await banner.getByRole("link", { name: "Review or cancel" }).click();
  await settle(page);
  await expect(page.getByTestId("deletion-pending")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel deletion" })).toBeEnabled();
  await expectNoErrorBoundary(page);
});

test("Delete organisation needs the exact name before it can be confirmed", async ({ page }) => {
  await pretendAdminOfPaidOrg(page, true, { status: "active" });
  await page.route("**/rest/v1/organisation_deletions?*", (route) => route.fulfill({ json: null }));
  await page.goto("/settings/organisation");
  await settle(page);
  await page.getByRole("button", { name: "Delete organisation…" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: "Delete in 30 days" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/to confirm/).fill("not the name");
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button", { name: "Keep organisation" }).click();
  await expectNoErrorBoundary(page);
});
