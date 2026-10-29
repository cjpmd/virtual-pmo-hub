// Work package 2.3. Opens the Stripe customer portal (seats, monthly/annual, card,
// invoices, cancel) for an organisation. Admin only. Secrets: STRIPE_SECRET_KEY, optional APP_URL.
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const APP_URL = (Deno.env.get("APP_URL") ?? "https://pmo.originoverthrow.com").replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Sign in again to manage billing." }, 401);

    const body = await req.json().catch(() => ({}));
    const organisationId = String(body.organisationId ?? "");
    if (!UUID.test(organisationId)) return json({ error: "Invalid request." }, 400);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: member } = await admin
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", organisationId)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (member?.role !== "admin") return json({ error: "Only organisation admins can manage billing." }, 403);

    const { data: sub } = await admin
      .from("organisation_subscriptions")
      .select("stripe_customer_id")
      .eq("organisation_id", organisationId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) return json({ error: "Subscribe first to manage billing.", code: "no_customer" }, 400);

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${APP_URL}/settings/subscription`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("create-portal-session", err);
    return json({ error: "Couldn't open billing. Please try again." }, 500);
  }
});
