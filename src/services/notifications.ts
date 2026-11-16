// The signed-in user's notifications (GL-13, build plan 4.1). Rows are raised in the database by
// private.generate_notifications (daily) and the notify triggers (task issued, decision
// recorded); RLS shows each person only their own. Read state is in the table
// (mark_notifications_read), not the browser. Preferences live in profiles.preferences ->
// 'notifications' and are written only through set_my_notification_preferences.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { unwrap, unwrapMaybe } from "./service-error";

export const NOTIFICATION_KINDS = [
  "task_overdue",
  "task_issued",
  "decision_due",
  "decision_recorded",
  "measurement_overdue",
  "dependency_off_track",
  "pack_drafted",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** The Settings › Notifications event each kind belongs to (organisations.settings). */
export const NOTIFICATION_EVENT: Record<NotificationKind, string> = {
  task_overdue: "Task overdue",
  task_issued: "Task issued to me",
  decision_due: "Decision needed by date approaching",
  decision_recorded: "Decision recorded",
  measurement_overdue: "Measurement overdue",
  dependency_off_track: "Dependency off track",
  pack_drafted: "Draft pack ready",
};

/** Short labels for the feed filter and the personal settings. */
export const NOTIFICATION_LABEL: Record<NotificationKind, string> = {
  task_overdue: "Overdue task",
  task_issued: "Task issued to me",
  decision_due: "Decision due",
  decision_recorded: "Decision recorded",
  measurement_overdue: "Measurement overdue",
  dependency_off_track: "Dependency off track",
  pack_drafted: "Draft pack ready",
};

export const isNotificationKind = (value: string): value is NotificationKind =>
  (NOTIFICATION_KINDS as readonly string[]).includes(value);

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  text: string;
  link: string | null;
  dueDate: string;
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
}

/** The latest 200 of the caller's notifications in the organisation (RLS: own rows only). */
export async function listNotifications(orgId: string): Promise<NotificationRow[]> {
  const rows = unwrap(
    await supabase
      .from("notifications")
      .select("id, kind, text, link, due_date, created_at, read_at, resolved_at")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
    "Loading notifications",
  );
  return rows.flatMap((row) =>
    isNotificationKind(row.kind)
      ? [
          {
            id: row.id,
            kind: row.kind,
            text: row.text,
            link: row.link,
            dueDate: row.due_date,
            createdAt: row.created_at,
            readAt: row.read_at,
            resolvedAt: row.resolved_at,
          },
        ]
      : [],
  );
}

/** Marks the given notifications read, or all of the caller's in the organisation. */
export async function markNotificationsRead(orgId: string, ids?: string[]): Promise<number> {
  return unwrap(
    await supabase.rpc("mark_notifications_read", {
      p_organisation: orgId,
      ...(ids && { p_ids: ids }),
    }),
    "Marking notifications read",
  );
}

export type Digest = "immediate" | "daily" | "weekly" | "off";
export interface NotificationPreferences {
  /** Unset: the organisation's default. */
  digest: Digest | null;
  inApp: Partial<Record<NotificationKind, boolean>>;
  email: Partial<Record<NotificationKind, boolean>>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const DIGESTS: readonly string[] = ["immediate", "daily", "weekly", "off"];

/** Reads profiles.preferences -> 'notifications', ignoring anything malformed. */
export function parsePreferences(stored: unknown): NotificationPreferences {
  const root = isObject(stored) && isObject(stored["notifications"]) ? stored["notifications"] : {};
  const channel = (value: unknown) =>
    Object.fromEntries(
      Object.entries(isObject(value) ? value : {}).filter(
        ([kind, on]) => isNotificationKind(kind) && typeof on === "boolean",
      ),
    ) as Partial<Record<NotificationKind, boolean>>;
  const digest = root["digest"];
  return {
    digest: typeof digest === "string" && DIGESTS.includes(digest) ? (digest as Digest) : null,
    inApp: channel(root["inApp"]),
    email: channel(root["email"]),
  };
}

export async function getMyNotificationPreferences(userId: string) {
  const row = unwrapMaybe(
    await supabase.from("profiles").select("preferences").eq("id", userId).maybeSingle(),
    "Loading your notification settings",
  );
  return parsePreferences(row?.preferences);
}

/** Merges a change into the caller's preferences; `digest: null` goes back to the default. */
export async function setMyNotificationPreferences(
  change: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const saved = unwrap(
    await supabase.rpc("set_my_notification_preferences", {
      p_preferences: change as unknown as Json,
    }),
    "Saving your notification settings",
  );
  return parsePreferences({ notifications: saved });
}

/** One-click unsubscribe from the email link; works signed out. */
export async function unsubscribeNotificationEmails(token: string): Promise<boolean> {
  return unwrap(
    await supabase.rpc("unsubscribe_notification_emails", { p_token: token }),
    "Unsubscribing",
  );
}
