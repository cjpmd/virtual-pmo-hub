// Project financials, read from and written to Supabase (design: docs/financials-and-business-cases.md).
//
//   reads  – v_project_financials (the summary every screen agrees on), cost lines, monthly
//            values, baselines, the import log, financial periods, and the programme and
//            portfolio roll-ups
//   writes – cost lines and monthly values through the shared write helper (optimistic
//            concurrency per cell); baselines are insert-only; month-end close, reopen and
//            the actuals import are RPCs, so their rules run in one transaction
//
// RLS decides who may write what (forecast: anyone who can edit the project; budget and
// actuals: PMO; baselines: manager or PMO, narrowed by source in a trigger). The screens only
// avoid offering what would be refused.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { NewRow } from "./db";
import type { FinancialKind, MonthValue } from "./financials-calc";
import type { CommitRow } from "./actuals-import";
import type { ChangeView } from "./decisions";
import { ServiceError, unwrap, unwrapMaybe } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

type BaselineSource = Database["public"]["Enums"]["baseline_source"];
type SpendType = Database["public"]["Enums"]["spend_type"];
export type ImportMode = Database["public"]["Enums"]["actuals_import_mode"];

export interface ProjectFinancials {
  projectId: string;
  workspaceId: string;
  hasBaseline: boolean;
  budget: number;
  baselineVersion: number | null;
  budgetPhased: number;
  phasingGap: number;
  /** The organisation's cut-off month (YYYY-MM-01). */
  actualsThrough: string;
  actualToDate: number;
  actualOpenMonths: number;
  forecastRemaining: number;
  eac: number;
  variance: number;
  variancePercent: number | null;
  openMonthOverrun: boolean;
  overrunMonth: string | null;
}

export interface CostLine {
  id: string;
  name: string;
  categoryId: string;
  spendType: SpendType;
  fundingSourceId: string | null;
  sortOrder: number;
  archived: boolean;
  updatedAt: string;
}

export interface FinancialValue extends MonthValue {
  id: string;
  updatedAt: string;
}

export interface Baseline {
  id: string;
  version: number;
  total: number;
  source: BaselineSource;
  changeRequestId: string | null;
  changeRequestLabel: string | null;
  reason: string | null;
  approvedAt: string;
  approvedBy: string | null;
}

export interface ProjectImport {
  importId: string;
  fileName: string;
  mode: ImportMode;
  importedAt: string;
  importedBy: string | null;
  /** This project's rows and total in the import. */
  rows: number;
  total: number;
}

export interface ProjectFinancialData {
  summary: ProjectFinancials;
  lines: CostLine[];
  values: FinancialValue[];
  baselines: Baseline[];
  imports: ProjectImport[];
  closedMonths: string[];
}

export interface RollupFinancials {
  id: string;
  allocated: number;
  projectCount: number;
  baselinedCount: number;
  budget: number;
  actualToDate: number;
  actualOpenMonths: number;
  forecastRemaining: number;
  eac: number;
  variance: number;
  variancePercent: number | null;
  openMonthOverrun: boolean;
}

export interface FinancialPeriod {
  periodMonth: string;
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
}

export const baselineSourceLabel: Record<BaselineSource, string> = {
  initial: "Initial",
  business_case: "Business case",
  change_request: "Change request",
  pmo_adjustment: "PMO adjustment",
  migration: "Migrated",
};

const num = (value: number | string | null | undefined) => Number(value ?? 0);

type SummaryRow = Database["public"]["Views"]["v_project_financials"]["Row"];
const toSummary = (row: SummaryRow): ProjectFinancials => ({
  projectId: row.project_id ?? "",
  workspaceId: row.workspace_id ?? "",
  hasBaseline: Boolean(row.has_baseline),
  budget: num(row.budget),
  baselineVersion: row.baseline_version ?? null,
  budgetPhased: num(row.budget_phased),
  phasingGap: num(row.phasing_gap),
  actualsThrough: row.actuals_through ?? "",
  actualToDate: num(row.actual_to_date),
  actualOpenMonths: num(row.actual_open_months),
  forecastRemaining: num(row.forecast_remaining),
  eac: num(row.eac),
  variance: num(row.variance),
  variancePercent: row.variance_percent === null ? null : num(row.variance_percent),
  openMonthOverrun: Boolean(row.open_month_overrun),
  overrunMonth: row.overrun_month ?? null,
});

