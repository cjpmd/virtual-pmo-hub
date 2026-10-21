// Settings › Data: the portfolio CSV export, the settings JSON export and the project CSV import.
//
// The portfolio export, the import template and the import's column guesser share one set of
// headers (PROJECT_CSV_COLUMNS), so an exported file re-imports without re-mapping. Columns
// the import doesn't take (health, budget, forecast) map to "Ignore".
//
// Validation is pure (validateProjectRows) so it can be tested without a database. The import
// itself is one insert request: PostgREST runs it as a single statement, so either every row
// is saved or none is.
import type { AppSettings } from "@/data/settings-types";
import type { Enums } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { toCsv } from "@/lib/csv";
import type { NewRow } from "./db";
import {
  fetchPeople,
  fetchPhases,
  listPortfolios,
  programmeRefs,
  sharedProjectList,
  type Person,
  type Phase,
} from "./hierarchy";
import { projectStateValue, tierLabel } from "./labels";
import { ServiceError, unwrap } from "./service-error";
import { insertRows } from "./write";

/** Most rows one import takes. */
export const MAX_IMPORT_ROWS = 500;

/** Fields the project import can fill, in template order. */
export const PROJECT_IMPORT_FIELDS = [
  "Code",
  "Name",
  "Portfolio",
  "Programme",
  "Phase",
  "Tier",
  "State",
  "Manager",
  "Sponsor",
  "Start",
  "Finish",
] as const;
export type ProjectImportField = (typeof PROJECT_IMPORT_FIELDS)[number];
export type ProjectMappingTarget = ProjectImportField | "Ignore";

const HEALTH_COLUMNS = [
  "Overall health",
  "Schedule health",
  "Financial health",
  "Effort health",
  "Issue health",
  "Benefit health",
] as const;

/** Every portfolio export column, with the currency in the money headers. */
export function portfolioCsvColumns(currency: string) {
  return [
    "Code",
    "Name",
    "Portfolio",
    "Programme",
    "Phase",
    "Tier",
    "State",
    "Manager",
    "Sponsor",
    ...HEALTH_COLUMNS,
    `Budget (${currency})`,
    `Forecast (${currency})`,
    "Start",
    "Finish",
  ];
}

/** The import field a CSV header maps to by default. Export headers map exactly. */
export function guessProjectField(header: string): ProjectMappingTarget {
  const cleaned = header.trim().toLowerCase();
  const exact = PROJECT_IMPORT_FIELDS.find((field) => field.toLowerCase() === cleaned);
  if (exact) return exact;
  // Health, budget and forecast are derived or held elsewhere; never guessed onto a field.
  if (/health|budget|forecast|cost|spend/.test(cleaned)) return "Ignore";
  if (cleaned.includes("code") || cleaned === "ref" || cleaned === "reference") return "Code";
  if (cleaned.includes("portfolio")) return "Portfolio";
  if (cleaned.includes("programme") || cleaned.includes("program")) return "Programme";
  if (cleaned.includes("phase") || cleaned.includes("stage")) return "Phase";
  if (cleaned.includes("tier") || cleaned.includes("size")) return "Tier";
  if (cleaned.includes("state") || cleaned.includes("status")) return "State";
  if (cleaned.includes("sponsor")) return "Sponsor";
  if (cleaned.includes("manager") || cleaned === "pm" || cleaned.includes("owner"))
    return "Manager";
  if (cleaned.includes("start")) return "Start";
  if (cleaned.includes("finish") || cleaned.includes("end") || cleaned.includes("due"))
    return "Finish";
  if (cleaned.includes("name") || cleaned.includes("title") || cleaned === "project") return "Name";
  return "Ignore";
}

// ---- Portfolio export --------------------------------------------------------------

const amount = (value: number) => Math.round(value * 100) / 100;

