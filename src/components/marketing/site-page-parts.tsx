// Building blocks for the public content pages (/pricing, /product, /security, /privacy, /terms):
// the dark hero band, a section heading and the placeholder legal page, on the --site-* tokens.
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader, SitePage } from "@/components/marketing/site-chrome";
import { SupportLink } from "@/components/support-link";

/** The dark band with the header, the page title and an introduction. */
export function SiteHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-site-ink text-site-on-ink">
      <SiteHeader />
      <div className="mx-auto max-w-[1240px] px-7 pt-14 pb-16">
        {eyebrow && (
          <p className="m-0 mb-3 text-[0.9rem] font-medium text-site-on-ink-nav">{eyebrow}</p>
        )}
        <h1 className="m-0 max-w-[22ch] text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.08] font-semibold tracking-[-0.03em]">
          {title}
        </h1>
        {children && (
          <div className="mt-4 max-w-[42rem] text-[1.1rem] leading-[1.6] text-site-on-ink-muted">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

/** A section heading with an optional introduction. */
export function SiteSectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-[44rem] flex-col gap-2">
      <h2 className="m-0 text-[clamp(1.6rem,2.6vw,2.1rem)] leading-[1.15] font-semibold tracking-[-0.025em]">
        {title}
      </h2>
      {children && <p className="m-0 leading-[1.6] text-site-text-muted">{children}</p>}
    </div>
  );
}

/** A legal page whose text isn't written yet (/privacy, /terms). */
export function SitePlaceholderPage({ title }: { title: string }) {
  return (
    <SitePage>
      <SiteHero title={title} />
      <main className="mx-auto max-w-[1240px] px-7 py-14">
        <p className="m-0 max-w-[44rem] leading-[1.6] text-site-text-muted">
          This page is being finalised. <SupportLink className="text-site-accent-strong" />
        </p>
      </main>
      <SiteFooter />
    </SitePage>
  );
}
