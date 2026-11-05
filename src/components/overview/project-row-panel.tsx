import { useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ProjectOverviewPanel } from "@/components/overview/ProjectOverviewPanel";
import { Button } from "@/components/ui/button";
import { useProject } from "@/hooks/use-hierarchy";
import { useProjectOverview } from "@/hooks/use-project-overview";
import { cn } from "@/lib/utils";
import type { ProjectSummary } from "@/services/hierarchy";

// Expanded row on the portfolio home's "Projects by programme" table (Stage 6). Same
// get_project_overview call and query key as the project page, fetched on first expand; the
// panels are the project overview's own components at size="compact".

export function ProjectRowPanel({ project }: { project: ProjectSummary }) {
  const query = useProjectOverview(project.id);
  // Task source is on the project record only. Same query key as the project page, so this also
  // warms the record that page waits on; fetched alongside the overview, not after it.
  const detail = useProject(project.code);
  const navigate = useNavigate();
  const data = query.data;

  const openTab = (tab: string, sub?: string) =>
    void navigate({
      to: "/portfolio/projects/$projectCode",
      params: { projectCode: project.code },
      search: sub ? { tab, sub } : { tab },
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
  else
    body = (
      <ProjectOverviewPanel
        project={{
          id: data.project.id,
          code: data.project.code,
          name: data.project.name,
          tier: project.tier,
          priority: project.priority,
          state: data.project.state,
          phaseId: project.phaseId,
          managerName: project.managerName,
          sponsorName: project.sponsorName,
          projectOfficerName: project.projectOfficerName,
          startDate: data.project.startDate,
          baselineFinishDate: data.project.baselineFinishDate,
        }}
        taskSource={detail.data?.taskSource}
        health={data.health}
        milestones={data.milestones}
        today={data.today}
        healthMonths={data.healthMonths}
        latestReport={data.latestReport}
        riskBands={data.riskBands}
        openRaid={data.openRaid}
        onNavigate={openTab}
      />
    );

  return (
    <div className="rounded-lg border border-pmo-line bg-pmo-bg p-3 sm:p-4">
      {body}
      <div className="mt-4 flex justify-end print:hidden">
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
