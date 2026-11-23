// Efficiency / savings scheme import (NHS-4 part 5): a trust's scheme list and its monthly values,
// from CSV or XLSX. Two imports, both upload → map columns → preview → save (all or none):
//
// - Schemes: one row per new scheme. Existing schemes are never changed (as the project import,
//   1.1). The database assigns refs. Stages from Fully developed on need a delivery plan and
//   planned values first (the database's stage rules), so those rows come in at Plan in progress
//   with a warning; move them on from the board once their values are in.
// - Monthly values: one row per scheme, month and kind ("long"), or one row per scheme with a
//   column per month ("wide", as most trust spreadsheets are). A scheme is found by its ref, else
//   by its exact title. Months that already hold a value for that kind are refused (change them
//   on the scheme's phasing grid, which keeps the optimistic-concurrency check), so an import only
//   ever adds values.
//
// Validation is pure and unit-tested; saving is one insert request per import (PostgREST runs it
// as one statement, so every row is saved or none). RLS and the database's triggers check
// everything again.
import { supabase } from "@/integrations/supabase/client";
import {
  CONFIDENCES,
  CONFIDENCE_LABELS,
  RECURRENCE_LABELS,
  SAVINGS_TYPE_LABELS,
  STAGES,
  STAGE_LABELS,
  financialYearMonths,
  stageRank,
  type Confidence,
  type EfficiencyStage,
  type Recurrence,
  type SavingsType,
  type ValueKind,
} from "@/data/efficiency";
import { toCsv } from "@/lib/csv";
import type { NewRow } from "./db";
import { ServiceError, unwrap } from "./service-error";
import { insertRows } from "./write";

/** Most rows one import takes (schemes, or value rows before a wide file is split by month). */
export const MAX_SCHEME_IMPORT_ROWS = 500;
/** Most values one import saves. */
export const MAX_VALUE_IMPORT_VALUES = 6000;

const key = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const loose = (value: string) => key(value).replace(/[^a-z0-9]/g, "");

// ---- Months and amounts ------------------------------------------------------------------------

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const monthNumber = (word: string): number | null => {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return null;
  const index = MONTHS.findIndex((m) => m.startsWith(w) || (w === "sept" && m === "september"));
  return index >= 0 ? index + 1 : null;
};
const iso = (year: number, month: number) =>
  year >= 2000 && year <= 2100 && month >= 1 && month <= 12
    ? `${year}-${String(month).padStart(2, "0")}-01`
    : null;
const fullYear = (text: string) => {
  const n = Number(text);
  return text.length <= 2 ? 2000 + n : n;
};

/**
 * A month (first day, YYYY-MM-DD) from what a spreadsheet holds: "2026-04", "2026-04-01",
 * "01/04/2026" (UK day first), "04/2026", "Apr 2026", "April-26", an Excel date serial (46113),
 * or, given the financial year being imported, a bare month name ("Apr"). Null when unreadable.
 */
export function parseImportMonth(
  text: string,
  year?: { financialYear: number; startMonth: number },
): string | null {
  const t = text.trim();
  if (!t) return null;
  // Excel date serial (days since 30/12/1899); 20000–80000 covers 1954–2119.
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const serial = Math.floor(Number(t));
    if (serial < 20000 || serial > 80000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return iso(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }
  let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[T ].*)?$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) return iso(fullYear(m[3]!), Number(m[2]));
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return iso(Number(m[2]), Number(m[1]));
  m = /^([a-z]+\.?)[\s/'’-]*(\d{2}|\d{4})$/i.exec(t);
  if (m) {
    const month = monthNumber(m[1]!);
    return month ? iso(fullYear(m[2]!), month) : null;
  }
  m = /^(\d{4})[\s/-]*([a-z]+)$/i.exec(t);
  if (m) {
    const month = monthNumber(m[2]!);
    return month ? iso(Number(m[1]), month) : null;
  }
  if (year && /^[a-z]+\.?$/i.test(t)) {
    const month = monthNumber(t);
    if (!month) return null;
    return (
      financialYearMonths(year.financialYear, year.startMonth).find(
        (d) => Number(d.slice(5, 7)) === month,
      ) ?? null
    );
  }
  return null;
}

/**
 * An amount: "£1,250.50", "1250", "(1,250)" (negative), "-", "" (zero). Spreadsheet numbers with
 * more decimals are rounded to pence. Null when it isn't a number or is out of range.
 */
