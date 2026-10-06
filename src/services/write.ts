// The shared write path for every Supabase-backed service.
//
//   insertRow  – insert, select the row back (id, updated_at)
//   updateRow  – optimistic concurrency: `.eq("updated_at", lastSeen)`. If no row comes back,
//                read the row again to say why: a newer updated_at means someone else saved
//                first ("conflict"); the same updated_at means RLS refused ("forbidden"); no
//                row at all means it was removed or is no longer visible ("not_found").
//   deleteRows – delete by id; an empty result is "forbidden" (RLS filtered it)
//
// Own writes: every write remembers the updated_at it got back, per row. An update sends the
// newer of that and the caller's lastSeen, so a screen holding a copy loaded before its own
// previous save (a refetch still in flight, a debounced form, a cached query) doesn't trip
// the concurrency check on itself. Someone else's later save is still caught: theirs is newer
// than both.
//
// Services build the column patch; this file owns what happens on the wire, so every
// service gets the same concurrency and error behaviour.
import { supabase } from "@/integrations/supabase/client";
import type { NewRow, TableName, Update } from "./db";
import { forInsert } from "./db";
import { ServiceError, fromPostgrest, unwrapWrite } from "./service-error";

export interface Written {
  id: string;
  updatedAt: string | null;
}

export const CONFLICT_MESSAGE = "Changed by someone else, reload to see the latest.";

// supabase-js types each table separately; the helpers are generic over the table name, so
// they talk to the untyped builder. Callers stay fully typed through Update<T> / NewRow<T>.
type LooseBuilder = {
  insert: (values: unknown) => LooseFilter;
  update: (values: unknown) => LooseFilter;
  delete: () => LooseFilter;
  select: (columns: string) => LooseFilter;
};
type LooseResult = {
  data: unknown;
  error: import("@supabase/supabase-js").PostgrestError | null;
  status?: number;
};
type LooseFilter = PromiseLike<LooseResult> & {
  eq: (column: string, value: unknown) => LooseFilter;
  in: (column: string, values: unknown[]) => LooseFilter;
  select: (columns: string) => LooseFilter;
  single: () => PromiseLike<LooseResult>;
  maybeSingle: () => PromiseLike<LooseResult>;
};
const table = (name: TableName) => supabase.from(name) as unknown as LooseBuilder;

/** Tables without an updated_at column (link tables, append-only logs). */
const NO_UPDATED_AT = new Set<TableName>([
  "actuals_import_rows",
  "actuals_imports",
  "audit_log",
  "benefit_measure_targets",
  "benefit_objectives",
  "benefit_projects",
  "budget_baselines",
  "capability_projects",
  "collection_projects",
  "decision_benefits",
  "decision_change_requests",
  "decision_dependencies",
  "decision_issues",
  "decision_risks",
  "dependency_issues",
  "dependency_risks",
  "financial_forecast_history",
  "health_snapshots",
  "lesson_project_types",
  "milestone_forecast_history",
  "outcome_benefits",
  "outcome_capabilities",
  "phase_lessons_review_attendees",
  "resource_skills",
  "roadmap_item_collections",
  "sync_log",
  "user_favourites",
  "work_item_assignees",
  "work_item_events",
  "work_item_links",
  "work_item_offers",
]);
/** Tables keyed by something other than `id` (one row per parent). */
const KEY_COLUMN: Partial<Record<TableName, string>> = {
  benefit_handovers: "benefit_id",
  ms_connections: "organisation_id",
  project_plan_links: "project_id",
};
const keyOf = (name: TableName) => KEY_COLUMN[name] ?? "id";
// Link tables have no id column; return the whole (small) row instead.
const returning = (name: TableName) =>
  NO_UPDATED_AT.has(name) ? "*" : `${keyOf(name)}, updated_at`;

const toWritten = (name: TableName, row: unknown): Written => {
  const value = row as Record<string, string | null | undefined>;
  const written = { id: value[keyOf(name)] ?? "", updatedAt: value["updated_at"] ?? null };
  if (written.id && written.updatedAt) ownWrites.set(`${name}:${written.id}`, written.updatedAt);
  return written;
};

