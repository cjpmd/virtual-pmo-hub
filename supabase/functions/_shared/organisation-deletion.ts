// GL-11 organisation deletion and account closure: the decisions and emails shared by the
// organisation-deletion, purge-organisations and close-account edge functions. Plain TypeScript
// apart from the shared templates, so it is unit-tested with stubs (organisation-deletion.test.ts).
//   * Which deletion emails are due: scheduled (at the request), reminders 7 days and 1 day before
//     the purge, cancelled. Each is sent once (its *_email_at column) to every organisation admin.
//   * When a purge is due: the deletion is pending and past purge_after, and the mode is "on", or
//     it was asked for by hand for this organisation (private.run_organisation_purges(id, true)).
//   * Storage: every object path starts with the organisation id; walkObjects lists them
//     recursively so the purge can remove them through the Storage API before the database purge,
//     which refuses while any remain.
import { escapeHtml, type EmailMessage, type EmailResult } from "./email.ts";
import { layout, longDate } from "./email-templates.ts";

export type PurgeMode = "off" | "dry_run" | "on";

export interface DeletionRow {
  organisation_id: string;
  requested_at: string;
  purge_after: string;
  cancelled_at: string | null;
  scheduled_email_at: string | null;
  reminder_7_email_at: string | null;
  reminder_1_email_at: string | null;
  cancelled_email_at: string | null;
  purge_started_at: string | null;
  stripe_done_at: string | null;
  storage_done_at: string | null;
  attempts: number;
}

export type DeletionEmailKind = "scheduled" | "reminder_7" | "reminder_1" | "cancelled";

/** The column that records each email as sent. */
export const EMAIL_COLUMN: Record<DeletionEmailKind, keyof DeletionRow> = {
  scheduled: "scheduled_email_at",
  reminder_7: "reminder_7_email_at",
  reminder_1: "reminder_1_email_at",
  cancelled: "cancelled_email_at",
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * The one email due now for a deletion, or null. A request that was cancelled gets only the
 * cancelled email; a pending one gets the scheduled email first, then the reminders when their
 * time comes (the 1-day reminder replaces the 7-day one if both are due, so nobody gets two in a
 * row). Nothing is sent once the purge has started.
 */
export function dueEmail(row: DeletionRow, now: Date): DeletionEmailKind | null {
  if (row.cancelled_at) return row.cancelled_email_at ? null : "cancelled";
  if (row.purge_started_at) return null;
  if (!row.scheduled_email_at) return "scheduled";
  const left = new Date(row.purge_after).getTime() - now.getTime();
  if (left <= DAY && !row.reminder_1_email_at) return "reminder_1";
  if (left <= 7 * DAY && left > DAY && !row.reminder_7_email_at) return "reminder_7";
  return null;
}

/** Is the purge due for this deletion? forceFor = the organisation asked for by hand. */
export function purgeDue(row: DeletionRow, now: Date, mode: PurgeMode, forceFor: string | null): boolean {
  if (row.cancelled_at || mode === "off") return false;
  if (new Date(row.purge_after).getTime() > now.getTime()) return false;
  return mode === "on" || forceFor === row.organisation_id;
}

/** Whole days until the purge, at least 0 (for the emails). */
export const daysLeft = (purgeAfter: string, now: Date) =>
  Math.max(0, Math.ceil((new Date(purgeAfter).getTime() - now.getTime()) / DAY));

/** Stripe statuses that still bill (or may bill again): cancel these at the purge. */
export const LIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

// ------------------------------------------------------------------------------------------
// Storage
// ------------------------------------------------------------------------------------------

export interface StorageLister {
  /** One page of a folder: files have an id, folders don't. */
  list: (
    bucket: string,
    prefix: string,
    options: { limit: number; offset: number },
  ) => PromiseLike<{ data: Array<{ name: string; id: string | null }> | null; error: { message: string } | null }>;
}

/** Every object path under prefix (recursively), in one bucket. Throws on a listing error. */
export async function walkObjects(storage: StorageLister, bucket: string, prefix: string, pageSize = 1000): Promise<string[]> {
  const found: string[] = [];
  const folders = [prefix.replace(/\/$/, "")];
  while (folders.length) {
    const folder = folders.shift()!;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await storage.list(bucket, folder, { limit: pageSize, offset });
      if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
      const page = data ?? [];
      for (const item of page) {
        const path = `${folder}/${item.name}`;
        if (item.id) found.push(path);
        else folders.push(path);
      }
      if (page.length < pageSize) break;
    }
  }
  return found;
}

