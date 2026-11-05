import { describe, expect, it, vi } from "vitest";
import type { AdminLike, Sender } from "./report-distribution";
import { draftReadyEmail, sendPendingNotices, type PendingNotice } from "./report-notify";

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
