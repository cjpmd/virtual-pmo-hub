// GL-11: a signed-in user closes their own account. Body: { confirm_email }.
//   1. public.close_my_account as the caller: checks the typed email, a sign-in within 10 minutes
//      (amr timestamp, else the session's creation time) and that they aren't the last admin of
//      any organisation; then ends their memberships, anonymises what was theirs and leaves the
//      profile as a "Former member" tombstone. Refused (closure_not_enabled) until the
//      profiles_id_fkey drop (docs/sql/gl-11-account-closure.sql section D) has been run.
//   2. The auth user is deleted with the service role (sessions, identities and MFA factors go with
//      it). If that fails, purge-organisations retries it daily (account_closures_pending).
//   3. A confirmation email to the address the account had.
// Secrets: RESEND_API_KEY, RESEND_FROM, APP_URL.
import { APP_URL, adminClient, dbErrorResponse, json, serve, signedIn } from "../_shared/http.ts";
import { sendEmail } from "../_shared/email.ts";
import { accountClosedEmail, sendToAll } from "../_shared/organisation-deletion.ts";

serve("close-account", async (req) => {
  const auth = await signedIn(req);
  if (!auth) return json({ error: "Sign in first." }, 401);
  const body = await req.json().catch(() => ({}));
  const { data, error } = await auth.client.rpc("close_my_account", { p_confirm_email: String(body?.confirm_email ?? "") });
  if (error) return dbErrorResponse(error, "Couldn't close your account.");
  const email = String((data as { email?: string } | null)?.email ?? "");

  const admin = adminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(auth.user.id);
  if (deleteError) console.error("close-account deleteUser (retried daily)", auth.user.id, deleteError.message);

  if (email && Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM"))
    await sendToAll(sendEmail, [email], accountClosedEmail({ appUrl: APP_URL }), `account-closed/${auth.user.id}`);

  return json({ ok: true, signed_in_elsewhere_until_expiry: Boolean(deleteError) });
});
