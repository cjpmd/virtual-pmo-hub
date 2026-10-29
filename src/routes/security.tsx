import { createFileRoute } from "@tanstack/react-router";
import { SiteFooter, SitePage } from "@/components/marketing/site-chrome";
import { siteHead } from "@/components/marketing/site-head";
import { SiteHero, SiteSectionHeading } from "@/components/marketing/site-page-parts";
import { SupportLink } from "@/components/support-link";

export const Route = createFileRoute("/security")({
  head: () =>
    siteHead(
      "Security — ORMO PMO",
      "How ORMO PMO protects your data: UK data storage, encryption, organisation isolation in the database, roles, the audit log, sign-in and payments.",
    ),
  component: SecurityPage,
});

// Only what the repo or the live projects confirm. TODO (owner to confirm before adding):
// - Backups: the Supabase organisation is on the Free plan (no restorable backups); add a
//   Backups section once the plan includes them, with the retention and point-in-time recovery.
// - Edge function region: Supabase runs functions at the edge nearest the request by default.
const sections: { title: string; text: string[] }[] = [
  {
    title: "Hosting and data location",
    text: [
      "Your organisation's records and files are stored in our database in London (Supabase, AWS eu-west-2).",
      "Some services we rely on work outside the UK: card payments are processed by Stripe in the United States, and email is sent through Resend in Ireland. The subprocessor list below sets out each one.",
    ],
  },
  {
    title: "Encryption",
    text: [
      "Every connection to ORMO PMO, from your browser and between our services, uses HTTPS (TLS).",
      "Data at rest is encrypted by our database provider, Supabase, which states that it encrypts stored data with AES-256.",
    ],
  },
  {
    title: "Organisation isolation",
    text: [
      "Every record belongs to an organisation and a workspace. Access is enforced inside the database with Postgres row-level security, so a request can only read or change rows in organisations and workspaces its user belongs to, whichever screen or API it comes from.",
      "Changes go through one write path that checks each record hasn't changed since it was read, so two people can't silently overwrite each other's work.",
    ],
  },
  {
    title: "Roles",
    text: [
      "Each person has a role in the organisation and in each workspace: viewer, contributor, manager, PMO or admin. Viewers can read but not change anything. Only organisation admins can invite people, change organisation roles and manage billing.",
      "Archived workspaces stay readable but can't be changed.",
    ],
  },
  {
    title: "Audit log",
    text: [
      "Changes to portfolios, programmes and projects, milestones, status reports, the RAIDD register, changes and decisions, benefits, financials, business cases, boards and meetings are recorded with who made them, when and what changed. So are membership, role, invitation and seat changes. Admins and PMO can read the log in Settings › Data & audit.",
    ],
  },
  {
    title: "Sign-in",
    text: [
      "Sign in with your email and a password (at least 10 characters, and your email address must be confirmed first), or with your Microsoft work account.",
      "Invitation links work once, expire after 7 days and must be accepted by the invited email address. We store only a hash of each invitation token.",
    ],
  },
  {
    title: "Payments",
    text: [
      "Payments are handled by Stripe. Card details go straight to Stripe and never reach our servers; we never see or store them.",
    ],
  },
];

// Region is left blank where the repo and the live projects don't confirm it.
const subprocessors: { name: string; purpose: string; region: string }[] = [
  {
    name: "Supabase",
    purpose: "Database, file storage, sign-in and server functions",
    region: "UK (London)",
  },
  { name: "Stripe", purpose: "Subscription billing and card payments", region: "United States" },
  { name: "Resend", purpose: "Invitation and account email", region: "EU (Ireland)" },
  // TODO: the web host's name and region (Lovable today; Netlify planned).
  { name: "Web host", purpose: "Serving the web application", region: "" },
  // TODO: Microsoft Entra ID region.
  { name: "Microsoft", purpose: "Sign in with Microsoft", region: "" },
];

function SecurityPage() {
  return (
    <SitePage>
      <SiteHero eyebrow="Security" title="How we protect your data.">
        Your portfolio holds sensitive plans, budgets and decisions. This is how ORMO PMO keeps them
        safe.
      </SiteHero>

      <main className="mx-auto flex max-w-[1240px] flex-col gap-14 px-7 py-14">
        <div className="grid gap-5 md:grid-cols-2">
          {sections.map((section) => (
            <section
              key={section.title}
              className="flex flex-col gap-3 rounded-2xl border border-site-line p-7"
            >
              <h2 className="m-0 text-[1.2rem] font-semibold">{section.title}</h2>
              {section.text.map((paragraph) => (
                <p key={paragraph} className="m-0 leading-[1.6] text-site-text-muted">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <section className="flex flex-col gap-6" aria-labelledby="subprocessors">
          <SiteSectionHeading title="Subprocessors">
            The companies that process data on our behalf to run ORMO PMO.
          </SiteSectionHeading>
          <div className="overflow-x-auto rounded-2xl border border-site-line">
            <table className="w-full min-w-[520px] border-collapse text-left text-[0.95rem]">
              <caption id="subprocessors" className="sr-only">
                Subprocessors
              </caption>
              <thead className="bg-site-tint-blue text-site-text-soft">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Subprocessor
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Purpose
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Region
                  </th>
                </tr>
              </thead>
              <tbody>
                {subprocessors.map((row) => (
                  <tr key={row.name} className="border-t border-site-line">
                    <th scope="row" className="px-5 py-3 font-medium">
                      {row.name}
                    </th>
                    <td className="px-5 py-3 text-site-text-muted">{row.purpose}</td>
                    <td className="px-5 py-3 text-site-text-muted">{row.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="m-0 max-w-[44rem] leading-[1.6] text-site-text-muted">
          Questions about security, or found a problem?{" "}
          <SupportLink className="text-site-accent-strong" />
        </p>
      </main>

      <SiteFooter />
    </SitePage>
  );
}
