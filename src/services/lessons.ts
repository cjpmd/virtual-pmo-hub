// Lessons learned, improvement actions and phase lessons reviews (Prompt I3), on Supabase.
//
// One load for the whole organisation: lessons embed their project-type tags and improvement
// actions, reviews embed their attendees (each a single FK, named to keep PostgREST's choice
// explicit). Lookups (lesson categories, project types), phases, projects and people are read
// in parallel. Everything below the loader is pure, so every screen counts the same way.
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, toIsoDate } from "@/lib/format";
import { daysFromToday, todayIso } from "@/lib/today";
import { listPeople, listPhases, type Person, type Phase } from "./hierarchy";
import { projectStateLabel, type ProjectStateLabel } from "./labels";
import { unwrap } from "./service-error";
import { insertRow, insertRows, updateRow } from "./write";

type Enums = Database["public"]["Enums"];
const invert = <K extends string, V extends string>(map: Record<K, V>) =>
  Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<V, K>;

export type LessonType = "Success" | "Problem";
export type LessonApplicability = "This project only" | "Similar projects" | "All projects";
export type LessonStatus = "Identified" | "Action agreed" | "Embedded" | "Closed";
export type ActionStatus = "Open" | "In progress" | "Done";

export const lessonTypeLabel: Record<Enums["lesson_type"], LessonType> = {
  success: "Success",
  problem: "Problem",
};
export const lessonTypeValue = invert(lessonTypeLabel);
export const applicabilityLabel: Record<Enums["lesson_applicability"], LessonApplicability> = {
  this_project: "This project only",
  similar_projects: "Similar projects",
  all_projects: "All projects",
};
export const applicabilityValue = invert(applicabilityLabel);
export const lessonStatusLabel: Record<Enums["lesson_status"], LessonStatus> = {
  identified: "Identified",
  action_agreed: "Action agreed",
  embedded: "Embedded",
  closed: "Closed",
};
export const lessonStatusValue = invert(lessonStatusLabel);
export const actionStatusLabel: Record<Enums["action_status"], ActionStatus> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};
export const actionStatusValue = invert(actionStatusLabel);

export const lessonTypes: LessonType[] = ["Success", "Problem"];
export const lessonApplicabilities = Object.values(applicabilityLabel);
export const lessonStatuses = Object.values(lessonStatusLabel);
export const actionStatuses = Object.values(actionStatusLabel);

export interface ImprovementActionView {
  id: string;
  reference: string;
  lessonId: string;
  projectId: string;
  description: string;
  ownerId: string | null;
  owner: string;
  dueDate: string | null;
  status: ActionStatus;
  embeddedIn: string | null;
  updatedAt: string;
}

export interface LessonView {
  id: string;
  reference: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  phaseId: string | null;
  phaseName: string;
  phaseIndex: number | null;
  sprint: string | null;
  type: LessonType;
  categoryId: string;
  category: string;
  summary: string;
  whatHappened: string;
  impact: string;
  rootCause: string;
  recommendation: string;
  applicability: LessonApplicability;
  projectTypeTags: string[];
  raisedById: string | null;
  raisedBy: string;
  date: string;
  status: LessonStatus;
  actions: ImprovementActionView[];
  updatedAt: string;
}

export interface PhaseReviewView {
  id: string;
  projectId: string;
  phaseId: string;
  date: string;
  facilitator: string;
  attendees: string[];
}

export interface LessonProject {
  id: string;
  code: string;
  name: string;
  state: ProjectStateLabel;
  phaseIndex: number;
  phaseName: string;
}

export interface Choice {
  id: string;
  label: string;
}

export interface LessonsData {
  lessons: LessonView[];
  actions: Array<ImprovementActionView & { lesson: LessonView | undefined }>;
  reviews: PhaseReviewView[];
  phases: Phase[];
  /** Active lesson categories, in list order (for pickers). */
  categories: Choice[];
  projectTypes: Choice[];
  projects: LessonProject[];
  people: Person[];
}

