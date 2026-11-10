// GL-6 trial and payment emails to organisation admins. The daily pg_cron job queues
// billing_notices rows (trial_ending, trial_ended, read_only) and stripe-webhook queues
// payment_failed; send-billing-notice (and the webhook, straight after queueing) drains them here.
// Plain TypeScript apart from the shared templates, so it is unit-tested with stubs.
//   * Each notice is re-checked by the database (still_applies) and skipped if the organisation
//     has since subscribed, paid or had its trial extended.
//   * Admin addresses Resend last reported as bounced or suppressed are not emailed; they are
//     counted in skipped_count, and a notice with no one left to email is marked skipped.
//   * Each email carries the key billing-<notice id>/<address>, so a retry inside Resend's
//     24-hour idempotency window can't send twice.
import { escapeHtml, type EmailMessage, type EmailResult } from "./email.ts";
import { layout, longDate } from "./email-templates.ts";

export type BillingNoticeKind = "trial_ending" | "trial_ended" | "payment_failed" | "read_only";

export interface PendingBillingNotice {
  id: string;
  organisation_id: string;
  organisation_name: string;
  kind: BillingNoticeKind;
  period_key: string;
  details: Record<string, unknown>;
  attempts: number;
  /** Stripe status now (null = never subscribed). */
  status: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  writable: boolean;
  still_applies: boolean;
  recipients: Array<{ email: string; name: string | null; bounced: boolean }>;
}

