// The recharts half of CumulativeArea (GL-18): plots.tsx loads this on demand so pages that only
// use the SVG plots don't download recharts.
import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisProps, gridProps } from "@/lib/chart-theme";
import { makeRechartsTooltip } from "@/components/charts/viz-tooltip";
import type { CurvePoint } from "./plots";

/**
 * Planned as a dashed line, delivered as a solid gradient area, forecast as a shaded
 * band. One value axis — a second scale would make the gap between them meaningless.
 */
export function CumulativeAreaChart({
  data,
  format,
  todayPeriod,
  target,
  targetLabel,
  height = 260,
  valueLabel = "Delivered",
  plannedLabel = "Planned",
  bandLabel = "Forecast range",
  dotColour,
  gap,
  integerTicks = false,
}: {
  data: CurvePoint[];
  format: (value: number) => string;
  todayPeriod?: string;
  target?: number;
  targetLabel?: string;
  height?: number;
  valueLabel?: string;
  plannedLabel?: string;
  bandLabel?: string;
  /** A dot on the actual line where this returns a colour (e.g. on time / late sign-offs). */
  dotColour?: ((point: CurvePoint, index: number) => string | undefined) | undefined;
  /** A bracket at today between actual and planned, labelled (e.g. "1 behind plan"). */
  gap?: { from: number; to: number; label: string } | undefined;
  /** Whole-number value ticks only (small counts). */
  integerTicks?: boolean;
}) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const TooltipContent = makeRechartsTooltip((payload) => {
    const point = payload[0]?.payload as CurvePoint | undefined;
    if (!point) return null;
    const variance = point.actual === undefined ? undefined : point.actual - point.planned;
    return {
      title: point.period,
      rows: [
        { label: plannedLabel, value: format(point.planned), colour: "var(--viz-ink-muted)" },
        ...(point.actual === undefined
          ? []
          : [{ label: valueLabel, value: format(point.actual), colour: "var(--viz-cat-1)" }]),
        ...(point.band
          ? [
              {
                label: bandLabel,
                value: `${format(point.band[0])} – ${format(point.band[1])}`,
                muted: true,
              },
            ]
          : []),
      ],
      ...(variance === undefined
        ? {}
        : {
            note: `${variance >= 0 ? "Ahead of" : "Behind"} plan by ${format(Math.abs(variance))}`,
          }),
    };
  });
  const renderDot = (props: { cx?: number; cy?: number; index?: number; payload?: CurvePoint }) => {
    const colour =
      dotColour && props.payload && props.index !== undefined
        ? dotColour(props.payload, props.index)
        : undefined;
    return colour && props.cx !== undefined && props.cy !== undefined ? (
      <circle
        key={`dot-${props.index}`}
        cx={props.cx}
        cy={props.cy}
        r={4.5}
        fill={colour}
        stroke="var(--viz-surface)"
        strokeWidth={1.5}
      />
    ) : (
      <g key={`dot-${props.index}`} />
    );
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--viz-cat-1)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--viz-cat-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="period" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
        <YAxis
          {...axisProps}
          width={58}
          tickFormatter={(value) => format(Number(value))}
          {...(integerTicks ? { allowDecimals: false } : {})}
        />
        <Tooltip
          content={<TooltipContent />}
          cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
        />
        <Area
          type="monotone"
          dataKey="band"
          stroke="none"
          fill="var(--viz-cat-1)"
          fillOpacity={0.1}
          isAnimationActive={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="planned"
          stroke="var(--viz-ink-muted)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="actual"
          stroke="var(--viz-cat-1)"
          strokeWidth={2.5}
          fill={`url(#${gradientId})`}
          dot={dotColour ? renderDot : false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--viz-surface)" }}
          animationDuration={520}
          connectNulls={false}
        />
        {gap && todayPeriod ? (
          <ReferenceLine
            segment={[
              { x: todayPeriod, y: gap.from },
              { x: todayPeriod, y: gap.to },
            ]}
            stroke="var(--viz-critical)"
            strokeWidth={2.5}
            label={{
              value: gap.label,
              position: "right",
              fill: "var(--viz-critical)",
              fontSize: 11,
              fontWeight: 600,
            }}
          />
        ) : null}
        {target === undefined ? null : (
          <ReferenceLine
            y={target}
            stroke="var(--viz-ink)"
            strokeDasharray="2 3"
            strokeWidth={1.5}
            label={{
              value: targetLabel ?? "Target",
              position: "insideTopRight",
              fill: "var(--viz-ink-muted)",
              fontSize: 10,
            }}
          />
        )}
        {todayPeriod ? (
          <ReferenceLine
            x={todayPeriod}
            stroke="var(--viz-axis)"
            strokeWidth={1.5}
            label={{ value: "Today", position: "top", fill: "var(--viz-ink-muted)", fontSize: 10 }}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
