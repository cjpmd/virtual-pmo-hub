// Build-time feature flags, read from VITE_* environment variables.

/**
 * Self-service organisation creation (open sign-up with a free trial). On unless
 * VITE_SELF_SIGNUP is "false", which is the kill switch: /signup/setup then redirects to
 * /request-access and nothing in the UI reaches create_organisation. Creating an account
 * (email + password or Microsoft) is always allowed; without an organisation it leads to the
 * "ask for an invite" screen.
 */
export const selfSignup = import.meta.env.VITE_SELF_SIGNUP !== "false";

/** Where access and demo requests go (the request-access page opens an email to it). */
export const contactEmail = (import.meta.env.VITE_CONTACT_EMAIL ?? "").trim();

/** The support address shown in the public and sign-in footers (SupportLink). */
export const supportEmail = "support@ormo-pmo.originoverthrow.com";

/**
 * Board automations (D4: hidden until work package 4.3 makes them run). Off unless
 * VITE_BOARD_AUTOMATIONS is "true"; the panel and recipes stay in board-workspace.tsx.
 */
export const boardAutomations = import.meta.env.VITE_BOARD_AUTOMATIONS === "true";
