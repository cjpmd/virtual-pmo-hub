import { RefreshCw } from "lucide-react";
import { useHealthUpdating } from "@/hooks/use-health-refresh";
import { cn } from "@/lib/utils";

/**
 * "Updating health…" next to a health display while one of the person's own writes is waiting
 * for the stored health to refresh (a few seconds). Nothing for other people's changes.
 */
export function HealthUpdating({ className }: { className?: string }) {
  const updating = useHealthUpdating();
  return (
    <span role="status" aria-live="polite" className={cn("text-xs font-normal", className)}>
      {updating && (
        <span className="inline-flex items-center gap-1">
          <RefreshCw aria-hidden className="size-3 motion-safe:animate-spin" />
          Updating health…
        </span>
      )}
    </span>
  );
}