/** Everything the Financials tab shows for one project, in parallel. */
export async function loadProjectFinancials(
  orgId: string,
  projectId: string,
): Promise<ProjectFinancialData> {
  const [summary, lines, values, baselines, importRows, periods] = await Promise.all([
    supabase.from("v_project_financials").select("*").eq("project_id", projectId).maybeSingle(),
    supabase
      .from("cost_lines")
      .select(
        "id, name, category_id, spend_type, funding_source_id, sort_order, archived_at, updated_at",
      )
      .eq("project_id", projectId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("financial_values")
      .select("id, cost_line_id, period_month, kind, amount, updated_at")
      .eq("project_id", projectId)
      .order("period_month")
      .range(0, 9999),
    supabase
      .from("budget_baselines")
      .select(
        "id, version, total, source, change_request_id, reason, approved_at, approver:profiles!budget_baselines_approved_by_fkey(display_name), change_request:change_requests(ref, title)",
      )
      .eq("project_id", projectId)
      .order("version", { ascending: false }),
    supabase
      .from("actuals_import_rows")
      .select(
        "import_id, amount, import:actuals_imports!inner(file_name, mode, imported_at, importer:profiles!actuals_imports_imported_by_fkey(display_name))",
      )
      .eq("project_id", projectId)
      .range(0, 9999),
    supabase
      .from("financial_periods")
      .select("period_month")
      .eq("organisation_id", orgId)
      .not("closed_at", "is", null),
  ]);
  const summaryRow = unwrapMaybe(summary, "Loading the project's financials");
  if (!summaryRow)
    throw new ServiceError("not_found", "We couldn't find this project's financials.");

  const imports = new Map<string, ProjectImport>();
  for (const row of unwrap(importRows, "Loading the import log")) {
    const meta = row.import;
    const entry = imports.get(row.import_id) ?? {
      importId: row.import_id,
      fileName: meta.file_name,
      mode: meta.mode,
      importedAt: meta.imported_at,
      importedBy: meta.importer?.display_name ?? null,
      rows: 0,
      total: 0,
    };
    entry.rows += 1;
    entry.total = Math.round((entry.total + num(row.amount)) * 100) / 100;
    imports.set(row.import_id, entry);
  }

  return {
    summary: toSummary(summaryRow),
    lines: unwrap(lines, "Loading cost lines").map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      spendType: row.spend_type,
      fundingSourceId: row.funding_source_id,
      sortOrder: row.sort_order,
      archived: Boolean(row.archived_at),
      updatedAt: row.updated_at,
    })),
    values: unwrap(values, "Loading monthly values").map((row) => ({
      id: row.id,
      costLineId: row.cost_line_id,
      periodMonth: row.period_month,
      kind: row.kind,
      amount: num(row.amount),
      updatedAt: row.updated_at,
    })),
    baselines: unwrap(baselines, "Loading baselines").map((row) => {
      const approver = row.approver;
      const change = row.change_request;
      return {
        id: row.id,
        version: row.version,
        total: num(row.total),
        source: row.source,
        changeRequestId: row.change_request_id,
        changeRequestLabel: change ? `${change.ref} · ${change.title}` : null,
        reason: row.reason,
        approvedAt: row.approved_at,
        approvedBy: approver?.display_name ?? null,
      };
    }),
    imports: [...imports.values()].sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
    closedMonths: unwrap(periods, "Loading closed months").map((row) => row.period_month),
  };
}

type RollupRow = Database["public"]["Views"]["v_programme_financials"]["Row"];
const toRollup = (
  id: string,
  row: Omit<RollupRow, "programme_id" | "portfolio_id">,
): RollupFinancials => ({
  id,
  allocated: num(row.allocated),
  projectCount: row.project_count ?? 0,
  baselinedCount: row.baselined_count ?? 0,
  budget: num(row.budget),
  actualToDate: num(row.actual_to_date),
  actualOpenMonths: num(row.actual_open_months),
  forecastRemaining: num(row.forecast_remaining),
  eac: num(row.eac),
  variance: num(row.variance),
  variancePercent: row.variance_percent === null ? null : num(row.variance_percent),
  openMonthOverrun: Boolean(row.open_month_overrun),
});

export async function getProgrammeFinancials(programmeId: string) {
  const row = unwrapMaybe(
    await supabase
      .from("v_programme_financials")
      .select("*")
      .eq("programme_id", programmeId)
      .maybeSingle(),
    "Loading the programme's financials",
  );
  return row ? toRollup(programmeId, row) : null;
}

export async function getPortfolioFinancials(portfolioId: string) {
  const row = unwrapMaybe(
    await supabase
      .from("v_portfolio_financials")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .maybeSingle(),
    "Loading the portfolio's financials",
  );
  return row ? toRollup(portfolioId, row) : null;
}

