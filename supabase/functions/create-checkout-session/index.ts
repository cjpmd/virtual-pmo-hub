// Work package 2.3. Starts a Stripe Checkout session for an organisation's ORMO PMO
// subscription. Admin only. Card only, GBP, VAT added by Stripe Tax, prices excl. VAT.
// Secrets: STRIPE_SECRET_KEY, optional APP_URL. SUPABASE_* are provided by the platform.
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
const LOOKUP_KEYS = { month: "ormo_seat_monthly", year: "ormo_seat_annual" } as const;
const LIVE_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The full Stripe error stays in the function logs; the browser gets a safe message and a code.
function failure(err: unknown) {
  if (err instanceof Stripe.errors.StripeError) {
    console.error("create-checkout-session: stripe", {
      type: err.type,
      code: err.code,
      param: err.param,
      message: err.message,
      requestId: err.requestId,
    });
    if (err instanceof Stripe.errors.StripeAuthenticationError || err instanceof Stripe.errors.StripePermissionError) {
      return json({ error: "Billing is not available right now. Please contact support.", code: "billing_unavailable" }, 502);
    }
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      return json({ error: "Billing is not set up correctly yet. Please contact support.", code: "billing_misconfigured" }, 502);
    }
    if (err instanceof Stripe.errors.StripeRateLimitError || err instanceof Stripe.errors.StripeConnectionError || err instanceof Stripe.errors.StripeAPIError) {
      return json({ error: "Stripe didn't respond. Please try again in a minute.", code: "stripe_unavailable" }, 503);
    }
    return json({ error: "Couldn't start checkout. Please try again.", code: "stripe_error" }, 502);
  }
  console.error("create-checkout-session", err);
  return json({ error: "Couldn't start checkout. Please try again.", code: "checkout_failed" }, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Sign in again to manage billing." }, 401);

    const body = await req.json().catch(() => ({}));
    const organisationId = String(body.organisationId ?? "");
    const interval = body.interval === "year" ? "year" : body.interval === "month" ? "month" : null;
    if (!UUID.test(organisationId) || !interval) return json({ error: "Invalid request." }, 400);

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

    // Seats in use (work package 2.1): paid members, including viewers with a paid workspace
    // role, plus pending paid invitations. Checkout can't go below it.
    const [{ data: org }, { data: sub }, { data: usage }] = await Promise.all([
      admin.from("organisations").select("name, is_demo").eq("id", organisationId).single(),
      admin
        .from("organisation_subscriptions")
        .select("plan, status, stripe_customer_id, stripe_subscription_id, trial_ends_at")
        .eq("organisation_id", organisationId)
        .maybeSingle(),
      userClient.rpc("get_seat_usage", { p_organisation_id: organisationId }),
    ]);
    if (!org) return json({ error: "Organisation not found." }, 404);
    if (org.is_demo || sub?.plan === "demo") return json({ error: "The demo organisation can't be subscribed." }, 400);
    if (sub?.stripe_subscription_id && LIVE_STATUSES.includes(sub.status ?? "")) {
      return json({ error: "This organisation already has a subscription. Use Manage billing instead.", code: "already_subscribed" }, 409);
    }

    const minSeats = Math.max(1, Number(usage?.used ?? 0));
    const requested = Number.isInteger(body.seats) ? Number(body.seats) : minSeats;
    const quantity = Math.min(5000, Math.max(minSeats, requested));

    const prices = await stripe.prices.list({ lookup_keys: [LOOKUP_KEYS[interval]], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price) {
      console.error("create-checkout-session: no active price for lookup key", LOOKUP_KEYS[interval]);
      return json({ error: "Billing is not configured yet. Please try again later.", code: "price_not_found" }, 500);
    }

    let customerId = sub?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { name: org.name, email: user.email ?? undefined, metadata: { organisation_id: organisationId } },
        { idempotencyKey: `customer-${organisationId}` },
      );
      customerId = customer.id;
      const write = sub
        ? admin.from("organisation_subscriptions").update({ stripe_customer_id: customerId }).eq("organisation_id", organisationId)
        : admin.from("organisation_subscriptions").insert({ organisation_id: organisationId, stripe_customer_id: customerId });
      const { error } = await write;
      if (error) throw error;
    }

    // Keep the rest of a free trial: billing starts when the trial would have ended
    // (Stripe needs a trial end at least 48 hours away). Only for first-time subscribers.
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: { organisation_id: organisationId },
    };
    const trialEnd = sub?.trial_ends_at ? Math.floor(new Date(sub.trial_ends_at).getTime() / 1000) : 0;
    if (!sub?.stripe_subscription_id && trialEnd > Math.floor(Date.now() / 1000) + 48 * 3600) {
      subscriptionData.trial_end = trialEnd;
    }

    // Managed Payments (Stripe as merchant of record) is on by default for the account and
    // refuses payment_method_types, automatic_tax, tax_id_collection and customer_update. ORMO
    // is the seller and accounts for VAT through Stripe Tax (D1), so switch it off per session.
    // stripe@16 has no type for managed_payments; the parameter is sent as given.
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      client_reference_id: organisationId,
      metadata: { organisation_id: organisationId },
      line_items: [
        { price: price.id, quantity, adjustable_quantity: { enabled: true, minimum: minSeats, maximum: 5000 } },
      ],
      payment_method_types: ["card"],
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      subscription_data: subscriptionData,
      success_url: `${APP_URL}/settings/subscription?checkout=success`,
      cancel_url: `${APP_URL}/settings/subscription?checkout=cancelled`,
    };
    const session = await stripe.checkout.sessions.create({
      ...params,
      managed_payments: { enabled: false },
    } as Stripe.Checkout.SessionCreateParams);
    return json({ url: session.url });
  } catch (err) {
    return failure(err);
  }
});
