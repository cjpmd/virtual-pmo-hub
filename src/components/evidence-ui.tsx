import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DeliveryStatus, EvidencedRag } from "@/services/forecast";
import { deliveryStatusLabels } from "@/services/forecast";
import type { Health } from "@/data/types";

const ragStyles: Record<EvidencedRag, string> = {
  Green: "bg-health-good/15 text-health-good-foreground border-health-good/25",
  Amber: "bg-health-warn/18 text-health-warn-foreground border-health-warn/30",
  Red: "bg-health-bad/15 text-health-bad-foreground border-health-bad/25",
  Grey: "bg-muted text-muted-foreground border-border",
};
export const healthToRag = (h: Health): EvidencedRag => (h === "On Track" ? "Green" : h === "At Risk" ? "Amber" : h === "Off Track" ? "Red" : "Grey");
export const ragLevel = (r: EvidencedRag) => (r === "Green" ? 0 : r === "Amber" ? 1 : r === "Red" ? 2 : -1);

/** RAG always carries a text label, never colour alone. */
export function RagPill({ rag, prefix, label, className }: { rag: EvidencedRag; prefix?: string | undefined; label?: string | undefined; className?: string | undefined }) {
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", ragStyles[rag], className)}>
    <span aria-hidden className={cn("size-1.5 rounded-full", rag === "Green" ? "bg-health-good" : rag === "Amber" ? "bg-health-warn" : rag === "Red" ? "bg-health-bad" : "bg-muted-foreground")} />
    {prefix && <span className="font-normal opacity-80">{prefix}</span>}{label ?? (rag === "Grey" ? "No evidence" : rag)}
  </span>;
}

export function DeliveryChip({ status }: { status: DeliveryStatus }) {
  const rag: EvidencedRag = status === "on_track" ? "Green" : status === "recovering" || status === "recovering_late" ? "Amber" : status === "insufficient_evidence" ? "Grey" : "Red";
  return <RagPill rag={rag} label={deliveryStatusLabels[status]} />;
}

export function DeclaredVsEvidenced({ declared, evidenced, stale }: { declared: Health; evidenced: EvidencedRag; stale?: boolean }) {
  return <span className="inline-flex flex-wrap items-center gap-1.5">
    <RagPill rag={healthToRag(declared)} prefix="Declared" />
    <RagPill rag={stale ? "Grey" : evidenced} prefix="Evidenced" label={stale ? "Stale evidence" : undefined} />
  </span>;
}

export function HowCalculated({ title, children }: { title: string; children: ReactNode }) {
  return <Popover>
    <PopoverTrigger asChild><button type="button" className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground" aria-label={`How is ${title} calculated?`}><CircleHelp className="size-3.5" /></button></PopoverTrigger>
    <PopoverContent className="w-80 text-sm leading-6"><p className="font-semibold">How is this calculated?</p><div className="mt-1 text-muted-foreground">{children}</div></PopoverContent>
  </Popover>;
}
