import { useId } from "react";
import { useMeasuredWidth } from "@/components/charts/use-measure";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, gridProps } from "@/lib/chart-theme";
import { HoverLayer, TooltipBody, makeRechartsTooltip, useHoverTooltip } from "@/components/charts/viz-tooltip";
import { cn } from "@/lib/utils";

// -------------------------------------------------------------- small multiples
export interface MiniSeries { key: string; label: string; points: Array<{ label: string; value: number; colour?: string }>; caption: string; captionTone?: string | undefined; valueLabel?: string; format?: (value: number) => string }

/**
 * One mini line per dimension. Five separate plots compare far better than five
 * series crowded onto a single axis, and each keeps its own headline.
 */
export function SmallMultiples({ series, domain, className }: { series: MiniSeries[]; domain: [number, number]; className?: string }) {
  return <div className={cn("grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3", className)}>
    {series.map(item => <MiniLine key={item.key} series={item} domain={domain}/>)}
  </div>;
}

function MiniLine({ series, domain }: { series: MiniSeries; domain: [number, number] }) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { state, show, hide } = useHoverTooltip<{ label: string; value: number; colour?: string }>();
  const { ref, width } = useMeasuredWidth();
  const height = 44, [low, high] = domain, span = high - low || 1;
  const step = series.points.length > 1 ? (width - 8) / (series.points.length - 1) : 0;
  const x = (index: number) => 4 + index * step;
  const y = (value: number) => 4 + (1 - (value - low) / span) * (height - 12);
  const path = series.points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
  const last = series.points[series.points.length - 1];
  const tone = last?.colour ?? "var(--viz-cat-1)";
  return <div data-viz-host className="relative">
    <div className="flex items-baseline justify-between gap-2">
      <p className="truncate text-xs font-medium text-foreground">{series.label}</p>
      <p className="tabular shrink-0 text-[11px] font-semibold" style={{ color: series.captionTone ?? "var(--viz-ink-muted)" }}>{series.caption}</p>
    </div>
    <div ref={ref} className="mt-2 w-full">
      <svg width={width} height={height} className="block" role="img" aria-label={`${series.label}: ${series.points.map(point => `${point.label} ${point.value}`).join(", ")}`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={tone} stopOpacity="0.2"/><stop offset="100%" stopColor={tone} stopOpacity="0"/></linearGradient></defs>
        <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="var(--viz-grid)" strokeWidth="1"/>
        {series.points.length > 1 ? <>
          <path d={`${path} L${x(series.points.length - 1)},${height - 1} L${x(0)},${height - 1} Z`} fill={`url(#${gradientId})`}/>
          <path d={path} fill="none" stroke={tone} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </> : null}
        {series.points.map((point, index) => <g key={point.label} onMouseMove={event => show(event, point)} onMouseLeave={hide} style={{ cursor: "pointer" }}>
          {/* An invisible disc gives the 2px dot a hit target big enough to catch. */}
          <circle cx={x(index)} cy={y(point.value)} r="9" fill="transparent"/>
          <circle cx={x(index)} cy={y(point.value)} r={index === series.points.length - 1 ? 3 : 2} fill={point.colour ?? tone} stroke="var(--viz-surface)" strokeWidth={index === series.points.length - 1 ? 1.5 : 0}/>
        </g>)}
      </svg>
    </div>
    {state ? <HoverLayer x={state.x} y={state.y}><TooltipBody title={series.label} subtitle={state.data.label} rows={[{ label: series.valueLabel ?? "Value", value: series.format ? series.format(state.data.value) : String(state.data.value), colour: state.data.colour ?? tone }]}/></HoverLayer> : null}
  </div>;
}

// -------------------------------------------------------------------- heat map
export interface HeatCell { value: number | undefined; title: string; rows: Array<{ label: string; value: string }> }