/** Every non-archived project the user can see, as CSV. Dates ISO, money plain numbers. */
export async function portfolioCsv(orgId: string, settings: AppSettings): Promise<string> {
  const [projects, portfolios] = await Promise.all([
    sharedProjectList(orgId),
    listPortfolios(orgId, { withHealth: false }),
  ]);
  const portfolioName = new Map(portfolios.map((p) => [p.id, p.name]));
  const rows = projects.map((project) => [
    project.code,
    project.name,
    (project.portfolioId && portfolioName.get(project.portfolioId)) || "",
    project.programmeId ? project.programmeName : "",
    project.phaseId ? project.phaseName : "",
    project.tier,
    project.state,
    project.managerId ? project.managerName : "",
    project.sponsorId ? project.sponsorName : "",
    project.health.overall,
    project.health.schedule,
    project.health.financial,
    project.health.effort,
    project.health.issue,
    project.health.benefit,
    amount(project.budget),
    amount(project.forecast),
    project.startDate ?? "",
    project.finishDate ?? "",
  ]);
  return toCsv(portfolioCsvColumns(settings.regional.baseCurrency), rows);
}

/** The import template: the import columns and no rows. */
export const projectImportTemplate = () => toCsv(PROJECT_IMPORT_FIELDS, []);

// ---- Settings export ---------------------------------------------------------------

/**
 * The loaded settings as JSON, built key by key so nothing else in the store leaks in. Leaves
 * out member emails, the audit log (activity, not settings) and the logo URL (a signed storage
 * link). Settings hold no integration tokens or keys: those live in their own tables.
 */
export function settingsJson(settings: AppSettings): string {
  const exported = {
    organisation: { ...settings.organisation, logoDataUrl: "" },
    regional: settings.regional,
    workingTime: settings.workingTime,
    terminology: settings.terminology,
    health: settings.health,
    risk: settings.risk,
    benefits: settings.benefits,
    lists: settings.lists,
    users: settings.users.map(({ email: _email, ...user }) => user),
    roles: settings.roles,
    notifications: settings.notifications,
    templates: settings.templates,
    data: { retentionMonths: settings.data.retentionMonths },
    subscription: settings.subscription,
    lifecycle: settings.lifecycle,
  };
  return JSON.stringify(exported, null, 2);
}

// ---- Project import ----------------------------------------------------------------

export interface ProjectImportRefs {
  programmes: Array<{ id: string; name: string; portfolioId: string }>;
  portfolios: Array<{ id: string; name: string }>;
  phases: Phase[];
  people: Person[];
  /** Codes already used in the organisation, archived projects included. */
  codes: string[];
}

/** Reference data the import validates against. */
export async function loadProjectImportRefs(orgId: string): Promise<ProjectImportRefs> {
  const [programmes, portfolios, phases, people, codes] = await Promise.all([
    programmeRefs(orgId),
    listPortfolios(orgId, { withHealth: false }),
    fetchPhases(orgId),
    fetchPeople(orgId),
    supabase.from("projects").select("code").eq("organisation_id", orgId),
  ]);
  return {
    programmes: programmes.data
      .filter((row) => !row.archived)
      .map((row) => ({ id: row.id, name: row.name, portfolioId: row.portfolio_id })),
    portfolios: portfolios.map((row) => ({ id: row.id, name: row.name })),
    phases,
    people,
    codes: unwrap(codes, "Loading project codes").map((row) => row.code),
  };
}

export interface ProjectImportValues {
  code: string;
  /** True when the code was suggested here because the row left it blank. */
  codeSuggested: boolean;
  name: string;
  programmeId: string | null;
  portfolioId: string | null;
  phaseId: string | null;
  tier: Enums<"project_tier">;
  state: Enums<"project_state">;
  managerId: string | null;
  sponsorId: string | null;
  startDate: string | null;
  finishDate: string | null;
}

export interface ValidatedProjectRow {
  /** 1-based data row number (the header is row 0). */
  line: number;
  cells: Record<ProjectImportField, string>;
  values: ProjectImportValues | null;
  errors: string[];
  warnings: string[];
}

export interface ProjectImportValidation {
  rows: ValidatedProjectRow[];
  valid: ProjectImportValues[];
  /** More than MAX_IMPORT_ROWS data rows: nothing can be imported. */
  tooMany: boolean;
}

