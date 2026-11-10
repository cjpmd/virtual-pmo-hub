// GL-6: emails pending billing notices (trial ending, trial ended, payment failed, read-only) to
// every admin of the organisation. Service role only: called daily at 08:00 Europe/London by the
// pg_cron + pg_net job in migration 20261110102132_gl_6_billing_notices (URL from the Vault
// secret billing_notice_url, key from report_notify_service_key). stripe-webhook sends
// payment_failed notices itself, through the same shared module.
// Secrets: RESEND_API_KEY, RESEND_FROM, APP_URL.
import { APP_URL, adminClient, json, serve } from "../_shared/http.ts";
import { sendBillingNotices } from "../_shared/billing-notices.ts";
import { sendEmail } from "../_shared/email.ts";
import { isServiceRoleRequest } from "../_shared/service-role.ts";

serve("send-billing-notice", async (req) => {
  // verify_jwt is on: the gateway checked the signature; this checks it is the service role.
  if (!isServiceRoleRequest(req.headers.get("Authorization"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")))
    return json({ error: "Service role only." }, 403);
  const admin = adminClient();
  const configured = Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM"));
  const result = await sendBillingNotices(
    { rpc: (fn, args) => admin.rpc(fn, args) },
    APP_URL,
    configured ? sendEmail : null,
  );
  console.log("send-billing-notice", result);
  return json(result);
});