export function parseImportAmount(text: string): number | null {
  let cleaned = text.replace(/[£€$,\s]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned === "" || cleaned === "-") return 0;
  if (!/^-?(\d+(\.\d*)?|\.\d+)(e-?\d+)?$/i.test(cleaned)) return null;
  const value = Math.round(Number(cleaned) * 100) / 100;
  if (!Number.isFinite(value) || Math.abs(value) >= 1e12) return null;
  return negative ? -value : value;
}

/** A value kind from a cell or header word ("Plan", "Planned", "Forecast", "Actuals"). */
export function parseValueKind(text: string): ValueKind | null {
  const t = loose(text);
  if (/^(plan|planned|budget)$/.test(t)) return "plan";
  if (/^(forecast|fcst|fc|forecasted)$/.test(t)) return "forecast";
  if (/^(actual|actuals|act)$/.test(t)) return "actual";
  return null;
}

// ---- Schemes -----------------------------------------------------------------------------------

export const SCHEME_IMPORT_FIELDS = [
  "Title",
  "Description",
  "Unit",
  "Category",
  "Savings type",
  "Recurrence",
  "Stage",
  "Confidence",
  "Executive lead",
  "Scheme lead",
  "Finance lead",
  "Start month",
  "Full-year effect",
  "Delivery plan",
  "Ref",
] as const;
export type SchemeImportField = (typeof SCHEME_IMPORT_FIELDS)[number];
export type SchemeMappingTarget = SchemeImportField | "Ignore";

/** The template: the scheme fields (no Ref: the database assigns it) and no rows. */
export const schemeImportTemplate = () =>
  toCsv(
    SCHEME_IMPORT_FIELDS.filter((f) => f !== "Ref"),
    [],
  );

/** The field a header maps to by default. Template headers map exactly. */
export function guessSchemeField(header: string): SchemeMappingTarget {
  const cleaned = key(header);
  const exact = SCHEME_IMPORT_FIELDS.find((f) => key(f) === cleaned);
  if (exact) return exact;
  if (/^(ref|reference|id|scheme id|scheme ref|cip ref|cip id|no\.?|number)$/.test(cleaned))
    return "Ref";
  if (cleaned.includes("full year") || /\bfye\b/.test(cleaned)) return "Full-year effect";
  if (cleaned.includes("executive") || cleaned.includes("exec") || cleaned.includes("sro"))
    return "Executive lead";
  if (cleaned.includes("finance")) return "Finance lead";
  if (cleaned.includes("lead") || cleaned.includes("owner")) return "Scheme lead";
  if (cleaned.includes("confidence") || cleaned.includes("planning category")) return "Confidence";
  if (cleaned.includes("stage") || cleaned.includes("status") || cleaned.includes("gateway"))
    return "Stage";
  if (cleaned.includes("recurr")) return "Recurrence";
  if (cleaned.includes("type") || cleaned.includes("pay")) return "Savings type";
  if (cleaned.includes("categ") || cleaned.includes("theme")) return "Category";
  if (/(unit|division|directorate|care group|department|service)/.test(cleaned)) return "Unit";
  if (cleaned.includes("start")) return "Start month";
  if (cleaned.includes("plan") && !cleaned.includes("planned")) return "Delivery plan";
  if (cleaned.includes("descr") || cleaned.includes("detail") || cleaned.includes("summary"))
    return "Description";
  if (/(title|name|scheme)/.test(cleaned)) return "Title";
  return "Ignore";
}

export interface SchemeImportRefs {
  /** Schemes the person can see (to refuse existing refs and warn on repeated titles). */
  schemes: { ref: string; title: string }[];
  people: { id: string; name: string }[];
  categories: { value: string; label: string }[];
  /** The organisation's 'business_unit' list. */
  units: string[];
}

export interface SchemeImportValues {
  title: string;
  description: string | null;
  businessUnit: string | null;
  category: string | null;
  savingsType: SavingsType;
  recurrence: Recurrence;
  stage: EfficiencyStage;
  confidence: Confidence | null;
  executiveLeadId: string | null;
  schemeLeadId: string | null;
  financeLeadId: string | null;
  startMonth: string | null;
  fullYearEffect: number | null;
  deliveryPlan: string | null;
}