/** updated_at returned by this session's own writes, by "table:id". */
const ownWrites = new Map<string, string>();

/** The updated_at to send: the caller's copy, or our own later write to the same row. */
export const versionToSend = (name: TableName, id: string, lastSeen: string | null | undefined) =>
  lastSeen ? latest(lastSeen, ownWrites.get(`${name}:${id}`)) : lastSeen;

export async function insertRow<T extends TableName>(
  name: T,
  values: NewRow<T>,
  context: string,
): Promise<Written> {
  const row = unwrapWrite(
    await table(name).insert(forInsert<T>(values)).select(returning(name)).single(),
    context,
  );
  return toWritten(name, row);
}

export async function insertRows<T extends TableName>(
  name: T,
  values: NewRow<T>[],
  context: string,
): Promise<Written[]> {
  if (!values.length) return [];
  const rows = unwrapWrite(
    await table(name)
      .insert(values.map((value) => forInsert<T>(value)))
      .select(returning(name)),
    context,
  );
  return (rows as unknown[]).map((row) => toWritten(name, row));
}

/**
 * Update one row. Pass `lastSeen` (the updated_at the screen loaded) whenever the user edited
 * a copy of the row; omit it only for writes that cannot lose someone else's change.
 */
export async function updateRow<T extends TableName>(
  name: T,
  id: string,
  fields: Update<T>,
  options: { context: string; lastSeen?: string | null | undefined },
): Promise<Written> {
  const { context } = options;
  const lastSeen = versionToSend(name, id, options.lastSeen);
  let query = table(name).update(fields).eq(keyOf(name), id);
  if (lastSeen) query = query.eq("updated_at", lastSeen);
  const result = await query.select(returning(name));
  if (result.error) throw fromPostgrest(result.error, context, result.status);
  const rows = (result.data ?? []) as unknown[];
  if (rows.length) return toWritten(name, rows[0]);
  throw await explainEmptyWrite(name, id, lastSeen, context);
}

/** Work out why an update touched nothing. */
async function explainEmptyWrite(
  name: TableName,
  id: string,
  lastSeen: string | null | undefined,
  context: string,
): Promise<ServiceError> {
  const current = await table(name).select(returning(name)).eq(keyOf(name), id).maybeSingle();
  const row = current.data as { updated_at?: string | null } | null;
  if (!row)
    return new ServiceError(
      "not_found",
      `${context}: this record no longer exists, or you no longer have access to it.`,
    );
  if (lastSeen && row.updated_at && !sameInstant(row.updated_at, lastSeen))
    return new ServiceError("conflict", `${context}: ${CONFLICT_MESSAGE}`, {
      detail: `updated_at ${row.updated_at} (you loaded ${lastSeen})`,
    });
  return new ServiceError(
    "forbidden",
    `${context}: You don't have permission to make this change.`,
  );
}

/**
 * updated_at as microseconds since the epoch. It may come back in different textual forms
 * (T or space, +00 or +00:00), and Date alone drops the microseconds Postgres keeps.
 */
const micros = (value: string) =>
  Date.parse(value.replace(" ", "T").replace(/\+00$/, "+00:00")) * 1000 +
  Number((/\.\d{3}(\d{0,3})/.exec(value)?.[1] ?? "").padEnd(3, "0"));

export function sameInstant(a: string, b: string) {
  return micros(a) === micros(b);
}

/** Newer of two updated_at values (either may be missing). */
export function latest(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return micros(b) > micros(a) ? b : a;
}

export async function deleteRows(name: TableName, ids: string[], context: string) {
  if (!ids.length) return;
  unwrapWrite(await table(name).delete().in(keyOf(name), ids).select(keyOf(name)), context);
  for (const id of ids) ownWrites.delete(`${name}:${id}`);
}

/** Delete link rows matching a filter (e.g. benefit_projects for one benefit). */
export async function deleteWhere(
  name: TableName,
  filters: Record<string, string>,
  context: string,
) {
  let query = table(name).delete();
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const result = await query.select(Object.keys(filters)[0] ?? "*");
  if (result.error) throw fromPostgrest(result.error, context, result.status);
}
