// Build-time feature flags, read from VITE_* environment variables.

/**
 * Self-service sign-up (create your own organisation). Off unless VITE_SELF_SIGNUP is "true":
 * while it is off, /signup redirects to /request-access and nothing in the UI reaches
 * create_organisation. The sign-up code stays in place for when it is switched on.
 */
export const selfSignup = import.meta.env.VITE_SELF_SIGNUP === "true";

/** Where access and demo requests go (the request-access page opens an email to it). */
export const contactEmail = (import.meta.env.VITE_CONTACT_EMAIL ?? "").trim();
