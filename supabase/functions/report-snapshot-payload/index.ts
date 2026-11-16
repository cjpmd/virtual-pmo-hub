// GL-16 (docs/design/pack-overflow-storage.md §3.3): the print route's overflowed blocks. The print
// page (/report-print/<id>?token=…, no session; also what the Netlify report-pdf renderer opens)
// gets the inline snapshot rows from report_snapshot_by_token, then asks here for the rest:
// { report_id, token, snapshot_ids }. report_overflow_by_token checks the print token in the
// database (the same rule as report_snapshot_by_token) and returns, for overflowed snapshots of that
// report only, the object path or, while still staged, the payload. Paths are returned as 60-second
// signed URLs. The page checks every payload's SHA-256 against the snapshot row.
// verify_jwt = false (supabase/config.toml): the print token is the credential.
import { UUID, adminClient, json, serve } from "../_shared/http.ts";
import { SNAPSHOT_BUCKET } from "../_shared/snapshot-overflow.ts";

const MAX_IDS = 500;

serve("report-snapshot-payload", async (req) => {
  const body = await req.json().catch(() => ({}));
  const reportId = typeof body?.report_id === "string" && UUID.test(body.report_id) ? body.report_id : null;
  const token = typeof body?.token === "string" && body.token.length <= 200 ? body.token : null;
  const ids = Array.isArray(body?.snapshot_ids)
    ? (body.snapshot_ids as unknown[]).filter((id): id is string => typeof id === "string" && UUID.test(id)).slice(0, MAX_IDS)
    : [];
  if (!reportId || !token || ids.length === 0) return json({ error: "report_id, token and snapshot_ids are required" }, 400);

  const admin = adminClient();
  const { data, error } = await admin.rpc("report_overflow_by_token", {
    p_report_id: reportId,
    p_token: token,
    p_snapshot_ids: ids,
  });
  if (error) return json({ error: "The pack couldn't be loaded." }, 500);
  const rows = (data ?? []) as Array<{ snapshot_id: string; storage_path: string | null; payload: string | null }>;
  // A wrong or expired token returns no rows: say nothing more than that.
  if (rows.length === 0) return json({ payloads: [] });

  const payloads = [];
  for (const row of rows) {
    if (row.storage_path) {
      const { data: signed } = await admin.storage.from(SNAPSHOT_BUCKET).createSignedUrl(row.storage_path, 60);
      payloads.push({ snapshot_id: row.snapshot_id, url: signed?.signedUrl ?? null });
    } else {
      payloads.push({ snapshot_id: row.snapshot_id, payload: row.payload });
    }
  }
  return json({ payloads });
});
