// Settings → Subscription (work package 2.3): plan and status, paid seats (viewers are free),
// renewal or trial end, and Stripe Checkout / the Stripe customer portal. Only organisation
// admins can read organisation_subscriptions, so everyone else sees a notice. Stripe returns
// here with ?checkout=success|cancelled; the webhook updates the row, so a success refetches.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useOrgId } from "@/components/auth/organisation-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SubscriptionSettings as Subscription } from "@/data/settings-types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  billingTotal,
  hasLiveSubscription,
  keepsTrialDays,
  openBillingPortal,
  SEAT_PRICE_GBP,
  startCheckout,
  trialDaysLeft,
  type BillingInterval,
} from "@/services/billing";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";
import { useSettings } from "@/services/settings";
import { SettingsCard } from "./settings-shell";

const gbp = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);

const days = (count: number) => `${count} day${count === 1 ? "" : "s"}`;

function statusLabel(subscription: Subscription, live: boolean): string {
  if (subscription.plan === "demo") return "Demo organisation";
  if (live) {
    if (subscription.cancelAtPeriodEnd) return "Cancelling";
    switch (subscription.status) {
      case "active":
        return "Active";
      case "trialing":
        return "Active, in free trial";
      case "past_due":
        return "Payment overdue";
      case "unpaid":
        return "Unpaid";
      default:
        return "Payment incomplete";
    }
  }
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired")
    return "Cancelled";
  const left = trialDaysLeft(subscription.trialEndsAt);
  if (left !== null) return left > 0 ? "Free trial" : "Trial ended";
  return "No subscription";
}

function planLabel(subscription: Subscription): string {
  if (subscription.billingInterval === "year") return "Annual";
  if (subscription.billingInterval === "month") return "Monthly";
  if (subscription.plan === "trial") return "Free trial";
  if (subscription.plan === "demo") return "Demo";
  return subscription.plan || "None";
}

