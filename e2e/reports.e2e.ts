// Report builder E2E (spec §19, Phase 3): forum → pack → selection → submit → approve → publish
// → view as viewer → record a decision in the meeting → the next pack shows the change.
//
// Runs against a Supabase BRANCH seeded with supabase/seed/reports_demo.sql, never production
// (RB-25). Give the seed users a password on the branch, e.g.
//   update auth.users set encrypted_password = extensions.crypt('<password>', extensions.gen_salt('bf')),
//     email_confirmed_at = now() where email like '%@reports-demo.test';
// then set E2E_REPORTS_PASSWORD in .env.local. Without it every test here skips.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "@playwright/test";
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";

const PASSWORD = process.env["E2E_REPORTS_PASSWORD"];
const FORUM = "d0000000-0000-4000-8000-000000000501"; // Digital Care Programme Board
const USERS = {
  pmo: "pmo@reports-demo.test",
  chair: "chair@reports-demo.test",
  viewer: "viewer@reports-demo.test",
} as const;
type Who = keyof typeof USERS;

// A pack page loads one RPC per block (~45 for a programme pack), two at a time (RB-49); on the
// test project's small instance that takes up to two minutes per page, so each test gets ten.
test.describe.configure({ mode: "serial", timeout: 600_000 });
test.skip(!PASSWORD, "E2E_REPORTS_PASSWORD is not set (seeded Supabase branch only)");

const statePath = (who: Who) => `e2e/.auth/reports-${who}.json`;

async function signIn(browser: Browser, baseURL: string, who: Who) {
  const url = process.env["VITE_SUPABASE_URL"]!;
  const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email: USERS[who], password: PASSWORD }),
  });
  if (!response.ok) throw new Error(`${who} sign-in failed: ${response.status}`);
  const session = (await response.json()) as Record<string, unknown> & { expires_in: number };
  session["expires_at"] ??= Math.floor(Date.now() / 1000) + session.expires_in;
  const page = await browser.newPage({ baseURL });
  await page.goto("/login");
  await page.evaluate(([name, value]) => localStorage.setItem(name, value), [
    `sb-${new URL(url).hostname.split(".")[0]}-auth-token`,
    JSON.stringify(session),
  ] as const);
  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: statePath(who) });
  await page.close();
}

async function as(browser: Browser, baseURL: string, who: Who, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext({ baseURL, storageState: statePath(who) });
  const page = await context.newPage();
  try {
    await run(page);
  } finally {
    await context.close();
  }
}

