import { useMemo } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { SmallMultiples } from "@/components/charts/plots";
import { getDimensionScores, scoreColour } from "@/services/analytics";
import type { ProjectSummary } from "@/services/hierarchy";
import type { ProjectSnapshot } from "@/services/trends";

/** Share of active projects green per health dimension, one small plot each (portfolio spec §4). */
export function HealthByDimension({
  active,
  projectHistory,
  percentOnTrack,
  className,
}: {
  active: ProjectSummary[];
  projectHistory: ProjectSnapshot[];
  /** Live % of active projects green, for the Overall caption. */
  percentOnTrack: number;
  className?: string | undefined;
}) {
  const {
    periods: dimensionPeriods,
    scores: dimensions,
    overall: overallTrend,
  } = useMemo(() => getDimensionScores(active, projectHistory), [active, projectHistory]);
  return (
    <ChartCard
      className={className}
      title="Health by dimension"
      subtitle="Share of active projects reporting green"
      info="Each dimension is scored independently, so a portfolio that is amber overall can still be green on cost. One plot per dimension keeps the scales comparable."
      csv={{
        name: "health-dimensions",
        columns: ["Dimension", ...dimensionPeriods],
        rows: dimensions.map((dimension) => [dimension.label, ...dimension.trend.points]),
      }}
      footer={`Worst-of across these five dimensions sets each project's overall health. ${
        dimensions
          .filter((dimension) => dimension.scored < dimension.total)
          .map(
            (dimension) =>
              `${dimension.label} is scored on ${dimension.scored} of ${dimension.total}`,
          )
          .join("; ") || "Every dimension is scored on all active projects"
      }.`}
    >
      <SmallMultiples
        className="xl:grid-cols-2"
        domain={[0, 100]}
        series={[
          ...dimensions.map((dimension) => ({
            key: dimension.key,
            label: dimension.label,
            caption: `${dimension.percent}%`,
            captionTone: scoreColour(dimension.percent),
            valueLabel: "Projects green",
            format: (value: number) => `${value}%`,
            points: dimension.trend.points.map((value, index) => ({
              label: dimensionPeriods[index] ?? "",
              value,
              colour: scoreColour(value),
            })),
          })),
          {
            key: "overall",
            label: "Overall",
            caption: `${percentOnTrack}%`,
            captionTone: scoreColour(percentOnTrack),
            valueLabel: "Projects green",
            format: (value: number) => `${value}%`,
            points: overallTrend.points.map((value, index) => ({
              label: dimensionPeriods[index] ?? "",
              value,
              colour: scoreColour(value),
            })),
          },
        ]}
      />
    </ChartCard>
  );
}
