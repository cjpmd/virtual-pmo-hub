// Shared test fixture: every test fails on console errors, uncaught page errors, failed
// requests or error responses, and helpers check for error boundaries and switch theme.
import { expect, test as base, type Page } from "@playwright/test";

export type Theme = "light" | "dark";

// Navigations and unmounts cancel in-flight requests; those aborts are not failures.
const ignoredFailure = (failure: string) => failure.includes("ERR_ABORTED");

export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      const where = () => new URL(page.url()).pathname + new URL(page.url()).search;
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(`${where()} console: ${message.text()}`);
      });
      page.on("pageerror", (error) => problems.push(`${where()} page error: ${error.message}`));
      page.on("requestfailed", (request) => {
        const failure = request.failure()?.errorText ?? "failed";
        if (!ignoredFailure(failure))
          problems.push(
            `${where()} request failed: ${request.method()} ${request.url()} ${failure}`,
          );
      });
      page.on("response", (response) => {
        if (response.status() >= 400)
          problems.push(
            `${where()} HTTP ${response.status()}: ${response.request().method()} ${response.url()}`,
          );
      });
      await use(problems);
      expect(problems, "console errors, failed requests or error responses").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Waits for the page's data to load: network quiet and no loading skeletons. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[data-slot="skeleton"], .animate-pulse')).toHaveCount(0);
}

/** Fails if the root error boundary, the 404 page or a query error is showing. */
export async function expectNoErrorBoundary(page: Page) {
  await expect(page.getByText("This page didn't load")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "404" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
}

/** The theme lives in app-shell state, so it is set with the header toggle. */
export async function setTheme(page: Page, theme: Theme) {
  const html = page.locator("html");
  const isDark = async () => (await html.getAttribute("class"))?.split(" ").includes("dark");
  if (Boolean(await isDark()) !== (theme === "dark"))
    await page.getByRole("button", { name: "Toggle theme" }).click();
  if (theme === "dark") await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  else await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
}
