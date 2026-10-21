// End-to-end tests (work package 0.1). Run with `npm run test:e2e`.
// Needs E2E_EMAIL and E2E_PASSWORD in .env.local (gitignored): a dedicated test user who is a
// member of the demo organisation. The Supabase URL and key come from .env.
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

for (const file of [".env", ".env.local"]) if (existsSync(file)) process.loadEnvFile(file);

const port = Number(process.env["E2E_PORT"] ?? 8080);
const baseURL = process.env["E2E_BASE_URL"] ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  // *.e2e.ts rather than *.spec.ts, so Vitest's default glob never picks these up.
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // The suite runs against a live Supabase project: two workers keep its request rate down.
  workers: 2,
  retries: process.env["CI"] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    storageState: "e2e/.auth/user.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, hasTouch: true },
    },
  ],
  // E2E_BASE_URL points the tests at an already running app instead of a local dev server.
  ...(!process.env["E2E_BASE_URL"] && {
    webServer: {
      command: `npx vite dev --host 127.0.0.1 --port ${port} --strictPort`,
      url: `${baseURL}/signin`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
  }),
});
