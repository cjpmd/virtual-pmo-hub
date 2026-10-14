import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { HealthByDimension } from "@/components/overview/health-by-dimension";
import { MilestoneSlippage } from "@/components/overview/milestone-slippage";
import { HighlightReport, TopRisks } from "@/components/overview/project-work-panels";
import { HealthMark } from "@/components/overview/project-watchlist";
import { Chip, Fact, Lifecycle } from "@/components/project-header";
import { Button } from "@/components/ui/button";
import type { Health } from "@/data/types";
import { usePhases, useProject } from "@/hooks/use-hierarchy";
import { useProjectOverview } from "@/hooks/use-project-overview";
import { useFormat } from "@/lib/format";
import { TASK_SOURCE } from "@/lib/project-tabs";
import { cn } from "@/lib/utils";
import { divergenceText } from "@/services/assurance";
import type { ProjectSummary } from "@/services/hierarchy";
import type { ProjectOverviewData } from "@/services/project-overview";
import { rankRaid } from "@/services/project-schedule";
import { term, useSettings } from "@/services/settings";

// Expanded row on the portfolio home's "Projects by programme" table (Stage 6). Same
// get_project_overview call and query key as the project page, fetched on first expand; the
// panels are the project overview's own components at size="compact".

const WORD: Record<Health, string> = {
  "On Track": "Green",
  "At Risk": "Amber",
  "Off Track": "Red",
  "Not Set": "Not set",
};
/** Text-safe colours for the days-late note (finish_slip_health); the word carries the meaning. */
const SLIP_TEXT: Record<Health, string> = {
  "On Track": "text-health-good-foreground",
  "At Risk": "text-health-warn-foreground",
  "Off Track": "text-health-bad-foreground",
  "Not Set": "text-muted-foreground",
};

export function ProjectRowPanel({ project }: { project: ProjectSummary }) {
  const query = useProjectOverview(project.id);
  // Task source is on the project record only. Same query key as the project page, so this also
  // warms the record that page waits on; fetched alongside the overview, not after it.
  const detail = useProject(project.code);
  const navigate = useNavigate();
  const data = query.data;
  const raid = useMemo(
    () => (data ? rankRaid(data.openRaid, data.riskBands, data.today) : []),
    [data],
  );
  const openTab = (search: { tab: string; sub?: string }) =>
    navigate({
      to: "/portfolio/projects/$projectCode",
      params: { projectCode: project.code },
      search,
    });

  let body;
  if (query.isError)
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-3 py-2 text-sm">
        <span className="text-health-bad-foreground">Couldn't load this project's overview.</span>
        <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  else if (!data)
    body = (
      <div aria-busy aria-label="Loading the project" className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-[260px] animate-pulse rounded-lg border bg-muted/40",
              i === 1 && "hidden sm:block",
            )}
          />
        ))}
      </div>
    );
  else {
    const closed = data.project.state === "closed";
    const health = data.health;
    body = (
      <div className="grid gap-4 lg:grid-cols-3">
        <Summary project={project} data={data} taskSource={detail.data?.taskSource} />
        <div className="hidden min-w-0 flex-col gap-4 sm:flex">
          <MilestoneSlippage
            scope="project"
            size="compact"
            milestones={data.milestones}
            today={data.today}
            closed={closed}
          />
          {health ? (
            <HealthByDimension
              scope="project"
              size="compact"
              months={data.healthMonths}
              current={{
                schedule: health.schedule,
                financial: health.financial,
                effort: health.effort,
                issue: health.issue,
                benefit: health.benefit,
                overall: health.overall,
              }}
              startDate={data.project.startDate}
              closed={closed}
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <HighlightReport
            size="compact"
            report={data.latestReport}
            nextDue={health?.nextReportDue ?? null}
            onOpen={() => openTab({ tab: "status" })}
            onStart={() => openTab({ tab: "status" })}
          />
          <div className="hidden sm:block">
            <TopRisks items={raid} onOpen={() => openTab({ tab: "raid", sub: "risks" })} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-pmo-line bg-pmo-bg p-3 sm:p-4">
      {body}
      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          asChild
          className="bg-pmo-accent text-white hover:bg-pmo-accent/90 dark:text-pmo-bg"
        >
          <Link to="/portfolio/projects/$projectCode" params={{ projectCode: project.code }}>
            Open project
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Summary({
  project,
  data,
  taskSource,
}: {
  project: ProjectSummary;
  data: ProjectOverviewData;
  taskSource: string | undefined;
}) {
  const format = useFormat();
  const settings = useSettings();
  const phases = usePhases();
  const health = data.health;
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
          {format.date(data.project.startDate ?? undefined)}
        </Fact>
        <Fact label="Baseline finish" mono>
          {format.date(data.project.baselineFinishDate ?? undefined)}
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
