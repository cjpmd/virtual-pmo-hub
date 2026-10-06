// Authentication and organisation membership. Email magic link only for now.
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  ServiceError,
  fromPostgrest,
  fromAuth,
  unwrap,
  unwrapMaybe,
  unwrapWrite,
} from "./service-error";

export interface Profile {
  id: string;
  displayName: string;
  email: string;
  lastOrganisationId: string | null;
}

export interface Membership {
  organisationId: string;
  name: string;
  slug: string;
  isDemo: boolean;
  role: string;
}

/** Sends a sign-in link. `next` is the path to return to after the link is opened. */
export async function sendMagicLink(email: string, next = "/") {
  const address = email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))
    throw new ServiceError("invalid", "Enter a valid email address.");
  const redirect = new URL("/auth/callback", window.location.origin);
  redirect.searchParams.set("next", next);
  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
  });
  if (error) throw fromAuth(error);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw fromAuth(error);
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw fromAuth(error);
  return data.session;
}

/** Completes a PKCE sign-in if the URL carries a code. Safe to call more than once. */
export async function completeSignIn(code: string | null): Promise<Session | null> {
  const existing = await getSession();
  if (existing || !code) return existing;
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw fromAuth(error);
  return data.session;
}

export async function getProfile(userId: string): Promise<Profile> {
  const row = unwrap(
    await supabase
      .from("profiles")
      .select("id, display_name, email, last_organisation_id")
      .eq("id", userId)
      .single(),
    "Loading your profile",
  );
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    lastOrganisationId: row.last_organisation_id,
  };
}

export async function listMemberships(userId: string): Promise<Membership[]> {
  const rows = unwrap(
    await supabase
      .from("organisation_members")
      .select("role, organisations!inner(id, name, slug, is_demo)")
      .eq("profile_id", userId),
    "Loading your organisations",
  );
  return rows
    .map((row) => ({
      organisationId: row.organisations.id,
      name: row.organisations.name,
      slug: row.organisations.slug,
      isDemo: row.organisations.is_demo,
      role: row.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Remembers the organisation the user is working in (used on next sign-in). */
export async function setLastOrganisation(userId: string, organisationId: string) {
  unwrapWrite(
    await supabase
      .from("profiles")
      .update({ last_organisation_id: organisationId })
      .eq("id", userId)
      .select("id"),
    "Switching organisation",
  );
}

/** Adds the signed-in user to the demo organisation, if their email is a listed demo admin. */
export async function joinDemoOrganisation(): Promise<string> {
  const { data, error } = await supabase.rpc("join_demo_organisation");
  if (error) {
    // The function raises a readable message when the email is not on the list.
    throw new ServiceError(error.code === "P0001" ? "forbidden" : "unknown", error.message, {
      code: error.code,
      cause: error,
    });
  }
  return data;
}

export interface NewOrganisation {
  name: string;
  region: "uk" | "eu";
  currency: "GBP" | "EUR";
  financialYearStartMonth: number;
}

/**
 * Creates an organisation with the signed-in user as its admin, a first workspace and the
 * default lifecycle, lists and settings (create_organisation). Returns the organisation id.
 */
export async function createOrganisation(input: NewOrganisation): Promise<string> {
  const { data, error } = await supabase.rpc("create_organisation", {
    p_name: input.name.trim(),
    p_region: input.region,
    p_currency: input.currency,
    p_fy_start_month: input.financialYearStartMonth,
  });
  if (error) throw fromPostgrest(error, "Creating your organisation");
  return data;
}

export async function getWorkspaces(organisationId: string) {
  return (
    unwrapMaybe(
      await supabase
        .from("workspaces")
        .select("id, name")
        .eq("organisation_id", organisationId)
        .order("name"),
      "Loading workspaces",
    ) ?? []
  );
}

export type AppRole = "viewer" | "contributor" | "manager" | "pmo" | "admin";
const roleRank: Record<AppRole, number> = {
  viewer: 0,
  contributor: 1,
  manager: 2,
  pmo: 3,
  admin: 4,
};
/** True when `role` is at least `min` on the RLS role ladder. */
export const atLeast = (role: AppRole | null | undefined, min: AppRole) =>
  role ? roleRank[role] >= roleRank[min] : false;

export interface WorkspaceRole {
  workspaceId: string;
  organisationId: string;
  role: AppRole;
}

/** The caller's effective role in each workspace (membership, or org pmo/admin). */
export async function listMyWorkspaceRoles(): Promise<WorkspaceRole[]> {
  const rows = unwrap(await supabase.rpc("my_workspace_roles"), "Checking your permissions");
  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    organisationId: row.organisation_id,
    role: row.role,
  }));
}
