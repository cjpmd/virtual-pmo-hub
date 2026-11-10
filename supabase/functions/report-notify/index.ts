// Report builder RB-39a: emails "draft pack ready" notices queued by the scheduled pack job
// (report_notifications) to the forum's secretary and chair, else PMO / admins. Idempotent per
// report. Service role only: called every 15 minutes by the pg_cron + pg_net job in migration
// 20261104120000_rb6_report_notify_cron (URL and key from Vault; see the handover).
// Secrets: RESEND_API_KEY, REPORTS_FROM (or RESEND_FROM), APP_URL; optional
// REPORTS_TEST_RECIPIENTS (comma-separated allowlist: on a test branch, only these receive mail).
import { APP_URL, adminClient, json, serve } from "../_shared/http.ts";
import { sendPendingNotices } from "../_shared/report-notify.ts";
import { reportSender } from "../_shared/report-sender.ts";
import { isServiceRoleRequest } from "../_shared/service-role.ts";

serve("report-notify", async (req) => {
  // verify_jwt is on: the gateway checked the signature; this checks it is the service role
  // (GL-6 follow-up: the Vault key no longer equals the runtime's SUPABASE_SERVICE_ROLE_KEY).
  if (!isServiceRoleRequest(req.headers.get("Authorization"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")))
    return json({ error: "Service role only." }, 403);
  const admin = adminClient();
  const result = await sendPendingNotices(
    { rpc: (fn, args) => admin.rpc(fn, args) },
    APP_URL,
    reportSender(),
  );
  return json(result);
});
