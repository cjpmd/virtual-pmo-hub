// Work package 2.1. Emails an organisation's admins about a new request to join. The requester's
// app calls this straight after request_to_join. claim_join_request_notification (service role)
// only succeeds once, for a pending request made by the caller, so a request emails admins at
// most once however often this is called. Each admin gets their own email (no shared recipients).
// Secrets: RESEND_API_KEY, RESEND_FROM, APP_URL. SUPABASE_* are provided by the platform.
import { APP_URL, UUID, adminClient, json, serve, signedIn } from "../_shared/http.ts";
import { sendEmail } from "../_shared/email.ts";
import { joinRequestEmail } from "../_shared/email-templates.ts";

type Claim = {
  organisation_name: string;
  requester_name: string | null;
  requester_email: string;
  matched_by: string;
  message: string | null;
  admin_emails: string[];
};

serve("notify-join-request", async (req) => {
  const caller = await signedIn(req);
  if (!caller) return json({ error: "Sign in again." }, 401);
  const body = await req.json().catch(() => ({}));
  const requestId = String(body.requestId ?? "");
  if (!UUID.test(requestId)) return json({ error: "Invalid request." }, 400);

  const { data, error } = await adminClient().rpc("claim_join_request_notification", {
    p_request_id: requestId,
    p_requester: caller.user.id,
  });
  if (error) {
    console.error("notify-join-request: claim", error);
    return json({ error: "Couldn't notify the admins." }, 500);
  }
  const claim = data as Claim | null;
  if (!claim) return json({ notified: 0, alreadyNotified: true });

  const email = joinRequestEmail({
    organisationName: claim.organisation_name,
    requesterName: claim.requester_name,
    requesterEmail: claim.requester_email,
    matchedBy: claim.matched_by,
    message: claim.message,
    link: `${APP_URL}/settings/members#requests`,
  });

  // One email per admin, one after another: the Resend client paces requests to its rate limit.
  // The request was claimed above, so it is notified once only; the Members page badge shows it
  // to admins whether or not every email arrives.
  let notified = 0;
  for (const [index, to] of claim.admin_emails.entries()) {
    const { error: sendError } = await sendEmail({
      to,
      ...email,
      idempotencyKey: `join-request/${requestId}/${index + 1}`,
      tags: [{ name: "type", value: "join-request" }],
    });
    if (!sendError) notified += 1;
  }
  return json({ notified, admins: claim.admin_emails.length });
});
