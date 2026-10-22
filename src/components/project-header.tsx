// Persistent project header (every tab), on the dark top band: breadcrumb, title, chips, actions,
// lifecycle stepper, people and dates, the health bar and the tab strip
// (docs/design/project-overview-design.html). Every RAG here comes from the v_* views:
// declared/evidenced/divergence from v_project_divergence (AssuranceRow), the dimensions and the
// forecast finish from v_project_health. This file only composes and formats.
import { HealthUpdating } from "@/components/health-updating";
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, ListPlus } from "lucide-react";
import { JustificationForm } from "@/components/divergence-note";
import { ProjectEditAction, ProjectMoreMenu, StateBadge } from "@/components/entity-management";
import { FavouriteButton } from "@/components/favourite-button";
import { ArchivedWorkspaceBadge } from "@/components/workspace-badge";
import { openIssueTask } from "@/components/issue-task-sheet";
import { HealthMark } from "@/components/overview/project-watchlist";
import { Button } from "@/components/ui/button";
import type { Health } from "@/data/types";
import { useFormat } from "@/lib/format";
import {
  PROJECT_TABS,
  TASK_SOURCE,
  phaseLabel,
  projectPanelId,
  projectTabId,
  type ProjectTab,
} from "@/lib/project-tabs";
import { cn } from "@/lib/utils";
import { divergenceText, type AssuranceRow } from "@/services/assurance";
import type { Phase, ProjectDetail } from "@/services/hierarchy";
import { term, useSettings } from "@/services/settings";

const HEALTH_WORD: Record<Health, string> = {
  "On Track": "Green",
  "At Risk": "Amber",
  "Off Track": "Red",
  "Not Set": "Not set",
};

const bandButton = "border-pmo-line bg-pmo-panel-2 text-pmo-text hover:bg-pmo-line";

