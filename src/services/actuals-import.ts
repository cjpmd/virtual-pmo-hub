// Actuals import, the part that runs in the browser before anything is saved: map the CSV's
// columns, resolve every row to a project, cost line and month, and list what is wrong.
// Pure (no Supabase), so it is unit-tested; commit_actuals_import does the writing and checks
// the same rules again on the server.
import { parseAmount, parseMonth } from "./financials-calc";

export interface ImportMapping {
  hasHeader: boolean;
  /** Column indexes; -1 when the file has no such column. */
  date: number;
  amount: number;
  line: number;
  category: number;
  project: number;
  reference: number;
}

export interface ImportProject {
  id: string;
  code: string;
  name: string;
  workspaceId: string;
}

export interface ImportLine {
  id: string;
  projectId: string;
  name: string;
  categoryId: string;
  archived: boolean;
}

export interface ImportContext {
  workspaceId: string;
  /** Rows go to this project when the file has no project column (the project's own tab). */
  defaultProjectId: string | null;
  projects: ImportProject[];
  lines: ImportLine[];
  categories: Array<{ id: string; label: string }>;
  closedMonths: Set<string>;
  /** References already imported earlier (lower case). */
  existingReferences: Set<string>;
  /** "Create a line per category where missing". */
  createMissingLines: boolean;
}

export interface PreviewRow {
  /** Row in the file as a spreadsheet numbers it (the header is row 1). */
  rowNumber: number;
  cells: string[];
  projectId: string | null;
  projectCode: string;
  costLineId: string | null;
  categoryId: string | null;
  /** What the amount goes to: the line's name, or "New line: <category>". */
  lineLabel: string;
  month: string | null;
  amount: number | null;
  reference: string | null;
  errors: string[];
  warnings: string[];
}

export interface CommitRow {
  row_number: number;
  project_id: string;
  cost_line_id?: string;
  category_id?: string;
  period_month: string;
  amount: number;
  reference?: string;
}

const norm = (value: string) => value.trim().toLowerCase();

/** A first guess at the mapping from the header row's names. */
export function guessMapping(header: string[]): ImportMapping {
  const find = (...patterns: RegExp[]) =>
    header.findIndex((name) => patterns.some((pattern) => pattern.test(norm(name))));
  return {
    hasHeader: true,
    date: find(/^(date|period|month|posting date|transaction date|gl date)$/, /date|period/),
    amount: find(/^(amount|value|net|net amount|actual|cost)$/, /amount|value/),
    line: find(/^(cost line|line|budget line)$/),
    category: find(/^(category|cost category|cost type|type|account)$/),
    project: find(/^(project|project code|code|project ref)$/, /project/),
    reference: find(/^(reference|ref|invoice|invoice number|document|doc no)$/, /ref|invoice/),
  };
}

