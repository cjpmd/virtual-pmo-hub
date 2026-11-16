# Fix the failing SEO findings

## Failing findings (from the latest scan)

1. **Some pages use generic shared metadata** (medium)
2. **Some shared links have generic preview text** (medium)
3. **Add a sitemap** (low)

## What I found

- Every public page (home, product, pricing, security, privacy, terms, DPA, contact, sign-in, sign-up, demo, password pages) already has its own title, description and share preview.
- The pages that fall back to the generic "ORMO PMO" text are the signed-in app pages (portfolio, delivery, governance and so on). Search engines and link previews only ever see the sign-in loading screen on those, so the fallback is what they show.
- The site-wide fallback also carries a leftover `twitter:site = @Lovable` tag.
- There is no sitemap, and robots.txt does not point to one.

## Changes

1 and 2 — site-wide fallback (one file, `src/routes/__root.tsx`)
- Replace the fallback title, description, og:title and og:description with text that accurately describes those signed-in pages, e.g. title "Your PMO workspace — ORMO PMO", description "Sign in to ORMO PMO to see your organisation's portfolios, programmes, projects, risks, decisions and reports."
- Remove the `@Lovable` twitter:site tag.
- Public pages keep their own metadata unchanged.

3 — sitemap
- Add a static `public/sitemap.xml` listing the public marketing and legal pages only, on https://ormo-pmo.originoverthrow.com:
  `/`, `/product`, `/pricing`, `/security`, `/privacy`, `/terms`, `/dpa`, `/request-access`.
- Sign-in, sign-up, demo, password, invite and all signed-in pages are left out. No `lastmod` dates.
- Add `Sitemap: https://ormo-pmo.originoverthrow.com/sitemap.xml` to `public/robots.txt`, keeping the existing crawler blocks.

## Technical notes

- A static file rather than the router-derived sitemap generator: the generator requires a sitemap flag on every one of ~150 route files, which conflicts with keeping changes focused. The static list needs a manual edit when a public marketing page is added.
- No database changes. Finish with tsc (app and scripts), vitest, lint and vite build, then mark the three findings fixed so the next scan re-checks them.
- The metadata scanner may still note that signed-in pages share one fallback; giving each of ~50 private pages its own text would be a separate, larger package.
