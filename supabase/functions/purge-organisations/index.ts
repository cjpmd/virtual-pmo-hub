// GL-11: the daily deletion job. Service role only: called by pg_cron through pg_net
// (private.run_organisation_purges, URL from the Vault secret organisation_purge_url, key from
// report_notify_service_key), at 08:xx Europe/London, or by hand for one organisation:
//   select private.run_organisation_purges('<organisation id>', true);
// Body: { mode, organisation_id?, force? }. The mode is read from the database again
// (organisation_purge_mode), so a request can't switch purging on.
// For each deletion request:
//   1. the email that is due (scheduled, 7-day and 1-day reminders, cancelled) to every admin;
//   2. while pending: Stripe set to cancel at period end (re-applied daily, idempotent);
//   3. when due and the mode is "on", or by hand for this organisation: claim it (no cancelling
//      after this), cancel a live subscription now, remove its Storage objects through the Storage
//      API, run public.purge_organisation (which refuses while any object remains), then email
//      the admins captured before the purge. Each step is recorded, so a failed run resumes;
//   4. in dry_run, a due deletion is only counted (purge_organisation dry run) and logged.
// Then it retries deleting the auth user of any closed account whose deletion failed.
// Secrets: STRIPE_SECRET_KEY, RESEND_API_KEY, RESEND_FROM, APP_URL; optional OPS_ALERT_EMAIL.
import { APP_URL, UUID, adminClient, json, serve } from "../_shared/http.ts";
import { sendEmail } from "../_shared/email.ts";
import { isServiceRoleRequest } from "../_shared/service-role.ts";
import {
  batches,
  deletionEmail,
  dueEmail,
  EMAIL_COLUMN,
  organisationDeletedEmail,
  purgeDue,
  sendToAll,
  walkObjects,
  type DeletionRow,
  type PurgeMode,
} from "../_shared/organisation-deletion.ts";
import { adminAddresses, applyStripe, cancelSubscriptionNow } from "../_shared/organisation-deletion-io.ts";

const MAX_ATTEMPTS_BEFORE_ALERT = 3;

