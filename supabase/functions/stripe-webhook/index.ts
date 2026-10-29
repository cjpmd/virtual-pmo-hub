// Work package 2.3. Stripe webhook: keeps organisation_subscriptions in step with Stripe.
// verify_jwt is off; every request is checked against the Stripe signature instead.
// Idempotent on event id (public.stripe_webhook_events). Always re-reads the subscription
// from Stripe, so out-of-order events can't leave stale data.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const ENDED = ["canceled", "incomplete_expired"];

async function syncSubscription(subscriptionId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["customer"] });
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const customer =
    typeof sub.customer !== "string" && !("deleted" in sub.customer && sub.customer.deleted)
      ? (sub.customer as Stripe.Customer)
      : null;

  let organisationId: string | null = sub.metadata?.organisation_id || customer?.metadata?.organisation_id || null;
  if (!organisationId) {
    const { data } = await admin
      .from("organisation_subscriptions")
      .select("organisation_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    organisationId = data?.organisation_id ?? null;
  }
  if (!organisationId) {
    console.warn("stripe-webhook: no organisation for subscription", sub.id);
    return;
  }

  const { data: existing } = await admin
    .from("organisation_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  // An old subscription ending must not overwrite a newer live one.
  if (
    existing?.stripe_subscription_id &&
    existing.stripe_subscription_id !== sub.id &&
    ENDED.includes(sub.status) &&
    !ENDED.includes(existing.status ?? "")
  ) return;

  const item = sub.items.data[0];
  const recurring = item?.price.recurring;
  const yearly = recurring?.interval === "year" || (recurring?.interval === "month" && recurring.interval_count === 12);
  // current_period_end moved to the subscription item in newer API versions; read either.
  // deno-lint-ignore no-explicit-any
  const periodEndUnix: number | undefined = (sub as any).current_period_end ?? (item as any)?.current_period_end;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;

  const row = {
    organisation_id: organisationId,
    plan: yearly ? "annual" : "monthly",
    status: sub.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    price_id: item?.price.id ?? null,
    billing_interval: yearly ? "year" : "month",
    seats_total: item?.quantity ?? 0,
    current_period_end: periodEnd,
    renewal_date: periodEnd ? periodEnd.slice(0, 10) : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    ...(customer?.email ? { billing_contact: customer.email } : {}),
  };
  const { error } = await admin.from("organisation_subscriptions").upsert(row, { onConflict: "organisation_id" });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature ?? "",
      Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.warn("stripe-webhook: bad signature", (err as Error).message);
    return new Response("Invalid signature", { status: 400 });
  }

  const { error: insertError } = await admin.from("stripe_webhook_events").insert({ id: event.id, type: event.type });
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("stripe-webhook: log insert", insertError);
      return new Response("Storage error", { status: 500 });
    }
    const { data: seen } = await admin.from("stripe_webhook_events").select("processed_at").eq("id", event.id).maybeSingle();
    if (seen?.processed_at) return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          await syncSubscription(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscription((event.data.object as Stripe.Subscription).id);
        break;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subId) await syncSubscription(subId);
        break;
      }
      default:
        break;
    }
    await admin.from("stripe_webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("stripe-webhook: handling", event.type, err);
    await admin
      .from("stripe_webhook_events")
      .update({ error: String((err as Error)?.message ?? err).slice(0, 500) })
      .eq("id", event.id);
    return new Response("Handler error", { status: 500 }); // Stripe retries
  }
});