export interface ValidatedSchemeRow {
  rowNumber: number;
  title: string;
  values: SchemeImportValues | null;
  errors: string[];
  warnings: string[];
}

export interface SchemeImportValidation {
  rows: ValidatedSchemeRow[];
  valid: SchemeImportValues[];
  tooMany: boolean;
}

/** Highest stage an imported scheme can start at (the stage rules check plan and values). */
export const IMPORT_STAGE_CAP: EfficiencyStage = "plan_in_progress";

const labelMatch = <T extends string>(
  value: string,
  options: readonly T[],
  labels: Record<T, string>,
  extra: Record<string, T> = {},
): T | null => {
  const v = loose(value);
  return options.find((o) => loose(o) === v || loose(labels[o]) === v) ?? extra[v] ?? null;
};

const SAVINGS_ALIASES: Record<string, SavingsType> = {
  nonpay: "non_pay",
  nonpayroll: "non_pay",
  pay: "pay",
  payroll: "pay",
  workforce: "pay",
  income: "income",
  revenue: "income",
};
const RECURRENCE_ALIASES: Record<string, Recurrence> = {
  r: "recurrent",
  rec: "recurrent",
  yes: "recurrent",
  y: "recurrent",
  nr: "non_recurrent",
  nonrec: "non_recurrent",
  no: "non_recurrent",
  n: "non_recurrent",
  oneoff: "non_recurrent",
  both: "mixed",
};
const STAGE_ALIASES: Record<string, EfficiencyStage> = {
  pipeline: "idea",
  planinprogress: "plan_in_progress",
  plansinprogress: "plan_in_progress",
  planning: "plan_in_progress",
  developed: "fully_developed",
  delivery: "in_delivery",
  indelivery: "in_delivery",
  delivered: "delivered",
  closed: "delivered",
  complete: "delivered",
  completed: "delivered",
  onhold: "on_hold",
  hold: "on_hold",
  paused: "on_hold",
  rejected: "rejected",
  stopped: "rejected",
};
const CONFIDENCE_ALIASES: Record<string, Confidence> = {
  fullydevelopedindelivery: "fully_developed_in_delivery",
  fullydevelopeddeliverynotyetstarted: "fully_developed_not_started",
  fullydevelopednotstarted: "fully_developed_not_started",
  planinprogress: "plans_in_progress",
};

/**
 * Check each row against the organisation's lists and people. `mapping` gives, for each column,
 * the field it fills. Rows with errors are left out of `valid`; warnings don't block.
 */
