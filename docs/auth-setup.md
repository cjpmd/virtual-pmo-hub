# Auth setup: email + password and Sign in with Microsoft

ORMO PMO signs people in with Supabase Auth in two ways:

- **Email and password**, for anyone. Email confirmation is required before the first sign-in.
- **Sign in with Microsoft** (Entra ID), through the Supabase `azure` provider and the `/common`
  endpoint, so people from any organisation's Entra tenant can sign in.

Magic links are no longer used: nothing in the app calls `signInWithOtp`.

This page lists the manual setup (Entra, Supabase, email, publisher verification), how account
linking works, how to add CAPTCHA later, and a manual test checklist. No secret goes in the
repository. The Entra client secret and the SMTP password live only in the Supabase dashboard.

## How it fits together

| Route | What it does |
|---|---|
| `/login` | Sign in with Microsoft, then email + password, *Forgot password?* and *Create an account*. Signed-in visitors go to the app. `/signin` redirects here. |
| `/signup` | Name, email, password and confirm password (at least 10 characters, with strength guidance), then a *Check your email* screen with a resend button (one resend a minute). |
| `/auth/callback` | Where Microsoft and the confirmation email return. Completes the sign-in and turns URL errors into readable messages, including Entra admin consent. Then it opens `next`, or organisation setup if the user has no organisation. |
| `/auth/forgot-password` | Sends the reset email. The response is the same whether or not the address has an account. |
| `/auth/reset-password` | The reset email lands here. supabase-js raises `PASSWORD_RECOVERY` and the user sets a new password. |
| `/signup/setup` | Creates the organisation (`create_organisation`). The user becomes its admin and a 14-day trial starts (`organisation_subscriptions.trial_ends_at`). |

Other behaviour:

- **Route protection.** Protected routes send signed-out visitors to `/login?next=…`. Signing
  out returns to `/login` without `next`. A signed-in user with no organisation goes to
  `/signup/setup`.
- **Kill switch.** `VITE_SELF_SIGNUP=false` turns organisation creation off. Users without an
  organisation then see "ask your administrator for an invite".
- **Profiles.** `private.handle_new_user` (a trigger on `auth.users`) creates the profile for
  either sign-in method. The name comes from `full_name`, then `name` (sent by Microsoft), then
  the part of the email before the @. `private.sync_profile_email` keeps `profiles.email` in step
  when the email changes. Migration: `20261028112834_auth_email_microsoft`.
- **RLS.** Unchanged and identical for both methods. Every policy checks `auth.uid()` against
  memberships, and a linked Microsoft identity belongs to the same `auth.users` row (the same
  uid). A new user from either method has no membership, so they can read nothing but their
  own profile until they create or join an organisation.
  Checked on live (28/10/2026): none of the 397 policies looks at the provider, `amr` or JWT
  claims, and every public table has RLS on. Found, not fixed: `authenticated` may update
  every column of its own `profiles` row, including `email`. `sync_profile_email` puts the
  real address back on the next email change. Revoke `update (email)` before 2.1 matches
  invites by email.

---

## a) Microsoft Entra ID: tenant and app registration

### 1. Get an Entra tenant (free)

If you don't have a work tenant to own the app, create one:

