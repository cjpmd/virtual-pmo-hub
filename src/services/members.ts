// Members, invitations, seats and join requests (work package 2.1). Reads and writes go through
// the 2.1 RPCs (permission, seat and rate-limit checks run in the database) and the edge
// functions send-invite, notify-join-request and manage-subscription. See docs/invites-and-seats.md.
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { AppRole } from "./auth";
import { invokeFunction } from "./functions";
import { fromPostgrest, ServiceError } from "./service-error";

// ---------------------------------------------------------------------------------------------
// Roles, tiers and seats (pure)
// ---------------------------------------------------------------------------------------------

/** What the app shows: admins and members use a paid seat, viewers are free. */
export type MemberTier = "admin" | "member" | "viewer";

export interface RoleChoice {
  role: AppRole;
  label: string;
  tier: MemberTier;
  /** Shown under "Advanced": member variants with more rights than a contributor. */
  advanced: boolean;
  description: string;
}

export const ROLE_CHOICES: RoleChoice[] = [
  {
    role: "admin",
    label: "Admin",
    tier: "admin",
    advanced: false,
    description: "Manages members, billing and settings. Paid seat.",
  },
  {
    role: "contributor",
    label: "Member",
    tier: "member",
    advanced: false,
    description: "Creates and edits work in their workspaces. Paid seat.",
  },
  {
    role: "manager",
    label: "Member (manager)",
    tier: "member",
    advanced: true,
    description: "A member who can also raise requests and manage programmes. Paid seat.",
  },
  {
    role: "pmo",
    label: "Member (PMO)",
    tier: "member",
    advanced: true,
    description: "A member who works across every workspace and runs governance. Paid seat.",
  },
  {
    role: "viewer",
    label: "Viewer",
    tier: "viewer",
    advanced: false,
    description: "Free, read-only, plus items personally assigned to them.",
  },
];

export const roleLabel = (role: AppRole) =>
  ROLE_CHOICES.find((choice) => choice.role === role)?.label ?? role;

/** The tier of an organisation role on its own (a viewer may still be a member through a workspace role). */
export const tierOfRole = (role: AppRole): MemberTier =>
  role === "admin" ? "admin" : role === "viewer" ? "viewer" : "member";

export const usesPaidSeat = (role: AppRole) => role !== "viewer";

export interface SeatUsage {
  /** Paid members plus unexpired paid-role invitations. */
  used: number;
  /** The trial allowance, the purchased seats (lower once a reduction is scheduled), or 0. */
  limit: number;
  paidMembers: number;
  pendingPaidInvites: number;
  viewers: number;
  onTrial: boolean;
  trialSeatAllowance: number;
  seatsTotal: number;
  scheduledSeats: number | null;
  scheduledInterval: "month" | "year" | null;
  scheduledChangeAt: string | null;
}

export const seatsFree = (usage: SeatUsage) => Math.max(0, usage.limit - usage.used);

/** "Using 3 of 10 seats" (or "trial seats"). */
export const seatSummary = (usage: SeatUsage) =>
  `Using ${usage.used} of ${usage.limit} ${usage.onTrial ? "trial seats" : "seats"}`;

/** How many paid seats a batch of invitations needs. */
export const paidSeatsNeeded = (roles: AppRole[]) => roles.filter(usesPaidSeat).length;

/** Whether `extra` more paid seats fit. */
export const seatsFit = (usage: SeatUsage, extra: number) => usage.used + extra <= usage.limit;

