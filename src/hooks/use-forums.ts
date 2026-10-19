// Hooks over src/services/forums.ts: forums (boards), their members and meetings.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { useGovernance } from "@/hooks/use-governance";
import { useOrgRole, useWorkspaceRoles } from "@/hooks/use-permissions";
import {
  addForumMember,
  canManageForum,
  canManageMeetings,
  createForum,
  createMeeting,
  forumWorkspaces,
  listForumMembers,
  listForums,
  listMeetings,
  removeForumMember,
  setForumActive,
  setMeetingStatus,
  updateForum,
  updateMeeting,
  type ForumInput,
  type ForumItem,
  type MeetingInput,
} from "@/services/forums";
import type { MeetingStatusLabel } from "@/services/labels";
import { qk } from "@/services/query-keys";

/** Every forum in the organisation, both kinds, active and inactive (sort_order, name). */
export function useForums() {
  const orgId = useOrgId();
  return useQuery({ queryKey: [...qk.forums(orgId), "list"], queryFn: () => listForums(orgId) });
}

/** One forum, from the list. */
export function useForum(forumId: string | null | undefined) {
  const forums = useForums();
  return { ...forums, data: forums.data?.find((forum) => forum.id === forumId) ?? null };
}

/** Members of every forum (filter by forumId). */
export function useForumMembers(forumId?: string | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.forums(orgId), "members"],
    queryFn: () => listForumMembers(orgId),
    select: (rows) => (forumId ? rows.filter((row) => row.forumId === forumId) : rows),
  });
}

/** Meetings, earliest first; one forum's when forumId is given. */
export function useMeetings(forumId?: string | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.forums(orgId), "meetings"],
    queryFn: () => listMeetings(orgId),
    select: (rows) => (forumId ? rows.filter((row) => row.forumId === forumId) : rows),
  });
}

/** Decisions targeted at a meeting, from the governance data (only those the viewer can see). */
export function useMeetingDecisions(meetingId: string | null | undefined) {
  const governance = useGovernance();
  const decisions = useMemo(
    () =>
      meetingId
        ? (governance.data?.decisions ?? []).filter(
            (decision) => decision.targetMeetingId === meetingId,
          )
        : [],
    [governance.data, meetingId],
  );
  return { ...governance, data: decisions };
}

/**
 * Which forum buttons to show. RLS decides; these mirror it: organisation admins manage
 * organisation-level forums, workspace PMO/admin their workspace's, chairs their meetings.
 */
export function useForumPermissions() {
  const orgRole = useOrgRole();
  const roles = useWorkspaceRoles().data;
  const myResourceId = useMyResourceId();
  return useMemo(() => {
    const context = { orgRole, workspaceRoles: roles ?? [], myResourceId };
    return {
      canManage: (forum: Pick<ForumItem, "workspaceId">) => canManageForum(forum, context),
      canManageMeetings: (forum: Pick<ForumItem, "workspaceId" | "chairResourceId" | "active">) =>
        canManageMeetings(forum, context),
      /** May add an organisation-level forum (organisation admin). */
      canAddOrganisationForum: orgRole === "admin",
      /** Workspaces the user may add a workspace forum to. */
      workspaceIds: forumWorkspaces(context),
    };
  }, [orgRole, roles, myResourceId]);
}

export function useForumMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  // Forums sit under governance: forum and meeting names and dates show on decisions too.
  const onSettled = () => queryClient.invalidateQueries({ queryKey: qk.governance(orgId) });
  return {
    createForum: useMutation({
      mutationFn: (args: { workspaceId: string | null; input: ForumInput & { name: string } }) =>
        createForum(orgId, args.workspaceId, args.input),
      onSettled,
    }),
    updateForum: useMutation({
      mutationFn: (args: { id: string; input: ForumInput; lastSeen: string }) =>
        updateForum(args.id, args.input, args.lastSeen),
      onSettled,
    }),
    setForumActive: useMutation({
      mutationFn: (args: { id: string; active: boolean; lastSeen: string }) =>
        setForumActive(args.id, args.active, args.lastSeen),
      onSettled,
    }),
    addMember: useMutation({
      mutationFn: (args: { forumId: string; resourceId: string }) =>
        addForumMember(args.forumId, args.resourceId),
      onSettled,
    }),
    removeMember: useMutation({
      mutationFn: (args: { forumId: string; resourceId: string }) =>
        removeForumMember(args.forumId, args.resourceId),
      onSettled,
    }),
    createMeeting: useMutation({
      mutationFn: (args: { forumId: string; input: MeetingInput & { meetingDate: string } }) =>
        createMeeting(args.forumId, args.input),
      onSettled,
    }),
    updateMeeting: useMutation({
      mutationFn: (args: { id: string; input: MeetingInput; lastSeen: string }) =>
        updateMeeting(args.id, args.input, args.lastSeen),
      onSettled,
    }),
    setMeetingStatus: useMutation({
      mutationFn: (args: {
        id: string;
        status: MeetingStatusLabel;
        lastSeen: string;
        minutesLink?: string | null;
      }) => setMeetingStatus(args.id, args.status, args.lastSeen, args.minutesLink),
      onSettled,
    }),
  };
}