1. Go to <https://azure.microsoft.com/free> and sign up with a new or existing Microsoft
   account. A free Azure account comes with a Microsoft Entra ID (Free) tenant ("Default
   Directory"). Nothing is charged for app registrations.
2. Optional but recommended: in **Entra admin center → Settings → Domain names → Add custom
   domain**, add `originoverthrow.com` and create the TXT record it shows. Publisher
   verification (d) needs a verified custom domain.

The tenant only *owns* the app registration. Because the app is multi-tenant, people sign in
from their own organisation's tenant.

### 2. Register the app

**Entra admin center → Identity → Applications → App registrations → New registration**:

- **Name:** `ORMO PMO`. This is shown on Microsoft's consent screen.
- **Supported account types:** *Accounts in any organizational directory (Any Microsoft Entra
  ID tenant – Multitenant)*. Optionally choose *…and personal Microsoft accounts (e.g. Skype,
  Xbox)* to let outlook.com and hotmail.com users in too. See the note on personal accounts
  under "Account linking".
- **Redirect URI:** platform **Web**, value
  `https://xvdlmtkzfmbcegkmampz.supabase.co/auth/v1/callback`. This is the Supabase callback,
  not the app's `/auth/callback`; Supabase forwards to the app afterwards. If you later put
  Supabase on a custom domain, add that callback too.

Copy the **Application (client) ID** from the Overview page.

### 3. Client secret

**Certificates & secrets → Client secrets → New client secret**:

- Description `Supabase`. Expiry: the longest offered (24 months).
- Copy the secret's **Value** straight away (it is shown once). You need the Value, not the
  Secret ID.
- **Put a reminder in your calendar a month before the expiry date.** When the secret expires,
  every Microsoft sign-in fails. To rotate it: create a second secret, paste it into Supabase,
  test Microsoft sign-in, then delete the old secret.

### 4. API permissions

**API permissions → Add a permission → Microsoft Graph → Delegated permissions**:

- `openid`, `email`, `profile` (under OpenId permissions)
- `User.Read` (usually already there)

None of these need admin consent in a default tenant. Click **Grant admin consent for <your
tenant>** for your own tenant anyway. In customer tenants that only allow admin consent, users
see the app's "Your organisation needs to approve ORMO PMO" page until their IT admin
approves it (below).

### 5. Optional claims: `email` and `xms_edov` (needed for account linking)

Supabase links a Microsoft sign-in to an existing email + password account only when it
trusts that Microsoft has verified the email address. For Entra ID that trust comes from the
`xms_edov` claim ("email domain owner verified"). Without it, Supabase treats the Microsoft
email as **unverified**. The same person can then end up with two accounts, or be unable to
sign in with Microsoft.

**Token configuration → Add optional claim**:

1. Token type **ID**. Tick **`email`** and **`xms_edov`**. Add.
2. If it asks *"Turn on the Microsoft Graph email permission?"*, tick it and add.
3. Repeat for token type **Access** with **`email`** and **`xms_edov`**.

If `xms_edov` isn't in the list, open **Manifest** and add it by hand under
`optionalClaims.idToken` and `optionalClaims.accessToken`:

```json
{ "name": "xms_edov", "source": null, "essential": false, "additionalProperties": [] },
{ "name": "email",    "source": null, "essential": false, "additionalProperties": [] }
```

Check that the claims appear in the manifest, then test account linking (checklist T6).

### 6. Branding

**Branding & properties**: set the logo, home page `https://pmo.originoverthrow.com`, and the
terms of service and privacy statement URLs. These appear on the consent screen.

### How a customer's IT admin approves the app

If a customer tenant blocks user consent, their admin can approve ORMO PMO for everyone in
either of these ways:

- Sign in to ORMO PMO with Microsoft and, on the consent screen, tick **Consent on behalf of
  your organization**.
- Open `https://login.microsoftonline.com/<their-tenant-id>/adminconsent?client_id=<client id>`.

Afterwards the app appears under their **Enterprise applications**.

---

## b) Supabase

Dashboard for project `xvdlmtkzfmbcegkmampz`.

### Azure provider

**Authentication → Sign In / Providers → Azure**:

- Enable: on.
- **Application (client) ID:** from a.2.
- **Secret value:** from a.3.
- **Azure Tenant URL:** `https://login.microsoftonline.com/common`.
- Save. The callback URL it shows must match the redirect URI in a.2.

### URL configuration

**Authentication → URL Configuration**:

- **Site URL:** `https://pmo.originoverthrow.com`
- **Redirect URLs** (the app adds `?next=…`, so use `/**`):
  - `https://pmo.originoverthrow.com/**`
  - `http://localhost:8080/**` and `http://127.0.0.1:8080/**` (local dev and e2e)
  - the Lovable preview host, e.g. `https://*.lovable.app/**`, if you test there

### Email provider and passwords

**Authentication → Sign In / Providers → Email**:

- **Enable Email provider:** on.
- **Confirm email:** on. Sign-in is refused until the link is opened.
- **Secure email change:** on. Both the old and the new address must confirm.
- **Secure password change:** your choice. If on, changing a password more than 24 hours after
  signing in needs a fresh sign-in. The reset flow is unaffected.
- **Minimum password length:** `10` (the app enforces the same).
- **Password requirements:** optional. The app recommends variety but doesn't require it.
- **Email OTP expiration:** `3600` seconds (the templates say "1 hour").

**Authentication → Attack Protection**: turn on **leaked password protection** (also a build
plan manual step).

**Magic links:** Supabase has no separate switch for them. They are part of the Email
provider, and the magic-link template stays in the dashboard. The app no longer sends them,
and nothing to do with magic links needs changing. Leave the magic-link template as it is.

**Allow new users to sign up** (Authentication → Sign In / Providers, top of the page): on.
Account creation is open; organisation creation has its own kill switch (`VITE_SELF_SIGNUP`).

**Manual linking** (`Enable manual linking`): leave **off**. Automatic linking by verified
email (below) needs no setting.

### Email templates

**Authentication → Emails → Templates**. Paste each file's contents and set the subject:

| Template | File | Subject |
|---|---|---|
| Confirm signup | `supabase/templates/confirm-signup.html` | Confirm your email for ORMO PMO |
| Reset password | `supabase/templates/reset-password.html` | Reset your ORMO PMO password |
| Change email address | `supabase/templates/change-email.html` | Confirm your new email address for ORMO PMO |

The templates use `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` and
`{{ .SiteURL }}`. Leave *Magic link*, *Invite user* and *Reauthentication* as they are; the app
doesn't use them.

### Rate limits

**Authentication → Rate Limits**: with custom SMTP (c) you can raise *emails sent per hour*
from the default (2/hour without custom SMTP) to e.g. 100. The app also limits resends to one
a minute in the UI.

---

## c) Custom SMTP from originoverthrow.com

This matches decision D2: Resend over SMTP. Postmark works the same way with its own SMTP host
and DNS records.

1. **Resend → Domains → Add domain** `originoverthrow.com` (region EU if offered).
2. Add the DNS records Resend shows at your DNS host. They look like this, but use Resend's
   exact values:

   | Type | Name | Value | Purpose |
   |---|---|---|---|
   | TXT | `resend._domainkey` | `p=MIGfMA0GCSq…` (from Resend) | **DKIM** signing key |
   | MX | `send` | `feedback-smtp.eu-west-1.amazonses.com`, priority 10 | bounce handling (Return-Path) |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | **SPF** for the Return-Path domain |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@originoverthrow.com; adkim=r; aspf=r` | **DMARC** |

   - If `originoverthrow.com` already sends mail (e.g. Microsoft 365), keep its existing SPF
     record on the root. Resend's SPF lives on the `send` subdomain, so the two don't clash.
     Have only one DMARC record.
   - Start DMARC at `p=none`, read the reports for two weeks, then move to `p=quarantine`, and
     later `p=reject`.
3. Wait until Resend shows the domain as **Verified**, then create an API key with *Sending
   access* only.
4. **Supabase → Authentication → Emails → SMTP Settings**: enable custom SMTP.

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the Resend API key |
   | Sender email | `no-reply@originoverthrow.com` |
   | Sender name | `ORMO PMO` |

5. Send yourself a sign-up confirmation. In the received message's headers, check
   `spf=pass`, `dkim=pass` and `dmarc=pass`.

The same values become the edge-function secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS` and `SMTP_FROM` in work package 2.1. They are not needed for auth.

---

## d) Publisher verification (Microsoft AI Cloud Partner Program)

Multi-tenant apps from unverified publishers show "unverified" on the consent screen, and many
tenants block users from consenting to them. Verification adds the blue "verified" badge.

1. **Join the Microsoft AI Cloud Partner Program** (formerly the Microsoft Partner Network,
   MPN) at <https://partner.microsoft.com> → *Join*. Sign in with a work account in your Entra
   tenant, not a personal Microsoft account. Enter the legal business details for Origin
   Overthrow. Microsoft verifies the business (email, domain and sometimes documents), which
   can take a few days.
2. When verification completes, note your **Partner ID** (Partner global account ID, formerly
   the "MPN ID") in **Partner Center → Account settings → Identifiers**. Use the *global*
   (PGA) ID, not a location ID.
3. **Prerequisites in Entra:**
   - The app's **publisher domain** (App registration → Branding & properties) must be a
     verified custom domain in your tenant, e.g. `originoverthrow.com` (see a.1).
   - The email domain of the Partner Center account's primary contact must match a verified
     domain in the tenant.
   - The person doing step 4 needs one of the Entra roles Application Administrator, Cloud
     Application Administrator or owner of the app, plus one of the Partner Center roles
     Account Admin or MPN Admin.
4. **App registration → Branding & properties → Publisher verification → Add MPN ID to verify
   publisher**. Enter the Partner ID, then choose **Verify and save**.
5. The consent screen now shows "Origin Overthrow" with the verified badge. Check it from a
   second tenant.

If verification fails, the error names the requirement that isn't met (most often a domain
mismatch or a missing role).

