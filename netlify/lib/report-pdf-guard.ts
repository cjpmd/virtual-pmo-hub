// GL-10 follow-up: request checks for the Netlify report-pdf function, kept here (outside
// netlify/functions, where every top-level file is a function) so they are unit-tested.
//   * The page Chromium opens must be on one of the app's own hosts (REPORT_PDF_ALLOWED_ORIGINS),
//     never a URL taken as given from the request.
//   * The shared secret is compared in constant time.
import { createHash, timingSafeEqual } from "node:crypto";

export const DEFAULT_ALLOWED_ORIGINS = ["https://pmo.originoverthrow.com"];

/**
 * The allowed origins from a comma-separated list (REPORT_PDF_ALLOWED_ORIGINS), each normalised
 * to scheme://host[:port]. Entries that aren't http(s) URLs are dropped. Unset or empty: the
 * production app only.
 */
export function allowedOrigins(list: string | undefined | null): string[] {
  const origins = (list ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      try {
        const url = new URL(entry);
        return url.protocol === "https:" || url.protocol === "http:" ? [url.origin] : [];
      } catch {
        return [];
      }
    });
  return origins.length ? [...new Set(origins)] : DEFAULT_ALLOWED_ORIGINS;
}

/**
 * The origin of appUrl when it is exactly one of the allowed origins, else null. Compares parsed
 * origins (scheme, host and port), not strings, so "https://pmo.originoverthrow.com.evil.example",
 * "https://user@evil.example" tricks and other schemes are refused. Credentials in the URL are
 * refused outright. Only the origin is returned: the caller builds the path itself.
 */
export function allowedOrigin(appUrl: unknown, allowed: readonly string[]): string | null {
  if (typeof appUrl !== "string" || !appUrl.trim()) return null;
  let url: URL;
  try {
    url = new URL(appUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  return allowed.includes(url.origin) ? url.origin : null;
}

/** Constant-time check of "Authorization: Bearer <secret>". False when no secret is configured. */
export function bearerMatches(
  header: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const given = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  // Hash both sides so the comparison is over equal-length buffers whatever was sent.
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(given), digest(secret)) && given.length === secret.length;
}
