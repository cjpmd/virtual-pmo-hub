/**
 * Period-on-period history for headline figures.
 *
 * A live PMO would read these from a monthly snapshot table. The prototype has no
 * such table, so a deterministic walk stands in: the same key always produces the
 * same series, the series always ends on the live value, and the shape is driven by
 * `drift` (where the metric started relative to today) rather than by chance. That
 * keeps sparklines and deltas stable across renders, routes and reloads.
 */
const PERIODS = 12;
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function seeded(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) { hash ^= key.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return () => { hash = Math.imul(hash ^ (hash >>> 15), 2246822507); hash = Math.imul(hash ^ (hash >>> 13), 3266489909); return ((hash ^= hash >>> 16) >>> 0) / 4294967296 };
}

export interface TrendSeries { points: number[]; current: number; previous: number; change: number; percent: number }

export interface TrendOptions {
  /** Fraction the metric has moved over the whole window. 0.15 means it started 15% below today. */
  drift?: number;
  /** Period-to-period wobble as a fraction of the value. */
  noise?: number;
  integer?: boolean;
  min?: number;
  max?: number;
  periods?: number;
}

export function getTrend(key: string, current: number, options: TrendOptions = {}): TrendSeries {
  const { drift = 0.12, noise = 0.04, integer = false, min, max, periods = PERIODS } = options;
  const random = seeded(key);
  const start = current * (1 - drift);
  const points = Array.from({ length: periods }, (_, index) => {
    const progress = index / (periods - 1);
    // Ease the walk so the line curves rather than ramping straight.
    const eased = progress * progress * (3 - 2 * progress);
    const base = start + (current - start) * eased;
    const wobble = index === periods - 1 ? 0 : (random() - 0.5) * 2 * noise * Math.abs(current || 1);
    let value = base + wobble;
    if (min !== undefined) value = Math.max(min, value);
    if (max !== undefined) value = Math.min(max, value);
    return integer ? Math.round(value) : Math.round(value * 100) / 100;
  });
  points[periods - 1] = integer ? Math.round(current) : current;
  const previous = points[periods - 2] ?? current;
  const change = current - previous;
  return { points, current, previous, change, percent: previous ? (change / Math.abs(previous)) * 100 : 0 };
}

/** Month labels for the trend window, ending on the current period. */
export function getTrendPeriods(endDate = new Date(2026, 8, 21), periods = PERIODS) {
  return Array.from({ length: periods }, (_, index) => {
    const date = new Date(endDate.getFullYear(), endDate.getMonth() - (periods - 1 - index), 1);
    return `${SHORT_MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
  });
}

/** Wording for a KPI delta, e.g. "+3 vs Aug 26". */
export const deltaLabel = (periods = getTrendPeriods()) => `vs ${periods[periods.length - 2] ?? "last period"}`;
