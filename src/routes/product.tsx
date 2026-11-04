import { createFileRoute } from "@tanstack/react-router";
import { SiteCtaBand, SiteFooter, SitePage } from "@/components/marketing/site-chrome";
import { siteHead } from "@/components/marketing/site-head";
import { SiteHero, SiteSectionHeading } from "@/components/marketing/site-page-parts";

export const Route = createFileRoute("/product")({
  head: () =>
    siteHead(
      "Product — ORMO PMO",
      "A tour of ORMO PMO: portfolio health, delivery, resources, governance, financials and business cases, benefits and insights.",
    ),
  component: ProductPage,
});

// Only features that exist in src/routes today. Sprints, velocity forecasting and Microsoft
// Planner sync are left out until work packages 3.x and 5.x ship them.
const areas: { id: string; title: string; intro: string; points: string[] }[] = [
  {
    id: "portfolio",
    title: "Portfolios, programmes and projects",
    intro:
      "One hierarchy from portfolio to programme to project, with health calculated from delivery data rather than typed in.",
    points: [
      "Health across schedule, finance, effort, issues and benefits, rolled up from project to programme to portfolio",
      "Status reports that record the declared position next to the evidenced one",
      "Portfolio roadmap with key dates and dependency lines",
      "Collections for grouping work by governance, priority or funding",
      "Requests: new ideas come in with a business case and are prioritised before they become projects",
    ],
  },
  {
    id: "delivery",
    title: "Delivery",
    intro: "The day-to-day plan for every project, and a portfolio view across all of them.",
    points: [
      "Milestones and stage gates with checklists, across the portfolio",
      "Tasks, and work issued to colleagues with acknowledgement tracking",
      "A dependency register and an interactive dependency map, shared by the whole team",
      "Assurance: what the latest status reports declare, next to what the delivery data shows",
    ],
  },
  {
    id: "resources",
    title: "Resources",
    intro: "See who is working on what, and whether the next piece of work fits.",
    points: [
      "Resource dashboard across people and skills",
      "Assignments by resource, project and task",
      "Weekly people and skill capacity for the next 26 weeks",
      "Scenarios that model proposed demand before a project is approved",
    ],
  },
  {
    id: "governance",
    title: "Governance",
    intro: "Run boards and committees from the same records the projects use.",
    points: [
      "One RAIDD register for risks, assumptions, issues and decisions, with your own scoring matrix",
      "Change control with cost and schedule impact",
      "Boards: forums, their members, meetings and the decisions they record",
      "Committee packs built from live data, previewed page by page, issued for the meeting and exported to PDF",
      "Lessons, and the improvement actions that turn them into lessons learned",
    ],
  },
  {
    id: "financials",
    title: "Financials and business cases",
    intro: "Budgets and business cases that stay connected to delivery.",
    points: [
      "Project financials with baselines, and roll-ups to programme and portfolio",
      "Versioned business cases with options, for requests and for projects",
      "Data export to CSV, and project import with validation",
    ],
  },
  {
    id: "benefits",
    title: "Benefits",
    intro: "Track what each investment promised, through to realisation, long after go-live.",
    points: [
      "A benefits register with MSP- and Green Book-aligned controls",
      "A benefits pathway: projects deliver capabilities, capabilities enable outcomes, outcomes produce benefits, each with a RAG status and its reason",
      "A benefits map from projects to strategic objectives, with disbenefits shown",
      "Realisation tracking: the cumulative profile, measurements to chase and evidence to validate",
      "A value dashboard across the portfolio",
    ],
  },
  {
    id: "insights",
    title: "Insights",
    intro: "Answers for the PMO and for leadership, without building a spreadsheet.",
    points: [
      "Dashboards you can build, save and share, with delivery, risk, finance and workload widgets",
      "Standard portfolio reports, ready to run and export",
      "Table, board and calendar views of each register, with saved views",
    ],
  },
  {
    id: "your-day",
    title: "Your day",
    intro: "Everyone starts from what needs them.",
    points: [
      "My work and my timeline",
      "Approvals waiting on you",
      "Work issued to you, and work you have issued",
      "Notifications for what is due",
    ],
  },
];

function ProductPage() {
  return (
    <SitePage>
      <SiteHero eyebrow="Product" title="Everything a PMO needs, in one place.">
        Portfolios, programmes and projects, with health calculated from delivery data and every
        status report checked against the evidence.
      </SiteHero>

      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-14 px-4 py-16 sm:px-8 sm:py-20">
        <nav aria-label="On this page" className="flex flex-wrap gap-2">
          {areas.map((area) => (
            <a
              key={area.id}
              href={`#${area.id}`}
              className="inline-flex min-h-10 items-center rounded-full border border-site-line bg-site-surface px-4 text-[14px] font-semibold text-site-text-muted no-underline hover:border-site-accent-strong hover:text-site-accent-strong"
            >
              {area.title}
            </a>
          ))}
        </nav>

        {areas.map((area) => (
          <section
            key={area.id}
            id={area.id}
            className="grid scroll-mt-4 gap-6 rounded-[18px] border border-site-line bg-site-surface p-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:p-9"
          >
            <SiteSectionHeading title={area.title}>{area.intro}</SiteSectionHeading>
            <ul className="m-0 flex list-disc flex-col gap-2.5 pl-5 text-[15px] leading-[1.65] text-site-text-soft marker:text-site-violet">
              {area.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        ))}

        <SiteCtaBand title="See it with real data." primaryLabel="Start free trial">
          Explore the demo portfolio, or start a free trial with your own.
        </SiteCtaBand>
      </main>

      <SiteFooter />
    </SitePage>
  );
}
