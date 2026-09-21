import { useCallback, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TooltipRow { label: string; value: string; colour?: string; muted?: boolean }
export interface TooltipModel { title: string; subtitle?: string; rows: TooltipRow[]; note?: string }

/** Shared tooltip body: a coloured indicator per row, formatted values, an optional comparison note. */
export function TooltipBody({ title, subtitle, rows, note }: TooltipModel) {
  return <div className="min-w-[150px] rounded-md border border-border/70 bg-popover px-3 py-2 text-popover-foreground shadow-lg">
    <p className="text-xs font-semibold leading-4">{title}</p>
    {subtitle ? <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{subtitle}</p> : null}
    <dl className={cn("space-y-1", subtitle || title ? "mt-1.5" : "")}>
      {rows.map(row => <div key={row.label} className="flex items-center justify-between gap-4 text-[11px] leading-4">
        <dt className="flex items-center gap-1.5 text-muted-foreground">{row.colour ? <span className="size-2 shrink-0 rounded-[2px]" style={{ background: row.colour }}/> : null}{row.label}</dt>
        <dd className={cn("tabular font-medium", row.muted ? "text-muted-foreground" : "text-foreground")}>{row.value}</dd>
      </div>)}
    </dl>
    {note ? <p className="mt-1.5 border-t border-border/60 pt-1.5 text-[11px] leading-4 text-muted-foreground">{note}</p> : null}
  </div>;
}

/** Follows the pointer inside a relatively positioned chart wrapper. */
export function useHoverTooltip<T>() {
  const [state, setState] = useState<{ x: number; y: number; data: T } | null>(null);
  const show = useCallback((event: { clientX: number; clientY: number; currentTarget: Element }, data: T) => {
    const host = event.currentTarget.closest("[data-viz-host]") ?? event.currentTarget;
    const box = host.getBoundingClientRect();
    setState({ x: event.clientX - box.left, y: event.clientY - box.top, data });
  }, []);
  const hide = useCallback(() => setState(null), []);
  return { state, show, hide };
}

/** Follows the pointer, flipping below it near the top edge so the card never overflows upward. */
export function HoverLayer({ x, y, children, flipBelow = 120 }: { x: number; y: number; children: ReactNode; flipBelow?: number }) {
  const below = y < flipBelow;
  return <div className="pointer-events-none absolute z-30" style={{ left: x, top: below ? y + 14 : y - 12, transform: below ? "translate(-50%, 0)" : "translate(-50%, -100%)" }}>{children}</div>;
}

/** Recharts tooltip content built from the same body, so every chart reads alike. */
export function makeRechartsTooltip<P extends { active?: boolean; payload?: Array<{ payload?: unknown; dataKey?: string | number; value?: unknown; color?: string; name?: string }>; label?: unknown }>(build: (payload: NonNullable<P["payload"]>, label: unknown) => TooltipModel | null) {
  return function VizTooltip(props: P) {
    if (!props.active || !props.payload?.length) return null;
    const model = build(props.payload, props.label);
    return model ? <TooltipBody {...model}/> : null;
  };
}
