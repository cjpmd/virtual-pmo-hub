// The notification feed (GL-13), read from the notifications table: the database raises them
// (daily rules at 07:00 and immediate triggers), so the bell no longer loads tasks, decisions,
// benefits and dependencies on every page. Read state is stored on the row; the old per-browser
// read list (localStorage) is no longer used and is cleared once. Kinds the user switched off
// for in-app in Settings › Account are hidden.
import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrgId, useOrganisation } from "@/components/auth/organisation-provider";
import { qk } from "@/services/query-keys";
import {
  getMyNotificationPreferences,
  listNotifications,
  markNotificationsRead,
  NOTIFICATION_LABEL,
  setMyNotificationPreferences,
  type NotificationPreferences,
  type NotificationRow,
} from "@/services/notifications";

export interface FeedItem {
  id: string;
  date: string;
  kind: string;
  text: string;
  channel: "In-app";
  link: string | null;
  /** The thing it was about no longer applies (task done, decision made …). */
  resolved: boolean;
  read: boolean;
}

const LEGACY_READ_KEY = "virtual-pmo-notifications-read";
const EMPTY_PREFERENCES: NotificationPreferences = { digest: null, inApp: {}, email: {} };

/** Rows → feed: hides kinds switched off in-app; open items first, newest first. */
export function toFeed(
  rows: readonly NotificationRow[],
  preferences: NotificationPreferences = EMPTY_PREFERENCES,
): FeedItem[] {
  return rows
    .filter((row) => preferences.inApp[row.kind] !== false)
    .map((row) => ({
      id: row.id,
      date: row.createdAt.slice(0, 10),
      kind: NOTIFICATION_LABEL[row.kind],
      text: row.text,
      channel: "In-app" as const,
      link: row.link,
      resolved: row.resolvedAt !== null,
      read: row.readAt !== null,
    }))
    .sort(
      (a, b) =>
        Number(a.resolved) - Number(b.resolved) ||
        b.date.localeCompare(a.date) ||
        a.id.localeCompare(b.id),
    );
}

/** Unread and still open: what the bell counts. */
export const unreadCount = (feed: readonly FeedItem[]) =>
  feed.filter((item) => !item.read && !item.resolved).length;

export function useNotificationPreferences() {
  const { profile } = useOrganisation();
  const queryClient = useQueryClient();
  const key = qk.notificationPreferences(profile.id);
  const query = useQuery({
    queryKey: key,
    queryFn: () => getMyNotificationPreferences(profile.id),
  });
  const save = useMutation({
    mutationFn: setMyNotificationPreferences,
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
    onError: (error) => toast.error(error.message),
  });
  return { preferences: query.data ?? EMPTY_PREFERENCES, query, save };
}

export function useNotifications() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const { preferences } = useNotificationPreferences();
  const query = useQuery({
    queryKey: qk.notifications(orgId),
    queryFn: () => listNotifications(orgId),
    // New rows arrive from the database, not from this tab.
    refetchInterval: 5 * 60 * 1000,
  });
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_READ_KEY);
    } catch {
      // Storage unavailable: nothing to clear.
    }
  }, []);
  const feed = useMemo(() => toFeed(query.data ?? [], preferences), [query.data, preferences]);
  const read = useMemo(() => feed.filter((item) => item.read).map((item) => item.id), [feed]);
  const mark = useMutation({
    mutationFn: (ids: string[] | null) => markNotificationsRead(orgId, ids ?? undefined),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: qk.notifications(orgId) });
      const now = new Date().toISOString();
      queryClient.setQueryData<NotificationRow[]>(qk.notifications(orgId), (rows) =>
        rows?.map((row) =>
          !row.readAt && (!ids || ids.includes(row.id)) ? { ...row, readAt: now } : row,
        ),
      );
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.notifications(orgId) }),
  });
  const { mutate } = mark;
  const markRead = useCallback(
    (ids: string[]) => {
      const unreadIds = ids.filter((id) => !read.includes(id));
      if (unreadIds.length) mutate(unreadIds);
    },
    [mutate, read],
  );
  const markAllRead = useCallback(() => mutate(null), [mutate]);
  return { feed, read, markRead, markAllRead, unread: unreadCount(feed), query };
}
