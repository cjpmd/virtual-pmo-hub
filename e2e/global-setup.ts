// Signs in the dedicated test user once and saves the browser storage state for every spec.
// The /signin password form only serves the demo account, so this signs in through the
// Supabase auth API and hands the session to the app's own localStorage key.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

export const STORAGE_STATE = "e2e/.auth/user.json";

const required = (name: string) => {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set. Add it to .env.local (see playwright.config.ts).`);
  return value;
};

export default async function globalSetup(config: FullConfig) {
  const email = required("E2E_EMAIL");
  const password = required("E2E_PASSWORD");
  const url = required("VITE_SUPABASE_URL");
  const key = required("VITE_SUPABASE_PUBLISHABLE_KEY");
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("No baseURL in playwright.config.ts.");

  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok)
    throw new Error(`Test user sign-in failed (${response.status}): ${await response.text()}`);
  const session = (await response.json()) as Record<string, unknown> & {
    access_token: string;
    expires_in: number;
    expires_at?: number;
  };
  session.expires_at ??= Math.floor(Date.now() / 1000) + session.expires_in;

  const memberships = await fetch(
    `${url}/rest/v1/organisation_members?select=role,organisations!inner(name,is_demo)`,
    { headers: { apikey: key, Authorization: `Bearer ${session.access_token}` } },
  );
  const rows = (await memberships.json()) as { organisations: { is_demo: boolean } }[];
  if (!Array.isArray(rows) || !rows.some((row) => row.organisations.is_demo))
    throw new Error(
      `${email} is not a member of the demo organisation. See docs/sql/0-1-e2e-user.sql.`,
    );

  // supabase-js keeps the session under sb-<project ref>-auth-token.
  const storageKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/signin");
  await page.evaluate(([name, value]) => localStorage.setItem(name, value), [
    storageKey,
    JSON.stringify(session),
  ] as const);
  await page.goto("/home");
  await page.getByRole("button", { name: "Toggle theme" }).waitFor({ timeout: 60_000 });
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();
}
