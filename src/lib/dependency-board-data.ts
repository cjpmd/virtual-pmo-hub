import type { BoardColumn, BoardRow, SavedView } from "@/components/board-workspace";
import type { Dependency, DependencyType } from "@/data/types";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import type { DependencyInput, ResolvedDependency } from "@/services/dependencies";

export const dependencyColumns: BoardColumn[] = [
  { key: "reference", label: "Reference", type: "text", width: 110 },
  { key: "title", label: "Dependency", type: "text", summary: "count", width: 300 },
  { key: "giver", label: "Giving side", type: "text", width: 250 },
  { key: "giverOwner", label: "Giving owner", type: "text", width: 170 },
  { key: "receiver", label: "Receiving side", type: "text", width: 250 },
  { key: "receiverOwner", label: "Receiving owner", type: "text", width: 170 },
  {
    key: "dependencyType",
    label: "Type",
    type: "status",
    editable: true,
    options: ["Sequencing", "Alignment", "Information", "Resource", "External"],
  },
  { key: "boundary", label: "Boundary", type: "status" },
  { key: "finish", label: "Required by", type: "date", editable: true },
  {
    key: "priority",
    label: "Criticality",
    type: "priority",
    editable: true,
    options: ["Low", "Medium", "High"],
  },
  {
    key: "validation",
    label: "Validation",
    type: "status",
    editable: true,
    options: ["Inferred", "Proposed", "Confirmed", "Closed", "Broken"],
  },
  { key: "acceptance", label: "Acceptance", type: "status" },
  { key: "status", label: "Health", type: "status", summary: "rag" },
  { key: "raidLinks", label: "Linked RAID", type: "tags" },
];

export const dependenciesToRows = (items: ResolvedDependency[]): BoardRow[] =>
  items.map((item) => ({
    id: item.id,
    reference: item.reference,
    title: item.description,
    giver: item.giverLabel,
    giverOwner: item.giver.owner,
    receiver: item.receiverLabel,
    receiverOwner: item.receiver.owner,
    dependencyType: item.type,
    boundary: item.boundary,
    finish: fromIsoDate(item.requiredBy),
    start: fromIsoDate(item.raisedDate),
    priority: item.criticality,
    validation: item.validation,
    acceptance: item.acceptance,
    status: item.health,
    raidLinks: [...item.riskIds.map(() => "Risk"), ...item.issueIds.map(() => "Issue")],
    people: [item.giver.owner, item.receiver.owner],
    crossPm: item.boundary === "Cross-PM",
    inferred: item.validation === "Inferred",
    needsAttention: item.health !== "On Track",
    isExternal:
      item.type === "External" ||
      item.giver.kind === "External" ||
      item.receiver.kind === "External",
    group: item.giverProgrammeName,
  }));

const visible = dependencyColumns.map((column) => column.key);
export const dependencyViews: SavedView[] = [
  {
    id: "all",
    name: "All",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    visible,
    isDefault: true,
  },
  {
    id: "cross-pm",
    name: "Cross-PM",
    type: "table",
    groupBy: "",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "crossPm", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "inferred",
    name: "Inferred - needs validation",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    filters: [{ key: "inferred", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "attention",
    name: "At risk / off track",
    type: "table",
    groupBy: "",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "needsAttention", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "external",
    name: "External",
    type: "table",
    groupBy: "",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "isExternal", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "programme",
    name: "By programme",
    type: "table",
    groupBy: "group",
    sortKey: "reference",
    filter: "",
    visible,
    isDefault: false,
  },
];

/** Board column key → dependency field. Undefined while a value isn't valid yet. */
export function dependencyInputFromBoard(patch: Partial<BoardRow>): DependencyInput | undefined {
  const input: DependencyInput = {};
  if (patch["dependencyType"] !== undefined) {
    const value = patch["dependencyType"] as DependencyType;
    if (!["Sequencing", "Alignment", "Information", "Resource", "External"].includes(value))
      return undefined;
    input.type = value;
  }
  if (patch.finish !== undefined) {
    const date = toIsoDate(String(patch.finish));
    if (!date) return undefined;
    input.requiredBy = date;
  }
  if (patch.priority !== undefined) {
    const value = patch.priority as Dependency["criticality"];
    if (!["Low", "Medium", "High"].includes(value)) return undefined;
    input.criticality = value;
  }
  if (patch["validation"] !== undefined) {
    const value = patch["validation"] as Dependency["validation"];
    if (!["Inferred", "Proposed", "Confirmed", "Closed", "Broken"].includes(value))
      return undefined;
    input.validation = value;
  }
  if (typeof patch.title === "string") {
    if (!patch.title.trim()) return undefined;
    input.description = patch.title;
  }
  return input;
}
