// Report builder §10.1: publishes a pack, then (optionally) renders the server PDF and emails
// the forum's members. publish_report runs as the caller, so its permission checks and the
// whole snapshot happen in one database transaction; this function adds the side effects.
//   REPORT_SERVER_PDF=true and REPORT_PDF_URL (the Netlify report-pdf function) with
//   REPORT_PDF_SECRET: asks it to render /report-print/<id> and store report-pdfs/<org>/<id>.pdf.
//   Off by default: packs export to PDF through the browser's print.
// GL-16: blocks over 256 KB are published as overflowed and staged; this moves the report's staged
// payloads to the report-snapshots bucket right after publish_report (report-notify retries any
// left every 15 minutes). { mode: "drain" } with the service role moves anything still staged.
// Secrets: RESEND_API_KEY, REPORTS_FROM (or RESEND_FROM), APP_URL, optional REPORT_* above.
import {
  APP_URL,
  UUID,
  adminClient,
  dbErrorResponse,
  json,
  serve,
  signedIn,
} from "../_shared/http.ts";
import { distributeReport } from "../_shared/report-distribution.ts";
import { reportSender } from "../_shared/report-sender.ts";
import { isServiceRoleRequest } from "../_shared/service-role.ts";
import { moveStagedSnapshots, overflowDeps } from "../_shared/snapshot-overflow.ts";

async function serverPdf(admin: ReturnType<typeof adminClient>, reportId: string) {
  if (Deno.env.get("REPORT_SERVER_PDF") !== "true") return { skipped: "REPORT_SERVER_PDF is off" };
  const url = Deno.env.get("REPORT_PDF_URL");
  const secret = Deno.env.get("REPORT_PDF_SECRET");
  if (!url || !secret) return { skipped: "REPORT_PDF_URL or REPORT_PDF_SECRET is not set" };
  const { data: token, error } = await admin.rpc("issue_report_print_token", {
    p_report_id: reportId,
  });
  if (error || !token) return { skipped: error?.message ?? "no print token" };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ report_id: reportId, token, app_url: APP_URL }),
    signal: AbortSignal.timeout(25_000),
  }).catch(
    (err) => ({ ok: false, status: 0, text: async () => String(err) }) as unknown as Response,
  );
  if (!response.ok)
    return { skipped: `PDF service ${response.status}: ${(await response.text()).slice(0, 200)}` };
  const result = await response.json();
  await admin.rpc("record_report_event", {
    p_report_id: reportId,
    p_event: "pdf_generated",
    p_payload: { path: result.path },
  });
  return { path: result.path as string };
}

serve("report-publish", async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body?.mode === "drain") {
    if (!isServiceRoleRequest(req.headers.get("Authorization"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")))
      return json({ error: "Service role only." }, 403);
    return json({ overflow: await moveStagedSnapshots(overflowDeps(adminClient()), null) });
  }
  const caller = await signedIn(req);
  if (!caller) return json({ error: "Sign in again." }, 401);
  const reportId =
    typeof body?.report_id === "string" && UUID.test(body.report_id) ? body.report_id : null;
  if (!reportId) return json({ error: "report_id is required" }, 400);

  const { error } = await caller.client.rpc("publish_report", { p_report_id: reportId });
  if (error) return dbErrorResponse(error, "The pack couldn't be published.");

  const admin = adminClient();
  // GL-16: move this pack's overflowed blocks to Storage (best effort: readers fall back to the
  // staged copy, and report-notify retries).
  const overflow = await moveStagedSnapshots(overflowDeps(admin), reportId).catch((err) => ({
    moved: 0,
    failed: [{ snapshot_id: "*", error: String(err?.message ?? err), attempts: 0 }],
    alert: [],
  }));
  const pdf = await serverPdf(admin, reportId).catch((err) => ({ skipped: String(err) }));
  const distribution = await distributeReport(
    {
      rpc: (fn, args) => admin.rpc(fn, args),
      signedPdfUrl: async (path) =>
        (await admin.storage.from("report-pdfs").createSignedUrl(path, 7 * 24 * 3600)).data
          ?.signedUrl ?? null,
    },
    reportId,
    APP_URL,
    reportSender(),
  ).catch((err) => ({
    sent: 0,
    failed: 0,
    skipped: String(err?.message ?? err),
    recipients: 0,
    without_account: [],
  }));
  return json({ published: true, distribution, pdf, overflow });
});
