import type { BoardColumn, BoardRow, SavedView } from "@/components/board-workspace";
import { lessonCategories } from "@/data/lessons-data";
import type { ImprovementAction, Lesson } from "@/data/types";

export const lessonColumns: BoardColumn[] = [
  { key: "reference", label: "Reference", type: "text", width: 120 },
  { key: "title", label: "Summary", type: "text", summary: "count", width: 340 },
  { key: "project", label: "Project", type: "text", width: 230 },
  { key: "phase", label: "Phase", type: "status", width: 120 },
  { key: "sprint", label: "Sprint", type: "text", width: 110 },
  { key: "status", label: "Type", type: "status", editable: true, options: ["Success", "Problem"] },
  { key: "category", label: "Category", type: "status", editable: true, options: [...lessonCategories] },
  { key: "people", label: "Raised by", type: "people" },
  { key: "finish", label: "Date", type: "date" },
  { key: "applicability", label: "Applicability", type: "status", editable: true, options: ["This project only", "Similar projects", "All projects"] },
  { key: "lessonStatus", label: "Status", type: "status", editable: true, options: ["Identified", "Action agreed", "Embedded", "Closed"] },
  { key: "tags", label: "Project type", type: "tags" },
  { key: "number", label: "Actions", type: "number", summary: "sum" },
];

export const lessonsToRows = (items: Array<Lesson & { projectName: string; phaseName: string; actions: ImprovementAction[] }>): BoardRow[] => items.map(item => ({
  id: item.id,
  reference: item.reference,
  title: item.summary,
  project: item.projectName,
  phase: item.phaseName,
  sprint: item.sprint ?? "—",
  status: item.type,
  category: item.category,
  people: [item.raisedBy],
  finish: item.date,
  applicability: item.applicability,
  lessonStatus: item.status,
  tags: item.projectTypeTags,
  number: item.actions.length,
  isProblem: item.type === "Problem",
  isSuccess: item.type === "Success",
  embedded: item.status === "Embedded",
  group: item.category,
}));

const visible = lessonColumns.map(column => column.key);
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
  { key: "status", label: "Status", type: "status", editable: true, options: ["Open", "In progress", "Done"] },
  { key: "embeddedIn", label: "Embedded in", type: "text", width: 220 },
];
export const improvementActionsToRows = (items: Array<ImprovementAction & { lesson?: Lesson | undefined }>): BoardRow[] => items.map(item => ({
  id: item.id,
  reference: item.reference,
  title: item.description,
  lesson: item.lesson ? `${item.lesson.reference} · ${item.lesson.summary}` : "—",
  people: [item.owner],
  finish: item.dueDate,
  status: item.status,
  embeddedIn: item.embeddedIn ?? "—",
  group: item.status,
}));
