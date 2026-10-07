// Board rows for projects read from Supabase. Same column keys as projectColumns in
// board-data.ts, so the existing BoardWorkspace views, filters and summaries keep working.
import type { BoardRow } from "@/components/board-workspace";
import { fromIsoDate } from "@/lib/format";
import { daysFromToday } from "@/lib/today";
import type { ProjectSummary } from "@/services/hierarchy";

/** A status report is outstanding when there is none, or the latest is older than 14 days. */
export const isStatusReportOverdue = (project: ProjectSummary) =>
  project.state === "Active" &&
  (project.lastReportDate === null || (daysFromToday(project.lastReportDate) ?? 0) < -14);

/** A closed project's health is history: lists show "Closed" instead of a RAG. */
const rag = (project: ProjectSummary, health: string) =>
  project.state === "Closed" ? "Closed" : health;

/** Row id is the project code: titles link to /portfolio/projects/$projectCode. */
export const projectSummariesToRows = (projects: ProjectSummary[]): BoardRow[] =>
  projects.map((project) => ({
    id: project.code,
    title: project.name,
    programme: project.programmeName,
    people: [project.managerName],
    manager: project.managerName,
    stage: project.phaseName,
    tier: project.tier,
    projectOfficer: project.projectOfficerName ?? "Unassigned",
    state: project.state,
    // A closed project finished; its past end date is not "Overdue".
    complete: project.state === "Closed",
    priority: project.priority,
    status: rag(project, project.health.overall),
    scheduleHealth: rag(project, project.health.schedule),
    financialHealth: rag(project, project.health.financial),
    effortHealth: rag(project, project.health.effort),
    issueHealth: rag(project, project.health.issue),
    start: fromIsoDate(project.startDate),
    finish: fromIsoDate(project.finishDate),
    baselineFinish: fromIsoDate(project.baselineFinishDate),
    budget: project.budget,
    actual: project.actual,
    forecast: project.forecast,
    variance: project.forecast - project.budget,
    activeRisks: project.openRisks,
    activeIssues: project.openIssues,
    lastReport: project.lastReportDate ? fromIsoDate(project.lastReportDate) : "No report",
    statusReportOverdue: isStatusReportOverdue(project),
    timeline: "",
    group: project.programmeName,
  }));
