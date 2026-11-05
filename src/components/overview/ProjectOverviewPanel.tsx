// Shared project overview panel: three-column card grid (Summary | Milestones + Health |
// Highlight report + Risks). Used by the portfolio row panel AND the report deep-dive block so
// both render the identical component. Layout responds to the container's width via CSS
// container queries, not the viewport, so it works inside the report preview and viewer too.
import { useMemo } from "react";
import { HealthByDimension } from "@/components/overview/health-by-dimension";
import { MilestoneSlippage } from "@/components/overview/milestone-slippage";
import { HighlightReport, TopRisks } from "@/components/overview/project-work-panels";
import { HealthMark } from "@/components/overview/project-watchlist";
import { Chip, Fact, Lifecycle } from "@/components/project-header";
import { usePhases } from "@/hooks/use-hierarchy";
import { useFormat } from "@/lib/format";
import { TASK_SOURCE } from "@/lib/project-tabs";
import { cn } from "@/lib/utils";
import { divergenceText } from "@/services/assurance";
import type { Health } from "@/data/types";
import type {
  LatestReport,
  OpenRaidItem,
  ProjectHealthMonth,
  ProjectOverviewHealth,
  ProjectOverviewMilestone,
  RiskBand,
} from "@/services/project-overview";
import { rankRaid } from "@/services/project-schedule";
import { term, useSettings } from "@/services/settings";

const WORD: Record<Health, string> = {
  "On Track": "Green",
  "At Risk": "Amber",
  "Off Track": "Red",
  "Not Set": "Not set",
};
const SLIP_TEXT: Record<Health, string> = {
  "On Track": "text-health-good-foreground",
  "At Risk": "text-health-warn-foreground",
  "Off Track": "text-health-bad-foreground",
  "Not Set": "text-muted-foreground",
};

export interface PanelProject {
  id: string;
  code: string;
  name: string;
  tier: string;
  priority: string;
  state: string;
  /** Phase UUID from the hierarchy (null when only the phase name is known, e.g. in report blocks). */
  phaseId: string | null;
  managerName: string | null;
  sponsorName: string | null;
  projectOfficerName: string | null;
  startDate: string | null;
  baselineFinishDate: string | null;
}

export interface ProjectOverviewPanelProps {
  project: PanelProject;
  taskSource?: string | undefined;
  health: ProjectOverviewHealth | null;
  milestones: ProjectOverviewMilestone[];
  /** As-at date (YYYY-MM-DD). Used for milestone and RAID age calculations. */
  today: string;
  healthMonths: ProjectHealthMonth[];
  latestReport: LatestReport | null;
  riskBands: RiskBand[];
  openRaid: OpenRaidItem[];
  /**
   * Navigate to a tab on the project page. If omitted the navigation buttons are still
   * rendered (for accessibility) but clicking them is a no-op. All buttons are hidden in print.
   */
  onNavigate?: ((tab: string, sub?: string) => void) | undefined;
}

