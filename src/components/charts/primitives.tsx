import { Fragment, type ReactNode } from "react";
import {
  HoverLayer,
  TooltipBody,
  useHoverTooltip,
  type TooltipModel,
} from "@/components/charts/viz-tooltip";
import { cn } from "@/lib/utils";

const pct = (value: number, total: number) => (total ? (value / total) * 100 : 0);
/** Labels give way to the plot on narrow screens rather than squeezing the bars to nothing. */
const gutter = (width: number) => `min(${width}px, 38%)`;
const rounded = (value: number, total: number) => Math.round(pct(value, total));

// ---------------------------------------------------------------- segmented bar
export interface Segment {
  key: string;
  label: string;
  value: number;
  colour: string;
}

/**
 * Replaces the RAG donut. A share of a whole reads far more accurately along one
 * axis than around a circle, and the counts sit next to the labels rather than in
 * a key. Segments are separated by a 2px surface gap.
 */
export function SegmentedBar({
  segments,
  height = 28,
  showInlineLabels = true,
  unit = "",
  onSelect,
  className,
}: {
  segments: Segment[];
  height?: number;
  showInlineLabels?: boolean;
  unit?: string;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  const { state, show, hide } = useHoverTooltip<Segment>();
  if (!total) return null;
  return (
    <div data-viz-host className={cn("relative", className)}>
      <div
        className="flex w-full gap-[2px]"
        style={{ height }}
        role="img"
        aria-label={visible.map((segment) => `${segment.label} ${segment.value}`).join(", ")}
      >
        {visible.map((segment, index) => {
          const share = pct(segment.value, total);
          const Tag = onSelect ? "button" : "div";
          return (
            <Tag
              key={segment.key}
              {...(onSelect
                ? { type: "button" as const, onClick: () => onSelect(segment.key) }
                : {})}
              onMouseMove={(event) => show(event, segment)}
              onMouseLeave={hide}
              className={cn(
                "grid place-items-center overflow-hidden text-[11px] font-semibold transition-opacity hover:opacity-90",
                index === 0 && "rounded-l",
                index === visible.length - 1 && "rounded-r",
              )}
              style={{ width: `${share}%`, background: segment.colour, color: "#fff" }}
            >
              {showInlineLabels && share >= 9 ? (
                <span className="tabular px-1">{segment.value}</span>
              ) : null}
            </Tag>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {visible.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1.5 text-[11px]">
            <span className="size-2.5 rounded-[3px]" style={{ background: segment.colour }} />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="tabular font-semibold text-foreground">
              {segment.value}
              {unit}
            </span>
            <span className="tabular text-muted-foreground">
              ({rounded(segment.value, total)}%)
            </span>
          </span>
        ))}
      </div>
      {state ? (
        <HoverLayer x={state.x} y={state.y}>
          <TooltipBody
            title={state.data.label}
            rows={[
              { label: "Count", value: String(state.data.value), colour: state.data.colour },
              { label: "Share", value: `${rounded(state.data.value, total)}%`, muted: true },
            ]}
          />
        </HoverLayer>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------- sorted bars
export interface BarRow {
  key: string;
  label: string;
  value: number;
  colour?: string;
  note?: string;
  tooltip?: TooltipModel;
}

/** Sorted horizontal bars with the value labelled at the bar end — no axis needed. */
export function SortedBars({
  rows,
  format,
  labelWidth = 150,
  barHeight = 14,
  max,
  onSelect,
  className,
}: {
  rows: BarRow[];
  format: (value: number) => string;
  labelWidth?: number;
  barHeight?: number;
  max?: number;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  const ceiling = max ?? Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  const { state, show, hide } = useHoverTooltip<BarRow>();
  return (
    <div data-viz-host className={cn("relative space-y-2", className)}>
      {rows.map((row) => {
        const Tag = onSelect ? "button" : "div";
        return (
          <Tag
            key={row.key}
            {...(onSelect ? { type: "button" as const, onClick: () => onSelect(row.key) } : {})}
            onMouseMove={(event) => show(event, row)}
            onMouseLeave={hide}
            className={cn(
              "flex w-full items-center gap-3 rounded text-left transition-colors",
              onSelect && "hover:bg-accent/40",
            )}
          >
            <span
              className="shrink-0 truncate text-xs text-muted-foreground"
              style={{ width: gutter(labelWidth) }}
              title={row.label}
            >
              {row.label}
            </span>
            <span
              className="relative min-w-0 flex-1 rounded-full"
              style={{ height: barHeight, background: "var(--viz-track)" }}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(1.5, pct(Math.abs(row.value), ceiling))}%`,
                  background: row.colour ?? "var(--viz-cat-1)",
                }}
              />
            </span>
            <span
              className="tabular shrink-0 text-right text-xs font-semibold text-foreground"
              style={{ minWidth: 62 }}
            >
              {format(row.value)}
            </span>
          </Tag>
        );
      })}
      {state ? (
        <HoverLayer x={state.x} y={state.y}>
          <TooltipBody
            {...(state.data.tooltip ?? {
              title: state.data.label,
              rows: [
                {
                  label: "Value",
                  value: format(state.data.value),
                  colour: state.data.colour ?? "var(--viz-cat-1)",
                },
              ],
              ...(state.data.note ? { note: state.data.note } : {}),
            })}
          />
        </HoverLayer>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------------------- bullet
export interface BulletDatum {
  key: string;
  label: string;
  actual: number;
  forecast?: number;
  target: number;
  note?: string;
}

/**
 * Bullet chart for budget against forecast: the bar is spend to date, the marker is
 * the forecast and the vertical rule is the approved budget. Three numbers, one row,
 * no second axis.
 */
export function BulletChart({
  rows,
  format,
  labelWidth = 160,
  rowGap = 12,
  onSelect,
  className,
}: {
  rows: BulletDatum[];
  format: (value: number) => string;
  labelWidth?: number;
  rowGap?: number;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  const ceiling =
    Math.max(1, ...rows.flatMap((row) => [row.actual, row.forecast ?? 0, row.target])) * 1.08;
  const { state, show, hide } = useHoverTooltip<BulletDatum>();
  return (
    <div data-viz-host className={cn("relative flex flex-col", className)} style={{ gap: rowGap }}>
      {rows.map((row) => {
        const over = (row.forecast ?? row.actual) > row.target;
        const Tag = onSelect ? "button" : "div";
        return (
          <Tag
            key={row.key}
            {...(onSelect ? { type: "button" as const, onClick: () => onSelect(row.key) } : {})}
            onMouseMove={(event) => show(event, row)}
            onMouseLeave={hide}
            className={cn(
              "flex w-full items-center gap-3 rounded text-left transition-colors",
              onSelect && "hover:bg-accent/40",
            )}
          >
            <span
              className="shrink-0 truncate text-xs text-muted-foreground"
              style={{ width: gutter(labelWidth) }}
              title={row.label}
            >
              {row.label}
            </span>
            <span className="relative min-w-0 flex-1" style={{ height: 18 }}>
              <span
                className="absolute inset-x-0 top-1/2 h-[18px] -translate-y-1/2 rounded"
                style={{ background: "var(--viz-track)" }}
              />
              <span
                className="absolute top-1/2 left-0 h-2.5 -translate-y-1/2 rounded-r rounded-l"
                style={{ width: `${pct(row.actual, ceiling)}%`, background: "var(--viz-cat-1)" }}
              />
              {row.forecast === undefined ? null : (
                <span
                  title="Forecast"
                  className="absolute top-1/2 h-[18px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${pct(row.forecast, ceiling)}%`,
                    background: over ? "var(--viz-critical)" : "var(--viz-cat-3)",
                    boxShadow: "0 0 0 2px var(--viz-surface)",
                  }}
                />
              )}
              <span
                title="Budget"
                className="absolute top-1/2 h-[24px] w-[2px] -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pct(row.target, ceiling)}%`, background: "var(--viz-ink)" }}
              />
            </span>
            <span
              className="tabular shrink-0 text-right text-xs font-semibold"
              style={{ minWidth: 70, color: over ? "var(--viz-negative)" : "var(--viz-ink)" }}
            >
              {format(row.forecast ?? row.actual)}
            </span>
          </Tag>
        );
      })}
      {state ? (
        <HoverLayer x={state.x} y={state.y}>
          <TooltipBody
            title={state.data.label}
            rows={[
              {
                label: "Spend to date",
                value: format(state.data.actual),
                colour: "var(--viz-cat-1)",
              },
              ...(state.data.forecast === undefined
                ? []
                : [
                    {
                      label: "Forecast",
                      value: format(state.data.forecast),
                      colour: "var(--viz-cat-3)",
                    },
                  ]),
              { label: "Budget", value: format(state.data.target), colour: "var(--viz-ink)" },
              {
                label: "Variance",
                value: format((state.data.forecast ?? state.data.actual) - state.data.target),
                muted: true,
              },
            ]}
            {...(state.data.note ? { note: state.data.note } : {})}
          />
        </HoverLayer>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------- dumbbell
export interface DumbbellDatum {
  key: string;
  label: string;
  sublabel?: string;
  from: number;
  to: number;
  colour: string;
  fromLabel: string;
  toLabel: string;
  valueLabel?: string;
  note?: string;
}

/**
 * Baseline dot to forecast dot. The length of the connector *is* the slip, which a
 * pair of bars hides and a table makes you subtract.
 */
export function Dumbbell({
  rows,
  labelWidth = 190,
  min,
  max,
  onSelect,
  className,
}: {
  rows: DumbbellDatum[];
  labelWidth?: number;
  min?: number;
  max?: number;
  onSelect?: (key: string) => void;
  className?: string;
}) {
  const values = rows.flatMap((row) => [row.from, row.to]);
  const low = min ?? Math.min(...values),
    high = max ?? Math.max(...values);
  const span = high - low || 1;
  const at = (value: number) => ((value - low) / span) * 100;
  const { state, show, hide } = useHoverTooltip<DumbbellDatum>();
  return (
    <div data-viz-host className={cn("relative space-y-2.5", className)}>
      {rows.map((row) => {
        const start = Math.min(at(row.from), at(row.to)),
          end = Math.max(at(row.from), at(row.to));
        const Tag = onSelect ? "button" : "div";
        return (
          <Tag
            key={row.key}
            {...(onSelect ? { type: "button" as const, onClick: () => onSelect(row.key) } : {})}
            onMouseMove={(event) => show(event, row)}
            onMouseLeave={hide}
            className={cn(
              "flex w-full items-center gap-3 rounded text-left transition-colors",
              onSelect && "hover:bg-accent/40",
            )}
          >
            <span className="min-w-0 shrink-0" style={{ width: gutter(labelWidth) }}>
              <span className="block truncate text-xs text-foreground" title={row.label}>
                {row.label}
              </span>
              {row.sublabel ? (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {row.sublabel}
                </span>
              ) : null}
            </span>
            <span className="relative min-w-0 flex-1" style={{ height: 16 }}>
              <span
                className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                style={{ background: "var(--viz-grid)" }}
              />
              <span
                className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                style={{
                  left: `${start}%`,
                  width: `${Math.max(0.4, end - start)}%`,
                  background: row.colour,
                  opacity: 0.55,
                }}
              />
              <span
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${at(row.from)}%`,
                  background: "var(--viz-surface)",
                  border: "2px solid var(--viz-ink-muted)",
                }}
              />
              <span
                className="absolute top-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${at(row.to)}%`,
                  background: row.colour,
                  boxShadow: "0 0 0 2px var(--viz-surface)",
                }}
              />
            </span>
            <span
              className="tabular shrink-0 text-right text-xs font-semibold"
              style={{ minWidth: 58, color: row.colour }}
            >
              {row.valueLabel ?? row.toLabel}
            </span>
          </Tag>
        );
      })}
      {state ? (
        <HoverLayer x={state.x} y={state.y}>
          <TooltipBody
            title={state.data.label}
            {...(state.data.sublabel ? { subtitle: state.data.sublabel } : {})}
            rows={[
              { label: "Baseline", value: state.data.fromLabel, colour: "var(--viz-ink-muted)" },
              { label: "Forecast", value: state.data.toLabel, colour: state.data.colour },
            ]}
            {...(state.data.note ? { note: state.data.note } : {})}
          />
        </HoverLayer>
      ) : null}
    </div>
  );
}

/** Axis strip for a dumbbell or bullet row set, aligned to the same label gutter. */
export function AxisStrip({
  ticks,
  labelWidth = 190,
  trailingWidth = 58,
}: {
  ticks: string[];
  labelWidth?: number;
  trailingWidth?: number;
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="shrink-0" style={{ width: gutter(labelWidth) }} />
      <span className="flex min-w-0 flex-1 justify-between text-[10px] text-muted-foreground">
        {ticks.map((tick, index) => (
          <Fragment key={`${tick}-${index}`}>
            <span className="tabular">{tick}</span>
          </Fragment>
        ))}
      </span>
      <span className="shrink-0" style={{ width: trailingWidth }} />
    </div>
  );
}

/** Row of small captioned figures under a chart. */
export function StatStrip({
  items,
}: {
  items: Array<{ label: string; value: string; tone?: string | undefined; icon?: ReactNode }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <p
            className="tabular font-display text-lg font-semibold leading-none"
            style={item.tone ? { color: item.tone } : undefined}
          >
            {item.value}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
