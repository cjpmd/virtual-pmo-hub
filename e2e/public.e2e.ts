// Public pages, signed out: Microsoft and email + password sign-in, no magic link and no
// personal email on the page.
import { expect, expectNoErrorBoundary, test } from "./fixtures";

test.use({ storageState: { cookies: [], origins: [] } });

test("login offers Microsoft first, then email and password", async ({ page }) => {
  await page.goto("/login");
  const microsoft = page.getByRole("button", { name: "Sign in with Microsoft" });
  await expect(microsoft).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
  // Microsoft comes before the email form.
  const buttonBox = await microsoft.boundingBox();
  const emailBox = await page.getByLabel("Email").boundingBox();
  expect(buttonBox!.y).toBeLessThan(emailBox!.y);
  await expect(page.getByText(/sign-in link|magic link/i)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/@gmail\.com/i);
  await expectNoErrorBoundary(page);
});

test("the old /signin address redirects to /login", async ({ page }) => {
  await page.goto("/signin?next=%2Fportfolio");
  await expect(page).toHaveURL(/\/login\?next=%2Fportfolio/);
});

test("protected pages send signed-out visitors to /login", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login\?next=%2Fportfolio/);
});

test("sign-up asks for name, email, password and confirmation", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "Sign in with Microsoft" })).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByLabel("Confirm password")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("short");
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  await expectNoErrorBoundary(page);
});

test("callback explains a missing Microsoft admin consent", async ({ page }) => {
  await page.goto(
    "/auth/callback?error=access_denied&error_description=AADSTS65001%3A+The+user+or+administrator+has+not+consented",
  );
  await expect(page.getByRole("heading", { name: /needs to approve ORMO PMO/ })).toBeVisible();
  await expect(page.getByText(/IT administrator/)).toBeVisible();
});

test("public site pages open signed out and link to each other", async ({ page }) => {
  for (const [path, heading] of [
    ["/pricing", "Simple pricing, per user."],
    ["/product", "Everything a PMO needs, in one place."],
    ["/security", "How we protect your data."],
    ["/privacy", "Privacy notice"],
    ["/terms", "Terms of service"],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expectNoErrorBoundary(page);
  }
  const header = page.getByRole("navigation", { name: "Main" });
  await expect(header.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing");
  await expect(header.getByRole("link", { name: "Security" })).toHaveAttribute("href", "/security");
  await expect(header.getByRole("link", { name: "Product" })).toHaveAttribute("href", "/product");
  const footer = page.getByRole("navigation", { name: "Footer" });
  for (const name of ["Product", "Pricing", "Security", "Privacy", "Terms", "Contact"]) {
    await expect(footer.getByRole("link", { name, exact: true })).toBeVisible();
  }
});

test("pricing switches between monthly and annual", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("per user per month, excl. VAT")).toBeVisible();
  await page.getByRole("button", { name: /Annual/ }).click();
  await expect(page.getByText("per user per year, excl. VAT")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start free trial" }).first()).toHaveAttribute(
    "href",
    "/signup",
  );
});
