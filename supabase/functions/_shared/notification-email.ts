// GL-13 notification emails. send-notification-email (called by the vpmo-notifications job every
// 15 minutes) drains them here. Plain TypeScript apart from the shared templates, so it is
// unit-tested with stubs.
//   * mode "immediate": one email per person and organisation with what was raised since the
//     last run, for people whose digest is "as they happen".
//   * mode "digest": the daily digest (weekly people on Mondays), once a day from 07:30 London.
//   * mode "all": both, then the database is told the day's digest is done.
// The database decides who gets what (organisation and personal settings, read or resolved rows,
// read-only organisations) and marks the rest skipped; this only formats, sends and marks.
// Each email carries the key notifications/<organisation>/<person>/<first id>/<count>, so a retry
// inside Resend's 24-hour window can't send twice.
import { escapeHtml, type EmailMessage, type EmailResult } from "./email.ts";
import { layout } from "./email-templates.ts";

export type NotificationKind =
  | "task_overdue"
  | "task_issued"
  | "decision_due"
  | "decision_recorded"
  | "measurement_overdue"
  | "dependency_off_track"
  | "pack_drafted";

export interface PendingNotificationEmail {
  organisation_id: string;
  organisation_name: string;
  recipient_id: string;
  email: string;
  name: string | null;
  digest: "immediate" | "daily" | "weekly";
  /** Every waiting notification; at most 50 are in `items`. */
  total: number;
  items: Array<{ id: string; kind: NotificationKind; text: string; link: string | null; due_date: string }>;
  unsubscribe_token: string;
}

export interface AdminRpc {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export type SendEmail = (message: EmailMessage) => Promise<EmailResult>;
export type Mode = "immediate" | "digest" | "all";

export interface NotificationEmailResult {
  emails: number;
  sent: number;
  failed: number;
  skipped: number;
  digestDone?: boolean;
  reason?: string;
}

const KIND_LABEL: Record<NotificationKind, string> = {
  task_overdue: "Overdue tasks",
  task_issued: "Tasks issued to you",
  decision_due: "Decisions due",
  decision_recorded: "Decisions recorded",
  measurement_overdue: "Overdue measurements",
  dependency_off_track: "Dependencies off track",
  pack_drafted: "Draft packs",
};
const KIND_ORDER = Object.keys(KIND_LABEL) as NotificationKind[];
const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const base = (appUrl: string) => appUrl.replace(/\/$/, "");
export const unsubscribeLink = (appUrl: string, token: string) =>
  `${base(appUrl)}/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
export const settingsLink = (appUrl: string) => `${base(appUrl)}/settings/account`;
/** An app path from the database ("/home/my-work") as a full link; anything else is ignored. */
export const itemLink = (appUrl: string, link: string | null) =>
  link && link.startsWith("/") && !link.startsWith("//") ? `${base(appUrl)}${link}` : null;

/** Items grouped by kind, in a fixed order. */
export function groupItems(items: PendingNotificationEmail["items"]) {
  return KIND_ORDER.map((kind) => ({ kind, label: KIND_LABEL[kind], items: items.filter((i) => i.kind === kind) })).filter(
    (group) => group.items.length > 0,
  );
}

export function notificationEmail(entry: PendingNotificationEmail, appUrl: string, mode: "immediate" | "digest") {
  const org = entry.organisation_name || "your organisation";
  const count = entry.total;
  const noun = count === 1 ? "notification" : "notifications";
  const subject =
    mode === "immediate"
      ? count === 1
        ? `ORMO PMO: ${entry.items[0]?.text ?? "a new notification"}`
        : `ORMO PMO: ${count} new ${noun} in ${org}`
      : `Your ${entry.digest === "weekly" ? "weekly" : "daily"} ORMO PMO digest: ${count} ${noun} in ${org}`;
  const heading = mode === "immediate" ? `New in ${org}` : `Your ${entry.digest === "weekly" ? "weekly" : "daily"} digest for ${org}`;
  const groups = groupItems(entry.items);
  const more = count > entry.items.length ? count - entry.items.length : 0;

  const html = layout(
    `${count} ${noun} in ${org}`,
    heading,
    [
      ...groups.map(
        (g) =>
          `<strong>${escapeHtml(g.label)}</strong><br>` +
          g.items
            .map((i) => {
              const href = itemLink(appUrl, i.link);
              return href
                ? `<a href="${escapeHtml(href)}" style="color:#1f4e8c;">${escapeHtml(i.text)}</a>`
                : escapeHtml(i.text);
            })
            .join("<br>"),
      ),
      ...(more ? [escapeHtml(`And ${more} more in the app.`)] : []),
    ],
    { label: "Open notifications", url: `${base(appUrl)}/home/notifications` },
    `You get these emails because you are a member of ${escapeHtml(org)} on ORMO PMO. ` +
      `<a href="${escapeHtml(settingsLink(appUrl))}" style="color:#7b8794;">Change what you're sent</a> or ` +
      `<a href="${escapeHtml(unsubscribeLink(appUrl, entry.unsubscribe_token))}" style="color:#7b8794;">unsubscribe from notification emails</a>.`,
  );
  const text = [
    heading,
    "",
    ...groups.flatMap((g) => [
      g.label,
      ...g.items.map((i) => {
        const href = itemLink(appUrl, i.link);
        return `- ${i.text}${href ? ` ${href}` : ""}`;
      }),
      "",
    ]),
    ...(more ? [`And ${more} more in the app.`, ""] : []),
    `Open notifications: ${base(appUrl)}/home/notifications`,
    "",
    `Change what you're sent: ${settingsLink(appUrl)}`,
    `Unsubscribe from notification emails: ${unsubscribeLink(appUrl, entry.unsubscribe_token)}`,
  ].join("\n");
  return { subject: subject.length > 200 ? `${subject.slice(0, 197)}…` : subject, html, text };
}

