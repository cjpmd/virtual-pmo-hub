// Shared request helpers for the 2.1 edge functions: CORS, JSON responses, the signed-in user,
// Supabase clients, and turning database errors (RPC raise ... using hint = '<code>') into
// responses the app can show.
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.45.4";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const APP_URL = (Deno.env.get("APP_URL") ?? "https://pmo.originoverthrow.com").replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

/** Service-role client: bypasses RLS. Only for the service-role RPCs and server-side reads. */
export const adminClient = (): SupabaseClient =>
  createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

/** The caller and a client acting as them, so RPC permission checks and RLS apply. */
export async function signedIn(req: Request): Promise<{ user: User; client: SupabaseClient } | null> {
  const client = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const { data } = await client.auth.getUser();
  return data?.user ? { user: data.user, client } : null;
}

type DbError = { code?: string; message?: string; hint?: string | null };

/**
 * A database error as a response. The RPCs raise a readable message, with a machine code in the
 * hint (no_seats, rate_limited, invite_expired, ...); permission errors are 42501, not found P0002.
 */
export function dbErrorResponse(error: DbError, fallback: string) {
  const status =
    error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "P0001" || error.code === "22023" ? 400 : 500;
  if (status === 500) console.error("database error", error);
  return json({ error: status === 500 ? fallback : error.message ?? fallback, code: error.hint ?? error.code ?? "error" }, status);
}

/** Handles OPTIONS and non-POST, then runs the handler, turning anything unexpected into a 500. */
export function serve(name: string, handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      return await handler(req);
    } catch (err) {
      console.error(name, err);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  });
}
