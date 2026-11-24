// NHS-7 block for partner (ICS) programme packs: partner_contributions, each organisation's part of
// a programme shared with partners (projects, stored RAG mix, open risks, overdue milestones) and
// the projects partners have added. Shaped in SQL (private.rb_partner_contributions, which reads
// public.shared_programme_overview); this only renders. Owned by the cross_org module.
import { z } from "zod";
import { registerBlock } from "../registry";
import { Empty, Stat, Table, useReportFormat } from "../primitives";

export interface PartnerOrganisationRow {
  id: string;
  name: string;
  role: "host" | "partner";
  projects: number;
  green: number;
  amber: number;
  red: number;
  open_risks: number;
  milestones_overdue: number;
}
export interface PartnerProjectRow {
  id: string;
  code: string;
  name: string;
  organisation: string;
  overall: string | null;
  state: string | null;
  next_milestone: { title: string; date: string } | null;
  open_risks: number | null;
}
export interface PartnerContributionsData {
  programme_scope_only?: boolean;
  unavailable?: boolean;
  programme?: string;
  host?: string;
  organisations: PartnerOrganisationRow[];
  projects: PartnerProjectRow[];
  benefits?: { count: number; cash_releasing: number; non_cash: number; realised: number } | null;
}

const RAG_LABEL: Record<string, string> = {
  green: "On track",
  amber: "At risk",
  red: "Off track",
  not_set: "Not set",
};

const schema = z.object({}).passthrough();

function PartnerContributions({ data }: { data: PartnerContributionsData }) {
  const f = useReportFormat();
  if (data.programme_scope_only)
    return (
      <Empty>
        This block shows a programme shared with partner organisations: use it on a programme
        report.
      </Empty>
    );
  if (data.unavailable)
    return <Empty>Partner programmes are switched off, or this programme isn't shared.</Empty>;
  const partners = data.organisations.filter((o) => o.role === "partner").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Organisations"
          value={data.organisations.length}
          note={`${partners} partners`}
        />
        <Stat
          label="Projects"
          value={data.organisations.reduce((sum, o) => sum + o.projects, 0)}
          note={`${data.projects.length} added by partners`}
        />
        <Stat
          label="Cash-releasing (planned)"
          value={f.money(data.benefits?.cash_releasing ?? null)}
        />
        <Stat label="Non-cash (planned)" value={f.money(data.benefits?.non_cash ?? null)} />
      </div>
      <Table
        caption="Contribution by organisation"
        rows={data.organisations}
        rowKey={(row) => row.id}
        empty="Not shared with any organisation."
        cols={[
          {
            key: "name",
            header: "Organisation",
            cell: (row) => (
              <span>
                <span className="font-medium">{row.name}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {row.role === "host" ? "Host" : "Partner"}
                </span>
              </span>
            ),
          },
          { key: "projects", header: "Projects", cell: (row) => row.projects, align: "right" },
          { key: "green", header: "On track", cell: (row) => row.green, align: "right" },
          { key: "amber", header: "At risk", cell: (row) => row.amber, align: "right" },
          { key: "red", header: "Off track", cell: (row) => row.red, align: "right" },
          { key: "risks", header: "Open risks", cell: (row) => row.open_risks, align: "right" },
          {
            key: "overdue",
            header: "Overdue milestones",
            cell: (row) => row.milestones_overdue,
            align: "right",
          },
        ]}
      />
      <Table
        caption="Projects added by partners"
        rows={data.projects}
        rowKey={(row) => row.id}
        empty="No partner has added a project."
        cols={[
          {
            key: "project",
            header: "Project",
            cell: (row) => (
              <span>
                <span className="font-mono text-xs text-muted-foreground">{row.code}</span>{" "}
                {row.name}
              </span>
            ),
          },
          { key: "org", header: "Organisation", cell: (row) => row.organisation },
          {
            key: "overall",
            header: "Overall",
            cell: (row) => RAG_LABEL[row.overall ?? "not_set"] ?? "Not set",
          },
          {
            key: "next",
            header: "Next milestone",
            cell: (row) =>
              row.next_milestone
                ? `${row.next_milestone.title}, ${f.date(row.next_milestone.date)}`
                : "—",
          },
          {
            key: "risks",
            header: "Open risks",
            cell: (row) => row.open_risks ?? 0,
            align: "right",
          },
        ]}
      />
    </div>
  );
}

export const _partner_contributions = registerBlock({
  key: "partner_contributions",
  version: 1,
  name: "Partner contributions",
  category: "governance",
  description:
    "For a programme shared with partner organisations: each organisation's projects, RAG mix, open risks and overdue milestones, and the projects partners have added.",
  supportedScopes: ["programme"],
  perEntity: false,
  configSchema: schema,
  defaultConfig: {},
  Renderer: PartnerContributions,
  partnerSafe: true,
  phase: 4,
});