export function validateSchemeRows(
  body: string[][],
  mapping: SchemeMappingTarget[],
  refs: SchemeImportRefs,
): SchemeImportValidation {
  const tooMany = body.length > MAX_SCHEME_IMPORT_ROWS;
  const cellsOf = (row: string[]) =>
    Object.fromEntries(
      SCHEME_IMPORT_FIELDS.map((field) => {
        const index = mapping.indexOf(field);
        return [field, index >= 0 ? (row[index] ?? "").trim() : ""];
      }),
    ) as Record<SchemeImportField, string>;
  const existingRefs = new Map(refs.schemes.map((s) => [key(s.ref), s.ref]));
  const existingTitles = new Set(refs.schemes.map((s) => key(s.title)));
  const unitByName = new Map(refs.units.map((u) => [key(u), u]));
  const categoryOf = (value: string) =>
    refs.categories.find((c) => key(c.value) === key(value) || key(c.label) === key(value));
  const seenTitles = new Set<string>();

  const rows = body.map((row, index): ValidatedSchemeRow => {
    const cells = cellsOf(row);
    const errors: string[] = [];
    const warnings: string[] = [];
    const title = cells.Title;
    if (!title) errors.push("Title is required.");
    else if (title.length > 300) errors.push("Title is longer than 300 characters.");
    if (cells.Description.length > 10000) errors.push("Description is too long.");
    if (cells["Delivery plan"].length > 10000) errors.push("Delivery plan is too long.");

    if (cells.Ref) {
      const existing = existingRefs.get(key(cells.Ref));
      if (existing) errors.push(`${existing} already exists. This import adds new schemes only.`);
      else warnings.push("Ref is ignored: new schemes are numbered automatically.");
    }
    if (title) {
      if (existingTitles.has(key(title))) warnings.push("A scheme with this title already exists.");
      if (seenTitles.has(key(title)))
        warnings.push("This title appears more than once in the file.");
      seenTitles.add(key(title));
    }

    let businessUnit: string | null = null;
    if (cells.Unit) {
      businessUnit = unitByName.get(key(cells.Unit)) ?? null;
      if (!businessUnit) errors.push(`Unknown unit "${cells.Unit}" (add it in Settings › Lists).`);
    }
    let category: string | null = null;
    if (cells.Category) {
      category = categoryOf(cells.Category)?.value ?? null;
      if (!category)
        errors.push(`Unknown category "${cells.Category}" (add it in Settings › Lists).`);
    }
    let savingsType: SavingsType = "non_pay";
    if (cells["Savings type"]) {
      const v = labelMatch(
        cells["Savings type"],
        ["pay", "non_pay", "income"] as const,
        SAVINGS_TYPE_LABELS,
        SAVINGS_ALIASES,
      );
      if (v) savingsType = v;
      else errors.push(`Unknown savings type "${cells["Savings type"]}" (pay, non-pay or income).`);
    }
    let recurrence: Recurrence = "recurrent";
    if (cells.Recurrence) {
      const v = labelMatch(
        cells.Recurrence,
        ["recurrent", "non_recurrent", "mixed"] as const,
        RECURRENCE_LABELS,
        RECURRENCE_ALIASES,
      );
      if (v) recurrence = v;
      else
        errors.push(
          `Unknown recurrence "${cells.Recurrence}" (recurrent, non-recurrent or mixed).`,
        );
    }
    let stage: EfficiencyStage = "idea";
    if (cells.Stage) {
      const v = labelMatch(cells.Stage, STAGES, STAGE_LABELS, STAGE_ALIASES);
      if (!v) errors.push(`Unknown stage "${cells.Stage}".`);
      else if (stageRank(v) > stageRank(IMPORT_STAGE_CAP)) {
        stage = IMPORT_STAGE_CAP;
        warnings.push(
          `Imported at ${STAGE_LABELS[IMPORT_STAGE_CAP]}, not ${STAGE_LABELS[v]}: add its planned values${
            stageRank(v) >= 5 ? ", finance validation and impact assessment" : ""
          }, then move it on.`,
        );
      } else stage = v;
    }
    let confidence: Confidence | null = null;
    if (cells.Confidence) {
      confidence = labelMatch(cells.Confidence, CONFIDENCES, CONFIDENCE_LABELS, CONFIDENCE_ALIASES);
      if (!confidence) errors.push(`Unknown planning confidence "${cells.Confidence}".`);
    }
    const person = (field: "Executive lead" | "Scheme lead" | "Finance lead") => {
      const value = cells[field];
      if (!value) return null;
      const matches = refs.people.filter((p) => key(p.name) === key(value));
      if (matches.length === 1) return matches[0]!.id;
      warnings.push(
        matches.length
          ? `${field} "${value}" matches more than one person; left blank.`
          : `${field} "${value}" isn't a person in the organisation; left blank.`,
      );
      return null;
    };
    const executiveLeadId = person("Executive lead");
    const schemeLeadId = person("Scheme lead");
    const financeLeadId = person("Finance lead");
    let startMonth: string | null = null;
    if (cells["Start month"]) {
      startMonth = parseImportMonth(cells["Start month"]);
      if (!startMonth) errors.push(`Start month "${cells["Start month"]}" isn't a month.`);
    }
    let fullYearEffect: number | null = null;
    if (cells["Full-year effect"]) {
      fullYearEffect = parseImportAmount(cells["Full-year effect"]);
      if (fullYearEffect == null || fullYearEffect < 0) {
        errors.push(
          `Full-year effect "${cells["Full-year effect"]}" isn't an amount of 0 or more.`,
        );
        fullYearEffect = null;
      }
    }

    return {
      rowNumber: index + 2,
      title,
      errors,
      warnings,
      values: errors.length
        ? null
        : {
            title,
            description: cells.Description || null,
            businessUnit,
            category,
            savingsType,
            recurrence,
            stage,
            confidence,
            executiveLeadId,
            schemeLeadId,
            financeLeadId,
            startMonth,
            fullYearEffect,
            deliveryPlan: cells["Delivery plan"] || null,
          },
    };
  });
  return {
    rows,
    valid: tooMany ? [] : rows.flatMap((r) => (r.values ? [r.values] : [])),
    tooMany,
  };
}

