// Reads what Supabase Auth (and, through it, Microsoft) puts in the redirect URL. Errors can
// arrive in the query string or the hash; supabase-js clears the hash only on success.

export interface AuthUrlError {
  kind: "consent" | "no_email" | "cancelled" | "expired" | "other";
  /** Text for people. Never the raw provider error, which can be long and technical. */
  message: string;
  /** The provider's own description, for support (shown small, or logged). */
  detail: string | undefined;
}

/** Combines the query string and the hash into one set of parameters. */
export function authUrlParams(search: string, hash: string): URLSearchParams {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  for (const [key, value] of new URLSearchParams(hash.replace(/^#/, ""))) params.set(key, value);
  return params;
}

// Entra ID error codes meaning the app needs approval in the user's organisation:
// 65001 not consented, 90094 / 90095 admin consent required (or requested through the admin
// consent workflow), 50105 the organisation requires users to be assigned to the app.
const CONSENT =
  /AADSTS(65001|90094|90095|50105)\b|admin (consent|approval)|need admin|approval required/i;
const DECLINED = /AADSTS65004\b|user (declined|cancel)/i;

/** The error in a redirect URL, if any, turned into a message people can act on. */
export function readAuthUrlError(params: URLSearchParams): AuthUrlError | null {
  const error = params.get("error");
  const code = params.get("error_code");
  const description = params.get("error_description")?.replace(/\+/g, " ") ?? undefined;
  if (!error && !code && !description) return null;
  const text = `${error ?? ""} ${code ?? ""} ${description ?? ""}`;

  if (CONSENT.test(text))
    return {
      kind: "consent",
      message:
        "Your Microsoft account belongs to an organisation that hasn't approved ORMO PMO yet. " +
        "Ask your IT administrator to approve the app, or sign in with your email and a " +
        "password instead.",
      detail: description,
    };
  if (
    /email/i.test(description ?? "") &&
    /(getting|missing|no) .*email|email .*(missing|not provided)/i.test(text)
  )
    return {
      kind: "no_email",
      message:
        "Microsoft didn't share an email address for your account, so we can't sign you in. " +
        "Ask your IT administrator to check your account has an email address, or sign in with " +
        "your email and a password instead.",
      detail: description,
    };
  if (code === "otp_expired" || /expired|invalid.*(link|token)/i.test(text))
    return {
      kind: "expired",
      message: "That link has expired or has already been used. Request a new one.",
      detail: description,
    };
  if (DECLINED.test(text) || error === "access_denied")
    return {
      kind: "cancelled",
      message: "Sign-in was cancelled. You can try again whenever you're ready.",
      detail: description,
    };
  return {
    kind: "other",
    message: "We couldn't sign you in. Please try again.",
    detail: description,
  };
}
