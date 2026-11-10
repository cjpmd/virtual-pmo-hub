# Legal pages: solicitor checklist (GL-7)

The Terms of service (`/terms`), Privacy notice (`/privacy`) and Data Processing Agreement
(`/dpa`) are live as a **pre-review draft**, version `2026-11-10` (`src/lib/legal.ts`). The
subprocessor table on all three pages and on `/security` comes from `src/data/subprocessors.ts`.

Each point below is marked `[[solicitor to confirm …]]` in the source. The marker is hidden on
the rendered page (`withoutSolicitorMarkers` in `src/lib/legal.ts`), so the sentence before it is
what visitors read now. `src/lib/legal.test.ts` fails if any other `[[…]]` placeholder is left
in the page text. When a point is settled, change the text if needed and delete its marker. If
the change is material, bump `TERMS_VERSION` and `LEGAL_LAST_UPDATED`.

## Facts the owner supplied (10/11/2026)

- Business: ORMO PMO is a trading name of OriginOverthrow, a sole trader business based in
  Scotland; not incorporated. Stated in the Terms (1), Privacy (1), DPA (1) and the site footer,
  each with the support email (the footer's support link).
- ICO registration: pending.
- Contact and privacy email: support@ormo-pmo.originoverthrow.com.
- Deletion: 30 days after an organisation is closed; 30 days for account deletion (to match
  GL-11, which hasn't been built yet: there's no closure or deletion feature today).
- Microsoft Entra region: "Microsoft's global infrastructure, per Microsoft's terms".

## Facts checked while drafting (10/11/2026)

- Supabase project region eu-west-2 (London). The Supabase organisation is on the **Free plan**,
  and Supabase's docs say Free projects get **no automatic backups** (daily backups with 7 days'
  access start on Pro). The pages say there are no automatic backups now and that, when there
  are, they will be kept for 7 days. Update this when the plan changes.
- Log retention: Supabase's own pages disagree for the Free plan (1 day on the docs pricing table,
  7 days on the main pricing page; Pro is 7 days). The Privacy notice says "up to 7 days".
- Resend sending region eu-west-1 (Ireland), from the Resend domain settings.
- The Stripe account's head office is in GB, so the contracting entity is Stripe Payments UK Ltd.
- Lovable's hosting docs say published pages are served from locations around the world; its
  region setting covers only Lovable's own backend, which this app doesn't use.

## Terms of service (`/terms`)

