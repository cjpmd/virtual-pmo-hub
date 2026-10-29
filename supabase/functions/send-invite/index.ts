// Work package 2.1. Creates or resends organisation invitations and emails them through Resend.
// Every permission, seat, workspace and rate-limit check runs in the database: create_invites and
// resend_invite are called as the signed-in admin. This function only makes the token (stored as
// a SHA-256 hash by issue_invite_token, service role), sends the email, and records the outcome
// with mark_invite_sent. A failed send clears the token, so the Members page shows "Not sent".
// The Resend email id is stored (record_invite_email_id) so resend-webhook can track delivery.
// Secrets: RESEND_API_KEY, RESEND_FROM, APP_URL. SUPABASE_* are provided by the platform.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { APP_URL, UUID, adminClient, dbErrorResponse, json, serve, signedIn } from "../_shared/http.ts";
import { sendEmail } from "../_shared/email.ts";
import { inviteEmail } from "../_shared/email-templates.ts";
import { generateInviteToken, hashInviteToken, inviteLink, toByteaHex } from "../_shared/invite-token.ts";

const ROLES = ["viewer", "contributor", "manager", "pmo", "admin"];

type Delivery = { emailStatus: "sent" | "failed"; emailError?: string };

/** Issues a fresh token for an open invitation, emails it, and records the result. */
async function deliver(admin: SupabaseClient, inviteId: string, actorId: string): Promise<Delivery> {
  const token = generateInviteToken();
  const hash = await hashInviteToken(token);
  const { data: info, error: issueError } = await admin.rpc("issue_invite_token", {
    p_invite_id: inviteId,
    p_token_hash: toByteaHex(hash),
    p_actor: actorId,
  });
  if (issueError || !info) {
    console.error("send-invite: issue_invite_token", issueError);
    return { emailStatus: "failed", emailError: issueError?.message ?? "The invitation can't be sent." };
  }

  const email = inviteEmail({
    organisationName: info.organisation_name,
    inviterName: info.inviter_name,
    role: info.role,
    link: inviteLink(APP_URL, token),
    expiresAt: info.expires_at,
  });
  const { data: sent, error } = await sendEmail({
    to: info.email,
    ...email,
    // Each send has a new token, so a resend never reuses the key of an earlier (failed) send.
    idempotencyKey: `invite/${inviteId}/${hash.slice(0, 16)}`,
    tags: [{ name: "type", value: "invite" }],
  });

  const { error: markError } = await admin.rpc("mark_invite_sent", {
    p_invite_id: inviteId,
    p_actor: actorId,
    p_error: error ? `${error.status} ${error.name}: ${error.message}` : null,
  });
  if (markError) console.error("send-invite: mark_invite_sent", markError);
  // Remember which Resend email this is, so resend-webhook can match bounces and deliveries.
  if (sent) {
    const { error: idError } = await admin.rpc("record_invite_email_id", { p_invite_id: inviteId, p_email_id: sent.id });
    if (idError) console.error("send-invite: record_invite_email_id", idError);
  }
  return error ? { emailStatus: "failed", emailError: "The email couldn’t be sent. Use Resend invite to try again." } : { emailStatus: "sent" };
}

serve("send-invite", async (req) => {
  const caller = await signedIn(req);
  if (!caller) return json({ error: "Sign in again to invite people." }, 401);
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();

  if (body.action === "create") {
    const organisationId = String(body.organisationId ?? "");
    const invites = Array.isArray(body.invites) ? body.invites : null;
    const workspaceIds = Array.isArray(body.workspaceIds) ? body.workspaceIds.map(String) : [];
    if (
      !UUID.test(organisationId) ||
      !invites ||
      invites.some((item: unknown) => typeof (item as { email?: unknown })?.email !== "string" || !ROLES.includes(String((item as { role?: unknown })?.role))) ||
      workspaceIds.some((id: string) => !UUID.test(id))
    ) {
      return json({ error: "Invalid request." }, 400);
    }
    const { data, error } = await caller.client.rpc("create_invites", {
      p_organisation_id: organisationId,
      p_invites: invites.map((item: { email: string; role: string }) => ({ email: item.email, role: item.role })),
      p_workspace_ids: workspaceIds,
    });
    if (error) return dbErrorResponse(error, "Couldn't create the invitations.");

    // Sent one after another: the Resend client paces requests to its rate limit.
    const results = [];
    for (const result of data as Array<{ email: string; outcome: string; invite_id?: string }>) {
      if (result.outcome !== "created" || !result.invite_id) {
        results.push({ email: result.email, outcome: result.outcome });
        continue;
      }
      results.push({
        email: result.email,
        outcome: result.outcome,
        inviteId: result.invite_id,
        ...(await deliver(admin, result.invite_id, caller.user.id)),
      });
    }
    return json({ results });
  }

  if (body.action === "resend") {
    const inviteId = String(body.inviteId ?? "");
    if (!UUID.test(inviteId)) return json({ error: "Invalid request." }, 400);
    const { error } = await caller.client.rpc("resend_invite", { p_invite_id: inviteId });
    if (error) return dbErrorResponse(error, "Couldn't resend the invitation.");
    return json({ inviteId, ...(await deliver(admin, inviteId, caller.user.id)) });
  }

  return json({ error: "Invalid request." }, 400);
});
