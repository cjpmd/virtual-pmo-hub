// Shared pieces of the public site (design G, docs/design/homepage-g.html): fonts, logo,
// header, buttons and footer. Colours come from the --site-* tokens in styles.css.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { contactEmail, selfSignup } from "@/lib/features";

export function SiteLogo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("flex items-center gap-2.5 text-site-on-ink no-underline", className)}
    >
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect width="28" height="28" rx="7" className="fill-site-accent" />
        <rect x="7" y="15" width="3.5" height="6" rx="1" fill="#FFFFFF" />
        <rect x="12.25" y="11" width="3.5" height="10" rx="1" fill="#FFFFFF" />
        <rect x="17.5" y="7" width="3.5" height="14" rx="1" fill="#FFFFFF" />
      </svg>
      <span className="text-[1.08rem] font-semibold tracking-[-0.01em]">Virtual PMO</span>
    </Link>
  );
}

const navLink =
  "inline-flex min-h-11 items-center px-3.5 text-[0.95rem] text-site-on-ink-nav no-underline hover:text-site-on-ink";

/** Dark header. Product and Security jump to sections on the homepage. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-7 py-5">
      <SiteLogo />
      <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
        <a href="/#product" className={navLink}>
          Product
        </a>
        <a href="/#security" className={navLink}>
          Security
        </a>
        <Link to="/request-access" className={navLink}>
          Pricing
        </Link>
        <Link
          to="/signin"
          className="inline-flex min-h-11 items-center px-4 text-[0.95rem] text-site-on-ink no-underline"
        >
          Log in
        </Link>
        <Link
          to={selfSignup ? "/signup" : "/request-access"}
          className="inline-flex min-h-10 items-center rounded-lg bg-site-accent px-4 text-[0.95rem] font-semibold text-white no-underline hover:bg-site-accent-strong"
        >
          Sign up
        </Link>
      </nav>
    </header>
  );
}

const ctaBase =
  "inline-flex min-h-[50px] items-center rounded-[10px] px-6 font-semibold no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-link";

/** "Get started" and "Book a demo", both to the request-access page. */
export function SiteCtas({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Link
        to="/request-access"
        className={cn(ctaBase, "bg-site-accent text-white hover:bg-site-accent-strong")}
      >
        Get started
      </Link>
      <Link
        to="/request-access"
        search={{ demo: true }}
        className={cn(
          ctaBase,
          "border border-site-ink-outline text-site-on-ink hover:border-site-on-ink-faint",
        )}
      >
        Book a demo
      </Link>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-site-line">
      <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-3 p-7 text-[0.9rem] text-site-text-muted">
        <span>© Virtual PMO</span>
        {contactEmail && (
          <a href={`mailto:${contactEmail}`} className="text-site-accent-strong">
            {contactEmail}
          </a>
        )}
      </div>
    </footer>
  );
}

/** The page frame: Geist on white, with the site's text colour. */
export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-site-paper font-geist text-site-text antialiased">
      {children}
    </div>
  );
}
