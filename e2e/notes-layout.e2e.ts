// Programme office note and the shared dependency map layout (work package 1.5). Real
// signed-in saves (the test user is organisation PMO), checking that each update sends only
// the column its update grant allows. Writes run at desktop width only; each test restores
// what it changed.
import { expect, settle, test } from "./fixtures";
import type { Page, Request } from "@playwright/test";
import { rest } from "./rest";

const LEGACY_KEY = "virtual-pmo-dependency-layout";

/** The JSON bodies of PATCH requests to a table while `action` runs. */
async function patchesTo(page: Page, table: string, action: () => Promise<void>) {
  const bodies: Record<string, unknown>[] = [];
  const listener = (request: Request) => {
    if (request.method() === "PATCH" && request.url().includes(`/rest/v1/${table}?`))
      bodies.push(request.postDataJSON() as Record<string, unknown>);
  };
  page.on("request", listener);
  try {
    await action();
  } finally {
    page.off("request", listener);
  }
  return bodies;
}

async function openFirstProgramme(page: Page) {
  await page.goto("/portfolio/programmes");
  await settle(page);
  const href = (
    await page
      .locator("a[href]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))
  ).find((path) => /^\/portfolio\/programmes\/[^/?#]+$/.test(path));
  expect(href, "a programme link").toBeTruthy();
  await page.locator(`a[href="${href}"]`).filter({ visible: true }).first().click();
  await settle(page);
  return href!.split("/").at(-1)!;
}

type LayoutRow = { id: string; positions: Record<string, unknown> };
const orgLayout = async () =>
  (
    await rest<LayoutRow[]>(
      "dependency_map_layouts?select=id,positions&portfolio_id=is.null&programme_id=is.null",
    )
  )[0] ?? null;

test.describe("Programme notes and map layout", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Writes run at desktop width only");
  });

  test("the office note saves, sending only the note, and is restored", async ({ page }) => {
    const programmeId = await openFirstProgramme(page);
    const before = await rest<{ note: string }[]>(
      `programme_office_notes?select=note&programme_id=eq.${programmeId}`,
    );
    const original = before[0]?.note ?? "";
    const text = `E2E note ${Date.now()}`;
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    const card = page.getByRole("region", { name: "Programme office note" });

    const save = async (value: string) => {
      await card.getByRole("button", { name: "Edit" }).click();
      await card.getByLabel("Office note text").fill(value);
      await card.getByRole("button", { name: "Save note" }).click();
      await expect(card.getByRole("button", { name: "Edit" })).toBeVisible();
    };
    try {
      // The first save may create the row; the second is always an update.
      await save(`${text} (first)`);
      const bodies = await patchesTo(page, "programme_office_notes", () => save(text));
      expect(bodies).toEqual([{ note: text }]);
      await expect(card.getByText(text, { exact: true })).toBeVisible();
      await expect(card.getByText(/Last updated by .+ on /)).toBeVisible();

      // Saved for real: still there after a reload.
      await page.reload();
      await settle(page);
      await page.getByRole("button", { name: "Notes", exact: true }).click();
      await expect(card.getByText(text, { exact: true })).toBeVisible();
    } finally {
      await rest(`programme_office_notes?programme_id=eq.${programmeId}`, {
        method: "PATCH",
        body: JSON.stringify({ note: original }),
      });
    }
  });

  test("a dragged node is saved for everyone, sending only positions", async ({ page }) => {
    const original = await orgLayout();
    await page.goto("/delivery/dependencies/map");
    await settle(page);
    await page.getByRole("switch", { name: "Workshop mode" }).click();
    const node = page.locator("button[data-node]:not([disabled])").first();
    await expect(node).toBeVisible();

    /** Drags the node and waits for the layout save (a POST the first time, then a PATCH). */
    const drag = async (dx: number) => {
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes("/rest/v1/dependency_map_layouts") &&
          ["POST", "PATCH"].includes(response.request().method()),
      );
      const box = (await node.boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + 10);
      await page.mouse.down();
      await page.mouse.move(box.x + 20 + dx, box.y + 30, { steps: 5 });
      await page.mouse.up();
      const response = await saved;
      expect(response.ok(), await response.text()).toBe(true);
      await expect(page.getByText("Layout saved for everyone")).toBeVisible();
    };
    try {
      await drag(40);
      // With a saved layout in place, the next save is an update.
      const bodies = await patchesTo(page, "dependency_map_layouts", () => drag(30));
      expect(bodies).toHaveLength(1);
      expect(Object.keys(bodies[0]!)).toEqual(["positions"]);
      const saved = await orgLayout();
      expect(Object.keys(saved!.positions).length).toBeGreaterThan(0);

      // Someone else saves meanwhile: the next save conflicts, reloads, and keeps both moves.
      const other = { "programme:e2e-other": { x: 7, y: 7 } };
      await rest(`dependency_map_layouts?id=eq.${saved!.id}`, {
        method: "PATCH",
        body: JSON.stringify({ positions: { ...saved!.positions, ...other } }),
      });
      const retried = await patchesTo(page, "dependency_map_layouts", async () => {
        const retry = page.waitForResponse(
          (response) =>
            response.url().includes("/rest/v1/dependency_map_layouts?id=") &&
            response.request().method() === "PATCH" &&
            response.request().postData()?.includes("e2e-other") === true,
        );
        await drag(-50);
        expect((await retry).ok()).toBe(true);
      });
      expect(retried, "a conflicted save is retried once").toHaveLength(2);
      expect(retried[0]).not.toHaveProperty(["positions", "programme:e2e-other"]);
      const merged = (await orgLayout())!.positions;
      expect(merged).toMatchObject(other);
      expect(Object.keys(merged).length).toBeGreaterThan(1);
    } finally {
      if (original)
        await rest(`dependency_map_layouts?id=eq.${original.id}`, {
          method: "PATCH",
          body: JSON.stringify({ positions: original.positions }),
        });
      else
        await rest("dependency_map_layouts?portfolio_id=is.null&programme_id=is.null", {
          method: "DELETE",
        });
    }
  });

  test("a layout kept in this browser is offered once, saved, then reset", async ({ page }) => {
    test.skip(Boolean(await orgLayout()), "A shared layout already exists; nothing to offer");
    await page.goto("/delivery/dependencies/map");
    await settle(page);
    const nodeId = "programme:e2e-legacy";
    await page.evaluate(
      ([key, id]) => localStorage.setItem(key, JSON.stringify({ [id]: { x: 300, y: 200 } })),
      [LEGACY_KEY, nodeId] as const,
    );
    await page.reload();
    await settle(page);
    const offer = page.getByRole("alert").filter({ hasText: "Save this layout for everyone?" });
    await expect(offer).toBeVisible();
    // Offered once: the key is gone as soon as it has been read.
    expect(await page.evaluate((key) => localStorage.getItem(key), LEGACY_KEY)).toBeNull();
    try {
      await offer.getByRole("button", { name: "Save for everyone" }).click();
      await expect(page.getByText("This browser's layout is now saved for everyone")).toBeVisible();
      expect((await orgLayout())!.positions).toEqual({ [nodeId]: { x: 300, y: 200 } });
      await page.reload();
      await settle(page);
      await expect(offer).toHaveCount(0);

      await page.getByRole("switch", { name: "Workshop mode" }).click();
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByRole("button", { name: "Reset layout" }).click();
      await expect(page.getByText("Layout reset")).toBeVisible();
      expect(await orgLayout()).toBeNull();
    } finally {
      await rest("dependency_map_layouts?portfolio_id=is.null&programme_id=is.null", {
        method: "DELETE",
      });
    }
  });
});