---

## Account linking

**Goal:** one person, one ORMO PMO account, whether they use email + password, Microsoft,
or both with the same address.

How Supabase handles it:

- **Automatic linking.** Supabase links identities that share a **verified** email to the same
  user. There's no dashboard switch: it is always on. *Enable manual linking* is a different
  feature and stays off.
- **Microsoft first, then email + password.** `/signup` with the same address doesn't create a
  second user: Supabase returns its usual "check your email" response and sends nothing. The
  person uses **Forgot password?** to add a password to the existing account. The page says so.
- **Email + password first, then Microsoft.** If Microsoft marks the email as verified
  (`xms_edov`, a.5), Supabase adds the Microsoft identity to the existing user. If the
  password account was never confirmed, Supabase may drop the unconfirmed password identity
  (protection against pre-account takeover). The person then adds a password again with
  *Forgot password?*.
- **Without `xms_edov`:** Supabase treats the Microsoft email as unverified and won't link it.
  This is why a.5 matters.
- **Personal Microsoft accounts** (if allowed in a.2) don't always send a verified email.
  Linking can then fail, and the person keeps using the method they started with.

To check linking in the database (SQL editor):

```sql
select u.id, u.email, array_agg(i.provider order by i.provider) as providers
from auth.users u join auth.identities i on i.user_id = u.id
where lower(u.email) = lower('<test address>')
group by u.id, u.email;
```