export function ProjectOverviewPanel({
  project,
  taskSource,
  health,
  milestones,
  today,
  healthMonths,
  latestReport,
  riskBands,
  openRaid,
  onNavigate,
}: ProjectOverviewPanelProps) {
  const closed = project.state === "closed";
  const raid = useMemo(() => rankRaid(openRaid, riskBands, today), [openRaid, riskBands, today]);

  return (
    // @container: 3-col split responds to this element's width, not the viewport.
    // [&_button]:print:hidden: hides all action buttons in print/PDF.
    <div className="@container [&_button]:print:hidden" data-testid="project-overview-panel">
      <div className="grid gap-4 @[640px]:grid-cols-3">
        {/* Column 1: summary facts */}
        <SummaryCard project={project} health={health} taskSource={taskSource} />
        {/* Column 2: milestones + health history. Hidden below 640 px container. */}
        <div className="hidden min-w-0 flex-col gap-4 @[640px]:flex">
          <MilestoneSlippage
            scope="project"
            size="compact"
            milestones={milestones}
            today={today}
            closed={closed}
          />
          {health ? (
            <HealthByDimension
              scope="project"
              size="compact"
              months={healthMonths}
              current={{
                schedule: health.schedule,
                financial: health.financial,
                effort: health.effort,
                issue: health.issue,
                benefit: health.benefit,
                overall: health.overall,
              }}
              startDate={project.startDate}
              closed={closed}
            />
          ) : null}
        </div>
        {/* Column 3: last highlight report + top risks. TopRisks hidden below 640 px. */}
        <div className="flex min-w-0 flex-col gap-4">
          <HighlightReport
            size="compact"
            report={latestReport}
            nextDue={health?.nextReportDue ?? null}
            onOpen={() => onNavigate?.("status")}
            onStart={() => onNavigate?.("status")}
          />
          <div className="hidden @[640px]:block">
            <TopRisks items={raid} onOpen={() => onNavigate?.("raid", "risks")} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  project,
  health,
  taskSource,
}: {
  project: PanelProject;
  health: ProjectOverviewHealth | null;
  taskSource: string | undefined;
}) {
  const format = useFormat();
  const settings = useSettings();
  const phases = usePhases();
  const late = health?.finishVsBaselineDays ?? 0;
  const declared = health?.declared ?? null;
  const evidenced = health?.evidenced ?? health?.overall ?? "Not Set";
  return (
    <section
      aria-label="Summary"
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-border/70 bg-card p-5 text-card-foreground shadow-sm"
    >
      <h3 className="font-display text-sm font-semibold">Summary</h3>
      <div className="flex flex-wrap gap-1.5">
        <Chip label="Tier">{project.tier}</Chip>
        <Chip label="Priority">{project.priority}</Chip>
        {taskSource ? <Chip label="Tasks">{TASK_SOURCE[taskSource] ?? taskSource}</Chip> : null}
      </div>
      <Lifecycle size="compact" phases={phases.data ?? []} phaseId={project.phaseId} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        <Fact label={term("projectManager", settings)}>{project.managerName}</Fact>
        <Fact label={term("projectOfficer", settings)}>
          {project.projectOfficerName ?? "Unassigned"}
        </Fact>
        <Fact label={term("sponsor", settings)}>{project.sponsorName}</Fact>
        <Fact label="Start" mono>
          {format.date(project.startDate ?? undefined)}
        </Fact>
        <Fact label="Baseline finish" mono>
          {format.date(project.baselineFinishDate ?? undefined)}
        </Fact>
        <Fact label="Forecast finish" mono>
          {format.date(health?.forecastFinishDate ?? undefined)}
          {late > 0 && (
            <small
              className={cn(
                "block font-geist text-xs font-normal",
                SLIP_TEXT[health?.finishSlipHealth ?? "Not Set"],
              )}
            >
              {late} day{late === 1 ? "" : "s"} late
              {health?.finishSlipHealth === "Off Track" ? ", beyond tolerance" : ""}
            </small>
          )}
        </Fact>
      </dl>
      <div className="border-t border-border/60 pt-3 text-[13px]">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <HealthMark health={declared ?? "Not Set"} shape="ring" />
            Report {declared ? WORD[declared].toLowerCase() : "none yet"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HealthMark health={evidenced} shape="dot" />
            Evidence {WORD[evidenced].toLowerCase()}
          </span>
        </p>
        {health?.divergent ? (
          <p
            className={cn(
              "mt-1.5 text-xs",
              health.justified
                ? "text-muted-foreground"
                : health.divergenceAlert
                  ? "text-health-bad-foreground"
                  : "text-health-warn-foreground",
            )}
          >
            {health.justified ? (
              "Justified"
            ) : (
              <>
                {health.divergenceAlert && <span className="font-medium">Divergence alert: </span>}
                {divergenceText({
                  divergenceKind: health.divergenceKind,
                  divergenceDays: health.divergenceDays ?? 0,
                })}
              </>
            )}
          </p>
        ) : null}
      </div>
    </section>
  );
}