/** Rounded cells on a single-hue scale. Magnitude is lightness, never a rainbow. */
export function HeatMap({ rowLabels, columnLabels, cell, colour, className, cellHeight = 26, labelWidth = 150, onSelect }: {
  rowLabels: Array<{ key: string; label: string }>;
  columnLabels: string[];
  cell: (rowKey: string, columnIndex: number) => HeatCell;
  colour: (fraction: number) => string;
  className?: string; cellHeight?: number; labelWidth?: number;
  onSelect?: (rowKey: string) => void;
}) {
  const { state, show, hide } = useHoverTooltip<HeatCell>();
  return <div data-viz-host className={cn("relative overflow-x-auto", className)}>
    <div className="min-w-[520px]">
      <div className="flex items-end gap-[2px] pb-1.5">
        <span className="shrink-0" style={{ width: `min(${labelWidth}px, 38%)` }}/>
        {columnLabels.map(label => <span key={label} className="flex-1 truncate text-center text-[10px] text-muted-foreground">{label}</span>)}
      </div>
      <div className="space-y-[2px]">
        {rowLabels.map(row => <div key={row.key} className="flex items-center gap-[2px]">
          {onSelect
            ? <button type="button" onClick={() => onSelect(row.key)} className="shrink-0 truncate pr-2 text-left text-xs text-muted-foreground hover:text-foreground hover:underline" style={{ width: `min(${labelWidth}px, 38%)` }} title={row.label}>{row.label}</button>
            : <span className="shrink-0 truncate pr-2 text-xs text-muted-foreground" style={{ width: `min(${labelWidth}px, 38%)` }} title={row.label}>{row.label}</span>}
          {columnLabels.map((label, index) => {
            const data = cell(row.key, index);
            return <span key={label} onMouseMove={event => show(event, data)} onMouseLeave={hide}
              className="flex-1 rounded-[3px] transition-transform hover:scale-[1.06]"
              style={{ height: cellHeight, background: data.value === undefined ? "var(--viz-track)" : colour(data.value) }}/>;
          })}
        </div>)}
      </div>
    </div>
    {state ? <HoverLayer x={state.x} y={state.y}><TooltipBody title={state.data.title} rows={state.data.rows}/></HoverLayer> : null}
  </div>;
}

/** Key for a sequential scale: the ramp plus its two ends labelled. */
export function ScaleLegend({ colour, low, high, steps = 9 }: { colour: (fraction: number) => string; low: string; high: string; steps?: number }) {
  return <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
    <span>{low}</span>
    <span className="flex gap-[2px]">{Array.from({ length: steps }, (_, index) => <span key={index} className="size-2.5 rounded-[2px]" style={{ background: colour(index / (steps - 1)) }}/>)}</span>
    <span>{high}</span>
  </span>;
}

// ------------------------------------------------------------- cumulative area
export interface CurvePoint { period: string; planned: number; actual?: number | undefined; band?: [number, number] | undefined }

/**
 * Planned as a dashed line, delivered as a solid gradient area, forecast as a shaded
 * band. One value axis — a second scale would make the gap between them meaningless.
 */
export function CumulativeArea({ data, format, todayPeriod, target, targetLabel, height = 260, valueLabel = "Delivered", plannedLabel = "Planned", bandLabel = "Forecast range" }: {
  data: CurvePoint[]; format: (value: number) => string; todayPeriod?: string; target?: number; targetLabel?: string; height?: number;
  valueLabel?: string; plannedLabel?: string; bandLabel?: string;
}) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const TooltipContent = makeRechartsTooltip(payload => {
    const point = payload[0]?.payload as CurvePoint | undefined;
    if (!point) return null;
    const variance = point.actual === undefined ? undefined : point.actual - point.planned;
    return {
      title: point.period,
      rows: [
        { label: plannedLabel, value: format(point.planned), colour: "var(--viz-ink-muted)" },
        ...(point.actual === undefined ? [] : [{ label: valueLabel, value: format(point.actual), colour: "var(--viz-cat-1)" }]),
        ...(point.band ? [{ label: bandLabel, value: `${format(point.band[0])} – ${format(point.band[1])}`, muted: true }] : []),
      ],
      ...(variance === undefined ? {} : { note: `${variance >= 0 ? "Ahead of" : "Behind"} plan by ${format(Math.abs(variance))}` }),
    };
  });
  return <ResponsiveContainer width="100%" height={height}>
    <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--viz-cat-1)" stopOpacity="0.38"/><stop offset="100%" stopColor="var(--viz-cat-1)" stopOpacity="0.02"/></linearGradient></defs>
      <CartesianGrid {...gridProps}/>
      <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" minTickGap={16}/>
      <YAxis {...axisProps} width={58} tickFormatter={value => format(Number(value))}/>
      <Tooltip content={<TooltipContent/>} cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}/>
      <Area type="monotone" dataKey="band" stroke="none" fill="var(--viz-cat-1)" fillOpacity={0.1} isAnimationActive={false} connectNulls/>
      <Line type="monotone" dataKey="planned" stroke="var(--viz-ink-muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false}/>
      <Area type="monotone" dataKey="actual" stroke="var(--viz-cat-1)" strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }} animationDuration={520} connectNulls={false}/>
      {target === undefined ? null : <ReferenceLine y={target} stroke="var(--viz-ink)" strokeDasharray="2 3" strokeWidth={1.5} label={{ value: targetLabel ?? "Target", position: "insideTopRight", fill: "var(--viz-ink-muted)", fontSize: 10 }}/>}
      {todayPeriod ? <ReferenceLine x={todayPeriod} stroke="var(--viz-axis)" strokeWidth={1.5} label={{ value: "Today", position: "top", fill: "var(--viz-ink-muted)", fontSize: 10 }}/> : null}
    </ComposedChart>
  </ResponsiveContainer>;
}
