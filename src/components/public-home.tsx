// The public homepage at / (ORMO brand restyle, design handoff "ORMO PMO Website"). Signed-in
// users are sent straight to their workspace (see routes/index.tsx).
import { Link } from "@tanstack/react-router";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import {
  SiteCtaBand,
  SiteCtas,
  SiteEyebrow,
  SiteFooter,
  SiteGradientBand,
  SiteHeader,
  SitePage,
} from "@/components/marketing/site-chrome";
import { SiteHeroEyebrow } from "@/components/marketing/site-page-parts";
import { seatPrice, trialDays } from "@/lib/pricing";
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
    text: "Data stored in the UK",
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

// Copy follows the design, kept to what the product does today: health dimensions are the
// stored ones, and there are no tool integrations yet (Planner sync is Phase 5).
const pillars = [
  {
    title: "One place for the whole portfolio",
    body: "Portfolios, programmes and projects in a single structure, so leaders see the same picture as delivery teams.",
  },
  {
    title: "Health calculated, not declared",
    body: "Schedule, finance, effort, issues and benefits roll up into a health rating that updates as the work does.",
  },
  {
    title: "Every report checked",
    body: "Submitted RAG statuses are compared against the evidence, and mismatches are flagged before they reach the board.",
  },
];

const shots = [
  {
    label: "Assurance",
    eyebrow: "Portfolio assurance",
    title: "Every report, next to the evidence",
    body: "See what status reports declare beside what delivery data shows. Divergence alerts surface the projects reporting better than reality.",
    src: "/brand/site/shot-assurance.png",
    width: 1323,
    height: 552,
  },
  {
    label: "Projects",
    eyebrow: "Project overview",
    title: "Health by dimension, month by month",
    body: "Schedule, finance, effort, issues and benefits health tracked at every month-end, with milestone slippage and the last highlight report in one view.",
    src: "/brand/site/shot-project-summary.png",
    width: 1347,
    height: 756,
  },
  {
    label: "Schedule",
    eyebrow: "Schedule forecast",
    title: "Slippage you can see coming",
    body: "Every milestone plotted baseline against actual or forecast, with a delivery profile that shows exactly where the plan is drifting.",
    src: "/brand/site/shot-schedule.png",
    width: 1289,
    height: 797,
  },
  {
    label: "Dependencies",
    eyebrow: "Dependency map",
    title: "Follow the chain across programmes",
    body: "Programmes, projects, milestones and external parties on one map, with links coloured by health and styled by type.",
    src: "/brand/site/shot-dependency-map.png",
    width: 1315,
    height: 784,
  },
  {
    label: "Benefits",
    eyebrow: "Benefits map",
    title: "From project to strategic objective",
    body: "Trace how projects deliver capabilities, outcomes and benefits, and spot the gaps where a benefit has no owner or measure.",
    src: "/brand/site/shot-benefits-map.png",
    width: 1285,
    height: 781,
  },
];

const steps = [
  {
    n: "01",
    title: "Set up",
    body: "Create your portfolios, programmes and projects, or import them from a spreadsheet.",
  },
  {
    n: "02",
    title: "Calculate",
    body: "ORMO derives health for every project and rolls it up through programmes and portfolios.",
  },
  {
    n: "03",
    title: "Challenge",
    body: "Status reports are checked against the evidence, so reviews focus on what needs a decision.",
  },
];

// Where ORMO sits against the two kinds of tool a PMO usually weighs it against. Categories
// only, no named competitors. Typical prices checked 18/11/2026: task and board tools about
// $5–$12 per user per month (Trello, ClickUp, monday Standard, Asana Starter); portfolio
// suites about £23 (Microsoft Planner and Project Plan 3, UK) to $25–$55 (Wrike Business,
// Planner and Project Plan 5) per user per month. Re-check before changing the price rows.
const comparisonColumns = ["Task and board tools", "ORMO PMO", "Enterprise PPM suites"] as const;

