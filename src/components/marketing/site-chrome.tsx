// Shared pieces of the public site (design G, docs/design/homepage-g.html): fonts, logo,
// header, buttons and footer. Colours come from the --site-* tokens in styles.css.
import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import type { ReactNode } from "react";
import { SupportLink } from "@/components/support-link";
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

/** Dark header, linking to the public pages. */
export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-7 py-5">
      <SiteLogo />
      <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
        <Link to="/product" className={navLink}>
          Product
        </Link>
        <Link to="/security" className={navLink}>
          Security
        </Link>
        <Link to="/pricing" className={navLink}>
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
export function SiteCtas({
  className,
  primaryLabel = "Get started",
}: {
  className?: string;
  primaryLabel?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Link
        to="/signup"
        className={cn(ctaBase, "bg-site-accent text-white hover:bg-site-accent-strong")}
      >
        {primaryLabel}
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

const footerColumns = [
  {
    title: "ORMO PMO",
    links: [
      { to: "/product", label: "Product" },
      { to: "/pricing", label: "Pricing" },
      { to: "/security", label: "Security" },
    ],
  },
  {
    title: "Company",
    links: [
      { to: "/request-access", label: "Contact" },
      { to: "/privacy", label: "Privacy" },
      { to: "/terms", label: "Terms" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-site-line">
      <nav
        aria-label="Footer"
        className="mx-auto flex max-w-[1240px] flex-wrap gap-x-20 gap-y-6 px-7 pt-9"
      >
        {footerColumns.map((column) => (
          <div key={column.title} className="flex min-w-[10rem] flex-col gap-1">
            <h2 className="m-0 mb-1 text-[0.85rem] font-semibold text-site-text">{column.title}</h2>
            {column.links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="inline-flex min-h-9 items-center text-[0.9rem] text-site-text-muted no-underline hover:text-site-accent-strong"
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-3 p-7 text-[0.9rem] text-site-text-muted">
        <span>
          © ORMO PMO · <SupportLink />
        </span>
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