// ---- Monthly values ----------------------------------------------------------------------------

/** A column of a values file: a field, or a month (wide files), optionally of one kind. */
export type ValueColumn =
  | { field: "Ignore" | "Scheme" | "Kind" | "Month" | "Recurrent" | "Non-recurrent" | "Amount" }
  | { field: "MonthColumn"; month: string; kind: ValueKind | null };

export const VALUE_FIELDS = [
  "Scheme",
  "Kind",
  "Month",
  "Recurrent",
  "Non-recurrent",
  "Amount",
] as const;

/** The column a header maps to by default: a month header ("Apr-26", "Plan Apr 2026", "Apr"
 *  with the financial year given) becomes a month column. */
export function guessValueColumn(
  header: string,
  year?: { financialYear: number; startMonth: number },
): ValueColumn {
  const cleaned = key(header);
  // A leading or trailing kind word: "Plan Apr-26", "Apr-26 actual".
  const words = header.trim().split(/\s+/);
  let kind: ValueKind | null = null;
  let rest = header.trim();
  if (words.length > 1 && parseValueKind(words[0]!)) {
    kind = parseValueKind(words[0]!);
    rest = words.slice(1).join(" ");
  } else if (words.length > 1 && parseValueKind(words[words.length - 1]!)) {
    kind = parseValueKind(words[words.length - 1]!);
    rest = words.slice(0, -1).join(" ");
  }
  const month = parseImportMonth(rest, year);
  if (month) return { field: "MonthColumn", month, kind };
  if (
    /^(ref|reference|scheme|scheme ref|scheme id|cip ref|title|scheme title|scheme name|name)$/.test(
      cleaned,
    )
  )
    return { field: "Scheme" };
  if (/^(kind|type|value type|measure)$/.test(cleaned)) return { field: "Kind" };
  if (/^(month|period|date)$/.test(cleaned)) return { field: "Month" };
  if (/^non[- ]?recurrent|^nr$/.test(cleaned)) return { field: "Non-recurrent" };
  if (/^recurrent|^r$/.test(cleaned)) return { field: "Recurrent" };
  if (/^(amount|value|saving|savings|£)$/.test(cleaned)) return { field: "Amount" };
  return { field: "Ignore" };
}

export const columnLabel = (column: ValueColumn): string =>
  column.field === "MonthColumn"
    ? `${column.kind ? `${column.kind[0]!.toUpperCase()}${column.kind.slice(1)} ` : ""}${column.month.slice(0, 7)}`
    : column.field;

/** Where a single amount (an Amount or month column) goes. */
export type AmountSplit = "recurrence" | "recurrent" | "non_recurrent";

export interface ValueImportScheme {
  id: string;
  ref: string;
  title: string;
  recurrence: Recurrence;
  /** The person can add values to it (workspace manager or above, not an archived workspace). */
  editable: boolean;
}

export interface ValueImportOptions {
  /** Kind for rows with no Kind column or month-column kind. */
  defaultKind: ValueKind;
  split: AmountSplit;
}

export interface ImportValue {
  schemeId: string;
  month: string;
  kind: ValueKind;
  recurrent: number;
  nonRecurrent: number;
}

export interface ValidatedValueRow {
  rowNumber: number;
  scheme: string;
  values: ImportValue[];
  errors: string[];
  warnings: string[];
}

export interface ValueImportValidation {
  rows: ValidatedValueRow[];
  valid: ImportValue[];
  tooMany: boolean;
}

export const valueKey = (schemeId: string, month: string, kind: ValueKind) =>
  `${schemeId}|${month.slice(0, 7)}|${kind}`;

/** The schemes a values file names (by ref or exact title), for loading their stored values. */
export function referencedSchemes(
  body: string[][],
  columns: ValueColumn[],
  schemes: ValueImportScheme[],
): ValueImportScheme[] {
  const index = columns.findIndex((c) => c.field === "Scheme");
  if (index < 0) return [];
  const names = new Set(body.map((row) => key(row[index] ?? "")));
  return schemes.filter((s) => names.has(key(s.ref)) || names.has(key(s.title)));
}

