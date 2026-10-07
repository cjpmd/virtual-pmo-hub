// Small building blocks shared by the Pathway screens. Plain styling on the existing tokens;
// the restyle comes with the overview rollout.
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleMinus, ShieldAlert, X } from "lucide-react";
import type { Health } from "@/data/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const tone: Record<Health, string> = {
  "On Track": "bg-health-good/15 text-health-good-foreground border-health-good/25",
  "At Risk": "bg-health-warn/18 text-health-warn-foreground border-health-warn/30",
  "Off Track": "bg-health-bad/15 text-health-bad-foreground border-health-bad/25",
  "Not Set": "bg-muted text-muted-foreground border-border",
};
const icon = {
  "On Track": CheckCircle2,
  "At Risk": AlertTriangle,
  "Off Track": ShieldAlert,
  "Not Set": CircleMinus,
};
const label: Record<Health, string> = {
  "On Track": "Green",
  "At Risk": "Amber",
  "Off Track": "Red",
  "Not Set": "Not set",
};

/** RAG chip with its reason on hover or focus (and in the accessible name). Never colour alone. */
export function RagChip({
  rag,
  reason,
  complete,
  className,
}: {
  rag: Health;
  reason: string;
  /** Accepted or achieved: shown as "Complete" with a tick. */
  complete?: boolean;
  className?: string;
}) {
  const Icon = complete ? CheckCircle2 : icon[rag];
  const text = complete ? "Complete" : label[rag];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`${text}: ${reason}`}
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tone[complete ? "On Track" : rag],
              className,
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {text}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{reason || "No reason recorded"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** A right-hand sheet for an editor (same pattern as the dependency editor). */
export function SideSheet({
  eyebrow,
  title,
  onClose,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-overlay" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l bg-background p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">{eyebrow}</p>
            <h2 className="mt-1 font-display text-xl font-semibold">{title}</h2>
            {aside && <div className="mt-2">{aside}</div>}
          </div>
          <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="mt-6 space-y-6">{children}</div>
      </aside>
    </>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1 text-sm font-medium", className)}>
      <span>{label}</span>
      {children}
      {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const selectClass = "w-full rounded-md border bg-background p-2 text-sm disabled:opacity-60";

export function SectionCard({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-health-bad-foreground">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}
