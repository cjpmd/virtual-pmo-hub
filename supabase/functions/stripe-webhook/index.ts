// Work package 2.3. Stripe webhook: keeps organisation_subscriptions in step with Stripe.
// verify_jwt is off; every request is checked against the Stripe signature instead.
// Idempotent on event id (public.stripe_webhook_events). Always re-reads the subscription
// from Stripe, so out-of-order events can't leave stale data.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET; RESEND_API_KEY, RESEND_FROM, APP_URL for the
// GL-6 payment-failed email.
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
// Shared client: the API version is pinned there (see the note before upgrading).
import { RESTORE_KEYS, priceId, scheduleNextPhase, stripe } from "../_shared/billing.ts";
import { sendBillingNotices } from "../_shared/billing-notices.ts";
import { sendEmail } from "../_shared/email.ts";
import { resolveSubscriptionOrganisation } from "../_shared/stripe-org.ts";
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const ENDED = ["canceled", "incomplete_expired"];
const APP_URL = (Deno.env.get("APP_URL") ?? "https://pmo.originoverthrow.com").replace(/\/$/, "");

const NO_SCHEDULED_CHANGE = {
  stripe_schedule_id: null,
  scheduled_seats: null,
  scheduled_price_id: null,
  scheduled_interval: null,
  scheduled_change_at: null,
};

// Work package 2.1: the change waiting for the next renewal (seat reduction and/or monthly <->
// annual switch), read from the subscription's attached schedule. No schedule, or no later phase,
// means nothing is scheduled.
async function scheduledChange(sub: Stripe.Subscription, periodEndUnix: number | undefined) {
  const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  if (!scheduleId || ENDED.includes(sub.status)) return NO_SCHEDULED_CHANGE;
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId, { expand: ["phases.items.price"] });
  if (!["active", "not_started"].includes(schedule.status)) return NO_SCHEDULED_CHANGE;
  const next = schedule.phases.find((phase) => phase.start_date >= (periodEndUnix ?? 0));
  const nextItem = next?.items[0];
  if (!next || !nextItem) return { ...NO_SCHEDULED_CHANGE, stripe_schedule_id: scheduleId };
  const price =
    typeof nextItem.price === "string" ? await stripe.prices.retrieve(nextItem.price) : (nextItem.price as Stripe.Price);
  const recurring = price.recurring;
  const yearly = recurring?.interval === "year" || (recurring?.interval === "month" && recurring.interval_count === 12);
  return {
    stripe_schedule_id: scheduleId,
    scheduled_seats: nextItem.quantity ?? null,
    scheduled_price_id: price.id,
    scheduled_interval: yearly ? "year" : "month",
    scheduled_change_at: new Date(next.start_date * 1000).toISOString(),
  };
}

// Work package 2.1: after add_seats needed 3D Secure, manage-subscription left the schedule
// released and saved the earlier pending change on the proration invoice's metadata. When the
// seats are applied (paid), put back a pending plan switch at the new seat count (a pending
// reduction is dropped, as when no authentication is needed). When the pending update expires
// (Stripe voids the invoice), put back the earlier schedule exactly. Once only per invoice.
async function restoreAfterPendingUpdate(subscriptionId: string, applied: boolean) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
  const invoice = sub.latest_invoice as Stripe.Invoice | null;
  const price = invoice?.metadata?.[RESTORE_KEYS.price];
  const quantity = Number(invoice?.metadata?.[RESTORE_KEYS.quantity]);
  const organisationId = invoice?.metadata?.organisation_id ?? sub.metadata?.organisation_id;
  if (!invoice || !price || !Number.isInteger(quantity) || !organisationId) return;
  if (invoice.metadata?.[RESTORE_KEYS.done] || sub.schedule || ENDED.includes(sub.status)) return;
  const current = sub.items.data[0];
  if (applied && price !== priceId(current.price)) {
    await scheduleNextPhase(sub, price, current.quantity ?? 1, organisationId);
  } else if (!applied) {
    await scheduleNextPhase(sub, price, quantity, organisationId);
  }
  // Best effort: a voided invoice may refuse the update. The sub.schedule check above already
  // stops a second restore, so a failure here mustn't make Stripe retry the event forever.
  await stripe.invoices
    .update(invoice.id, { metadata: { [RESTORE_KEYS.done]: "1" } })
    .catch((err) => console.warn("stripe-webhook: mark restore done", invoice.id, (err as Error).message));
}

