/** Evidence-based forecast engine. Pure functions — every screen, report and roll-up
 *  calls these so the numbers are identical everywhere. Swappable for a Postgres function later. */

export type VelocityBasis = "last" | "rolling3" | "best" | "worst" | "plan";
export type DeliveryStatus = "insufficient_evidence" | "on_track" | "recovering" | "recovering_late" | "slipping" | "not_converging";
export type EvidencedRag = "Green" | "Amber" | "Red" | "Grey";
export type Plausibility = "realistic" | "stretch" | "unrealistic";

export interface ForecastInput {
  /** Start of period 1 (baseline start). */
  baselineStart: Date;
  periodLengthDays: number;
  /** Number of periods in the baseline plan. */
  baselinePeriods: number;
  baselineScope: number;
  /** Completed units per closed period, oldest first. */
  completed: number[];
  /** Total scope at the end of each closed period, oldest first. */
  scopeHistory: number[];
  /** Recovery plan target per period, if the PM set one. */
  planVelocity?: number;
  ragToleranceDays: number;
}
export interface ForecastOverrides { velocity?: number; scopeGrowth?: number }

export interface ForecastResult {
  periodsClosed: number;
  doneNow: number;
  scopeNow: number;
  plannedNow: number;
  plannedRate: number;
  gapUnits: number;
  scopeGrowth: number;
  velocity: number;
  velocities: Record<VelocityBasis, number>;
  basis: VelocityBasis;
  recoveryPeriod: number | null;
  recoveryDate: Date | null;
  finishPeriod: number | null;
  forecastFinishDate: Date | null;
  baselineEndDate: Date;
  daysVsBaseline: number | null;
  requiredVelocity: number | null;
  plausibility: Plausibility;
  converging: boolean;
  deliveryStatus: DeliveryStatus;
  evidencedRag: EvidencedRag;
  range: { worst: Date | null; likely: Date | null; best: Date | null };
  explanation: string;
}

const HORIZON_DAYS = 3 * 365;
const round1 = (value: number) => Math.round(value * 10) / 10;
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

export function periodEnd(input: ForecastInput, period: number) { return addDays(input.baselineStart, period * input.periodLengthDays); }
export function plannedAt(input: ForecastInput, period: number) { return Math.min(input.baselineScope, (period * input.baselineScope) / input.baselinePeriods); }

export function velocitiesOf(input: ForecastInput): Record<VelocityBasis, number> {
  const c = input.completed, last6 = c.slice(-6), last3 = c.slice(-3);
  const plannedRate = input.baselineScope / input.baselinePeriods;
  return {
    last: c.at(-1) ?? 0,
    rolling3: last3.length ? round1(last3.reduce((s, v) => s + v, 0) / last3.length) : 0,
    best: last6.length ? Math.max(...last6) : 0,
    worst: last6.length ? Math.min(...last6) : 0,
    plan: input.planVelocity ?? plannedRate,
  };
}

export function scopeGrowthOf(input: ForecastInput) {
  const history = [input.baselineScope, ...input.scopeHistory];
  const diffs = history.slice(1).map((value, i) => value - history[i]!).slice(-3);
  return diffs.length ? round1(diffs.reduce((s, v) => s + v, 0) / diffs.length) : 0;
}

function simulateFinish(input: ForecastInput, v: number, growth: number) {
  const n = input.completed.length, maxPeriods = Math.ceil(HORIZON_DAYS / input.periodLengthDays);
  if (v <= growth) return null;
  let done = input.completed.reduce((s, x) => s + x, 0), scope = input.scopeHistory.at(-1) ?? input.baselineScope;
  if (done >= scope) return n;
  for (let k = n + 1; k <= n + maxPeriods; k++) { scope += growth; done += v; if (done >= scope) return k; }
  return null;
}

