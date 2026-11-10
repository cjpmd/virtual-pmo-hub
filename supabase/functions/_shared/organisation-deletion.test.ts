import { describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "./email";
import {
  accountClosedEmail,
  batches,
  cleanAddresses,
  daysLeft,
  deletionEmail,
  dueEmail,
  organisationDeletedEmail,
  purgeDue,
  sendToAll,
  walkObjects,
  type DeletionRow,
  type StorageLister,
} from "./organisation-deletion";

const NOW = new Date("2026-11-10T08:20:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();

const row = (overrides: Partial<DeletionRow> = {}): DeletionRow => ({
  organisation_id: "org-a",
  requested_at: day(-1),
  purge_after: day(29),
  cancelled_at: null,
  scheduled_email_at: day(-1),
  reminder_7_email_at: null,
  reminder_1_email_at: null,
  cancelled_email_at: null,
  purge_started_at: null,
  stripe_done_at: null,
  storage_done_at: null,
  attempts: 0,
  ...overrides,
});

describe("dueEmail", () => {
  it("sends the scheduled email first", () => {
    expect(dueEmail(row({ scheduled_email_at: null }), NOW)).toBe("scheduled");
  });
  it("sends nothing in the middle of the 30 days", () => {
    expect(dueEmail(row(), NOW)).toBeNull();
  });
  it("sends the 7-day reminder inside the last week, once", () => {
    expect(dueEmail(row({ purge_after: day(6.5) }), NOW)).toBe("reminder_7");
    expect(dueEmail(row({ purge_after: day(6.5), reminder_7_email_at: day(0) }), NOW)).toBeNull();
  });
  it("sends the 1-day reminder on the last day, and only that one if both are due", () => {
    expect(dueEmail(row({ purge_after: day(0.5) }), NOW)).toBe("reminder_1");
    expect(dueEmail(row({ purge_after: day(0.5), reminder_7_email_at: day(-5) }), NOW)).toBe("reminder_1");
    expect(dueEmail(row({ purge_after: day(0.5), reminder_1_email_at: day(0) }), NOW)).toBeNull();
  });
  it("sends only the cancelled email after a cancel, once", () => {
    expect(dueEmail(row({ cancelled_at: day(0), scheduled_email_at: null }), NOW)).toBe("cancelled");
    expect(dueEmail(row({ cancelled_at: day(0), cancelled_email_at: day(0) }), NOW)).toBeNull();
  });
  it("sends nothing once the purge has started", () => {
    expect(dueEmail(row({ purge_after: day(-1), purge_started_at: day(0), reminder_1_email_at: null }), NOW)).toBeNull();
  });
});

describe("purgeDue", () => {
  const due = row({ purge_after: day(-0.1) });
  it("needs mode on, or a hand-run for this organisation", () => {
    expect(purgeDue(due, NOW, "on", null)).toBe(true);
    expect(purgeDue(due, NOW, "dry_run", null)).toBe(false);
    expect(purgeDue(due, NOW, "dry_run", "org-a")).toBe(true);
    expect(purgeDue(due, NOW, "dry_run", "org-b")).toBe(false);
  });
  it("never when off, cancelled or not yet due", () => {
    expect(purgeDue(due, NOW, "off", "org-a")).toBe(false);
    expect(purgeDue(row({ purge_after: day(-1), cancelled_at: day(-2) }), NOW, "on", "org-a")).toBe(false);
    expect(purgeDue(row({ purge_after: day(0.1) }), NOW, "on", "org-a")).toBe(false);
  });
});

describe("helpers", () => {
  it("counts whole days left, never negative", () => {
    expect(daysLeft(day(6.2), NOW)).toBe(7);
    expect(daysLeft(day(0.3), NOW)).toBe(1);
    expect(daysLeft(day(-2), NOW)).toBe(0);
  });
  it("cleans and de-duplicates addresses", () => {
    expect(cleanAddresses(["B@x.org", "b@x.org ", "", null, "not-an-address", "a@x.org"])).toEqual(["a@x.org", "b@x.org"]);
  });
  it("batches", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([], 2)).toEqual([]);
  });
});

