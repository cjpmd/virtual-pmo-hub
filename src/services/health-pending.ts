// "Updating health…" after the person's own writes. Stored health (project_health_current and
// friends) is refreshed from the views by a queue a few seconds after a write; this remembers
// that one of this session's writes is waiting for that refresh. Other people's changes never
// set it.
//
// Pending until computed_at is later than the write: the row's own server updated_at when the
// write returned one, otherwise the newest computed_at this session had seen before the write.
import type { TableName } from "./db";

/** Every table whose writes queue a health refresh (docs/sql/perf-health-current-b.sql). */
export const HEALTH_TABLES = new Set<TableName>([
  "benefit_measure_targets",
  "benefit_measurements",
  "benefit_measures",
  "benefit_periods",
  "benefit_projects",
  "benefit_reviews",
  "benefits",
  "budget_baselines",
  "capabilities",
  "capability_projects",
  "divergence_justifications",
  "financial_periods",
  "financial_values",
  "health_snapshots",
  "issues",
  "lifecycle_phases",
  "milestones",
  "organisations",
  "portfolios",
  "programmes",
  "projects",
  "risks",
  "status_reports",
  "work_item_checklist_items",
  "work_items",
]);

/** Give up waiting after this long (the queue drains every 5 seconds; a refresh takes ~0.5 s). */
export const HEALTH_PENDING_TIMEOUT_MS = 60_000;

interface Pending {
  /** computed_at must be later than this (server time). Null: any newer computed_at than seen. */
  after: string | null;
  startedAt: number;
}

let pending: Pending | null = null;
let lastSeenComputedAt: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const subscribeHealthPending = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getHealthPending = () => pending;

/** Milliseconds for a Postgres timestamp in either text form (T or space, +00 or +00:00). */
const ms = (value: string) => Date.parse(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : ms(b) > ms(a) ? b : a);

/** Called by the write helper (and write RPCs) after a write that feeds health. */
export function markHealthPending(serverTime: string | null) {
  const after = later(serverTime, lastSeenComputedAt);
  pending = { after: later(pending?.after ?? null, after), startedAt: Date.now() };
  emit();
}

/**
 * Called with each newly loaded computed_at. Returns true when it clears a pending write (the
 * caller then refetches the health queries).
 */
export function noteComputedAt(computedAt: string | null): boolean {
  if (computedAt) lastSeenComputedAt = later(lastSeenComputedAt, computedAt);
  if (!pending) return false;
  const timedOut = Date.now() - pending.startedAt > HEALTH_PENDING_TIMEOUT_MS;
  const caughtUp = !!computedAt && (!pending.after || ms(computedAt) > ms(pending.after));
  if (!caughtUp && !timedOut) return false;
  pending = null;
  emit();
  return true;
}
