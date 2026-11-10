import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
import {
  accessBanner,
  billingPortalUrl,
  billingTotal,
  checkoutUrl,
  hasLiveSubscription,
  keepsTrialDays,
  trialDaysLeft,
} from "./billing";
import { ServiceError } from "./service-error";
import type { SubscriptionStatus } from "./billing";

const DAY = 86_400_000;
const now = Date.parse("2026-10-29T12:00:00Z");

/** The shape supabase-js gives for a non-2xx function response (FunctionsHttpError). */
const httpError = (status: number, body: unknown) =>
  Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    name: "FunctionsHttpError",
    context: new Response(JSON.stringify(body), { status }),
  });

beforeEach(() => vi.clearAllMocks());

describe("billing helpers", () => {
  it("prices seats excl. VAT, annual at ten times monthly", () => {
    expect(billingTotal("month", 12)).toBe(120);
    expect(billingTotal("year", 12)).toBe(1200);
    expect(billingTotal("year", 0)).toBe(0);
  });

  it("treats the same statuses as live as create-checkout-session", () => {
    for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete"])
      expect(hasLiveSubscription(status)).toBe(true);
    for (const status of ["", "canceled", "incomplete_expired", "paused"])
      expect(hasLiveSubscription(status)).toBe(false);
  });

  it("counts trial days left, rounding up, and never below zero", () => {
    expect(trialDaysLeft("", now)).toBeNull();
    expect(trialDaysLeft(new Date(now + 13.2 * DAY).toISOString(), now)).toBe(14);
    expect(trialDaysLeft(new Date(now - DAY).toISOString(), now)).toBe(0);
  });

  it("keeps trial days only with more than two days left (Stripe's 48-hour minimum)", () => {
    expect(keepsTrialDays("", now)).toBe(false);
    expect(keepsTrialDays(new Date(now + 2 * DAY).toISOString(), now)).toBe(false);
    expect(keepsTrialDays(new Date(now + 2 * DAY + 60_000).toISOString(), now)).toBe(true);
  });
});

describe("billing functions", () => {
  it("asks create-checkout-session for a checkout url", async () => {
    invoke.mockResolvedValue({ data: { url: "https://checkout.stripe.com/c/1" }, error: null });
    await expect(checkoutUrl("org-1", "year", 7)).resolves.toBe("https://checkout.stripe.com/c/1");
    expect(invoke).toHaveBeenCalledWith("create-checkout-session", {
      body: { organisationId: "org-1", interval: "year", seats: 7 },
    });
  });

  it("surfaces the function's own error message and code", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(409, {
        error: "This organisation already has a subscription. Use Manage billing instead.",
        code: "already_subscribed",
      }),
    });
    const error = await checkoutUrl("org-1", "month", 3).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceError);
    expect(error).toMatchObject({
      kind: "conflict",
      code: "already_subscribed",
      message: "This organisation already has a subscription. Use Manage billing instead.",
    });
  });

  it("maps a forbidden portal request and falls back when the body has no message", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: httpError(403, { error: "Only organisation admins can manage billing." }),
    });
    await expect(billingPortalUrl("org-1")).rejects.toMatchObject({
      kind: "forbidden",
      message: "Only organisation admins can manage billing.",
    });
    invoke.mockResolvedValueOnce({ data: null, error: httpError(500, {}) });
    await expect(billingPortalUrl("org-1")).rejects.toMatchObject({
      kind: "unknown",
      message: "Couldn't open billing.",
    });
    expect(invoke).toHaveBeenLastCalledWith("create-portal-session", {
      body: { organisationId: "org-1" },
    });
  });

  it("reports a network failure and a response without a url", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("Failed to send a request"), { name: "FunctionsFetchError" }),
    });
    await expect(billingPortalUrl("org-1")).rejects.toMatchObject({ kind: "network" });
    invoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(checkoutUrl("org-1", "year", 1)).rejects.toMatchObject({
      message: "Couldn't start checkout.",
    });
  });
});

