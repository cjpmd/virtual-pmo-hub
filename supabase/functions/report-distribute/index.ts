// Report builder §12: emails a published pack to the forum's members (not contributors) and
// partner members of shared forums, through Resend. Idempotent: a pack is sent once (the
// 'distributed' event), and each email has the key report-<id>-publish/<n>.
// Called by report-publish after publishing; can be called again by a publisher to retry a
// pack whose sending failed (it won't resend to everyone once recorded as distributed).
// Secrets: RESEND_API_KEY, REPORTS_FROM (or RESEND_FROM), APP_URL. No key: nothing is sent and
// the response says so.
import { APP_URL, UUID, adminClient, json, serve, signedIn } from "../_shared/http.ts";
import { distributeReport } from "../_shared/report-distribution.ts";
import { reportSender } from "../_shared/report-sender.ts";

serve("report-distribute", async (req) => {
  const caller = await signedIn(req);
  if (!caller) return json({ error: "Sign in again." }, 401);
  const body = await req.json().catch(() => ({}));
  const reportId = typeof body?.report_id === "string" && UUID.test(body.report_id) ? body.report_id : null;
  if (!reportId) return json({ error: "report_id is required" }, 400);
  const { data: permissions } = await caller.client.rpc("report_permissions", { p_report_id: reportId });
  if (!permissions?.can_publish) return json({ error: "PMO or the forum's secretary sends packs." }, 403);
  const admin = adminClient();
  const result = await distributeReport(
    {
      rpc: (fn, args) => admin.rpc(fn, args),
      signedPdfUrl: async (path) => (await admin.storage.from("report-pdfs").createSignedUrl(path, 7 * 24 * 3600)).data?.signedUrl ?? null,
    },
    reportId,
    APP_URL,
    reportSender(),
  );
  return json(result);
});