async function syncSubscription(subscriptionId: string) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["customer"] });
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const customer =
    typeof sub.customer !== "string" && !("deleted" in sub.customer && sub.customer.deleted)
      ? (sub.customer as Stripe.Customer)
      : null;

  // GL-10 follow-up: the stored customer mapping wins; metadata is used only when there is none,
  // and a disagreement is logged and skipped (see _shared/stripe-org.ts).
  const { data: mappedRows, error: mappingError } = await admin
    .from("organisation_subscriptions")
    .select("organisation_id")
    .eq("stripe_customer_id", customerId);
  if (mappingError) throw mappingError; // Stripe retries; never fall back to metadata on an error
  const resolution = resolveSubscriptionOrganisation(
    (mappedRows ?? []).map((row: { organisation_id: string }) => row.organisation_id),
    sub.metadata?.organisation_id || customer?.metadata?.organisation_id || null,
  );
  if (resolution.organisationId === null) {
    if (resolution.reason === "no_organisation") {
      console.warn("stripe-webhook: no organisation for subscription", sub.id);
    } else {
      console.error("stripe-webhook: organisation mismatch, subscription not written", {
        subscription: sub.id,
        customer: customerId,
        ...resolution,
      });
    }
    return;
  }
  const organisationId = resolution.organisationId;

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
    ...(await scheduledChange(sub, periodEndUnix)),
  };
  const { error } = await admin.from("organisation_subscriptions").upsert(row, { onConflict: "organisation_id" });
  if (error) throw error;
}

// GL-6: one "payment failed" email per renewal invoice to the organisation's admins (Stripe's own
// failed-payment email is switched off in the dashboard). Queued once per invoice (unique key),
// then sent straight away; a send failure is left for the daily 08:00 run and never makes Stripe
// retry the event. First-invoice failures (checkout) and seat-change invoices aren't renewals.
async function paymentFailedNotice(subscriptionId: string, invoice: Stripe.Invoice) {
  const { data: row } = await admin
    .from("organisation_subscriptions")
    .select("organisation_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (!row?.organisation_id) return;
  const { error } = await admin.from("billing_notices").upsert(
    {
      organisation_id: row.organisation_id,
      kind: "payment_failed",
      period_key: invoice.id,
      details: {
        invoice_id: invoice.id,
        amount_due: invoice.amount_due,
        currency: invoice.currency,
        attempt_count: invoice.attempt_count,
      },
    },
    { onConflict: "organisation_id,kind,period_key", ignoreDuplicates: true },
  );
  if (error) throw error;
  try {
    const configured = Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM"));
    const result = await sendBillingNotices(
      { rpc: (fn, args) => admin.rpc(fn, args) },
      APP_URL,
      configured ? sendEmail : null,
      { organisationId: row.organisation_id },
    );
    console.log("stripe-webhook: billing notices", result);
  } catch (err) {
    console.error("stripe-webhook: billing notices", (err as Error).message);
  }
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
      // Work package 2.1: seat reductions and plan switches at renewal live on a schedule.
      // Re-read the whole subscription so the row always matches Stripe, whatever the order.
      case "subscription_schedule.created":
      case "subscription_schedule.updated":
      case "subscription_schedule.released":
      case "subscription_schedule.completed":
      case "subscription_schedule.canceled":
      case "subscription_schedule.aborted": {
        const schedule = event.data.object as Stripe.SubscriptionSchedule;
        const subId =
          (typeof schedule.subscription === "string" ? schedule.subscription : schedule.subscription?.id) ??
          schedule.released_subscription;
        if (subId) await syncSubscription(subId);
        break;
      }
      case "customer.subscription.pending_update_applied":
      case "customer.subscription.pending_update_expired": {
        const sub = event.data.object as Stripe.Subscription;
        await restoreAfterPendingUpdate(sub.id, event.type === "customer.subscription.pending_update_applied");
        await syncSubscription(sub.id);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (subId) await syncSubscription(subId);
        if (subId && event.type === "invoice.payment_failed" && invoice.billing_reason === "subscription_cycle") {
          await paymentFailedNotice(subId, invoice);
        }
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