export interface AdminRpc {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export type SendEmail = (message: EmailMessage) => Promise<EmailResult>;

export interface BillingNoticeResult {
  notices: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Set when nothing was attempted (no Resend configuration). */
  reason?: string;
}

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const subscriptionLink = (appUrl: string) => `${appUrl.replace(/\/$/, "")}/settings/subscription`;

/** "£12.00" from Stripe's minor units; null when the amount isn't known. */
export function formatAmount(minor: unknown, currency: unknown): string | null {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return null;
  const code = typeof currency === "string" && currency ? currency.toUpperCase() : "GBP";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
}

/** Who to email and who to skip: valid, de-duplicated (case-insensitive) addresses, sorted. */
export function splitRecipients(recipients: PendingBillingNotice["recipients"]) {
  const send = new Set<string>();
  const bounced = new Set<string>();
  for (const r of recipients ?? []) {
    const address = (r.email ?? "").trim().toLowerCase();
    if (!ADDRESS.test(address)) continue;
    (r.bounced ? bounced : send).add(address);
  }
  for (const address of bounced) send.delete(address);
  return { send: [...send].sort(), bounced: [...bounced].sort() };
}

const FOOTER = (org: string) =>
  `You received this because you are an admin of ${escapeHtml(org)} on ORMO PMO. Billing emails go to every admin of the organisation.`;
const KEEP = "Nothing is deleted: everyone can still sign in, read and export.";

export function billingNoticeEmail(notice: PendingBillingNotice, appUrl: string) {
  const org = notice.organisation_name || "Your organisation";
  const link = subscriptionLink(appUrl);
  const trialEnd = notice.trial_ends_at ?? (notice.details?.trial_ends_at as string | undefined) ?? null;
  let subject: string;
  let heading: string;
  let lines: string[];
  let button: string;

  switch (notice.kind) {
    case "trial_ending": {
      const date = trialEnd ? longDate(trialEnd) : "soon";
      subject = `Your ORMO PMO trial for ${org} ends on ${date}`;
      heading = "Your free trial ends soon";
      lines = [
        `The free trial for ${org} ends on ${date}.`,
        "Subscribe before then to keep editing. Paid seats are for members who edit; viewers are free.",
        `If you don't subscribe, ${org} becomes read-only when the trial ends. ${KEEP} You can subscribe at any time to restore editing.`,
      ];
      button = "Subscribe";
      break;
    }
    case "trial_ended": {
      subject = `${org} is now read-only: your ORMO PMO trial has ended`;
      heading = "Your free trial has ended";
      lines = [
        `The free trial for ${org} has ended, so the organisation is now read-only.`,
        `${KEEP} Subscribe to restore editing straight away.`,
      ];
      button = "Subscribe";
      break;
    }
    case "payment_failed": {
      const amount = formatAmount(notice.details?.amount_due, notice.details?.currency);
      const by = notice.grace_ends_at ? longDate(notice.grace_ends_at) : null;
      subject = `Payment failed for ${org} on ORMO PMO`;
      heading = "We couldn't take your payment";
      lines = [
        `The payment${amount ? ` of ${amount}` : ""} for ${org}'s ORMO PMO subscription didn't go through. Stripe will try the card again.`,
        by
          ? `Update the card by ${by} to keep editing. After that, ${org} becomes read-only until the payment goes through.`
          : `Update the card to keep editing. If the payment isn't made, ${org} becomes read-only until it is.`,
        KEEP,
      ];
      button = "Update card";
      break;
    }
    case "read_only":
    default: {
      const ended = notice.status === "canceled" || notice.status === "incomplete_expired";
      subject = `${org} is now read-only on ORMO PMO`;
      heading = `${org} is now read-only`;
      lines = [
        ended
          ? `The ORMO PMO subscription for ${org} has ended, so the organisation is now read-only.`
          : `The payment for ${org}'s ORMO PMO subscription is overdue, so the organisation is now read-only.`,
        `${KEEP} ${ended ? "Subscribe again" : "Update the card or subscribe again"} to restore editing.`,
      ];
      button = ended ? "Subscribe" : "Update card";
      break;
    }
  }

  const html = layout(lines[0], heading, lines.map(escapeHtml), { label: button, url: link }, FOOTER(org));
  const text = [
    ...lines.flatMap((line) => [line, ""]),
    `${button} in Settings › Subscription:`,
    link,
    "",
    `You received this because you are an admin of ${org} on ORMO PMO. Billing emails go to every admin of the organisation.`,
  ].join("\n");
  return { subject, html, text };
}

async function mark(
  admin: AdminRpc,
  id: string,
  outcome: "sent" | "skipped" | "error",
  recipients: number,
  skipped: number,
  error: string | null,
) {
  const { error: rpcError } = await admin.rpc("mark_billing_notice", {
    p_id: id,
    p_outcome: outcome,
    p_recipient_count: recipients,
    p_skipped_count: skipped,
    p_error: error,
  });
  if (rpcError) console.error("billing-notices: mark", id, rpcError.message);
}

export async function sendBillingNotices(
  admin: AdminRpc,
  appUrl: string,
  send: SendEmail | null,
  only?: { organisationId?: string },
): Promise<BillingNoticeResult> {
  const { data, error } = await admin.rpc("pending_billing_notices", {});
  if (error) throw new Error(error.message);
  const notices = ((data ?? []) as PendingBillingNotice[]).filter(
    (n) => !only?.organisationId || n.organisation_id === only.organisationId,
  );
  const result: BillingNoticeResult = { notices: notices.length, sent: 0, skipped: 0, failed: 0 };
  if (!notices.length) return result;
  if (!send) return { ...result, reason: "RESEND_API_KEY or RESEND_FROM is not set" };

  for (const notice of notices) {
    if (!notice.still_applies) {
      await mark(admin, notice.id, "skipped", 0, 0, "no longer applies");
      result.skipped += 1;
      continue;
    }
    const { send: to, bounced } = splitRecipients(notice.recipients);
    if (!to.length) {
      await mark(
        admin,
        notice.id,
        "skipped",
        0,
        bounced.length,
        bounced.length ? "every admin address bounced" : "no admin with an email address",
      );
      result.skipped += 1;
      continue;
    }
    const email = billingNoticeEmail(notice, appUrl);
    const errors: string[] = [];
    let delivered = 0;
    for (const address of to) {
      const sent = await send({
        to: address,
        ...email,
        idempotencyKey: `billing-${notice.id}/${address}`,
        tags: [{ name: "type", value: `billing_${notice.kind}` }],
      });
      if (sent.error) errors.push(`${sent.error.status} ${sent.error.name}: ${sent.error.message}`);
      else delivered += 1;
    }
    if (errors.length) {
      // Stays pending for the next run (five tries in all); addresses that went through are
      // protected by their idempotency keys within Resend's 24-hour window.
      await mark(admin, notice.id, "error", delivered, bounced.length, errors.join("; "));
      result.failed += 1;
    } else {
      await mark(admin, notice.id, "sent", delivered, bounced.length, null);
      result.sent += 1;
    }
  }
  return result;
}
