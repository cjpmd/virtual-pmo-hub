// Public pages, signed out: sign-in is magic link only and shows no personal email (0.6).
import { expect, expectNoErrorBoundary, test } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("sign-in is magic link only", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  await expect(page.getByText("Demo access", { exact: false })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/@gmail\.com/i);
  await expectNoErrorBoundary(page);
});