export function parseSeatUsage(value: Json | null): SeatUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, Json | undefined>;
  const num = (key: string) => Number(row[key] ?? 0);
  const interval = row["scheduled_interval"];
  return {
    used: num("used"),
    limit: num("limit"),
    paidMembers: num("paid_members"),
    pendingPaidInvites: num("pending_paid_invites"),
    viewers: num("viewers"),
    onTrial: row["on_trial"] === true,
    trialSeatAllowance: num("trial_seat_allowance"),
    seatsTotal: num("seats_total"),
    scheduledSeats: row["scheduled_seats"] == null ? null : num("scheduled_seats"),
    scheduledInterval: interval === "month" || interval === "year" ? interval : null,
    scheduledChangeAt:
      typeof row["scheduled_change_at"] === "string" ? row["scheduled_change_at"] : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Errors: the RPCs raise a readable message with a machine code in the hint
// ---------------------------------------------------------------------------------------------

function rpcError(error: PostgrestError, context?: string): ServiceError {
  const base = fromPostgrest(error, context);
  const hint = error.hint && /^[a-z_]+$/.test(error.hint) ? error.hint : undefined;
  const readable = ["P0001", "P0002", "22023", "42501"].includes(error.code) && error.message;
  const kind = error.code === "P0002" ? "not_found" : base.kind;
  const message = readable
    ? context
      ? `${context}: ${error.message}`
      : error.message
    : base.message;
  return new ServiceError(kind, message, {
    code: hint ?? base.code,
    detail: base.detail,
    cause: error,
  });
}

async function rpc<T>(
  call: PromiseLike<{ data: T; error: PostgrestError | null }>,
  context?: string,
): Promise<T> {
  const { data, error } = await call;
  if (error) throw rpcError(error, context);
  return data;
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

export interface OrgMember {
  profileId: string;
  name: string;
  email: string;
  role: AppRole;
  tier: MemberTier;
  providers: string[];
  joinedAt: string;
  /** Admins only. */
  lastSignInAt: string | null;
}

/** "Email", "Microsoft" or "Email, Microsoft". */
export const signInMethods = (providers: string[]) =>
  providers.length
    ? providers
        .map((provider) =>
          provider === "azure" ? "Microsoft" : provider === "email" ? "Email" : provider,
        )
        .join(", ")
    : "—";

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const rows = await rpc(
    supabase.rpc("list_organisation_members", { p_organisation_id: orgId }),
    "Loading members",
  );
  return (rows ?? []).map((row) => ({
    profileId: row.profile_id,
    name: row.display_name,
    email: row.email,
    role: row.role,
    tier: (row.tier as MemberTier) ?? tierOfRole(row.role),
    providers: row.providers ?? [],
    joinedAt: row.joined_at,
    lastSignInAt: row.last_sign_in_at,
  }));
}

export async function getSeatUsage(orgId: string): Promise<SeatUsage | null> {
  return parseSeatUsage(
    await rpc(supabase.rpc("get_seat_usage", { p_organisation_id: orgId }), "Loading seats"),
  );
}

export const changeMemberRole = (orgId: string, profileId: string, role: AppRole) =>
  rpc(
    supabase.rpc("change_member_role", {
      p_organisation_id: orgId,
      p_profile_id: profileId,
      p_role: role,
    }),
    "Changing the role",
  );

export const removeMember = (orgId: string, profileId: string) =>
  rpc(
    supabase.rpc("remove_member", { p_organisation_id: orgId, p_profile_id: profileId }),
    "Removing the member",
  );

// ---------------------------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------------------------

export interface Invite {
  id: string;
  email: string;
  role: AppRole;
  createdAt: string;
  expiresAt: string;
  lastSentAt: string | null;
  sendCount: number;
  emailStatus: string | null;
  emailStatusNote: string | null;
  workspaceIds: string[];
}

export type InviteState = "sent" | "delivered" | "not_sent" | "not_delivered" | "expired";

/** What the Members page shows for an open invitation. */
export function inviteState(
  invite: Pick<Invite, "expiresAt" | "lastSentAt" | "emailStatus">,
  now = Date.now(),
): InviteState {
  if (new Date(invite.expiresAt).getTime() <= now) return "expired";
  if (invite.emailStatus === "bounced" || invite.emailStatus === "suppressed")
    return "not_delivered";
  if (!invite.lastSentAt) return "not_sent";
  return invite.emailStatus === "delivered" ? "delivered" : "sent";
}

export const INVITE_STATE_LABELS: Record<InviteState, string> = {
  sent: "Sent",
  delivered: "Delivered",
  not_sent: "Not sent",
  not_delivered: "Not delivered",
  expired: "Expired",
};

/** Open invitations (not accepted or revoked), newest first, with their workspaces. Admins only. */
export async function listInvites(orgId: string): Promise<Invite[]> {
  const [invites, workspaces] = await Promise.all([
    rpc(
      supabase
        .from("organisation_invites")
        .select(
          "id, email, role, created_at, expires_at, last_sent_at, send_count, email_status, email_status_note",
        )
        .eq("organisation_id", orgId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
      "Loading invitations",
    ),
    rpc(
      supabase
        .from("organisation_invite_workspaces")
        .select("invite_id, workspace_id")
        .eq("organisation_id", orgId),
      "Loading invitations",
    ),
  ]);
  return (invites ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSentAt: row.last_sent_at,
    sendCount: row.send_count,
    emailStatus: row.email_status,
    emailStatusNote: row.email_status_note,
    workspaceIds: (workspaces ?? [])
      .filter((item) => item.invite_id === row.id)
      .map((item) => item.workspace_id),
  }));
}