| # | Section | Point to confirm |
|---|---|---|
| T1 | 1. About these terms | **Filled (10/11/2026):** "ORMO PMO is a trading name of OriginOverthrow", with the support email, in the Terms, Privacy, DPA and footer; the page marker is removed. Still to confirm: whether "OriginOverthrow" is itself a business name rather than the owner's own name, in which case Companies Act 2006 Part 41 may still require the owner's name and an address for service on the site. |
| T2 | 4. Seats, prices and billing | 30 days' email notice of price changes, applying from the next renewal. |
| T3 | 7. Your data | Using anonymous, aggregated usage information to run and improve the Service. |
| T4 | 11. Liability (free trial) | No liability at all during the free trial, with the service "as is", subject to the carve-outs (death or personal injury caused by negligence, fraud, anything that can't be limited by law). Enforceability under the Unfair Contract Terms Act 1977 for business customers. |
| T5 | 11. Liability (paid) | Cap at the **lesser** of 12 months' fees and £1,000, same carve-outs. **Deliberately tight: review before taking larger customers.** |
| T6 | 11. Liability (data protection) | The same limits apply to liability under the DPA and data protection law. Many customers will expect a separate, higher data protection cap. |
| T7 | 12. Termination and export | Deletion within 30 days of closure, and how backups are described. |
| T8 | 14. General | Excluding third-party rights under the Contract (Third Party Rights) (Scotland) Act 2017. |
| T9 | 15. Governing law | Scots law with exclusive jurisdiction of the Scottish courts (customers in England may ask for non-exclusive). |

## Privacy notice (`/privacy`)

| # | Section | Point to confirm |
|---|---|---|
| P1 | 1. Who we are | Filled with T1 (same wording and residual question); the ICO registration is pending, and the notice says so. |
| P2 | 4. How we use it | Legitimate interests as the basis for security, product improvement and enquiries: is a written legitimate interests assessment needed? |
| P3 | 5. Cookies and local storage | Only strictly necessary storage (session, theme), so no consent banner under PECR. |
| P4 | 7. International transfers | The general wording on adequacy, the IDTA and the UK Addendum. |
| P5 | 8. How long we keep it | Billing records kept for six years after the financial year (HMRC). |
| P6 | 8. How long we keep it | Server and security logs "up to 7 days, or longer to investigate an incident". |
| P7 | 8. How long we keep it | Backups: none today on the Free plan; 7 days once on Pro. |

## Data Processing Agreement (`/dpa`)

| # | Section | Point to confirm |
|---|---|---|
| D1 | 3. Details: special category data | Customers must not enter special category or criminal offence data unless they have a lawful basis and have told us. |
| D2 | 5. Security | A description of staff access controls to production (today: the owner only). |
| D3 | 6. Subprocessors | 30 days' notice of changes, the right to object, and a refund of prepaid fees if the customer leaves. |
| D4 | 7. International transfers | The general transfer wording. |
| D5 | 9. Personal data breaches | Notice to the customer within 48 hours. |
| D6 | 10. Deletion or return | Deletion within 30 days of closure; the backups wording. |
| D7 | 11. Information and audits | One audit a year, 30 days' notice, at the customer's cost. |
| D8 | 12. Liability and precedence | The DPA follows the Terms' liability section (see T4 to T6). |

## Subprocessors (`/security`, `/privacy`, `/dpa`)

| # | Subprocessor | Point to confirm |
|---|---|---|
| S1 | Supabase Inc. | Support access from the US is covered by the UK Addendum in Supabase's DPA. |
| S2 | Lovable | The transfer safeguard for worldwide page serving, and whether Lovable's DPA has been accepted. |
| S3 | Resend | The UK Addendum or the UK Extension to the Data Privacy Framework, per Resend's current terms. |
| S4 | Stripe Payments UK Ltd | The IDTA or Addendum for processing in the US. |
| S5 | Microsoft (Entra ID) | Whether Entra ID is our subprocessor or the customer's own identity provider (when they sign in with their organisation's Microsoft account), and the safeguard. It stays listed until this is decided. |
| S6 | Anthropic | The UK Addendum in Anthropic's DPA, and the wording of its no-training commitment under its commercial terms. |

## Organisation deletion and account closure (GL-11, wording not on the pages yet)

GL-11 (design `docs/design/account-closure.md`, SQL `docs/sql/gl-11-account-closure.sql`) adds a
30-day cancellation window before an organisation's data is deleted. The pages now say "When an
organisation is closed, its data is deleted within 30 days" (Privacy 8, Terms 12, DPA 10), but
with the window the purge happens 30 days after the request (normally within 2 days after that,
because it runs daily). Proposed replacement, for the three places (T7, D6 and Privacy 8):

> When an administrator deletes an organisation, it becomes read-only at once, and any
> administrator can cancel the deletion for 30 days. After that we delete the organisation's
> data, normally within 2 days. Copies in backups expire as described below.

| # | Section | Point to confirm |
|---|---|---|
| G1 | Terms 12, Privacy 8, DPA 10 | The replacement wording above, and whether "30 days, then normally within 2 days" is acceptable against "within 30 days" in customer contracts. |
| G2 | Privacy 8 | Account closure: the account (sign-in, name, email, avatar, preferences) is deleted or anonymised at once; records the person wrote stay with their organisations and show "Former member". The current sentence ("within 30 days") already covers this. |
| G3 | Privacy 8 / Terms 4 | Billing records stay with Stripe after an organisation is deleted (the Stripe customer and invoices are kept for HMRC's six years). Add: "billing records stay with Stripe for the period the law requires." |
| G4 | DPA 6 (subprocessors) | Resend keeps logs of emails sent for its own retention period; we can't delete them per organisation. |

## Not on the pages yet

- Cloudflare (Turnstile CAPTCHA) is left off the subprocessor list because CAPTCHA isn't switched
  on. Add it when it is, with 30 days' notice to customers (D3).
- Microsoft sign-up doesn't record which Terms version was accepted; email sign-up does (auth
  user metadata `terms_version`, `terms_accepted_at`, which the user can edit). A tamper-proof
  record would need a database change.
