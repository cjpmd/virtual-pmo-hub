import { useMemo } from "react";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { CumulativeArea } from "@/components/charts/plots";
import { getDeliveryCurve } from "@/services/analytics";
import type { MilestoneItem } from "@/services/project-records";

/** Cumulative milestones signed off against the baselined plan (portfolio spec §4). */
export function MilestoneDeliveryProfile({
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
