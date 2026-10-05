import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Gavel,
  ListChecks,
  ListPlus,
  PackageCheck,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppraisalPanel } from "@/components/appraisal-panel";
import { BenefitSummary } from "@/components/benefit-summary";
import { BenefitsHandoverWizard } from "@/components/benefits-handover";
import { ProjectAppraisal, ProjectBenefits } from "@/components/project-benefits";
import { DeliveryStatusIcon } from "@/components/board-workspace";
import { DecisionPanel } from "@/components/decision-panel";
import { DeliveryWorkspace, ForecastPanel } from "@/components/delivery-workspace";
import { DependencyTab } from "@/components/dependency-tab";
import { StateBadge } from "@/components/entity-management";
import { DeclaredVsEvidenced } from "@/components/evidence-ui";
import { FavouriteButton } from "@/components/favourite-button";
import { GateChecklist } from "@/components/gate-checklist";
import { HealthPill } from "@/components/health-pill";
import { openIssueTask } from "@/components/issue-task-sheet";
import { LessonsTab } from "@/components/lessons-tab";
import { Fact, KpiCard } from "@/components/pmo-ui";
import { ProjectMilestones } from "@/components/project-milestones";
import { ProjectRaid } from "@/components/project-raid";
import { ProjectResources } from "@/components/project-resources";
import { QueryState } from "@/components/query-state";
import { RelevantLessons } from "@/components/relevant-lessons";
import { AssumptionsWorkspace } from "@/components/assumptions-workspace";
import { Breadcrumbs } from "@/components/section-nav";
import { StatusWorkspace } from "@/components/status-workspace";
import { TaskWorkspace } from "@/components/task-workspace";
import { Button } from "@/components/ui/button";
import type { Project } from "@/data/types";
import {
  useMilestones,
  usePeople,
  usePhases,
  usePortfolios,
  useProject,
  useRaid,
} from "@/hooks/use-hierarchy";
import { useFormat } from "@/lib/format";
import { daysFromToday, todayIso } from "@/lib/today";
import { cn } from "@/lib/utils";
import { getAssuranceRow } from "@/services/assurance";
import { useAssuranceProjects } from "@/hooks/use-assurance";
import { useStatusReports } from "@/hooks/use-status-reports";
import { scopedTo, type ResolvedDecision } from "@/services/decisions";
import { useGovernance } from "@/hooks/use-governance";
import type { ProjectDetail } from "@/services/hierarchy";
import { toMockProjectId, toProjectCode } from "@/services/legacy-bridge";
import { getProjectLessons, hasPhaseLessonsReview } from "@/services/lessons";
import { useLessons } from "@/hooks/use-lessons";
import { toTaskSource } from "@/services/work-items";
import {
  getPhaseForStage,
  getProject,
  getProjectBenefits,
  getProjectTeam,
  getTierDefinitions,
} from "@/services/pmo";
import { useDeliveryVersion } from "@/services/sprints";
import { term, useSettings } from "@/services/settings";

