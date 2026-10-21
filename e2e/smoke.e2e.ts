// Visits every page in the navigation, plus one project, programme and benefit detail page,
// in light and dark, at each project's viewport (1280px and 375px).
import { sections, settingsSection } from "../src/lib/navigation";
import { expect, expectNoErrorBoundary, settle, setTheme, test, type Theme } from "./fixtures";
import type { Page } from "@playwright/test";

const routes = [
  ...new Set(
    [...sections, settingsSection].flatMap((section) => [
      section.to,
      ...section.pages.map((page) => page.to),
    ]),
  ),
];

const themes: Theme[] = ["light", "dark"];

async function checkBothThemes(page: Page) {
  for (const theme of themes) {
    await setTheme(page, theme);
    await settle(page);
    await expectNoErrorBoundary(page);
  }
}

for (const route of routes) {
  test(`page ${route}`, async ({ page }) => {
    await page.goto(route);
    await settle(page);
    await expect(page).toHaveURL(new RegExp(`${route.replace(/\//g, "\\/")}(\\/|\\?|$)`));
    await checkBothThemes(page);
  });
}

// Detail pages: open the first record linked from its list page, so no ids are hard-coded.
const details = [
  { name: "project", list: "/portfolio/projects", link: /^\/portfolio\/projects\/[^/?#]+$/ },
  { name: "programme", list: "/portfolio/programmes", link: /^\/portfolio\/programmes\/[^/?#]+$/ },
  { name: "benefit", list: "/benefits/register", link: /^\/benefits\/[^/?#]+$/ },
];

for (const detail of details) {
  test(`detail ${detail.name}`, async ({ page }) => {
    await page.goto(detail.list);
    await settle(page);
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    const listPaths = new Set(routes);
    const href = hrefs.find((path) => detail.link.test(path) && !listPaths.has(path));
    expect(href, `a ${detail.name} link on ${detail.list}`).toBeTruthy();
    await page.goto(href!);
    await settle(page);
    await checkBothThemes(page);
  });
}
