// Work package 2.1. In-app seat and plan changes for an organisation's Stripe subscription.
// Admin only. Actions:
//   preview                   { seats }            cost of adding seats now, or the date a reduction applies
//   add_seats                 { seats, prorationDate }  charge the prorated difference now; applied only if paid
//   schedule_reduction        { seats }            fewer seats from the next renewal (never below seats in use)
//   schedule_interval_switch  { interval }         monthly <-> annual from the next renewal
//   cancel_scheduled_change   {}                   release the schedule; the subscription stays as it is
// Changes at renewal use one subscription schedule: phase 1 = now to the period end as today,
// phase 2 = the new price and quantity for one period, then the subscription is released. The
// customer portal can't update or cancel a subscription while a schedule is attached, so plan
// switching lives here. Stripe's webhook stays the source of truth for organisation_subscriptions.
// Secrets: STRIPE_SECRET_KEY. SUPABASE_* are provided by the platform.
import Stripe from "npm:stripe@16.12.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { UUID, adminClient, json, serve, signedIn } from "../_shared/http.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const LOOKUP_KEYS = { month: "ormo_seat_monthly", year: "ormo_seat_annual" } as const;
const CHANGEABLE = ["active", "trialing"];
const PREVIEW_MAX_AGE_S = 600;
const MAX_SEATS = 5000;

type Context = {
  organisationId: string;
  userId: string;
  client: SupabaseClient;
  sub: Stripe.Subscription;
  item: Stripe.SubscriptionItem;
  seatsUsed: number;
};

type Pending = { scheduleId: string; price: string; quantity: number; startsAt: number };

const priceId = (price: string | Stripe.Price | Stripe.DeletedPrice) => (typeof price === "string" ? price : price.id);
const now = () => Math.floor(Date.now() / 1000);
const iso = (unix: number) => new Date(unix * 1000).toISOString();

function stripeFailure(err: unknown) {
  if (err instanceof Stripe.errors.StripeError) {
    console.error("manage-subscription: stripe", {
      type: err.type,
      code: err.code,
      param: err.param,
      message: err.message,
      requestId: err.requestId,
    });
    if (err instanceof Stripe.errors.StripeCardError) {
      return json({ error: "Your card was declined. Update it in Manage billing and try again.", code: "payment_failed" }, 402);
    }
    if (err instanceof Stripe.errors.StripeRateLimitError || err instanceof Stripe.errors.StripeConnectionError || err instanceof Stripe.errors.StripeAPIError) {
      return json({ error: "Stripe didn't respond. Please try again in a minute.", code: "stripe_unavailable" }, 503);
    }
    return json({ error: "Billing couldn't make that change. Please try again or contact support.", code: "stripe_error" }, 502);
  }
  throw err;
}

/** The signed-in admin, the live subscription and its single seat item, and the seats in use. */
async function load(req: Request, body: Record<string, unknown>): Promise<Context | Response> {
  const caller = await signedIn(req);
  if (!caller) return json({ error: "Sign in again to manage billing." }, 401);
  const organisationId = String(body.organisationId ?? "");
  if (!UUID.test(organisationId)) return json({ error: "Invalid request." }, 400);

  const admin = adminClient();
  const { data: member } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("profile_id", caller.user.id)
    .maybeSingle();
  if (member?.role !== "admin") return json({ error: "Only organisation admins can manage billing." }, 403);

  const { data: row } = await admin
    .from("organisation_subscriptions")
    .select("plan, stripe_subscription_id")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (row?.plan === "demo") return json({ error: "The demo organisation can't be subscribed." }, 400);
  if (!row?.stripe_subscription_id) {
    return json({ error: "Subscribe first. During the free trial you have 10 seats.", code: "no_subscription" }, 400);
  }

  const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  if (!CHANGEABLE.includes(sub.status)) {
    return json({ error: "Seats and plan can only change on an active subscription. Check Manage billing.", code: "subscription_not_active" }, 409);
  }
  if (sub.cancel_at_period_end || sub.cancel_at) {
    return json({ error: "Your subscription is set to cancel. Resume it in Manage billing first.", code: "subscription_cancelling" }, 409);
  }
  const item = sub.items.data[0];
  if (!item) return json({ error: "This subscription has no seat item.", code: "billing_misconfigured" }, 500);

  const { data: usage, error } = await caller.client.rpc("get_seat_usage", { p_organisation_id: organisationId });
  if (error || !usage) {
    console.error("manage-subscription: get_seat_usage", error);
    return json({ error: "Couldn't check seats in use. Please try again." }, 500);
  }
  return { organisationId, userId: caller.user.id, client: caller.client, sub, item, seatsUsed: Number(usage.used) };
}

