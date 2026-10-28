// End-to-end tests (work package 0.1). Run with `npm run test:e2e`.
// Needs E2E_EMAIL and E2E_PASSWORD in .env.local (gitignored): a dedicated test user who is a
// member of the demo organisation. The Supabase URL and key come from .env.
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

for (const file of [".env", ".env.local"]) if (existsSync(file)) process.loadEnvFile(file);

const port = Number(process.env["E2E_PORT"] ?? 8080);
const baseURL = process.env["E2E_BASE_URL"] ?? `http://127.0.0.1:${port}`;
// Each run writes to its own folder, so a later run (or a rerun of one test) never deletes an
// earlier run's traces, screenshots and errors. Set once here and inherited by the workers.
process.env["E2E_RUN_ID"] ??= new Date().toISOString().replace(/[:.]/g, "-");
const runId = process.env["E2E_RUN_ID"];

export default defineConfig({
  testDir: "e2e",
  // *.e2e.ts rather than *.spec.ts, so Vitest's default glob never picks these up.
  testMatch: "**/*.e2e.ts",
  outputDir: `test-results/${runId}`,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // The suite runs against the live Supabase project. With two workers (~900 API requests a
  // minute) the small instance stalled for up to 20 s (21/10/2026), so one worker until the
  // suite moves to a Supabase branch (build plan, Phase 6).
  workers: 1,
  // One retry everywhere: the live instance sometimes times out a request (e.g. HTTP 500 from
  // v_benefit_realisation), and a test that passes on retry is then reported as "flaky" rather
  // than failed. "retain-on-failure" below still keeps the failed first attempt's trace,
  // screenshot and errors (in its own folder; the retry's folder ends in -retry1).
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: `playwright-report/${runId}` }]],
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
      url: `${baseURL}/login`,
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
  }),
});
