import { describe, expect, it } from "vitest";
import { toFeed, unreadCount } from "./use-notifications";
import { parsePreferences, type NotificationRow } from "@/services/notifications";

const row = (over: Partial<NotificationRow>): NotificationRow => ({
  id: "n",
  kind: "task_overdue",
  text: "t",
  link: "/home/my-work",
  dueDate: "2026-11-10",
  createdAt: "2026-11-12T07:00:00Z",
  readAt: null,
  resolvedAt: null,
  ...over,
});

describe("toFeed", () => {
  it("puts open items first, newest first, and labels kinds", () => {
    const feed = toFeed([
      row({ id: "old", createdAt: "2026-11-01T07:00:00Z" }),
      row({ id: "done", resolvedAt: "2026-11-12T08:00:00Z", createdAt: "2026-11-12T07:00:00Z" }),
      row({ id: "new", kind: "decision_due", createdAt: "2026-11-11T07:00:00Z" }),
    ]);
    expect(feed.map((f) => f.id)).toEqual(["new", "old", "done"]);
    expect(feed[0]!.kind).toBe("Decision due");
    expect(feed[2]!.resolved).toBe(true);
  });
  it("hides kinds switched off in the app, and counts unread open items", () => {
    const rows = [
      row({ id: "a" }),
      row({ id: "b", readAt: "2026-11-12T09:00:00Z" }),
      row({ id: "c", resolvedAt: "2026-11-12T09:00:00Z" }),
      row({ id: "d", kind: "task_issued" }),
    ];
    const feed = toFeed(rows, { digest: null, inApp: { task_issued: false }, email: {} });
    expect(feed.map((f) => f.id).sort()).toEqual(["a", "b", "c"]);
    expect(unreadCount(feed)).toBe(1);
  });
});

describe("parsePreferences", () => {
  it("reads valid values and ignores the rest", () => {
    expect(
      parsePreferences({
        theme: "dark",
        notifications: {
          digest: "weekly",
          inApp: { task_overdue: false, made_up: false, decision_due: "no" },
          email: { task_issued: true },
        },
      }),
    ).toEqual({ digest: "weekly", inApp: { task_overdue: false }, email: { task_issued: true } });
    expect(parsePreferences(null)).toEqual({ digest: null, inApp: {}, email: {} });
    expect(parsePreferences({ notifications: { digest: "hourly" } }).digest).toBeNull();
  });
});