Expected: **one row**, with `providers` = `{azure,email}`.

---

## CAPTCHA later (Cloudflare Turnstile)

Out of scope for now. The forms are ready for it:

- `components/auth/captcha.tsx` exports `useCaptcha()`, which today returns no widget and no
  token.
- `/login`, `/signup`, `/auth/forgot-password` and the resend buttons already render
  `captcha.widget`, wait for `captcha.ready`, reset after each submit, and pass
  `captcha.token` to the services.
- Every service in `services/auth.ts` that Supabase protects with CAPTCHA takes an optional
  `captchaToken` and sends it only when set.

To switch it on:

1. Create a Turnstile widget for `pmo.originoverthrow.com` and the preview hosts.
2. Put the secret key in **Supabase → Authentication → Attack Protection → CAPTCHA**
   (Turnstile), and the site key in `VITE_TURNSTILE_SITE_KEY`.
3. Implement `useCaptcha()` with the Turnstile widget (e.g. `@marsidev/react-turnstile`): keep
   the token in state, set `ready` when there is one, and reset the widget in `reset()`.
4. Give the e2e branch Cloudflare's always-pass test keys. The e2e global setup signs in
   through the API, so it then needs a token too (build plan 2.2).

Microsoft sign-in isn't affected: Supabase doesn't ask for CAPTCHA on OAuth.

