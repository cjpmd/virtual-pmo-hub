/**
 * NHS-7: partner (cross-organisation / ICS) programmes, module `cross_org`.
 *
 * A host shares a programme with partner organisations through an invitation to one of the
 * partner's admins; partners see a read-only roll-up and, with contribute access, link their own
 * projects into it. Everything goes through definer RPCs
 * (supabase/migrations/20261123133252_nhs_7_partner_programmes.sql); health comes from the stored
 * health tables, never worked out here. New shares are refused while sharing is paused (GL-10).
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Health } from "@/data/types";
import { projectStateLabel, toHealth } from "./labels";
import { fromPostgrest, ServiceError } from "./service-error";

export type ShareAccess = "read" | "contribute";

export interface PartnerProjectRollup {
  id: string;
  code: string;
  name: string;
  state: string;
  isSample: boolean;
  organisationId: string;
  organisation: string;
  startDate: string | null;
  finishDate: string | null;
  overall: Health;
  schedule: Health;
  financial: Health;
  forecastFinishDate: string | null;
  nextMilestone: { title: string; date: string } | null;
  milestonesOverdue: number;
  openRisks: number;
}

export interface SharedProgrammeOverview {
  programme: {
    id: string;
    name: string;
    description: string | null;
    startDate: string | null;
    finishDate: string | null;
    state: string;
    archived: boolean;
    organisationId: string;
    organisation: string;
    overall: Health;
    benefitHealth: Health;
    forecastFinishDate: string | null;
  };
  viewer: {
    isHost: boolean;
    shareId: string | null;
    access: ShareAccess | null;
    partnerOrganisationId: string | null;
  };
  projects: PartnerProjectRollup[];
  contributedProjects: PartnerProjectRollup[];
  organisations: { id: string; name: string; role: "host" | "partner" }[];
  benefits: { count: number; cashReleasing: number; nonCash: number; realised: number };
}

export interface SharedProgrammeListItem {
  shareId: string;
  programmeId: string;
  programme: string;
  access: ShareAccess;
  hostOrganisationId: string;
  hostOrganisation: string;
  partnerOrganisationId: string;
  partnerOrganisation: string;
  sharedAt: string;
  hostModuleOn: boolean;
  archived: boolean;
  myContributions: number;
}

export interface ProgrammePartners {
  programmeId: string;
  moduleOn: boolean;
  sharingEnabled: boolean;
  canManage: boolean;
  shares: {
    id: string;
    partnerOrganisationId: string;
    partnerOrganisation: string;
    access: ShareAccess;
    createdAt: string;
  }[];
  invites: {
    id: string;
    email: string;
    access: ShareAccess;
    expiresAt: string;
    createdAt: string;
  }[];
  contributions: {
    id: string;
    partnerOrganisationId: string;
    partnerOrganisation: string;
    projectId: string;
    projectCode: string;
    project: string;
    contributedAt: string;
    active: boolean;
  }[];
}

export type InvitePreviewStatus =
  "pending" | "paused" | "not_found" | "accepted" | "revoked" | "expired" | "wrong_email";

export interface PartnerInvitePreview {
  status: InvitePreviewStatus;
  hostOrganisation?: string | undefined;
  programme?: string | undefined;
  access?: ShareAccess | undefined;
  expiresAt?: string | undefined;
  organisations: { id: string; name: string; moduleOn: boolean }[];
}

// ---------------------------------------------------------------------------------------------
// Parsing (pure; unit-tested)
// ---------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Obj) : {};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const strOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);
const num = (value: unknown) => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const access = (value: unknown): ShareAccess => (value === "contribute" ? "contribute" : "read");
const accessOrNull = (value: unknown): ShareAccess | null =>
  value === "contribute" || value === "read" ? value : null;
const HEALTH_VALUES = ["green", "amber", "red", "not_set"] as const;
/** Stored health enum (green / amber / red / not_set) as the app's labels. */
const health = (value: unknown): Health => toHealth(HEALTH_VALUES.find((h) => h === value) ?? null);
/** Stored project state as the app's label (unknown values passed through). */
const projectState = (value: unknown) =>
  typeof value === "string" && value in projectStateLabel
    ? projectStateLabel[value as keyof typeof projectStateLabel]
    : str(value);

export function parseRollup(value: unknown): PartnerProjectRollup {
  const row = obj(value);
  const milestone = obj(row["next_milestone"]);
  return {
    id: str(row["id"]),
    code: str(row["code"]),
    name: str(row["name"]),
    state: projectState(row["state"]),
    isSample: row["is_sample"] === true,
    organisationId: str(row["organisation_id"]),
    organisation: str(row["organisation"]),
    startDate: strOrNull(row["start_date"]),
    finishDate: strOrNull(row["finish_date"]),
    overall: health(row["overall"]),
    schedule: health(row["schedule"]),
    financial: health(row["financial"]),
    forecastFinishDate: strOrNull(row["forecast_finish_date"]),
    nextMilestone:
      typeof milestone["title"] === "string" && typeof milestone["date"] === "string"
        ? { title: milestone["title"], date: milestone["date"] }
        : null,
    milestonesOverdue: num(row["milestones_overdue"]),
    openRisks: num(row["open_risks"]),
  };
}