async function sendMode(
  admin: AdminRpc,
  appUrl: string,
  send: SendEmail,
  mode: "immediate" | "digest",
  result: NotificationEmailResult,
) {
  const { data, error } = await admin.rpc("pending_notification_emails", { p_mode: mode });
  if (error) throw new Error(error.message);
  const entries = (data ?? []) as PendingNotificationEmail[];
  for (const entry of entries) {
    result.emails += 1;
    const ids = entry.items.map((i) => i.id);
    const address = (entry.email ?? "").trim().toLowerCase();
    if (!ADDRESS.test(address) || !ids.length) {
      await mark(admin, ids, "skipped");
      result.skipped += 1;
      continue;
    }
    const email = notificationEmail(entry, appUrl, mode);
    const sent = await send({
      to: address,
      ...email,
      idempotencyKey: `notifications/${entry.organisation_id}/${entry.recipient_id}/${ids[0]}/${ids.length}`,
      tags: [{ name: "type", value: mode === "immediate" ? "notification" : "notification_digest" }],
    });
    if (sent.error) {
      // Left waiting: the next run (or tomorrow's digest) tries again.
      result.failed += 1;
      continue;
    }
    await mark(admin, ids, "sent");
    result.sent += 1;
  }
}

async function mark(admin: AdminRpc, ids: string[], outcome: "sent" | "skipped") {
  if (!ids.length) return;
  const { error } = await admin.rpc("mark_notification_emails", { p_ids: ids, p_outcome: outcome });
  if (error) console.error("notification-email: mark", outcome, ids.length, error.message);
}

export async function sendNotificationEmails(
  admin: AdminRpc,
  appUrl: string,
  send: SendEmail | null,
  mode: Mode,
): Promise<NotificationEmailResult> {
  const result: NotificationEmailResult = { emails: 0, sent: 0, failed: 0, skipped: 0 };
  if (!send) return { ...result, reason: "RESEND_API_KEY or RESEND_FROM is not set" };
  if (mode === "immediate" || mode === "all") await sendMode(admin, appUrl, send, "immediate", result);
  if (mode === "digest" || mode === "all") {
    await sendMode(admin, appUrl, send, "digest", result);
    const { error } = await admin.rpc("mark_notification_digest_done", {});
    if (error) console.error("notification-email: digest done", error.message);
    result.digestDone = !error;
  }
  return result;
}

export const parseMode = (value: unknown): Mode | null =>
  value === "immediate" || value === "digest" || value === "all" ? value : null;
