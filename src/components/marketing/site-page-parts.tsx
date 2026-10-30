// Building blocks for the public content pages (/pricing, /product, /security, /privacy, /terms):
// the gradient page header, a section heading and the placeholder legal page, on the --site-* tokens.
import type { ReactNode } from "react";
import {
  SiteFooter,
  SiteGradientBand,
  SiteHeader,
  SitePage,
} from "@/components/marketing/site-chrome";
import { SupportLink } from "@/components/support-link";

/** The gradient band with the header, the page title and an introduction. */
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
    <SiteGradientBand>
      <SiteHeader />
      <div className="mx-auto flex min-h-[270px] max-w-[1240px] flex-col justify-center px-4 pt-10 pb-[72px] sm:px-8">
        {eyebrow && <SiteHeroEyebrow>{eyebrow}</SiteHeroEyebrow>}
        <h1 className="m-0 mt-6 max-w-[22ch] font-site-display text-[clamp(36px,4.6vw,56px)] leading-[1.06] font-extrabold tracking-[-0.025em] text-balance first:mt-0">
          {title}
        </h1>
        {children && (
          <div className="mt-5 max-w-[42rem] text-[19px] leading-[1.6] text-pretty text-site-on-ink-muted">
            {children}
          </div>
        )}
      </div>
    </SiteGradientBand>
  );
}

/** The outlined pill with an orange dot, above a title on the gradient. */
export function SiteHeroEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 inline-flex w-fit items-center gap-2.5 rounded-full border border-site-ink-pill px-3.5 py-[7px] text-[12px] font-semibold tracking-[0.16em] text-site-on-ink-menu uppercase">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-site-orange-soft" />
      {children}
    </p>
  );
}

/** A section heading with an optional introduction. */
export function SiteSectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex max-w-[44rem] flex-col gap-3">
      <h2 className="m-0 font-site-display text-[clamp(26px,2.6vw,34px)] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
        {title}
      </h2>
      {children && (
        <p className="m-0 text-[16px] leading-[1.65] text-pretty text-site-text-muted">
          {children}
        </p>
      )}
    </div>
  );
}

/** A legal page whose text isn't written yet (/privacy, /terms). */
export function SitePlaceholderPage({ title }: { title: string }) {
  return (
    <SitePage>
      <SiteHero title={title} />
      <main className="mx-auto w-full max-w-[1240px] px-4 py-16 sm:px-8">
        <div className="max-w-[44rem] rounded-[18px] border border-site-line bg-site-surface p-8">
          <p className="m-0 leading-[1.65] text-site-text-muted">
            This page is being finalised. <SupportLink className="text-site-accent-strong" />
          </p>
        </div>
      </main>
      <SiteFooter />
    </SitePage>
  );
}
