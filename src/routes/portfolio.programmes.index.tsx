import { createFileRoute, Link } from "@tanstack/react-router";
import { StateBadge } from "@/components/entity-management";
import { HealthPill } from "@/components/health-pill";
import { PageHeader } from "@/components/pmo-ui";
import { QueryError, QueryState } from "@/components/query-state";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { usePortfolios, useProgrammes, useProjects } from "@/hooks/use-hierarchy";

export const Route = createFileRoute("/portfolio/programmes/")({
  head: () => ({
    meta: [
      { title: "Programmes — Virtual PMO" },
      { name: "description", content: "Browse every programme in the portfolio." },
      { property: "og:title", content: "Programmes — Virtual PMO" },
      { property: "og:description", content: "Browse every programme in the portfolio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Programmes,
});

function Programmes() {
  const portfolios = usePortfolios();
  const programmes = useProgrammes();
  const projects = useProjects();
  const portfolioName = portfolios.data?.map((item) => item.name).join(", ");

  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Portfolio"
        title="Programmes"
        description={
          portfolioName
            ? `Programmes delivering the ${portfolioName} portfolio.`
            : "Programmes in your portfolio."
        }
      />
      {projects.isError && (
        <QueryError error={projects.error} retry={() => void projects.refetch()} />
      )}
      <QueryState query={programmes}>
        {(items) =>
          items.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {items.map((programme) => {
                const active = projects.data?.filter(
                  (project) => project.programmeId === programme.id && project.state === "Active",
                ).length;
                return (
                  <Link
                    key={programme.id}
                    to="/portfolio/programmes/$programmeId"
                    params={{ programmeId: programme.id }}
                    className="rounded-lg border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="font-display text-lg font-semibold">{programme.name}</h2>
                      <div className="flex items-center gap-2">
                        <StateBadge state={programme.state} />
                        <HealthPill health={programme.health} />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {programme.description}
                    </p>
                    <div className="mt-5 flex gap-6 border-t border-border/60 pt-4 text-xs text-muted-foreground">
                      <span>
                        <strong className="text-foreground">{active ?? "…"}</strong> active projects
                      </span>
                      <span>
                        <strong className="text-foreground">{programme.managerName}</strong> manager
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              No programmes yet.
            </p>
          )
        }
      </QueryState>
    </div>
  );
}
