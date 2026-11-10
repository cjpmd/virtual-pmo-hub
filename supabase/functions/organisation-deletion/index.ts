// GL-11: an organisation admin asks to delete the organisation, or cancels the request.
// Body: { action: "request", organisation_id, confirm_name } | { action: "cancel", organisation_id }.
//   1. The RPC as the caller (request_organisation_deletion / cancel_organisation_deletion) does
//      the permission check (org admin), the typed-name check and the database change. It works
//      while the organisation is read-only, so a lapsed organisation can ask to be deleted.
//   2. Stripe (decision D1): on request, a live subscription is set to cancel at period end, after
//      releasing any subscription schedule (pending seat or interval changes), and marked with
//      metadata ormo_deletion=1; on cancel, only a subscription this marked is set to renew again.
//      A Stripe failure doesn't undo the request: purge-organisations re-applies it daily.
//   3. The scheduled / cancelled email to every admin, now (the daily job sends any that fail).
// Secrets: STRIPE_SECRET_KEY, RESEND_API_KEY, RESEND_FROM, APP_URL.
import { APP_URL, UUID, adminClient, dbErrorResponse, json, serve, signedIn } from "../_shared/http.ts";
import { sendEmail } from "../_shared/email.ts";
import { deletionEmail, EMAIL_COLUMN, sendToAll } from "../_shared/organisation-deletion.ts";
import { adminAddresses, applyStripe } from "../_shared/organisation-deletion-io.ts";

serve("organisation-deletion", async (req) => {
  const auth = await signedIn(req);
  if (!auth) return json({ error: "Sign in first." }, 401);
  const body = await req.json().catch(() => ({}));
  const organisationId = String(body?.organisation_id ?? "");
  const action = body?.action;
  if (!UUID.test(organisationId) || (action !== "request" && action !== "cancel"))
    return json({ error: "Bad request.", code: "bad_request" }, 400);

  let purgeAfter: string | null = null;
  if (action === "request") {
    const { data, error } = await auth.client.rpc("request_organisation_deletion", {
      p_organisation_id: organisationId,
      p_confirm_name: String(body?.confirm_name ?? ""),
    });
    if (error) return dbErrorResponse(error, "Couldn't schedule the deletion.");
    purgeAfter = data as string;
  } else {
    const { error } = await auth.client.rpc("cancel_organisation_deletion", { p_organisation_id: organisationId });
    if (error) return dbErrorResponse(error, "Couldn't cancel the deletion.");
  }

  const admin = adminClient();
  const stripeError = await applyStripe(admin, organisationId, action === "request");
  if (stripeError) await admin.from("organisation_deletions").update({ last_error: `stripe: ${stripeError}` }).eq("organisation_id", organisationId);

  // The email now; purge-organisations sends it later if this fails or Resend isn't configured.
  const { data: row } = await admin
    .from("organisation_deletions")
    .select("purge_after, requested_at, organisation:organisations(name)")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (row && Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM")) {
    const kind = action === "request" ? "scheduled" : "cancelled";
    const to = await adminAddresses(admin, organisationId);
    const rendered = deletionEmail(kind, {
      organisationName: (row.organisation as { name?: string } | null)?.name ?? "",
      purgeAfter: row.purge_after,
      now: new Date(),
      appUrl: APP_URL,
    });
    const sent = await sendToAll(sendEmail, to, rendered, `org-deletion-${kind}/${organisationId}/${row.requested_at}`);
    if (sent > 0 || to.length === 0)
      await admin.from("organisation_deletions").update({ [EMAIL_COLUMN[kind]]: new Date().toISOString() }).eq("organisation_id", organisationId);
  }

  return json({ ok: true, purge_after: purgeAfter, stripe: stripeError ? "retrying" : "ok" });
});
