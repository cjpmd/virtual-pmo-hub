import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
import {
  billingPortalUrl,
  billingTotal,
  checkoutUrl,
  hasLiveSubscription,
  keepsTrialDays,
  trialDaysLeft,
} from "./billing";
import { ServiceError } from "./service-error";

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