/** Project-level financials for a programme or portfolio breakdown table. */
export async function listProjectFinancials(filter: {
  programmeId?: string;
  portfolioId?: string;
  projectIds?: string[];
}) {
  if (filter.projectIds && !filter.projectIds.length) return [];
  let query = supabase.from("v_project_financials").select("*");
  if (filter.programmeId) query = query.eq("programme_id", filter.programmeId);
  if (filter.portfolioId) query = query.eq("effective_portfolio_id", filter.portfolioId);
  if (filter.projectIds) query = query.in("project_id", filter.projectIds);
  return unwrap(await query.range(0, 1999), "Loading project financials").map(toSummary);
}

// ---- Cost lines ---------------------------------------------------------------------------

export interface CostLineInput {
  name?: string;
  categoryId?: string;
  spendType?: SpendType;
  fundingSourceId?: string | null;
  archived?: boolean;
}

export async function addCostLine(
  projectId: string,
  input: Required<Pick<CostLineInput, "name" | "categoryId">> & CostLineInput,
  sortOrder: number,
) {
  return insertRow(
    "cost_lines",
    {
      project_id: projectId,
      name: input.name.trim(),
      category_id: input.categoryId,
      spend_type: input.spendType ?? "operating",
      funding_source_id: input.fundingSourceId ?? null,
      sort_order: sortOrder,
    } as NewRow<"cost_lines">,
    "Adding the cost line",
  );
}

export async function updateCostLine(id: string, input: CostLineInput, lastSeen: string | null) {
  return updateRow(
    "cost_lines",
    id,
    {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.categoryId !== undefined && { category_id: input.categoryId }),
      ...(input.spendType !== undefined && { spend_type: input.spendType }),
      ...(input.fundingSourceId !== undefined && { funding_source_id: input.fundingSourceId }),
      ...(input.archived !== undefined && {
        archived_at: input.archived ? new Date().toISOString() : null,
      }),
    },
    { context: "Saving the cost line", lastSeen },
  );
}

// ---- Monthly values -----------------------------------------------------------------------

export interface CellWrite {
  projectId: string;
  costLineId: string;
  periodMonth: string;
  kind: FinancialKind;
  /** null clears the cell. */
  amount: number | null;
  /** The existing row, when there is one. */
  existing?: { id: string; updatedAt: string } | undefined;
}

/**
 * Save one cell. An existing value is updated with the updated_at the grid loaded (someone
 * else's later save is reported, not overwritten); an empty cell inserts; clearing deletes.
 */
export async function saveCell(cell: CellWrite) {
  const context = "Saving the value";
  if (cell.existing) {
    if (cell.amount === null) return deleteRows("financial_values", [cell.existing.id], context);
    return updateRow(
      "financial_values",
      cell.existing.id,
      { amount: cell.amount },
      {
        context,
        lastSeen: cell.existing.updatedAt,
      },
    );
  }
  if (cell.amount === null) return;
  return insertRow(
    "financial_values",
    {
      project_id: cell.projectId,
      cost_line_id: cell.costLineId,
      period_month: cell.periodMonth,
      kind: cell.kind,
      amount: cell.amount,
    } as NewRow<"financial_values">,
    context,
  );
}

// ---- Baselines ----------------------------------------------------------------------------

export interface BaselineInput {
  projectId: string;
  total: number;
  source: Extract<BaselineSource, "initial" | "change_request" | "pmo_adjustment">;
  changeRequestId?: string;
  reason?: string;
}

export async function addBaseline(input: BaselineInput) {
  return insertRow(
    "budget_baselines",
    {
      project_id: input.projectId,
      total: input.total,
      source: input.source,
      change_request_id: input.changeRequestId ?? null,
      reason: input.reason?.trim() || null,
    } as NewRow<"budget_baselines">,
    "Setting the budget baseline",
  );
}

/** Change requests already turned into a baseline (each can be used once). */
export async function listBaselinedChangeIds(orgId: string) {
  const rows = unwrap(
    await supabase
      .from("budget_baselines")
      .select("change_request_id")
      .eq("organisation_id", orgId)
      .not("change_request_id", "is", null),
    "Loading baselines",
  );
  return new Set(rows.map((row) => row.change_request_id as string));
}

/** The current baseline total, for the "previous + cost impact" arithmetic. */
export async function getCurrentBaseline(projectId: string) {
  const row = unwrapMaybe(
    await supabase
      .from("budget_baselines")
      .select("version, total")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Loading the baseline",
  );
  return row ? { version: row.version, total: num(row.total) } : null;
}

