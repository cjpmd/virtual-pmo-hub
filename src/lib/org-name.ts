// Suggested organisation name for the sign-up wizard, from the user's email domain.
// Free email providers say nothing about the organisation, so they get no suggestion.
const FREE_EMAIL_PROVIDERS = new Set([
  "gmail",
  "googlemail",
  "outlook",
  "hotmail",
  "live",
  "icloud",
  "yahoo",
  "proton",
  "protonmail",
  "aol",
]);

/** "acme-corp.com" → "Acme Corp"; "" for free email providers. */
export function orgFromDomain(domain: string): string {
  const first = domain.trim().toLowerCase().split(".")[0] ?? "";
  if (FREE_EMAIL_PROVIDERS.has(first)) return "";
  return first.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
