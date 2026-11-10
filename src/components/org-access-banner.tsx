// GL-5: the trial, payment and read-only banner under the app shell's header. Which banner shows
// is decided by accessBanner (services/billing.ts); writability comes from the database.
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, CreditCard, Lock } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrgId } from "@/components/auth/organisation-provider";
import { useOrgAccess } from "@/hooks/use-org-access";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { openBillingPortal } from "@/services/billing";
import { errorMessage } from "@/services/service-error";
import { useSettings } from "@/services/settings";

/** Tooltip text on create and edit buttons disabled while the organisation is read-only. */
export const READ_ONLY_TIP =
  "Read-only: this organisation's trial or subscription has ended. An admin can subscribe in Settings › Subscription.";

/**
 * Wraps a button that is disabled because the organisation is read-only, so the reason shows
 * on hover and focus (a disabled button gets no pointer events of its own).
 */
export function ReadOnlyTip({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  if (!readOnly) return <>{children}</>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex" data-read-only="">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{READ_ONLY_TIP}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const TONES = {
  info: "border-border bg-muted text-foreground",
  warn: "border-health-warn/40 bg-health-warn/10 text-foreground",
  bad: "border-health-bad/40 bg-health-bad/10 text-foreground",
} as const;

export function OrgAccessBanner() {
  const { banner } = useOrgAccess();
  const settings = useSettings();
  const orgId = useOrgId();
  const [opening, setOpening] = useState(false);
  if (!banner) return null;

  const day = (iso: string) => formatDate(iso.slice(0, 10), settings);
  const subscribe = (
    <Button asChild size="sm" className="w-full sm:w-auto">
      <Link to="/settings/$section" params={{ section: "subscription" }}>
        Subscribe
      </Link>
    </Button>
  );
  const portal = (label: string) => (
    <Button
      size="sm"
      className="w-full sm:w-auto"
      disabled={opening}
      onClick={() => {
        setOpening(true);
        openBillingPortal(orgId).catch((error) => {
          setOpening(false);
          toast.error(errorMessage(error));
        });
      }}
    >
      {opening ? "Opening…" : label}
    </Button>
  );

  let tone: keyof typeof TONES;
  let icon: ReactNode;
  let text: ReactNode;
  let action: ReactNode = null;
  switch (banner.kind) {
    case "read_only":
      tone = "bad";
      icon = <Lock className="size-4 shrink-0" />;
      text = (
        <>
          <strong className="font-semibold">This organisation is read-only.</strong>{" "}
          {banner.isAdmin
            ? "Subscribe to restore editing. Nothing has been deleted."
            : "Ask your admin to subscribe. Nothing has been deleted."}
        </>
      );
      if (banner.isAdmin) action = subscribe;
      break;
    case "past_due":
      tone = "bad";
      icon = <CreditCard className="size-4 shrink-0" />;
      text = (
        <>
          <strong className="font-semibold">Payment failed</strong> — update your card by{" "}
          {day(banner.payBy)}, or the organisation becomes read-only.
        </>
      );
      action = portal("Update card");
      break;
    case "cancelling":
      tone = "warn";
      icon = <CalendarClock className="size-4 shrink-0" />;
      text = (
        <>
          Your subscription ends on {day(banner.endsOn)} — the organisation becomes read-only after
          that.
        </>
      );
      action = portal("Keep subscription");
      break;
    case "trial":
      tone = banner.urgent ? "warn" : "info";
      icon = banner.urgent ? (
        <AlertTriangle className="size-4 shrink-0" />
      ) : (
        <CalendarClock className="size-4 shrink-0" />
      );
      text = (
        <>
          <strong className="font-semibold">
            {banner.daysLeft} {banner.daysLeft === 1 ? "day" : "days"} left
          </strong>{" "}
          in your trial.
        </>
      );
      action = subscribe;
      break;
  }

  return (
    <div
      role="status"
      data-banner={banner.kind}
      className={cn("border-b px-4 py-2.5 text-sm sm:px-6 lg:px-8", TONES[tone])}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 sm:items-center">
          {icon}
          <span>{text}</span>
        </p>
        {action}
      </div>
    </div>
  );
}
