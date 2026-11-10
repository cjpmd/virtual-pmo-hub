// GL-8: a General organisation shows no university wording in Settings. The test user belongs to
// the demo organisation (University), and creating a real organisation on production isn't an
// option, so the responses that carry sector-specific values are replaced with what
// create_organisation seeds for a General organisation: the organisation row (name, sector,
// tiers, optimism bias, financial year) and its lists. Every other request goes to the live
// project unchanged. Read-only: nothing is saved.
import type { Page, Route } from "@playwright/test";
import { benefitCategoriesFor, sectorOptimismBias, tierDefinitionsFor } from "../src/data/sectors";
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";

const NAME = "Acme Ltd";
const universityWords = /student|research|academic|campus|facult|universit|institution|teaching/i;

const generalLists: Record<string, string[]> = {
  team: ["Technology", "Operations", "Change & Transformation", "Finance", "PMO"],
  benefit_category: benefitCategoriesFor("general"),
  project_type: [
    "Business system",
    "Infrastructure",
    "Cyber",
    "Rollout",
    "Service improvement",
    "Process change",
    "Organisational change",
    "AI",
    "Supplier delivered",
  ],
  business_unit: [
    "Technology",
    "Operations",
    "Product",
    "Sales & Marketing",
    "Customer Service",
    "Finance",
    "People & HR",
  ],
  change_type: ["Scope", "Schedule", "Cost"],
  collection_type: ["Governance", "Priority set", "Funding stream"],
  cost_category: ["Staff", "Contractors", "Licences", "Hardware", "Other"],
};

async function patchJson(route: Route, edit: (body: unknown) => unknown) {
  const response = await route.fetch();
  const body = (await response.json()) as unknown;
  await route.fulfill({ response, json: edit(body) });
}

type Row = Record<string, unknown>;
const asGeneral = (row: Row): Row => {
  const settings = (row["settings"] ?? {}) as Row;
  const regional = (settings["regional"] ?? {}) as Row;
  const benefits = (settings["benefits"] ?? {}) as Row;
  return {
    ...row,
    name: NAME,
    short_name: NAME,
    ...(row["settings"] === undefined
      ? {}
      : {
          settings: {
            ...settings,
            sector: "general",
            tiers: tierDefinitionsFor("general"),
            regional: { ...regional, financialYearStartMonth: 1 },
            benefits: { ...benefits, optimismBias: sectorOptimismBias("general") },
          },
        }),
  };
};

async function pretendGeneralOrg(page: Page) {
  // The organisation's name in the shell (membership embed).
  await page.route(
    (url) =>
      url.pathname.endsWith("/rest/v1/organisation_members") && url.search.includes("is_demo"),
    (route) =>
      patchJson(route, (rows) =>
        (rows as Array<{ organisations: Row }>).map((row) => ({
          ...row,
          organisations: { ...row.organisations, name: NAME },
        })),
      ),
  );
  await page.route(
    (url) => url.pathname.endsWith("/rest/v1/organisations") && url.search.includes("settings"),
    (route) =>
      patchJson(route, (body) =>
        Array.isArray(body) ? (body as Row[]).map(asGeneral) : asGeneral(body as Row),
      ),
  );
  await page.route("**/rest/v1/lookup_values?*", (route) =>
    route.fulfill({
      json: Object.entries(generalLists).flatMap(([listKey, labels], list) =>
        labels.map((label, index) => ({
          id: `00000000-0000-4000-8000-${(list * 100 + index).toString(16).padStart(12, "0")}`,
          list_key: listKey,
          value: label,
          label,
          sort_order: index,
          is_active: true,
        })),
      ),
    }),
  );
}

test("a General organisation has no university wording in Settings", async ({ page }) => {
  await pretendGeneralOrg(page);
  for (const section of ["organisation", "regional", "lifecycle", "benefits", "lists"]) {
    await page.goto(`/settings/${section}`);
    await settle(page);
    await expectNoErrorBoundary(page);
    const main = page.locator("main");
    await expect(main).not.toHaveText(universityWords);
    if (section === "organisation") await expect(main.getByLabel("Sector")).toHaveValue("general");
    if (section === "benefits") await expect(main).toContainText("Customer experience");
    if (section === "lifecycle") await expect(main).toContainText("organisation-wide impact");
  }
});
