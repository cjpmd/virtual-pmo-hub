// Benefits register board: rows from services/benefits.ts and the column → field mapping the
// board uses to write edits by record id.
import type { BoardColumn, BoardRow, SavedView } from "@/components/board-workspace";
import type { BenefitClassification, BenefitStatus } from "@/data/types";
import { fromIsoDate } from "@/lib/format";
import type { BenefitInput, BenefitsData, BenefitView } from "@/services/benefits";
import type { Person } from "@/services/hierarchy";
import type { AppSettings } from "@/data/settings-types";
import { defaultClassification } from "@/lib/benefit-classification";

const statuses: BenefitStatus[] = [
  "Identified",
  "Validated",
  "Planned",
  "In realisation",
  "Realised",
  "Partially realised",
  "Not realised",
  "Closed",
];
export const benefitColumns: BoardColumn[] = [
  { key: "reference", label: "Reference", type: "text", width: 110 },
  { key: "title", label: "Benefit", type: "text", summary: "count", width: 280 },
  {
    key: "type",
    label: "Type",
    type: "status",
    editable: true,
    options: ["Benefit", "Disbenefit"],
  },
  {
    key: "classification",
    label: "Classification",
    type: "status",
    editable: true,
    options: ["Cash-releasing", "Non-cash-releasing", "Qualitative", "Societal"],
  },
  { key: "people", label: "Benefit owner", type: "people" },
  { key: "projects", label: "Enabling projects", type: "tags", width: 260 },
  {
    key: "planned",
    label: "Planned total value",
    type: "number",
    unit: "currency",
    summary: "sum",
  },
  { key: "realised", label: "Realised to date", type: "number", unit: "currency", summary: "sum" },
  { key: "progress", label: "% realised", type: "progress", summary: "average", unit: "%" },
  {
    key: "confidence",
    label: "Confidence",
    type: "status",
    editable: true,
    options: ["High", "Medium", "Low"],
  },
  { key: "finish", label: "Next measurement due", type: "date" },
  { key: "status", label: "Status", type: "status", editable: true, options: statuses },
  { key: "atRisk", label: "At risk", type: "status" },
];

/**
 * NHS-2: the columns with an editable Category (the organisation's benefit categories) after
 * Classification. Choosing a category pre-selects its default classification (Settings › Benefits).
 */
export function benefitColumnsFor(categories: Array<{ label: string }>): BoardColumn[] {
  const index = benefitColumns.findIndex((column) => column.key === "classification");
  const category: BoardColumn = {
    key: "category",
    label: "Category",
    type: "status",
    editable: categories.length > 0,
    options: categories.map((item) => item.label),
  };
  return [...benefitColumns.slice(0, index + 1), category, ...benefitColumns.slice(index + 1)];
}

/** Board rows. "At risk" is the view's benefit health (At Risk or Off Track), not a client rule. */
export function benefitsToRows(
  data: BenefitsData,
  items: BenefitView[] = data.benefits,
): BoardRow[] {
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const programmes = new Map(data.programmes.map((programme) => [programme.id, programme.name]));
  const objectives = new Map(data.objectives.map((objective) => [objective.id, objective.title]));
  return items.map((item) => {
    const links = item.enablingProjects
      .map((link) => projects.get(link.projectId))
      .filter((project) => project !== undefined);
    const programmeNames = Array.from(
      new Set(links.map((project) => programmes.get(project.programmeId ?? "") ?? "Unassigned")),
    );
    const objectiveNames = item.strategicObjectiveIds.map((id) => objectives.get(id) ?? id);
    const health = item.realisation.health;
    return {
      id: item.id,
      reference: item.reference,
      title: item.title,
      type: item.type,
      classification: item.classification,
      category: item.category,
      people: item.owner ? [item.owner] : [],
      owner: item.owner,
      projects: links.map((project) => project.name),
      programme: programmeNames.join(", "),
      objective: objectiveNames.join(", "),
      planned: item.plannedTotalValue,
      realised: item.realisation.realised,
      progress: item.realisation.percent,
      confidence: item.confidence,
      finish: fromIsoDate(item.realisation.nextMeasurementDue),
      status: item.status,
      atRisk: health === "At Risk" || health === "Off Track" ? "At risk" : "",
      measurementOverdue: item.realisation.measurementOverdue,
      unownedOrUnvalidated: !item.owner || !item.eligibilityConfirmed,
      closedProjectRealisation:
        item.status === "In realisation" && links.some((project) => project.state === "Closed"),
      disbenefit: item.type === "Disbenefit",
      group: objectiveNames[0] ?? "Unaligned",
    };
  });
}