export type InviteOutcome =
  "created" | "invalid_email" | "duplicate" | "already_member" | "already_invited";

export interface InviteResult {
  email: string;
  outcome: InviteOutcome;
  inviteId?: string;
  emailStatus?: "sent" | "failed";
  emailError?: string;
}

export const INVITE_OUTCOME_LABELS: Record<InviteOutcome, string> = {
  created: "Invited",
  invalid_email: "Not a valid email address",
  duplicate: "Listed twice",
  already_member: "Already a member",
  already_invited: "Already invited (use Resend invite)",
};

/** Splits pasted text into addresses (commas, semicolons, spaces or new lines). */
export const splitEmails = (text: string) => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  ),
];

export async function sendInvites(
  orgId: string,
  invites: Array<{ email: string; role: AppRole }>,
  workspaceIds: string[],
): Promise<InviteResult[]> {
  const data = await invokeFunction<{ results: InviteResult[] }>(
    "send-invite",
    { action: "create", organisationId: orgId, invites, workspaceIds },
    "Couldn't send the invitations.",
  );
  return data.results;
}

export async function resendInvite(inviteId: string) {
  return invokeFunction<{ inviteId: string; emailStatus: "sent" | "failed"; emailError?: string }>(
    "send-invite",
    { action: "resend", inviteId },
    "Couldn't resend the invitation.",
  );
}

export const revokeInvite = (inviteId: string) =>
  rpc(supabase.rpc("revoke_invite", { p_invite_id: inviteId }), "Revoking the invitation");

export interface InvitePreview {
  status: "valid" | "expired" | "revoked" | "accepted" | "not_found";
  organisationName: string | null;
  role: AppRole | null;
  inviterName: string | null;
  emailHint: string | null;
  expiresAt: string | null;
  acceptedByMe: boolean;
  /** null when signed out. */
  emailMatches: boolean | null;
  emailConfirmed: boolean | null;
}

export async function getInvitePreview(token: string): Promise<InvitePreview> {
  const value = await rpc(supabase.rpc("get_invite_preview", { p_token: token }));
  const row = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<
    string,
    Json | undefined
  >;
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : null);
  const status = text("status");
  return {
    status:
      status === "valid" || status === "expired" || status === "revoked" || status === "accepted"
        ? status
        : "not_found",
    organisationName: text("organisation_name"),
    role: text("role") as AppRole | null,
    inviterName: text("inviter_name"),
    emailHint: text("email_hint"),
    expiresAt: text("expires_at"),
    acceptedByMe: row["accepted_by_me"] === true,
    emailMatches:
      typeof row["email_matches"] === "boolean" ? (row["email_matches"] as boolean) : null,
    emailConfirmed:
      typeof row["email_confirmed"] === "boolean" ? (row["email_confirmed"] as boolean) : null,
  };
}

