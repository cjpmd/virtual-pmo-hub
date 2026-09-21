import { improvementActions, lessonCategories, lessons, phaseLessonsReviews } from "@/data/lessons-data";
import type { ImprovementAction, Lesson, LessonCategory, LessonType } from "@/data/types";
import { getLifecyclePhases, getPhaseIndex, getProject, getProjects } from "@/services/pmo";
import { formatDate } from "@/lib/format";

const parseDate = (value: string) => { const [d = 1, m = 1, y = 1970] = value.split("/").map(Number); return new Date(y, m - 1, d); };
const today = parseDate("21/09/2026");
const daysAgo = (value: string) => Math.round((today.getTime() - parseDate(value).getTime()) / 86400000);

export const getLessonCategories = () => lessonCategories;
export const getPhaseName = (phaseId: string) => getLifecyclePhases().find(phase => phase.id === phaseId)?.shortName ?? phaseId;
export const getPhaseFullName = (phaseId: string) => getLifecyclePhases().find(phase => phase.id === phaseId)?.name ?? phaseId;

export interface ResolvedLesson extends Lesson { projectName: string; phaseName: string; actions: ImprovementAction[] }
export function getLessons(): ResolvedLesson[] {
  return lessons.map(lesson => ({
    ...lesson,
    projectName: getProject(lesson.projectId)?.name ?? lesson.projectId,
    phaseName: getPhaseName(lesson.phaseId),
    actions: improvementActions.filter(action => action.lessonId === lesson.id),
  }));
}
export const getProjectLessons = (projectId: string) => getLessons().filter(lesson => lesson.projectId === projectId);
export const getImprovementActions = () => improvementActions.map(action => ({ ...action, lesson: lessons.find(item => item.id === action.lessonId) }));
export const getPhaseLessonsReviews = (projectId?: string) => phaseLessonsReviews.filter(review => !projectId || review.projectId === projectId);
export const hasPhaseLessonsReview = (projectId: string, phaseId: string) => phaseLessonsReviews.some(review => review.projectId === projectId && review.phaseId === phaseId);

export function getLessonMetrics(items = getLessons()) {
  const projectsWithLessons = new Set(items.map(item => item.projectId));
  const recent = new Set(items.filter(item => daysAgo(item.date) <= 90).map(item => item.projectId));
  const activeProjects = getProjects().filter(project => project.state === "Active");
  return {
    total: items.length,
    problems: items.filter(item => item.type === "Problem").length,
    successes: items.filter(item => item.type === "Success").length,
    openActions: improvementActions.filter(action => action.status !== "Done").length,
    embedded: items.filter(item => item.status === "Embedded").length,
    projectsWithLessons: projectsWithLessons.size,
    staleProjects: activeProjects.filter(project => !recent.has(project.id)).length,
  };
}

export function groupLessons(items: ResolvedLesson[], key: "category" | "phaseName" | "projectName") {
  const map = new Map<string, { name: string; problems: number; successes: number; total: number }>();
  for (const lesson of items) {
    const name = String(lesson[key]);
    const current = map.get(name) ?? { name, problems: 0, successes: 0, total: 0 };
    current.total += 1;
    if (lesson.type === "Problem") current.problems += 1; else current.successes += 1;
    map.set(name, current);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export interface RecurringTheme { category: LessonCategory; projectCount: number; lessons: ResolvedLesson[]; projects: string[] }
/** Categories where Problem lessons appear in three or more projects (Prompt I3). */
export function getRecurringThemes(items = getLessons()): RecurringTheme[] {
  const map = new Map<LessonCategory, ResolvedLesson[]>();
  for (const lesson of items.filter(item => item.type === "Problem")) map.set(lesson.category, [...(map.get(lesson.category) ?? []), lesson]);
  return Array.from(map.entries())
    .map(([category, group]) => ({ category, lessons: group, projects: Array.from(new Set(group.map(item => item.projectName))), projectCount: new Set(group.map(item => item.projectId)).size }))
    .filter(theme => theme.projectCount >= 3)
    .sort((a, b) => b.projectCount - a.projectCount || b.lessons.length - a.lessons.length);
}

export interface CoverageRow { projectId: string; projectName: string; stage: string; lastReviewDate: string | undefined; lessonCount: number; gatesPassed: number; reviewsHeld: number; overdue: boolean }
/** Active projects and their last lessons review, flagged red where a gate passed without one. */
export function getLessonCoverage(): CoverageRow[] {
  return getProjects().filter(project => project.state !== "Proposed").map(project => {
    const reviews = getPhaseLessonsReviews(project.id);
    const last = [...reviews].sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime())[0];
    const gatesPassed = getPhaseIndex(project.stage);
    return {
      projectId: project.id,
      projectName: project.name,
      stage: project.stage,
      ...(last ? { lastReviewDate: last.date } : { lastReviewDate: undefined }),
      lessonCount: lessons.filter(item => item.projectId === project.id).length,
      gatesPassed,
      reviewsHeld: reviews.length,
      overdue: reviews.length < gatesPassed,
    };
  }).sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.projectName.localeCompare(b.projectName));
}