describe("walkObjects", () => {
  // A small tree: org/logo.png, org/ws/a.pdf, org/ws/deep/b.pdf, and 3 files paged 2 at a time.
  const tree: Record<string, Array<{ name: string; id: string | null }>> = {
    org: [{ name: "logo.png", id: "1" }, { name: "ws", id: null }, { name: "paged", id: null }],
    "org/ws": [{ name: "a.pdf", id: "2" }, { name: "deep", id: null }],
    "org/ws/deep": [{ name: "b.pdf", id: "3" }],
    "org/paged": [{ name: "p1", id: "4" }, { name: "p2", id: "5" }, { name: "p3", id: "6" }],
  };
  const lister: StorageLister = {
    list: (_bucket, prefix, { limit, offset }) =>
      Promise.resolve({ data: (tree[prefix] ?? []).slice(offset, offset + limit), error: null }),
  };
  it("finds every file under the prefix, through folders and pages", async () => {
    const paths = await walkObjects(lister, "attachments", "org/", 2);
    expect(paths.sort()).toEqual(["org/logo.png", "org/paged/p1", "org/paged/p2", "org/paged/p3", "org/ws/a.pdf", "org/ws/deep/b.pdf"]);
  });
  it("throws on a listing error rather than reporting an empty folder", async () => {
    const failing: StorageLister = { list: () => Promise.resolve({ data: null, error: { message: "boom" } }) };
    await expect(walkObjects(failing, "documents", "org")).rejects.toThrow("list documents/org: boom");
  });
});

describe("emails", () => {
  const input = { organisationName: "Acme <Health>", purgeAfter: "2026-12-10T08:00:00Z", now: NOW, appUrl: "https://pmo.example.org/" };
  it("scheduled: date, cancel route, escaped name", () => {
    const e = deletionEmail("scheduled", input);
    expect(e.subject).toBe("Acme <Health> will be deleted on 10 December 2026");
    expect(e.html).toContain("Acme &lt;Health&gt;");
    expect(e.html).not.toContain("Acme <Health>");
    expect(e.text).toContain("https://pmo.example.org/settings/organisation");
  });
  it("reminders say when", () => {
    expect(deletionEmail("reminder_7", { ...input, purgeAfter: day(6.2) }).subject).toContain("in 7 days");
    expect(deletionEmail("reminder_1", { ...input, purgeAfter: day(0.4) }).subject).toContain("tomorrow");
  });
  it("cancelled and deleted", () => {
    expect(deletionEmail("cancelled", input).subject).toBe("Deletion of Acme <Health> cancelled");
    const deleted = organisationDeletedEmail(input);
    expect(deleted.text).toContain("Your own account hasn't been closed");
    expect(accountClosedEmail(input).text).toContain("Former member");
  });
  it("sends one email per address with a per-address key, counting failures out", async () => {
    const send = vi.fn(async (m: EmailMessage) =>
      m.to === "bad@x.org" ? { data: null, error: { status: 422, name: "x", message: "x" } } : { data: { id: "e" }, error: null },
    );
    const sent = await sendToAll(send, ["a@x.org", "bad@x.org"], deletionEmail("scheduled", input), "org-deletion-scheduled/org-a/2026-11-09");
    expect(sent).toBe(1);
    expect(send.mock.calls.map(([m]) => m.idempotencyKey)).toEqual([
      "org-deletion-scheduled/org-a/2026-11-09/a@x.org",
      "org-deletion-scheduled/org-a/2026-11-09/bad@x.org",
    ]);
    expect(send.mock.calls[0][0].tags).toEqual([{ name: "type", value: "org-deletion-scheduled" }]);
  });
});