export function buildPreview(
  rows: string[][],
  mapping: ImportMapping,
  context: ImportContext,
): PreviewRow[] {
  const projectsByCode = new Map(context.projects.map((project) => [norm(project.code), project]));
  const projectsById = new Map(context.projects.map((project) => [project.id, project]));
  const categoriesByLabel = new Map(
    context.categories.map((category) => [norm(category.label), category]),
  );
  const categoryLabel = new Map(
    context.categories.map((category) => [category.id, category.label]),
  );
  const activeLines = context.lines.filter((line) => !line.archived);
  const body = mapping.hasHeader ? rows.slice(1) : rows;
  const offset = mapping.hasHeader ? 2 : 1;
  const referenceCounts = new Map<string, number>();
  if (mapping.reference >= 0)
    for (const cells of body) {
      const reference = norm(cells[mapping.reference] ?? "");
      if (reference) referenceCounts.set(reference, (referenceCounts.get(reference) ?? 0) + 1);
    }

  return body.map((cells, index) => {
    const cell = (column: number) => (column >= 0 ? (cells[column] ?? "").trim() : "");
    const errors: string[] = [];
    const warnings: string[] = [];

    // Project
    let project: ImportProject | undefined;
    const code = cell(mapping.project);
    if (mapping.project >= 0) {
      if (!code) errors.push("No project code");
      else {
        project = projectsByCode.get(norm(code));
        if (!project) errors.push(`Unknown project code "${code}"`);
        else if (project.workspaceId !== context.workspaceId) {
          errors.push(`${project.code} is in a different workspace`);
          project = undefined;
        }
      }
    } else if (context.defaultProjectId) project = projectsById.get(context.defaultProjectId);
    else errors.push("No project column mapped");

    // Month and amount
    const dateText = cell(mapping.date);
    const month = dateText ? parseMonth(dateText) : null;
    if (!month) errors.push(dateText ? `Can't read the date "${dateText}"` : "No date");
    else if (context.closedMonths.has(month)) errors.push(`${monthLabel(month)} is closed`);
    const amountText = cell(mapping.amount);
    const amount = amountText ? parseAmount(amountText) : null;
    if (amount === null)
      errors.push(amountText ? `Can't read the amount "${amountText}"` : "No amount");
    else if (amount < 0) warnings.push("Credit (negative actual)");

    // Cost line: by name, or by category
    let costLineId: string | null = null;
    let categoryId: string | null = null;
    let lineLabel = "";
    if (project) {
      const lines = activeLines.filter((line) => line.projectId === project!.id);
      const lineName = cell(mapping.line);
      const categoryName = cell(mapping.category);
      if (mapping.line >= 0 && lineName) {
        const line = lines.find((item) => norm(item.name) === norm(lineName));
        if (line) {
          costLineId = line.id;
          lineLabel = line.name;
        } else errors.push(`No line "${lineName}" on ${project.code}`);
      } else if (mapping.category >= 0 && categoryName) {
        const category = categoriesByLabel.get(norm(categoryName));
        if (!category) errors.push(`Unknown category "${categoryName}"`);
        else {
          const matches = lines.filter((line) => line.categoryId === category.id);
          if (matches.length === 1) {
            costLineId = matches[0]!.id;
            lineLabel = matches[0]!.name;
          } else if (matches.length > 1)
            errors.push(
              `${project.code} has ${matches.length} ${category.label} lines; map the line`,
            );
          else if (context.createMissingLines) {
            categoryId = category.id;
            lineLabel = `New line: ${categoryLabel.get(category.id) ?? category.label}`;
          } else errors.push(`${project.code} has no ${category.label} line`);
        }
      } else errors.push("No cost line or category");
    }

    // Reference
    const reference = cell(mapping.reference) || null;
    if (reference) {
      if ((referenceCounts.get(norm(reference)) ?? 0) > 1)
        errors.push(`Reference ${reference} appears more than once`);
      else if (context.existingReferences.has(norm(reference)))
        errors.push(`Reference ${reference} was imported before`);
    }

    return {
      rowNumber: index + offset,
      cells,
      projectId: project?.id ?? null,
      projectCode: project?.code ?? code,
      costLineId,
      categoryId,
      lineLabel,
      month,
      amount,
      reference,
      errors,
      warnings,
    };
  });
}

/** Rows to send: everything not excluded. Throws if any of them still has an error. */
export function toCommitRows(preview: PreviewRow[], excluded: Set<number>): CommitRow[] {
  const included = preview.filter((row) => !excluded.has(row.rowNumber));
  const blocked = included.find((row) => row.errors.length);
  if (blocked) throw new Error(`Row ${blocked.rowNumber}: ${blocked.errors[0]}`);
  return included.map((row) => ({
    row_number: row.rowNumber,
    project_id: row.projectId!,
    ...(row.costLineId ? { cost_line_id: row.costLineId } : { category_id: row.categoryId! }),
    period_month: row.month!,
    amount: row.amount!,
    ...(row.reference ? { reference: row.reference } : {}),
  }));
}

export interface ImportTotals {
  total: number;
  byMonth: Array<{ month: string; total: number }>;
  byProject: Array<{ projectCode: string; total: number; rows: number }>;
}

/** Totals by month and by project over the rows that will be imported. */
export function importTotals(preview: PreviewRow[], excluded: Set<number>): ImportTotals {
  const months = new Map<string, number>();
  const projects = new Map<string, { total: number; rows: number }>();
  let total = 0;
  for (const row of preview) {
    if (excluded.has(row.rowNumber) || row.errors.length || row.amount === null || !row.month)
      continue;
    total += row.amount;
    months.set(row.month, (months.get(row.month) ?? 0) + row.amount);
    const entry = projects.get(row.projectCode) ?? { total: 0, rows: 0 };
    entry.total += row.amount;
    entry.rows += 1;
    projects.set(row.projectCode, entry);
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    total: round(total),
    byMonth: [...months]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, total: round(value) })),
    byProject: [...projects]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([projectCode, value]) => ({
        projectCode,
        total: round(value.total),
        rows: value.rows,
      })),
  };
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mar 2026" for 2026-03-01. */
export const monthLabel = (month: string) =>
  `${SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