describe("accessBanner (GL-5)", () => {
  const sub = (extra: Partial<SubscriptionStatus>): SubscriptionStatus => ({
    plan: "trial",
    status: "",
    trialEndsAt: "",
    currentPeriodEnd: "",
    cancelAtPeriodEnd: false,
    statusChangedAt: "",
    ...extra,
  });
  const admin = (subscription: SubscriptionStatus | null, writable = true) =>
    accessBanner({ isDemo: false, isAdmin: true, writable, subscription, now });
  const trialEnding = (days: number) =>
    sub({ trialEndsAt: new Date(now + days * DAY).toISOString() });

  it("shows nothing for the demo organisation, even if it were read-only", () => {
    expect(
      accessBanner({ isDemo: true, isAdmin: true, writable: false, subscription: null, now }),
    ).toBeNull();
    expect(admin(sub({ plan: "demo" }))).toBeNull();
  });

  it("GL-11: a pending deletion shows to everyone, above read-only, with the date", () => {
    const pendingDeletion = { purgeAfter: "2026-12-10T08:00:00Z" };
    expect(
      accessBanner({
        isDemo: false,
        isAdmin: false,
        writable: false,
        subscription: null,
        pendingDeletion,
        now,
      }),
    ).toEqual({ kind: "pending_deletion", purgeAfter: "2026-12-10T08:00:00Z", isAdmin: false });
    expect(
      accessBanner({
        isDemo: false,
        isAdmin: true,
        writable: false,
        subscription: sub({ status: "past_due", statusChangedAt: "2026-11-01T00:00:00Z" }),
        pendingDeletion,
        now,
      }),
    ).toEqual({ kind: "pending_deletion", purgeAfter: "2026-12-10T08:00:00Z", isAdmin: true });
    expect(
      accessBanner({
        isDemo: true,
        isAdmin: true,
        writable: false,
        subscription: null,
        pendingDeletion,
        now,
      }),
    ).toBeNull();
    expect(
      accessBanner({
        isDemo: false,
        isAdmin: false,
        writable: false,
        subscription: null,
        pendingDeletion: null,
        now,
      }),
    ).toEqual({ kind: "read_only", isAdmin: false });
  });

  it("shows nothing for an active subscription", () => {
    expect(
      admin(sub({ plan: "paid", status: "active", currentPeriodEnd: "2026-11-29T00:00:00Z" })),
    ).toBeNull();
  });

  it("counts trial days left, stronger at three or fewer", () => {
    expect(admin(trialEnding(10))).toEqual({ kind: "trial", daysLeft: 10, urgent: false });
    expect(admin(trialEnding(4))).toEqual({ kind: "trial", daysLeft: 4, urgent: false });
    expect(admin(trialEnding(3))).toEqual({ kind: "trial", daysLeft: 3, urgent: true });
    expect(admin(trialEnding(0.2))).toEqual({ kind: "trial", daysLeft: 1, urgent: true });
  });

  it("shows no trial banner once the trial has ended but the database still allows writes", () => {
    expect(admin(trialEnding(0))).toBeNull();
    expect(admin(trialEnding(-2))).toBeNull();
  });

  it("is read-only once the database says so, for admins and members", () => {
    expect(admin(trialEnding(-1), false)).toEqual({ kind: "read_only", isAdmin: true });
    expect(
      accessBanner({ isDemo: false, isAdmin: false, writable: false, subscription: null, now }),
    ).toEqual({ kind: "read_only", isAdmin: false });
    // Past due beyond the grace period: the database has refused writes, so read-only wins.
    expect(
      admin(sub({ status: "past_due", currentPeriodEnd: "2026-10-01T12:00:00Z" }), false),
    ).toEqual({ kind: "read_only", isAdmin: true });
  });

  it("asks admins to update their card within 14 days of the failed payment (GL-6)", () => {
    // Stripe has moved the period end to the end of the unpaid period; the grace runs from the
    // failure, not from there.
    expect(
      admin(
        sub({
          plan: "paid",
          status: "past_due",
          statusChangedAt: "2026-11-05T09:00:00Z",
          currentPeriodEnd: "2026-12-05T09:00:00Z",
        }),
      ),
    ).toEqual({ kind: "past_due", payBy: "2026-11-19T09:00:00.000Z" });
  });

  it("falls back to the period end when the failure time is unknown", () => {
    expect(
      admin(sub({ plan: "paid", status: "past_due", currentPeriodEnd: "2026-10-25T12:00:00Z" })),
    ).toEqual({ kind: "past_due", payBy: "2026-11-08T12:00:00.000Z" });
  });

  it("puts past due ahead of a cancellation", () => {
    expect(
      admin(
        sub({
          status: "past_due",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: "2026-10-25T12:00:00Z",
        }),
      ),
    ).toMatchObject({ kind: "past_due" });
  });

  it("warns admins when an active subscription is set to cancel at period end", () => {
    expect(
      admin(
        sub({
          plan: "paid",
          status: "active",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: "2026-11-29T00:00:00Z",
        }),
      ),
    ).toEqual({ kind: "cancelling", endsOn: "2026-11-29T00:00:00Z" });
  });

  it("shows members nothing while the organisation is writable", () => {
    for (const subscription of [null, trialEnding(2)])
      expect(
        accessBanner({ isDemo: false, isAdmin: false, writable: true, subscription, now }),
      ).toBeNull();
  });
});
