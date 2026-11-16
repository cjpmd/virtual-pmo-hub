// GL-16 (docs/design/pack-overflow-storage.md §3.3): a published block over 256 KB is stored in
// Storage (or, for a moment after publishing, still staged) instead of in its snapshot row. This
// resolves those rows for the viewer and the print route: load the payload text, check its SHA-256
// against the row's, then parse it. A block that can't be loaded or verified becomes an error marker
// the document shows in place of the block.

export const SNAPSHOT_ERROR = "__snapshotError";
export type SnapshotError = { [SNAPSHOT_ERROR]: string };

export const isSnapshotError = (data: unknown): data is SnapshotError =>
  typeof data === "object" && data !== null && SNAPSHOT_ERROR in data;

export interface OverflowRow {
  id: string;
  overflowed: boolean;
  /** SHA-256 of the payload text, hex (PostgREST's bytea "\x…" is accepted too). */
  sha256: string | null;
  data: unknown;
}

/** PostgREST returns bytea as "\x<hex>"; the token read returns plain hex. */
export const normaliseSha256 = (value: string | null | undefined) =>
  value ? value.replace(/^\\x/, "").toLowerCase() : null;

/** SHA-256 of UTF-8 text, hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Replaces each overflowed row's data with its verified payload (or an error marker). `load`
 * returns the payload text, or null when it isn't available. Loads run in parallel.
 */
export async function resolveOverflow<T extends OverflowRow>(
  rows: T[],
  load: (row: T) => Promise<string | null>,
  hash: (text: string) => Promise<string> = sha256Hex,
): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.overflowed) return row;
      let text: string | null;
      try {
        text = await load(row);
      } catch {
        text = null;
      }
      if (text === null)
        return { ...row, data: { [SNAPSHOT_ERROR]: "This block couldn't be loaded." } };
      if ((await hash(text)) !== normaliseSha256(row.sha256))
        return { ...row, data: { [SNAPSHOT_ERROR]: "This block couldn't be verified." } };
      try {
        return { ...row, data: JSON.parse(text) as unknown };
      } catch {
        return { ...row, data: { [SNAPSHOT_ERROR]: "This block couldn't be verified." } };
      }
    }),
  );
}
