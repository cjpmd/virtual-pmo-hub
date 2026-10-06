import { createFileRoute, Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { AssumptionsWorkspace } from "@/components/assumptions-workspace";
import { ProgrammeBenefits } from "@/components/project-benefits";
import { BoardWorkspace } from "@/components/board-workspace";
import { DependencyTab } from "@/components/dependency-tab";
import { StateBadge } from "@/components/entity-management";
import { FavouriteButton } from "@/components/favourite-button";
import { HealthPill } from "@/components/health-pill";
import { MilestoneSummary, type SummaryMilestone } from "@/components/milestone-summary";
import { EntityHeader, Fact, KpiCard } from "@/components/pmo-ui";
import { ProgrammeDecisions } from "@/components/programme-decisions";
import { QueryState } from "@/components/query-state";
import { Breadcrumbs } from "@/components/section-nav";
import { Button } from "@/components/ui/button";
import {
  useMilestones,
  usePeople,
  usePortfolios,
  useProgramme,
  useProjects,
} from "@/hooks/use-hierarchy";
import { projectColumns } from "@/lib/board-data";
import { useFormat } from "@/lib/format";
import { projectSummariesToRows } from "@/lib/project-rows";
import { daysFromToday, todayIso } from "@/lib/today";
import type { ProgrammeSummary, ProjectSummary } from "@/services/hierarchy";
import { term, useSettings } from "@/services/settings";

export const Route = createFileRoute("/portfolio/programmes/$programmeId")({
  head: () => ({
    meta: [
      { title: "Programme — Virtual PMO" },
      { name: "description", content: "Programme detail." },
    ],
  }),
  component: ProgrammePage,
});

const tabs = [
  "overview",
  "projects",
  "benefits",
  "dependencies",
  "decisions",
  "assumptions",
  "financials",
  "status",
  "notes",
];

function ProgrammePage() {
  const { programmeId: param } = Route.useParams();
  // Links from screens not yet on Supabase may still carry the prototype id.
  const programme = useProgramme(param);
  return (
    <QueryState
      query={programme}
      notFound={{
        title: "Programme not found",
        backTo: "/portfolio/programmes",
        backLabel: "All programmes",
      }}
    >
      {(data) => <ProgrammeBody programme={data} />}
    </QueryState>
  );
}

/** Share of the window between two ISO dates that has elapsed by today, 0–100. */
const elapsedPercent = (start: string | null, finish: string | null) => {
  const fromStart = daysFromToday(start),
    toFinish = daysFromToday(finish);
  if (fromStart === undefined || toFinish === undefined) return 0;
  const length = toFinish - fromStart;
  return length <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((-fromStart / length) * 100)));
};