/** Splits paths into batches for remove() calls. */
export function batches<T>(items: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ------------------------------------------------------------------------------------------
// Recipients and emails
// ------------------------------------------------------------------------------------------

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Valid, de-duplicated (case-insensitive), sorted addresses. */
export function cleanAddresses(addresses: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const a of addresses) {
    const address = (a ?? "").trim().toLowerCase();
    if (ADDRESS.test(address)) out.add(address);
  }
  return [...out].sort();
}

type Rendered = { subject: string; html: string; text: string };

const settingsLink = (appUrl: string) => `${appUrl.replace(/\/$/, "")}/settings/organisation`;
const ADMIN_FOOTER = (org: string) =>
  `You received this because you are an admin of ${escapeHtml(org)} on ORMO PMO. Deletion emails go to every admin of the organisation.`;

export function deletionEmail(
  kind: DeletionEmailKind,
  input: { organisationName: string; purgeAfter: string; now: Date; appUrl: string },
): Rendered {
  const org = input.organisationName || "Your organisation";
  const date = longDate(input.purgeAfter);
  const link = settingsLink(input.appUrl);
  let subject: string;
  let heading: string;
  let lines: string[];
  let button: string;
  switch (kind) {
    case "scheduled":
      subject = `${org} will be deleted on ${date}`;
      heading = `${org} is scheduled for deletion`;
      lines = [
        `An admin asked to delete ${org} on ORMO PMO. It is now read-only for everyone, and all its data will be deleted on ${date}.`,
        "Any admin can cancel the deletion before then in Settings › Organisation. Cancelling restores editing straight away.",
        "Before then, admins can export the organisation's data. After the deletion it can't be recovered.",
      ];
      button = "Review or cancel";
      break;
    case "reminder_7":
    case "reminder_1": {
      const days = daysLeft(input.purgeAfter, input.now);
      const when = days <= 1 ? "tomorrow" : `in ${days} days`;
      subject = `Reminder: ${org} will be deleted ${when}`;
      heading = `${org} will be deleted ${when}`;
      lines = [
        `${org} is scheduled for deletion on ${date}. All its data will be deleted then and can't be recovered.`,
        "To keep it, any admin can cancel the deletion in Settings › Organisation. Export anything you need first.",
      ];
      button = "Review or cancel";
      break;
    }
    case "cancelled":
    default:
      subject = `Deletion of ${org} cancelled`;
      heading = "The deletion has been cancelled";
      lines = [
        `An admin cancelled the deletion of ${org}. Nothing has been deleted.`,
        "Editing is back if the organisation's trial or subscription allows it. If the subscription was set to end because of the deletion, it has been set to renew again.",
      ];
      button = "Open settings";
      break;
  }
  const html = layout(lines[0], heading, lines.map(escapeHtml), { label: button, url: link }, ADMIN_FOOTER(org));
  const text = [...lines, "", `${button}: ${link}`].join("\n");
  return { subject, html, text };
}

export function organisationDeletedEmail(input: { organisationName: string; appUrl: string }): Rendered {
  const org = input.organisationName || "Your organisation";
  const subject = `${org} has been deleted from ORMO PMO`;
  const lines = [
    `${org} and all its data have been deleted from ORMO PMO, as an admin asked 30 days ago.`,
    "Your own account hasn't been closed. If you no longer need it, you can close it in Settings › Account settings.",
    "Billing records stay with Stripe for the period the law requires.",
  ];
  const html = layout(lines[0], `${org} has been deleted`, lines.map(escapeHtml), { label: "Open ORMO PMO", url: input.appUrl }, ADMIN_FOOTER(org));
  return { subject, html, text: [...lines, "", input.appUrl].join("\n") };
}

export function accountClosedEmail(input: { appUrl: string }): Rendered {
  const subject = "Your ORMO PMO account has been closed";
  const lines = [
    "Your ORMO PMO account has been closed and you have been signed out. You can no longer sign in with it.",
    "Records you added stay with the organisations you belonged to, shown as \"Former member\".",
    "If you didn't close your account, reply to this email straight away.",
  ];
  const html = layout(lines[0], "Your account has been closed", lines.map(escapeHtml), { label: "Open ORMO PMO", url: input.appUrl },
    "You received this because this address belonged to an ORMO PMO account that was just closed.");
  return { subject, html, text: [...lines, "", input.appUrl].join("\n") };
}

export type SendEmail = (message: EmailMessage) => Promise<EmailResult>;

/** Sends one rendered email to each address; returns how many went. Keys make retries safe. */
export async function sendToAll(send: SendEmail, to: string[], rendered: Rendered, key: string): Promise<number> {
  let sent = 0;
  for (const address of to) {
    const { error } = await send({
      to: address,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `${key}/${address}`,
      tags: [{ name: "type", value: key.split("/")[0] }],
    });
    if (!error) sent += 1;
  }
  return sent;
}