---

## Manual test checklist

Use a private window for each test. Use a real inbox, or a `+tag` address (e.g.
`you+t1@yourdomain.com`), and an Entra test user.

**T1 Email sign-up and confirm**
1. `/signup`: enter a name, email and a 9-character password. It says "Use at least 10
   characters" and won't submit.
2. Type a 10+ character password and a different confirmation: "The passwords don't match".
3. Submit valid details. The *Check your email* screen appears, and *Resend* counts down from
   60s.
4. Before confirming, sign in on `/login`: "Confirm your email address before signing in"
   appears, with a resend button.
5. Open the email: it uses the branded template. Click the link: `/auth/callback`, then
   `/signup/setup`.
6. In Supabase, the profile has the name you typed.
7. Create the organisation. `organisation_subscriptions.trial_ends_at` is about 14 days ahead.

**T2 Wrong credentials don't reveal accounts**
- On `/login`, a wrong password for a real account and any password for a made-up address
  both show "Email or password is incorrect."
- On `/auth/forgot-password`, both a real and a made-up address show the same "If … has an
  account" message.

**T3 Password reset**
1. `/login` → *Forgot password?*. The email is prefilled if you typed it. Send.
2. Open the branded email. The link goes to `/auth/reset-password` with "Set a new password".
3. Enter a new password twice. You are sent into the app.
4. Sign out, then sign in with the new password (works) and the old one (refused).
5. Open the same reset link again: "That reset link didn't work".

**T4 Microsoft sign-in, new user**
1. `/login` → *Sign in with Microsoft*, using an Entra user who has never used ORMO PMO.
2. Consent screen (first time), then `/auth/callback`, then `/signup/setup`.
3. In Supabase, the profile has the Microsoft display name and email, and
   `auth.identities.provider = 'azure'`.

**T5 Microsoft sign-in, returning user**
- Sign out, then sign in with Microsoft again. There is no consent screen, and you land in the
  app (or on `next`).

**T6 Account linking**
1. With address A: sign up with email + password and confirm (T1). Create an organisation.
2. Sign out. Sign in with Microsoft as the Entra user whose email is A.
3. You land in the **same** organisation; no setup screen.
4. Run the SQL in "Account linking": one user, providers `{azure,email}`.
5. Reverse order with address B: sign in with Microsoft first. Then `/signup` with B shows
   *Check your email*, but no email arrives and no second user exists. Use *Forgot password?*
   for B, set a password, and sign in with it: same user, providers `{azure,email}`.

**T7 Admin consent message**
- In a tenant where user consent is off (Entra → Enterprise applications → Consent and
  permissions → *Do not allow user consent*), sign in with Microsoft as a normal user.
- You see "Your organisation needs to approve ORMO PMO" with *Details for your IT team*,
  never a raw `AADSTS` error page.
- Quick check without a tenant:
  `/auth/callback?error=access_denied&error_description=AADSTS65001` shows the same page.

**T8 Sign-out**
- From the user menu, *Sign out* goes to `/login` with no `?next=`.
- The browser Back button doesn't show cached data.

**T9 Protected routes**
1. Signed out, open `/portfolio`: you are sent to `/login?next=%2Fportfolio`. After signing
   in you land on `/portfolio`.
2. Signed in, open `/login`: you are sent into the app.
3. `/signin?next=%2Fportfolio` redirects to `/login?next=%2Fportfolio`.

**T10 Demo**
- Signed out, *View demo* → `/login?next=/auth/demo`. Sign in (or create an account and
  confirm): the demo opens read-only.

**T11 RLS for both methods**
- As a fresh user from T4 (no organisation), the app shows organisation setup, and API calls
  for projects return no rows.
- After T6, the Microsoft and the password sign-ins see exactly the same records.
