// Decision forums (boards), their members and meetings, read from and written to Supabase.
//
// A forum is organisation-level (workspaceId null: Digital Committee, Architecture Review
// Board...) or a workspace's own forum. Everyone in the organisation reads every forum and
// meeting; decisions keep their own workspace access, so a meeting's decisions come from the
// governance data the viewer can already see (filter it by targetMeetingId).
//
// Who may change what (RLS enforces it; canManageForum / canManageMeetings only decide which
// buttons to show): organisation admins manage organisation-level forums, a workspace's PMO or
// admin its workspace forums, and a forum's chair its meetings. Meetings are cancelled, never
// deleted; forums are deactivated, never deleted.
import { supabase } from "@/integrations/supabase/client";
import { atLeast, type AppRole, type WorkspaceRole } from "./auth";
import {
  forumCadenceLabel,
  forumCadenceValue,
  forumLevelLabel,
  forumLevelValue,
  meetingStatusLabel,
  meetingStatusValue,
  type ForumCadenceLabel,
  type ForumLevelLabel,
  type MeetingStatusLabel,
} from "./labels";
import { ServiceError, fromPostgrest, unwrap } from "./service-error";
import { insertRow, updateRow } from "./write";

export interface ForumItem {
  id: string;
  workspaceId: string | null;
  name: string;
  level: ForumLevelLabel;
  chairResourceId: string | null;
  chairName: string | null;
  cadence: ForumCadenceLabel | null;
  papersDeadlineDays: number;
  active: boolean;
  sortOrder: number;
  memberCount: number;
  nextMeetingId: string | null;
  nextMeetingDate: string | null;
  nextPapersDeadline: string | null;
  /** Pending decisions of this forum that the viewer can see. */
  pendingDecisions: number;
  updatedAt: string;
}

export interface ForumMember {
  forumId: string;
  resourceId: string;
  name: string;
}

export interface MeetingItem {
  id: string;
  forumId: string;
  forumName: string;
  meetingDate: string;
  papersDeadline: string;
  status: MeetingStatusLabel;
  minutesLink: string | null;
  notes: string | null;
  isPast: boolean;
  papersDeadlinePassed: boolean;
  /** Decisions targeted at this meeting that the viewer can see. */
  decisionsTargeted: number;
  decisionsPending: number;
  updatedAt: string;
}

// ---- Reads ------------------------------------------------------------------------------

export async function listForums(orgId: string): Promise<ForumItem[]> {
  const rows = unwrap(
    await supabase
      .from("v_forums")
      .select(
        "id, workspace_id, name, level, chair_resource_id, chair_name, cadence, papers_deadline_days, active, sort_order, member_count, next_meeting_id, next_meeting_date, next_papers_deadline, pending_decisions, updated_at",
      )
      .eq("organisation_id", orgId)
      .order("sort_order")
      .order("name"),
    "Loading forums",
  );
  return rows.map((row) => ({
    id: row.id ?? "",
    workspaceId: row.workspace_id,
    name: row.name ?? "",
    level: forumLevelLabel[row.level ?? "organisation"],
    chairResourceId: row.chair_resource_id,
    chairName: row.chair_name,
    cadence: row.cadence ? forumCadenceLabel[row.cadence] : null,
    papersDeadlineDays: row.papers_deadline_days ?? 5,
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
    memberCount: row.member_count ?? 0,
    nextMeetingId: row.next_meeting_id,
    nextMeetingDate: row.next_meeting_date,
    nextPapersDeadline: row.next_papers_deadline,
    pendingDecisions: row.pending_decisions ?? 0,
    updatedAt: row.updated_at ?? "",
  }));
}

