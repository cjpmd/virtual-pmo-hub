// Shared pieces of the public site (ORMO brand restyle): logo, header, buttons and footer.
// Colours come from the --site-* tokens in styles.css, gradients from the site-*-bg utilities.
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SupportLink } from "@/components/support-link";
import { cn } from "@/lib/utils";
import { contactEmail } from "@/lib/features";
import { focusRing, sitePill } from "./site-styles";

/** The mark with the stacked ORMO / PMO wordmark, for dark backgrounds. */
export function SiteLogo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label="ORMO PMO home"
      className={cn("flex items-center gap-2.5 text-site-on-ink no-underline", className)}
    >
      <img src="/brand/ormo-mark.png" alt="" width={38} height={38} className="size-[38px]" />
      <span className="flex flex-col font-site-display leading-none" aria-hidden="true">
        <span className="text-[20px] font-extrabold tracking-[0.01em]">ORMO</span>
        <span className="mt-[3px] text-[9px] font-bold tracking-[0.5em] text-[#bcd6ff]">PMO</span>
      </span>
    </Link>
  );
}

const navItems = [
  { to: "/product", label: "Product" },
  { to: "/", hash: "how", label: "How it works" },
  { to: "/security", label: "Security" },
  { to: "/pricing", label: "Pricing" },
] as const;

const navLink =
  "inline-flex min-h-11 items-center text-[14px] font-medium text-site-on-ink-nav no-underline hover:text-site-on-ink";

/** The header that sits on the gradient (or navy) band, linking to the public pages. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="relative mx-auto max-w-[1240px] px-4 py-[22px] sm:px-8">
      <div className="flex items-center gap-8">
        <SiteLogo />
        <nav aria-label="Main" className="ml-4 hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              {...("hash" in item && { hash: item.hash })}
              className={navLink}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <Link
            to="/login"
            className="hidden min-h-11 items-center px-3.5 text-[14px] font-semibold text-white no-underline hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className={cn(
              "inline-flex min-h-10 items-center rounded-full bg-white px-[18px] text-[14px] font-bold text-site-navy no-underline hover:bg-[#e8f1ff] hover:text-site-navy",
              focusRing,
            )}
          >
            Get started
          </Link>
          <button
            type="button"
            className={cn(
              "grid size-11 place-items-center rounded-full text-white hover:bg-white/10 md:hidden",
              focusRing,
            )}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="site-menu"
          aria-label="Menu"
          className="mt-4 flex flex-col rounded-2xl border border-site-ink-edge bg-site-ink/80 p-2 backdrop-blur md:hidden"
        >
          {[...navItems, { to: "/login", label: "Sign in" } as const].map((item) => (
            <Link
              key={item.label}
              to={item.to}
              {...("hash" in item && { hash: item.hash })}
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-[15px] font-medium text-white no-underline hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/** Public calls to action on a dark band: start a trial, or open the self-serve demo. */
export function SiteCtas({
  className,
  primaryLabel = "Start free",
}: {
  className?: string;
  primaryLabel?: string | undefined;
}) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <Link to="/signup" className={sitePill.primary}>
        {primaryLabel}
      </Link>
      <Link to="/auth/demo" className={sitePill.secondary}>
        View demo
      </Link>
    </div>
  );
}

/** The rounded gradient call-to-action panel that closes a page. */
export function SiteCtaBand({
  title,
  children,
  primaryLabel,
}: {
  title: string;
  children?: ReactNode;
  primaryLabel?: string;
}) {
  return (
    <section className="relative flex flex-wrap items-center justify-between gap-8 overflow-hidden rounded-[28px] px-6 py-12 text-white site-cta-bg sm:px-14 sm:py-[72px]">
      <div className="relative flex max-w-[620px] flex-col gap-3.5">
        <h2 className="m-0 font-site-display text-[clamp(28px,3vw,40px)] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance">
          {title}
        </h2>
        {children && (
          <p className="m-0 text-[17px] leading-[1.6] text-site-on-ink-muted">{children}</p>
        )}
      </div>
      <SiteCtas className="relative" primaryLabel={primaryLabel} />
    </section>
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
    <footer className="mt-auto border-t border-site-line">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-start justify-between gap-x-16 gap-y-8 px-4 pt-10 sm:px-8">
        <Link to="/" aria-label="ORMO PMO home" className="shrink-0">
          <img
            src="/brand/ormo-logo.png"
            alt="ORMO PMO"
            width={110}
            height={44}
            className="block h-11 w-auto"
          />
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-20 gap-y-6">
          {footerColumns.map((column) => (
            <div key={column.title} className="flex min-w-[9rem] flex-col gap-0.5">
              <h2 className="m-0 mb-1 text-[12px] font-bold tracking-[0.16em] text-site-text-faint uppercase">
                {column.title}
              </h2>
              {column.links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex min-h-9 items-center text-[14px] text-site-text-muted no-underline hover:text-site-accent-strong"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-3 px-4 py-8 text-[13px] text-site-text-faint sm:px-8">
        <span>
          © {new Date().getFullYear()} ORMO PMO ·{" "}
          <SupportLink className="text-site-accent-strong hover:text-[#0b4fb0]" />
        </span>
        {contactEmail && (
          <a
            href={`mailto:${contactEmail}`}
            className="text-site-accent-strong hover:text-[#0b4fb0]"
          >
            {contactEmail}
          </a>
        )}
      </div>
    </footer>
  );
}

/** The page frame: Plus Jakarta Sans on the light page colour, with the site's text colour. */
export function SitePage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-site-paper font-site text-site-text antialiased">
      {children}
    </div>
  );
}

/** The gradient band with the orange glow and the optional decorative arcs. */
export function SiteGradientBand({
  children,
  arcs = true,
  className,
}: {
  children: ReactNode;
  arcs?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden text-white site-hero-bg", className)}>
      {arcs && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute right-[-22%] bottom-[-70%] aspect-square w-[95%] rounded-full border border-white/22" />
          <div className="absolute right-[-30%] bottom-[-88%] aspect-square w-[110%] rounded-full border border-white/12" />
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/** Small uppercase label above a heading. */
export function SiteEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "m-0 text-[12px] font-bold tracking-[0.16em] text-site-accent-strong uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}
