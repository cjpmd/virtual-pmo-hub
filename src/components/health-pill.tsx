import { AlertTriangle, CheckCircle2, CircleMinus, ShieldAlert } from "lucide-react";
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
export function HealthPill({
  health,
  override,
  className,
}: {
  health: Health;
  override?: HealthOverride;
  className?: string;
}) {
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