export function ProjectHeader({
  project,
  portfolioName,
  phases,
  assurance,
  finishSlip,
  canEdit,
  tab,
  onTabChange,
  justifyRequested,
  onJustifyClosed,
  onHandover,
  onArchived,
}: {
  project: ProjectDetail;
  portfolioName: string | undefined;
  phases: Phase[];
  /** This project's v_project_divergence row; undefined while loading. */
  assurance: AssuranceRow | undefined;
  /** Forecast finish against baseline on the schedule tolerance (from the view); undefined = not available. */
  finishSlip: Health | undefined;
  canEdit: boolean;
  tab: ProjectTab;
  onTabChange: (tab: ProjectTab) => void;
  /** ?dialog=justify: open the Add justification form; onJustifyClosed clears the param. */
  justifyRequested?: boolean | undefined;
  onJustifyClosed?: (() => void) | undefined;
  onHandover: () => void;
  onArchived: () => void;
}) {
  const settings = useSettings();
  const format = useFormat();
  const lateDays = assurance?.finishVsBaselineDays ?? 0;

  return (
    <header className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap gap-1.5 pt-4 text-[12.5px] text-pmo-muted"
      >
        <Link to="/portfolio" className="hover:text-pmo-text hover:underline">
          {term("portfolio", settings)}
        </Link>
        {portfolioName && (
          <>
            <span aria-hidden>/</span>
            <Link to="/portfolio" className="hover:text-pmo-text hover:underline">
              {portfolioName}
            </Link>
          </>
        )}
        {project.programmeId && (
          <>
            <span aria-hidden>/</span>
            <Link
              to="/portfolio/programmes/$programmeId"
              params={{ programmeId: project.programmeId }}
              className="hover:text-pmo-text hover:underline"
            >
              {project.programmeName}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-x-6 gap-y-4 pb-4 pt-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-pmo-text sm:text-[28px]">
              {project.name}
            </h1>
            <span className="pmo-num rounded border border-pmo-line px-1.5 py-px text-xs text-pmo-muted">
              {project.code}
            </span>
            <span className="text-pmo-muted">
              <FavouriteButton target={{ projectId: project.id }} />
            </span>
            <StateBadge state={project.state} />
            <ArchivedWorkspaceBadge workspaceId={project.workspaceId} />
          </div>
          {project.businessCase && (
            <p
              className="mt-1 line-clamp-1 max-w-[70ch] text-sm text-pmo-muted"
              title={project.businessCase}
            >
              {project.businessCase}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip label="Tier">{project.tier}</Chip>
            <Chip label="Priority">{project.priority}</Chip>
            <Chip label="Tasks">{TASK_SOURCE[project.taskSource] ?? project.taskSource}</Chip>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectEditAction project={project} className={bandButton} />
          <Button size="sm" variant="outline" className={bandButton} asChild>
            <Link
              to="/portfolio/projects/$projectCode/business-case"
              params={{ projectCode: project.code }}
            >
              Business case
            </Link>
          </Button>
          <Button
            size="sm"
            className="bg-pmo-accent text-pmo-bg hover:bg-pmo-accent/90"
            onClick={() => openIssueTask(project.id)}
          >
            <ListPlus />
            Issue task
          </Button>
          <ProjectMoreMenu
            project={project}
            canHandover={canEdit}
            onHandover={onHandover}
            onArchived={onArchived}
            className={bandButton}
          />
        </div>
      </div>

      <div className="grid gap-7 border-b border-pmo-line pb-5 pt-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Lifecycle phases={phases} phaseId={project.phaseId} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
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
            {format.date(project.health.forecastFinishDate ?? undefined)}
            {lateDays > 0 && (
              <small
                className={cn(
                  "block font-geist text-xs font-normal",
                  finishSlip === "Off Track"
                    ? "text-pmo-bad-text"
                    : finishSlip === "At Risk"
                      ? "text-pmo-warn"
                      : "text-pmo-muted",
                )}
              >
                {lateDays} day{lateDays === 1 ? "" : "s"} late
                {finishSlip === "Off Track" ? ", beyond tolerance" : ""}
              </small>
            )}
          </Fact>
        </dl>
      </div>

      <HealthBar
        project={project}
        assurance={assurance}
        canJustify={canEdit}
        justifyRequested={justifyRequested}
        onJustifyClosed={onJustifyClosed}
      />

      <div
        role="tablist"
        aria-label="Project sections"
        className="-mx-1 flex gap-0.5 overflow-x-auto [scrollbar-width:none]"
        onKeyDown={(event) => moveTab(event, tab, onTabChange)}
      >
        {PROJECT_TABS.map((item) => (
          <button
            key={item.id}
            id={projectTabId(item.id)}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            aria-controls={projectPanelId}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 pb-3 pt-2.5 text-[13.5px] font-medium transition-colors",
              tab === item.id
                ? "border-pmo-accent text-pmo-text"
                : "border-transparent text-pmo-muted hover:text-pmo-text",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </header>
  );
}

/** Left/right/home/end move between tabs (WAI-ARIA tabs pattern, activation follows focus). */
function moveTab(event: KeyboardEvent, tab: ProjectTab, onTabChange: (tab: ProjectTab) => void) {
  const ids = PROJECT_TABS.map((t) => t.id);
  const at = ids.indexOf(tab);
  const next =
    event.key === "ArrowRight"
      ? ids[(at + 1) % ids.length]
      : event.key === "ArrowLeft"
        ? ids[(at - 1 + ids.length) % ids.length]
        : event.key === "Home"
          ? ids[0]
          : event.key === "End"
            ? ids[ids.length - 1]
            : undefined;
  if (!next) return;
  event.preventDefault();
  onTabChange(next);
  document.getElementById(projectTabId(next))?.focus();
}

export function Chip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="rounded-full border border-pmo-line bg-pmo-panel-2 px-2.5 py-0.5 text-xs text-pmo-text">
      <span className="mr-1 font-medium text-pmo-muted">{label}</span>
      {children}
    </span>
  );
}

export function Fact({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-pmo-muted">{label}</dt>
      <dd className={cn("mt-0.5 truncate font-medium text-pmo-text", mono && "pmo-num")}>
        {children}
      </dd>
    </div>
  );
}

export function Lifecycle({
  phases,
  phaseId,
  size,
}: {
  phases: Phase[];
  phaseId: string | null;
  /** Compact (portfolio row panel): the "Phase N of M" line over a thin segmented bar. */
  size?: "default" | "compact" | undefined;
}) {
  const current = phases.findIndex((phase) => phase.id === phaseId);
  const now = current >= 0 ? phases[current] : undefined;
  if (size === "compact")
    return (
      <div className="min-w-0">
        <p className="text-[12.5px] text-pmo-muted">
          Lifecycle:{" "}
          <strong className="font-medium text-pmo-text">
            {now ? `Phase ${current + 1} of ${phases.length}, ${phaseLabel(now.name)}` : "Not set"}
          </strong>
        </p>
        <div aria-hidden className="mt-1.5 flex gap-1">
          {phases.map((phase, index) => (
            <span
              key={phase.id}
              title={phaseLabel(phase.name)}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                index < current
                  ? "bg-pmo-accent"
                  : index === current
                    ? "bg-pmo-accent/60 ring-1 ring-pmo-accent"
                    : "bg-pmo-line",
              )}
            />
          ))}
        </div>
      </div>
    );
  return (
    <div className="min-w-0">
      <p className="mb-3 text-[12.5px] text-pmo-muted">
        Lifecycle:{" "}
        <strong className="font-medium text-pmo-text">
          {now ? `Phase ${current + 1} of ${phases.length}, ${phaseLabel(now.name)}` : "Not set"}
        </strong>
      </p>
      <ol
        className="grid grid-cols-3 gap-y-3.5 sm:[grid-template-columns:repeat(var(--phases),minmax(0,1fr))]"
        style={{ "--phases": Math.max(phases.length, 1) } as CSSProperties}
      >
        {phases.map((phase, index) => {
          const state = index < current ? "done" : index === current ? "now" : "next";
          return (
            <li
              key={phase.id}
              aria-current={state === "now" ? "step" : undefined}
              className={cn(
                "relative pr-2 pt-5 text-xs",
                state === "now" ? "font-medium text-pmo-text" : "text-pmo-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 top-[5px] h-[3px]",
                  state === "done" ? "bg-pmo-accent" : "bg-pmo-line",
                )}
                style={
                  state === "now"
                    ? {
                        background:
                          "linear-gradient(90deg, var(--pmo-accent) 45%, var(--pmo-line) 45%)",
                      }
                    : undefined
                }
              />
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-0 grid size-[13px] place-items-center rounded-full border-2",
                  state === "done"
                    ? "border-pmo-accent bg-pmo-accent text-white"
                    : state === "now"
                      ? "border-pmo-accent bg-pmo-bg shadow-[0_0_0_4px_color-mix(in_srgb,var(--pmo-accent)_30%,transparent)]"
                      : "border-pmo-line bg-pmo-bg",
                )}
              >
                {state === "done" && <Check className="size-2" strokeWidth={4} />}
              </span>
              {phaseLabel(phase.name)}
              <span className="block text-[11px] font-normal opacity-80">
                {phase.shortName}
                <span className="sr-only">
                  {state === "done"
                    ? ", complete"
                    : state === "now"
                      ? ", current"
                      : ", not started"}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function HealthBar({
  project,
  assurance,
  canJustify,
  justifyRequested,
  onJustifyClosed,
}: {
  project: ProjectDetail;
  assurance: AssuranceRow | undefined;
  canJustify: boolean;
  justifyRequested?: boolean | undefined;
  onJustifyClosed?: (() => void) | undefined;
}) {
  const [opened, setJustifying] = useState(false);
  const dims: Array<[string, Health]> = [
    ["Schedule", project.health.schedule],
    ["Financial", project.health.financial],
    ["Issues & risks", project.health.issue],
    ["Benefits", project.health.benefit],
  ];
  const canAdd =
    !!assurance &&
    assurance.divergent &&
    !assurance.justified &&
    !!assurance.latestReportId &&
    canJustify;
  const justifying = opened || (!!justifyRequested && canAdd);
  return (
    <dl
      aria-label="Project health"
      className="my-4 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-pmo-line bg-pmo-line md:grid-cols-4 xl:grid-cols-[minmax(260px,1.4fr)_repeat(4,minmax(0,1fr))]"
    >
      <div className="col-span-2 min-w-0 bg-pmo-panel-2 px-3.5 py-2.5 md:col-span-4 xl:col-span-1">
        <dt className="flex flex-wrap items-center justify-between gap-2 text-xs text-pmo-muted">
          Overall
          <HealthUpdating className="text-pmo-muted" />
        </dt>
        <dd className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-medium">
          {assurance ? (
            <>
              <span
                className="inline-flex items-center gap-1.5"
                title="Declared in the latest submitted status report"
              >
                <HealthMark health={assurance.declared ?? "Not Set"} shape="ring" />
                {assurance.declared
                  ? `Declared ${HEALTH_WORD[assurance.declared].toLowerCase()}`
                  : "No report yet"}
              </span>
              <span
                className="inline-flex items-center gap-1.5"
                title="What the delivery evidence shows"
              >
                <HealthMark health={assurance.evidenced} shape="dot" />
                Evidenced {HEALTH_WORD[assurance.evidenced].toLowerCase()}
              </span>
              <Divergence row={assurance} />
              {canAdd && !justifying && (
                <button
                  type="button"
                  onClick={() => setJustifying(true)}
                  className="text-xs font-normal text-pmo-text underline underline-offset-2 hover:text-pmo-accent"
                >
                  Add justification
                </button>
              )}
              {justifying && (
                <JustificationForm
                  row={assurance}
                  onDone={() => {
                    setJustifying(false);
                    if (justifyRequested) onJustifyClosed?.();
                  }}
                  className="font-normal"
                />
              )}
            </>
          ) : (
            <span className="text-xs font-normal text-pmo-muted">Loading…</span>
          )}
        </dd>
      </div>
      {dims.map(([label, health]) => (
        <div key={label} className="min-w-0 bg-pmo-panel-2 px-3.5 py-2.5">
          <dt className="text-xs text-pmo-muted">{label}</dt>
          <dd className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium">
            <HealthMark health={health} shape="dot" />
            {HEALTH_WORD[health]}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Divergence wording by kind; justified shows the justification instead of an alert. */
function Divergence({ row }: { row: AssuranceRow }) {
  if (row.justified)
    return (
      <span className="w-full text-xs font-normal text-pmo-muted">
        <span className="mr-1.5 rounded-full border border-pmo-line px-2 py-px font-medium text-pmo-text">
          Justified
        </span>
        {row.justification && <>“{row.justification}”</>}
      </span>
    );
  if (!row.divergent) return null;
  return (
    <span
      className={cn(
        "flex w-full items-start gap-1.5 text-xs font-normal",
        row.divergenceAlert ? "text-pmo-bad-text" : "text-pmo-warn",
      )}
    >
      {row.divergenceAlert && <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />}
      <span>
        {row.divergenceAlert && <span className="font-medium">Divergence alert: </span>}
        {divergenceText(row)}
      </span>
    </span>
  );
}
