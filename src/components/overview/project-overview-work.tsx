import { useMemo } from "react";
import { HealthByDimension } from "@/components/overview/health-by-dimension";
import { MilestoneDeliveryProfile } from "@/components/overview/milestone-delivery-profile";
import { MilestoneSlippage } from "@/components/overview/milestone-slippage";
import {
  HighlightReport,
  ScheduleForecastCard,
  TopRisks,
} from "@/components/overview/project-work-panels";
import { useProjectOverview } from "@/hooks/use-project-overview";
import { projectMonths } from "@/services/progress-chart";
import { rankRaid, scheduleStats } from "@/services/project-schedule";
import type { ProjectSummary } from "@/services/hierarchy";

export type OverviewTarget =
  { tab: "status" } | { tab: "raid"; sub: "risks" } | { tab: "plan"; sub: "milestones" };

/**
 * The project overview's light working area (project overview design, Stage 4): schedule
 * forecast, milestone slippage, delivery profile and health by dimension, last highlight report
 * and top risks. Same get_project_overview call as the dark band (shared through the query cache).
 */
export function ProjectOverviewWork({
  project,
  onOpen,
}: {
  project: Pick<ProjectSummary, "id">;
  onOpen: (target: OverviewTarget) => void;
}) {
  const query = useProjectOverview(project.id);
  const data = query.data;
  const built = useMemo(() => {
    if (!data) return null;
    const closed = data.project.state === "closed";
    return {
      closed,
      stats: scheduleStats(data.milestones, data.today),
      months: projectMonths(
        {
          startDate: data.project.startDate,
          baselineFinishDate: data.project.baselineFinishDate,
          forecastFinishDate: data.health?.forecastFinishDate ?? null,
          budget: 0,
          actualsThrough: null,
          closed,
        },
        data.today,
      ),
      raid: rankRaid(data.openRaid, data.riskBands, data.today),
    };
  }, [data]);

  if (!data || !built)
    return query.isSuccess ? null : (
      <div aria-busy aria-label="Loading the overview" className="space-y-4">
        {[120, 320, 300].map((h) => (
          <div
            key={h}
            className="animate-pulse rounded-lg border bg-muted/40"
            style={{ height: h }}
          />
        ))}
      </div>
    );

  const addMilestone = () => onOpen({ tab: "plan", sub: "milestones" });
  return (
    <div className="space-y-4">
      <ScheduleForecastCard health={data.health} stats={built.stats} closed={built.closed} />
      <MilestoneSlippage
        scope="project"
        milestones={data.milestones}
        today={data.today}
        closed={built.closed}
        onAddMilestone={addMilestone}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MilestoneDeliveryProfile
          scope="project"
          milestones={data.milestones}
          months={built.months}
          today={data.today}
          closed={built.closed}
          onAddMilestone={addMilestone}
        />
        {data.health ? (
          <HealthByDimension
            scope="project"
            months={data.healthMonths}
            current={{
              schedule: data.health.schedule,
              financial: data.health.financial,
              effort: data.health.effort,
              issue: data.health.issue,
              benefit: data.health.benefit,
              overall: data.health.overall,
            }}
            startDate={data.project.startDate}
            closed={built.closed}
          />
        ) : null}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <HighlightReport
          report={data.latestReport}
          nextDue={data.health?.nextReportDue ?? null}
          onOpen={() => onOpen({ tab: "status" })}
          onStart={() => onOpen({ tab: "status" })}
        />
        <TopRisks items={built.raid} onOpen={() => onOpen({ tab: "raid", sub: "risks" })} />
      </div>
    </div>
  );
}
