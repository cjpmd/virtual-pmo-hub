import { useMemo } from "react";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { CumulativeArea } from "@/components/charts/plots";
import { getDeliveryCurve } from "@/services/analytics";
import type { MilestoneItem } from "@/services/project-records";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/lib/format";
import type { ProjectOverviewMilestone } from "@/services/project-overview";
import { deliveryProfile, scheduleStats } from "@/services/project-schedule";

type Props =
  | { scope?: "portfolio"; milestones: MilestoneItem[]; className?: string | undefined }
  | {
      scope: "project";
      milestones: ProjectOverviewMilestone[];
      /** The project's months (YYYY-MM), start to the later of baseline and forecast finish. */
      months: string[];
      today: string;
      /** Closed projects show final values: no forecast band. */
      closed: boolean;
      onAddMilestone?: (() => void) | undefined;
      className?: string | undefined;
    };

/** Cumulative milestones signed off against the baselined plan (portfolio spec §4). */
export function MilestoneDeliveryProfile(props: Props) {
  return props.scope === "project" ? (
    <ProjectDeliveryProfile {...props} />
  ) : (
    <PortfolioDeliveryProfile milestones={props.milestones} className={props.className} />
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ProjectDeliveryProfile({
  milestones,
  months,
  today,
  closed,
  onAddMilestone,
  className,
}: Extract<Props, { scope: "project" }>) {
  const format = useFormat();
  const profile = useMemo(
    () => deliveryProfile(milestones, months, today, closed),
    [milestones, months, today, closed],
  );
  const stats = useMemo(() => scheduleStats(milestones, today), [milestones, today]);
  const short = (iso: string) => format.shortDate(new Date(`${iso}T00:00:00Z`));
  const sentence = [
    `${profile.deliveredToDate} of ${plural(profile.plannedToDate, "milestone")} baselined for delivery by now ${profile.plannedToDate === 1 ? "has" : "have"} been signed off, from ${stats.total} on this project.`,
    stats.delivered
      ? `${stats.onTime} landed on time, average slip is ${plural(Math.round(stats.averageSlip ?? 0), "day")}, and ${stats.overdue} ${stats.overdue === 1 ? "is" : "are"} overdue.`
      : `None signed off yet; ${stats.overdue} ${stats.overdue === 1 ? "is" : "are"} overdue.`,
    profile.range
      ? `All ${stats.total} are forecast between ${short(profile.range.early)} and ${short(profile.range.late)}, against a baseline of ${short(profile.range.baseline)}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <ChartCard
      className={className}
      title="Milestone delivery profile"
      subtitle="Cumulative milestones signed off against the baselined plan"
      info="The dashed line is how many milestones the baseline expected by each month. The filled area is what has been signed off, with a dot for each month a milestone was signed off (green on time, amber late). After today the band runs from every open milestone landing on its forecast date to landing later by the project's average slip (at least 7 days)."
      legend={
        <>
          <LegendItem colour="var(--viz-ink-muted)" label="Baselined plan" shape="dashed" />
          <LegendItem colour="var(--viz-cat-1)" label="Signed off" shape="line" />
          {closed ? null : <LegendItem colour="var(--viz-cat-1)" label="Forecast range" />}
          <LegendItem colour="var(--viz-good)" label="On time" shape="dot" />
          <LegendItem colour="var(--viz-warning)" label="Late" shape="dot" />
        </>
      }
      csv={{
        name: "project-delivery-profile",
        columns: ["Month", "Baselined", "Signed off", "Forecast late", "Forecast early"],
        rows: profile.points.map((point) => [
          point.period,
          point.planned,
          point.actual,
          point.band?.[0],
          point.band?.[1],
        ]),
      }}
      footer={milestones.length ? sentence : undefined}
      empty={
        milestones.length
          ? undefined
          : {
              title: "No milestones yet",
              detail: "The profile appears once milestones have baseline dates.",
              action: onAddMilestone ? (
                <Button size="sm" onClick={onAddMilestone}>
                  Add milestone
                </Button>
              ) : undefined,
            }
      }
    >
      <CumulativeArea
        data={profile.points}
        format={(value) => String(Math.round(value))}
        {...(profile.todayPeriod ? { todayPeriod: profile.todayPeriod } : {})}
        valueLabel="Signed off"
        plannedLabel="Baselined plan"
        bandLabel="Forecast range"
        height={248}
        integerTicks
        dotColour={(_, index) => {
          const point = profile.points[index];
          return point?.signedOff
            ? point.late
              ? "var(--viz-warning)"
              : "var(--viz-good)"
            : undefined;
        }}
        gap={
          profile.behind && !closed
            ? {
                from: profile.deliveredToDate,
                to: profile.plannedToDate,
                label: `${profile.behind} behind plan`,
              }
            : undefined
        }
      />
    </ChartCard>
  );
}

function PortfolioDeliveryProfile({
  milestones: allMilestones,
  className,
}: {
  milestones: MilestoneItem[];
  className?: string | undefined;
}) {
  const delivery = useMemo(() => getDeliveryCurve(allMilestones), [allMilestones]);
  return (
    <ChartCard
      className={className}
      title="Milestone delivery profile"
      subtitle="Cumulative milestones signed off against the baselined plan"
      info="The dashed line is what the baselined plans said would be complete by now. The filled area is what has actually been signed off. The shaded band ahead of today is the current forecast, allowing for reforecasting."
      legend={
        <>
          <LegendItem colour="var(--viz-ink-muted)" label="Baselined plan" shape="dashed" />
          <LegendItem colour="var(--viz-cat-1)" label="Signed off" shape="line" />
          <LegendItem colour="var(--viz-cat-1)" label="Forecast range" />
        </>
      }
      csv={{
        name: "delivery-profile",
        columns: ["Month", "Planned", "Signed off", "Forecast low", "Forecast high"],
        rows: delivery.points.map((point) => [
          point.period,
          point.planned,
          point.actual,
          point.band?.[0],
          point.band?.[1],
        ]),
      }}
      footer={`${delivery.delivered} of ${delivery.plannedToDate} milestones baselined for delivery by now have been signed off, from ${delivery.total} across the portfolio.`}
    >
      <CumulativeArea
        data={delivery.points}
        format={(value) => String(Math.round(value))}
        todayPeriod={delivery.todayPeriod}
        valueLabel="Signed off"
        plannedLabel="Baselined plan"
        bandLabel="Forecast range"
        height={248}
      />
    </ChartCard>
  );
}
