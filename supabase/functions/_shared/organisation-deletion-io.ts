// GL-11: the Stripe and Supabase calls shared by organisation-deletion and purge-organisations.
// Deno only (Stripe client, service-role queries); the decisions are in organisation-deletion.ts.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { stripe } from "./billing.ts";
import { cleanAddresses, LIVE_STATUSES } from "./organisation-deletion.ts";

export const DELETION_METADATA = "ormo_deletion";

/** Sets (or undoes) cancel-at-period-end for a deletion. Returns an error message or null. */
export async function applyStripe(admin: SupabaseClient, organisationId: string, cancel: boolean): Promise<string | null> {
  const { data: sub } = await admin
    .from("organisation_subscriptions")
    .select("stripe_subscription_id, stripe_schedule_id, status")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (!sub?.stripe_subscription_id || !LIVE_STATUSES.has(sub.status ?? "")) return null;
  try {
    const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    if (cancel) {
      if (current.cancel_at_period_end) return null; // already ending (by the admin, or by us)
      const schedule = typeof current.schedule === "string" ? current.schedule : current.schedule?.id;
      if (schedule) await stripe.subscriptionSchedules.release(schedule);
      await stripe.subscriptions.update(current.id, {
        cancel_at_period_end: true,
        metadata: { [DELETION_METADATA]: "1" },
      });
    } else if (current.metadata?.[DELETION_METADATA] === "1") {
      await stripe.subscriptions.update(current.id, { cancel_at_period_end: false, metadata: { [DELETION_METADATA]: "" } });
    }
    return null;
  } catch (err) {
    console.error("organisation-deletion stripe", organisationId, err);
    return String((err as Error)?.message ?? err).slice(0, 500);
  }
}

/** Every admin's address (service role: the caller may have just lost the right to read them). */
export async function adminAddresses(admin: SupabaseClient, organisationId: string): Promise<string[]> {
  const { data } = await admin
    .from("organisation_members")
    .select("profile:profiles!organisation_members_profile_id_fkey(email)")
    .eq("organisation_id", organisationId)
    .eq("role", "admin");
  // The untyped client sees the embed as an array; PostgREST returns one object (many-to-one).
  type Embed = { email: string | null } | Array<{ email: string | null }> | null;
  return cleanAddresses(
    ((data ?? []) as Array<{ profile: Embed }>).map((m) => (Array.isArray(m.profile) ? m.profile[0]?.email : m.profile?.email)),
  );
}

/** Cancels a live subscription now (the purge), with no proration or final invoice. */
export async function cancelSubscriptionNow(admin: SupabaseClient, organisationId: string): Promise<void> {
  const { data: sub } = await admin
    .from("organisation_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (!sub?.stripe_subscription_id) return;
  const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  if (current.status === "canceled" || current.status === "incomplete_expired") return;
  const schedule = typeof current.schedule === "string" ? current.schedule : current.schedule?.id;
  if (schedule) await stripe.subscriptionSchedules.release(schedule);
  await stripe.subscriptions.cancel(current.id, { prorate: false, invoice_now: false });
}
