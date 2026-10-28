// Authentication and organisation membership: email + password, and Microsoft (Entra ID).
import type { AuthError, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ServiceError, fromPostgrest, fromAuth, unwrap, unwrapWrite } from "./service-error";

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

/**
 * Sign-in providers shown on /login and /signup, in order. Adding Google later is one entry
 * here, a logo in components/auth/provider-buttons.tsx and the provider switched on in Supabase.
 */
export type OAuthProvider = "azure";
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["azure"];
const PROVIDER_SCOPES: Record<OAuthProvider, string> = { azure: "email openid profile" };

/**
 * Optional on every call Supabase Auth protects with CAPTCHA. Pass the Turnstile token here
 * once CAPTCHA protection is switched on (see docs/auth-setup.md); unset, nothing is sent.
 */
export interface CaptchaOptions {
  captchaToken?: string | undefined;
}
const captcha = (token: string | undefined) => (token ? { captchaToken: token } : {});

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function checkEmail(email: string) {
  const address = email.trim();
  if (!EMAIL.test(address)) throw new ServiceError("invalid", "Enter a valid email address.");
  return address;
}

/** Where Supabase sends people back to: /auth/callback, then `next`. */
export function callbackUrl(next?: string) {
  const url = new URL("/auth/callback", window.location.origin);
  if (next && next !== "/") url.searchParams.set("next", next);
  return url.toString();
}

/**
 * Supabase Auth errors as messages people can act on. Wrong email and wrong password read the
 * same, so the message never says whether an account exists. "Email not confirmed" is only
 * returned for the right password, so it reveals nothing to anyone who doesn't know it.
 */
export function fromSignInError(error: AuthError): ServiceError {
  const cause = { code: error.code, cause: error };
  switch (error.code) {
    case "invalid_credentials":
    case "user_not_found":
      return new ServiceError("unauthenticated", "Email or password is incorrect.", cause);
    case "email_not_confirmed":
      return new ServiceError(
        "unauthenticated",
        "Confirm your email address before signing in. Check your inbox, or send the link again.",
        cause,
      );
    case "weak_password":
      return new ServiceError(
        "invalid",
        "Choose a stronger password. It must be at least 10 characters and must not appear in known data breaches.",
        cause,
      );
    case "same_password":
      return new ServiceError("invalid", "Choose a password you haven't used before.", cause);
    case "signup_disabled":
      return new ServiceError("forbidden", "New accounts can't be created at the moment.", cause);
    case "captcha_failed":
      return new ServiceError("invalid", "Complete the security check and try again.", cause);
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return new ServiceError("invalid", "Too many attempts. Wait a minute and try again.", cause);
    default:
      return fromAuth(error);
  }
}

export const isUnconfirmedEmail = (error: unknown) =>
  error instanceof ServiceError && error.code === "email_not_confirmed";

export interface NewAccount extends CaptchaOptions {
  name: string;
  email: string;
  password: string;
  /** Path to open after the confirmation link. */
  next?: string | undefined;
}

/**
 * Creates an email + password account. Supabase sends the confirmation email; the account
 * can't sign in until it is confirmed. An address that already has an account gets the same
 * response (Supabase returns an obfuscated user and sends nothing), so this never reveals
 * which addresses are registered. The name becomes the profile name (private.handle_new_user).
 */
export async function signUpWithPassword(input: NewAccount) {
  const email = checkEmail(input.email);
  const { error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: callbackUrl(input.next),
      data: { full_name: input.name.trim() },
      ...captcha(input.captchaToken),
    },
  });
  // Only returned when email confirmation is switched off; still say nothing about the account.
  if (error && (error.code === "user_already_exists" || error.code === "email_exists")) return;
  if (error) throw fromSignInError(error);
}

export async function signInWithPassword(
  input: { email: string; password: string } & CaptchaOptions,
) {
  const { error } = await supabase.auth.signInWithPassword({
    email: checkEmail(input.email),
    password: input.password,
    options: captcha(input.captchaToken),
  });
  if (error) throw fromSignInError(error);
}

/** Sends the sign-up confirmation email again. */
export async function resendConfirmation(
  input: { email: string; next?: string | undefined } & CaptchaOptions,
) {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: checkEmail(input.email),
    options: { emailRedirectTo: callbackUrl(input.next), ...captcha(input.captchaToken) },
  });
  if (error) throw fromSignInError(error);
}

/**
 * Sends a password reset email. The link opens /auth/reset-password, where supabase-js
 * raises PASSWORD_RECOVERY. Unknown addresses get the same response.
 */
export async function sendPasswordReset(input: { email: string } & CaptchaOptions) {
  const { error } = await supabase.auth.resetPasswordForEmail(checkEmail(input.email), {
    redirectTo: new URL("/auth/reset-password", window.location.origin).toString(),
    ...captcha(input.captchaToken),
  });
  if (error) throw fromSignInError(error);
}

/** Sets a new password for the signed-in (or recovering) user. */
export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw fromSignInError(error);
}

/**
 * Starts an OAuth sign-in; the browser leaves for the provider and comes back to
 * /auth/callback. Microsoft uses the Supabase "azure" provider with the /common tenant, so
 * any organisation's Entra ID (and, if allowed, personal Microsoft accounts) can sign in.
 */
export async function signInWithProvider(provider: OAuthProvider, next?: string) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { scopes: PROVIDER_SCOPES[provider], redirectTo: callbackUrl(next) },
  });
  if (error) throw fromSignInError(error);
}

/**
 * Set while the user signs out on purpose, so route protection sends them to /login without
 * a "return to" address (an expired session keeps it).
 */
let signingOut = false;
export const consumeSigningOut = () => {
  const value = signingOut;
  signingOut = false;
  return value;
};

/** Recovery links raise PASSWORD_RECOVERY once, possibly before the reset page mounts. */
let recovering = false;
const recoveryListeners = new Set<() => void>();
if (typeof window !== "undefined")
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      recovering = true;
      recoveryListeners.forEach((listener) => listener());
    }
    if (event === "SIGNED_OUT") recovering = false;
  });
export const isPasswordRecovery = () => recovering;
/** Calls `listener` when a recovery link signs the user in; returns the unsubscribe. */
export function onPasswordRecovery(listener: () => void) {
  recoveryListeners.add(listener);
  return () => void recoveryListeners.delete(listener);
}

export async function signOut() {
  signingOut = true;
  const { error } = await supabase.auth.signOut();
  if (error) {
    signingOut = false;
    throw fromAuth(error);
  }
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

/** Joins and selects the demo through the approved RPC; existing roles are preserved. */
export async function joinDemoAsViewer(): Promise<string> {
  return unwrap(await supabase.rpc("join_demo_as_viewer"), "Opening the demo");
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
