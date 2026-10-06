import type { BoardColumn, BoardRow, SavedView } from "@/components/board-workspace";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import type {
  AssumptionInput,
  DecisionInput,
  ResolvedAssumption,
  ResolvedDecision,
} from "@/services/decisions";
import type { AssumptionStatus } from "@/data/types";

/** Forum options come from the organisation's decision_forum list. */
export const decisionColumnsFor = (forums: string[]): BoardColumn[] => [
  { key: "reference", label: "Reference", type: "text", width: 110 },
  { key: "title", label: "Decision", type: "text", summary: "count", width: 340 },
  { key: "scope", label: "Project / programme", type: "text", width: 240 },
  { key: "people", label: "Decision maker", type: "people" },
  { key: "forum", label: "Forum", type: "status", editable: true, options: forums },
  { key: "start", label: "Needed by", type: "date", editable: true },
  { key: "finish", label: "Decided", type: "date" },
  { key: "latency", label: "Latency (days)", type: "number", summary: "average" },
  // Status changes go through the decision panel (record, supersede), so the column is read-only.
  { key: "status", label: "Status", type: "status" },
  { key: "impact", label: "Impact on", type: "text", width: 180 },
  { key: "number", label: "Open actions", type: "number", summary: "sum" },
  { key: "tags", label: "Linked", type: "tags" },
];

export const decisionsToRows = (items: ResolvedDecision[]): BoardRow[] =>
  items.map((item) => ({
    id: item.id,
    reference: item.reference,
    title: item.title,
    scope: item.scopeName,
    people: [item.decisionMaker],
    forum: item.forum,
    start: fromIsoDate(item.neededBy),
    finish: item.decisionDate ? fromIsoDate(item.decisionDate) : "—",
    latency: item.latencyDays ?? 0,
    status: item.status,
    impact: item.impactSummary,
    number: item.openActions,
    tags: [
      ...(item.riskIds.length ? [`${item.riskIds.length} risk`] : []),
      ...(item.issueIds.length ? [`${item.issueIds.length} issue`] : []),
      ...(item.changeIds.length ? [`${item.changeIds.length} change`] : []),
      ...(item.dependencyIds.length ? [`${item.dependencyIds.length} dependency`] : []),
      ...(item.benefitIds.length ? [`${item.benefitIds.length} benefit`] : []),
    ],
    pending: item.status === "Pending",
    overdue: item.overdue,
    supersededFlag: item.status === "Superseded",
    group: item.forum,
  }));

const visible = decisionColumnsFor([]).map((column) => column.key);
export const decisionViews: SavedView[] = [
  {
    id: "pending",
    name: "Pending",
    type: "table",
    groupBy: "",
    sortKey: "start",
    filter: "",
    filters: [{ key: "pending", operator: "truthy" }],
    visible,
    isDefault: true,
  },
  {
    id: "overdue",
    name: "Pending - overdue",
    type: "table",
    groupBy: "",
    sortKey: "start",
    filter: "",
    filters: [{ key: "overdue", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "forum",
    name: "By forum",
    type: "table",
    groupBy: "group",
    sortKey: "start",
    filter: "",
    visible,
    isDefault: false,
  },
  {
    id: "month",
    name: "Made this month",
    type: "table",
    groupBy: "",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "madeThisMonth", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "superseded",
    name: "Superseded",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    filters: [{ key: "supersededFlag", operator: "truthy" }],
    visible,
    isDefault: false,
  },
];

export const assumptionColumns: BoardColumn[] = [
  { key: "reference", label: "Reference", type: "text", width: 110 },
  { key: "title", label: "Assumption", type: "text", summary: "count", width: 380 },
  { key: "scope", label: "Project / programme", type: "text", width: 230 },
  { key: "people", label: "Owner", type: "people" },
  { key: "rationale", label: "Rationale", type: "text", width: 320 },
  { key: "finish", label: "Validation date", type: "date", editable: true },
  {
    key: "status",
    label: "Status",
    type: "status",
    editable: true,
    options: ["Open", "Validated", "Invalidated"],
  },
];
export const assumptionsToRows = (items: ResolvedAssumption[]): BoardRow[] =>
  items.map((item) => ({
    id: item.id,
    reference: item.reference,
    title: item.assumption,
    scope: item.scopeName,
    people: [item.owner],
    rationale: item.rationale,
    finish: fromIsoDate(item.validationDate),
    status: item.status,
    overdue: item.overdue,
    group: item.status,
  }));
export const assumptionViews: SavedView[] = [
  {
    id: "all",
    name: "All",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    visible: assumptionColumns.map((column) => column.key),
    isDefault: true,
  },
  {
    id: "open",
    name: "Open",
    type: "table",
    groupBy: "",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "status", operator: "equals", value: "Open" }],
    visible: assumptionColumns.map((column) => column.key),
    isDefault: false,
  },
  {
    id: "overdue",
    name: "Validation overdue",
    type: "table",
    groupBy: "",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "overdue", operator: "truthy" }],
    visible: assumptionColumns.map((column) => column.key),
    isDefault: false,
  },
  {
    id: "invalidated",
    name: "Invalidated",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    filters: [{ key: "status", operator: "equals", value: "Invalidated" }],
    visible: assumptionColumns.map((column) => column.key),
    isDefault: false,
  },
];

/** Decision board column key → decision field. Undefined while a value isn't valid yet. */
export function decisionInputFromBoard(
  patch: Partial<BoardRow>,
  forums: Array<{ id: string; label: string }>,
): DecisionInput | undefined {
  const input: DecisionInput = {};
  if (typeof patch["forum"] === "string") {
    const forum = forums.find((item) => item.label === patch["forum"]);
    if (!forum) return undefined;
    input.forumId = forum.id;
  }
  if (patch.start !== undefined) {
    const date = toIsoDate(String(patch.start));
    if (!date) return undefined;
    input.neededBy = date;
  }
  if (typeof patch.title === "string") {
    if (!patch.title.trim()) return undefined;
    input.title = patch.title;
  }
  return input;
}

/** Assumption board column key → assumption field. */
export function assumptionInputFromBoard(patch: Partial<BoardRow>): AssumptionInput | undefined {
  const input: AssumptionInput = {};
  if (patch.finish !== undefined) {
    const date = toIsoDate(String(patch.finish));
    if (!date) return undefined;
    input.validationDate = date;
  }
  if (
    typeof patch.status === "string" &&
    ["Open", "Validated", "Invalidated"].includes(patch.status)
  )
    input.status = patch.status as AssumptionStatus;
  if (typeof patch.title === "string") {
    if (!patch.title.trim()) return undefined;
    input.assumption = patch.title;
  }
  return input;
}
