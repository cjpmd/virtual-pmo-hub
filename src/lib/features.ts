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

/**
 * Microsoft Planner sync (build plan Phase 5). Off unless VITE_PLANNER_SYNC is "true": then
 * /connect-microsoft redirects to /settings and Settings › Integrations says sync is coming
 * later. The connect flow and the integrations workspace stay in the code.
 */
export const plannerSync = import.meta.env.VITE_PLANNER_SYNC === "true";

/**
 * Sprint delivery and the evidence-based forecast (build plan Phase 3). Off unless
 * VITE_SPRINT_DELIVERY is "true": the project page hides its Delivery tab, and ?tab=delivery
 * opens Overview. Turn it on once sprints are stored in the database.
 */
export const sprintDelivery = import.meta.env.VITE_SPRINT_DELIVERY === "true";