/** Accepts as the signed-in user. Errors carry codes: invite_expired, invite_wrong_email, no_seats, … */
export async function acceptInvite(
  token: string,
): Promise<{ organisationId: string; status: "joined" | "already_member" }> {
  const value = await rpc(supabase.rpc("accept_invite", { p_token: token }));
  const row = (value ?? {}) as Record<string, Json | undefined>;
  return {
    organisationId: String(row["organisation_id"] ?? ""),
    status: row["status"] === "already_member" ? "already_member" : "joined",
  };
}

// ---------------------------------------------------------------------------------------------
// Join requests and domains
// ---------------------------------------------------------------------------------------------

export interface JoinDomain {
  id: string;
  kind: "email_domain" | "entra_tenant";
  value: string;
  createdAt: string;
}

export interface JoinSettings {
  enabled: boolean;
  domains: JoinDomain[];
}

export async function getJoinSettings(orgId: string): Promise<JoinSettings> {
  const [settings, domains] = await Promise.all([
    rpc(
      supabase
        .from("organisation_join_settings")
        .select("requests_enabled")
        .eq("organisation_id", orgId)
        .maybeSingle(),
      "Loading join settings",
    ),
    rpc(
      supabase
        .from("organisation_join_domains")
        .select("id, kind, value, created_at")
        .eq("organisation_id", orgId)
        .order("created_at"),
      "Loading join settings",
    ),
  ]);
  return {
    enabled: settings?.requests_enabled ?? false,
    domains: (domains ?? []).map((row) => ({
      id: row.id,
      kind: row.kind === "entra_tenant" ? "entra_tenant" : "email_domain",
      value: row.value,
      createdAt: row.created_at,
    })),
  };
}

export const setJoinRequestsEnabled = (orgId: string, enabled: boolean) =>
  rpc(
    supabase.rpc("set_join_requests_enabled", { p_organisation_id: orgId, p_enabled: enabled }),
    "Saving the join setting",
  );

export const addJoinDomain = (orgId: string, kind: JoinDomain["kind"]) =>
  rpc(
    supabase.rpc("add_join_domain", { p_organisation_id: orgId, p_kind: kind }),
    "Adding the domain",
  );

export const removeJoinDomain = (domainId: string) =>
  rpc(supabase.rpc("remove_join_domain", { p_domain_id: domainId }), "Removing the domain");

export interface JoinRequest {
  id: string;
  profileId: string;
  name: string;
  email: string;
  matchedBy: "email_domain" | "entra_tenant";
  message: string | null;
  createdAt: string;
}

/** Pending requests to join (admins). */
export async function listJoinRequests(orgId: string): Promise<JoinRequest[]> {
  const rows = await rpc(
    supabase
      .from("organisation_join_requests")
      .select("id, profile_id, email, matched_by, message, created_at")
      .eq("organisation_id", orgId)
      .eq("status", "pending")
      .order("created_at"),
    "Loading join requests",
  );
  const ids = (rows ?? []).map((row) => row.profile_id);
  const profiles = ids.length
    ? await rpc(
        supabase.from("profiles").select("id, display_name").in("id", ids),
        "Loading join requests",
      )
    : [];
  return (rows ?? []).map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    name: profiles?.find((profile) => profile.id === row.profile_id)?.display_name ?? row.email,
    email: row.email,
    matchedBy: row.matched_by === "entra_tenant" ? "entra_tenant" : "email_domain",
    message: row.message,
    createdAt: row.created_at,
  }));
}

export const decideJoinRequest = (
  requestId: string,
  decision: { approve: true; role: AppRole; workspaceIds: string[] } | { approve: false },
) =>
  rpc(
    supabase.rpc("decide_join_request", {
      p_request_id: requestId,
      p_approve: decision.approve,
      ...(decision.approve
        ? { p_role: decision.role, p_workspace_ids: decision.workspaceIds }
        : {}),
    }),
    decision.approve ? "Approving the request" : "Declining the request",
  );

