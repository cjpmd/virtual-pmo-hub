// Shared pieces of the public site (design G, docs/design/homepage-g.html): fonts, logo,
// header, buttons and footer. Colours come from the --site-* tokens in styles.css.
import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { contactEmail } from "@/lib/features";

export function SiteLogo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("flex items-center gap-2.5 text-site-on-ink no-underline", className)}
    >
      <img src="/brand/ormo-mark.png" alt="" width={28} height={28} className="size-7" />
      <span className="text-[1.08rem] font-semibold tracking-[-0.01em]">ORMO PMO</span>
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
          to="/login"
          className="inline-flex min-h-11 items-center px-4 text-[0.95rem] text-site-on-ink no-underline"
        >
          Log in
        </Link>
        <Link
          to="/signup"
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

/** Public calls to action, including self-serve demo entry. */
export function SiteCtas({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Link
        to="/request-access"
        className={cn(ctaBase, "bg-site-accent text-white hover:bg-site-accent-strong")}
      >
        Get started
      </Link>
      <Button
        asChild
        variant="ghost"
        className={cn(
          ctaBase,
          "border border-site-ink-outline text-site-on-ink hover:bg-site-ink hover:text-site-on-ink hover:border-site-on-ink-faint",
        )}
      >
        <Link to="/auth/demo">
          <Eye />
          View demo
        </Link>
      </Button>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-site-line">
      <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-3 p-7 text-[0.9rem] text-site-text-muted">
        <span>© ORMO PMO</span>
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
