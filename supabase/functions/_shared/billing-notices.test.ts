import { describe, expect, it, vi } from "vitest";
import type { EmailMessage, EmailResult } from "./email";
import {
  billingNoticeEmail,
  formatAmount,
  sendBillingNotices,
  splitRecipients,
  subscriptionLink,
  type PendingBillingNotice,
} from "./billing-notices";

const APP = "https://pmo.example.org/";

const notice = (overrides: Partial<PendingBillingNotice> = {}): PendingBillingNotice => ({
  id: "n1",
  organisation_id: "org1",
  organisation_name: "Acme <Health>",
  kind: "trial_ending",
  period_key: "2026-11-12T16:19Z",
  details: {},
  attempts: 0,
  status: null,
  trial_ends_at: "2026-11-12T16:19:42Z",
  grace_ends_at: null,
  writable: true,
  still_applies: true,
  recipients: [
    { email: "Admin@Example.org", name: "Admin", bounced: false },
    { email: "admin@example.org", name: "Admin", bounced: false },
    { email: "second@example.org", name: null, bounced: false },
  ],
  ...overrides,
});

const admin = (rows: PendingBillingNotice[]) => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    marks: () => calls.filter(([fn]) => fn === "mark_billing_notice").map(([, args]) => args),
    client: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        return Promise.resolve({ data: fn === "pending_billing_notices" ? rows : null, error: null });
      },
    },
  };
};

const ok = (): ((m: EmailMessage) => Promise<EmailResult>) =>
  vi.fn(async () => ({ data: { id: "e1" }, error: null }));

describe("splitRecipients", () => {
  it("lower-cases, de-duplicates, drops invalid addresses and sorts", () => {
    expect(
      splitRecipients([
        { email: " B@x.org ", name: null, bounced: false },
        { email: "a@x.org", name: null, bounced: false },
        { email: "b@x.org", name: null, bounced: false },
        { email: "not-an-address", name: null, bounced: false },
      ]),
    ).toEqual({ send: ["a@x.org", "b@x.org"], bounced: [] });
  });

  it("never emails a bounced address, even if listed again without the flag", () => {
    expect(
      splitRecipients([
        { email: "a@x.org", name: null, bounced: true },
        { email: "A@x.org", name: null, bounced: false },
        { email: "c@x.org", name: null, bounced: false },
      ]),
    ).toEqual({ send: ["c@x.org"], bounced: ["a@x.org"] });
  });
});

describe("formatAmount", () => {
  it("formats Stripe minor units", () => {
    expect(formatAmount(1200, "gbp")).toBe("£12.00");
    expect(formatAmount(undefined, "gbp")).toBeNull();
  });
});

describe("billingNoticeEmail", () => {
  it("trial ending names the date, links to Settings › Subscription and escapes the name", () => {
    const email = billingNoticeEmail(notice(), APP);
    expect(email.subject).toBe("Your ORMO PMO trial for Acme <Health> ends on 12 November 2026");
    expect(email.html).toContain("Acme &lt;Health&gt;");
    expect(email.html).not.toContain("Acme <Health>");
    expect(email.html).toContain("https://pmo.example.org/settings/subscription");
    expect(email.text).toContain("Nothing is deleted");
  });

  it("payment failed shows the amount and the grace date", () => {
    const email = billingNoticeEmail(
      notice({
        kind: "payment_failed",
        details: { amount_due: 12000, currency: "gbp" },
        grace_ends_at: "2026-11-24T10:00:00Z",
      }),
      APP,
    );
    expect(email.subject).toBe("Payment failed for Acme <Health> on ORMO PMO");
    expect(email.text).toContain("£120.00");
    expect(email.text).toContain("Update the card by 24 November 2026");
  });

  it("read-only says why: ended subscription or overdue payment", () => {
    expect(billingNoticeEmail(notice({ kind: "read_only", status: "canceled" }), APP).text).toContain(
      "subscription for Acme <Health> has ended",
    );
    expect(billingNoticeEmail(notice({ kind: "read_only", status: "unpaid" }), APP).text).toContain(
      "is overdue",
    );
  });

  it("trial ended says the organisation is read-only", () => {
    expect(billingNoticeEmail(notice({ kind: "trial_ended" }), APP).subject).toBe(
      "Acme <Health> is now read-only: your ORMO PMO trial has ended",
    );
  });

  it("builds the link without a double slash", () => {
    expect(subscriptionLink(APP)).toBe("https://pmo.example.org/settings/subscription");
  });
});

