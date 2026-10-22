// The Supabase REST API as the signed-in test user (its session from global setup), for specs
// that read state before a test and restore it afterwards.
import { readFileSync } from "node:fs";

function session() {
  const state = JSON.parse(readFileSync("e2e/.auth/user.json", "utf8")) as {
    origins: { localStorage: { name: string; value: string }[] }[];
  };
  const entry = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name.endsWith("-auth-token"));
  if (!entry) throw new Error("No session in e2e/.auth/user.json");
  return JSON.parse(entry.value) as { access_token: string; user: { id: string } };
}

/** Calls /rest/v1/<path> as the test user; returns the parsed JSON body (or null). */
export async function rest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const url = process.env["VITE_SUPABASE_URL"]!;
  const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${session().access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!response.ok)
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
