// Project overview, light working area (Stage 4): the schedule figures and series behind the
// schedule forecast card, MilestoneSlippage, MilestoneDeliveryProfile and HealthByDimension with
// scope = "project". Pure functions over get_project_overview rows; slip days, slip bands and
// every RAG are read as recorded (v_milestones, health_snapshots). The rules here are the ones
// agreed for Stage 2:
//   overdue        not delivered and the forecast date has passed (past_baseline is display only)
//   hit baseline   delivered on time ÷ delivered
//   average slip   mean slip over delivered milestones, on time counting as 0
//   reforecast     not delivered and forecast ≠ baseline
//   forecast range early = forecast date; late = forecast date + the average slip (at least 7 days)
import type { Health } from "@/data/types";
import { isMilestoneDueWithin30 } from "./overview";
import type {
  HealthDimension,
  OpenRaidItem,
  ProjectHealthMonth,
  ProjectOverviewMilestone,
  RiskBand,
} from "./project-overview";

const DAY = 86_400_000;
const dayOf = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const addDays = (iso: string, days: number) =>
  new Date(dayOf(iso) + days * DAY).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthEndOf = (ym: string) => {
  const y = +ym.slice(0, 4),
    m = +ym.slice(5, 7);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const nextMonth = (ym: string) => {
  const y = +ym.slice(0, 4),
    m = +ym.slice(5, 7);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

type Milestone = Pick<
  ProjectOverviewMilestone,
  "baselineDate" | "forecastDate" | "actualDate" | "slipDays" | "slipBand"
>;

/** Slip in days as v_milestones records it (actual if delivered, else forecast, minus baseline). */
const slipOf = (m: Milestone) =>
  m.slipDays ?? (dayOf(m.actualDate ?? m.forecastDate) - dayOf(m.baselineDate)) / DAY;

export const isOverdue = (m: Milestone, today: string) =>
  !m.actualDate && dayOf(m.forecastDate) < dayOf(today);

export interface ScheduleStats {
  total: number;
  delivered: number;
  onTime: number;
  /** Delivered on time ÷ delivered, %; null before anything is delivered. */
  hitBaseline: number | null;
  /** Mean slip over delivered milestones, on time counting as 0; null before any delivery. */
  averageSlip: number | null;
  overdue: number;
  dueNext30: number;
  reforecast: number;
  /** Baselined on or before today. */
  baselinedByNow: number;
  /** Late end of the forecast range, in days after the forecast date (average slip, at least 7). */
  lateDays: number;
}

export function scheduleStats(milestones: Milestone[], today: string): ScheduleStats {
  const delivered = milestones.filter((m) => m.actualDate);
  const onTime = delivered.filter((m) => slipOf(m) <= 0).length;
  const averageSlip = delivered.length
    ? delivered.reduce((sum, m) => sum + Math.max(0, slipOf(m)), 0) / delivered.length
    : null;
  return {
    total: milestones.length,
    delivered: delivered.length,
    onTime,
    hitBaseline: delivered.length ? Math.round((100 * onTime) / delivered.length) : null,
    averageSlip,
    overdue: milestones.filter((m) => isOverdue(m, today)).length,
    dueNext30: milestones.filter((m) => isMilestoneDueWithin30(m, today)).length,
    reforecast: milestones.filter((m) => !m.actualDate && m.forecastDate !== m.baselineDate).length,
    baselinedByNow: milestones.filter((m) => m.baselineDate <= today).length,
    lateDays: Math.max(7, Math.round(averageSlip ?? 0)),
  };
}

// ---- Milestone slippage rows ---------------------------------------------------------

export type SlipBand = "on_time" | "minor" | "material" | "severe";
export const bandOf = (m: Milestone): SlipBand =>
  m.slipBand === "minor" || m.slipBand === "material" || m.slipBand === "severe"
    ? m.slipBand
    : "on_time";

export interface SlipRow {
  id: string;
  title: string;
  /** Phase (or type) + "Delivered dd Mon" / "Forecast dd Mon" / "Past baseline, …" / "Overdue, …". */
  subtitle: string;
  baselineDate: string;
  /** Actual date once delivered, else the forecast. */
  date: string;
  delivered: boolean;
  slip: number;
  band: SlipBand;
}

const dayMonth = (iso: string) => `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1] ?? ""}`;
const typeLabel = (type: string) =>
  (type.charAt(0).toUpperCase() + type.slice(1)).replace(/_/g, " ");

export function slipRows(
  milestones: Array<
    Milestone & Pick<ProjectOverviewMilestone, "id" | "title" | "type" | "phaseName">
  >,
  today: string,
  sort: "date" | "slip",
): SlipRow[] {
  const rows = milestones.map((m) => {
    const where = m.phaseName ?? typeLabel(m.type);
    const when = m.actualDate
      ? `Delivered ${dayMonth(m.actualDate)}`
      : isOverdue(m, today)
        ? `Overdue, forecast ${dayMonth(m.forecastDate)}`
        : m.baselineDate < today
          ? `Past baseline, forecast ${dayMonth(m.forecastDate)}`
          : `Forecast ${dayMonth(m.forecastDate)}`;
    return {
      id: m.id,
      title: m.title,
      subtitle: `${where} · ${when}`,
      baselineDate: m.baselineDate,
      date: m.actualDate ?? m.forecastDate,
      delivered: !!m.actualDate,
      slip: Math.round(slipOf(m)),
      band: bandOf(m),
    };
  });
  return rows.sort((a, b) =>
    sort === "slip"
      ? b.slip - a.slip || a.baselineDate.localeCompare(b.baselineDate)
      : a.baselineDate.localeCompare(b.baselineDate) || a.title.localeCompare(b.title),
  );
}

// ---- Milestone delivery profile --------------------------------------------------------

export interface ProfilePoint {
  period: string; // "Sep 26"
  month: string; // YYYY-MM
  planned: number;
  actual?: number | undefined;
  band?: [number, number] | undefined;
  /** Milestones signed off in this month, and whether any of them was late. */
  signedOff: number;
  late: boolean;
}

export interface DeliveryProfile {
  points: ProfilePoint[];
  todayPeriod: string | undefined;
  plannedToDate: number;
  deliveredToDate: number;
  /** Baselined by now minus signed off (0 when on or ahead of plan). */
  behind: number;
  /** When the last milestone lands, early and late, and the latest baseline. */
  range: { early: string; late: string; baseline: string } | null;
}

/**
 * Cumulative milestones over the project's months: the baselined plan, what has been signed off
 * (to today), and the forecast range after today. A closed project gets no forecast band.
 */
export function deliveryProfile(
  milestones: Milestone[],
  months: string[],
  today: string,
  closed: boolean,
): DeliveryProfile {
  const stats = scheduleStats(milestones, today);
  const thisMonth = today.slice(0, 7);
  const count = (bound: string, read: (m: Milestone) => string | null) =>
    milestones.filter((m) => {
      const value = read(m);
      return value !== null && value <= bound;
    }).length;
  const points = months.map((month): ProfilePoint => {
    const end = monthEndOf(month);
    const planned = count(end, (m) => m.baselineDate);
    const inMonth = milestones.filter((m) => m.actualDate?.slice(0, 7) === month);
    const base = {
      period: `${MONTHS[+month.slice(5, 7) - 1] ?? ""} ${month.slice(2, 4)}`,
      month,
      planned,
      signedOff: month <= thisMonth ? inMonth.length : 0,
      late: inMonth.some((m) => slipOf(m) > 0),
    };
    if (month < thisMonth) return { ...base, actual: count(end, (m) => m.actualDate) };
    const now = count(today, (m) => m.actualDate);
    if (month === thisMonth) return { ...base, actual: now, band: closed ? undefined : [now, now] };
    if (closed) return base;
    const early = count(end, (m) => m.actualDate ?? m.forecastDate);
    const late = count(end, (m) => m.actualDate ?? addDays(m.forecastDate, stats.lateDays));
    return { ...base, band: [late, early] };
  });
  const open = milestones.filter((m) => !m.actualDate);
  const lastForecast = open
    .map((m) => m.forecastDate)
    .sort()
    .at(-1);
  const lastBaseline = milestones
    .map((m) => m.baselineDate)
    .sort()
    .at(-1);
  const deliveredToDate = count(today, (m) => m.actualDate);
  const plannedToDate = count(today, (m) => m.baselineDate);
  return {
    points,
    todayPeriod: points.find((p) => p.month === thisMonth)?.period,
    plannedToDate,
    deliveredToDate,
    behind: Math.max(0, plannedToDate - deliveredToDate),
    range:
      !closed && lastForecast && lastBaseline
        ? {
            early: lastForecast,
            late: addDays(lastForecast, stats.lateDays),
            baseline: lastBaseline,
          }
        : null,
  };
}

/** Months from the first to the last month (YYYY-MM), inclusive. */
export function monthSpan(first: string, last: string) {
  const out: string[] = [];
  for (let m = first; m <= last && out.length < 120; m = nextMonth(m)) out.push(m);
  return out;
}

// ---- Health by dimension -------------------------------------------------------------

const RANK: Record<Health, number> = { "On Track": 0, "At Risk": 1, "Off Track": 2, "Not Set": -1 };

export interface DimensionPoint {
  month: string;
  health: Health;
  /** The report current at that month-end declared better than the evidence. */
  declaredBetter: boolean;
  /** Sample history from the demo seed. */
  sample: boolean;
}

export interface DimensionSeries {
  key: HealthDimension;
  points: DimensionPoint[];
  declaredBetter: number;
  /** Months with a rating (Not Set months are not counted). */
  rated: number;
}

/** One series per dimension: the month-end evidenced RAG and whether the report said better. */
export function dimensionSeries(
  months: ProjectHealthMonth[],
  keys: readonly HealthDimension[],
): DimensionSeries[] {
  return keys.map((key) => {
    const points = months.map((row) => {
      const health = row.evidenced[key];
      const declared = row.declared?.[key];
      return {
        month: row.month,
        health,
        declaredBetter:
          !!declared &&
          health !== "Not Set" &&
          declared !== "Not Set" &&
          RANK[declared] < RANK[health],
        sample: row.source === "seed",
      };
    });
    return {
      key,
      points,
      declaredBetter: points.filter((p) => p.declaredBetter).length,
      rated: points.filter((p) => p.health !== "Not Set").length,
    };
  });
}

// ---- Top risks and issues ------------------------------------------------------------

export interface RankedRaid {
  item: OpenRaidItem;
  /** red | amber | green from the risk's band (organisation risk bands) or the issue severity. */
  level: "red" | "amber" | "green";
  /** The band or severity as worded (e.g. "Critical", "High"). */
  word: string;
  /** Days since the record was last updated (no review history yet). */
  daysSinceUpdate: number;
}

const LEVEL_RANK = { red: 2, amber: 1, green: 0 } as const;

/**
 * Open risks and issues ranked by severity, then by days since last update (oldest first).
 * A risk's severity is its band: the top band is red, the next amber, the rest green. An issue's
 * is its severity: high red, medium amber, low green.
 */
export function rankRaid(
  items: OpenRaidItem[],
  bands: RiskBand[],
  today: string,
  limit = 3,
): RankedRaid[] {
  const ordered = [...bands].sort((a, b) => b.minScore - a.minScore);
  return items
    .map((item): RankedRaid => {
      const days = Math.max(
        0,
        Math.round((dayOf(today) - dayOf(item.updatedAt.slice(0, 10))) / DAY),
      );
      if (item.kind === "issue") {
        const level =
          item.severity === "high" ? "red" : item.severity === "medium" ? "amber" : "green";
        const word = item.severity
          ? item.severity.charAt(0).toUpperCase() + item.severity.slice(1)
          : "Not set";
        return { item, level, word, daysSinceUpdate: days };
      }
      const index = ordered.findIndex((band) => (item.score ?? 0) >= band.minScore);
      const level = index === 0 ? "red" : index === 1 ? "amber" : "green";
      return {
        item,
        level,
        word: ordered[index]?.label ?? `Score ${item.score ?? 0}`,
        daysSinceUpdate: days,
      };
    })
    .sort(
      (a, b) =>
        LEVEL_RANK[b.level] - LEVEL_RANK[a.level] ||
        (b.item.score ?? 0) - (a.item.score ?? 0) ||
        b.daysSinceUpdate - a.daysSinceUpdate,
    )
    .slice(0, limit);
}
