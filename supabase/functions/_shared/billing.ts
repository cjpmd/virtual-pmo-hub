// Shared Stripe client and subscription-schedule helper for manage-subscription and stripe-webhook.
import Stripe from "npm:stripe@16.12.0";

// Keep the API version pinned at 2024-06-20. Newer versions change things this code relies on:
//   * create-checkout-session sends payment_method_types (dropped in newer versions);
//   * manage-subscription previews prorations with invoices.retrieveUpcoming (replaced by
//     invoices.createPreview), reads invoice.payment_intent for SCA (moved to invoice payments),
//     and reads subscription.current_period_start / current_period_end (moved to the
//     subscription items);
//   * stripe-webhook reads current_period_end (it already falls back to the item).
// Upgrade all of these together, and test with test clocks, before changing the version.
export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

export const priceId = (price: string | Stripe.Price | Stripe.DeletedPrice) => (typeof price === "string" ? price : price.id);

/** Invoice metadata keys that tell stripe-webhook what schedule to put back after an SCA payment. */
export const RESTORE_KEYS = {
  price: "ormo_restore_price",
  quantity: "ormo_restore_quantity",
  done: "ormo_restore_done",
} as const;

/**
 * Attaches (or rewrites) the subscription's schedule so the next renewal uses this price and
 * quantity: phase 1 = now to the period end as today, phase 2 = the new price and quantity for
 * one period, then the subscription is released from the schedule. VAT (Stripe Tax) stays on.
 */
export async function scheduleNextPhase(sub: Stripe.Subscription, price: string, quantity: number, organisationId: string) {
  const item = sub.items.data[0];
  const existing = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  const schedule = existing
    ? await stripe.subscriptionSchedules.retrieve(existing)
    : await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
  const currentStart = schedule.current_phase?.start_date ?? schedule.phases[0]?.start_date ?? sub.current_period_start;
  try {
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      metadata: { organisation_id: organisationId },
      phases: [
        {
          items: [{ price: priceId(item.price), quantity: item.quantity ?? 1 }],
          start_date: currentStart,
          end_date: sub.current_period_end,
          automatic_tax: { enabled: true },
          proration_behavior: "none",
          ...(sub.status === "trialing" && sub.trial_end ? { trial_end: sub.trial_end } : {}),
        },
        {
          items: [{ price, quantity }],
          iterations: 1,
          automatic_tax: { enabled: true },
          proration_behavior: "none",
        },
      ],
    });
  } catch (err) {
    // Don't leave a fresh schedule attached (it would block the portal) if the update failed.
    if (!existing) await stripe.subscriptionSchedules.release(schedule.id).catch(() => undefined);
    throw err;
  }
}
