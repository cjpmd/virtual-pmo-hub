// Stripe billing (work package 2.3). The edge functions create-checkout-session and
// create-portal-session check that the caller is an organisation admin, talk to Stripe and
// return { url } (or { error, code }); the stripe-webhook function writes the result back to
// organisation_subscriptions. Prices are excl. VAT; Stripe Tax adds VAT at checkout.
import { supabase } from "@/integrations/supabase/client";
import { ServiceError, type ServiceErrorKind } from "./service-error";

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

const kindForStatus = (status: number | undefined): ServiceErrorKind =>
  status === 401
    ? "unauthenticated"
    : status === 403
      ? "forbidden"
      : status === 404
        ? "not_found"
        : status === 409
          ? "conflict"
          : status === 400
            ? "invalid"
            : "unknown";

interface FunctionErrorBody {
  error?: unknown;
  code?: unknown;
}

/** Calls a billing function and returns its url, or throws with the function's own message. */
async function invokeForUrl(
  name: "create-checkout-session" | "create-portal-session",
  body: Record<string, unknown>,
  fallback: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url?: string }>(name, { body });
  if (error) {
    // FunctionsHttpError keeps the function's Response in `context`; other errors (relay or
    // fetch failures) carry none.
    const context = (error as { context?: unknown }).context;
    if (context && typeof (context as Response).json === "function") {
      const response = context as Response;
      const parsed = (await response.json().catch(() => null)) as FunctionErrorBody | null;
      const message = typeof parsed?.error === "string" && parsed.error ? parsed.error : fallback;
      throw new ServiceError(kindForStatus(response.status), message, {
        code: typeof parsed?.code === "string" ? parsed.code : undefined,
        cause: error,
      });
    }
    throw new ServiceError("network", `${fallback} Check your connection and try again.`, {
      cause: error,
    });
  }
  if (!data?.url) throw new ServiceError("unknown", fallback);
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