const comparison: { label: string; values: [string, string, string] }[] = [
  {
    label: "Built for",
    values: ["Teams tracking tasks", "PMOs governing portfolios", "Large PMOs with consultants"],
  },
  {
    label: "Programmes and portfolios",
    values: ["Add-ons or workarounds", "Built in", "Built in"],
  },
  {
    label: "Project health",
    values: ["Declared by the project manager", "Calculated from the evidence", "Usually declared"],
  },
  {
    label: "Benefits realisation",
    values: ["Not covered", "Register, pathway and tracking", "Often an extra module"],
  },
  {
    label: "RAIDD, decisions and board packs",
    values: ["Basic or none", "Included", "Included"],
  },
  {
    label: "Set-up",
    values: ["Minutes", "An afternoon", "Months"],
  },
  {
    label: "Typical price",
    values: [
      "£7–£15 per user, guests often charged",
      `£${seatPrice.month} per editor, viewers free`,
      "£20–£45+ per user, plus implementation",
    ],
  },
];

const pricingPoints = [
  {
    title: "Pay only for editors",
    body: "Sponsors, boards and stakeholders get free read-only access, so most organisations pay for a fraction of the people who use ORMO.",
  },
  {
    title: "Everything included",
    body: "One plan with every feature. No premium tier for benefits, reporting or governance.",
  },
  {
    title: "No implementation project",
    body: "Import from a spreadsheet or start with sample data, and run your first board pack in week one.",
  },
];

const h2 =
  "m-0 font-site-display text-[clamp(30px,3.2vw,40px)] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance";

