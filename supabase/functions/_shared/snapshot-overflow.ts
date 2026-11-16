// GL-16: moves overflowed report snapshot payloads from private.report_snapshot_staging to the
// private bucket report-snapshots (docs/design/pack-overflow-storage.md §3.2). Used by
// report-publish (right after publish_report, for that report) and report-notify (every 15 minutes,
// for anything still staged). Dependency-free so it runs in Deno and in the unit tests.

export const SNAPSHOT_BUCKET = "report-snapshots";
/** Failed moves before ops are emailed (once, at this count). */
export const OVERFLOW_ALERT_AT = 5;

export interface StagedSnapshot {
  snapshot_id: string;
  report_id: string;
  organisation_id: string;
  storage_path: string;
  /** The exact text that was hashed at publish (data::text). */
  payload: string;
  /** SHA-256 of payload, hex. */
  sha256: string;
  attempts: number;
}

export interface OverflowDeps {
  /** report_snapshot_staged(p_report_id): one report's staged rows, or the oldest 50 of all. */
  staged(reportId: string | null): Promise<StagedSnapshot[]>;
  /** Uploads with upsert off. Resolves "exists" when the object is already there. */
  upload(path: string, text: string): Promise<"uploaded" | "exists">;
  /** Downloads an existing object's text (to check one left by an earlier attempt). */
  download(path: string): Promise<string>;
  /** complete_snapshot_overflow: checks the hash again, records the object, clears staging. */
  complete(snapshotId: string, path: string, sha256: string): Promise<void>;
  /** fail_snapshot_overflow: counts the failure; resolves the attempts so far. */
  fail(snapshotId: string, error: string): Promise<number>;
  sha256Hex(text: string): Promise<string>;
}

export interface OverflowResult {
  moved: number;
  failed: Array<{ snapshot_id: string; error: string; attempts: number }>;
  /** Snapshots that have just reached OVERFLOW_ALERT_AT failures. */
  alert: string[];
}

/** SHA-256 of UTF-8 text, hex (Web Crypto: Deno, browsers, Node 20). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function moveStagedSnapshots(
  deps: OverflowDeps,
  reportId: string | null,
): Promise<OverflowResult> {
  const result: OverflowResult = { moved: 0, failed: [], alert: [] };
  for (const row of await deps.staged(reportId)) {
    try {
      // The payload must still be what was published; never upload anything else.
      const hash = await deps.sha256Hex(row.payload);
      if (hash !== row.sha256) throw new Error("staged payload doesn't match the published hash");
      const outcome = await deps.upload(row.storage_path, row.payload);
      if (outcome === "exists") {
        // An earlier attempt uploaded it but didn't complete: accept it only if it is identical.
        const existing = await deps.sha256Hex(await deps.download(row.storage_path));
        if (existing !== row.sha256) throw new Error("an object with a different payload is already there");
      }
      await deps.complete(row.snapshot_id, row.storage_path, hash);
      result.moved += 1;
    } catch (err) {
      const error = String((err as Error)?.message ?? err).slice(0, 500);
      const attempts = await deps.fail(row.snapshot_id, error).catch(() => row.attempts + 1);
      result.failed.push({ snapshot_id: row.snapshot_id, error, attempts });
      if (attempts === OVERFLOW_ALERT_AT) result.alert.push(row.snapshot_id);
    }
  }
  return result;
}

/** The Supabase-backed dependencies (service-role client). */
export function overflowDeps(admin: {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Blob, options: Record<string, unknown>) => PromiseLike<{ error: { message: string; statusCode?: string } | null }>;
      download: (path: string) => PromiseLike<{ data: Blob | null; error: { message: string } | null }>;
    };
  };
}): OverflowDeps {
  return {
    staged: async (reportId) => {
      const { data, error } = await admin.rpc("report_snapshot_staged", { p_report_id: reportId });
      if (error) throw new Error(error.message);
      return (data ?? []) as StagedSnapshot[];
    },
    upload: async (path, text) => {
      const { error } = await admin.storage
        .from(SNAPSHOT_BUCKET)
        .upload(path, new Blob([text], { type: "application/json" }), { contentType: "application/json", upsert: false });
      if (!error) return "uploaded";
      if (error.statusCode === "409" || /exists/i.test(error.message)) return "exists";
      throw new Error(`upload: ${error.message}`);
    },
    download: async (path) => {
      const { data, error } = await admin.storage.from(SNAPSHOT_BUCKET).download(path);
      if (error || !data) throw new Error(`download: ${error?.message ?? "no data"}`);
      return await data.text();
    },
    complete: async (snapshotId, path, hash) => {
      const { error } = await admin.rpc("complete_snapshot_overflow", {
        p_snapshot_id: snapshotId,
        p_storage_path: path,
        p_sha256: hash,
      });
      if (error) throw new Error(error.message);
    },
    fail: async (snapshotId, message) => {
      const { data, error } = await admin.rpc("fail_snapshot_overflow", { p_snapshot_id: snapshotId, p_error: message });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    sha256Hex,
  };
}
