import { describe, expect, it, vi } from "vitest";
import type { AdminLike, Sender } from "./report-distribution";
import {
  approvalReminderEmail,
  draftReadyEmail,
  recipientAddresses,
  sendApprovalReminders,
  sendPendingNotices,
  type PendingApprovalReminder,
  type PendingNotice,
} from "./report-notify";

const notice = (overrides: Partial<PendingNotice> = {}): PendingNotice => ({
  id: "n1",
  report_id: "r1",
  kind: "draft_ready",
  recipients: [
    { email: "Chair@Example.org", name: "Chair", role: "chair" },
    { email: "sec@example.org", name: "Sec", role: "secretary" },
    { email: "chair@example.org", name: "Chair", role: "chair" },
  ],
  title: "Board — 12 Nov",
  forum: "Digital Care Programme Board",
  meeting_date: "2026-11-12",
  as_at: "2026-11-05",
  deep_dives: 3,
  ...overrides,
});

const admin = (rows: PendingNotice[]) => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const client: AdminLike = {
    rpc: (fn, args) => {
      calls.push([fn, args]);
      return Promise.resolve({
        data: fn === "pending_report_notifications" ? rows : null,
        error: null,
      });
    },
  };
  return { client, calls };
};

describe("draftReadyEmail", () => {
  it("names the forum and meeting and links to the draft", () => {
    const email = draftReadyEmail(notice(), "https://app/governance/reports/r1/edit");
    expect(email.subject).toBe("Digital Care Programme Board: draft pack ready for 12/11/2026");
    expect(email.text).toContain("3 projects are selected");
    expect(email.text).toContain("https://app/governance/reports/r1/edit");
  });
});