export function PublicHome() {
  return (
    <SitePage>
      <SiteGradientBand>
        <SiteHeader />
        <div className="mx-auto max-w-[1240px] px-4 pt-12 sm:px-8 sm:pt-[72px]">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,460px),1fr))] items-end gap-x-16 gap-y-10">
            <div>
              <SiteHeroEyebrow>Portfolio · Programme · Project</SiteHeroEyebrow>
              <h1 className="m-0 mt-[26px] font-site-display text-[clamp(40px,5.4vw,68px)] leading-[1.04] font-extrabold tracking-[-0.025em] text-balance">
                Know which projects are really on track.
              </h1>
            </div>
            <div>
              <p className="m-0 mb-7 max-w-[540px] text-[19px] leading-[1.6] text-pretty text-site-on-ink-muted">
                Portfolios, programmes and projects in one place, with health calculated from
                delivery data and every status report checked against the evidence.
              </p>
              <SiteCtas />
              <p className="m-0 mt-4 text-[14px] font-medium text-site-on-ink-muted">
                £{seatPrice.month} per user per month · Viewers free · {trialDays}-day trial, no
                card needed
              </p>
            </div>
          </div>
          <div className="mt-12 rounded-t-2xl border border-b-0 border-white/22 bg-white/12 px-2.5 pt-2.5 shadow-[0_-20px_80px_-20px_rgba(3,12,40,0.6)] sm:mt-[72px]">
            <img
              src="/brand/site/shot-project-dark.png"
              alt="ORMO project view showing declared amber against evidenced red, with progress against plan"
              width={1377}
              height={819}
              fetchPriority="high"
              className="block h-auto w-full rounded-t-[10px]"
            />
          </div>
        </div>
      </SiteGradientBand>

      <section
        id="security"
        aria-label="Security"
        className="scroll-mt-4 border-b border-site-line"
      >
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-center gap-x-12 gap-y-4 px-4 py-6 text-[14px] font-medium text-site-text-soft sm:px-8">
          {assurances.map((item) => (
            <span key={item.text} className="inline-flex items-center gap-2.5">
              <svg width="18" height="18" className="stroke-site-accent-strong" {...iconProps}>
                {item.icon}
              </svg>
              {item.text}
            </span>
          ))}
          <Link
            to="/security"
            className="inline-flex items-center font-semibold text-site-accent-strong no-underline hover:text-[#0b4fb0]"
          >
            How we protect your data →
          </Link>
        </div>
      </section>

      <section
        id="product"
        className="mx-auto w-full max-w-[1240px] scroll-mt-4 px-4 pt-[88px] pb-10 sm:px-8 sm:pt-[104px]"
      >
        <div className="mb-14 grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-end gap-12">
          <h2 className="m-0 font-site-display text-[clamp(32px,3.6vw,46px)] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance">
            Status reports tell you what people think. ORMO shows you what's happening.
          </h2>
          <p className="m-0 text-[17px] leading-[1.65] text-pretty text-site-text-muted">
            Green-until-red reporting is the most expensive habit in delivery. ORMO calculates
            health from the work itself, so the conversation starts with facts.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-[18px] border border-site-line bg-site-surface p-8"
            >
              <div aria-hidden="true" className="mb-7 h-1 w-10 rounded-sm site-brand-bar" />
              <h3 className="m-0 mb-2.5 text-[20px] font-bold tracking-[-0.01em]">
                {pillar.title}
              </h3>
              <p className="m-0 text-[15px] leading-[1.65] text-site-text-muted">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <ProductTour />

      <section id="how" className="mx-auto w-full max-w-[1240px] scroll-mt-4 px-4 py-24 sm:px-8">
        <SiteEyebrow className="mb-3.5">How it works</SiteEyebrow>
        <h2 className={cn(h2, "mb-12")}>Three steps to an honest portfolio view.</h2>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] border-t border-site-rule p-0">
          {steps.map((step) => (
            <li key={step.n} className="pt-8 pr-8">
              <div className="mb-[18px] font-site-display text-[15px] font-extrabold text-site-violet">
                {step.n}
              </div>
              <h3 className="m-0 mb-2.5 text-[20px] font-bold">{step.title}</h3>
              <p className="m-0 max-w-[340px] text-[15px] leading-[1.65] text-site-text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <WhyOrmo />

      <section id="teams" className="scroll-mt-4 bg-site-ink text-white">
        <div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-6 px-4 py-[88px] sm:px-8 sm:py-[104px]">
          <h2 className={cn(h2, "col-span-full mb-6")}>
            Scales from your first programme to your fiftieth.
          </h2>
          <TeamCard
            eyebrow="Growing teams"
            eyebrowClass="text-site-on-ink-sky"
            washClass="bg-[linear-gradient(160deg,rgba(54,169,236,0.16),rgba(54,169,236,0)_60%)]"
            title="Set up in an afternoon"
          >
            Create your portfolio, or import your projects from a spreadsheet, and get a working
            portfolio view without a PMO consultancy or months of configuration.
          </TeamCard>
          <TeamCard
            eyebrow="Enterprise"
            eyebrowClass="text-site-orange-soft"
            washClass="bg-[linear-gradient(160deg,rgba(255,138,42,0.16),rgba(255,138,42,0)_60%)]"
            title="Governance that holds up"
          >
            Portfolio and programme hierarchies, role-based access and a full audit trail behind
            every status, ready for the board.
          </TeamCard>
          <div id="pricing" className="col-span-full mt-10 scroll-mt-4">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
              <h2 className={cn(h2, "max-w-[640px]")}>Priced for the people who do the work.</h2>
              <Link
                to="/pricing"
                className="inline-flex font-semibold text-site-on-ink-sky no-underline hover:text-white"
              >
                See pricing →
              </Link>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-6">
              {pricingPoints.map((point) => (
                <div key={point.title} className="border-t border-site-ink-line pt-6">
                  <h3 className="m-0 mb-2.5 text-[20px] font-bold">{point.title}</h3>
                  <p className="m-0 text-[15px] leading-[1.65] text-site-on-ink-faint">
                    {point.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div
        id="get-started"
        className="mx-auto w-full max-w-[1240px] px-4 py-[88px] sm:px-8 sm:py-[104px]"
      >
        <SiteCtaBand title="See your portfolio as it really is." />
      </div>

      <SiteFooter />
    </SitePage>
  );
}

/** Where ORMO sits between task tools and enterprise suites. */
function WhyOrmo() {
  return (
    <section
      id="why"
      aria-labelledby="why-heading"
      className="mx-auto w-full max-w-[1240px] scroll-mt-4 px-4 pb-24 sm:px-8"
    >
      <SiteEyebrow className="mb-3.5">Why ORMO</SiteEyebrow>
      <div className="mb-12 grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-end gap-12">
        <h2 id="why-heading" className={h2}>
          The PMO layer your task tool is missing, without the enterprise price.
        </h2>
        <p className="m-0 text-[17px] leading-[1.65] text-pretty text-site-text-muted">
          Task tools track work. Enterprise project-management suites cost a fortune and take months
          to set up. ORMO sits in between: everything a PMO needs to govern a portfolio, ready in an
          afternoon.
        </p>
      </div>
      <div className="overflow-x-auto rounded-[18px] border border-site-line bg-site-surface">
        <table className="w-full min-w-[720px] border-collapse text-left text-[15px]">
          <caption className="sr-only">
            ORMO PMO compared with task and board tools and enterprise PPM suites
          </caption>
          <thead>
            <tr>
              <th scope="col" className="p-5">
                <span className="sr-only">Feature</span>
              </th>
              {comparisonColumns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    "p-5 align-bottom text-[14px] font-bold",
                    index === 1 ? "bg-site-navy text-white" : "text-site-text-soft",
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr key={row.label} className="border-t border-site-line">
                <th scope="row" className="p-5 align-top font-semibold">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td
                    key={comparisonColumns[index]}
                    className={cn(
                      "p-5 align-top leading-[1.5]",
                      index === 1
                        ? "bg-site-navy/[0.06] font-semibold text-site-text"
                        : "text-site-text-muted",
                    )}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-4 text-[13px] text-site-text-muted">
        Typical list prices per user per month, excluding VAT, for each kind of tool.
      </p>
    </section>
  );
}

function TeamCard({
  eyebrow,
  eyebrowClass,
  washClass,
  title,
  children,
}: {
  eyebrow: string;
  eyebrowClass: string;
  washClass: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-[20px] border border-site-ink-line p-9", washClass)}>
      <p className={cn("m-0 mb-4 text-[12px] font-bold tracking-[0.16em] uppercase", eyebrowClass)}>
        {eyebrow}
      </p>
      <h3 className="m-0 mb-3 text-[22px] font-bold">{title}</h3>
      <p className="m-0 text-[15px] leading-[1.65] text-site-on-ink-faint">{children}</p>
    </div>
  );
}

/** Tabbed screenshots of the product, one area at a time. */
function ProductTour() {
  const [active, setActive] = useState(0);
  const shot = shots[active] ?? shots[0]!;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + shots.length) % shots.length;
    setActive(next);
    document.getElementById(`tour-tab-${next}`)?.focus();
  }

  return (
    <section
      id="tour"
      aria-label="Product tour"
      className="mx-auto w-full max-w-[1240px] scroll-mt-4 px-4 pt-[72px] pb-6 sm:px-8"
    >
      <div
        role="tablist"
        aria-label="Product areas"
        onKeyDown={onKeyDown}
        className="mb-7 flex w-fit max-w-full flex-wrap gap-2 rounded-[28px] border border-site-line bg-site-surface p-1.5"
      >
        {shots.map((item, index) => (
          <button
            key={item.label}
            id={`tour-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls="tour-panel"
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            className={cn(
              "min-h-10 cursor-pointer rounded-full px-[18px] text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent-strong",
              index === active
                ? "bg-site-navy text-white"
                : "text-site-text-muted hover:text-site-text",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="tour-panel"
        role="tabpanel"
        aria-labelledby={`tour-tab-${active}`}
        className="flex flex-wrap items-start gap-10"
      >
        <div className="max-w-[380px] flex-[1_1_280px]">
          <SiteEyebrow className="mb-3.5">{shot.eyebrow}</SiteEyebrow>
          <h3 className="m-0 mb-3.5 font-site-display text-[28px] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
            {shot.title}
          </h3>
          <p className="m-0 text-[16px] leading-[1.65] text-pretty text-site-text-muted">
            {shot.body}
          </p>
          <Link
            to="/product"
            className="mt-6 inline-flex font-semibold text-site-accent-strong no-underline hover:text-[#0b4fb0]"
          >
            See everything ORMO does →
          </Link>
        </div>
        <div className="min-w-0 flex-[2_1_560px] rounded-2xl p-2 shadow-[0_30px_60px_-30px_rgba(10,42,107,0.45)] site-brand-frame">
          {/* Every screenshot loads with the page and stays mounted, so switching tabs shows
              an image that is already decoded instead of an empty frame while it downloads. */}
          {shots.map((item, index) => (
            <img
              key={item.src}
              src={item.src}
              alt={item.title}
              width={item.width}
              height={item.height}
              hidden={index !== active}
              className="block h-auto w-full rounded-[10px] bg-white"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
