// Stripe billing (work package 2.3). The edge functions create-checkout-session and
// create-portal-session check that the caller is an organisation admin, talk to Stripe and
// return { url } (or { error, code }); the stripe-webhook function writes the result back to
// organisation_subscriptions. Prices are excl. VAT; Stripe Tax adds VAT at checkout.
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "./functions";
import { ServiceError, unwrap, unwrapMaybe } from "./service-error";

export type BillingInterval = "month" | "year";

/** GBP per paid seat, excl. VAT (D1). Annual is ten times monthly. */
export const SEAT_PRICE_GBP: Record<BillingInterval, number> = { month: 10, year: 100 };

/** Stripe statuses create-checkout-session treats as a subscription that still exists. */
const LIVE_STATUSES = ["active", "trialing", "past_due", "unpaid", "incomplete"];

export const hasLiveSubscription = (status: string): boolean => LIVE_STATUSES.includes(status);

export const billingTotal = (interval: BillingInterval, seats: number): number =>
  SEAT_PRICE_GBP[interval] * Math.max(0, Math.floor(seats));

/** Whole days left in the free trial (rounded up), 0 once it has ended, null without one. */
export function trialDaysLeft(trialEndsAt: string, now = Date.now()): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - now;
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Whether checkout keeps the rest of the trial. Stripe needs a trial end at least 48 hours away,
 * so with less left the function starts billing straight away.
 */
export function keepsTrialDays(trialEndsAt: string, now = Date.now()): boolean {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() - now > 2 * 86_400_000;
}

/** Calls a billing function and returns its url, or throws with the function's own message. */
async function invokeForUrl(
  name: "create-checkout-session" | "create-portal-session",
  body: Record<string, unknown>,
  fallback: string,
): Promise<string> {
  const data = await invokeFunction<{ url?: string }>(name, body, fallback);
  if (!data.url) throw new ServiceError("unknown", fallback);
  return data.url;
}

export const checkoutUrl = (orgId: string, interval: BillingInterval, seats: number) =>
  invokeForUrl(
    "create-checkout-session",
    { organisationId: orgId, interval, seats },
    "Couldn't start checkout.",
  );

export const billingPortalUrl = (orgId: string) =>
  invokeForUrl("create-portal-session", { organisationId: orgId }, "Couldn't open billing.");

/** Sends the browser to Stripe Checkout. Stripe returns to /settings/subscription?checkout=… */
export async function startCheckout(orgId: string, interval: BillingInterval, seats: number) {
  window.location.assign(await checkoutUrl(orgId, interval, seats));
}

/** Sends the browser to the Stripe customer portal, which returns to /settings/subscription. */
export async function openBillingPortal(orgId: string) {
  window.location.assign(await billingPortalUrl(orgId));
}

// GL-5: the trial, payment and read-only banner in the app shell.

/**
 * Whether the organisation accepts writes, as the database decides it
 * (public.organisation_writable → private.organisation_is_writable). Any member may ask.
 */
export const getOrgWritable = async (orgId: string): Promise<boolean> =>
  unwrap(
    await supabase.rpc("organisation_writable", { p_organisation_id: orgId }),
    "Checking the organisation's subscription",
  );

export interface SubscriptionStatus {
  plan: string;
  status: string;
  trialEndsAt: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

/** The subscription row for the banner. RLS shows it to organisation admins only (else null). */
export async function getSubscriptionStatus(orgId: string): Promise<SubscriptionStatus | null> {
  const row = unwrapMaybe(
    await supabase
      .from("organisation_subscriptions")
      .select("plan, status, trial_ends_at, current_period_end, cancel_at_period_end")
      .eq("organisation_id", orgId)
      .maybeSingle(),
    "Loading the subscription",
  );
  return row
    ? {
        plan: row.plan ?? "",
        status: row.status ?? "",
        trialEndsAt: row.trial_ends_at ?? "",
        currentPeriodEnd: row.current_period_end ?? "",
        cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
      }
    : null;
}

/**
 * Days a past_due subscription keeps write access after its period end. Mirrors the 14 days in
 * private.organisation_is_writable; used only to show the "update your card by" date (the
 * database alone decides whether writes are allowed).
 */
export const PAST_DUE_GRACE_DAYS = 14;

/** A trial with this many days or fewer left gets the stronger banner. */
export const TRIAL_URGENT_DAYS = 3;

export type AccessBanner =
  | { kind: "read_only"; isAdmin: boolean }
  | { kind: "past_due"; payBy: string }
  | { kind: "cancelling"; endsOn: string }
  | { kind: "trial"; daysLeft: number; urgent: boolean };

export interface AccessBannerInput {
  isDemo: boolean;
  isAdmin: boolean;
  /** From getOrgWritable. */
  writable: boolean;
  /** From getSubscriptionStatus (admins only; null for everyone else). */
  subscription: SubscriptionStatus | null;
  now?: number;
}

/**
 * Which banner the shell shows, in priority order: read-only (everyone), then for admins a
 * failed payment inside the grace period, a subscription set to cancel, and a running trial.
 * Nothing for the demo organisation or a healthy subscription.
 */
export function accessBanner({
  isDemo,
  isAdmin,
  writable,
  subscription: sub,
  now = Date.now(),
}: AccessBannerInput): AccessBanner | null {
  if (isDemo) return null;
  if (!writable) return { kind: "read_only", isAdmin };
  if (!isAdmin || !sub || sub.plan === "demo") return null;
  if (sub.status === "past_due" && sub.currentPeriodEnd) {
    const end = new Date(sub.currentPeriodEnd).getTime();
    if (!Number.isNaN(end))
      return {
        kind: "past_due",
        payBy: new Date(end + PAST_DUE_GRACE_DAYS * 86_400_000).toISOString(),
      };
  }
  if (
    (sub.status === "active" || sub.status === "trialing") &&
    sub.cancelAtPeriodEnd &&
    sub.currentPeriodEnd
  )
    return { kind: "cancelling", endsOn: sub.currentPeriodEnd };
  if (["active", "trialing", "past_due"].includes(sub.status)) return null;
  const daysLeft = trialDaysLeft(sub.trialEndsAt, now);
  if (daysLeft === null || daysLeft <= 0) return null;
  return { kind: "trial", daysLeft, urgent: daysLeft <= TRIAL_URGENT_DAYS };
}