const key = (value: string) => value.trim().toLowerCase();
const CODE_PATTERN = /^[A-Z0-9]{2,10}$/;

/** Mirrors private.suggest_project_code, so codes left blank can't clash inside one insert. */
export function suggestProjectCode(name: string, taken: Set<string>) {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .toUpperCase()
    .split(/\s+/);
  let base = words
    .filter(Boolean)
    .map((word) => word[0])
    .join("");
  if (base.length < 3) base = (name.toUpperCase().replace(/[^A-Z0-9]/g, "") + "PRJ").slice(0, 3);
  base = base.slice(0, 6);
  let candidate = base;
  let n = 1;
  while (taken.has(candidate)) {
    n++;
    candidate = base.slice(0, 10 - String(n).length) + n;
  }
  return candidate;
}

/** A calendar date as YYYY-MM-DD: ISO, or the organisation's display format. */
export function parseImportDate(value: string, dateFormat: string): string | null {
  const text = value.trim();
  let year: number, month: number, day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (parts && dateFormat === "MM/DD/YYYY")
    [month, day, year] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  else if (parts) [day, month, year] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const tierValues = new Map(
  Object.entries(tierLabel).flatMap(([value, label]) => [
    [value, value as Enums<"project_tier">],
    [label.toLowerCase(), value as Enums<"project_tier">],
  ]),
);
const stateValues = new Map(
  Object.entries(projectStateValue).flatMap(([label, value]) => [
    [label.toLowerCase(), value],
    [value, value],
    [value.replace("_", " "), value],
  ]),
) as Map<string, Enums<"project_state">>;

/**
 * Check each CSV row against the organisation's reference data. `mapping` gives, for each CSV
 * column, the field it fills. Rows with errors are left out of `valid`; warnings don't block.
 */
export function validateProjectRows(
  body: string[][],
  mapping: ProjectMappingTarget[],
  refs: ProjectImportRefs,
  dateFormat: string,
): ProjectImportValidation {
  const tooMany = body.length > MAX_IMPORT_ROWS;
  const column = (field: ProjectImportField) => mapping.indexOf(field);
  const cellsOf = (row: string[]) =>
    Object.fromEntries(
      PROJECT_IMPORT_FIELDS.map((field) => {
        const index = column(field);
        return [field, index >= 0 ? (row[index] ?? "").trim() : ""];
      }),
    ) as Record<ProjectImportField, string>;

  const portfolioByName = new Map(refs.portfolios.map((p) => [key(p.name), p]));
  const phaseByName = new Map(
    refs.phases.flatMap((phase) => [
      [key(phase.name), phase],
      [key(phase.shortName), phase],
      [String(phase.index + 1), phase],
    ]),
  );
  const people = (value: string) =>
    refs.people.filter(
      (p) => key(p.name) === key(value) || (p.email && key(p.email) === key(value)),
    );
  const existing = new Set(refs.codes.map((code) => code.toUpperCase()));
  const allCells = body.map(cellsOf);
  // Generated codes avoid every code already used and every code the file supplies.
  const taken = new Set([
    ...existing,
    ...allCells.map((cells) => cells.Code.toUpperCase()).filter(Boolean),
  ]);
  const seen = new Set<string>();

  const rows = allCells.map((cells, index): ValidatedProjectRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!cells.Name) errors.push("Name is missing");

    let code = cells.Code.toUpperCase();
    const codeSuggested = !code;
    if (code) {
      if (!CODE_PATTERN.test(code))
        errors.push(`Code "${cells.Code}" must be 2–10 letters or digits`);
      else if (existing.has(code)) errors.push(`Code ${code} is already used`);
      else if (seen.has(code)) errors.push(`Code ${code} appears more than once in the file`);
      seen.add(code);
    } else if (cells.Name) {
      code = suggestProjectCode(cells.Name, taken);
      taken.add(code);
    }

    let programmeId: string | null = null;
    let portfolioId: string | null = null;
    const portfolio = cells.Portfolio ? portfolioByName.get(key(cells.Portfolio)) : undefined;
    if (cells.Portfolio && !portfolio) errors.push(`Unknown portfolio "${cells.Portfolio}"`);
    if (cells.Programme) {
      let matches = refs.programmes.filter((p) => key(p.name) === key(cells.Programme));
      if (matches.length > 1 && portfolio)
        matches = matches.filter((p) => p.portfolioId === portfolio.id);
      if (!matches.length) errors.push(`Unknown programme "${cells.Programme}"`);
      else if (matches.length > 1)
        errors.push(
          `Programme "${cells.Programme}" is in more than one portfolio; add the portfolio`,
        );
      else {
        programmeId = matches[0]!.id;
        if (portfolio && portfolio.id !== matches[0]!.portfolioId)
          warnings.push(
            `Programme "${cells.Programme}" is not in portfolio "${cells.Portfolio}"; the programme's portfolio is used`,
          );
      }
    } else if (portfolio) portfolioId = portfolio.id;
    else if (!cells.Portfolio) errors.push("A programme or a portfolio is needed");

    let phaseId: string | null = null;
    if (cells.Phase) {
      const phase = phaseByName.get(key(cells.Phase));
      if (phase) phaseId = phase.id;
      else errors.push(`Unknown phase "${cells.Phase}"`);
    }

    const tier = cells.Tier ? tierValues.get(key(cells.Tier)) : "medium";
    if (!tier) errors.push(`Unknown tier "${cells.Tier}"`);
    const state = cells.State ? stateValues.get(key(cells.State)) : "active";
    if (!state) errors.push(`Unknown state "${cells.State}"`);

    const person = (field: "Manager" | "Sponsor") => {
      const value = cells[field];
      if (!value) return null;
      const matches = people(value);
      if (matches.length === 1) return matches[0]!.id;
      warnings.push(
        matches.length
          ? `${field} "${value}" matches ${matches.length} people; imported unassigned`
          : `${field} "${value}" not found; imported unassigned`,
      );
      return null;
    };
    const managerId = person("Manager");
    const sponsorId = person("Sponsor");

    const date = (field: "Start" | "Finish") => {
      if (!cells[field]) return null;
      const parsed = parseImportDate(cells[field], dateFormat);
      if (!parsed) errors.push(`${field} "${cells[field]}" is not a valid date`);
      return parsed;
    };
    const startDate = date("Start");
    const finishDate = date("Finish");
    if (startDate && finishDate && finishDate < startDate) errors.push("Finish is before start");

    return {
      line: index + 1,
      cells,
      errors,
      warnings,
      values:
        errors.length || !tier || !state
          ? null
          : {
              code,
              codeSuggested,
              name: cells.Name,
              programmeId,
              portfolioId,
              phaseId,
              tier,
              state,
              managerId,
              sponsorId,
              startDate,
              finishDate,
            },
    };
  });
  return {
    rows,
    tooMany,
    valid: tooMany ? [] : rows.flatMap((row) => (row.values ? [row.values] : [])),
  };
}

/**
 * Insert the validated projects in one request: all are saved or, on any failure, none.
 * New projects only; existing ones are never updated.
 */
export async function importProjects(rows: ProjectImportValues[]): Promise<number> {
  if (rows.length > MAX_IMPORT_ROWS)
    throw new ServiceError("invalid", `An import takes at most ${MAX_IMPORT_ROWS} projects.`);
  const written = await insertRows(
    "projects",
    rows.map(
      (row) =>
        ({
          code: row.code,
          name: row.name,
          // A project under a programme takes its portfolio from the programme.
          ...(row.programmeId
            ? { programme_id: row.programmeId }
            : { portfolio_id: row.portfolioId }),
          phase_id: row.phaseId,
          tier: row.tier,
          state: row.state,
          priority: "moderate",
          manager_id: row.managerId,
          sponsor_id: row.sponsorId,
          start_date: row.startDate,
          finish_date: row.finishDate,
          baseline_finish_date: row.finishDate,
        }) as NewRow<"projects">,
    ),
    "Importing projects",
  );
  return written.length;
}
