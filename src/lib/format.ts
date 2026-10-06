import { currencyFor, monthNames } from "@/data/settings-data";
import type { AppSettings } from "@/data/settings-types";
import { getSettings, useSettings } from "@/services/settings";

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Dates are held as DD/MM/YYYY throughout the mock data layer. */
export function parseDate(value: string | Date | undefined): Date | undefined {
  if (value instanceof Date) return value;
  if (!value) return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parts = value.split(/[/\s:]/).map(Number);
  const [day, month, year] = parts;
  if (!day || !month || !year) return undefined;
  return new Date(year, month - 1, day);
}

/** Calendar date as stored in the database (YYYY-MM-DD), or undefined when the input is not a full date. */
export function toIsoDate(value: string | Date | undefined): string | undefined {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return undefined;
  if (
    typeof value === "string" &&
    !/^\d{4}-\d{2}-\d{2}/.test(value) &&
    !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value.trim())
  )
    return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Database date (YYYY-MM-DD) as the DD/MM/YYYY string the board and prototype screens hold. */
export function fromIsoDate(value: string | null | undefined): string {
  const iso = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : "";
}

function groupDigits(value: string, separator: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

export function formatNumber(
  value: number,
  settings: AppSettings = getSettings(),
  decimals?: number,
) {
  const places = decimals ?? 0;
  const fixed = Math.abs(value).toFixed(places);
  const [whole = "0", fraction] = fixed.split(".");
  const { thousandsSeparator, decimalSeparator } = settings.regional;
  const body =
    groupDigits(whole, thousandsSeparator) + (fraction ? decimalSeparator + fraction : "");
  return (value < 0 ? "-" : "") + body;
}

const withSymbol = (body: string, negative: boolean, settings: AppSettings) => {
  const symbol =
    currencyFor(settings.regional.baseCurrency)?.symbol ?? settings.regional.baseCurrency;
  const positioned =
    settings.regional.symbolPosition === "before" ? `${symbol}${body}` : `${body}${symbol}`;
  return negative ? `-${positioned}` : positioned;
};

/** Full currency amount, e.g. £1,250,000 or 1.250.000 € depending on settings. */
export function formatCurrency(
  value: number,
  settings: AppSettings = getSettings(),
  decimalsOverride?: number,
) {
  const decimals = decimalsOverride ?? settings.regional.decimalPlaces;
  return withSymbol(formatNumber(Math.abs(value), settings, decimals), value < 0, settings);
}

/** Compact currency, e.g. £1.2m or £350k. Falls back to the full amount when compact formatting is off. */
export function formatCompactCurrency(value: number, settings: AppSettings = getSettings()) {
  if (!settings.regional.compactFormatting) return formatCurrency(value, settings);
  const magnitude = Math.abs(value);
  const negative = value < 0;
  if (magnitude >= 1_000_000_000)
    return withSymbol(
      `${formatNumber(magnitude / 1_000_000_000, settings, 1)}bn`,
      negative,
      settings,
    );
  if (magnitude >= 1_000_000)
    return withSymbol(
      `${formatNumber(magnitude / 1_000_000, settings, magnitude >= 10_000_000 ? 1 : 2)}m`,
      negative,
      settings,
    );
  if (magnitude >= 1_000)
    return withSymbol(`${formatNumber(magnitude / 1_000, settings, 0)}k`, negative, settings);
  return formatCurrency(value, settings);
}

/** Date in the configured display format. Accepts DD/MM/YYYY, ISO or a Date. */
export function formatDate(
  value: string | Date | undefined,
  settings: AppSettings = getSettings(),
) {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return typeof value === "string" ? value : "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  switch (settings.regional.dateFormat) {
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "D MMM YYYY":
      return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${year}`;
    case "DD.MM.YYYY":
      return `${day}.${month}.${year}`;
    default:
      return `${day}/${month}/${year}`;
  }
}
/** Short day-and-month label used on timeline axes. */
export function formatShortDate(
  value: string | Date | undefined,
  settings: AppSettings = getSettings(),
) {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return "—";
  return settings.regional.dateFormat === "MM/DD/YYYY"
    ? `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`
    : `${String(date.getDate()).padStart(2, "0")} ${SHORT_MONTHS[date.getMonth()]}`;
}

/** Financial year label for a date, honouring the configured start month. */
export function formatFinancialYear(
  value: string | Date | undefined,
  settings: AppSettings = getSettings(),
) {
  const date = parseDate(value) ?? new Date();
  const start = settings.regional.financialYearStartMonth;
  const startYear = date.getMonth() + 1 >= start ? date.getFullYear() : date.getFullYear() - 1;
  return start === 1
    ? `FY ${startYear}`
    : `FY ${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}
export function getFinancialYearRange(
  value: string | Date | undefined,
  settings: AppSettings = getSettings(),
) {
  const date = parseDate(value) ?? new Date();
  const start = settings.regional.financialYearStartMonth;
  const startYear = date.getMonth() + 1 >= start ? date.getFullYear() : date.getFullYear() - 1;
  return {
    start: new Date(startYear, start - 1, 1),
    end: new Date(startYear + 1, start - 1, 0),
    label: formatFinancialYear(date, settings),
  };
}
export const financialYearStartLabel = (settings: AppSettings = getSettings()) =>
  monthNames[settings.regional.financialYearStartMonth - 1] ?? "August";

/** Convert a project amount into the base currency using the rate in force on a date. */
export function convertToBase(
  amount: number,
  currency: string | undefined,
  onDate?: string,
  settings: AppSettings = getSettings(),
) {
  if (!settings.regional.multiCurrency || !currency || currency === settings.regional.baseCurrency)
    return amount;
  const when = parseDate(onDate)?.getTime() ?? Date.now();
  const applicable =
    settings.regional.exchangeRates
      .filter(
        (rate) =>
          rate.currency === currency && (parseDate(rate.effectiveDate)?.getTime() ?? 0) <= when,
      )
      .sort(
        (a, b) =>
          (parseDate(b.effectiveDate)?.getTime() ?? 0) -
          (parseDate(a.effectiveDate)?.getTime() ?? 0),
      )[0] ?? settings.regional.exchangeRates.find((rate) => rate.currency === currency);
  return applicable ? amount * applicable.rate : amount;
}

export const displayUnit = (unit: string, settings: AppSettings = getSettings()) =>
  unit === "currency" ? currencySymbol(settings) : unit;
export const currencySymbol = (settings: AppSettings = getSettings()) =>
  currencyFor(settings.regional.baseCurrency)?.symbol ?? settings.regional.baseCurrency;

/** Formatters bound to the live settings, so a currency change re-renders the component. */
export function useFormat() {
  const settings = useSettings();
  return {
    settings,
    currency: (value: number) => formatCurrency(value, settings),
    compact: (value: number) => formatCompactCurrency(value, settings),
    number: (value: number, decimals?: number) => formatNumber(value, settings, decimals),
    date: (value: string | Date | undefined) => formatDate(value, settings),
    shortDate: (value: string | Date | undefined) => formatShortDate(value, settings),
    financialYear: (value: string | Date | undefined) => formatFinancialYear(value, settings),
    symbol: currencySymbol(settings),
    unit: (unit: string) => displayUnit(unit, settings),
  };
}
