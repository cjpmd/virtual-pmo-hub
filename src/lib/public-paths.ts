/** Paths anyone can open. Everything else needs a session and an organisation. */
export const isPublicPath = (path: string) =>
  path === "/" ||
  path === "/login" ||
  path === "/signin" ||
  path.startsWith("/auth/") ||
  path === "/request-access" ||
  path === "/pricing" ||
  path === "/product" ||
  path === "/security" ||
  path === "/privacy" ||
  path === "/terms" ||
  path === "/dpa" ||
  path === "/invite" ||
  path === "/signup" ||
  path.startsWith("/signup/") ||
  // GL-13: the unsubscribe link in notification emails works signed out.
  path === "/notifications/unsubscribe" ||
  // Server-side PDF rendering of a published pack, authorised by a short-lived print token.
  path.startsWith("/report-print/");