/**
 * Check a values file. `existing` holds valueKey()s of values already stored. A row with any
 * error saves nothing; blank and zero month cells in a wide file are skipped.
 */
export function validateValueRows(
  body: string[][],
  columns: ValueColumn[],
  schemes: ValueImportScheme[],
  existing: Set<string>,
  options: ValueImportOptions,
): ValueImportValidation {
  const at = (field: string) => columns.findIndex((c) => c.field === field);
  const col = {
    scheme: at("Scheme"),
    kind: at("Kind"),
    month: at("Month"),
    recurrent: at("Recurrent"),
    nonRecurrent: at("Non-recurrent"),
    amount: at("Amount"),
  };
  const monthColumns = columns.flatMap((c, i) =>
    c.field === "MonthColumn" ? [{ index: i, month: c.month, kind: c.kind }] : [],
  );
  const byRef = new Map(schemes.map((s) => [key(s.ref), s]));
  const byTitle = new Map<string, ValueImportScheme[]>();
  for (const s of schemes) byTitle.set(key(s.title), [...(byTitle.get(key(s.title)) ?? []), s]);
  const seen = new Set<string>();
  const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");
  const fileErrors: string[] = [];
  if (col.scheme < 0) fileErrors.push("Map a column to Scheme (its ref or title).");
  if (col.month < 0 && !monthColumns.length)
    fileErrors.push("Map a Month column, or use month headings (Apr-26, May-26, …).");
  if (col.month >= 0 && col.recurrent < 0 && col.nonRecurrent < 0 && col.amount < 0)
    fileErrors.push("Map an Amount, Recurrent or Non-recurrent column.");

  const rows = body.map((row, index): ValidatedValueRow => {
    const errors: string[] = [...fileErrors];
    const warnings: string[] = [];
    const name = cell(row, col.scheme);
    let scheme: ValueImportScheme | null = null;
    if (!fileErrors.length) {
      if (!name) errors.push("Scheme is blank.");
      else {
        scheme = byRef.get(key(name)) ?? null;
        if (!scheme) {
          const titled = byTitle.get(key(name)) ?? [];
          if (titled.length === 1) scheme = titled[0]!;
          else if (titled.length > 1)
            errors.push(`More than one scheme is called "${name}"; use its ref.`);
          else errors.push(`No scheme with ref or title "${name}".`);
        }
        if (scheme && !scheme.editable)
          errors.push(`You can't add values to ${scheme.ref} (workspace managers and above can).`);
      }
    }
    let rowKind: ValueKind | null = null;
    const kindText = cell(row, col.kind);
    if (kindText) {
      rowKind = parseValueKind(kindText);
      if (!rowKind) errors.push(`Unknown kind "${kindText}" (plan, forecast or actual).`);
    }

    const split = (amount: number): [number, number] => {
      const target =
        options.split === "recurrence"
          ? scheme?.recurrence === "non_recurrent"
            ? "non_recurrent"
            : "recurrent"
          : options.split;
      return target === "non_recurrent" ? [0, amount] : [amount, 0];
    };
    const amountOf = (text: string, label: string): number | null => {
      const value = parseImportAmount(text);
      if (value == null) errors.push(`${label}: "${text}" isn't an amount.`);
      return value;
    };

    const found: ImportValue[] = [];
    const add = (month: string, kind: ValueKind, recurrent: number, nonRecurrent: number) => {
      if (!scheme) return;
      const k = valueKey(scheme.id, month, kind);
      const label = `${kind} ${month.slice(0, 7)}`;
      if (seen.has(k)) errors.push(`${scheme.ref} ${label} appears more than once in the file.`);
      else if (existing.has(k))
        errors.push(
          `${scheme.ref} already has a ${label} value; change it on the scheme's phasing grid.`,
        );
      else found.push({ schemeId: scheme.id, month, kind, recurrent, nonRecurrent });
    };

    if (!fileErrors.length && col.month >= 0) {
      const monthText = cell(row, col.month);
      const month = parseImportMonth(monthText);
      if (!month) errors.push(`Month "${monthText}" isn't a month.`);
      let recurrent = 0;
      let nonRecurrent = 0;
      if (col.recurrent >= 0 || col.nonRecurrent >= 0) {
        recurrent = amountOf(cell(row, col.recurrent), "Recurrent") ?? 0;
        nonRecurrent = amountOf(cell(row, col.nonRecurrent), "Non-recurrent") ?? 0;
      }
      if (col.amount >= 0) {
        const amount = amountOf(cell(row, col.amount), "Amount") ?? 0;
        const [r, n] = split(amount);
        recurrent += r;
        nonRecurrent += n;
      }
      if (month) add(month, rowKind ?? options.defaultKind, recurrent, nonRecurrent);
    } else if (!fileErrors.length) {
      for (const mc of monthColumns) {
        const text = cell(row, mc.index);
        if (!text) continue;
        const amount = amountOf(text, mc.month.slice(0, 7));
        if (!amount) continue;
        const [r, n] = split(amount);
        add(mc.month, mc.kind ?? rowKind ?? options.defaultKind, r, n);
      }
      if (!errors.length && !found.length) warnings.push("No amounts on this row.");
    }

    // A row that fails saves nothing, but its months are still "seen" so a later duplicate
    // row is reported against this one.
    for (const v of found) seen.add(valueKey(v.schemeId, v.month, v.kind));
    return {
      rowNumber: index + 2,
      scheme: scheme ? `${scheme.ref} · ${scheme.title}` : name,
      values: errors.length ? [] : found,
      errors,
      warnings,
    };
  });
  const valid = rows.flatMap((r) => r.values);
  const tooMany = body.length > MAX_SCHEME_IMPORT_ROWS || valid.length > MAX_VALUE_IMPORT_VALUES;
  return { rows, valid: tooMany ? [] : valid, tooMany };
}

