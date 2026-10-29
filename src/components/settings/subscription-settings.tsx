// Settings → Subscription (work package 2.3): plan and status, paid seats (viewers are free),
// renewal or trial end, and Stripe Checkout / the Stripe customer portal. Only organisation
// admins can read organisation_subscriptions, so everyone else sees a notice. Stripe returns
// here with ?checkout=success|cancelled; the webhook updates the row, so a success refetches.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CreditCard, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useOrgId } from "@/components/auth/organisation-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SubscriptionSettings as Subscription } from "@/data/settings-types";
import { useSeatChangeMutations, useSeatUsage } from "@/hooks/use-members";
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
import { FunctionCallError } from "@/services/functions";
import { formatMinor, previewSeats, type SeatPreview } from "@/services/members";
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
        description="Plan, seat usage and renewal. Admins and members use a paid seat; viewers are free."
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
      ) : live ? (
        !subscription.cancelAtPeriodEnd && (
          <SeatPlanCard subscription={subscription} orgId={orgId} />
        )
      ) : (
        <SubscribeCard subscription={subscription} orgId={orgId} />
      )}
    </>
  );
}

function SubscribeCard({ subscription, orgId }: { subscription: Subscription; orgId: string }) {
  const settings = useSettings();
  // Paid members plus pending paid invitations (get_seat_usage), as create-checkout-session checks.
  const seatsInUse = useSeatUsage().data?.used ?? subscription.paidSeatsUsed;
  const minSeats = Math.max(1, seatsInUse);
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
            ? `At least ${minSeats}: one for each paid member and pending paid invitation. You can change seats later on this page.`
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

/**
 * Seats and billing period on a live subscription (work package 2.1), through manage-subscription.
 * More seats: preview the prorated charge, confirm, and it's charged now (3D Secure sends the
 * admin to Stripe's invoice page). Fewer seats or a different period: scheduled for the renewal
 * date. The customer portal can't change seats or plan (turned off there).
 */
function SeatPlanCard({ subscription, orgId }: { subscription: Subscription; orgId: string }) {
  const settings = useSettings();
  const usage = useSeatUsage().data ?? null;
  const changes = useSeatChangeMutations();
  const [seatsText, setSeatsText] = useState(String(subscription.seatsTotal));
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const preview = useMutation({
    meta: { silent: true },
    mutationFn: (seats: number) => previewSeats(orgId, seats),
  });
  const seats = Number(seatsText);
  const minSeats = Math.max(1, usage?.used ?? subscription.paidSeatsUsed);
  const seatsValid =
    Number.isInteger(seats) &&
    seats >= minSeats &&
    seats <= 5000 &&
    seats !== subscription.seatsTotal;
  const quote = preview.data && preview.data.newSeats === seats ? preview.data : null;
  const date = (iso: string) => formatDate(iso.slice(0, 10), settings);
  const otherInterval = subscription.billingInterval === "year" ? "month" : "year";
  const busy =
    changes.add.isPending ||
    changes.reduce.isPending ||
    changes.switchInterval.isPending ||
    changes.cancelScheduled.isPending;

  const done = (message: string) => {
    toast.success(message);
    preview.reset();
  };
  const failed = (error: unknown) => {
    if (error instanceof FunctionCallError && error.code === "requires_action") {
      const url = error.body?.["hostedInvoiceUrl"];
      setAuthUrl(typeof url === "string" ? url : null);
    }
    if (error instanceof FunctionCallError && error.code === "preview_expired") preview.reset();
    toast.error(errorMessage(error));
  };

  const confirm = (value: SeatPreview) => {
    if (value.direction === "increase")
      changes.add.mutate(
        { seats: value.newSeats, prorationDate: value.prorationDate },
        { onSuccess: () => done(`You now have ${value.newSeats} seats.`), onError: failed },
      );
    else
      changes.reduce.mutate(value.newSeats, {
        onSuccess: (result) =>
          done(`You'll have ${result.seats} seats from ${date(result.effectiveAt)}.`),
        onError: failed,
      });
  };

  const scheduled =
    usage?.scheduledChangeAt && (usage.scheduledSeats !== null || usage.scheduledInterval)
      ? usage
      : null;

  return (
    <SettingsCard
      requires="self"
      title="Seats and billing period"
      description="Added seats are charged now for the rest of the period. Fewer seats and a change of billing period start at renewal. Prices exclude VAT."
    >
      <div className="space-y-5">
        {scheduled && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              From {date(scheduled.scheduledChangeAt!)}:{" "}
              {[
                scheduled.scheduledSeats !== null &&
                  scheduled.scheduledSeats !== subscription.seatsTotal &&
                  `${scheduled.scheduledSeats} seats`,
                scheduled.scheduledInterval &&
                  scheduled.scheduledInterval !== subscription.billingInterval &&
                  (scheduled.scheduledInterval === "year" ? "billed annually" : "billed monthly"),
              ]
                .filter(Boolean)
                .join(", ") || "no change"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                changes.cancelScheduled.mutate(undefined, {
                  onSuccess: () => done("The scheduled change was cancelled."),
                  onError: failed,
                })
              }
            >
              Cancel change
            </Button>
          </div>
        )}
        {authUrl && (
          <p className="rounded-md border border-health-warn/40 bg-health-warn/10 px-3 py-2 text-sm">
            Your bank needs you to confirm the payment.{" "}
            <a href={authUrl} target="_blank" rel="noreferrer" className="font-medium underline">
              Confirm the payment with Stripe
            </a>
            . The seats are added as soon as it's paid.
          </p>
        )}
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
              onChange={(event) => {
                setSeatsText(event.target.value);
                setAuthUrl(null);
              }}
              className="mt-1.5 w-32"
            />
          </label>
          <Button
            variant="outline"
            disabled={!seatsValid || preview.isPending || busy}
            onClick={() => preview.mutate(seats, { onError: failed })}
          >
            {preview.isPending ? "Working it out…" : "Check the cost"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          You have {subscription.seatsTotal} seats and {minSeats} in use (members and pending
          invitations). You can't go below the seats in use.
        </p>
        {quote && (
          <div className="space-y-3 rounded-md border p-4 text-sm">
            {quote.direction === "increase" ? (
              <>
                <p>
                  {quote.currentSeats} → {quote.newSeats} seats.{" "}
                  {quote.trialing
                    ? "You're in the free trial, so nothing is charged now."
                    : `Charged now for the rest of this period: ${formatMinor(quote.amountExclVat, quote.currency)} + ${formatMinor(quote.vat, quote.currency)} VAT = ${formatMinor(quote.totalNow, quote.currency)}.`}
                </p>
                {quote.dropsScheduledReduction && (
                  <p className="text-xs text-muted-foreground">
                    This replaces the seat reduction scheduled for renewal.
                  </p>
                )}
              </>
            ) : (
              <p>
                {quote.currentSeats} → {quote.newSeats} seats from {date(quote.effectiveAt)}, when
                the subscription renews. Nothing changes until then and there's no refund for the
                current period.
              </p>
            )}
            <Button disabled={busy} onClick={() => confirm(quote)}>
              {busy
                ? "Saving…"
                : quote.direction === "increase" && !quote.trialing
                  ? `Add seats and pay ${formatMinor(quote.totalNow, quote.currency)}`
                  : quote.direction === "increase"
                    ? "Add seats"
                    : "Schedule the change"}
            </Button>
          </div>
        )}
        {subscription.billingInterval && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <span>
              Billed {subscription.billingInterval === "year" ? "annually" : "monthly"}.{" "}
              {otherInterval === "year"
                ? `Annual billing is ${gbp(SEAT_PRICE_GBP.year)} per seat a year (two months free).`
                : `Monthly billing is ${gbp(SEAT_PRICE_GBP.month)} per seat a month.`}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || scheduled?.scheduledInterval === otherInterval}
              onClick={() =>
                changes.switchInterval.mutate(otherInterval, {
                  onSuccess: (result) =>
                    done(
                      `You'll be billed ${otherInterval === "year" ? "annually" : "monthly"} from ${date(result.effectiveAt)}.`,
                    ),
                  onError: failed,
                })
              }
            >
              Switch to {otherInterval === "year" ? "annual" : "monthly"} at renewal
            </Button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