serve("purge-organisations", async (req) => {
  if (!isServiceRoleRequest(req.headers.get("Authorization"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")))
    return json({ error: "Service role only." }, 403);
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const { data: modeData } = await admin.rpc("organisation_purge_mode");
  const mode = (modeData ?? "off") as PurgeMode;
  if (mode === "off") return json({ mode, skipped: true });
  const only = UUID.test(String(body?.organisation_id ?? "")) ? String(body.organisation_id) : null;
  const forceFor = body?.force === true ? only : null;
  const emailOn = Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM"));
  const now = new Date();
  const report: Record<string, unknown>[] = [];

  let query = admin.from("organisation_deletions").select("*, organisation:organisations(name)");
  if (only) query = query.eq("organisation_id", only);
  const { data: rows, error } = await query;
  if (error) return json({ error: error.message }, 500);

  for (const raw of rows ?? []) {
    const row = raw as DeletionRow & { organisation: { name: string } | null; last_error: string | null };
    const org = row.organisation_id;
    const name = row.organisation?.name ?? "";
    const entry: Record<string, unknown> = { organisation_id: org };
    report.push(entry);

    // 1. Emails.
    const kind = dueEmail(row, now);
    if (kind && emailOn) {
      const to = await adminAddresses(admin, org);
      const rendered = deletionEmail(kind, { organisationName: name, purgeAfter: row.purge_after, now, appUrl: APP_URL });
      const sent = await sendToAll(sendEmail, to, rendered, `org-deletion-${kind.replace("_", "-")}/${org}/${row.requested_at}`);
      if (sent > 0 || to.length === 0)
        await admin.from("organisation_deletions").update({ [EMAIL_COLUMN[kind]]: now.toISOString() }).eq("organisation_id", org);
      entry.email = { kind, sent, of: to.length };
    }
    if (row.cancelled_at) continue;

    // 2. Stripe set to end while pending.
    if (!row.purge_started_at) {
      const stripeError = await applyStripe(admin, org, true);
      if (stripeError) entry.stripe_error = stripeError;
    }

    // 3 / 4. The purge.
    const pastDue = new Date(row.purge_after).getTime() <= now.getTime();
    if (!pastDue) continue;
    if (!purgeDue(row, now, mode, forceFor) && !row.purge_started_at) {
      const { data: dry } = await admin.rpc("purge_organisation", { p_organisation_id: org, p_dry_run: true });
      entry.dry_run = { total: (dry as { total?: number })?.total, storage_objects: (dry as { storage_objects?: number })?.storage_objects };
      console.log("purge-organisations dry run", org, dry);
      continue;
    }
    try {
      if (!row.purge_started_at) {
        const { data: claimed } = await admin
          .from("organisation_deletions")
          .update({ purge_started_at: now.toISOString() })
          .eq("organisation_id", org)
          .is("cancelled_at", null)
          .is("purge_started_at", null)
          .lte("purge_after", now.toISOString())
          .select("organisation_id");
        if (!claimed?.length) {
          entry.skipped = "cancelled or claimed meanwhile";
          continue;
        }
      }
      if (!row.stripe_done_at) {
        await cancelSubscriptionNow(admin, org);
        await admin.from("organisation_deletions").update({ stripe_done_at: new Date().toISOString() }).eq("organisation_id", org);
      }
      if (!row.storage_done_at) {
        const counts: Record<string, number> = {};
        const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
        if (bucketError) throw new Error(`list buckets: ${bucketError.message}`);
        for (const bucket of buckets ?? []) {
          const paths = await walkObjects(
            { list: (b, prefix, options) => admin.storage.from(b).list(prefix, options) },
            bucket.id,
            org,
          );
          for (const chunk of batches(paths)) {
            const { error: removeError } = await admin.storage.from(bucket.id).remove(chunk);
            if (removeError) throw new Error(`remove ${bucket.id}: ${removeError.message}`);
          }
          if (paths.length) counts[bucket.id] = paths.length;
        }
        await admin
          .from("organisation_deletions")
          .update({ storage_done_at: new Date().toISOString(), storage_counts: counts })
          .eq("organisation_id", org);
        entry.storage = counts;
      }
      const to = await adminAddresses(admin, org);
      const { data: result, error: purgeError } = await admin.rpc("purge_organisation", { p_organisation_id: org, p_dry_run: false });
      if (purgeError) throw new Error(`purge: ${purgeError.message} (${purgeError.hint ?? purgeError.code})`);
      entry.purged = { total: (result as { total?: number })?.total, passes: (result as { passes?: number })?.passes };
      console.log("purge-organisations purged", org, result);
      if (emailOn) entry.deleted_email = await sendToAll(sendEmail, to, organisationDeletedEmail({ organisationName: name, appUrl: APP_URL }), `org-deleted/${org}`);
    } catch (err) {
      const message = String((err as Error)?.message ?? err).slice(0, 2000);
      console.error("purge-organisations", org, message);
      const attempts = (row.attempts ?? 0) + 1;
      await admin.from("organisation_deletions").update({ attempts, last_error: message }).eq("organisation_id", org);
      entry.error = message;
      const alert = Deno.env.get("OPS_ALERT_EMAIL");
      if (alert && emailOn && attempts >= MAX_ATTEMPTS_BEFORE_ALERT)
        await sendEmail({
          to: alert,
          subject: `Organisation purge failing: ${org}`,
          html: `<p>The purge of organisation ${org} has failed ${attempts} times.</p><p>${message.replace(/</g, "&lt;")}</p>`,
          text: `The purge of organisation ${org} has failed ${attempts} times.\n\n${message}`,
          idempotencyKey: `org-purge-alert/${org}/${attempts}`,
        });
    }
  }

  // Closed accounts whose auth user is still there.
  const closures: Record<string, unknown>[] = [];
  if (!only) {
    const { data: pending } = await admin.rpc("account_closures_pending");
    for (const id of (pending as string[] | null) ?? []) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(id);
      closures.push({ profile_id: id, deleted: !deleteError, error: deleteError?.message });
    }
  }

  const summary = { mode, deletions: report, closures };
  console.log("purge-organisations", JSON.stringify(summary));
  return json(summary);
});