/** The REST API as a seed user (their session from beforeAll). */
async function restAs<T>(who: Who, path: string, init: RequestInit = {}): Promise<T> {
  const state = JSON.parse(readFileSync(statePath(who), "utf8")) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  const token = (
    JSON.parse(
      state.origins.flatMap((o) => o.localStorage).find((i) => i.name.endsWith("-auth-token"))!
        .value,
    ) as { access_token: string }
  ).access_token;
  const response = await fetch(`${process.env["VITE_SUPABASE_URL"]}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

let reportId = "";
// The seed's first pack has RD02 "worsened" against the health snapshot four weeks back; once a
// pack is published on the forum it compares with that pack instead, so RD02 drops out (RB-49).
let firstPack = true;
const SEED_DECISION = "d0000000-0000-4000-8000-000000000701";

test.beforeAll(async ({ baseURL }) => {
  const browser = await chromium.launch();
  for (const who of Object.keys(USERS) as Who[]) await signIn(browser, baseURL!, who);
  await browser.close();
  firstPack = !(
    await restAs<unknown[]>(
      "pmo",
      `reports?select=id&forum_id=eq.${FORUM}&status=eq.published&limit=1`,
    )
  ).length;
  // Every run records RD06's decision, so a run needs a pending one: re-runs on the same
  // project add a fresh copy of the seed decision (same project, forum, meeting and maker).
  const pending = await restAs<unknown[]>(
    "pmo",
    `decisions?select=id&forum_id=eq.${FORUM}&status=eq.pending&limit=1`,
  );
  if (!pending.length) {
    const [seed] = await restAs<Record<string, string>[]>(
      "pmo",
      `decisions?select=organisation_id,workspace_id,project_id,title,context,target_meeting_id,decision_maker_id&id=eq.${SEED_DECISION}`,
    );
    const [decision] = await restAs<{ id: string }[]>("pmo", "decisions", {
      method: "POST",
      body: JSON.stringify({
        ...seed,
        title: `${seed!["title"]} (E2E ${new Date().toISOString().slice(0, 16)})`,
        forum_id: FORUM,
        needed_by_date: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
      }),
    });
    const base = {
      organisation_id: seed!["organisation_id"],
      workspace_id: seed!["workspace_id"],
      decision_id: decision!.id,
      project_id: seed!["project_id"],
    };
    await restAs("pmo", "decision_options", {
      method: "POST",
      body: JSON.stringify([
        { ...base, title: "Supplier A", sort_order: 1 },
        { ...base, title: "Supplier B (recommended)", sort_order: 2 },
      ]),
    });
  }
});

test("PMO creates a programme pack; the rules pick the exceptions", async ({
  browser,
  baseURL,
}) => {
  await as(browser, baseURL!, "pmo", async (page) => {
    await page.goto(`/governance/forum?forum=${FORUM}`);
    await settle(page);
    await expect(page.getByRole("region", { name: "Packs" })).toBeVisible();
    await page.getByRole("button", { name: /Create pack/ }).click();
    await page.waitForURL(/\/governance\/reports\/[0-9a-f-]+\/edit/);
    reportId = /reports\/([0-9a-f-]+)\/edit/.exec(page.url())![1]!;
    await settle(page);
    await page.getByRole("tab", { name: "Selection" }).click();
    // RD01–RD06 breach a rule (RD02 only on the forum's first pack); RD09 is clean.
    for (const code of ["RD01", ...(firstPack ? ["RD02"] : []), "RD03", "RD04", "RD05", "RD06"])
      await expect(page.locator("[data-inclusion]").filter({ hasText: code })).toHaveCount(1);
    await expect(page.locator("[data-inclusion]").filter({ hasText: "RD09" })).toHaveCount(0);
    await expect(page.locator("[data-inclusion]").filter({ hasText: "RD04" })).toContainText(
      "Slip",
    );
    // Pin RD09 and it becomes a deep-dive.
    await page
      .getByRole("listitem")
      .filter({ hasText: "RD09" })
      .getByRole("button", { name: "Pin" })
      .click();
    await expect(page.locator("[data-inclusion]").filter({ hasText: "RD09" })).toContainText(
      "Pinned",
    );
    // Narrative, then submit.
    await page.locator('[data-instance="exec"]').getByRole("button", { name: "Write" }).click();
    await page
      .getByRole("textbox", { name: "Narrative (Markdown)" })
      .fill("Three projects need the board's attention.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Three projects need the board's attention.")).toBeVisible();
    await page.getByRole("tab", { name: "Report" }).click();
    await page.getByLabel(/Overall rating/).selectOption("amber");
    await expect(page.getByText("Saved")).toBeVisible();
    await page.getByRole("button", { name: "Submit for review" }).click();
    await expect(page.getByText("Submitted for review")).toBeVisible();
    await expectNoErrorBoundary(page);
  });
});

test("the chair approves; PMO publishes a frozen snapshot", async ({ browser, baseURL }) => {
  test.skip(!reportId, "needs the pack from the previous test");
  await as(browser, baseURL!, "chair", async (page) => {
    await page.goto(`/governance/reports/${reportId}`);
    await settle(page);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  });
  await as(browser, baseURL!, "pmo", async (page) => {
    await page.goto(`/governance/reports/${reportId}`);
    await settle(page);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Publish" }).click();
    // report-publish builds every snapshot, then the page reloads the pack (~15 s on the test
    // project).
    await expect(page.locator('[data-banner="snapshot"]')).toBeVisible({ timeout: 60_000 });
  });
});

test("a viewer opens the published pack and its print layout", async ({ browser, baseURL }) => {
  test.skip(!reportId, "needs the published pack");
  await as(browser, baseURL!, "viewer", async (page) => {
    await page.goto(`/governance/reports/${reportId}`);
    await settle(page);
    await expect(page.locator('[data-banner="snapshot"]')).toContainText("Snapshot");
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await expect(page.locator('section[data-block="project_status_grid"]')).toContainText("RD04");
    await page.goto(`/governance/reports/${reportId}/print`);
    await settle(page);
    const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(20_000);
    await expectNoErrorBoundary(page);
  });
});

test("the chair records RD06's decision in presentation mode", async ({ browser, baseURL }) => {
  test.skip(!reportId, "needs the published pack");
  await as(browser, baseURL!, "chair", async (page) => {
    await page.goto(`/governance/reports/${reportId}/present`);
    await settle(page);
    await page.keyboard.press("ArrowRight");
    const decision = page.locator("[data-capture-decision]").first();
    await decision.getByRole("combobox").selectOption({ label: "Supplier B (recommended)" });
    await decision.getByRole("textbox").fill("Integration outweighs the licence cost.");
    await decision.getByRole("button", { name: "Record decision" }).click();
    await expect(decision.getByText("Recorded.")).toBeVisible();
    await page.getByRole("textbox", { name: "Action" }).fill("Negotiate supplier B licence terms");
    await page.getByRole("button", { name: "Add action" }).click();
    await expect(page.getByText("Negotiate supplier B licence terms")).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test("the next pack shows the decision taken and the changes", async ({ browser, baseURL }) => {
  test.skip(!reportId, "needs the published pack");
  await as(browser, baseURL!, "pmo", async (page) => {
    await page.goto(`/governance/reports?forum=${FORUM}&create=true`);
    await settle(page);
    await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/edit$/);
    const next = /reports\/([0-9a-f-]+)\/edit/.exec(page.url())![1]!;
    await page.goto(`/governance/reports/${next}`);
    await settle(page);
    await expect(page.locator('section[data-block="changes_since_last"]')).toBeVisible();
    await expect(page.locator('section[data-block="actions_log"]')).toContainText(
      "Negotiate supplier B licence terms",
    );
    await expectNoErrorBoundary(page);
  });
});