export function parseOverview(value: unknown): SharedProgrammeOverview | null {
  if (value === null || value === undefined) return null;
  const root = obj(value);
  const p = obj(root["programme"]);
  const viewer = obj(root["viewer"]);
  const benefits = obj(root["benefits"]);
  return {
    programme: {
      id: str(p["id"]),
      name: str(p["name"]),
      description: strOrNull(p["description"]),
      startDate: strOrNull(p["start_date"]),
      finishDate: strOrNull(p["finish_date"]),
      state: str(p["state"]),
      archived: p["archived"] === true,
      organisationId: str(p["organisation_id"]),
      organisation: str(p["organisation"]),
      overall: health(p["overall"]),
      benefitHealth: health(p["benefit_health"]),
      forecastFinishDate: strOrNull(p["forecast_finish_date"]),
    },
    viewer: {
      isHost: viewer["is_host"] === true,
      shareId: strOrNull(viewer["share_id"]),
      access: accessOrNull(viewer["access"]),
      partnerOrganisationId: strOrNull(viewer["partner_organisation_id"]),
    },
    projects: arr(root["projects"]).map(parseRollup),
    contributedProjects: arr(root["contributed_projects"]).map(parseRollup),
    organisations: arr(root["organisations"]).map((item) => {
      const o = obj(item);
      return {
        id: str(o["id"]),
        name: str(o["name"]),
        role: o["role"] === "host" ? ("host" as const) : ("partner" as const),
      };
    }),
    benefits: {
      count: num(benefits["count"]),
      cashReleasing: num(benefits["cash_releasing"]),
      nonCash: num(benefits["non_cash"]),
      realised: num(benefits["realised"]),
    },
  };
}

export function parseSharedProgrammes(value: unknown): SharedProgrammeListItem[] {
  return arr(value).map((item) => {
    const row = obj(item);
    return {
      shareId: str(row["share_id"]),
      programmeId: str(row["programme_id"]),
      programme: str(row["programme"]),
      access: access(row["access"]),
      hostOrganisationId: str(row["host_organisation_id"]),
      hostOrganisation: str(row["host_organisation"]),
      partnerOrganisationId: str(row["partner_organisation_id"]),
      partnerOrganisation: str(row["partner_organisation"]),
      sharedAt: str(row["shared_at"]),
      hostModuleOn: row["host_module_on"] === true,
      archived: row["archived"] === true,
      myContributions: num(row["my_contributions"]),
    };
  });
}

export function parsePartners(value: unknown): ProgrammePartners | null {
  if (value === null || value === undefined) return null;
  const root = obj(value);
  return {
    programmeId: str(root["programme_id"]),
    moduleOn: root["module_on"] === true,
    sharingEnabled: root["sharing_enabled"] === true,
    canManage: root["can_manage"] === true,
    shares: arr(root["shares"]).map((item) => {
      const row = obj(item);
      return {
        id: str(row["id"]),
        partnerOrganisationId: str(row["partner_organisation_id"]),
        partnerOrganisation: str(row["partner_organisation"]),
        access: access(row["access"]),
        createdAt: str(row["created_at"]),
      };
    }),
    invites: arr(root["invites"]).map((item) => {
      const row = obj(item);
      return {
        id: str(row["id"]),
        email: str(row["email"]),
        access: access(row["access"]),
        expiresAt: str(row["expires_at"]),
        createdAt: str(row["created_at"]),
      };
    }),
    contributions: arr(root["contributions"]).map((item) => {
      const row = obj(item);
      return {
        id: str(row["id"]),
        partnerOrganisationId: str(row["partner_organisation_id"]),
        partnerOrganisation: str(row["partner_organisation"]),
        projectId: str(row["project_id"]),
        projectCode: str(row["project_code"]),
        project: str(row["project"]),
        contributedAt: str(row["contributed_at"]),
        active: row["active"] === true,
      };
    }),
  };
}

const PREVIEW_STATUSES: InvitePreviewStatus[] = [
  "pending",
  "paused",
  "not_found",
  "accepted",
  "revoked",
  "expired",
  "wrong_email",
];

export function parseInvitePreview(value: unknown): PartnerInvitePreview {
  const root = obj(value);
  const status = PREVIEW_STATUSES.find((s) => s === root["status"]) ?? "not_found";
  return {
    status,
    hostOrganisation:
      typeof root["host_organisation"] === "string" ? root["host_organisation"] : undefined,
    programme: typeof root["programme"] === "string" ? root["programme"] : undefined,
    access: accessOrNull(root["access"]) ?? undefined,
    expiresAt: typeof root["expires_at"] === "string" ? root["expires_at"] : undefined,
    organisations: arr(root["organisations"]).map((item) => {
      const row = obj(item);
      return { id: str(row["id"]), name: str(row["name"]), moduleOn: row["module_on"] === true };
    }),
  };
}

