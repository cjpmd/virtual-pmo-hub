// GL-11: deleting an organisation (30 days' notice, cancellable) and closing your own account.
// The edge functions organisation-deletion and close-account call the RPCs as the signed-in
// user (the database checks the role, the typed confirmation and the recent sign-in) and then do
// the Stripe and auth work with the service role. See docs/design/account-closure.md.
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "./functions";
import { unwrapMaybe } from "./service-error";

export interface PendingDeletion {
  requestedAt: string;
  /** The data is deleted after this (normally within a day or two of it). */
  purgeAfter: string;
}

/**
 * The organisation's pending deletion, or null (none, or cancelled). Every member can read the
 * dates (the banner shows them); the service columns aren't granted to the browser.
 */
export async function getPendingDeletion(orgId: string): Promise<PendingDeletion | null> {
  const row = unwrapMaybe(
    await supabase
      .from("organisation_deletions")
      .select("requested_at, purge_after, cancelled_at")
      .eq("organisation_id", orgId)
      .maybeSingle(),
    "Loading the organisation's deletion status",
  );
  if (!row || row.cancelled_at) return null;
  return { requestedAt: row.requested_at, purgeAfter: row.purge_after };
}

/** Schedules the deletion (admins; the name must match exactly). Returns the purge date. */
export async function requestOrganisationDeletion(
  orgId: string,
  confirmName: string,
): Promise<string> {
  const data = await invokeFunction<{ purge_after: string }>(
    "organisation-deletion",
    { action: "request", organisation_id: orgId, confirm_name: confirmName },
    "Couldn't schedule the deletion.",
  );
  return data.purge_after;
}

/** Cancels a pending deletion (any admin, until the purge starts). */
export async function cancelOrganisationDeletion(orgId: string): Promise<void> {
  await invokeFunction(
    "organisation-deletion",
    { action: "cancel", organisation_id: orgId },
    "Couldn't cancel the deletion.",
  );
}

/** Closes the signed-in user's own account. The caller should sign out straight after. */
export async function closeMyAccount(confirmEmail: string): Promise<void> {
  await invokeFunction(
    "close-account",
    { confirm_email: confirmEmail },
    "Couldn't close your account.",
  );
}

/** Whether a typed confirmation matches (organisation name: exact after trimming). */
export const nameMatches = (typed: string, name: string) => typed.trim() === name && name !== "";

/** Whether a typed email matches the account's (case-insensitive, trimmed). */
export const emailMatches = (typed: string, email: string) =>
  email !== "" && typed.trim().toLowerCase() === email.trim().toLowerCase();

/**
 * What the dialogs say for a refusal the functions pass on as `code` (the RPCs' hints). Falls
 * back to the function's own message.
 */
export const DELETION_CODE_MESSAGES: Record<string, string> = {
  name_mismatch: "Type the organisation's name exactly as it is shown.",
  deletion_pending: "This organisation is already scheduled for deletion.",
  demo_org: "The demo organisation can't be deleted.",
  purge_started: "The deletion has already started and can't be cancelled.",
  no_deletion: "This organisation isn't scheduled for deletion.",
  email_mismatch: "Type your email address exactly as it is on your account.",
  reauth_required:
    "For your security, sign out and sign in again, then close your account within 10 minutes.",
  last_admin:
    "You're the last admin of an organisation. Make someone else admin, or delete the organisation, first.",
  closure_not_enabled: "Closing accounts isn't switched on yet. Please contact support.",
  account_closed: "This account is already closed.",
};

export function deletionErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;
  // last_admin names the organisations in the database's message, which is more useful.
  if (code === "last_admin" && message) return message;
  return (code && DELETION_CODE_MESSAGES[code]) || message || fallback;
}