/** Members of every forum in the organisation, with their names. */
export async function listForumMembers(orgId: string): Promise<ForumMember[]> {
  const rows = unwrap(
    await supabase
      .from("forum_members")
      .select("forum_id, resource_id")
      .eq("organisation_id", orgId),
    "Loading forum members",
  );
  const ids = [...new Set(rows.map((row) => row.resource_id))];
  const people = ids.length
    ? unwrap(
        await supabase.from("resources").select("id, name").in("id", ids),
        "Loading forum members",
      )
    : [];
  const name = new Map(people.map((row) => [row.id, row.name]));
  return rows
    .map((row) => ({
      forumId: row.forum_id,
      resourceId: row.resource_id,
      name: name.get(row.resource_id) ?? "Unknown",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every meeting in the organisation, earliest first. */
export async function listMeetings(orgId: string): Promise<MeetingItem[]> {
  const rows = unwrap(
    await supabase
      .from("v_meetings")
      .select(
        "id, forum_id, forum_name, meeting_date, papers_deadline, status, minutes_link, notes, is_past, papers_deadline_passed, decisions_targeted, decisions_pending, updated_at",
      )
      .eq("organisation_id", orgId)
      .order("meeting_date"),
    "Loading meetings",
  );
  return rows.map((row) => ({
    id: row.id ?? "",
    forumId: row.forum_id ?? "",
    forumName: row.forum_name ?? "",
    meetingDate: row.meeting_date ?? "",
    papersDeadline: row.papers_deadline ?? "",
    status: meetingStatusLabel[row.status ?? "planned"],
    minutesLink: row.minutes_link,
    notes: row.notes,
    isPast: row.is_past ?? false,
    papersDeadlinePassed: row.papers_deadline_passed ?? false,
    decisionsTargeted: row.decisions_targeted ?? 0,
    decisionsPending: row.decisions_pending ?? 0,
    updatedAt: row.updated_at ?? "",
  }));
}

// ---- Permissions (for showing buttons; RLS decides) ------------------------------------

export interface ForumPermissionContext {
  orgRole: AppRole | null;
  workspaceRoles: WorkspaceRole[];
  myResourceId: string | null;
}

/** Create, edit, deactivate the forum and change its members. */
export const canManageForum = (
  forum: Pick<ForumItem, "workspaceId">,
  context: ForumPermissionContext,
) =>
  forum.workspaceId
    ? atLeast(
        context.workspaceRoles.find((row) => row.workspaceId === forum.workspaceId)?.role,
        "pmo",
      )
    : context.orgRole === "admin";

/** Add and edit the forum's meetings: whoever manages the forum, or its (active) chair. */
export const canManageMeetings = (
  forum: Pick<ForumItem, "workspaceId" | "chairResourceId" | "active">,
  context: ForumPermissionContext,
) =>
  canManageForum(forum, context) ||
  (forum.active && !!context.myResourceId && forum.chairResourceId === context.myResourceId);

/** Workspaces the user may create a workspace forum in (PMO or admin there). */
export const forumWorkspaces = (context: ForumPermissionContext) =>
  context.workspaceRoles.filter((row) => atLeast(row.role, "pmo")).map((row) => row.workspaceId);

// ---- Writes -----------------------------------------------------------------------------

export interface ForumInput {
  name?: string;
  level?: ForumLevelLabel;
  chairResourceId?: string | null;
  cadence?: ForumCadenceLabel | null;
  papersDeadlineDays?: number;
  sortOrder?: number;
}

const forumFields = (input: ForumInput) => {
  if (input.name !== undefined && !input.name.trim())
    throw new ServiceError("invalid", "Give the forum a name.");
  if (
    input.papersDeadlineDays !== undefined &&
    (!Number.isInteger(input.papersDeadlineDays) ||
      input.papersDeadlineDays < 0 ||
      input.papersDeadlineDays > 60)
  )
    throw new ServiceError("invalid", "Papers are due 0 to 60 days before the meeting.");
  return {
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.level !== undefined && { level: forumLevelValue[input.level] }),
    ...(input.chairResourceId !== undefined && { chair_resource_id: input.chairResourceId }),
    ...(input.cadence !== undefined && {
      cadence: input.cadence ? forumCadenceValue[input.cadence] : null,
    }),
    ...(input.papersDeadlineDays !== undefined && {
      papers_deadline_days: input.papersDeadlineDays,
    }),
    ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
  };
};

/**
 * New forum. `workspaceId` null makes it organisation-level (organisation admins only);
 * a workspace id makes it that workspace's forum. Set once; it can't move later.
 */
export async function createForum(
  orgId: string,
  workspaceId: string | null,
  input: ForumInput & { name: string },
) {
  return insertRow(
    "forums",
    {
      ...forumFields(input),
      name: input.name.trim(),
      ...(workspaceId ? { workspace_id: workspaceId } : { organisation_id: orgId }),
    } as never,
    "Adding the forum",
  );
}

export async function updateForum(id: string, input: ForumInput, lastSeen: string) {
  return updateRow("forums", id, forumFields(input), { context: "Saving the forum", lastSeen });
}

/** Deactivate (hide from pickers) or reactivate a forum. Forums are never deleted. */
export async function setForumActive(id: string, active: boolean, lastSeen: string) {
  return updateRow(
    "forums",
    id,
    { active },
    { context: active ? "Reactivating the forum" : "Deactivating the forum", lastSeen },
  );
}

export async function addForumMember(forumId: string, resourceId: string) {
  return insertRow(
    "forum_members",
    { forum_id: forumId, resource_id: resourceId },
    "Adding the member",
  );
}

export async function removeForumMember(forumId: string, resourceId: string) {
  const context = "Removing the member";
  const result = await supabase
    .from("forum_members")
    .delete()
    .eq("forum_id", forumId)
    .eq("resource_id", resourceId)
    .select("forum_id");
  if (result.error) throw fromPostgrest(result.error, context, result.status);
  if (!result.data?.length)
    throw new ServiceError(
      "forbidden",
      `${context}: You don't have permission to make this change.`,
    );
}

export interface MeetingInput {
  meetingDate?: string;
  /** Null (or left out on create) takes the forum's default: meeting date minus its days. */
  papersDeadline?: string | null;
  status?: MeetingStatusLabel;
  minutesLink?: string | null;
  notes?: string | null;
}

const meetingFields = (input: MeetingInput) => {
  if (input.minutesLink && !/^https?:\/\//i.test(input.minutesLink.trim()))
    throw new ServiceError("invalid", "The minutes link must start with http:// or https://.");
  return {
    ...(input.meetingDate !== undefined && { meeting_date: input.meetingDate }),
    ...(input.papersDeadline !== undefined && { papers_deadline: input.papersDeadline }),
    ...(input.status !== undefined && { status: meetingStatusValue[input.status] }),
    ...(input.minutesLink !== undefined && {
      minutes_link: input.minutesLink?.trim() || null,
    }),
    ...(input.notes !== undefined && { notes: input.notes?.trim() || null }),
  };
};

export async function createMeeting(
  forumId: string,
  input: MeetingInput & { meetingDate: string },
) {
  if (!input.meetingDate) throw new ServiceError("invalid", "Set the meeting date.");
  return insertRow(
    "meetings",
    { ...meetingFields(input), forum_id: forumId, meeting_date: input.meetingDate },
    "Adding the meeting",
  );
}

export async function updateMeeting(id: string, input: MeetingInput, lastSeen: string) {
  return updateRow("meetings", id, meetingFields(input), {
    context: "Saving the meeting",
    lastSeen,
  });
}

/** Mark a meeting held (optionally with its minutes link) or cancelled. Meetings stay. */
export async function setMeetingStatus(
  id: string,
  status: MeetingStatusLabel,
  lastSeen: string,
  minutesLink?: string | null,
) {
  return updateMeeting(id, { status, ...(minutesLink !== undefined && { minutesLink }) }, lastSeen);
}
