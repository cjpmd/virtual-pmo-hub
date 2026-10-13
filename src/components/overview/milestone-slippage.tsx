import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { AxisStrip, Dumbbell, StatStrip, type DumbbellDatum } from "@/components/charts/primitives";
import { useFormat } from "@/lib/format";
import { todayIso } from "@/lib/today";
import {
  dayNumber,
  getMilestoneMetrics,
  getSlippedMilestones,
  scoreColour,
  slipColour,
  slipSeverity,
  type PortfolioMilestone,
} from "@/services/analytics";

const horizons = [
  { value: "90", label: "90d" },
  { value: "180", label: "6m" },
  { value: "all", label: "All" },
];

/** Largest reforecasts against baseline, as dumbbells (portfolio spec §4). */
export function MilestoneSlippage({
  milestones: allMilestones,
  className,
}: {
  milestones: PortfolioMilestone[];
  className?: string | undefined;
}) {
  const format = useFormat();
  const [horizon, setHorizon] = useState("180");
  const milestoneMetrics = getMilestoneMetrics(allMilestones);
  const slipped = useMemo(() => {
    const limit = horizon === "all" ? Infinity : dayNumber(todayIso()) + Number(horizon);
    return getSlippedMilestones(
      allMilestones.filter((item) => dayNumber(item.forecastDate) <= limit),
      8,
    );
  }, [allMilestones, horizon]);
  const slipRows: DumbbellDatum[] = slipped.map((item) => {
    const severity = slipSeverity(item.slipDays);
    return {
      key: item.id,
      label: item.title,
      sublabel: `${item.projectName} · ${item.ownerName}`,
      from: dayNumber(item.baselineDate),
      to: dayNumber(item.forecastDate),
      colour: slipColour[severity],
      fromLabel: format.date(item.baselineDate),
      toLabel: format.date(item.forecastDate),
      valueLabel: `+${item.slipDays}d`,
      note: `${severity} slip · reforecast from ${format.date(item.baselineDate)}`,
    };
  });
  const slipTicks = slipRows.length
    ? [Math.min(...slipRows.map((row) => row.from)), Math.max(...slipRows.map((row) => row.to))]
    : [];
  return (
    <ChartCard
      className={className}
      title="Milestone slippage"
      subtitle="Largest reforecasts against baseline"
      info="The hollow dot is the baselined date and the filled dot is the current forecast. The length of the connector is the slip; its colour is the severity."
      timeRange={{ value: horizon, options: horizons, onChange: setHorizon }}
      aside={
        <Link
          to="/delivery/milestones"
          className="text-xs font-semibold text-primary hover:underline"
        >
          View all
        </Link>
      }
      legend={
        <>
          <LegendItem colour="var(--viz-ink-muted)" label="Baseline" shape="dot" />
          <LegendItem colour="var(--viz-warning)" label="Up to 14 days" shape="dot" />
          <LegendItem colour="var(--viz-serious)" label="15–30 days" shape="dot" />
          <LegendItem colour="var(--viz-critical)" label="Over 30 days" shape="dot" />
        </>
      }
      csv={{
        name: "milestone-slippage",
        columns: ["Milestone", "Project", "Owner", "Baseline", "Forecast", "Slip days"],
        rows: slipped.map((item) => [
          item.title,
          item.projectName,
          item.ownerName,
          format.date(item.baselineDate),
          format.date(item.forecastDate),
          item.slipDays,
        ]),
      }}
      footer={
        <StatStrip
          items={[
            { label: "Due next 30 days", value: String(milestoneMetrics.upcoming) },
            {
              label: "Overdue",
              value: String(milestoneMetrics.overdue),
              tone: milestoneMetrics.overdue ? "var(--viz-critical)" : undefined,
            },
            {
              label: "Reforecast",
              value: String(milestoneMetrics.slipped),
              tone: "var(--viz-serious)",
            },
            {
              label: "Hit baseline (90d)",
              value: `${milestoneMetrics.percentOnTime}%`,
              tone: scoreColour(milestoneMetrics.percentOnTime),
            },
          ]}
        />
      }
      empty={
        slipRows.length
          ? undefined
          : {
              title: "Nothing has slipped",
              detail: "No incomplete milestone in this window is forecast later than its baseline.",
            }
      }
    >
      <Dumbbell rows={slipRows} />
      {slipTicks.length === 2 ? (
        <AxisStrip
          labelWidth={190}
          ticks={slipTicks.map((day) => format.shortDate(new Date(day * 86400000)))}
        />
      ) : null}
    </ChartCard>
  );
}