/** The link a host copies and sends to the partner's admin. */
export const partnerInviteLink = (token: string, origin: string) =>
  `${origin.replace(/\/+$/, "")}/partner-invite?token=${encodeURIComponent(token)}`;

/** Plain-English text for an invitation that can't be accepted. */
export const invitePreviewMessage = (status: InvitePreviewStatus): string | null =>
  ({
    pending: null,
    paused:
      "Sharing with partner organisations is paused at the moment, so this invitation can't be accepted yet. Try again later.",
    not_found: "This invitation link isn't valid. Ask the programme's PMO for a new one.",
    accepted: "This invitation has already been used.",
    revoked: "This invitation was withdrawn. Ask the programme's PMO for a new one.",
    expired: "This invitation has expired. Ask the programme's PMO for a new one.",
    wrong_email:
      "This invitation was sent to a different email address. Sign in with the address it was sent to.",
  })[status];

// ---------------------------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------------------------

const HINT_MESSAGES: Record<string, string> = {
  sharing_paused: "Sharing with partner organisations is paused at the moment.",
  module_off:
    "Partner programmes are switched off for this organisation. An admin can switch them on in Settings › Modules.",
};

function rpcError(error: PostgrestError, context: string): ServiceError {
  const hintText = error.hint ? HINT_MESSAGES[error.hint] : undefined;
  if (hintText)
    return new ServiceError(
      error.code === "42501" ? "forbidden" : "invalid",
      `${context}: ${hintText}`,
      {
        code: error.code,
        detail: [error.message, error.hint].filter(Boolean).join(" — "),
        cause: error,
      },
    );
  const base = fromPostgrest(error, context);
  if (["P0001", "P0002", "22023", "23505", "42501"].includes(error.code) && error.message)
    return new ServiceError(base.kind, `${context}: ${error.message}`, {
      code: error.code,
      detail: base.detail,
      cause: error,
    });
  return base;
}

async function call<T>(
  request: PromiseLike<{ data: T; error: PostgrestError | null }>,
  context: string,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw rpcError(error, context);
  return data;
}

export const getSharedProgrammeOverview = async (programmeId: string) =>
  parseOverview(
    await call(
      supabase.rpc("shared_programme_overview", { p_programme: programmeId }),
      "Loading the partner programme",
    ),
  );

export const listSharedProgrammes = async () =>
  parseSharedProgrammes(
    await call(supabase.rpc("shared_programmes"), "Loading partner programmes"),
  );

export const getProgrammePartners = async (programmeId: string) =>
  parsePartners(
    await call(
      supabase.rpc("programme_partners", { p_programme: programmeId }),
      "Loading the programme's partners",
    ),
  );

export async function createPartnerInvite(
  programmeId: string,
  email: string,
  accessLevel: ShareAccess,
) {
  const data = obj(
    await call(
      supabase.rpc("create_partner_invite", {
        p_programme: programmeId,
        p_email: email,
        p_access: accessLevel,
      }),
      "Creating the invitation",
    ),
  );
  return { id: str(data["id"]), token: str(data["token"]), expiresAt: str(data["expires_at"]) };
}

export const revokePartnerInvite = (inviteId: string) =>
  call(supabase.rpc("revoke_partner_invite", { p_invite: inviteId }), "Withdrawing the invitation");

export const previewPartnerInvite = async (token: string) =>
  parseInvitePreview(
    await call(
      supabase.rpc("partner_invite_preview", { p_token: token }),
      "Checking the invitation",
    ),
  );

export async function acceptPartnerInvite(token: string, organisationId: string) {
  const data = obj(
    await call(
      supabase.rpc("accept_partner_invite", { p_token: token, p_organisation: organisationId }),
      "Accepting the invitation",
    ),
  );
  return { shareId: str(data["share_id"]), programmeId: str(data["programme_id"]) };
}

export const setProgrammeShareAccess = (shareId: string, accessLevel: ShareAccess) =>
  call(
    supabase.rpc("set_programme_share_access", { p_share: shareId, p_access: accessLevel }),
    "Changing access",
  );

export const revokeProgrammeShare = (shareId: string) =>
  call(supabase.rpc("revoke_programme_share", { p_share: shareId }), "Ending the share");

export const contributeProject = (projectId: string, programmeId: string) =>
  call(
    supabase.rpc("contribute_project", { p_project: projectId, p_programme: programmeId }),
    "Adding the project",
  );

export const withdrawContribution = (contributionId: string) =>
  call(
    supabase.rpc("withdraw_contribution", { p_contribution: contributionId }),
    "Taking the project out",
  );

/** The caller's own active contributions to a programme (their workspace rows, through RLS). */
export async function listMyContributions(programmeId: string) {
  const rows = await call(
    supabase
      .from("programme_contributions")
      .select("id, project_id")
      .eq("host_programme_id", programmeId)
      .is("withdrawn_at", null),
    "Loading your projects in the programme",
  );
  return (rows ?? []).map((row) => ({ id: row.id, projectId: row.project_id }));
}
