import { formatCompactCurrency, formatDate, fromIsoDate, toIsoDate } from "@/lib/format";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  Download,
  FileDown,
  FileText,
  Save,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HealthPill } from "@/components/health-pill";
import type { Health } from "@/data/types";
import type { CollectionView as Collection, PackProject as Project } from "@/services/collections";
import {
  buildBenefitsSection,
  buildDecisionsSection,
  issuedPackPages,
  packPages,
  type CommitteePackContent,
  type PackBenefitsSection,
  type PackDecisionsSection,
  type PackPage as PackPageOf,
} from "@/services/committee-packs";
import { useBenefits } from "@/hooks/use-benefits";
import { useGovernance } from "@/hooks/use-governance";
import { usePackProjects } from "@/hooks/use-collections";
import { useCommitteePack, useIssueCommitteePack } from "@/hooks/use-committee-packs";
import { useWorkspaceRole } from "@/hooks/use-permissions";
import { errorMessage } from "@/services/service-error";
import { todayIso } from "@/lib/today";
import { getSettings } from "@/services/settings";
import { cn } from "@/lib/utils";

type PackPage = PackPageOf<Project>;
/** What a pack page header and cover need from the collection. */
type PackCollection = Pick<Collection, "id" | "name"> & { workspaceId?: string };
/** A stored section, or the note to show in its place (loading, failed, not stored). */
type Section<T> = T | string;
const money = formatCompactCurrency;

/** The latest submitted status report; no invented narrative when there isn't one. */
function latestNarrative(project: Project) {
  return (
    project.report ?? {
      accomplished: "No status report has been submitted for this project.",
      planned: "—",
      comments: "",
      date: "",
    }
  );
}

function PackHeader({
  collection,
  pageNumber,
  total,
}: {
  collection: PackCollection;
  pageNumber: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-3 text-[10px] font-semibold uppercase text-muted-foreground">
      <span>
        {getSettings().organisation.shortName} · {collection.name}
      </span>
      <span>
        {pageNumber} / {total}
      </span>
    </div>
  );
}

