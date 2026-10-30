// The sign-in, sign-up and account pages (ORMO brand restyle): the gradient brand panel beside a
// white form card. The card is always light (.site-auth in styles.css), whatever the app theme.
// Signed-in screens (organisation errors, already in an organisation) keep CentredCard.
import type { ReactNode } from "react";
import { SiteGradientBand, SiteLogo } from "@/components/marketing/site-chrome";
import { SupportLink } from "@/components/support-link";

const points = [
  "Health calculated from delivery data",
  "Every status report checked against the evidence",
  "Portfolios, programmes and projects in one place",
];

export function AuthSplit({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-site-paper font-site text-site-text antialiased lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <SiteGradientBand className="lg:min-h-screen">
        <div className="flex h-full flex-col gap-10 px-4 py-6 sm:px-8 lg:min-h-screen lg:px-14 lg:py-10">
          <SiteLogo />
          <div className="hidden max-w-[30rem] flex-col gap-6 lg:my-auto lg:flex">
            <p className="m-0 font-site-display text-[clamp(32px,3.2vw,44px)] leading-[1.08] font-extrabold tracking-[-0.025em] text-balance">
              Know which projects are really on track.
            </p>
            <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[16px] text-site-on-ink-muted">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-3">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-site-orange-soft" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SiteGradientBand>
      <div className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <main className="site-auth w-full max-w-md rounded-[20px] border border-site-line bg-site-surface p-6 text-site-text shadow-[0_30px_60px_-30px_rgba(10,42,107,0.25)] sm:p-9">
          <h1 className="m-0 font-site-display text-[28px] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
            {title}
          </h1>
          <div className="mt-3">{children}</div>
        </main>
        <footer className="mt-6 text-center text-[13px] text-site-text-faint">
          © ORMO PMO · <SupportLink className="text-site-accent-strong" />
        </footer>
      </div>
    </div>
  );
}
