import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useMeasuredWidth } from "@/components/charts/use-measure";
import { cn } from "@/lib/utils";

export type DeltaSense = "up-good" | "down-good" | "neutral";

function deltaTone(change: number, sense: DeltaSense) {
  if (sense === "neutral" || Math.abs(change) < 0.0001) return "var(--viz-ink-muted)";
  const good = sense === "up-good" ? change > 0 : change < 0;
  return good ? "var(--viz-positive)" : "var(--viz-negative)";
}

/** 12-period trend behind the headline figure. Unlabelled by design: the value carries the number. */
export function Sparkline({ points, colour = "var(--viz-cat-1)", height = 36, className }: { points: number[]; colour?: string; height?: number; className?: string }) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { ref, width } = useMeasuredWidth();
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const step = (width - 6) / (points.length - 1);
  const y = (value: number) => 3 + (1 - (value - min) / span) * (height - 8);
  const path = points.map((value, index) => `${index ? "L" : "M"}${(3 + index * step).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const last = points[points.length - 1] ?? 0;
  return <div ref={ref} className={cn("w-full", className)}>
    <svg width={width} height={height} role="img" aria-hidden className="block overflow-visible">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={colour} stopOpacity="0.22"/><stop offset="100%" stopColor={colour} stopOpacity="0"/></linearGradient></defs>
      <path d={`${path} L${width - 3},${height} L3,${height} Z`} fill={`url(#${gradientId})`} stroke="none"/>
      <path d={path} fill="none" stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={width - 3} cy={y(last)} r="2.75" fill={colour} stroke="var(--viz-surface)" strokeWidth="1.75"/>
    </svg>
  </div>;
}

export interface MetricCardProps {
  label: string;
  value: string;
  /** One line saying what the figure means or how it is made up. */
  context: string;
  /** Signed change against the previous period, already in the metric's own units. */
  delta?: { change: number; percent?: number | undefined; label: string; sense?: DeltaSense };
  trend?: number[];
  trendColour?: string;
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
  onClick?: () => void;
  icon?: ReactNode;
  className?: string;
}

/** Headline figure with its change, a 12-period sparkline and a route into the underlying list. */
export function MetricCard({ label, value, context, delta, trend, trendColour = "var(--viz-cat-1)", to, params, search, onClick, icon, className }: MetricCardProps) {
  const tone = delta ? deltaTone(delta.change, delta.sense ?? "up-good") : undefined;
  const Arrow = !delta || Math.abs(delta.change) < 0.0001 ? ArrowRight : delta.change > 0 ? ArrowUpRight : ArrowDownRight;
  const body = <>
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {icon ? <span className="text-muted-foreground/60">{icon}</span> : null}
    </div>
    <p className="tabular mt-2.5 font-display text-[28px] font-semibold leading-none text-card-foreground">{value}</p>
    {delta ? <p className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color: tone }}>
      <Arrow className="size-3.5 shrink-0" aria-hidden/>
      <span className="tabular">{delta.percent === undefined ? "" : `${delta.percent > 0 ? "+" : ""}${delta.percent.toFixed(delta.percent % 1 === 0 ? 0 : 1)}% `}</span>
      <span className="font-normal text-muted-foreground">{delta.label}</span>
    </p> : null}
    {trend && trend.length > 1 ? <div className="mt-3"><Sparkline points={trend} colour={trendColour}/></div> : null}
    <p className={cn("text-xs leading-5 text-muted-foreground", trend && trend.length > 1 ? "mt-1.5" : "mt-3")}>{context}</p>
  </>;
  const shell = "group flex flex-col rounded-lg border border-border/70 bg-card p-4 text-left shadow-sm transition-all";
  const interactive = "hover:border-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (to) return <Link to={to} {...(params ? { params } : {})} {...(search ? { search } : {})} className={cn(shell, interactive, className)}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn(shell, interactive, className)}>{body}</button>;
  return <div className={cn(shell, className)}>{body}</div>;
}

/** Four-up hero row. Every dashboard opens with the same shape. */
export function MetricRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}