/** The values template: the long layout. */
export const valueImportTemplate = () =>
  toCsv(["Scheme", "Kind", "Month", "Recurrent", "Non-recurrent"], []);

// ---- Loading and saving ------------------------------------------------------------------------

/** valueKey()s of the values already stored for these schemes. */
export async function loadExistingValueKeys(schemeIds: string[]): Promise<Set<string>> {
  const keys = new Set<string>();
  for (let i = 0; i < schemeIds.length; i += 50) {
    const rows = unwrap(
      await supabase
        .from("efficiency_values")
        .select("scheme_id, month, kind")
        .in("scheme_id", schemeIds.slice(i, i + 50))
        .range(0, 9999),
      "Couldn't load the stored values",
    );
    for (const r of rows) keys.add(valueKey(r.scheme_id, r.month, r.kind as ValueKind));
  }
  return keys;
}

/** Insert the validated schemes into one workspace in one request: all or none. */
export async function importSchemes(
  workspaceId: string,
  rows: SchemeImportValues[],
): Promise<number> {
  if (rows.length > MAX_SCHEME_IMPORT_ROWS)
    throw new ServiceError("invalid", `An import takes at most ${MAX_SCHEME_IMPORT_ROWS} schemes.`);
  const written = await insertRows(
    "efficiency_schemes",
    rows.map(
      (r) =>
        ({
          // The tenant guard fills organisation_id from the workspace.
          workspace_id: workspaceId,
          title: r.title,
          description: r.description,
          business_unit: r.businessUnit,
          category: r.category,
          savings_type: r.savingsType,
          recurrence: r.recurrence,
          stage: r.stage,
          confidence: r.confidence,
          executive_lead_id: r.executiveLeadId,
          scheme_lead_id: r.schemeLeadId,
          finance_lead_id: r.financeLeadId,
          start_month: r.startMonth,
          full_year_effect: r.fullYearEffect,
          delivery_plan: r.deliveryPlan,
        }) as unknown as NewRow<"efficiency_schemes">,
    ),
    "Couldn't import the schemes",
  );
  return written.length;
}

/** Insert the validated values in one request: all or none. New values only. */
export async function importValues(values: ImportValue[]): Promise<number> {
  if (values.length > MAX_VALUE_IMPORT_VALUES)
    throw new ServiceError("invalid", `An import takes at most ${MAX_VALUE_IMPORT_VALUES} values.`);
  const written = await insertRows(
    "efficiency_values",
    values.map(
      (v) =>
        ({
          scheme_id: v.schemeId,
          month: v.month,
          kind: v.kind,
          recurrent: v.recurrent,
          non_recurrent: v.nonRecurrent,
        }) as unknown as NewRow<"efficiency_values">,
    ),
    "Couldn't import the values",
  );
  return written.length;
}
