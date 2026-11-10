// GL-9: the Sample chip and Settings › Data › Sample data. Adding or removing sample data writes
// to the organisation, so these tests only read: the is_sample reads are replaced (one real
// project is reported as sample) and the membership says admin, as in org-access.e2e.ts. Every
// other request goes to the live project unchanged. Seeding itself is covered by
// supabase/tests/sample_data.sql.
import type { Page, Route } from "@playwright/test";
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";

async function patchJson(route: Route, edit: (body: unknown) => unknown) {
  const response = await route.fetch();
  const body = (await response.json()) as unknown;
  await route.fulfill({ response, json: edit(body) });
}

const isSampleRead = (table: string) => (url: URL) =>
  url.pathname.endsWith(`/rest/v1/${table}`) && url.search.includes("is_sample=eq.true");

/** Reports one real project as sample; every other is_sample read answers with no rows. */
async function pretendSample(page: Page, portfolioActive: boolean): Promise<{ code: string }> {
  const sample = { code: "" };
  await page.route(isSampleRead("projects"), async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.delete("is_sample");
    url.searchParams.set("archived_at", "is.null");
    url.searchParams.set("limit", "1");
    const response = await route.fetch({ url: url.toString() });
    const rows = (await response.json()) as Array<{ id: string; code: string }>;
    sample.code = rows[0]?.code ?? "";
    await route.fulfill({ json: rows });
  });
  await page.route(isSampleRead("portfolios"), (route) =>
    route.fulfill({
      json: portfolioActive
        ? [{ id: "00000000-0000-4000-8000-000000000009", archived_at: null }]
        : [],
    }),
  );
  for (const table of ["programmes", "risks", "issues", "decisions", "benefits"])
    await page.route(isSampleRead(table), (route) => route.fulfill({ json: [] }));
  return sample;
}

async function pretendAdmin(page: Page) {
  await page.route(
    (url) =>
      url.pathname.endsWith("/rest/v1/organisation_members") && url.search.includes("is_demo"),
    (route) =>
      patchJson(route, (rows) =>
        (rows as Array<Record<string, unknown>>).map((row) => ({ ...row, role: "admin" })),
      ),
  );
  await page.route("**/rest/v1/organisation_join_requests?*", (route) =>
    route.fulfill({ json: [] }),
  );
}

test("a sample project shows the Sample chip in the projects list and its header", async ({
  page,
}) => {
  const sample = await pretendSample(page, true);
  await page.goto("/portfolio/projects");
  await settle(page);
  expect(sample.code).not.toBe("");
  const row = page.locator("tr", {
    has: page.locator(`a[href$="/portfolio/projects/${sample.code}"]`),
  });
  await expect(row.getByText("Sample", { exact: true })).toBeVisible();
  // Exactly one project is sample, so exactly one chip.
  await expect(page.getByText("Sample", { exact: true })).toHaveCount(1);
  await page.goto(`/portfolio/projects/${sample.code}`);
  await settle(page);
  await expect(page.getByText("Sample", { exact: true }).first()).toBeVisible();
  await expectNoErrorBoundary(page);
});

test("Settings › Data offers Add sample data when there is none", async ({ page }) => {
  await pretendAdmin(page);
  await pretendSample(page, false);
  await page.goto("/settings/data");
  await settle(page);
  await expect(page.getByRole("button", { name: "Add sample data" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove sample data" })).toHaveCount(0);
  await expectNoErrorBoundary(page);
});

test("Settings › Data offers Remove sample data while it is active", async ({ page }) => {
  await pretendAdmin(page);
  await pretendSample(page, true);
  await page.goto("/settings/data");
  await settle(page);
  await expect(page.getByRole("button", { name: "Remove sample data" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add sample data" })).toHaveCount(0);
  await expectNoErrorBoundary(page);
});