export const Route = createFileRoute("/portfolio/projects/$projectCode")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.projectCode.toUpperCase()} — Virtual PMO` },
      { name: "description", content: "Project detail." },
    ],
  }),
  component: ProjectPage,
});

const tabs = [
  "overview",
  "milestones",
  "status",
  "tasks",
  "delivery",
  "resources",
  "benefits",
  "raid",
  "dependencies",
  "decisions",
  "assumptions",
  "lessons",
  "changes",
  "financials",
  "business case",
];

const taskSourceLabel: Record<string, string> = {
  manual: "Manual",
  planner_basic: "Planner Basic",
  planner_premium: "Planner Premium",
};

function ProjectPage() {
  const { projectCode } = Route.useParams();
  // Old prototype ids (e.g. "ebbot-chatbot") still resolve to the project's code.
  const project = useProject(toProjectCode(projectCode));
  return (
    <QueryState
      query={project}
      notFound={{
        title: "Project not found",
        backTo: "/portfolio/projects",
        backLabel: "All projects",
      }}
    >
      {(data) => <ProjectBody project={data} />}
    </QueryState>
  );
}

function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Placeholder for tabs that still need the prototype record (demo organisation only until 4c). */
function NotYetMigrated() {
  return (
    <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      This tab moves to the database in the next stage. It currently shows data only for the demo
      organisation.
    </p>
  );
}

function ProjectBody({ project }: { project: ProjectDetail }) {
  const settings = useSettings();
  const format = useFormat();
  const [tab, setTab] = useState("overview");
  useDeliveryVersion();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("task")) setTab("tasks");
  }, []);
  const [lessonsReviewed, setLessonsReviewed] = useState(false);
  const [manualTicks, setManualTicks] = useState<string[]>([]);
  const [handover, setHandover] = useState(false);
  const [handedOver, setHandedOver] = useState<number | null>(null);
  const [openDecisionId, setOpenDecisionId] = useState<string | null>(null);

  // ---- From Supabase ----
  const phases = usePhases();
  const portfolios = usePortfolios();
  const people = usePeople();
  const raid = useRaid(project.id);
  const milestones = useMilestones([project.id], project.id);
  const portfolio = portfolios.data?.find((item) => item.id === project.portfolioId);
  const names = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person.name])),
    [people.data],
  );
  const topRisks = (raid.data?.risks ?? []).filter((risk) => risk.status === "Open").slice(0, 3);
  const upcoming = (milestones.data ?? [])
    .filter((item) => item.status !== "Completed")
    .slice(0, 5);

  // ---- Still prototype data (Stage 4c), keyed by the demo project's old id ----
  const mockId = toMockProjectId(project.code);
  const legacy: Project | undefined = getProject(mockId);
  const governance = useGovernance();
  const decisions = useMemo(
    () => scopedTo(governance.data?.decisions ?? [], { projectId: project.id }),
    [governance.data, project.id],
  );
  const openDecision = decisions.find((item) => item.id === openDecisionId);
  const changes = useMemo(
    () => (governance.data?.changes ?? []).filter((change) => change.scope.projectId === project.id),
    [governance.data, project.id],
  );
  const lessonsData = useLessons();
  const lessons = useMemo(
    () => (lessonsData.data ? getProjectLessons(lessonsData.data, project.id) : []),
    [lessonsData.data, project.id],
  );
  const statusReports = useStatusReports(project.id);
  const reports = statusReports.data ?? [];
  const currentPhaseId = phases.data?.[project.phaseIndex]?.id;
  const phaseReviewHeld =
    lessonsData.data && currentPhaseId
      ? hasPhaseLessonsReview(lessonsData.data, project.id, currentPhaseId)
      : false;
  const projectTypeTags = Array.from(new Set(lessons.flatMap((lesson) => lesson.projectTypeTags)));
  const assuranceProjects = useAssuranceProjects();
  const assuranceProject = assuranceProjects.data?.find((item) => item.id === project.id);
  // Delivery data is browser-local and generated per project once the project is registered
  // (useAssuranceProjects does that), so the delivery views wait for it.
  const deliveryReady = Boolean(assuranceProject);
  const assurance = assuranceProject ? getAssuranceRow(assuranceProject) : undefined;

  const tierInfo = getTierDefinitions().find((item) => item.tier === project.tier);
  const elapsed = (() => {
    const fromStart = daysFromToday(project.startDate),
      toFinish = daysFromToday(project.finishDate);
    if (fromStart === undefined || toFinish === undefined || toFinish - fromStart <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((-fromStart / (toFinish - fromStart)) * 100)));
  })();

  const activity = [
    ...decisions.map((item) => ({
      id: item.id,
      date: item.decisionDate ?? item.neededBy,
      kind: item.status === "Made" ? "Decision made" : "Decision required",
      label: `${item.reference} · ${item.title}`,
      detail:
        item.status === "Made"
          ? `${item.forum} chose “${item.chosenOption}”`
          : `${item.forum} · needed by ${format.date(item.neededBy)}`,
      decision: item as ResolvedDecision | undefined,
    })),
    ...reports.map((item) => ({
      id: item.id,
      date: item.reportingDate,
      kind: "Status report",
      label: `${item.overall} · ${item.submitter}`,
      detail: item.accomplished,
      decision: undefined,
    })),
    ...(milestones.data ?? [])
      .filter((item) => item.actualDate)
      .map((item) => ({
        id: item.id,
        date: item.actualDate ?? "",
        kind: "Milestone completed",
        label: item.title,
        detail: `${item.type} · ${(item.ownerId && names.get(item.ownerId)) || "Unassigned"}`,
        decision: undefined,
      })),
  ]
    .map((entry) => ({
      ...entry,
      sortKey: entry.date.includes("/") ? entry.date.split("/").reverse().join("-") : entry.date,
    }))
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        trail={[
          { label: term("portfolio", settings), to: "/portfolio" },
          { label: portfolio?.name ?? "…", to: "/portfolio" },
          ...(project.programmeId
            ? [{ label: project.programmeName, to: "/portfolio/programmes" }]
            : []),
          { label: project.name },
        ]}
      />
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
              {project.programmeName}
            </p>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl font-semibold">{project.name}</h1>
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {project.code}
              </span>
              <FavouriteButton item={{ id: project.code, type: "Project", label: project.name }} />
              <span
                title={tierInfo?.description}
                className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
              >
                {project.tier} project
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{project.businessCase}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge state={project.state} />
            <Button size="sm" onClick={() => openIssueTask(project.id)}>
              <ListPlus />
              Issue task
            </Button>
            {legacy && (
              <Button size="sm" variant="outline" onClick={() => setHandover(true)}>
                <PackageCheck />
                {project.state === "Closed" ? "Benefits handover" : "Close project"}
              </Button>
            )}
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground">
              <ListChecks className="size-4" />
              {taskSourceLabel[project.taskSource] ?? project.taskSource}
            </span>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <p className="mb-3 text-xs font-semibold text-muted-foreground">
              Lifecycle — {project.phaseName}
            </p>
            <div className="flex items-center">
              {(phases.data ?? []).map((phase, index, all) => (
                <div key={phase.id} className="flex min-w-0 flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <span
                      className={`grid size-7 place-items-center rounded-full border ${index < project.phaseIndex ? "border-primary bg-primary text-primary-foreground" : index === project.phaseIndex ? "border-primary bg-accent text-primary" : "border-border bg-card text-muted-foreground"}`}
                    >
                      {index < project.phaseIndex ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <Circle className="size-3" />
                      )}
                    </span>
                    <span
                      title={`${phase.name} · ${phase.gateName ?? ""}`}
                      className={`text-center text-[10px] ${index === project.phaseIndex ? "font-semibold text-primary" : "text-muted-foreground"}`}
                    >
                      {phase.shortName}
                    </span>
                  </div>
                  {index < all.length - 1 && (
                    <div
                      className={`mb-5 h-px flex-1 ${index < project.phaseIndex ? "bg-primary" : "bg-border"}`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact label={term("projectManager", settings)} value={project.managerName} />
            <Fact
              label={term("projectOfficer", settings)}
              value={project.projectOfficerName ?? "Unassigned"}
            />
            <Fact label={term("sponsor", settings)} value={project.sponsorName} />
            <Fact label="Tier" value={project.tier} />
            <Fact label="Priority" value={project.priority} />
            <Fact label="Finish" value={format.date(project.finishDate ?? undefined)} />
          </div>
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["Overall", project.health.overall],
              ["Schedule", project.health.schedule],
              ["Issues & risks", project.health.issue],
              ["Benefit health", project.health.benefit],
            ] as const
          ).map(([label, health]) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2"
            >
              <span className="text-xs text-muted-foreground">{label}</span>
              <HealthPill health={health} />
            </div>
          ))}
        </div>
      </header>
      {assurance && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-sm">
          <span className="text-xs text-muted-foreground">Assurance</span>
          <DeclaredVsEvidenced
            declared={assurance.declared}
            evidenced={assurance.evidenced}
            stale={assurance.stale}
          />
          {assurance.divergenceAlert && (
            <span className="text-xs font-medium text-health-bad-foreground">
              Divergence alert: declared RAG better than the evidence for {assurance.divergenceDays}{" "}
              days
              {assurance.justification ? "" : ". Justification needed"}
            </span>
          )}
        </div>
      )}
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

      {handedOver !== null && (
        <div className="flex items-center gap-2 rounded-md border border-health-good/40 bg-health-good/10 p-3 text-sm">
          <CheckCircle2 className="size-4 text-health-good-foreground" />
          Benefits handover complete. {handedOver} benefit{handedOver === 1 ? "" : "s"} now sit with
          a BAU owner and keep appearing on Realisation and the Value Dashboard.
        </div>
      )}

      {tab === "overview" && deliveryReady && <ForecastPanel projectId={project.code} />}
      {tab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="space-y-5 xl:col-span-8">
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard
                label="Budget"
                value={format.compact(project.budget)}
                detail={`${format.compact(project.actual)} actual`}
                icon="budget"
              />
              <KpiCard
                label="Forecast"
                value={format.compact(project.forecast)}
                detail={`${format.compact(project.forecast - project.budget)} variance`}
                icon="forecast"
              />
              <KpiCard
                label="Task progress"
                value={`${project.averagePercentComplete}%`}
                detail={`${project.taskCount} tasks · ${project.overdueTaskCount} overdue`}
                icon="projects"
              />
            </div>
            <Section title="Delivery timeline">
              <div className="mt-5 flex items-center gap-3">
                <CalendarDays className="size-5 text-primary" />
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${elapsed}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>{format.date(project.startDate ?? undefined)}</span>
                    <span>{format.date(todayIso())}</span>
                    <span>{format.date(project.finishDate ?? undefined)}</span>
                  </div>
                </div>
              </div>
            </Section>
            <Section title="Latest status report">
              {reports[0] ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <HealthPill health={reports[0].overall} />
                    <span className="text-xs text-muted-foreground">
                      {format.date(reports[0].reportingDate)} · {reports[0].submitter}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold">Accomplished</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {reports[0].accomplished}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Planned next</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {reports[0].planned}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No report submitted.</p>
              )}
            </Section>
            <Section title="Activity timeline">
              <div className="mt-4 divide-y">
                {activity.map((entry) => (
                  <div key={`${entry.kind}-${entry.id}`} className="flex items-start gap-3 py-3">
                    <span
                      className={cn(
                        "mt-1 grid size-6 shrink-0 place-items-center rounded-full",
                        entry.kind.startsWith("Decision")
                          ? "bg-primary/15 text-primary"
                          : "bg-accent text-accent-foreground",
                      )}
                    >
                      {entry.kind.startsWith("Decision") ? (
                        <Gavel className="size-3.5" />
                      ) : (
                        <Circle className="size-3" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      {entry.decision ? (
                        <button
                          onClick={() => setOpenDecisionId(entry.decision?.id ?? null)}
                          className="text-left text-sm font-medium text-primary hover:underline"
                        >
                          {entry.label}
                        </button>
                      ) : (
                        <p className="text-sm font-medium">{entry.label}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.kind} · {format.date(entry.date)} · {entry.detail}
                      </p>
                    </div>
                  </div>
                ))}
                {!activity.length && (
                  <p className="py-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
                )}
              </div>
            </Section>
          </div>
          <div className="space-y-5 xl:col-span-4">
            <Section
              title="Top risks"
              actions={
                <Button variant="link" size="sm" onClick={() => setTab("raid")}>
                  Open RAID
                </Button>
              }
            >
              <div className="mt-4 space-y-3">
                {topRisks.map((risk) => (
                  <div key={risk.id} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{risk.title}</p>
                      <span className="rounded bg-health-warn/20 px-2 py-0.5 text-xs font-semibold text-health-warn-foreground">
                        {risk.score}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {risk.description}
                    </p>
                  </div>
                ))}
                {raid.isSuccess && !topRisks.length && (
                  <p className="text-sm text-muted-foreground">No open risks.</p>
                )}
              </div>
            </Section>
            {legacy && (
              <GateChecklist
                project={legacy}
                lessonsReviewed={lessonsReviewed}
                phaseReviewHeld={phaseReviewHeld}
                manualTicks={manualTicks}
                onToggleManual={(id) =>
                  setManualTicks((current) =>
                    current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                  )
                }
              />
            )}
            <Section
              title="Upcoming milestones"
              actions={
                <Button variant="link" size="sm" onClick={() => setTab("milestones")}>
                  All milestones
                </Button>
              }
            >
              <div className="mt-4 divide-y">
                {upcoming.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 py-3">
                    <DeliveryStatusIcon status={item.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.type} · {(item.ownerId && names.get(item.ownerId)) || "Unassigned"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs">{format.date(item.forecastDate)}</p>
                      {item.baselineDate !== item.forecastDate && (
                        <p className="text-[10px] text-health-warn-foreground">
                          Baseline {format.date(item.baselineDate)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {milestones.isSuccess && !upcoming.length && (
                  <p className="py-3 text-sm text-muted-foreground">No upcoming milestones.</p>
                )}
              </div>
            </Section>
          </div>
        </div>
      )}

      {tab === "milestones" && <ProjectMilestones projectId={project.id} />}
      {tab === "raid" && <ProjectRaid projectId={project.id} />}
      {tab === "financials" && (
        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard
            label="Budget"
            value={format.compact(project.budget)}
            detail="Approved baseline"
            icon="budget"
          />
          <KpiCard
            label="Actual"
            value={format.compact(project.actual)}
            detail="Spend to date"
            icon="budget"
          />
          <KpiCard
            label="Forecast"
            value={format.compact(project.forecast)}
            detail={`${format.compact(project.forecast - project.budget)} variance`}
            icon="forecast"
          />
        </div>
      )}

      {/* Not yet on Supabase (Stage 4c): these tabs read the demo project's prototype record. */}
      {(
        <>
          {tab === "status" && (
            <StatusWorkspace
              project={project}
              calculated={{
                overall: project.health.overall,
                schedule: project.health.schedule,
                financial: project.health.financial,
                effort: project.health.effort,
                issue: project.health.issue,
              }}
            />
          )}
          {tab === "tasks" && (
            <TaskWorkspace projectId={project.id} taskSource={toTaskSource(project.taskSource)} />
          )}
          {tab === "delivery" && deliveryReady && <DeliveryWorkspace projectId={project.code} />}
          {tab === "resources" && <ProjectResources projectId={project.id} />}
          {tab === "benefits" && <ProjectBenefits projectId={project.id} />}
          {tab === "dependencies" && <DependencyTab projectId={project.id} />}
          {tab === "decisions" && (
            <div className="space-y-4">
              {decisions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setOpenDecisionId(item.id)}
                  className="block w-full rounded-lg border border-border/70 bg-card p-4 text-left shadow-sm hover:bg-accent/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {item.reference} · {item.title}
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        item.status === "Made"
                          ? "bg-health-good/20 text-health-good-foreground"
                          : item.overdue
                            ? "bg-health-bad/20 text-health-bad-foreground"
                            : item.status === "Pending"
                              ? "bg-health-warn/25 text-health-warn-foreground"
                              : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.status}
                      {item.overdue ? " · overdue" : ""}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {item.forum} · {item.decisionMaker} · needed by {format.date(item.neededBy)}
                    {item.decisionDate ? ` · decided ${format.date(item.decisionDate)}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{item.context}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Impact on: {item.impactSummary} · {item.openActions} open action
                    {item.openActions === 1 ? "" : "s"}
                  </p>
                </button>
              ))}
              {!decisions.length && (
                <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                  No decisions recorded for this project.
                </p>
              )}
            </div>
          )}
          {tab === "assumptions" && <AssumptionsWorkspace scope={{ projectId: project.id }} compact />}
          {tab === "lessons" && <LessonsTab project={project} />}
          {tab === "changes" && (
            <Section title="Change requests">
              <div className="mt-4 space-y-3">
                {changes.map((change) => (
                  <div
                    key={change.id}
                    className="flex items-center justify-between border-b border-border py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{change.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {change.type} · {change.scheduleImpactDays} days
                      </p>
                    </div>
                    <span className="text-sm">{change.status}</span>
                  </div>
                ))}
                {!changes.length && (
                  <p className="mt-3 text-sm text-muted-foreground">No change requests raised.</p>
                )}
              </div>
            </Section>
          )}
          {tab === "business case" && (
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <Section title="Summary">
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {project.businessCase}
                  </p>
                </Section>
                <Section title="Case for change">
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {project.benefitsSummary}
                  </p>
                </Section>
              </div>
              <ProjectAppraisal
                projectId={project.id}
                wholeLifeCost={Math.max(project.budget, project.forecast)}
              />
              <RelevantLessons
                projectTypeTags={projectTypeTags}
                phaseIndex={1}
                excludeProjectId={project.id}
                requireTick
                ticked={lessonsReviewed}
                onTick={setLessonsReviewed}
              />
            </div>
          )}
          {handover && (
            <BenefitsHandoverWizard
              project={project}
              close={() => setHandover(false)}
              onComplete={(count) => {
                setHandedOver(count);
                setHandover(false);
              }}
            />
          )}
        </>
      )}
      {openDecision && (
        <DecisionPanel
          decision={openDecision}
          all={governance.data?.decisions ?? decisions}
          close={() => setOpenDecisionId(null)}
        />
      )}
    </div>
  );
}
