// Versions of the public legal documents (/terms, /privacy, /dpa). Change the version and the
// "last updated" date together whenever the text changes in substance. Sign-up records the
// terms and DPA versions a new account accepted (services/auth.ts, signUpWithPassword).

/** The version of the Terms of service, and of the DPA they incorporate. */
export const TERMS_VERSION = "2026-11-10";

/** Shown as "Last updated" on each legal page. */
export const LEGAL_LAST_UPDATED = "10 November 2026";

/** Matches a "[[solicitor to confirm …]]" review marker, with the space before it. */
const SOLICITOR_MARKER = /\s*\[\[solicitor to confirm[^\]]*\]\]/g;

/** Text as shown on a legal page: review markers for the solicitor are left out. */
export function withoutSolicitorMarkers(text: string) {
  return text.replace(SOLICITOR_MARKER, "");
}
