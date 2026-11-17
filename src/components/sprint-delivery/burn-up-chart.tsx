import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LegendItem } from "@/components/charts/chart-card";
import { type ForecastResult } from "@/services/forecast";
import { closedPeriodCount, periodEndDate, type ProjectDelivery } from "@/services/sprints";
import { fmt } from "./shared";
import { burnUpSeries } from "./report-data";

export function BurnUpChart({
  d,
  f,
  height = 300,
}: {
  d: ProjectDelivery;
  f: ForecastResult;
  height?: number;
}) {
  const rows = useMemo(() => burnUpSeries(d, f), [d, f]);
  const recovery = f.recoveryPeriod !== null && f.gapUnits > 0 ? rows[f.recoveryPeriod] : undefined;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <Tooltip />
          <Area
            dataKey="cone"
            name="Best–worst range"
            stroke="none"
            fill="var(--viz-cat-2)"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
          <Line
            dataKey="scope"
            name="Scope"
            stroke="var(--viz-ink-muted)"
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="forecastScope"
            name="Forecast scope"
            stroke="var(--viz-ink-muted)"
            strokeDasharray="1 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="planned"
            name="Baseline plan"
            stroke="var(--viz-cat-1)"
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="done"
            name="Done"
            stroke="var(--viz-good)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="forecast"
            name="Forecast"
            stroke="var(--viz-cat-2)"
            strokeWidth={2}
            strokeDasharray="2 3"
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceLine
            x={fmt(periodEndDate(d, closedPeriodCount(d)))}
            stroke="var(--viz-axis)"
            label={{ value: "Today", fontSize: 10, position: "top" }}
          />
          {recovery && (
            <ReferenceDot
              x={recovery.label}
              y={recovery.planned}
              r={6}
              fill="var(--viz-cat-2)"
              stroke="var(--background)"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
export const burnLegend = (
  <>
    <LegendItem colour="var(--viz-ink-muted)" label="Scope" shape="dashed" />
    <LegendItem colour="var(--viz-cat-1)" label="Baseline plan" shape="dashed" />
    <LegendItem colour="var(--viz-good)" label="Done" shape="line" />
    <LegendItem colour="var(--viz-cat-2)" label="Forecast and best–worst range" shape="dot" />
  </>
);
