// GL-11b: pure helpers for export-organisation (docs/design/account-closure.md §2.5). No Deno or
// npm imports, so vitest runs them; the edge function does the I/O.

export const EXPORT_BUCKET = "exports";
/** Signed download links last 24 hours. */
export const SIGNED_URL_SECONDS = 24 * 60 * 60;
/** Zips are removed after 7 days. */
export const KEEP_DAYS = 7;
/** Rows per organisation_export_rows call (the RPC allows up to 5,000). */
export const PAGE_SIZE = 1000;
export const EXPORT_FORMAT = "ormo-organisation-export/1";

export interface PlanTable {
  table: string;
  rows: number;
  order_by: string[];
  omitted_columns: string[];
}
export interface ExportPlan {
  organisation_id: string;
  schema_version: string | null;
  generated_at: string;
  tables: PlanTable[];
  not_exported: string[];
}
export interface StorageObjectRef {
  bucket: string;
  path: string;
}

/** exports/<org>/<UTC timestamp>.zip, e.g. <org>/2026-11-11T09-30-00Z.zip (sortable, no colons). */
export function exportPath(organisationId: string, at: Date): string {
  const stamp = at.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
  return `${organisationId}/${stamp}.zip`;
}

/** The file name the browser saves: ormo-export-<slug>-<date>.zip. */
export function downloadName(organisationName: string, at: Date): string {
  const slug =
    organisationName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "organisation";
  return `ormo-export-${slug}-${at.toISOString().slice(0, 10)}.zip`;
}

/** The JSON file for one table inside the zip. */
export const tableFile = (table: string) => `tables/${table}.json`;

/** The offsets to request for a table of `rows` rows. */
export function pageOffsets(rows: number, pageSize = PAGE_SIZE): number[] {
  const out: number[] = [];
  for (let offset = 0; offset < rows; offset += pageSize) out.push(offset);
  return out;
}

/** manifest.json: what is in the zip, what was left out, and the Storage files (listed only). */
export function buildManifest(input: {
  plan: ExportPlan;
  organisationName: string;
  requestedBy: string;
  exportedAt: Date;
  written: Record<string, number>;
  storage: StorageObjectRef[];
}) {
  const { plan, written } = input;
  return {
    format: EXPORT_FORMAT,
    organisation: { id: plan.organisation_id, name: input.organisationName },
    exported_at: input.exportedAt.toISOString(),
    requested_by: input.requestedBy,
    schema_version: plan.schema_version,
    tables: plan.tables.map((t) => ({
      table: t.table,
      file: tableFile(t.table),
      rows: written[t.table] ?? 0,
      omitted_columns: t.omitted_columns,
    })),
    total_rows: Object.values(written).reduce((sum, n) => sum + n, 0),
    storage_objects: {
      note: "Files in Storage are listed, not included. Each can be downloaded in the app until the organisation is deleted.",
      count: input.storage.length,
      objects: input.storage,
    },
    not_exported: plan.not_exported,
  };
}

/** Checks the rows written match the plan's counts (rows can change while an export runs). */
export function countMismatches(plan: ExportPlan, written: Record<string, number>): string[] {
  return plan.tables
    .filter((t) => (written[t.table] ?? 0) !== t.rows)
    .map((t) => `${t.table}: planned ${t.rows}, wrote ${written[t.table] ?? 0}`);
}

export interface ListedObject {
  name: string;
  id: string | null;
  created_at?: string | null;
}

/** Zips in one organisation's folder older than KEEP_DAYS (full paths). */
export function expiredExports(folder: string, objects: ListedObject[], now: Date, keepDays = KEEP_DAYS): string[] {
  const cutoff = now.getTime() - keepDays * 86400000;
  return objects
    .filter((o) => o.id && o.created_at && new Date(o.created_at).getTime() < cutoff)
    .map((o) => `${folder}/${o.name}`);
}