export function getProjectForecast(input: ForecastInput, basis: VelocityBasis = "rolling3", overrides: ForecastOverrides = {}): ForecastResult {
  const n = input.completed.length;
  const velocities = velocitiesOf(input);
  const velocity = overrides.velocity ?? velocities[basis];
  const scopeGrowth = overrides.scopeGrowth ?? scopeGrowthOf(input);
  const doneNow = input.completed.reduce((s, x) => s + x, 0);
  const scopeNow = input.scopeHistory.at(-1) ?? input.baselineScope;
  const plannedNow = plannedAt(input, n);
  const plannedRate = input.planVelocity ?? input.baselineScope / input.baselinePeriods;
  const gapUnits = round1(plannedNow - doneNow);
  const baselineEndDate = periodEnd(input, input.baselinePeriods);

  let recoveryPeriod: number | null = gapUnits <= 0 ? n : null;
  if (recoveryPeriod === null) {
    let done = doneNow;
    for (let k = n + 1; k <= input.baselinePeriods; k++) { done += velocity; if (done >= plannedAt(input, k)) { recoveryPeriod = k; break; } }
  }
  const finishPeriod = simulateFinish(input, velocity, scopeGrowth);
  const converging = velocity > scopeGrowth;
  const forecastFinishDate = finishPeriod === null ? null : periodEnd(input, finishPeriod);
  const remainingPeriods = input.baselinePeriods - n;
  const requiredVelocity = remainingPeriods > 0 ? round1((scopeNow - doneNow) / remainingPeriods + scopeGrowth) : null;
  const plausibility: Plausibility = requiredVelocity === null ? "unrealistic" : requiredVelocity <= velocities.best ? "realistic" : requiredVelocity <= velocities.best * 1.25 ? "stretch" : "unrealistic";
  const daysVsBaseline = forecastFinishDate ? daysBetween(baselineEndDate, forecastFinishDate) : null;

  let deliveryStatus: DeliveryStatus;
  if (n < 3) deliveryStatus = "insufficient_evidence";
  else if (!converging) deliveryStatus = "not_converging";
  else if (gapUnits <= 0) deliveryStatus = "on_track";
  else if (velocity < plannedRate) deliveryStatus = "slipping";
  else if (recoveryPeriod !== null && (daysVsBaseline ?? 1) <= 0) deliveryStatus = "recovering";
  else if (recoveryPeriod !== null) deliveryStatus = "recovering";
  else deliveryStatus = "recovering_late";

  let evidencedRag: EvidencedRag;
  if (deliveryStatus === "insufficient_evidence") evidencedRag = "Grey";
  else if (deliveryStatus === "slipping" || deliveryStatus === "not_converging") evidencedRag = "Red";
  else if (deliveryStatus === "on_track" || (daysVsBaseline !== null && daysVsBaseline <= 0)) evidencedRag = "Green";
  else if (deliveryStatus === "recovering" || (daysVsBaseline !== null && daysVsBaseline <= input.ragToleranceDays)) evidencedRag = "Amber";
  else evidencedRag = "Red";

  const rangeFor = (v: number) => { const p = simulateFinish(input, v, scopeGrowth); return p === null ? null : periodEnd(input, p); };
  const range = { worst: rangeFor(velocities.worst), likely: rangeFor(velocities.rolling3), best: rangeFor(velocities.best) };

  const trend = velocity - plannedRate;
  const basisLabel = basisLabels[basis];
  let explanation: string;
  if (deliveryStatus === "insufficient_evidence") explanation = `Only ${n} period${n === 1 ? "" : "s"} of history so far. Close 3 sprints to unlock forecasting.`;
  else if (!converging) explanation = `At ${velocity} units per period, delivery is not keeping pace with scope growth of ${scopeGrowth} per period, so the work never finishes at this rate.`;
  else if (gapUnits <= 0) explanation = `Delivery is ${Math.abs(gapUnits)} units ahead of the baseline plan at ${basisLabel.toLowerCase()} of ${velocity} units.`;
  else explanation = `At ${basisLabel.toLowerCase()} of ${velocity} units, the gap ${trend >= 0 ? "narrows" : "widens"} by ${Math.abs(round1(trend))} units per period; finishing on time needs ${requiredVelocity ?? "—"}+ per period, which the team has achieved ${input.completed.filter(c => requiredVelocity !== null && c >= requiredVelocity).length === 0 ? "never" : `${input.completed.filter(c => requiredVelocity !== null && c >= requiredVelocity).length} time(s)`}.`;

  return { periodsClosed: n, doneNow, scopeNow, plannedNow: round1(plannedNow), plannedRate: round1(plannedRate), gapUnits, scopeGrowth, velocity, velocities, basis,
    recoveryPeriod, recoveryDate: recoveryPeriod === null ? null : periodEnd(input, recoveryPeriod), finishPeriod, forecastFinishDate, baselineEndDate, daysVsBaseline,
    requiredVelocity, plausibility, converging, deliveryStatus, evidencedRag, range, explanation };
}

export const basisLabels: Record<VelocityBasis, string> = { last: "Last sprint", rolling3: "3-sprint average", best: "Best of last 6", worst: "Worst of last 6", plan: "Recovery plan" };
export const deliveryStatusLabels: Record<DeliveryStatus, string> = { insufficient_evidence: "Insufficient evidence", on_track: "On track", recovering: "Recovering", recovering_late: "Recovering late", slipping: "Slipping", not_converging: "Not converging" };

/** In-sprint forecast at daily granularity. */
export function getSprintForecast(args: { committed: number; remaining: number; start: Date; end: Date; today: Date; dailyDone: number[] }) {
  const recent = args.dailyDone.slice(-3);
  const rate = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : 0;
  const daysLeft = Math.max(0, daysBetween(args.today, args.end));
  const projectedRemaining = Math.max(0, args.remaining - rate * daysLeft);
  const landDate = rate > 0 ? addDays(args.today, Math.ceil(args.remaining / rate)) : null;
  const willLand = args.remaining <= 0 || (landDate !== null && landDate <= args.end);
  return { rate: round1(rate), daysLeft, projectedRemaining: round1(projectedRemaining), landDate, willLand };
}

/** Milestone forecast: project's rolling3 applied to the milestone's remaining units. */
export function getMilestoneForecast(args: { remainingUnits: number; rolling3: number; periodLengthDays: number; today: Date; targetDate: Date }) {
  if (args.rolling3 <= 0) return { forecastDate: null, daysVsTarget: null };
  const forecastDate = addDays(args.today, Math.ceil((args.remainingUnits / args.rolling3) * args.periodLengthDays));
  return { forecastDate, daysVsTarget: daysBetween(args.targetDate, forecastDate) };
}
