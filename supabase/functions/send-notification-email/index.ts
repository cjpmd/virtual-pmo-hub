// GL-13: emails notifications ("as they happen", and the daily / weekly digest). Service role
// only: called every 15 minutes by the vpmo-notifications job in migration
// 20261112130000_gl_13_notifications (URL from the Vault secret notification_email_url, key from
// report_notify_service_key), with body {"mode": "immediate" | "all"}.
// Secrets: RESEND_API_KEY, RESEND_FROM, APP_URL.
import { APP_URL, adminClient, json, serve } from "../_shared/http.ts";
import { parseMode, sendNotificationEmails } from "../_shared/notification-email.ts";
import { sendEmail } from "../_shared/email.ts";
import { isServiceRoleRequest } from "../_shared/service-role.ts";

serve("send-notification-email", async (req) => {
  // verify_jwt is on: the gateway checked the signature; this checks it is the service role.
  if (!isServiceRoleRequest(req.headers.get("Authorization"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")))
    return json({ error: "Service role only." }, 403);
  const body = await req.json().catch(() => ({}));
  const mode = parseMode((body as { mode?: unknown })?.mode ?? "immediate");
  if (!mode) return json({ error: "mode must be immediate, digest or all" }, 400);
  const admin = adminClient();
  const configured = Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM"));
  const result = await sendNotificationEmails(
    { rpc: (fn, args) => admin.rpc(fn, args) },
    APP_URL,
    configured ? sendEmail : null,
    mode,
  );
  console.log("send-notification-email", mode, result);
  return json(result);
});