/** Lessons matched to a new project or request by category, project type and phase (Prompt I3). */
export function getRelevantLessons(options: { projectTypeTags?: string[]; categories?: LessonCategory[]; phaseId?: string; excludeProjectId?: string }) {
  const items = getLessons().filter(lesson => lesson.projectId !== options.excludeProjectId && lesson.applicability !== "This project only");
  const scored = items.map(lesson => {
    let score = 0;
    if (options.projectTypeTags?.some(tag => lesson.projectTypeTags.includes(tag))) score += 3;
    if (options.categories?.includes(lesson.category)) score += 2;
    if (options.phaseId && lesson.phaseId === options.phaseId) score += 1;
    if (lesson.applicability === "All projects") score += 1;
    if (lesson.status === "Embedded") score += 1;
    return { lesson, score };
  }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score);
  const matched = scored.map(entry => entry.lesson);
  return { matched, themes: getRecurringThemes(matched) };
}

export const lessonTypes: LessonType[] = ["Success", "Problem"];

// ---- CSV import and export (Prompt I3) ----
export const lessonCsvColumns = ["Reference", "Project", "Phase", "Sprint", "Type", "Category", "Summary", "What happened", "Impact", "Root cause", "Recommendation", "Applicability", "Project type tags", "Raised by", "Date", "Status"] as const;
const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
export function lessonsToCsv(items: ResolvedLesson[]) {
  const rows = items.map(lesson => [lesson.reference, lesson.projectName, getPhaseFullName(lesson.phaseId), lesson.sprint ?? "", lesson.type, lesson.category, lesson.summary, lesson.whatHappened, lesson.impact, lesson.rootCause, lesson.recommendation, lesson.applicability, lesson.projectTypeTags.join("; "), lesson.raisedBy, formatDate(lesson.date), lesson.status]);
  return [lessonCsvColumns.join(","), ...rows.map(row => row.map(cell => escape(String(cell))).join(","))].join("\n");
}
/** Minimal CSV reader that copes with quoted cells, as exported from a SharePoint list. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(item => item.some(value => value.trim().length));
}
/** SharePoint multi-choice columns arrive as ["Project Management"] or Project Management;#Testing. */
export function normaliseChoice(value: string) {
  const cleaned = value.trim().replace(/^\[|\]$/g, "").replace(/^"|"$/g, "");
  return cleaned.split(/;#|;|\|/).map(item => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
}
export function matchCategory(value: string): LessonCategory | undefined {
  const [first] = normaliseChoice(value);
  if (!first) return undefined;
  return lessonCategories.find(category => category.toLowerCase() === first.toLowerCase());
}
export function matchPhase(value: string) {
  const cleaned = value.trim().toLowerCase();
  return getLifecyclePhases().find(phase => phase.name.toLowerCase() === cleaned || phase.shortName.toLowerCase() === cleaned || phase.id === cleaned || phase.name.toLowerCase().includes(cleaned))?.id;
}
