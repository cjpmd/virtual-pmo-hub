import { currencySymbol, formatCurrency } from "@/lib/format";
import { formatCompactCurrency } from "@/lib/format";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock3, FileText, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/pmo-ui";
import { BoardWorkspace } from "@/components/board-workspace";
import { projectColumns } from "@/lib/board-data";
import { projectSummariesToRows } from "@/lib/project-rows";
import { HealthPill } from "@/components/health-pill";
import { Badge } from "@/components/ui/badge";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useReports } from "@/hooks/use-reports";
import { useFormat } from "@/lib/format";
import { collectionReports } from "@/features/reports/collection-reports";
import { QueryState } from "@/components/query-state";
import { useBenefits } from "@/hooks/use-benefits";
import { useCollections } from "@/hooks/use-collections";
import { useProjects } from "@/hooks/use-hierarchy";
import { benefitsForProject } from "@/services/benefits-value";
import { collectionMetrics, type CollectionView as Collection } from "@/services/collections";
import type { ProjectSummary as Project } from "@/services/hierarchy";
import { Breadcrumbs } from "@/components/section-nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portfolio/collections/$collectionId")({
  head: () => {
    const title = "Collection — ORMO PMO";
    const description = "Governance view and board packs for a portfolio collection.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: CollectionPage,
});
const money = formatCompactCurrency;
function CollectionPage() {
  const { collectionId } = Route.useParams();
  const query = useCollections(),
    all = useProjects();
  return (
    <QueryState query={query}>
      {(collections) => {
        const collection = collections.find((item) => item.id === collectionId);
        if (!collection)
          return (
            <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              Collection not found. It may have been removed, or you may not have access.
            </p>
          );
        return (
          <CollectionBody
            collection={collection}
            projects={(all.data ?? []).filter((project) =>
              collection.projectIds.includes(project.id),
            )}
          />
        );
      }}
    </QueryState>
  );
}
function CollectionBody({ collection, projects }: { collection: Collection; projects: Project[] }) {
  const metrics = collectionMetrics(projects);
  const writable = useOrgWritable();
  const canGenerate = collection.type === "Governance";
  return (
    <div className="space-y-6">
      <Breadcrumbs
        trail={[
          { label: "Portfolio", to: "/portfolio" },
          { label: "Collections", to: "/portfolio/collections" },
          { label: collection.name },
        ]}
      />
      <PageHeader
        eyebrow={collection.type}
        title={collection.name}
        description="A cross-portfolio view used to focus governance discussion, decisions and delivery assurance."
        actions={
          canGenerate ? (
            <ReadOnlyTip readOnly={!writable}>
              {writable ? (
                <Button asChild>
                  <Link
                    to="/governance/reports"
                    search={{ create: true, collection: collection.id }}
                  >
                    <Presentation className="size-4" />
                    New report for this collection
                  </Link>
                </Button>
              ) : (
                <Button disabled>
                  <Presentation className="size-4" />
                  New report for this collection
                </Button>
              )}
            </ReadOnlyTip>
          ) : undefined
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Projects" value={String(metrics.projectCount)} />
        <Metric label="Collection budget" value={money(metrics.budget)} />
        <Metric label="Forecast" value={money(metrics.forecast)} />
        <Metric
          label="Exceptions"
          value={String(metrics.rag.amber + metrics.rag.red)}
          detail={`${metrics.rag.amber} amber · ${metrics.rag.red} red`}
        />
      </div>
      <section>
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold">Projects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Projects included in this collection.
          </p>
        </div>
        <BoardWorkspace
          title="Collection projects"
          boardKey="collection-projects"
          manage={false}
          rows={projectSummariesToRows(projects)}
          columns={projectColumns()}
          groupOptions={["status", "stage", "priority"]}
          renderTitle={(row) => (
            <Link
              to="/portfolio/projects/$projectCode"
              params={{ projectCode: row.id }}
              className="text-primary hover:underline"
            >
              {row.title}
            </Link>
          )}
        />
      </section>
      {collection.type === "Funding stream" && (
        <InnovationPotReturn collection={collection} projects={projects} />
      )}
      <section>
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold">Reports for this collection</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Packs published for this collection&apos;s meetings.
          </p>
        </div>
        <CollectionReportList collectionId={collection.id} />
      </section>
    </div>
  );
}
function CollectionReportList({ collectionId }: { collectionId: string }) {
  const query = useReports();
  const format = useFormat();
  return (
    <QueryState query={query}>
      {(reports) => {
        const rows = collectionReports(reports, collectionId);
        if (rows.length === 0)
          return (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No published reports for this collection yet.
            </p>
          );
        return (
          <ul className="divide-y rounded-lg border" data-testid="collection-reports">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    to="/governance/reports/$reportId"
                    params={{ reportId: r.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {r.forumName ?? "No forum"}
                    {r.meetingDate
                      ? ` · meeting ${format.date(r.meetingDate)}`
                      : ` · as at ${format.date(r.asAt)}`}
                  </p>
                </div>
                <Badge>Published</Badge>
              </li>
            ))}
          </ul>
        );
      }}
    </QueryState>
  );
}
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-4 text-3xl font-semibold">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

function InnovationPotReturn({
  collection,
  projects,
}: {
  collection: Collection;
  projects: Project[];
}) {
  const data = useBenefits().data;
  const rows = projects
    .map((project) => {
      const awarded = collection.awards[project.id] ?? 0;
      const benefits = data ? benefitsForProject(data, project.id) : [];
      const planned = benefits.reduce(
        (sum, benefit) => sum + Math.max(0, benefit.plannedTotalValue),
        0,
      );
      const realised = benefits.reduce(
        (sum, benefit) => sum + Math.max(0, benefit.realisation.realised),
        0,
      );
      return {
        project,
        awarded,
        planned,
        realised,
        perPound: awarded ? realised / awarded : 0,
        plannedPerPound: awarded ? planned / awarded : 0,
        benefitCount: benefits.length,
      };
    })
    .sort((a, b) => b.perPound - a.perPound);
  const totalAwarded = rows.reduce((sum, row) => sum + row.awarded, 0),
    totalRealised = rows.reduce((sum, row) => sum + row.realised, 0);
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-xl font-semibold">
          Benefits realised per {currencySymbol()} awarded
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What each funded project has returned against the money it drew from the {collection.name}
          {collection.potAmount ? ` (${money(collection.potAmount)} pot)` : ""}.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-table-head text-xs text-muted-foreground">
              <tr>
                <th className="h-11 px-4 font-semibold">Funded project</th>
                <th className="px-4 font-semibold">Awarded</th>
                <th className="px-4 font-semibold">Benefits</th>
                <th className="px-4 font-semibold">Planned value</th>
                <th className="px-4 font-semibold">Realised</th>
                <th className="px-4 font-semibold">Realised per {currencySymbol()} awarded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.project.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link
                      to="/portfolio/projects/$projectCode"
                      params={{ projectCode: row.project.code }}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{money(row.awarded)}</td>
                  <td className="px-4 py-3">{row.benefitCount}</td>
                  <td className="px-4 py-3">{money(row.planned)}</td>
                  <td className="px-4 py-3">{money(row.realised)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        row.perPound >= 1
                          ? "bg-health-good/20 text-health-good-foreground"
                          : row.perPound > 0
                            ? "bg-health-warn/25 text-health-warn-foreground"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {formatCurrency(row.perPound, undefined, 2)}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      planned {formatCurrency(row.plannedPerPound, undefined, 2)}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className="px-4 py-3">Pot total</td>
                <td className="px-4 py-3">{money(totalAwarded)}</td>
                <td className="px-4 py-3">
                  {rows.reduce((sum, row) => sum + row.benefitCount, 0)}
                </td>
                <td className="px-4 py-3">
                  {money(rows.reduce((sum, row) => sum + row.planned, 0))}
                </td>
                <td className="px-4 py-3">{money(totalRealised)}</td>
                <td className="px-4 py-3">
                  {formatCurrency(totalAwarded ? totalRealised / totalAwarded : 0, undefined, 2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