export async function loadLessons(orgId: string): Promise<LessonsData> {
  const [lessons, reviews, lookups, projects, phases, people] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        `id, ref, project_id, phase_id, sprint_name, type, category_id, summary, what_happened,
         impact, root_cause, recommendation, applicability, raised_by_id, raised_date, status,
         updated_at,
         lesson_project_types!lesson_project_types_lesson_id_workspace_id_fkey(project_type_id),
         improvement_actions!improvement_actions_lesson_id_workspace_id_fkey(id, ref, lesson_id,
           project_id, description, owner_id, due_date, status, embedded_in, updated_at)`,
      )
      .eq("organisation_id", orgId)
      .order("ref"),
    supabase
      .from("phase_lessons_reviews")
      .select(
        `id, project_id, phase_id, review_date, facilitator_id,
         phase_lessons_review_attendees!phase_lessons_review_attendees_review_id_workspace_id_fkey(resource_id)`,
      )
      .eq("organisation_id", orgId)
      .order("review_date"),
    supabase
      .from("lookup_values")
      .select("id, list_key, label, sort_order, is_active")
      .eq("organisation_id", orgId)
      .in("list_key", ["lesson_category", "project_type"])
      .order("sort_order"),
    supabase
      .from("v_projects")
      .select("id, code, name, state, phase_index, phase_id")
      .eq("organisation_id", orgId)
      .order("name"),
    listPhases(orgId),
    listPeople(orgId),
  ]);
  const names = new Map(people.map((person) => [person.id, person.name]));
  const nameOf = (id: string | null) => (id && names.get(id)) || "Unassigned";
  const lookupRows = unwrap(lookups, "Loading lesson lists");
  const label = new Map(lookupRows.map((row) => [row.id, row.label]));
  const choices = (listKey: string) =>
    lookupRows
      .filter((row) => row.list_key === listKey && row.is_active)
      .map((row) => ({ id: row.id, label: row.label }));
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const projectRows: LessonProject[] = unwrap(projects, "Loading projects").map((row) => ({
    id: row.id ?? "",
    code: row.code ?? "",
    name: row.name ?? "",
    state: projectStateLabel[row.state ?? "proposed"],
    phaseIndex: row.phase_index ?? 0,
    phaseName: (row.phase_id && phaseById.get(row.phase_id)?.name) || "Not set",
  }));
  const projectById = new Map(projectRows.map((project) => [project.id, project]));

  const lessonRows = unwrap(lessons, "Loading lessons").map((row): LessonView => {
    const phase = row.phase_id ? phaseById.get(row.phase_id) : undefined;
    const project = projectById.get(row.project_id);
    return {
      id: row.id,
      reference: row.ref,
      projectId: row.project_id,
      projectCode: project?.code ?? "",
      projectName: project?.name ?? "Unknown project",
      phaseId: row.phase_id,
      phaseName: phase?.shortName ?? "No phase",
      phaseIndex: phase?.index ?? null,
      sprint: row.sprint_name,
      type: lessonTypeLabel[row.type],
      categoryId: row.category_id,
      category: label.get(row.category_id) ?? "Uncategorised",
      summary: row.summary,
      whatHappened: row.what_happened ?? "",
      impact: row.impact ?? "",
      rootCause: row.root_cause ?? "",
      recommendation: row.recommendation ?? "",
      applicability: applicabilityLabel[row.applicability],
      projectTypeTags: (row.lesson_project_types ?? []).map(
        (tag) => label.get(tag.project_type_id) ?? "",
      ),
      raisedById: row.raised_by_id,
      raisedBy: nameOf(row.raised_by_id),
      date: row.raised_date,
      status: lessonStatusLabel[row.status],
      actions: (row.improvement_actions ?? [])
        .map((action) => ({
          id: action.id,
          reference: action.ref,
          lessonId: action.lesson_id,
          projectId: action.project_id,
          description: action.description,
          ownerId: action.owner_id,
          owner: nameOf(action.owner_id),
          dueDate: action.due_date,
          status: actionStatusLabel[action.status],
          embeddedIn: action.embedded_in,
          updatedAt: action.updated_at,
        }))
        .sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true })),
      updatedAt: row.updated_at,
    };
  });
  return {
    lessons: lessonRows,
    actions: lessonRows
      .flatMap((lesson) => lesson.actions.map((action) => ({ ...action, lesson })))
      .sort((a, b) => a.reference.localeCompare(b.reference, undefined, { numeric: true })),
    reviews: unwrap(reviews, "Loading phase lessons reviews").map((row) => ({
      id: row.id,
      projectId: row.project_id,
      phaseId: row.phase_id,
      date: row.review_date,
      facilitator: nameOf(row.facilitator_id),
      attendees: (row.phase_lessons_review_attendees ?? []).map((item) => nameOf(item.resource_id)),
    })),
    phases,
    categories: choices("lesson_category"),
    projectTypes: choices("project_type"),
    projects: projectRows,
    people,
  };
}

// ---- Pure helpers ---------------------------------------------------------------------

export const getProjectLessons = (data: LessonsData, projectId: string) =>
  data.lessons.filter((lesson) => lesson.projectId === projectId);
export const getPhaseLessonsReviews = (data: LessonsData, projectId?: string) =>
  data.reviews.filter((review) => !projectId || review.projectId === projectId);