function CoverPage({
  collection,
  meetingDate,
  generatedAt,
  coverText,
  issued,
}: {
  collection: PackCollection;
  meetingDate: string;
  generatedAt: string;
  coverText: string;
  issued: boolean;
}) {
  return (
    <div className="flex min-h-[580px] flex-col justify-between p-10 sm:p-14">
      {getSettings().templates.committeePack.showLogo && (
        <div className="flex items-center gap-3">
          {getSettings().organisation.logoDataUrl ? (
            <img
              src={getSettings().organisation.logoDataUrl}
              alt=""
              className="size-11 rounded-md object-contain"
            />
          ) : (
            <span className="grid size-11 place-items-center rounded-md bg-primary font-display font-bold text-primary-foreground">
              {getSettings().organisation.shortName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <p className="font-display font-semibold">{getSettings().organisation.name}</p>
            <p className="text-xs text-muted-foreground">
              {getSettings().organisation.shortName} portfolio office
            </p>
          </div>
        </div>
      )}
      <div className="max-w-3xl">
        <p className="mb-4 text-xs font-semibold uppercase text-primary">Governance pack</p>
        <h2 className="font-display text-4xl font-semibold sm:text-6xl">{collection.name}</h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">{coverText}</p>
      </div>
      <div className="grid gap-6 border-t border-border pt-6 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Meeting date</p>
          <p className="mt-1 font-semibold">{meetingDate}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{issued ? "Issued" : "Generated"}</p>
          <p className="mt-1 font-semibold">{generatedAt}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryPage({
  collection,
  projects,
  pageNumber,
  total,
}: {
  collection: PackCollection;
  projects: Project[];
  pageNumber: number;
  total: number;
}) {
  const rag = {
    green: projects.filter((p) => p.health.overall === "On Track").length,
    amber: projects.filter((p) => p.health.overall === "At Risk").length,
    red: projects.filter((p) => p.health.overall === "Off Track").length,
  };
  const budget = projects.reduce((sum, p) => sum + p.budget, 0),
    forecast = projects.reduce((sum, p) => sum + p.forecast, 0);
  const programmeRows = Object.values(
    projects.reduce<Record<string, { name: string; count: number; budget: number }>>(
      (rows, project) => {
        const key = project.programmeId ?? "none";
        const current = rows[key] ?? { name: project.programmeName, count: 0, budget: 0 };
        rows[key] = {
          ...current,
          count: current.count + 1,
          budget: current.budget + project.budget,
        };
        return rows;
      },
      {},
    ),
  );
  return (
    <div className="min-h-[580px] p-7 sm:p-10">
      <PackHeader collection={collection} pageNumber={pageNumber} total={total} />
      <div className="mt-7">
        <p className="text-xs font-semibold uppercase text-primary">Portfolio summary</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Delivery at a glance</h2>
      </div>
      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Projects" value={String(projects.length)} />
        <Metric label="On track" value={String(rag.green)} tone="good" />
        <Metric label="At risk" value={String(rag.amber)} tone="warn" />
        <Metric label="Off track" value={String(rag.red)} tone="bad" />
        <Metric label="Total budget" value={money(budget)} />
      </div>
      <div className="mt-7 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-md border border-border p-5">
          <h3 className="font-semibold">Financial position</h3>
          <div className="mt-5 grid grid-cols-2 gap-5">
            <div>
              <p className="text-xs text-muted-foreground">Approved budget</p>
              <p className="mt-1 text-2xl font-semibold">{money(budget)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Forecast</p>
              <p className="mt-1 text-2xl font-semibold">{money(forecast)}</p>
            </div>
          </div>
          <div className="mt-5 h-2 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, (forecast / budget) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Forecast is {money(Math.abs(forecast - budget))} {forecast > budget ? "above" : "below"}{" "}
            approved budget.
          </p>
        </div>
        <div className="rounded-md border border-border p-5">
          <h3 className="font-semibold">Programme coverage</h3>
          <div className="mt-3 divide-y divide-border">
            {programmeRows.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="line-clamp-1">{row.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {row.count} projects · {money(row.budget)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExceptionsPage({
  collection,
  projects,
  pageNumber,
  total,
}: {
  collection: PackCollection;
  projects: Project[];
  pageNumber: number;
  total: number;
}) {
  const exceptions = projects.filter((project) => project.health.overall !== "On Track");
  return (
    <div className="min-h-[580px] p-7 sm:p-10">
      <PackHeader collection={collection} pageNumber={pageNumber} total={total} />
      <div className="mt-7">
        <p className="text-xs font-semibold uppercase text-primary">Exceptions</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Items requiring attention</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Red and amber projects, ordered by severity.
        </p>
      </div>
      <div className="mt-6 space-y-4">
        {exceptions.map((project) => {
          const narrative = latestNarrative(project);
          return (
            <div key={project.id} className="rounded-md border border-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{project.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {project.programmeName} · {project.managerName}
                  </p>
                </div>
                <HealthPill health={project.health.overall} />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold">Latest commentary</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {narrative.comments}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold">Next action</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {narrative.planned}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MilestonesPage({
  collection,
  projects,
  pageNumber,
  total,
}: {
  collection: PackCollection;
  projects: Project[];
  pageNumber: number;
  total: number;
}) {
  const items = projects
    .flatMap((project) =>
      project.milestones
        .filter(
          (item) => item.reportToCommittee || item.status === "Overdue" || item.status === "Late",
        )
        .map((item) => ({ ...item, projectName: project.name })),
    )
    .sort((a, b) => a.forecastDate.localeCompare(b.forecastDate));
  return (
    <div className="min-h-[580px] p-7 sm:p-10">
      <PackHeader collection={collection} pageNumber={pageNumber} total={total} />
      <div className="mt-7">
        <p className="text-xs font-semibold uppercase text-primary">Milestones</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Committee milestone outlook</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Reportable gates, overdue milestones and forecast slippage.
        </p>
      </div>
      <div className="mt-6 overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[1fr_130px_110px] bg-muted/50 px-4 py-3 text-xs font-semibold text-muted-foreground">
          <span>Milestone</span>
          <span>Forecast</span>
          <span>Status</span>
        </div>
        {items.slice(0, 10).map((item) => (
          <div
            key={`${item.projectName}-${item.id}`}
            className="grid grid-cols-[1fr_130px_110px] items-center border-t border-border px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.projectName}</p>
            </div>
            <span>{formatDate(item.forecastDate)}</span>
            <span
              className={cn(
                "text-xs font-semibold",
                item.status === "Overdue" && "text-health-bad-foreground",
                item.status === "Late" && "text-health-warn-foreground",
              )}
            >
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shown in place of a section that is loading, failed to load or was not stored. */
function SectionNote({ children }: { children: string }) {
  return (
    <p className="mt-6 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function BenefitsPage({
  collection,
  section,
  pageNumber,
  total,
}: {
  collection: PackCollection;
  section: Section<PackBenefitsSection>;
  pageNumber: number;
  total: number;
}) {
  if (typeof section === "string")
    return (
      <div className="min-h-[580px] p-7 sm:p-10">
        <PackHeader collection={collection} pageNumber={pageNumber} total={total} />
        <p className="mt-7 text-xs font-semibold uppercase text-primary">Benefits realisation</p>
        <SectionNote>{section}</SectionNote>
      </div>
    );
  const { metrics, objectives, behind, overdue } = section;
  return (
    <div className="min-h-[580px] p-7 sm:p-10">
      <PackHeader collection={collection} pageNumber={pageNumber} total={total} />
      <div className="mt-7">
        <p className="text-xs font-semibold uppercase text-primary">Benefits realisation</p>
        <h2 className="mt-2 font-display text-3xl font-semibold">Portfolio value and exceptions</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Planned against realised value, contribution by objective, and the benefits needing
          attention.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Planned value" value={money(metrics.planned)} />
        <Metric label="Realised" value={money(metrics.realised)} tone="good" />
        <Metric label="% realised" value={`${metrics.percent}%`} />
        <Metric label="Cash-releasing realised" value={money(metrics.cashReleasingRealised)} />
        <Metric
          label="Benefits at risk"
          value={String(metrics.atRisk)}
          tone={metrics.atRisk ? "warn" : "good"}
        />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5">
          <h3 className="font-semibold">Benefits by strategic objective</h3>
          <div className="mt-3 space-y-3">
            {objectives.map((row) => (
              <div key={row.id}>
                <div className="flex justify-between text-xs">
                  <span className="line-clamp-1">{row.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {money(row.realised)} of {money(row.planned)}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, Math.round((row.realised / Math.max(1, row.planned)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {!objectives.length && (
              <p className="text-sm text-muted-foreground">
                No quantified benefits in this collection.
              </p>
            )}
          </div>
        </div>
        <div className="rounded-md border border-border p-5">
          <h3 className="font-semibold">Exceptions</h3>
          <p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">
            Behind profile
          </p>
          <div className="mt-1 space-y-1.5">
            {behind.map((benefit) => (
              <p key={benefit.id} className="text-sm">
                {benefit.reference} · {benefit.title}{" "}
                <span className="text-muted-foreground">
                  ({benefit.percent}% realised, {money(benefit.realised)})
                </span>
              </p>
            ))}
            {!behind.length && (
              <p className="text-sm text-muted-foreground">None behind profile.</p>
            )}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase text-muted-foreground">
            Measurements overdue
          </p>
          <div className="mt-1 space-y-1.5">
            {overdue.map((item) => (
              <p key={item.id} className="text-sm">
                {item.reference} · {item.measureName}{" "}
                <span className="text-muted-foreground">
                  ({item.daysOverdue} days overdue, {item.owner || "unowned"})
                </span>
              </p>
            ))}
            {!overdue.length && (
              <p className="text-sm text-muted-foreground">All measurements are up to date.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionsPage({
  collection,
  section,
  pageNumber,
  total,
}: {
  collection: PackCollection;
  section: Section<PackDecisionsSection>;
  pageNumber: number;
  total: number;
}) {
  const heading = (
    <div className="mt-7">
      <p className="text-xs font-semibold uppercase text-primary">Governance</p>
      <h2 className="mt-2 font-display text-3xl font-semibold">Decisions</h2>
    </div>
  );
  if (typeof section === "string")
    return (
      <div className="min-h-[580px] p-7 sm:p-10">
        <PackHeader collection={collection} pageNumber={pageNumber} total={total} />
        {heading}
        <SectionNote>{section}</SectionNote>
      </div>
    );
  const { required, made } = section;
  return (
    <div className="min-h-[580px] p-7 sm:p-10">
      <PackHeader collection={collection} pageNumber={pageNumber} total={total} />
      {heading}
      <div className="mt-6">
        <h3 className="font-semibold">Decisions required</h3>
        <div className="mt-3 space-y-3">
          {required.map((decision) => (
            <div
              key={decision.id}
              className={cn(
                "rounded-md border p-4",
                decision.overdue && "border-health-bad/40 bg-health-bad/5",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold">
                  {decision.reference} · {decision.title}
                </p>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    decision.overdue ? "text-health-bad-foreground" : "text-muted-foreground",
                  )}
                >
                  Needed by {formatDate(decision.neededBy)}
                  {decision.overdue ? " · overdue" : ""}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {decision.scopeName} · {decision.forum} · {decision.decisionMaker}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{decision.context}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Options: {decision.options.join(" | ")}
              </p>
            </div>
          ))}
          {!required.length && (
            <p className="text-sm text-muted-foreground">
              No decisions are awaiting this committee.
            </p>
          )}
        </div>
      </div>
      <div className="mt-6">
        <h3 className="font-semibold">Decisions made since the last meeting</h3>
        <div className="mt-3 divide-y divide-border">
          {made.map((decision) => (
            <div key={decision.id} className="py-3">
              <p className="text-sm font-medium">
                {decision.reference} · {decision.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDate(decision.decisionDate)} · {decision.forum} · {decision.decisionMaker}{" "}
                chose “{decision.chosenOption}”
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Impact on: {decision.impactSummary}
              </p>
            </div>
          ))}
          {!made.length && (
            <p className="text-sm text-muted-foreground">
              No decisions recorded since the last meeting.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function HighlightPage({
  collection,
  project,
  pageNumber,
  total,
}: {
  collection: PackCollection;
  project: Project;
  pageNumber: number;
  total: number;
}) {
  const narrative = latestNarrative(project),
    risk = project.risks[0],
    milestone = project.milestones.find((item) => item.status !== "Completed");
  return (
    <div className="min-h-[580px] p-7 sm:p-10">
      <PackHeader collection={collection} pageNumber={pageNumber} total={total} />
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-primary">Project highlight report</p>
          <h2 className="mt-2 font-display text-3xl font-semibold">{project.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{project.programmeName}</p>
        </div>
        <HealthPill health={project.health.overall} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Stage" value={project.phaseName} />
        <Metric label="Budget" value={money(project.budget)} />
        <Metric label="Forecast" value={money(project.forecast)} />
        <Metric label="Finish" value={project.finishDate ? formatDate(project.finishDate) : "—"} />
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <HealthFact label="Schedule" health={project.health.schedule} />
        <HealthFact label="Financial" health={project.health.financial} />
        <HealthFact label="Issues & risks" health={project.health.issue} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="rounded-md border border-border p-5">
          <h3 className="font-semibold">Reporting narrative</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {narrative.date
              ? `Latest update · ${formatDate(narrative.date)}`
              : "No status report yet"}
          </p>
          <div className="mt-4">
            <p className="text-xs font-semibold">Accomplished</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{narrative.accomplished}</p>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold">Planned next</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{narrative.planned}</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-md border border-border p-5">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Top risk</p>
            <p className="mt-2 font-semibold">{risk?.title ?? "No open risks"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {risk?.description ?? "No material risk to report."}
            </p>
          </div>
          <div className="rounded-md border border-border p-5">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Next milestone</p>
            <p className="mt-2 font-semibold">{milestone?.title ?? "Stage closure"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Due {formatDate(milestone?.forecastDate ?? project.finishDate ?? "")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted/35 p-4",
        tone === "good" && "border-health-good/30",
        tone === "warn" && "border-health-warn/35",
        tone === "bad" && "border-health-bad/30",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}
function HealthFact({ label, health }: { label: string; health: Health }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <HealthPill health={health} />
    </div>
  );
}

/** One pack page, the same on screen and in the printed PDF. */
function PackPageBody({
  page,
  index,
  total,
  collection,
  projects,
  meetingDate,
  generatedAt,
  coverText,
  issued,
  benefits,
  decisions,
}: {
  page: PackPage;
  index: number;
  total: number;
  collection: PackCollection;
  projects: Project[];
  meetingDate: string;
  generatedAt: string;
  coverText: string;
  issued: boolean;
  benefits: Section<PackBenefitsSection>;
  decisions: Section<PackDecisionsSection>;
}) {
  const common = { collection, pageNumber: index + 1, total };
  switch (page.type) {
    case "cover":
      return (
        <CoverPage
          collection={collection}
          meetingDate={meetingDate}
          generatedAt={generatedAt}
          coverText={coverText}
          issued={issued}
        />
      );
    case "summary":
      return <SummaryPage {...common} projects={projects} />;
    case "milestones":
      return <MilestonesPage {...common} projects={projects} />;
    case "exceptions":
      return <ExceptionsPage {...common} projects={projects} />;
    case "benefits":
      return <BenefitsPage {...common} section={benefits} />;
    case "decisions":
      return <DecisionsPage {...common} section={decisions} />;
    default:
      return page.project ? <HighlightPage {...common} project={page.project} /> : null;
  }
}

/**
 * While the pack is open, printing (Export to PDF or the browser's own print) uses the light
 * theme and names the PDF after the pack; both are put back afterwards.
 */
function usePrintSetup(title: string) {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    let previousTitle = document.title;
    const before = () => {
      wasDark = root.classList.contains("dark");
      root.classList.remove("dark");
      previousTitle = document.title;
      document.title = title;
    };
    const after = () => {
      if (wasDark) root.classList.add("dark");
      document.title = previousTitle;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [title]);
}

const generatedNow = () =>
  `${fromIsoDate(todayIso())} at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
const issuedOn = (iso: string) =>
  `${formatDate(iso.slice(0, 10))} at ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

/**
 * The pack preview. A draft (no `issued`) is built from live data and can be issued; an issued
 * pack shows its stored snapshot, read-only. Both export to PDF through the browser's print.
 */
export function CommitteePack({
  collection,
  projects,
  benefits,
  decisions,
  issued,
  onClose,
  onIssued,
}: {
  collection: PackCollection;
  projects: Project[];
  benefits: Section<PackBenefitsSection>;
  decisions: Section<PackDecisionsSection>;
  issued?: { meetingDate: string; issuedAt: string | null; sections: string[]; coverText: string };
  onClose: () => void;
  onIssued?: () => void;
}) {
  const [pageIndex, setPageIndex] = useState(0),
    [meetingDate, setMeetingDate] = useState(() =>
      fromIsoDate(issued ? issued.meetingDate : todayIso()),
    );
  const [generatedAt] = useState(() =>
    issued ? (issued.issuedAt ? issuedOn(issued.issuedAt) : "—") : generatedNow(),
  );
  const settings = getSettings();
  const coverText = issued ? issued.coverText : settings.templates.committeePack.coverText;
  const pages = useMemo<PackPage[]>(
    () =>
      issued
        ? issuedPackPages(issued.sections, projects)
        : packPages(settings.templates.committeePack.sectionOrder, projects),
    [projects, issued, settings.templates.committeePack.sectionOrder],
  );
  usePrintSetup(`${collection.name} pack – ${meetingDate}`);
  // Issuing stores the pack as built; it can't be changed afterwards, so it takes a confirm. PMO only.
  const role = useWorkspaceRole(collection.workspaceId),
    canIssue = !issued && (role === "pmo" || role === "admin");
  const issue = useIssueCommitteePack(),
    [confirming, setConfirming] = useState(false);
  const meetingIso = toIsoDate(meetingDate);
  // Every page is stored, so the pack can't be issued until the live sections have loaded.
  const sectionsReady = typeof benefits !== "string" && typeof decisions !== "string";
  const issuePack = () => {
    if (!meetingIso || typeof benefits === "string" || typeof decisions === "string") return;
    const content: CommitteePackContent = {
      version: 2,
      collection: { id: collection.id, name: collection.name },
      sections: pages.map((item) => item.label),
      pageCount: pages.length,
      coverText,
      projects,
      benefits,
      decisions,
    };
    issue.mutate(
      {
        collectionId: collection.id,
        title: `${collection.name} pack`,
        meetingDate: meetingIso,
        content,
      },
      { onSuccess: () => onIssued?.() },
    );
  };
  const page = pages[pageIndex];
  if (!page) return null;
  const body = (item: PackPage, index: number) => (
    <PackPageBody
      page={item}
      index={index}
      total={pages.length}
      collection={collection}
      projects={projects}
      meetingDate={meetingDate}
      generatedAt={generatedAt}
      coverText={coverText}
      issued={Boolean(issued)}
      benefits={benefits}
      decisions={decisions}
    />
  );
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Committee pack preview"
    >
      <header className="flex min-h-16 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-5">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close pack preview">
          <X className="size-4" />
        </Button>
        <div className="mr-auto">
          <p className="font-semibold">{collection.name} pack</p>
          <p className="text-xs text-muted-foreground">
            {issued ? "Issued · read-only" : "Preview"} · {pages.length} pages
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          aria-label="Export to PDF"
        >
          <FileDown className="size-4" />
          <span className="hidden sm:inline">Export to PDF</span>
        </Button>
        {canIssue &&
          (confirming ? (
            <>
              <span className="text-xs text-muted-foreground">Issued packs can't be changed.</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={issue.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={issuePack}
                disabled={!meetingIso || !sectionsReady || issue.isPending}
              >
                <Save className="size-4" />
                {issue.isPending ? "Issuing…" : "Confirm and issue"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                issue.reset();
                setConfirming(true);
              }}
              disabled={!meetingIso || !sectionsReady}
              title={
                !meetingIso
                  ? "Enter the meeting date as DD/MM/YYYY"
                  : !sectionsReady
                    ? "Waiting for benefits and decisions to load"
                    : undefined
              }
            >
              <Save className="size-4" />
              Issue pack
            </Button>
          ))}
      </header>
      {issue.isError && (
        <p
          role="alert"
          className="border-b border-health-bad/40 bg-health-bad/10 px-5 py-2 text-sm"
        >
          {errorMessage(issue.error)}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3 lg:block">
          <p className="mb-3 px-2 text-xs font-semibold uppercase text-muted-foreground">Pages</p>
          <div className="space-y-1">
            {pages.map((item, index) => (
              <Button
                key={item.id}
                variant="ghost"
                onClick={() => setPageIndex(index)}
                className={cn(
                  "h-auto w-full justify-start gap-3 px-2 py-2 text-left",
                  index === pageIndex && "bg-accent text-accent-foreground",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded border border-border bg-card text-xs">
                  {index + 1}
                </span>
                <span className="line-clamp-2 text-xs">{item.label}</span>
              </Button>
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto bg-muted/40 p-3 sm:p-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-3 flex items-center gap-2 lg:hidden">
              <span className="text-xs text-muted-foreground">
                Page {pageIndex + 1} of {pages.length}
              </span>
              <select
                value={pageIndex}
                onChange={(event) => setPageIndex(Number(event.target.value))}
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
              >
                {pages.map((item, index) => (
                  <option key={item.id} value={index}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-hidden rounded-md border border-border bg-card shadow-lg">
              {body(page, pageIndex)}
            </div>
          </div>
        </main>
      </div>
      <footer className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <label htmlFor="meeting-date" className="text-xs font-medium">
            Meeting date
          </label>
          <Input
            id="meeting-date"
            value={meetingDate}
            onChange={(event) => setMeetingDate(event.target.value)}
            readOnly={Boolean(issued)}
            inputMode="numeric"
            className="h-8 w-32 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pageIndex === 0}
            onClick={() => setPageIndex((index) => index - 1)}
          >
            <ArrowLeft className="size-4" />
            Previous
          </Button>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {pageIndex + 1} / {pages.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pageIndex === pages.length - 1}
            onClick={() => setPageIndex((index) => index + 1)}
          >
            Next
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </footer>
      {/* Every page, one per A4 sheet; shown only when printing (styles.css). */}
      {createPortal(
        <div className="pack-print-root" aria-hidden="true">
          {pages.map((item, index) => (
            <section key={item.id} className="pack-print-page">
              {body(item, index)}
            </section>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

const sectionNote = (query: { error: Error | null }, what: string) =>
  query.error ? `The ${what} could not be loaded: ${query.error.message}` : `Loading ${what}…`;

function PackMessage({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-6">
      <div className="max-w-md rounded-lg border bg-background p-6 text-sm shadow-xl">
        {children}
        {onClose && (
          <Button className="mt-4" variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}

/** Loads the collection's project facts, benefits and decisions, then shows the draft pack. */
export function CollectionCommitteePack({
  collection,
  onClose,
  onIssued,
}: {
  collection: Collection;
  onClose: () => void;
  onIssued: () => void;
}) {
  const query = usePackProjects(collection.projectIds);
  const benefitsQuery = useBenefits(),
    governanceQuery = useGovernance();
  const projects = query.data;
  const benefits = useMemo(
    () =>
      benefitsQuery.data && projects
        ? buildBenefitsSection(
            benefitsQuery.data,
            projects.map((project) => project.id),
          )
        : sectionNote(benefitsQuery, "benefits"),
    [benefitsQuery, projects],
  );
  const decisions = useMemo(
    () =>
      governanceQuery.data && projects
        ? buildDecisionsSection(
            governanceQuery.data.decisions,
            projects.map((project) => project.code),
          )
        : sectionNote(governanceQuery, "decisions"),
    [governanceQuery, projects],
  );
  if (query.isError)
    return (
      <PackMessage onClose={onClose}>
        <p className="font-semibold">The pack could not be built.</p>
        <p className="mt-1 text-muted-foreground">{query.error.message}</p>
      </PackMessage>
    );
  if (!projects)
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-overlay">
        <p className="rounded-md bg-background px-4 py-3 text-sm shadow">Building the pack…</p>
      </div>
    );
  return (
    <CommitteePack
      collection={collection}
      projects={projects}
      benefits={benefits}
      decisions={decisions}
      onClose={onClose}
      onIssued={onIssued}
    />
  );
}

const NOT_STORED = "Not stored when this pack was issued.";

/** An issued pack from its stored snapshot, read-only, for viewing and PDF export. */
export function IssuedCommitteePack({ packId, onClose }: { packId: string; onClose: () => void }) {
  const query = useCommitteePack(packId);
  if (query.isError)
    return (
      <PackMessage onClose={onClose}>
        <p className="font-semibold">The pack could not be opened.</p>
        <p className="mt-1 text-muted-foreground">{query.error.message}</p>
      </PackMessage>
    );
  if (!query.data)
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-overlay">
        <p className="rounded-md bg-background px-4 py-3 text-sm shadow">Opening the pack…</p>
      </div>
    );
  const { content } = query.data;
  return (
    <CommitteePack
      collection={content.collection}
      projects={content.projects as Project[]}
      benefits={content.benefits ?? NOT_STORED}
      decisions={content.decisions ?? NOT_STORED}
      issued={{
        meetingDate: query.data.meetingDate,
        issuedAt: query.data.issuedAt,
        sections: content.sections,
        coverText: content.coverText,
      }}
      onClose={onClose}
    />
  );
}
