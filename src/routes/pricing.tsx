import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SiteCtas, SiteFooter, SitePage } from "@/components/marketing/site-chrome";
import { siteHead } from "@/components/marketing/site-head";
import { SiteHero, SiteSectionHeading } from "@/components/marketing/site-page-parts";
import { annualMonthsFree, seatPrice, trialDays, trialSeats } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pricing")({
  head: () =>
    siteHead(
      "Pricing — ORMO PMO",
      `£${seatPrice.month} per user per month, or £${seatPrice.year} per user per year. Viewers are free. Start a ${trialDays}-day free trial, no card needed.`,
    ),
  component: PricingPage,
});

type Interval = "month" | "year";

const included = [
  "Portfolios, programmes and projects with rolled-up health",
  "Milestones, tasks, gates and dependencies",
  "RAIDD, change control, boards and committee packs",
  "Benefits register, pathway and realisation",
  "Resource allocation and scenarios",
  "Dashboards, reports and data export",
];

const faqs: { q: string; a: string }[] = [
  {
    q: "Who needs a paid seat?",
    a: "Admins and members (including the project manager and PMO roles) use a paid seat. Viewers are free: they can read everything they have access to but can't change anything.",
  },
  {
    q: "How does the free trial work?",
    a: `Create an account and set up your organisation to start a ${trialDays}-day free trial with up to ${trialSeats} paid seats and as many viewers as you like. No card is needed to start. Subscribe from Settings › Subscription whenever you're ready.`,
  },
  {
    q: "How do I add people?",
    a: "Admins buy seats and invite people by email, choosing each person's role. You can also let colleagues from your email domain or Microsoft organisation ask to join, and approve them.",
  },
  {
    q: "Is VAT included?",
    a: "No. Prices exclude VAT, which is added at checkout where it applies. You can add your business tax ID at checkout.",
  },
  {
    q: "How do I pay?",
    a: "By card, through Stripe. We never see or store your card details.",
  },
  {
    q: "Can I add seats later?",
    a: "Yes, at any time. You pay a prorated amount for the rest of the current billing period.",
  },
  {
    q: "Can I reduce seats, switch billing period or cancel?",
    a: "Yes. Seat reductions, switches between monthly and annual billing, and cancellations take effect at your next renewal. There are no refunds for part of a billing period.",
  },
];

function PricingPage() {
  const [interval, setBillingInterval] = useState<Interval>("month");

  return (
    <SitePage>
      <SiteHero eyebrow="Pricing" title="Simple pricing, per user.">
        Pay only for the people who make changes. Viewers are always free.
      </SiteHero>

      <main className="mx-auto flex max-w-[1240px] flex-col gap-16 px-7 py-14">
        <section className="flex flex-col gap-6" aria-labelledby="plan-heading">
          <div
            role="group"
            aria-label="Billing period"
            className="inline-flex w-fit rounded-lg border border-site-line p-1"
          >
            {(
              [
                ["month", "Monthly"],
                ["year", "Annual"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                onClick={() => setBillingInterval(value)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-[0.95rem] font-medium",
                  interval === value
                    ? "bg-site-ink text-site-on-ink"
                    : "text-site-text-soft hover:text-site-text",
                )}
              >
                {label}
                {value === "year" && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.75rem] font-semibold",
                      interval === value
                        ? "bg-site-good text-site-ink"
                        : "bg-site-tint-green text-site-icon-green",
                    )}
                  >
                    {annualMonthsFree} months free
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-5">
            <div className="flex flex-[1_1_360px] flex-col gap-5 rounded-2xl border border-site-line p-8">
              <h2 id="plan-heading" className="m-0 text-[1.2rem] font-semibold">
                ORMO PMO
              </h2>
              <p className="m-0 flex flex-wrap items-baseline gap-x-2" aria-live="polite">
                <span className="text-[3rem] leading-none font-semibold tracking-[-0.03em]">
                  £{interval === "month" ? seatPrice.month : seatPrice.year}
                </span>
                <span className="text-site-text-muted">
                  per user per {interval === "month" ? "month" : "year"}, excl. VAT
                </span>
              </p>
              <p className="m-0 text-[0.95rem] text-site-text-muted">
                {interval === "month"
                  ? `Or £${seatPrice.year} per user per year: ${annualMonthsFree} months free.`
                  : `The same as £${seatPrice.month} a month for ${12 - annualMonthsFree} months.`}{" "}
                VAT is added at checkout where it applies.
              </p>
              <Link
                to="/signup"
                className="inline-flex min-h-[50px] w-fit items-center rounded-[10px] bg-site-accent px-6 font-semibold text-white no-underline hover:bg-site-accent-strong"
              >
                Start free trial
              </Link>
              <p className="m-0 text-[0.9rem] text-site-text-muted">
                {trialDays} days free, up to {trialSeats} paid seats. No card needed.
              </p>
            </div>
            <div className="flex flex-[1_1_360px] flex-col gap-4 rounded-2xl bg-site-tint-blue p-8">
              <h3 className="m-0 text-[1.05rem] font-semibold">Everything is included</h3>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {included.map((item) => (
                  <li key={item} className="flex gap-2.5 leading-[1.5] text-site-text-soft">
                    <Check className="mt-0.5 size-[18px] shrink-0 text-site-accent-strong" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <InfoCard title="Who pays">
            Admins and members use a paid seat. Viewers are free and read-only. Admins buy seats and
            invite people by email.
          </InfoCard>
          <InfoCard title="Free trial">
            {trialDays} days, up to {trialSeats} paid seats and unlimited viewers. No card needed to
            start.
          </InfoCard>
          <InfoCard title="Billing">
            Card only, through Stripe. Add seats at any time (prorated). Reductions, billing period
            switches and cancellations apply at the next renewal, with no mid-term refunds.
          </InfoCard>
        </section>

        <section className="flex flex-col gap-6">
          <SiteSectionHeading title="Questions" />
          <div className="flex max-w-[52rem] flex-col divide-y divide-site-line border-y border-site-line">
            {faqs.map((faq) => (
              <details key={faq.q} className="group py-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="text-site-text-muted transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="m-0 mt-2 max-w-[44rem] leading-[1.6] text-site-text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
          <p className="m-0 text-[0.95rem] text-site-text-muted">
            Buying for a larger organisation?{" "}
            <Link
              to="/request-access"
              className="font-medium text-site-accent-strong hover:underline"
            >
              Contact sales
            </Link>
            .
          </p>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-6 rounded-[20px] bg-site-ink p-12 text-site-on-ink max-sm:p-8">
          <div className="flex flex-[1_1_420px] flex-col gap-2.5">
            <h2 className="m-0 text-[2rem] font-semibold tracking-[-0.025em]">
              Try it with your own portfolio.
            </h2>
            <p className="m-0 text-[1.05rem] text-site-on-ink-muted">
              {trialDays} days free. No card needed.
            </p>
          </div>
          <SiteCtas primaryLabel="Start free trial" />
        </section>
      </main>

      <SiteFooter />
    </SitePage>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-site-line p-6">
      <h3 className="m-0 text-[1.05rem] font-semibold">{title}</h3>
      <p className="m-0 leading-[1.6] text-site-text-muted">{children}</p>
    </div>
  );
}