export const hasPhaseLessonsReview = (data: LessonsData, projectId: string, phaseId: string) =>
  data.reviews.some((review) => review.projectId === projectId && review.phaseId === phaseId);

export function getLessonMetrics(data: LessonsData, items = data.lessons) {
  const lessonIds = new Set(items.map((item) => item.id));
  const recent = new Set(
    items
      .filter((item) => (daysFromToday(item.date) ?? -Infinity) >= -90)
      .map((item) => item.projectId),
  );
  return {
    total: items.length,
    problems: items.filter((item) => item.type === "Problem").length,
    successes: items.filter((item) => item.type === "Success").length,
    openActions: data.actions.filter(
      (action) => lessonIds.has(action.lessonId) && action.status !== "Done",
    ).length,
    embedded: items.filter((item) => item.status === "Embedded").length,
    projectsWithLessons: new Set(items.map((item) => item.projectId)).size,
    staleProjects: data.projects.filter(
      (project) => project.state === "Active" && !recent.has(project.id),
    ).length,
  };
}

export function groupLessons(items: LessonView[], key: "category" | "phaseName" | "projectName") {
  const map = new Map<
    string,
    { name: string; problems: number; successes: number; total: number }
  >();
  for (const lesson of items) {
    const name = String(lesson[key]);
    const current = map.get(name) ?? { name, problems: 0, successes: 0, total: 0 };
    current.total += 1;
    if (lesson.type === "Problem") current.problems += 1;
    else current.successes += 1;
    map.set(name, current);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export interface RecurringTheme {
  category: string;
  projectCount: number;
  lessons: LessonView[];
  projects: string[];
  /** An improvement action not yet done exists against one of the theme's lessons. */
  actionRaised: boolean;
}
/** Categories where Problem lessons appear in three or more projects (Prompt I3). */
export function getRecurringThemes(items: LessonView[]): RecurringTheme[] {
  const map = new Map<string, LessonView[]>();
  for (const lesson of items.filter((item) => item.type === "Problem"))
    map.set(lesson.category, [...(map.get(lesson.category) ?? []), lesson]);
  return Array.from(map.entries())
    .map(([category, group]) => ({
      category,
      lessons: group,
      projects: Array.from(new Set(group.map((item) => item.projectName))),
      projectCount: new Set(group.map((item) => item.projectId)).size,
      actionRaised: group.some((lesson) =>
        lesson.actions.some((action) => action.status !== "Done"),
      ),
    }))
    .filter((theme) => theme.projectCount >= 3)
    .sort((a, b) => b.projectCount - a.projectCount || b.lessons.length - a.lessons.length);
}

export interface CoverageRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  stage: string;
  lastReviewDate: string | undefined;
  lessonCount: number;
  gatesPassed: number;
  reviewsHeld: number;
  overdue: boolean;
}
/** Projects past proposal and their last lessons review, flagged where a gate passed without one. */
export function getLessonCoverage(data: LessonsData): CoverageRow[] {
  return data.projects
    .filter((project) => project.state !== "Proposed")
    .map((project) => {
      const reviews = getPhaseLessonsReviews(data, project.id);
      const last = reviews
        .map((review) => review.date)
        .sort()
        .at(-1);
      const gatesPassed = project.phaseIndex;
      return {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        stage: project.phaseName,
        lastReviewDate: last,
        lessonCount: data.lessons.filter((item) => item.projectId === project.id).length,
        gatesPassed,
        reviewsHeld: reviews.length,
        overdue: reviews.length < gatesPassed,
      };
    })
    .sort(
      (a, b) => Number(b.overdue) - Number(a.overdue) || a.projectName.localeCompare(b.projectName),
    );
}

/** Lessons matched to a new project or request by category, project type and phase (Prompt I3). */
export function getRelevantLessons(
  data: LessonsData,
  options: {
    projectTypeTags?: string[];
    categories?: string[];
    phaseIndex?: number;
    excludeProjectId?: string;
  },
) {
  const items = data.lessons.filter(
    (lesson) =>
      lesson.projectId !== options.excludeProjectId && lesson.applicability !== "This project only",
  );
  const scored = items
    .map((lesson) => {
      let score = 0;
      if (options.projectTypeTags?.some((tag) => lesson.projectTypeTags.includes(tag))) score += 3;
      if (options.categories?.includes(lesson.category)) score += 2;
      if (options.phaseIndex !== undefined && lesson.phaseIndex === options.phaseIndex) score += 1;
      if (lesson.applicability === "All projects") score += 1;
      if (lesson.status === "Embedded") score += 1;
      return { lesson, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  const matched = scored.map((entry) => entry.lesson);
  return { matched, themes: getRecurringThemes(matched) };
}

// ---- Writes -----------------------------------------------------------------------------

export interface LessonInput {
  type?: LessonType;
  categoryId?: string;
  applicability?: LessonApplicability;
  status?: LessonStatus;
  summary?: string;
}

export async function updateLesson(id: string, input: LessonInput, lastSeen?: string | null) {
  return updateRow(
    "lessons",
    id,
    {
      ...(input.type && { type: lessonTypeValue[input.type] }),
      ...(input.categoryId && { category_id: input.categoryId }),
      ...(input.applicability && { applicability: applicabilityValue[input.applicability] }),
      ...(input.status && { status: lessonStatusValue[input.status] }),
      ...(input.summary !== undefined && { summary: input.summary.trim() }),
    },
    { context: "Saving the lesson", lastSeen },
  );
}

export interface ReviewLessonInput {
  type: LessonType;
  categoryId: string;
  summary: string;
  whatHappened: string;
  impact: string;
  rootCause: string;
  recommendation: string;
}

/**
 * Record a phase lessons review and the lessons it produced. The review row is what the gate
 * checklist looks for; one review per project, phase and day (a second run the same day adds
 * lessons to the first).
 */
export async function recordPhaseReview(input: {
  projectId: string;
  phaseId: string;
  facilitatorId: string | null;
  sprint: string | null;
  lessons: ReviewLessonInput[];
  existingReviewId?: string | undefined;
}) {
  const date = todayIso();
  if (!input.existingReviewId)
    await insertRow(
      "phase_lessons_reviews",
      {
        project_id: input.projectId,
        phase_id: input.phaseId,
        review_date: date,
        facilitator_id: input.facilitatorId,
      },
      "Recording the phase lessons review",
    );
  await insertRows(
    "lessons",
    input.lessons.map((lesson) => ({
      project_id: input.projectId,
      phase_id: input.phaseId,
      sprint_name: input.sprint,
      type: lessonTypeValue[lesson.type],
      category_id: lesson.categoryId,
      summary: lesson.summary,
      what_happened: lesson.whatHappened,
      impact: lesson.impact,
      root_cause: lesson.rootCause,
      recommendation: lesson.recommendation,
      applicability: "similar_projects" as const,
      raised_by_id: input.facilitatorId,
      raised_date: date,
    })),
    "Saving the review's lessons",
  );
}

export interface ActionInput {
  dueDate?: string;
  status?: ActionStatus;
  description?: string;
}

export async function updateImprovementAction(
  id: string,
  input: ActionInput,
  lastSeen?: string | null,
) {
  return updateRow(
    "improvement_actions",
    id,
    {
      ...(input.dueDate && { due_date: input.dueDate }),
      ...(input.status && { status: actionStatusValue[input.status] }),
      ...(input.description !== undefined && { description: input.description.trim() }),
    },
    { context: "Saving the improvement action", lastSeen },
  );
}

/** Raise an improvement action against a lesson (the latest lesson of a recurring theme). */
export async function createImprovementAction(input: {
  lesson: LessonView;
  description: string;
  ownerId: string | null;
  dueDate: string;
}) {
  return insertRow(
    "improvement_actions",
    {
      lesson_id: input.lesson.id,
      project_id: input.lesson.projectId,
      description: input.description,
      owner_id: input.ownerId,
      due_date: input.dueDate,
    },
    "Raising the improvement action",
  );
}

// ---- CSV import and export (Prompt I3) ----------------------------------------------------

export const lessonCsvColumns = [
  "Reference",
  "Project",
  "Phase",
  "Sprint",
  "Type",
  "Category",
  "Summary",
  "What happened",
  "Impact",
  "Root cause",
  "Recommendation",
  "Applicability",
  "Project type tags",
  "Raised by",
  "Date",
  "Status",
] as const;
const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
export function lessonsToCsv(data: LessonsData, items = data.lessons) {
  const phaseName = new Map(data.phases.map((phase) => [phase.id, phase.name]));
  const rows = items.map((lesson) => [
    lesson.reference,
    lesson.projectName,
    (lesson.phaseId && phaseName.get(lesson.phaseId)) || "",
    lesson.sprint ?? "",
    lesson.type,
    lesson.category,
    lesson.summary,
    lesson.whatHappened,
    lesson.impact,
    lesson.rootCause,
    lesson.recommendation,
    lesson.applicability,
    lesson.projectTypeTags.join("; "),
    lesson.raisedBy,
    formatDate(lesson.date),
    lesson.status,
  ]);
  return [
    lessonCsvColumns.join(","),
    ...rows.map((row) => row.map((cell) => escape(String(cell))).join(",")),
  ].join("\n");
}

/** Minimal CSV reader that copes with quoted cells, as exported from a SharePoint list. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim().length));
}

/** SharePoint multi-choice columns arrive as ["Project Management"] or Project Management;#Testing. */
export function normaliseChoice(value: string) {
  const cleaned = value
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/^"|"$/g, "");
  return cleaned
    .split(/;#|;|\|/)
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}
const matchChoice = (choices: Choice[], value: string) => {
  const cleaned = value.trim().toLowerCase();
  return cleaned ? choices.find((choice) => choice.label.toLowerCase() === cleaned) : undefined;
};
export function matchCategory(data: LessonsData, value: string) {
  const [first] = normaliseChoice(value);
  return first ? matchChoice(data.categories, first) : undefined;
}
export function matchPhase(data: LessonsData, value: string) {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return undefined;
  return data.phases.find(
    (phase) =>
      phase.name.toLowerCase() === cleaned ||
      phase.shortName.toLowerCase() === cleaned ||
      phase.name.toLowerCase().includes(cleaned),
  );
}
export function matchProject(data: LessonsData, value: string) {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return undefined;
  return data.projects.find(
    (project) => project.name.toLowerCase() === cleaned || project.code.toLowerCase() === cleaned,
  );
}

export interface ImportRow {
  summary: string;
  project: string;
  phase: string;
  sprint: string;
  type: string;
  category: string;
  whatHappened: string;
  impact: string;
  rootCause: string;
  recommendation: string;
  applicability: string;
  tags: string;
  raisedBy: string;
  date: string;
  status: string;
}

export interface ResolvedImportRow {
  row: ImportRow;
  project: LessonProject | undefined;
  phase: Phase | undefined;
  category: Choice | undefined;
  type: LessonType | undefined;
  /** Why the row can't be imported (missing summary, project, category or type). */
  problems: string[];
}

export function resolveImportRow(data: LessonsData, row: ImportRow): ResolvedImportRow {
  const project = matchProject(data, row.project);
  const category = matchCategory(data, row.category);
  const type = lessonTypes.find((item) => item.toLowerCase() === row.type.trim().toLowerCase());
  const problems = [
    ...(row.summary.trim() ? [] : ["summary missing"]),
    ...(project ? [] : [`project "${row.project || "—"}" not found`]),
    ...(category ? [] : [`category "${row.category || "—"}" not in the list`]),
    ...(type ? [] : [`type "${row.type || "—"}" is not Success or Problem`]),
  ];
  return { row, project, phase: matchPhase(data, row.phase), category, type, problems };
}

/** Insert the importable rows. Returns how many were written. */
export async function importLessons(data: LessonsData, rows: ResolvedImportRow[]) {
  const people = new Map(data.people.map((person) => [person.name.toLowerCase(), person.id]));
  const ready = rows.filter((item) => !item.problems.length);
  const written = await insertRows(
    "lessons",
    ready.map(({ row, project, phase, category, type }) => {
      const applicability = lessonApplicabilities.find(
        (item) => item.toLowerCase() === row.applicability.trim().toLowerCase(),
      );
      const status = lessonStatuses.find(
        (item) => item.toLowerCase() === row.status.trim().toLowerCase(),
      );
      return {
        project_id: project?.id ?? "",
        phase_id: phase?.id ?? null,
        sprint_name: row.sprint.trim() || null,
        type: lessonTypeValue[type ?? "Problem"],
        category_id: category?.id ?? "",
        summary: row.summary.trim(),
        what_happened: row.whatHappened || null,
        impact: row.impact || null,
        root_cause: row.rootCause || null,
        recommendation: row.recommendation || null,
        applicability: applicabilityValue[applicability ?? "Similar projects"],
        status: lessonStatusValue[status ?? "Identified"],
        raised_by_id: people.get(row.raisedBy.trim().toLowerCase()) ?? null,
        raised_date: toIsoDate(row.date.trim()) ?? todayIso(),
      };
    }),
    "Importing lessons",
  );
  const tags = ready.flatMap((item, index) =>
    Array.from(
      new Set(
        normaliseChoice(item.row.tags)
          .map((tag) => matchChoice(data.projectTypes, tag))
          .filter((tag): tag is Choice => Boolean(tag)),
      ),
    ).map((tag) => ({
      lesson_id: written[index]?.id ?? "",
      project_id: item.project?.id ?? "",
      project_type_id: tag.id,
    })),
  );
  await insertRows("lesson_project_types", tags, "Tagging imported lessons");
  return written.length;
}