// ---- Month-end close ----------------------------------------------------------------------

export async function listFinancialPeriods(orgId: string): Promise<FinancialPeriod[]> {
  const rows = unwrap(
    await supabase
      .from("financial_periods")
      .select(
        "period_month, closed_at, reopened_at, reopen_reason, closer:profiles!financial_periods_closed_by_fkey(display_name), reopener:profiles!financial_periods_reopened_by_fkey(display_name)",
      )
      .eq("organisation_id", orgId)
      .order("period_month", { ascending: false }),
    "Loading financial periods",
  );
  return rows.map((row) => ({
    periodMonth: row.period_month,
    closed: Boolean(row.closed_at),
    closedAt: row.closed_at,
    closedBy: row.closer?.display_name ?? null,
    reopenedAt: row.reopened_at,
    reopenedBy: row.reopener?.display_name ?? null,
    reopenReason: row.reopen_reason,
  }));
}

export async function closeFinancialPeriod(orgId: string, month: string) {
  unwrap(
    await supabase.rpc("close_financial_period", { p_organisation_id: orgId, p_month: month }),
    "Closing the month",
  );
}

export async function reopenFinancialPeriod(orgId: string, month: string, reason: string) {
  unwrap(
    await supabase.rpc("reopen_financial_period", {
      p_organisation_id: orgId,
      p_month: month,
      p_reason: reason.trim(),
    }),
    "Reopening the month",
  );
}

// ---- Actuals import -----------------------------------------------------------------------

/** Lines of the given projects, for resolving import rows (chunked: the URL has a limit). */
export async function listCostLinesFor(projectIds: string[]) {
  const lines: Array<{
    id: string;
    projectId: string;
    name: string;
    categoryId: string;
    archived: boolean;
  }> = [];
  for (let i = 0; i < projectIds.length; i += 100) {
    const rows = unwrap(
      await supabase
        .from("cost_lines")
        .select("id, project_id, name, category_id, archived_at")
        .in("project_id", projectIds.slice(i, i + 100))
        .range(0, 9999),
      "Loading cost lines",
    );
    for (const row of rows)
      lines.push({
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        categoryId: row.category_id,
        archived: Boolean(row.archived_at),
      });
  }
  return lines;
}

/** Which of these references were imported before in the workspace (lower case). */
export async function listImportedReferences(workspaceId: string, references: string[]) {
  const found = new Set<string>();
  const unique = [...new Set(references.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const rows = unwrap(
      await supabase
        .from("actuals_import_rows")
        .select("reference")
        .eq("workspace_id", workspaceId)
        .in("reference", unique.slice(i, i + 100)),
      "Checking references",
    );
    for (const row of rows) if (row.reference) found.add(row.reference.toLowerCase());
  }
  return found;
}

export async function commitActualsImport(
  workspaceId: string,
  fileName: string,
  mode: ImportMode,
  rows: CommitRow[],
) {
  const result = unwrap(
    await supabase.rpc("commit_actuals_import", {
      p_workspace_id: workspaceId,
      p_file_name: fileName,
      p_mode: mode,
      p_rows:
        rows as unknown as Database["public"]["Functions"]["commit_actuals_import"]["Args"]["p_rows"],
    }),
    "Importing actuals",
  ) as { import_id: string; row_count: number; total: number; lines_created: number };
  return {
    importId: result.import_id,
    rowCount: result.row_count,
    total: Number(result.total),
    linesCreated: result.lines_created,
  };
}

// ---- Lists --------------------------------------------------------------------------------

/** Active values of a lookup list (cost categories, funding sources), in their order. */
export async function listLookupOptions(
  orgId: string,
  listKey: "cost_category" | "funding_source",
) {
  const rows = unwrap(
    await supabase
      .from("lookup_values")
      .select("id, label, is_active")
      .eq("organisation_id", orgId)
      .eq("list_key", listKey)
      .order("sort_order"),
    "Loading lists",
  );
  return rows.map((row) => ({ id: row.id, label: row.label, active: row.is_active }));
}

// ---- Change requests → baselines ----------------------------------------------------------

export interface BaselineChange {
  id: string;
  ref: string;
  title: string;
  status: string;
  costImpact: number;
  projectId: string | null;
  workspaceId: string | null;
}

export const toBaselineChange = (change: ChangeView): BaselineChange => ({
  id: change.id,
  ref: change.ref,
  title: change.title,
  status: change.status,
  costImpact: change.costImpact,
  projectId: change.scope.projectId,
  workspaceId: change.scope.workspaceId,
});
