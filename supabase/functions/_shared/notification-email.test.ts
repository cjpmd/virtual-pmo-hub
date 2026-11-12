import { describe, expect, it, vi } from "vitest";
import type { EmailMessage, EmailResult } from "./email";
import {
  groupItems,
  itemLink,
  notificationEmail,
  parseMode,
  sendNotificationEmails,
  unsubscribeLink,
  type PendingNotificationEmail,
} from "./notification-email";

const APP = "https://pmo.example.org/";

const entry = (over: Partial<PendingNotificationEmail> = {}): PendingNotificationEmail => ({
  organisation_id: "org1",
  organisation_name: "Acme <Health>",
  recipient_id: "p1",
  email: "Pete@Example.org",
  name: "Pete",
  digest: "daily",
  total: 2,
  items: [
    { id: "n2", kind: "decision_due", text: "DEC-1 “Go?” is needed by 14/11/2026.", link: "/governance/raidd", due_date: "2026-11-14" },
    { id: "n1", kind: "task_overdue", text: "“Build <it>” (RD01) was due on 10/11/2026.", link: "/home/my-work", due_date: "2026-11-10" },
  ],
  unsubscribe_token: "t".repeat(64),
  ...over,
});

const admin = (byMode: Record<string, PendingNotificationEmail[]>) => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    client: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push([fn, args]);
        const data = fn === "pending_notification_emails" ? (byMode[args.p_mode as string] ?? []) : null;
        return Promise.resolve({ data, error: null });
      },
    },
  };
};
const ok = () => vi.fn(async (_m: EmailMessage): Promise<EmailResult> => ({ data: { id: "e" }, error: null }));

describe("links", () => {
  it("builds app links only from app paths", () => {
    expect(itemLink(APP, "/home/my-work")).toBe("https://pmo.example.org/home/my-work");
    expect(itemLink(APP, "//evil.example")).toBeNull();
    expect(itemLink(APP, "https://evil.example")).toBeNull();
    expect(itemLink(APP, null)).toBeNull();
    expect(unsubscribeLink(APP, "a b")).toBe("https://pmo.example.org/notifications/unsubscribe?token=a%20b");
  });
});

describe("notificationEmail", () => {
  it("groups by kind in a fixed order and escapes text", () => {
    expect(groupItems(entry().items).map((g) => g.kind)).toEqual(["task_overdue", "decision_due"]);
    const email = notificationEmail(entry(), APP, "digest");
    expect(email.subject).toBe("Your daily ORMO PMO digest: 2 notifications in Acme <Health>");
    expect(email.html).toContain("Build &lt;it&gt;");
    expect(email.html).not.toContain("Build <it>");
    expect(email.html).toContain("Acme &lt;Health&gt;");
    expect(email.html).toContain("/notifications/unsubscribe?token=");
    expect(email.text).toContain("- “Build <it>” (RD01) was due on 10/11/2026. https://pmo.example.org/home/my-work");
  });
  it("uses the single item as the subject of an immediate email, and counts what was left out", () => {
    const one = entry({ total: 1, items: [entry().items[1]!] });
    expect(notificationEmail(one, APP, "immediate").subject).toBe("ORMO PMO: “Build <it>” (RD01) was due on 10/11/2026.");
    const many = notificationEmail(entry({ total: 60 }), APP, "digest");
    expect(many.text).toContain("And 58 more in the app.");
    expect(notificationEmail(entry({ digest: "weekly" }), APP, "digest").subject).toMatch(/^Your weekly/);
  });
});

describe("sendNotificationEmails", () => {
  it("sends, marks sent and reports the digest done for mode all", async () => {
    const a = admin({ immediate: [entry({ digest: "immediate" })], digest: [entry({ recipient_id: "p2" })] });
    const send = ok();
    const result = await sendNotificationEmails(a.client, APP, send, "all");
    expect(result).toEqual({ emails: 2, sent: 2, failed: 0, skipped: 0, digestDone: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0].to).toBe("pete@example.org");
    expect(send.mock.calls[0]![0].idempotencyKey).toBe("notifications/org1/p1/n2/2");
    expect(a.calls.map(([fn]) => fn)).toEqual([
      "pending_notification_emails",
      "mark_notification_emails",
      "pending_notification_emails",
      "mark_notification_emails",
      "mark_notification_digest_done",
    ]);
    expect(a.calls[1]![1]).toEqual({ p_ids: ["n2", "n1"], p_outcome: "sent" });
  });
  it("leaves failed sends waiting, skips bad addresses, and never marks the digest in immediate mode", async () => {
    const a = admin({ immediate: [entry(), entry({ recipient_id: "p3", email: "not-an-address" })] });
    const send = vi.fn(async (): Promise<EmailResult> => ({ data: null, error: { status: 500, name: "x", message: "down" } }));
    const result = await sendNotificationEmails(a.client, APP, send, "immediate");
    expect(result).toEqual({ emails: 2, sent: 0, failed: 1, skipped: 1 });
    expect(a.calls.filter(([fn]) => fn === "mark_notification_emails")).toEqual([
      ["mark_notification_emails", { p_ids: ["n2", "n1"], p_outcome: "skipped" }],
    ]);
    expect(a.calls.some(([fn]) => fn === "mark_notification_digest_done")).toBe(false);
  });
  it("does nothing without Resend configured", async () => {
    const a = admin({ immediate: [entry()] });
    expect((await sendNotificationEmails(a.client, APP, null, "all")).reason).toMatch(/RESEND/);
    expect(a.calls).toEqual([]);
  });
  it("parses the mode", () => {
    expect(parseMode("all")).toBe("all");
    expect(parseMode("weekly")).toBeNull();
  });
});
