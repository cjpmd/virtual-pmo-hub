// Month grids and date reading for the board Calendar view (work package 1.4). Pure functions
// on calendar dates (YYYY-MM-DD strings), so no time zone or daylight-saving shift can move a
// date: "today" comes from todayIso() in the organisation's time zone.

export interface CalendarDay {
  /** YYYY-MM-DD */
  iso: string;
  day: number;
  /** False for the leading and trailing days of the neighbouring months. */
  inMonth: boolean;
}

const pad = (value: number) => String(value).padStart(2, "0");
const isoOf = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
/** 0 = Sunday … 6 = Saturday. */
const weekdayOf = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).getUTCDay();

/**
 * A calendar date as YYYY-MM-DD from the board's DD/MM/YYYY or an ISO date (time ignored).
 * Null for blanks, placeholders such as "—", and dates that don't exist (31/02/2026).
 */
export function toIsoDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(text);
  const display = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : display
      ? [Number(display[3]), Number(display[2]), Number(display[1])]
      : [0, 0, 0];
  if (!year || month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;
  return isoOf(year, month, day);
}

/** The year and month (1–12) `delta` months away. */
export function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * The month as whole weeks starting on `weekStart` (0 = Sunday, 1 = Monday, …): the month's
 * days plus the neighbouring months' days that fill its first and last weeks.
 */
export function monthGrid(year: number, month: number, weekStart: number): CalendarDay[] {
  const lead = (weekdayOf(year, month, 1) - weekStart + 7) % 7;
  const length = daysIn(year, month);
  const cells = Math.ceil((lead + length) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, 1 - lead + index));
    const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    return { iso: isoOf(y, m, d), day: d, inMonth: m === month };
  });
}

/** Weekday names in grid order, starting on `weekStart`. */
export function weekdayLabels(weekStart: number, names: readonly string[]) {
  return Array.from({ length: 7 }, (_, index) => names[(weekStart + index) % 7]!);
}
