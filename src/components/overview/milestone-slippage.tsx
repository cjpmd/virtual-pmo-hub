import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
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
import type { ProjectOverviewMilestone } from "@/services/project-overview";
import { scheduleStats, slipRows, type SlipBand } from "@/services/project-schedule";

const horizons = [
  { value: "90", label: "90d" },
  { value: "180", label: "6m" },
  { value: "all", label: "All" },
];

type Props =
  | { scope?: "portfolio"; milestones: PortfolioMilestone[]; className?: string | undefined }
  | {
      scope: "project";
      milestones: ProjectOverviewMilestone[];
      today: string;
      /** Closed projects show final values: no today marker. */
      closed?: boolean | undefined;
      /** Opens the milestones list to add one (empty state). */
      onAddMilestone?: (() => void) | undefined;
      className?: string | undefined;
    };

/**
 * Milestone slippage as dumbbells (portfolio spec §4). Portfolio: the largest reforecasts in a
 * range. Project: every milestone, by date or by slip, with today marked through every row.
 */
export function MilestoneSlippage(props: Props) {
  return props.scope === "project" ? (
    <ProjectSlippage {...props} />
  ) : (
    <PortfolioSlippage milestones={props.milestones} className={props.className} />
  );
}

const BAND_COLOUR: Record<SlipBand, string> = {
  on_time: "var(--viz-good)",
  minor: "var(--viz-warning)",
  material: "var(--viz-serious)",
  severe: "var(--viz-critical)",
};
/** Text-safe versions of the band colours (4.5:1 on the card) for the value labels. */
const BAND_TEXT: Record<SlipBand, string> = {
  on_time: "var(--health-good-foreground)",
  minor: "var(--health-warn-foreground)",
  material: "var(--health-warn-foreground)",
  severe: "var(--health-bad-foreground)",
};
const scoreText = (percent: number) =>
  percent >= 80
    ? "var(--health-good-foreground)"
    : percent >= 60
      ? "var(--health-warn-foreground)"
      : "var(--health-bad-foreground)";
const sorts = [
  { value: "date", label: "By date" },
  { value: "slip", label: "By slip" },
];

function ProjectSlippage({
  milestones,
  today,
  closed,
  onAddMilestone,
  className,
}: Extract<Props, { scope: "project" }>) {
  const format = useFormat();
  const [sort, setSort] = useState<"date" | "slip">("date");
  const stats = useMemo(() => scheduleStats(milestones, today), [milestones, today]);
  const rows = useMemo(() => slipRows(milestones, today, sort), [milestones, today, sort]);
  const data: DumbbellDatum[] = rows.map((row) => ({
    key: row.id,
    label: row.title,
    sublabel: row.subtitle,
    from: dayNumber(row.baselineDate),
    to: dayNumber(row.date),
    colour: BAND_COLOUR[row.band],
    textColour: BAND_TEXT[row.band],
    fromLabel: format.date(row.baselineDate),
    toLabel: format.date(row.date),
    valueLabel: row.slip > 0 ? `+${row.slip}d` : "On time",
    dashed: !row.delivered,
    toKind: row.delivered ? "Delivered" : "Forecast",
    note: row.subtitle,
  }));
  const todayDay = dayNumber(today);
  const days = [...data.flatMap((row) => [row.from, row.to]), ...(closed ? [] : [todayDay])];
  const span = data.length ? [Math.min(...days), Math.max(...days)] : [];
  return (
    <ChartCard
      className={className}
      title="Milestone slippage"
      subtitle="Every milestone on this project, baseline against actual or forecast"
      info="The hollow dot is the baselined date and the filled dot is the actual date for delivered milestones, or the current forecast for the rest. Solid connectors are delivered, dashed are not yet delivered; the colour is the slip band. The dashed vertical line is today."
      timeRange={{ value: sort, options: sorts, onChange: (v) => setSort(v as "date" | "slip") }}
      legend={
        <>
          <LegendItem colour="var(--viz-ink-muted)" label="Baseline" shape="dot" />
          <LegendItem colour="var(--viz-good)" label="On time" shape="dot" />
          <LegendItem colour="var(--viz-warning)" label="Up to 14 days" shape="dot" />
          <LegendItem colour="var(--viz-serious)" label="15–30 days" shape="dot" />
          <LegendItem colour="var(--viz-critical)" label="Over 30 days" shape="dot" />
          <LegendItem colour="var(--viz-ink-muted)" label="Not yet delivered" shape="dashed" />
        </>
      }
      csv={{
        name: "project-milestone-slippage",
        columns: ["Milestone", "Status", "Baseline", "Actual or forecast", "Slip days"],
        rows: rows.map((row) => [
          row.title,
          row.subtitle,
          format.date(row.baselineDate),
          format.date(row.date),
          row.slip,
        ]),
      }}
      footer={
        <StatStrip
          items={[
            { label: "Due next 30 days", value: String(stats.dueNext30) },
            {
              label: "Overdue",
              value: String(stats.overdue),
              tone: stats.overdue ? "var(--health-bad-foreground)" : undefined,
            },
            {
              label: "Reforecast",
              value: String(stats.reforecast),
              tone: stats.reforecast ? "var(--health-warn-foreground)" : undefined,
            },
            {
              label: "Hit baseline",
              value: stats.hitBaseline === null ? "—" : `${stats.hitBaseline}%`,
              tone: stats.hitBaseline === null ? undefined : scoreText(stats.hitBaseline),
            },
          ]}
        />
      }
      empty={
        data.length
          ? undefined
          : {
              title: "No milestones yet",
              detail: "Add milestones with baseline dates to track slippage here.",
              action: onAddMilestone ? (
                <Button size="sm" onClick={onAddMilestone}>
                  Add milestone
                </Button>
              ) : undefined,
            }
      }
    >
      <Dumbbell
        rows={data}
        {...(span.length === 2 ? { min: span[0], max: span[1] } : {})}
        marker={closed ? undefined : { value: todayDay, label: `Today, ${format.date(today)}` }}
      />
      {span.length === 2 ? (
        <AxisStrip
          labelWidth={190}
          ticks={span.map((day) => format.shortDate(new Date((day as number) * 86400000)))}
        />
      ) : null}
    </ChartCard>
  );
}

function PortfolioSlippage({
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
