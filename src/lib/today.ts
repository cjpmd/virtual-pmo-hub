// The one source of "today" for the front end (Stage 4 brief). Calendar dates are taken in the
// organisation's time zone, matching the database's org_today(). Every screen moved to Supabase
// uses this; the remaining hardcoded prototype dates are replaced in Stage 4c.
const DEFAULT_TIME_ZONE = "Europe/London";

/** Today's calendar date as YYYY-MM-DD in the given IANA time zone. */
export function todayIso(timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Today as a local Date at midnight (for date arithmetic on calendar dates). */
export function today(timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): Date {
  const [year, month, day] = todayIso(timeZone, now).split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Whole days from today to an ISO date (negative when the date has passed). */
export function daysFromToday(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE,
): number | undefined {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!match) return undefined;
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Math.round((target.getTime() - today(timeZone).getTime()) / 86_400_000);
}
