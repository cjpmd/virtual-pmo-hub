import type { BoardColumn, BoardRow, SavedView } from "@/components/board-workspace";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import {
  actionStatuses,
  lessonApplicabilities,
  lessonStatuses,
  lessonTypes,
  type ActionInput,
  type ActionStatus,
  type ImprovementActionView,
  type LessonApplicability,
  type LessonInput,
  type LessonStatus,
  type LessonType,
  type LessonView,
  type LessonsData,
} from "@/services/lessons";

export const lessonColumnsFor = (data: LessonsData): BoardColumn[] => [
  { key: "reference", label: "Reference", type: "text", width: 120 },
  { key: "title", label: "Summary", type: "text", summary: "count", width: 340 },
  { key: "project", label: "Project", type: "text", width: 230 },
  { key: "phase", label: "Phase", type: "status", width: 120 },
  { key: "sprint", label: "Sprint", type: "text", width: 110 },
  { key: "status", label: "Type", type: "status", editable: true, options: [...lessonTypes] },
  { key: "category", label: "Category", type: "status", editable: true, options: data.categories.map(item => item.label) },
  { key: "people", label: "Raised by", type: "people" },
  { key: "finish", label: "Date", type: "date" },
  { key: "applicability", label: "Applicability", type: "status", editable: true, options: [...lessonApplicabilities] },
  { key: "lessonStatus", label: "Status", type: "status", editable: true, options: [...lessonStatuses] },
  { key: "tags", label: "Project type", type: "tags" },
  { key: "number", label: "Actions", type: "number", summary: "sum" },
];

export const lessonsToRows = (items: LessonView[]): BoardRow[] => items.map(item => ({
  id: item.id,
  reference: item.reference,
  title: item.summary,
  project: item.projectName,
  phase: item.phaseName,
  sprint: item.sprint ?? "—",
  status: item.type,
  category: item.category,
  people: [item.raisedBy],
  finish: fromIsoDate(item.date),
  applicability: item.applicability,
  lessonStatus: item.status,
  tags: item.projectTypeTags,
  number: item.actions.length,
  isProblem: item.type === "Problem",
  isSuccess: item.type === "Success",
  embedded: item.status === "Embedded",
  group: item.category,
}));

/** Board edits → lesson fields. Category labels resolve to their lookup id. */
export function lessonInputFromBoard(data: LessonsData, patch: Partial<BoardRow>): LessonInput | undefined {
  const input: LessonInput = {};
  if (typeof patch.title === "string") { if (!patch.title.trim()) return undefined; input.summary = patch.title; }
  if (typeof patch.status === "string" && lessonTypes.includes(patch.status as LessonType)) input.type = patch.status as LessonType;
  if (typeof patch["category"] === "string") { const category = data.categories.find(item => item.label === patch["category"]); if (!category) return undefined; input.categoryId = category.id; }
  if (typeof patch["applicability"] === "string" && lessonApplicabilities.includes(patch["applicability"] as LessonApplicability)) input.applicability = patch["applicability"] as LessonApplicability;
  if (typeof patch["lessonStatus"] === "string" && lessonStatuses.includes(patch["lessonStatus"] as LessonStatus)) input.status = patch["lessonStatus"] as LessonStatus;
  return input;
}

const visible = ["reference", "title", "project", "phase", "sprint", "status", "category", "people", "finish", "applicability", "lessonStatus", "tags", "number"];
export const lessonViews: SavedView[] = [
  { id: "all", name: "All lessons", type: "table", groupBy: "", sortKey: "reference", filter: "", visible, isDefault: true },
  { id: "problems", name: "Problems", type: "table", groupBy: "group", sortKey: "reference", filter: "", filters: [{ key: "isProblem", operator: "truthy" }], visible, isDefault: false },
  { id: "successes", name: "Successes", type: "table", groupBy: "group", sortKey: "reference", filter: "", filters: [{ key: "isSuccess", operator: "truthy" }], visible, isDefault: false },
  { id: "category", name: "By category", type: "table", groupBy: "group", sortKey: "reference", filter: "", visible, isDefault: false },
  { id: "project", name: "By project", type: "table", groupBy: "project", sortKey: "reference", filter: "", visible, isDefault: false },
  { id: "embedded", name: "Embedded", type: "table", groupBy: "", sortKey: "reference", filter: "", filters: [{ key: "embedded", operator: "truthy" }], visible, isDefault: false },
];

export const improvementActionColumns: BoardColumn[] = [
  { key: "reference", label: "Reference", type: "text", width: 110 },
  { key: "title", label: "Improvement action", type: "text", summary: "count", width: 420 },
  { key: "lesson", label: "From lesson", type: "text", width: 300 },
  { key: "people", label: "Owner", type: "people" },
  { key: "finish", label: "Due", type: "date", editable: true },
  { key: "status", label: "Status", type: "status", editable: true, options: [...actionStatuses] },
  { key: "embeddedIn", label: "Embedded in", type: "text", width: 220 },
];
export const improvementActionsToRows = (items: Array<ImprovementActionView & { lesson?: LessonView | undefined }>): BoardRow[] => items.map(item => ({
  id: item.id,
  reference: item.reference,
  title: item.description,
  lesson: item.lesson ? `${item.lesson.reference} · ${item.lesson.summary}` : "—",
  people: [item.owner],
  finish: fromIsoDate(item.dueDate),
  status: item.status,
  embeddedIn: item.embeddedIn ?? "—",
  group: item.status,
}));

export function actionInputFromBoard(patch: Partial<BoardRow>): ActionInput | undefined {
  const input: ActionInput = {};
  if (patch.finish !== undefined) { const date = toIsoDate(String(patch.finish)); if (!date) return undefined; input.dueDate = date; }
  if (typeof patch.status === "string" && actionStatuses.includes(patch.status as ActionStatus)) input.status = patch.status as ActionStatus;
  if (typeof patch.title === "string") { if (!patch.title.trim()) return undefined; input.description = patch.title; }
  return input;
}
