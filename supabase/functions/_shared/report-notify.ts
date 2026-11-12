// "Draft pack ready" notices (report builder RB-39a). When the scheduled job drafts a pack it
// queues one report_notifications row per report; report-notify drains the queue and emails
// each recipient (the forum's secretary and chair, else PMO / admins) once. Plain TypeScript
// (no Deno globals) so it is unit-tested with stubs.
//   Idempotent: a row is marked sent after its run; each email carries the key
//   report-<id>-draft-ready/<n>, so a crash between sending and marking can't double-send
//   within Resend's idempotency window.
import type { AdminLike, Sender } from "./report-distribution.ts";

export interface PendingNotice {
  id: string;
  report_id: string;
  kind: "draft_ready";
  recipients: Array<{ email: string; name: string | null; role: string }>;
  title: string;
  forum: string | null;
  meeting_date: string | null;
  as_at: string;
  deep_dives: number;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ukDate = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";

export function draftReadyEmail(notice: PendingNotice, link: string) {
  const forum = notice.forum ?? "Your forum";
  const meeting = notice.meeting_date ? ` for ${ukDate(notice.meeting_date)}` : "";
  const subject = `${forum}: draft pack ready${meeting}`;
  const body = `The papers deadline has passed, so ORMO PMO has drafted the pack "${notice.title}" (as at ${ukDate(notice.as_at)}) from the forum's template. ${notice.deep_dives} ${notice.deep_dives === 1 ? "project is" : "projects are"} selected for a deep-dive. Review the selection, write the executive summary and submit it for approval.`;
  return {
    subject,
    text: `${body}\n\nOpen the draft: ${link}`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:620px">
<h1 style="font-size:18px">${escapeHtml(subject)}</h1>
<p style="line-height:1.5">${escapeHtml(body)}</p>
<p><a href="${escapeHtml(link)}" style="background:#0a2a6b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the draft</a></p>
<p style="font-size:12px;color:#555">You get this as the forum's secretary or chair (or as PMO when the forum has neither).</p>
</body></html>`,
  };
}

export const draftLink = (appUrl: string, reportId: string) =>
  `${appUrl.replace(/\/$/, "")}/governance/reports/${reportId}/edit`;

export interface NotifyResult {
  notices: number;
  sent: number;
  failed: number;
  skipped?: string;
}

export async function sendPendingNotices(
  admin: AdminLike,
  appUrl: string,
  send: Sender | null,
): Promise<NotifyResult> {
  const { data, error } = await admin.rpc("pending_report_notifications", {});
  if (error) throw new Error(error.message);
  const notices = (data ?? []) as PendingNotice[];
  if (!notices.length) return { notices: 0, sent: 0, failed: 0 };
  if (!send)
    return { notices: notices.length, sent: 0, failed: 0, skipped: "RESEND_API_KEY is not set" };
  let sent = 0;
  let failed = 0;
  for (const notice of notices) {
    const to = [
      ...new Set(
        notice.recipients
          .map((r) => r.email.trim().toLowerCase())
          .filter((e) => /.+@.+\..+/.test(e)),
      ),
    ].sort();
    const email = draftReadyEmail(notice, draftLink(appUrl, notice.report_id));
    let noticeSent = 0;
    const errors: string[] = [];
    for (const [index, address] of to.entries()) {
      const result = await send({
        to: address,
        ...email,
        idempotencyKey: `report-${notice.report_id}-draft-ready/${index}`,
      });
      if (result.error) errors.push(`${address}: ${result.error}`);
      else noticeSent += 1;
    }
    sent += noticeSent;
    failed += errors.length;
    // A notice with failures stays queued for the next run (sends that went through are
    // protected by their idempotency keys); a clean run is marked sent.
    if (!errors.length)
      await admin.rpc("mark_report_notification_sent", {
        p_id: notice.id,
        p_result: { sent: noticeSent, recipients: to.length },
      });
  }
  return { notices: notices.length, sent, failed };
}

// GL-15 approver reminders. private.queue_approval_reminders (run by the same 15-minute job)
// queues one row per report in review per working day, from the first working day after it was
// submitted, addressed to the people who can approve it (the forum's chair; PMO / admins when
// the forum has no chair or doesn't require approval). The database only returns rows whose
// report is still in review with the same submission, so a decided report is never reminded.
export interface PendingApprovalReminder {
  id: string;
  report_id: string;
  remind_on: string;
  recipients: Array<{ email: string; name: string | null; role: string }>;
  title: string;
  forum: string | null;
  meeting_date: string | null;
  submitted_at: string;
  working_days_waiting: number;
}

export function approvalReminderEmail(reminder: PendingApprovalReminder, link: string) {
  const forum = reminder.forum ?? "Your forum";
  const subject = `${forum}: "${reminder.title}" is waiting for your approval`;
  const waiting = reminder.working_days_waiting;
  const meeting = reminder.meeting_date
    ? ` The meeting is on ${ukDate(reminder.meeting_date)}.`
    : "";
  const body = `The pack "${reminder.title}" was submitted for approval on ${ukDate(reminder.submitted_at.slice(0, 10))} and has been waiting ${waiting} working ${waiting === 1 ? "day" : "days"}.${meeting} Approve it, or return it with a comment saying what needs changing.`;
  return {
    subject,
    text: `${body}\n\nOpen the pack: ${link}\n\nYou'll get this reminder each working day until the pack is approved or returned.`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:620px">
<h1 style="font-size:18px">${escapeHtml(subject)}</h1>
<p style="line-height:1.5">${escapeHtml(body)}</p>
<p><a href="${escapeHtml(link)}" style="background:#0a2a6b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the pack</a></p>
<p style="font-size:12px;color:#555">You get this as the forum's chair (or as PMO when the forum has no chair or doesn't require approval), each working day until the pack is approved or returned.</p>
</body></html>`,
  };
}

export const reportLink = (appUrl: string, reportId: string) =>
  `${appUrl.replace(/\/$/, "")}/governance/reports/${reportId}`;

/** Lower-cased, valid, distinct addresses in a stable order (the order fixes the idempotency keys). */
export const recipientAddresses = (recipients: Array<{ email: string }>) =>
  [
    ...new Set(
      recipients.map((r) => r.email.trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)),
    ),
  ].sort();

export async function sendApprovalReminders(
  admin: AdminLike,
  appUrl: string,
  send: Sender | null,
): Promise<NotifyResult> {
  const { data, error } = await admin.rpc("pending_approval_reminders", {});
  if (error) throw new Error(error.message);
  const reminders = (data ?? []) as PendingApprovalReminder[];
  if (!reminders.length) return { notices: 0, sent: 0, failed: 0 };
  if (!send)
    return { notices: reminders.length, sent: 0, failed: 0, skipped: "RESEND_API_KEY is not set" };
  let sent = 0;
  let failed = 0;
  for (const reminder of reminders) {
    const to = recipientAddresses(reminder.recipients);
    const email = approvalReminderEmail(reminder, reportLink(appUrl, reminder.report_id));
    let reminderSent = 0;
    const errors: string[] = [];
    for (const [index, address] of to.entries()) {
      const result = await send({
        to: address,
        ...email,
        idempotencyKey: `report-${reminder.report_id}-approval/${reminder.remind_on}/${index}`,
      });
      if (result.error) errors.push(`${address}: ${result.error}`);
      else reminderSent += 1;
    }
    sent += reminderSent;
    failed += errors.length;
    // Failures stay queued for the next 15-minute run that day (sends that went through are
    // protected by their idempotency keys); the next day's reminder supersedes it.
    if (!errors.length)
      await admin.rpc("mark_approval_reminder_sent", {
        p_id: reminder.id,
        p_result: { sent: reminderSent, recipients: to.length },
      });
  }
  return { notices: reminders.length, sent, failed };
}
