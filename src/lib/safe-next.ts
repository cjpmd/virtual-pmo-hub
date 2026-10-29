/** Only same-site paths are allowed as a return address after sign-in. */
export const safeNext = (value: unknown): string | undefined =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;

/**
 * Splits a `next` path into what <Navigate> / navigate() take: `to` doesn't parse a query string,
 * so "/invite?token=abc" becomes { to: "/invite", search: { token: "abc" } }.
 */
export function nextLocation(next: string): { to: string; search: Record<string, string> } {
  const [path = "/", query = ""] = next.split("?", 2);
  return { to: path || "/", search: Object.fromEntries(new URLSearchParams(query)) };
}