/** The change waiting for the next renewal, if a schedule is attached. */
async function pendingChange(sub: Stripe.Subscription): Promise<Pending | null> {
  const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  if (!scheduleId) return null;
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const next = schedule.phases.find((phase) => phase.start_date >= sub.current_period_end);
  const nextItem = next?.items[0];
  if (!next || !nextItem) return { scheduleId, price: priceId(sub.items.data[0].price), quantity: sub.items.data[0].quantity ?? 1, startsAt: sub.current_period_end };
  return { scheduleId, price: priceId(nextItem.price), quantity: nextItem.quantity ?? 1, startsAt: next.start_date };
}

/** Attaches (or rewrites) the schedule so the next renewal uses this price and quantity. */
async function scheduleNextPhase(ctx: Context, price: string, quantity: number) {
  const { sub, item } = ctx;
  const existing = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  const schedule = existing
    ? await stripe.subscriptionSchedules.retrieve(existing)
    : await stripe.subscriptionSchedules.create({ from_subscription: sub.id });
  const currentStart = schedule.current_phase?.start_date ?? schedule.phases[0]?.start_date ?? sub.current_period_start;
  try {
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      metadata: { organisation_id: ctx.organisationId },
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

async function priceFor(interval: "month" | "year") {
  const prices = await stripe.prices.list({ lookup_keys: [LOOKUP_KEYS[interval]], active: true, limit: 1 });
  return prices.data[0] ?? null;
}

const intervalOf = (price: Stripe.Price) =>
  price.recurring?.interval === "year" || (price.recurring?.interval === "month" && price.recurring.interval_count === 12)
    ? "year"
    : "month";

async function audit(ctx: Context, action: string, detail: Record<string, unknown>) {
  const { error } = await ctx.client.rpc("record_billing_request", {
    p_organisation_id: ctx.organisationId,
    p_action: action,
    p_detail: detail,
  });
  if (error) console.error("manage-subscription: record_billing_request", error);
}

const seatsFrom = (value: unknown) => (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_SEATS ? Number(value) : null);

serve("manage-subscription", async (req) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const loaded = await load(req, body).catch(stripeFailure);
  if (loaded instanceof Response) return loaded;
  const ctx = loaded;
  const { sub, item } = ctx;
  const current = item.quantity ?? 1;

  try {
    switch (body.action) {
      case "preview": {
        const seats = seatsFrom(body.seats);
        if (!seats || seats === current) return json({ error: "Choose a different number of seats." }, 400);
        const pending = await pendingChange(sub);
        if (seats < current) {
          if (seats < ctx.seatsUsed) {
            return json({ error: `You're using ${ctx.seatsUsed} seats. Remove members or make them viewers first.`, code: "below_seats_in_use" }, 400);
          }
          return json({ direction: "decrease", currentSeats: current, newSeats: seats, effectiveAt: iso(sub.current_period_end) });
        }
        const prorationDate = now();
        const upcoming = await stripe.invoices.retrieveUpcoming({
          customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          subscription: sub.id,
          subscription_items: [{ id: item.id, quantity: seats }],
          subscription_proration_behavior: "always_invoice",
          subscription_proration_date: prorationDate,
        });
        const lines = upcoming.lines.data.filter((line) => line.proration);
        const amount = lines.reduce((sum, line) => sum + line.amount, 0);
        const vat = lines.reduce((sum, line) => sum + (line.tax_amounts ?? []).reduce((t, tax) => t + tax.amount, 0), 0);
        return json({
          direction: "increase",
          currentSeats: current,
          newSeats: seats,
          prorationDate,
          currency: upcoming.currency,
          amountExclVat: amount,
          vat,
          totalNow: amount + vat,
          trialing: sub.status === "trialing",
          dropsScheduledReduction: Boolean(pending && pending.quantity < current),
        });
      }

      case "add_seats": {
        const seats = seatsFrom(body.seats);
        const prorationDate = Number(body.prorationDate);
        if (!seats || seats <= current) return json({ error: "Choose more seats than you have now." }, 400);
        if (!Number.isInteger(prorationDate) || prorationDate > now() || now() - prorationDate > PREVIEW_MAX_AGE_S) {
          return json({ error: "The price shown has expired. Check the cost again before confirming.", code: "preview_expired" }, 409);
        }
        const pending = await pendingChange(sub);
        // A schedule's next phase would overwrite the new quantity at renewal, so release it first.
        // A pending interval switch is put back afterwards at the new seat count; a pending
        // reduction is dropped (the admin now wants more seats, not fewer).
        if (pending) await stripe.subscriptionSchedules.release(pending.scheduleId);
        const updated = await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, quantity: seats }],
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
          payment_behavior: "pending_if_incomplete",
        });
        const switchPending = pending && pending.price !== priceId(item.price);
        if (updated.pending_update) {
          // Payment didn't go through: nothing changed. Put the earlier schedule back as it was.
          if (pending) await scheduleNextPhase({ ...ctx, sub: updated }, pending.price, pending.quantity);
          return json({ error: "The payment didn't go through, so no seats were added. Update your card in Manage billing and try again.", code: "payment_failed" }, 402);
        }
        if (switchPending) await scheduleNextPhase({ ...ctx, sub: updated, item: updated.items.data[0] }, pending.price, seats);
        await audit(ctx, "billing.seats_added", {
          from: current,
          to: seats,
          dropped_scheduled_reduction: Boolean(pending && pending.quantity < current),
        });
        return json({ seats, applied: true });
      }

      case "schedule_reduction": {
        const seats = seatsFrom(body.seats);
        if (!seats || seats >= current) return json({ error: "Choose fewer seats than you have now." }, 400);
        if (seats < ctx.seatsUsed) {
          return json({ error: `You're using ${ctx.seatsUsed} seats. Remove members or make them viewers first.`, code: "below_seats_in_use" }, 400);
        }
        const pending = await pendingChange(sub);
        await scheduleNextPhase(ctx, pending?.price ?? priceId(item.price), seats);
        await audit(ctx, "billing.seat_reduction_scheduled", { from: current, to: seats, at: iso(sub.current_period_end) });
        return json({ seats, effectiveAt: iso(sub.current_period_end) });
      }

      case "schedule_interval_switch": {
        const interval = body.interval === "year" || body.interval === "month" ? body.interval : null;
        if (!interval) return json({ error: "Invalid request." }, 400);
        const target = await priceFor(interval);
        if (!target) {
          console.error("manage-subscription: no active price for", LOOKUP_KEYS[interval]);
          return json({ error: "Billing is not configured yet. Please try again later.", code: "price_not_found" }, 500);
        }
        const pending = await pendingChange(sub);
        const quantity = pending?.quantity ?? current;
        if (target.id === priceId(item.price)) {
          // Back to the current plan: keep only a pending reduction, if there is one.
          if (!pending || pending.price === target.id) return json({ error: `You're already billed ${interval === "year" ? "annually" : "monthly"}.` }, 400);
          if (quantity < current) await scheduleNextPhase(ctx, target.id, quantity);
          else await stripe.subscriptionSchedules.release(pending.scheduleId);
        } else {
          await scheduleNextPhase(ctx, target.id, quantity);
        }
        await audit(ctx, "billing.interval_switch_scheduled", {
          from: intervalOf(item.price),
          to: interval,
          seats: quantity,
          at: iso(sub.current_period_end),
        });
        return json({ interval, effectiveAt: iso(sub.current_period_end) });
      }

      case "cancel_scheduled_change": {
        const pending = await pendingChange(sub);
        if (!pending) return json({ error: "There's no scheduled change to cancel." }, 400);
        await stripe.subscriptionSchedules.release(pending.scheduleId);
        await audit(ctx, "billing.scheduled_change_cancelled", { seats: pending.quantity, price: pending.price });
        return json({ cancelled: true });
      }

      default:
        return json({ error: "Invalid request." }, 400);
    }
  } catch (err) {
    return stripeFailure(err);
  }
});