/** Board column key → benefit field. Undefined while a value isn't valid yet. */
export function benefitInputFromBoard(
  patch: Partial<BoardRow>,
  people: Person[],
  categories: Array<{ id: string; label: string; value?: string }> = [],
  benefitSettings?: Pick<AppSettings["benefits"], "categoryClassification" | "categoryKeys">,
): BenefitInput | undefined {
  const input: BenefitInput = {};
  if (typeof patch["category"] === "string") {
    const category = categories.find((item) => item.label === patch["category"]);
    if (!category) return undefined;
    input.categoryId = category.id;
    // A category change suggests its default classification, unless one came with the edit.
    const suggested = defaultClassification(category, benefitSettings);
    if (suggested && patch["classification"] === undefined) input.classification = suggested;
  }
  if (typeof patch.title === "string") {
    if (!patch.title.trim()) return undefined;
    input.title = patch.title;
  }
  if (patch["type"] === "Benefit" || patch["type"] === "Disbenefit") input.type = patch["type"];
  if (typeof patch.status === "string" && statuses.includes(patch.status as BenefitStatus))
    input.status = patch.status as BenefitStatus;
  if (
    patch["confidence"] === "High" ||
    patch["confidence"] === "Medium" ||
    patch["confidence"] === "Low"
  )
    input.confidence = patch["confidence"];
  if (
    typeof patch["classification"] === "string" &&
    ["Cash-releasing", "Non-cash-releasing", "Qualitative", "Societal"].includes(
      patch["classification"],
    )
  )
    input.classification = patch["classification"] as BenefitClassification;
  if (Array.isArray(patch.people)) {
    const name = patch.people[0];
    if (!name) input.ownerId = null;
    else {
      const person = people.find((item) => item.name === name);
      if (!person) return undefined;
      input.ownerId = person.id;
    }
  }
  if (patch["planned"] !== undefined) {
    const value = Number(patch["planned"]);
    if (!Number.isFinite(value)) return undefined;
    input.plannedTotalValue = value;
  }
  return input;
}

const visible = benefitColumns.map((column) => column.key);
export const benefitViews: SavedView[] = [
  {
    id: "all",
    name: "All benefits",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    visible,
    isDefault: true,
  },
  {
    id: "objective",
    name: "By strategic objective",
    type: "table",
    groupBy: "objective",
    sortKey: "reference",
    filter: "",
    visible,
    isDefault: false,
  },
  {
    id: "programme",
    name: "By programme",
    type: "table",
    groupBy: "programme",
    sortKey: "reference",
    filter: "",
    visible,
    isDefault: false,
  },
  {
    id: "cash",
    name: "Cash-releasing",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    filters: [{ key: "classification", operator: "equals", value: "Cash-releasing" }],
    visible,
    isDefault: false,
  },
  {
    id: "disbenefits",
    name: "Disbenefits",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    filters: [{ key: "type", operator: "equals", value: "Disbenefit" }],
    visible,
    isDefault: false,
  },
  {
    id: "overdue",
    name: "Measurements overdue",
    type: "table",
    groupBy: "",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "measurementOverdue", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "unowned",
    name: "Unowned or unvalidated",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    filters: [{ key: "unownedOrUnvalidated", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "at-risk",
    name: "At risk",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    filters: [{ key: "atRisk", operator: "equals", value: "At risk" }],
    visible,
    isDefault: false,
  },
  {
    id: "closed",
    name: "In realisation (closed projects)",
    type: "table",
    groupBy: "",
    sortKey: "reference",
    filter: "",
    filters: [{ key: "closedProjectRealisation", operator: "truthy" }],
    visible,
    isDefault: false,
  },
];
