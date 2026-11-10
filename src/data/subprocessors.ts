// The subprocessors listed on /security, /privacy and /dpa: one list, so the pages can't
// disagree. Checked on 10/11/2026:
// - Supabase: project region eu-west-2 (Supabase project details).
// - Resend: the sending domain's region is eu-west-1 (Resend domain details).
// - Stripe: the account's head office is in GB, so the contracting entity is Stripe Payments
//   UK Ltd; Stripe processes card data in the United States as well.
// - Anthropic: the report-ai-summary edge function calls the Anthropic API.
// - Lovable: its hosting docs say published pages are served from locations around the world
//   (its region setting covers only Lovable's own backend, which we don't use).
// Not listed: Cloudflare Turnstile, which isn't switched on (components/auth/captcha.tsx).
// Add it here, with its region, when CAPTCHA goes live.
// [[solicitor to confirm …]] markers are hidden on the pages (LegalText) and listed in
// docs/legal-drafts/solicitor-checklist.md. Any other [[…]] would show highlighted; a unit
// test (lib/legal.test.ts) fails if one is left.

export interface Subprocessor {
  name: string;
  purpose: string;
  /** Where the data is stored or processed. */
  region: string;
  /** The safeguard for any transfer outside the UK. */
  transfers: string;
}

export const subprocessors: Subprocessor[] = [
  {
    name: "Supabase Inc.",
    purpose: "Database, file storage, sign-in and server functions",
    region: "UK (London, AWS eu-west-2)",
    transfers:
      "Data is stored in London. Supabase Inc. is based in the United States and its staff may access data to provide support; that access is covered by the UK International Data Transfer Addendum to the EU Standard Contractual Clauses in Supabase's data processing agreement. [[solicitor to confirm]]",
  },
  {
    name: "Lovable",
    purpose: "Hosting and serving the web application",
    region: "Global (pages served from Lovable's worldwide hosting network)",
    transfers:
      "The web application is served from locations worldwide, under Lovable's data processing agreement. Customer data is not stored by the web host; it stays in our database in London. [[solicitor to confirm: Lovable transfer safeguard]]",
  },
  {
    name: "Resend",
    purpose: "Account, invitation, notification and billing email",
    region: "EU (Ireland, AWS eu-west-1)",
    transfers:
      "Email is sent from Ireland, which the UK recognises as adequate. Resend is based in the United States; any access from there is covered by the UK International Data Transfer Addendum or the UK Extension to the EU-US Data Privacy Framework, as Resend's terms provide. [[solicitor to confirm]]",
  },
  {
    name: "Stripe Payments UK Ltd",
    purpose: "Subscription billing, card payments and VAT calculation",
    region: "UK, with processing in the United States",
    transfers:
      "Stripe processes payment data in the United States under the UK International Data Transfer Agreement or Addendum where it applies. [[solicitor to confirm]]",
  },
  // Microsoft Entra ID is only the sign-in provider, and for "Sign in with Microsoft" the
  // customer's own Entra tenant may be the customer's provider rather than our subprocessor.
  // Whether to list it is for the solicitor; it stays listed until then.
  {
    name: "Microsoft (Entra ID)",
    purpose: "Sign in with Microsoft (sign-in only; we receive your name and email address)",
    region: "Microsoft's global infrastructure, per Microsoft's terms",
    transfers:
      "Under Microsoft's terms and data protection addendum. [[solicitor to confirm: whether Entra ID is our subprocessor or the customer's own provider, and its safeguard]]",
  },
  {
    name: "Anthropic",
    purpose: "AI drafting of report summaries, only when a user asks for a draft",
    region: "United States",
    transfers:
      "Covered by the UK International Data Transfer Addendum in Anthropic's data processing addendum. Under its commercial terms, Anthropic commits not to train its models on customer content sent through its API. [[solicitor to confirm]]",
  },
];
