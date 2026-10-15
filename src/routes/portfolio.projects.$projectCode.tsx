import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Circle, Gavel } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { AppraisalPanel } from "@/components/appraisal-panel";
import { BenefitSummary } from "@/components/benefit-summary";
import { BenefitsHandoverWizard } from "@/components/benefits-handover";
import { ProjectAppraisal, ProjectBenefits } from "@/components/project-benefits";
import { DecisionPanel } from "@/components/decision-panel";
import { DecisionLog } from "@/components/decision-log";
import { DeliveryWorkspace } from "@/components/delivery-workspace";
import { DependencyTab } from "@/components/dependency-tab";
import { ChangeBaselineAction } from "@/components/change-baseline";
import { toBaselineChange } from "@/services/financials";
import { ProjectFinancials } from "@/components/project-financials";
import { GateChecklist } from "@/components/gate-checklist";
import { HealthPill } from "@/components/health-pill";
import { LessonsTab } from "@/components/lessons-tab";
import { ProjectMilestones } from "@/components/project-milestones";
import { ProjectRaid } from "@/components/project-raid";
import { ProjectResources } from "@/components/project-resources";
import { QueryState } from "@/components/query-state";
import { RelevantLessons } from "@/components/relevant-lessons";
import { AssumptionsWorkspace } from "@/components/assumptions-workspace";
import { ProjectHeader } from "@/components/project-header";
import { TopBand } from "@/components/shell-slots";
import { ProjectOverviewBand } from "@/components/overview/project-overview-band";
import { ProjectOverviewWork } from "@/components/overview/project-overview-work";
import { useGateChecklist } from "@/hooks/use-gate-checklist";
import { useGateTicks, useProjectGates, useToggleGateTick } from "@/hooks/use-gate-ticks";
import { phaseByName } from "@/services/gates";
import { toast } from "sonner";
import { StatusWorkspace } from "@/components/status-workspace";
import { TaskWorkspace } from "@/components/task-workspace";
import {
  useMilestones,
  usePeople,
  usePhases,
  usePortfolioNames,
  useProject,
  useProjectPermissions,
} from "@/hooks/use-hierarchy";
import { useFormat } from "@/lib/format";
import {
  PROJECT_SUBTABS,
  defaultSub,
  projectPanelId,
  projectTabId,
  resolveProjectTab,
  type GroupedTab,
  type ProjectSubtab,
  type ProjectTab,
} from "@/lib/project-tabs";
import { cn } from "@/lib/utils";
import { useProjectAssurance } from "@/hooks/use-assurance";
import { useStatusReports } from "@/hooks/use-status-reports";
import { scopedTo, type ResolvedDecision } from "@/services/decisions";
import { useGovernance } from "@/hooks/use-governance";
import type { ProjectDetail } from "@/services/hierarchy";
import { getProjectLessons, hasPhaseLessonsReview } from "@/services/lessons";
import { useLessons } from "@/hooks/use-lessons";
import { toTaskSource } from "@/services/work-items";

