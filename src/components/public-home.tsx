// The public homepage at / (design G, docs/design/homepage-g.html). Signed-in users are sent
// straight to their workspace (see routes/index.tsx).
import type { ReactNode } from "react";
import { ProductPreview } from "@/components/marketing/product-preview";
import { SiteCtas, SiteFooter, SiteHeader, SitePage } from "@/components/marketing/site-chrome";
import { cn } from "@/lib/utils";

const iconProps = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

const assurances: { text: string; icon: ReactNode }[] = [
  {
    text: "Hosted in the UK",
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  },
  {
    text: "Role-based access to every record",
    icon: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  },
  {
    text: "Full audit trail",
    icon: <path d="M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01" />,
  },
];

const features: { title: string; text: string; tint: string; stroke: string; icon: ReactNode }[] = [
  {
    title: "Health that rolls up",
    text: "Schedule, finance, effort, issues and benefits combine into one rating, from project to programme to portfolio.",
    tint: "bg-site-tint-blue",
    stroke: "stroke-site-accent-strong",
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </>
    ),
  },
  {
    title: "Reports you can trust",
    text: "Each status report records the declared position next to the evidenced one, so committees see where they differ.",
    tint: "bg-site-tint-green",
    stroke: "stroke-site-icon-green",
    icon: (
      <>
        <path d="M9 12l2 2 4-4" />
        <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
      </>
    ),
  },
  {
    title: "Benefits, measured",
    text: "Track what each investment promised and measure it through to realisation, long after go-live.",
    tint: "bg-site-tint-violet",
    stroke: "stroke-site-icon-violet",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
  },
];

export function PublicHome() {
  return (
    <SitePage>
      <section className="bg-site-ink text-site-on-ink">
        <SiteHeader />
        <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-6 px-7 pt-[72px] text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-site-ink-pill px-3.5 py-1.5 text-[0.88rem] text-site-on-ink-nav">
            <span className="size-[7px] rounded-full bg-site-good" />
            Portfolio management with built-in assurance
          </span>
          <h1 className="m-0 max-w-[17ch] text-[clamp(2.6rem,5.6vw,4.6rem)] leading-[1.04] font-semibold tracking-[-0.035em]">
            Know which projects are really on track.
          </h1>
          <p className="m-0 max-w-[40rem] text-[1.18rem] leading-[1.6] text-site-on-ink-muted">
            Portfolios, programmes and projects in one place, with health calculated from delivery
            data and every status report checked against the evidence.
          </p>
          <SiteCtas className="justify-center pt-1" />
          <ProductPreview />
        </div>
      </section>

      <section id="security" className="scroll-mt-4 border-b border-site-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-center gap-x-12 gap-y-4 p-7 text-[0.95rem] font-medium text-site-text-soft">
          {assurances.map((item) => (
            <span key={item.text} className="inline-flex items-center gap-2.5">
              <svg width="18" height="18" className="stroke-site-accent" {...iconProps}>
                {item.icon}
              </svg>
              {item.text}
            </span>
          ))}
        </div>
      </section>

      <section id="product" className="scroll-mt-4">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-12 px-7 py-[88px]">
          <h2 className="m-0 max-w-[20ch] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] font-semibold tracking-[-0.03em]">
            Everything a PMO needs, without the spreadsheets.
          </h2>
          <div className="flex flex-wrap gap-5">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-[1_1_300px] flex-col gap-3.5 rounded-2xl border border-site-line p-7"
              >
                <span
                  className={cn("grid size-[42px] place-items-center rounded-[10px]", feature.tint)}
                >
                  <svg width="20" height="20" className={feature.stroke} {...iconProps}>
                    {feature.icon}
                  </svg>
                </span>
                <h3 className="m-0 text-[1.2rem] font-semibold">{feature.title}</h3>
                <p className="m-0 leading-[1.6] text-site-text-muted">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mb-[72px] max-w-[1240px] px-7">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-[20px] bg-site-ink p-12 text-site-on-ink max-sm:p-8">
          <div className="flex flex-[1_1_420px] flex-col gap-2.5">
            <h2 className="m-0 text-[2rem] font-semibold tracking-[-0.025em]">
              Bring your portfolio into focus.
            </h2>
            <p className="m-0 text-[1.05rem] text-site-on-ink-muted">
              Set up your first portfolio in minutes. No spreadsheets to migrate by hand.
            </p>
          </div>
          <SiteCtas />
        </div>
      </section>

      <SiteFooter />
    </SitePage>
  );
}