function ProgrammeBody({ programme }: { programme: ProgrammeSummary }) {
  const settings = useSettings();
  const format = useFormat();
  const [tab, setTab] = useState("overview");
  const portfolios = usePortfolios();
  const allProjects = useProjects();
  const people = usePeople();
  const projects = useMemo(
    () => (allProjects.data ?? []).filter((project) => project.programmeId === programme.id),
    [allProjects.data, programme.id],
  );
  const milestones = useMilestones(
    projects.map((project) => project.id),
    `programme:${programme.id}`,
  );
  const portfolio = portfolios.data?.find((item) => item.id === programme.portfolioId);
  const metrics = useMemo(() => programmeMetrics(projects), [projects]);
  const summaryItems = useMemo<SummaryMilestone[]>(() => {
    const byId = new Map(projects.map((project) => [project.id, project]));
    return (milestones.data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      status: item.status,
      forecastDate: item.forecastDate,
      slipDays: item.slipDays,
      projectCode: byId.get(item.projectId)?.code ?? "",
      projectName: byId.get(item.projectId)?.name ?? "",
    }));
  }, [milestones.data, projects]);
  const overdue = summaryItems.filter((item) => item.status === "Overdue").length;
  const late = summaryItems.filter((item) => item.status === "Late").length;
  const slipped = summaryItems.filter(
    (item) => item.slipDays > 0 && item.status !== "Completed",
  ).length;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        trail={[
          { label: term("portfolio", settings), to: "/portfolio" },
          { label: portfolio?.name ?? "…", to: "/portfolio" },
          { label: term("programmePlural", settings), to: "/portfolio/programmes" },
          { label: programme.name },
        ]}
      />
      <div className="flex items-start justify-between border-b border-border pb-6">
        <EntityHeader
          title={programme.name}
          description={programme.description ?? ""}
          health={
            <div className="flex items-center gap-3">
              <HealthPill health={programme.health} />
              <FavouriteButton target={{ programmeId: programme.id }} />
              <StateBadge state={programme.state} />
            </div>
          }
        >
          <Fact label={term("programmeManager", settings)} value={programme.managerName} />
          <Fact
            label={term("projectManager", settings)}
            value={programme.projectManagerName ?? "Unassigned"}
          />
          <Fact
            label={term("projectOfficer", settings)}
            value={programme.projectOfficerName ?? "Unassigned"}
          />
          <Fact label="Sponsor" value={programme.sponsorName} />
          <Fact
            label="Dates"
            value={`${format.date(programme.startDate ?? undefined)} – ${format.date(programme.finishDate ?? undefined)}`}
          />
          <Fact label="Programme budget" value={format.compact(programme.budget)} />
          <Fact label="Active projects" value={String(metrics.active)} />
          <Fact label="Benefit health" value={programme.benefitHealth} />
        </EntityHeader>
      </div>
      <div className="flex overflow-x-auto border-b border-border">
        {tabs.map((item) => (
          <Button
            key={item}
            variant="ghost"
            onClick={() => setTab(item)}
            className={
              tab === item
                ? "rounded-none border-b-2 border-primary text-primary"
                : "rounded-none text-muted-foreground"
            }
          >
            {item[0]?.toUpperCase()}
            {item.slice(1)}
          </Button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Projects"
              value={String(metrics.projectCount)}
              detail={`${metrics.active} currently active`}
              icon="projects"
            />
            <KpiCard
              label="Project budgets"
              value={format.compact(metrics.budget)}
              detail="Across this programme"
              icon="budget"
            />
            <KpiCard
              label="Forecast"
              value={format.compact(metrics.forecast)}
              detail="Latest aggregate forecast"
              icon="forecast"
            />
            <KpiCard
              label="On track"
              value={`${metrics.rag.green} / ${metrics.projectCount}`}
              detail={`${metrics.rag.amber} amber · ${metrics.rag.red} red`}
              icon="health"
            />
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold">Value statement</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {programme.valueStatement}
              </p>
              <div className="mt-6 border-t border-border pt-5">
                <h3 className="text-sm font-semibold">Delivery window</h3>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${elapsedPercent(programme.startDate, programme.finishDate)}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{format.date(programme.startDate ?? undefined)}</span>
                  <span>Today</span>
                  <span>{format.date(programme.finishDate ?? undefined)}</span>
                </div>
              </div>
            </section>
            <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold">RAG mix</h2>
              <div className="mt-5 space-y-4">
                {(
                  [
                    ["On Track", metrics.rag.green, "bg-health-good"],
                    ["At Risk", metrics.rag.amber, "bg-health-warn"],
                    ["Off Track", metrics.rag.red, "bg-health-bad"],
                  ] as const
                ).map(([label, value, colour]) => (
                  <div key={label}>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${colour}`}
                        style={{
                          width: `${metrics.projectCount ? (value / metrics.projectCount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">Programme milestones</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overdue} overdue · {late} late · {slipped} slipped
                </p>
              </div>
              <Link
                to="/delivery/milestones"
                className="text-sm font-semibold text-primary hover:underline"
              >
                View register
              </Link>
            </div>
            <div className="mt-3">
              <QueryState query={milestones}>
                {() => <MilestoneSummary items={summaryItems} limit={5} />}
              </QueryState>
            </div>
          </section>
        </div>
      )}

      {tab === "projects" && (
        <div>
          <div className="mb-4">
            <h2 className="font-display text-lg font-semibold">Linked projects</h2>
            <p className="text-xs text-muted-foreground">
              Health values are calculated from current delivery data
            </p>
          </div>
          <QueryState query={allProjects}>
            {() => (
              <BoardWorkspace
                title="Programme projects"
                manage={false}
                rows={projectSummariesToRows(projects)}
                columns={projectColumns()}
                groupOptions={["status", "stage", "priority"]}
                renderTitle={(row) => (
                  <Link
                    to="/portfolio/projects/$projectCode"
                    params={{ projectCode: row.id }}
                    className="text-primary hover:underline"
                  >
                    {row.title}
                  </Link>
                )}
              />
            )}
          </QueryState>
        </div>
      )}

      {/* Not yet on Supabase (Stage 4c): these tabs still read the prototype data for this programme. */}
      {tab === "benefits" && <ProgrammeBenefits programmeId={programme.id} />}
      {tab === "dependencies" && <DependencyTab programmeId={programme.id} />}
      {tab === "decisions" && <ProgrammeDecisions programmeId={programme.id} />}
      {tab === "assumptions" && (
        <AssumptionsWorkspace scope={{ programmeId: programme.id }} compact />
      )}

      {tab === "financials" && (
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard
            label="Programme budget"
            value={format.compact(programme.budget)}
            detail="Approved allocation"
            icon="budget"
          />
          <KpiCard
            label="Project budgets"
            value={format.compact(metrics.budget)}
            detail="Current delivery baseline"
            icon="budget"
          />
          <KpiCard
            label="Forecast"
            value={format.compact(metrics.forecast)}
            detail={`${format.compact(metrics.forecast - metrics.budget)} variance`}
            icon="forecast"
          />
        </div>
      )}
      {tab === "status" && (
        <div className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold">Programme status</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Roll-up as at {format.date(todayIso())}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <HealthPill health={programme.health} />
            <span className="text-sm text-muted-foreground">
              Benefit health: {programme.benefitHealth}
            </span>
          </div>
        </div>
      )}
      {tab === "notes" && (
        <div className="rounded-lg border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-primary" />
            <p className="text-sm font-semibold">Programme office note</p>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Review delivery dependencies and confirm priorities ahead of the next portfolio
            checkpoint.
          </p>
        </div>
      )}
    </div>
  );
}

function programmeMetrics(projects: ProjectSummary[]) {
  const rag = { green: 0, amber: 0, red: 0 };
  for (const project of projects) {
    if (project.health.overall === "On Track") rag.green += 1;
    else if (project.health.overall === "At Risk") rag.amber += 1;
    else if (project.health.overall === "Off Track") rag.red += 1;
  }
  return {
    projectCount: projects.length,
    active: projects.filter((project) => project.state === "Active").length,
    budget: projects.reduce((sum, project) => sum + project.budget, 0),
    forecast: projects.reduce((sum, project) => sum + project.forecast, 0),
    rag,
  };
}
