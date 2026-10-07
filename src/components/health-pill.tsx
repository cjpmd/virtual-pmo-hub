import { AlertTriangle, Archive, CheckCircle2, CircleMinus, ShieldAlert } from "lucide-react";
import type { Health, HealthOverride } from "@/data/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const styles: Record<Health, string> = {
  "On Track": "bg-health-good/15 text-health-good-foreground border-health-good/25",
  "At Risk": "bg-health-warn/18 text-health-warn-foreground border-health-warn/30",
  "Off Track": "bg-health-bad/15 text-health-bad-foreground border-health-bad/25",
  "Not Set": "bg-muted text-muted-foreground border-border",
};
const icons = {
  "On Track": CheckCircle2,
  "At Risk": AlertTriangle,
  "Off Track": ShieldAlert,
  "Not Set": CircleMinus,
};
/**
 * A RAG pill. Pass `closed` for a closed project: its health is history, so it shows "Closed"
 * instead of a RAG (and closed projects are left out of roll-ups).
 */
export function HealthPill({
  health,
  override,
  closed,
  className,
}: {
  health: Health;
  override?: HealthOverride;
  closed?: boolean;
  className?: string;
}) {
  if (closed)
    return (
      <span
        className={cn(
          "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold",
          styles["Not Set"],
          className,
        )}
      >
        <Archive className="size-3.5" />
        Closed
      </span>
    );
  const Icon = icons[health];
  const pill = (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold",
        styles[health],
        className,
      )}
    >
      <Icon className="size-3.5" />
      {health}
      {override && (
        <span className="rounded bg-background/70 px-1 text-[9px] uppercase">Manual</span>
      )}
    </span>
  );
  if (!override) return pill;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent>{override.reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