describe("sendBillingNotices", () => {
  it("emails each admin once with a stable idempotency key and marks it sent", async () => {
    const db = admin([notice()]);
    const send = ok();
    const result = await sendBillingNotices(db.client, APP, send);
    expect(result).toEqual({ notices: 1, sent: 1, skipped: 0, failed: 0 });
    expect(vi.mocked(send).mock.calls.map(([m]) => [m.to, m.idempotencyKey])).toEqual([
      ["admin@example.org", "billing-n1/admin@example.org"],
      ["second@example.org", "billing-n1/second@example.org"],
    ]);
    expect(db.marks()).toEqual([
      { p_id: "n1", p_outcome: "sent", p_recipient_count: 2, p_skipped_count: 0, p_error: null },
    ]);
  });

  it("skips bounced admins and records how many", async () => {
    const db = admin([
      notice({
        recipients: [
          { email: "gone@example.org", name: null, bounced: true },
          { email: "here@example.org", name: null, bounced: false },
        ],
      }),
    ]);
    const send = ok();
    await sendBillingNotices(db.client, APP, send);
    expect(vi.mocked(send).mock.calls.map(([m]) => m.to)).toEqual(["here@example.org"]);
    expect(db.marks()[0]).toMatchObject({ p_outcome: "sent", p_recipient_count: 1, p_skipped_count: 1 });
  });

  it("marks a notice skipped when every admin bounced", async () => {
    const db = admin([notice({ recipients: [{ email: "gone@example.org", name: null, bounced: true }] })]);
    const send = ok();
    const result = await sendBillingNotices(db.client, APP, send);
    expect(send).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(db.marks()[0]).toMatchObject({
      p_outcome: "skipped",
      p_skipped_count: 1,
      p_error: "every admin address bounced",
    });
  });

  it("marks a notice skipped when there's no admin with an email", async () => {
    const db = admin([notice({ recipients: [] })]);
    await sendBillingNotices(db.client, APP, ok());
    expect(db.marks()[0]).toMatchObject({ p_outcome: "skipped", p_error: "no admin with an email address" });
  });

  it("skips a notice that no longer applies without sending", async () => {
    const db = admin([notice({ still_applies: false })]);
    const send = ok();
    const result = await sendBillingNotices(db.client, APP, send);
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skipped: 1, sent: 0 });
    expect(db.marks()[0]).toMatchObject({ p_outcome: "skipped", p_error: "no longer applies" });
  });

  it("records an error (left pending for the next run) when Resend refuses", async () => {
    const db = admin([notice()]);
    const send = vi.fn(async (m: EmailMessage) =>
      m.to.startsWith("second")
        ? { data: null, error: { status: 500, name: "application_error", message: "down" } }
        : { data: { id: "e1" }, error: null },
    );
    const result = await sendBillingNotices(db.client, APP, send);
    expect(result.failed).toBe(1);
    expect(db.marks()[0]).toMatchObject({
      p_outcome: "error",
      p_recipient_count: 1,
      p_error: "500 application_error: down",
    });
  });

  it("does nothing and marks nothing without a Resend configuration", async () => {
    const db = admin([notice()]);
    const result = await sendBillingNotices(db.client, APP, null);
    expect(result.reason).toMatch(/RESEND/);
    expect(db.marks()).toEqual([]);
  });

  it("can be limited to one organisation (the webhook's payment_failed)", async () => {
    const db = admin([notice(), notice({ id: "n2", organisation_id: "org2" })]);
    const send = ok();
    const result = await sendBillingNotices(db.client, APP, send, { organisationId: "org2" });
    expect(result.notices).toBe(1);
    expect(db.marks().map((m) => m.p_id)).toEqual(["n2"]);
  });

  it("throws when the pending list can't be read", async () => {
    const client = { rpc: () => Promise.resolve({ data: null, error: { message: "boom" } }) };
    await expect(sendBillingNotices(client, APP, ok())).rejects.toThrow("boom");
  });
});