describe("sendPendingNotices", () => {
  it("emails each recipient once with per-report idempotency keys and marks the notice sent", async () => {
    const { client, calls } = admin([notice()]);
    const send = vi.fn<Sender>().mockResolvedValue({ id: "e", error: null });
    expect(await sendPendingNotices(client, "https://app", send)).toEqual({
      notices: 1,
      sent: 2,
      failed: 0,
    });
    expect(send.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([
      "report-r1-draft-ready/0",
      "report-r1-draft-ready/1",
    ]);
    expect(
      calls.some(([fn, args]) => fn === "mark_report_notification_sent" && args["p_id"] === "n1"),
    ).toBe(true);
  });
  it("keeps a notice queued when a send fails", async () => {
    const { client, calls } = admin([notice()]);
    const send = vi
      .fn<Sender>()
      .mockResolvedValueOnce({ id: null, error: "500" })
      .mockResolvedValue({ id: "e", error: null });
    expect(await sendPendingNotices(client, "https://app", send)).toMatchObject({
      sent: 1,
      failed: 1,
    });
    expect(calls.some(([fn]) => fn === "mark_report_notification_sent")).toBe(false);
  });
  it("sends nothing without a Resend key, and leaves the queue as it is", async () => {
    const { client, calls } = admin([notice()]);
    expect(await sendPendingNotices(client, "https://app", null)).toMatchObject({
      skipped: "RESEND_API_KEY is not set",
    });
    expect(calls.some(([fn]) => fn === "mark_report_notification_sent")).toBe(false);
  });
  it("does nothing when the queue is empty", async () => {
    const send = vi.fn<Sender>();
    expect(await sendPendingNotices(admin([]).client, "https://app", send)).toEqual({
      notices: 0,
      sent: 0,
      failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });
});

const reminder = (overrides: Partial<PendingApprovalReminder> = {}): PendingApprovalReminder => ({
  id: "a1",
  report_id: "r1",
  remind_on: "2026-11-16",
  recipients: [
    { email: "Chair@Example.org", name: "Chair", role: "chair" },
    { email: "co-chair@example.org", name: "Co", role: "chair" },
    { email: "not-an-address", name: "X", role: "chair" },
  ],
  title: "Board — 19 Nov",
  forum: "Digital Care Programme Board",
  meeting_date: "2026-11-19",
  submitted_at: "2026-11-12T16:00:00+00:00",
  working_days_waiting: 2,
  ...overrides,
});

const reminderAdmin = (rows: PendingApprovalReminder[]) => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const client: AdminLike = {
    rpc: (fn, args) => {
      calls.push([fn, args]);
      return Promise.resolve({
        data: fn === "pending_approval_reminders" ? rows : null,
        error: null,
      });
    },
  };
  return { client, calls };
};

describe("approvalReminderEmail", () => {
  it("says how long the pack has waited and links to the pack", () => {
    const email = approvalReminderEmail(reminder(), "https://app/governance/reports/r1");
    expect(email.subject).toBe(
      'Digital Care Programme Board: "Board — 19 Nov" is waiting for your approval',
    );
    expect(email.text).toContain("submitted for approval on 12/11/2026");
    expect(email.text).toContain("waiting 2 working days");
    expect(email.text).toContain("The meeting is on 19/11/2026.");
    expect(email.text).toContain("https://app/governance/reports/r1");
  });
  it("uses the singular for one day and escapes the HTML", () => {
    const email = approvalReminderEmail(
      reminder({ working_days_waiting: 1, title: "<b>Pack</b>", meeting_date: null }),
      "https://app/x",
    );
    expect(email.text).toContain("waiting 1 working day.");
    expect(email.text).not.toContain("The meeting is on");
    expect(email.html).toContain("&lt;b&gt;Pack&lt;/b&gt;");
  });
});

describe("recipientAddresses", () => {
  it("lower-cases, drops invalid addresses and duplicates, and sorts", () => {
    expect(recipientAddresses(reminder().recipients)).toEqual([
      "chair@example.org",
      "co-chair@example.org",
    ]);
  });
});

describe("sendApprovalReminders", () => {
  it("emails each approver once a day with per-day idempotency keys and marks the reminder sent", async () => {
    const { client, calls } = reminderAdmin([reminder()]);
    const send = vi.fn<Sender>().mockResolvedValue({ id: "e", error: null });
    expect(await sendApprovalReminders(client, "https://app/", send)).toEqual({
      notices: 1,
      sent: 2,
      failed: 0,
    });
    expect(send.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([
      "report-r1-approval/2026-11-16/0",
      "report-r1-approval/2026-11-16/1",
    ]);
    expect(send.mock.calls[0][0].text).toContain("https://app/governance/reports/r1");
    expect(calls).toContainEqual([
      "mark_approval_reminder_sent",
      { p_id: "a1", p_result: { sent: 2, recipients: 2 } },
    ]);
  });
  it("keeps a reminder queued when a send fails", async () => {
    const { client, calls } = reminderAdmin([reminder()]);
    const send = vi
      .fn<Sender>()
      .mockResolvedValueOnce({ id: null, error: "500" })
      .mockResolvedValue({ id: "e", error: null });
    expect(await sendApprovalReminders(client, "https://app", send)).toMatchObject({
      sent: 1,
      failed: 1,
    });
    expect(calls.some(([fn]) => fn === "mark_approval_reminder_sent")).toBe(false);
  });
  it("does nothing when nothing is due, and sends nothing without a Resend key", async () => {
    const empty = reminderAdmin([]);
    const send = vi.fn<Sender>();
    expect(await sendApprovalReminders(empty.client, "https://app", send)).toEqual({
      notices: 0,
      sent: 0,
      failed: 0,
    });
    const { client, calls } = reminderAdmin([reminder()]);
    expect(await sendApprovalReminders(client, "https://app", null)).toMatchObject({
      skipped: "RESEND_API_KEY is not set",
    });
    expect(send).not.toHaveBeenCalled();
    expect(calls.some(([fn]) => fn === "mark_approval_reminder_sent")).toBe(false);
  });
  it("marks a reminder with no valid address as sent to nobody", async () => {
    const { client, calls } = reminderAdmin([reminder({ recipients: [] })]);
    const send = vi.fn<Sender>();
    expect(await sendApprovalReminders(client, "https://app", send)).toEqual({
      notices: 1,
      sent: 0,
      failed: 0,
    });
    expect(calls).toContainEqual([
      "mark_approval_reminder_sent",
      { p_id: "a1", p_result: { sent: 0, recipients: 0 } },
    ]);
  });
});