export const Route = createFileRoute("/portfolio/projects/$projectCode")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.projectCode.toUpperCase()} — Virtual PMO` },
      { name: "description", content: "Project detail." },
    ],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tab?: string | undefined;
    sub?: string | undefined;
    task?: string | undefined;
    /** ?dialog=justify opens the Add justification form (overview signals link to it). */
    dialog?: "justify" | undefined;
    /** ?decision=<id> opens that decision on RAID log › Decisions. */
    decision?: string | undefined;
  } => {
    const text = (key: string) =>
      typeof search[key] === "string" && search[key] ? (search[key] as string) : undefined;
    return {
      tab: text("tab"),
      sub: text("sub"),
      task: text("task"),
      dialog: text("dialog") === "justify" ? "justify" : undefined,
      decision: text("decision"),
    };
  },
  component: ProjectPage,
});

function ProjectPage() {
  const { projectCode } = Route.useParams();
  const project = useProject(projectCode);
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

/** Second-level tabs for Plan and RAID log (?sub=). */
function SubTabs({
  group,
  value,
  onChange,
}: {
  group: GroupedTab;
  value: ProjectSubtab | undefined;
  onChange: (sub: ProjectSubtab) => void;
}) {
  return (
    <nav
      aria-label={group === "plan" ? "Plan sections" : "RAID log sections"}
      className="-mt-2 flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/50 p-1 sm:w-fit"
    >
      {PROJECT_SUBTABS[group].map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={value === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
          className={cn(
            "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === item.id
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function ProjectBody({ project }: { project: ProjectDetail }) {
  const navigate = useNavigate();
  const format = useFormat();
  const search = Route.useSearch();
  const { tab, sub } = resolveProjectTab(search);
  // ?tab=&sub= in the URL; the old single tab name and ?task= resolve through resolveProjectTab.
  const setTab = (next: ProjectTab, nextSub: ProjectSubtab | undefined = defaultSub(next)) =>
    void navigate({
      to: ".",
      search: (prev: typeof search) => ({
        ...(next === "plan" && nextSub === "tasks" && prev.task ? { task: prev.task } : {}),
        ...(next === "overview" ? {} : { tab: next }),
        ...(nextSub ? { sub: nextSub } : {}),
      }),
      replace: true,
    });
  const [handover, setHandover] = useState(false);
  const [handedOver, setHandedOver] = useState<number | null>(null);
  const [openDecisionId, setOpenDecisionId] = useState<string | null>(null);

  // ---- From Supabase ----
  const phases = usePhases();
  const portfolios = usePortfolioNames();
  const people = usePeople();
  const milestones = useMilestones([project.id], project.id);
  const portfolio = portfolios.data?.find((item) => item.id === project.portfolioId);
  const names = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person.name])),
    [people.data],
  );

  // ---- Still prototype data (Stage 4c), keyed by the demo project's old id ----
  const permissions = useProjectPermissions(project.id);
  const governance = useGovernance();
  const decisions = useMemo(
    () => scopedTo(governance.data?.decisions ?? [], { projectId: project.id }),
    [governance.data, project.id],
  );
  const openDecision = decisions.find((item) => item.id === openDecisionId);
  const changes = useMemo(
    () =>
      (governance.data?.changes ?? []).filter((change) => change.scope.projectId === project.id),
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
  // Checklist ticks are saved against the gate milestone of the project's current phase
  // (v_project_gates); the lessons-reviewed criterion passes when its tick is saved.
  const gateTicks = useGateTicks(project.id);
  const toggleGateTick = useToggleGateTick(project.id);
  const projectGates = useProjectGates(project.id);
  const gateMilestone = projectGates.data?.current;
  const manualTicks = useMemo(
    () =>
      (gateTicks.data ?? [])
        .filter((tick) => tick.milestoneId === gateMilestone?.milestoneId)
        .map((tick) => tick.criterionId),
    [gateTicks.data, gateMilestone?.milestoneId],
  );
  const lessonsCriterion = phaseByName(project.phaseName)?.criteria.find(
    (item) => item.check === "lessons-reviewed" && item.tiers.includes(project.tier),
  );
  const lessonsReviewed = !!lessonsCriterion && manualTicks.includes(lessonsCriterion.id);
  const toggleTick = (criterionId: string, ticked: boolean) => {
    if (!gateMilestone)
      return void toast.error(
        "No gate milestone for this phase. Add one on Plan › Milestones before ticking criteria.",
      );
    // A refused tick is toasted by the MutationCache.
    toggleGateTick.mutate({
      projectId: project.id,
      milestoneId: gateMilestone.milestoneId,
      criterionId,
      ticked,
    });
  };
  // Shared with Plan › Gates so the Overview gate signal counts the same ticks.
  const gateChecklist = useGateChecklist({
    project,
    lessonsReviewed,
    phaseReviewHeld,
    manualTicks,
  });
  const projectTypeTags = Array.from(new Set(lessons.flatMap((lesson) => lesson.projectTypeTags)));
  const assurance = useProjectAssurance(project).data ?? undefined;

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
    ...reports
      .filter((item) => !item.isDraft)
      .map((item) => ({
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
    <div
      role="tabpanel"
      id={projectPanelId}
      aria-labelledby={projectTabId(tab)}
      className="space-y-6"
    >
      <TopBand>
        <ProjectHeader
          project={project}
          portfolioName={portfolio?.name}
          phases={phases.data ?? []}
          assurance={assurance}
          finishSlip={project.health.finishSlip}
          canEdit={permissions.canEdit}
          tab={tab}
          onTabChange={(next) => setTab(next)}
          justifyRequested={search.dialog === "justify"}
          onJustifyClosed={() =>
            void navigate({
              to: ".",
              search: (prev: typeof search) => ({ ...prev, dialog: undefined }),
              replace: true,
            })
          }
          onHandover={() => setHandover(true)}
          onArchived={() => void navigate({ to: "/portfolio/projects" })}
        />
      </TopBand>
      {tab === "overview" && (
        <ProjectOverviewBand
          project={project}
          gate={
            gateMilestone && {
              title: gateMilestone.title,
              date: gateMilestone.forecastDate,
              delivered: Boolean(gateMilestone.actualDate),
              passed: gateChecklist.passed,
              total: gateChecklist.total,
            }
          }
          gatesNotPassed={projectGates.data?.notPassed}
        />
      )}
      {(tab === "plan" || tab === "raid") && (
        <SubTabs group={tab} value={sub} onChange={(next) => setTab(tab, next)} />
      )}

      {handedOver !== null && (
        <div className="flex items-center gap-2 rounded-md border border-health-good/40 bg-health-good/10 p-3 text-sm">
          <CheckCircle2 className="size-4 text-health-good-foreground" />
          Benefits handover complete. {handedOver} benefit{handedOver === 1 ? "" : "s"} now sit with
          a BAU owner and keep appearing on Realisation and the Value Dashboard.
        </div>
      )}

      {tab === "overview" && (
        <ProjectOverviewWork
          project={project}
          onOpen={(target) => setTab(target.tab, "sub" in target ? target.sub : undefined)}
        />
      )}
      {tab === "plan" && sub === "milestones" && <ProjectMilestones projectId={project.id} />}
      {tab === "plan" && sub === "gates" && (
        <GateChecklist
          project={project}
          lessonsReviewed={lessonsReviewed}
          phaseReviewHeld={phaseReviewHeld}
          manualTicks={manualTicks}
          gateLabel={gateMilestone ? `${gateMilestone.ref} · ${gateMilestone.title}` : undefined}
          gateLoading={projectGates.isPending}
          onAddMilestone={() => setTab("plan", "milestones")}
          readOnly={!permissions.canEdit || !gateMilestone || toggleGateTick.isPending}
          onToggleManual={(id) => toggleTick(id, !manualTicks.includes(id))}
        />
      )}
      {tab === "raid" && sub === "risks" && <ProjectRaid projectId={project.id} />}
      {tab === "financials" && <ProjectFinancials project={project} />}

      {/* Not yet on Supabase (Stage 4c): these tabs read the demo project's prototype record. */}
      {
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
          {/* Below the report history: decisions, reports and milestones as they happened. */}
          {tab === "status" && (
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
          )}
          {tab === "plan" && sub === "tasks" && (
            <TaskWorkspace projectId={project.id} taskSource={toTaskSource(project.taskSource)} />
          )}
          {tab === "delivery" && <DeliveryWorkspace projectId={project.code} />}
          {tab === "resources" && <ProjectResources projectId={project.id} />}
          {tab === "benefits" && <ProjectBenefits projectId={project.id} />}
          {tab === "plan" && sub === "dependencies" && <DependencyTab projectId={project.id} />}
          {tab === "raid" && sub === "decisions" && (
            <DecisionLog
              scope={{ projectId: project.id }}
              createScope={{ projectId: project.id, workspaceId: project.workspaceId }}
              canCreate={permissions.canEdit}
              initialOpenId={search.decision}
            />
          )}
          {tab === "raid" && sub === "assumptions" && (
            <AssumptionsWorkspace scope={{ projectId: project.id }} compact />
          )}
          {tab === "raid" && sub === "lessons" && <LessonsTab project={project} />}
          {tab === "raid" && sub === "changes" && (
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
                        {change.ref} · {change.type} · {format.currency(change.costImpact)} ·{" "}
                        {change.scheduleImpactDays} days
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <ChangeBaselineAction change={toBaselineChange(change)} />
                      <span className="text-sm">{change.status}</span>
                    </div>
                  </div>
                ))}
                {!changes.length && (
                  <p className="mt-3 text-sm text-muted-foreground">No change requests raised.</p>
                )}
              </div>
            </Section>
          )}
          {tab === "business-case" && (
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
                onTick={(ticked) => lessonsCriterion && toggleTick(lessonsCriterion.id, ticked)}
                tickDisabled={!permissions.canEdit || !gateMilestone || toggleGateTick.isPending}
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
      }
      {openDecision && (
        <DecisionPanel
          decision={openDecision}
          all={governance.data?.decisions ?? decisions}
          close={() => setOpenDecisionId(null)}
          onOpen={setOpenDecisionId}
        />
      )}
    </div>
  );
}