export interface JoinableOrganisation {
  organisationId: string;
  name: string;
  matchedBy: "email_domain" | "entra_tenant";
  requestStatus: "pending" | "approved" | "declined" | "withdrawn" | null;
  requestedAt: string | null;
}

/** Organisations the signed-in user may ask to join (their email domain or Microsoft tenant). */
export async function findJoinableOrganisations(): Promise<JoinableOrganisation[]> {
  const rows = await rpc(
    supabase.rpc("find_joinable_organisations"),
    "Looking for your organisation",
  );
  return (rows ?? []).map((row) => ({
    organisationId: row.organisation_id,
    name: row.organisation_name,
    matchedBy: row.matched_by === "entra_tenant" ? "entra_tenant" : "email_domain",
    requestStatus: (row.request_status as JoinableOrganisation["requestStatus"]) ?? null,
    requestedAt: row.requested_at,
  }));
}

/** Sends the request, then asks notify-join-request to email the admins (best effort). */
export async function requestToJoin(orgId: string, message: string) {
  const requestId = await rpc(
    supabase.rpc("request_to_join", {
      p_organisation_id: orgId,
      ...(message.trim() ? { p_message: message.trim() } : {}),
    }),
    "Sending your request",
  );
  await invokeFunction("notify-join-request", { requestId }, "Couldn't notify the admins.").catch(
    () => undefined,
  );
  return requestId;
}

/** The signed-in user's latest pending request to an organisation, for withdrawing it. */
export async function myPendingJoinRequest(orgId: string, userId: string): Promise<string | null> {
  const row = await rpc(
    supabase
      .from("organisation_join_requests")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("profile_id", userId)
      .eq("status", "pending")
      .maybeSingle(),
  );
  return row?.id ?? null;
}

export const withdrawJoinRequest = (requestId: string) =>
  rpc(
    supabase.rpc("withdraw_join_request", { p_request_id: requestId }),
    "Withdrawing your request",
  );

// ---------------------------------------------------------------------------------------------
// Seat and plan changes (manage-subscription)
// ---------------------------------------------------------------------------------------------

export type SeatPreview =
  | { direction: "decrease"; currentSeats: number; newSeats: number; effectiveAt: string }
  | {
      direction: "increase";
      currentSeats: number;
      newSeats: number;
      prorationDate: number;
      currency: string;
      /** Minor units (pence). */
      amountExclVat: number;
      vat: number;
      totalNow: number;
      trialing: boolean;
      dropsScheduledReduction: boolean;
    };

const manage = <T>(
  orgId: string,
  action: string,
  extra: Record<string, unknown>,
  fallback: string,
) =>
  invokeFunction<T>("manage-subscription", { organisationId: orgId, action, ...extra }, fallback);

export const previewSeats = (orgId: string, seats: number) =>
  manage<SeatPreview>(orgId, "preview", { seats }, "Couldn't work out the cost.");

/** Throws FunctionCallError code "requires_action" (body.hostedInvoiceUrl) when the bank wants 3D Secure. */
export const addSeats = (orgId: string, seats: number, prorationDate: number) =>
  manage<{ seats: number; applied: true }>(
    orgId,
    "add_seats",
    { seats, prorationDate },
    "Couldn't add the seats.",
  );

export const scheduleSeatReduction = (orgId: string, seats: number) =>
  manage<{ seats: number; effectiveAt: string }>(
    orgId,
    "schedule_reduction",
    { seats },
    "Couldn't schedule the change.",
  );

export const scheduleIntervalSwitch = (orgId: string, interval: "month" | "year") =>
  manage<{ interval: string; effectiveAt: string }>(
    orgId,
    "schedule_interval_switch",
    { interval },
    "Couldn't schedule the change.",
  );

export const cancelScheduledChange = (orgId: string) =>
  manage<{ cancelled: true }>(
    orgId,
    "cancel_scheduled_change",
    {},
    "Couldn't cancel the scheduled change.",
  );

/** £12.34 from pence. */
export const formatMinor = (amount: number, currency = "gbp") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(
    amount / 100,
  );
