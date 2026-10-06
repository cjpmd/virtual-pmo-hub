// Month and money arithmetic shared by the financials screens. Pure, so it is unit-tested,
// and written to agree with v_project_financials: months up to and including the cut-off
// count actuals, later months count forecast, and EAC = actual to date + forecast remaining.
// Months are ISO dates on the 1st ("2026-03-01").

export type FinancialKind = "budget" | "actual" | "forecast";

export interface MonthValue {
  costLineId: string;
  periodMonth: string;
  kind: FinancialKind;
  amount: number;
}

/** First of the month for an ISO date (or a Date), as YYYY-MM-01. */
export function monthOf(value: string | Date): string {
  if (typeof value === "string") return `${value.slice(0, 7)}-01`;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-01`;
}

export function addMonths(month: string, count: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + count;
  const y = year + Math.floor(index / 12);
  const m = ((index % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Every month from `from` to `to`, inclusive (empty when `to` is before `from`). */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = monthOf(from); month <= monthOf(to); month = addMonths(month, 1))
    months.push(month);
  return months;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface Totals {
  budgetPhased: number;
  actualToDate: number;
  actualOpenMonths: number;
  forecastRemaining: number;
  eac: number;
}

/** The view's sums, from the monthly values and the organisation's cut-off month. */
export function summarise(values: MonthValue[], actualsThrough: string): Totals {
  let budgetPhased = 0;
  let actualToDate = 0;
  let actualOpenMonths = 0;
  let forecastRemaining = 0;
  for (const value of values) {
    if (value.kind === "budget") budgetPhased += value.amount;
    else if (value.kind === "actual") {
      if (value.periodMonth <= actualsThrough) actualToDate += value.amount;
      else actualOpenMonths += value.amount;
    } else if (value.periodMonth > actualsThrough) forecastRemaining += value.amount;
  }
  return {
    budgetPhased: round2(budgetPhased),
    actualToDate: round2(actualToDate),
    actualOpenMonths: round2(actualOpenMonths),
    forecastRemaining: round2(forecastRemaining),
    eac: round2(actualToDate + forecastRemaining),
  };
}

export interface SeriesPoint {
  month: string;
  budget: number;
  actual: number;
  forecast: number;
  /** Running total of the budget phasing. */
  cumulativeBudget: number;
  /** Running total of actuals, up to the cut-off only (null afterwards). */
  cumulativeActual: number | null;
  /** The EAC path: actuals up to the cut-off, then forecast (null before the cut-off). */
  cumulativeForecast: number | null;
}

/** Monthly and cumulative figures for the chart, over the given months. */
export function monthlySeries(
  values: MonthValue[],
  actualsThrough: string,
  months: string[],
): SeriesPoint[] {
  const byMonth = new Map<string, { budget: number; actual: number; forecast: number }>();
  for (const value of values) {
    const entry = byMonth.get(value.periodMonth) ?? { budget: 0, actual: 0, forecast: 0 };
    entry[value.kind] += value.amount;
    byMonth.set(value.periodMonth, entry);
  }
  // Values outside the window still count towards the running totals.
  const first = months[0] ?? "";
  let budget = 0;
  let actual = 0;
  let forecast = 0;
  for (const [month, entry] of byMonth) {
    if (month >= first) continue;
    budget += entry.budget;
    if (month <= actualsThrough) actual += entry.actual;
    else forecast += entry.forecast;
  }
  return months.map((month) => {
    const entry = byMonth.get(month) ?? { budget: 0, actual: 0, forecast: 0 };
    budget += entry.budget;
    if (month <= actualsThrough) actual += entry.actual;
    else forecast += entry.forecast;
    return {
      month,
      budget: round2(entry.budget),
      actual: round2(entry.actual),
      forecast: round2(entry.forecast),
      cumulativeBudget: round2(budget),
      cumulativeActual: month <= actualsThrough ? round2(actual) : null,
      cumulativeForecast: month >= actualsThrough ? round2(actual + forecast) : null,
    };
  });
}

/**
 * The months the grid shows: the project's dates, widened to include every month that has a
 * value and the cut-off, so nothing entered is ever hidden.
 */
export function gridMonths(
  values: MonthValue[],
  startDate: string | null,
  finishDate: string | null,
  actualsThrough: string,
): string[] {
  const candidates = [actualsThrough, ...values.map((value) => value.periodMonth)];
  if (startDate) candidates.push(monthOf(startDate));
  if (finishDate) candidates.push(monthOf(finishDate));
  const sorted = candidates.sort();
  const from = startDate ? sorted[0]! : addMonths(sorted[0]!, -2);
  const to = finishDate ? sorted[sorted.length - 1]! : addMonths(sorted[sorted.length - 1]!, 12);
  return monthRange(from, to);
}

export interface PeriodState {
  periodMonth: string;
  closed: boolean;
}

/**
 * The month the PMO can close next: the one after the latest closed month, provided it has
 * ended. With nothing closed yet, the previous calendar month. Null when it hasn't ended.
 */
export function nextMonthToClose(periods: PeriodState[], todayIso: string): string | null {
  const current = monthOf(todayIso);
  const closed = periods
    .filter((period) => period.closed)
    .map((period) => period.periodMonth)
    .sort();
  const latest = closed[closed.length - 1];
  const next = latest ? addMonths(latest, 1) : addMonths(current, -1);
  return next < current ? next : null;
}

/** The latest closed month, the only one that can be reopened. */
export function latestClosedMonth(periods: PeriodState[]): string | null {
  const closed = periods
    .filter((period) => period.closed)
    .map((period) => period.periodMonth)
    .sort();
  return closed[closed.length - 1] ?? null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A month from what finance systems export: 2026-03-14, 2026-03, 14/03/2026 (UK order),
 * 03/2026, Mar 2026, March-26. Returns YYYY-MM-01, or null when it can't be read.
 */
export function parseMonth(text: string): string | null {
  const value = text.trim();
  const build = (year: number, month: number) =>
    month >= 1 && month <= 12 && year >= 1900 && year <= 2200
      ? `${year}-${String(month).padStart(2, "0")}-01`
      : null;
  let match = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[T ].*)?$/.exec(value);
  if (match) return build(Number(match[1]), Number(match[2]));
  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value);
  if (match) {
    const day = Number(match[1]);
    if (day < 1 || day > 31) return null;
    const year = Number(match[3]);
    return build(year < 100 ? 2000 + year : year, Number(match[2]));
  }
  match = /^(\d{1,2})[/.-](\d{4})$/.exec(value);
  if (match) return build(Number(match[2]), Number(match[1]));
  match = /^([A-Za-z]{3,9})[\s\-/.,]+(\d{2}|\d{4})$/.exec(value);
  if (match) {
    const index = MONTHS.indexOf(match[1]!.slice(0, 3).toLowerCase());
    const year = Number(match[2]);
    if (index < 0) return null;
    return build(year < 100 ? 2000 + year : year, index + 1);
  }
  return null;
}

/**
 * An amount as exported: currency symbols, thousands separators, spaces, a leading minus or
 * accounting brackets for a credit ("(1,250.00)"), a trailing "CR". Null when unreadable.
 */
export function parseAmount(text: string): number | null {
  let value = text.trim().replace(/[£$€\s,]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (/cr$/i.test(value)) {
    negative = true;
    value = value.slice(0, -2);
  }
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) >= 1e12) return null;
  return round2(negative ? -amount : amount);
}