export function SubscriptionSettings() {
  const settings = useSettings();
  const subscription = settings.subscription;
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);
  const handled = useRef(false);

  // Stripe Checkout returns with ?checkout=…: say what happened once, then drop the parameter.
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    if (outcome === "cancelled") {
      toast("Checkout cancelled. Nothing was charged.");
      return;
    }
    if (outcome !== "success") return;
    toast.success("Thank you. Your subscription is being set up and will show here shortly.");
    const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.settings(orgId) });
    refresh();
    // The webhook can land after Stripe redirects back; look again a little later.
    const timer = setTimeout(refresh, 5_000);
    return () => clearTimeout(timer);
  }, [orgId, queryClient]);

  if (!subscription.canManage)
    return (
      <SettingsCard
        requires="self"
        title="Subscription"
        description="Plan, seat usage and renewal."
      >
        <p className="text-sm text-muted-foreground">
          Only organisation admins can see the subscription.
        </p>
      </SettingsCard>
    );

  const live = hasLiveSubscription(subscription.status);
  const isDemo = subscription.plan === "demo";
  const usage = Math.round(
    (subscription.paidSeatsUsed / Math.max(1, subscription.seatsTotal)) * 100,
  );
  const trialLeft = trialDaysLeft(subscription.trialEndsAt);
  const overSeats = live && subscription.paidSeatsUsed > subscription.seatsTotal;
  const paymentFailed = subscription.status === "past_due" || subscription.status === "unpaid";

  const openPortal = async () => {
    setOpening(true);
    try {
      await openBillingPortal(orgId);
    } catch (error) {
      toast.error(errorMessage(error));
      setOpening(false);
    }
  };

  let dateLabel = "Renewal date";
  let dateValue = "—";
  let dateNote: string | null = null;
  if (live && subscription.currentPeriodEnd) {
    dateValue = formatDate(subscription.currentPeriodEnd.slice(0, 10), settings);
    if (subscription.cancelAtPeriodEnd) dateLabel = "Ends on";
    else if (subscription.status === "trialing") {
      dateLabel = "Billing starts";
      const left = trialDaysLeft(subscription.currentPeriodEnd);
      if (left !== null) dateNote = `${days(left)} left`;
    }
  } else if (!live && !isDemo && subscription.trialEndsAt && trialLeft !== null) {
    dateLabel = trialLeft > 0 ? "Trial ends" : "Trial ended";
    dateValue = formatDate(subscription.trialEndsAt.slice(0, 10), settings);
    if (trialLeft > 0) dateNote = `${days(trialLeft)} left`;
  }

  return (
    <>
      <SettingsCard
        requires="self"
        title="Subscription"
        description="Plan, seat usage and renewal. Paid seats are contributors and above; viewers are free."
        actions={
          subscription.hasBillingAccount ? (
            <Button variant="outline" disabled={opening} onClick={() => void openPortal()}>
              <ExternalLink className="h-4 w-4" />
              {opening ? "Opening…" : live ? "Manage billing" : "Billing history"}
            </Button>
          ) : undefined
        }
      >
        {(paymentFailed || overSeats) && (
          <div className="mb-4 space-y-2">
            {paymentFailed && (
              <p className="rounded-md border border-health-bad/40 bg-health-bad/10 px-3 py-2 text-sm">
                The last payment failed. Update your card in Manage billing.
              </p>
            )}
            {overSeats && (
              <p className="rounded-md border border-health-warn/40 bg-health-warn/10 px-3 py-2 text-sm">
                There are {subscription.paidSeatsUsed} paid members but {subscription.seatsTotal}{" "}
                paid seats: add seats in Manage billing or change members to viewers.
              </p>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border p-4">
            <p className="text-xs text-muted-foreground">Plan</p>
            <p className="mt-1.5 font-display text-lg font-semibold">{planLabel(subscription)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{statusLabel(subscription, live)}</p>
          </div>
          <div className="rounded-md border p-4">
            <p className="text-xs text-muted-foreground">{live ? "Paid seats" : "Paid members"}</p>
            <p className="mt-1.5 font-display text-lg font-semibold">
              {live
                ? `${subscription.paidSeatsUsed} of ${subscription.seatsTotal}`
                : subscription.paidSeatsUsed}
            </p>
            {live && (
              <div className="mt-2 h-2 rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    usage > 100 ? "bg-health-bad" : usage > 90 ? "bg-health-warn" : "bg-primary",
                  )}
                  style={{ width: `${Math.min(100, usage)}%` }}
                />
              </div>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {subscription.viewers} viewer{subscription.viewers === 1 ? "" : "s"} (free)
            </p>
          </div>
          <div className="rounded-md border p-4">
            <p className="text-xs text-muted-foreground">{dateLabel}</p>
            <p className="mt-1.5 font-display text-lg font-semibold">{dateValue}</p>
            {dateNote && <p className="mt-1 text-xs text-muted-foreground">{dateNote}</p>}
          </div>
          <div className="rounded-md border p-4">
            <p className="text-xs text-muted-foreground">Billing contact</p>
            <p className="mt-1.5 break-words text-sm font-medium">
              {subscription.billingContact || "—"}
            </p>
          </div>
        </div>
      </SettingsCard>
      {isDemo ? (
        <SettingsCard requires="self" title="Demo organisation">
          <p className="text-sm text-muted-foreground">
            This is the demo organisation, so it can't be subscribed.
          </p>
        </SettingsCard>
      ) : (
        !live && <SubscribeCard subscription={subscription} orgId={orgId} />
      )}
    </>
  );
}

function SubscribeCard({ subscription, orgId }: { subscription: Subscription; orgId: string }) {
  const settings = useSettings();
  const minSeats = Math.max(1, subscription.paidSeatsUsed);
  const [interval, setBillingInterval] = useState<BillingInterval>("year");
  const [seatsText, setSeatsText] = useState(String(minSeats));
  const [starting, setStarting] = useState(false);
  const seats = Number(seatsText);
  const seatsValid = Number.isInteger(seats) && seats >= minSeats && seats <= 5000;
  const total = seatsValid ? billingTotal(interval, seats) : null;

  const subscribe = async () => {
    if (!seatsValid) return;
    setStarting(true);
    try {
      await startCheckout(orgId, interval, seats);
    } catch (error) {
      toast.error(errorMessage(error));
      setStarting(false);
    }
  };

  const options: Array<{ value: BillingInterval; label: string; price: string; note: string }> = [
    {
      value: "year",
      label: "Annual",
      price: `${gbp(SEAT_PRICE_GBP.year)} per seat a year`,
      note: "Two months free",
    },
    {
      value: "month",
      label: "Monthly",
      price: `${gbp(SEAT_PRICE_GBP.month)} per seat a month`,
      note: "Cancel any time",
    },
  ];

  return (
    <SettingsCard
      requires="self"
      title="Subscribe"
      description="Pay by card through Stripe. Prices exclude VAT, which is added at checkout where due."
    >
      <div className="space-y-5">
        <div role="radiogroup" aria-label="Billing period" className="grid gap-3 sm:grid-cols-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={interval === option.value}
              onClick={() => setBillingInterval(option.value)}
              className={cn(
                "rounded-md border p-4 text-left transition-colors",
                interval === option.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-muted/50",
              )}
            >
              <p className="font-display font-semibold">{option.label}</p>
              <p className="mt-1 text-sm">{option.price}, excl. VAT</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{option.note}</p>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="block text-sm">
            <span className="font-medium">Paid seats</span>
            <Input
              type="number"
              inputMode="numeric"
              min={minSeats}
              max={5000}
              step={1}
              value={seatsText}
              onChange={(event) => setSeatsText(event.target.value)}
              className="mt-1.5 w-32"
              aria-invalid={!seatsValid}
            />
          </label>
          <div className="text-sm">
            <p className="text-muted-foreground">Total</p>
            <p className="font-display text-lg font-semibold">
              {total === null
                ? "—"
                : `${gbp(total)} a ${interval === "year" ? "year" : "month"} excl. VAT`}
            </p>
          </div>
        </div>
        <p className={cn("text-xs", seatsValid ? "text-muted-foreground" : "text-health-bad")}>
          {seatsValid
            ? `At least ${minSeats}: one for each member who isn't a viewer. You can change seats later in Manage billing.`
            : `Enter a whole number of seats from ${minSeats} to 5,000.`}
        </p>
        {keepsTrialDays(subscription.trialEndsAt) && (
          <p className="text-sm text-muted-foreground">
            You keep the rest of your free trial: the first payment is taken when it ends on{" "}
            {formatDate(subscription.trialEndsAt.slice(0, 10), settings)}.
          </p>
        )}
        <Button disabled={!seatsValid || starting} onClick={() => void subscribe()}>
          <CreditCard className="h-4 w-4" />
          {starting ? "Opening checkout…" : "Continue to payment"}
        </Button>
      </div>
    </SettingsCard>
  );
}
