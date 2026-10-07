// Programme and portfolio financial summaries (design §1.2, §3), from v_programme_financials
// and v_portfolio_financials: the allocated envelope beside what the projects have
// baselined, so a gap is visible, then actuals, EAC and variance against the baselines.
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { QueryState } from "@/components/query-state";
import {
  usePortfolioFinancials,
  useProgrammeFinancials,
  useProjectFinancialsList,
} from "@/hooks/use-financials";
import { useProjects } from "@/hooks/use-hierarchy";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/services/actuals-import";
import type {
  ProjectFinancials,
  RollupFinancials as Rollup,
} from "@/services/financials";

type Scope = { programmeId: string } | { portfolioId: string };

export function RollupFinancials({
  scope,
  breakdown = true,
  projectIds,
}: {
  scope: Scope;
  breakdown?: boolean;
  projectIds?: string[];
}) {
  const programme = useProgrammeFinancials("programmeId" in scope ? scope.programmeId : "");
  const portfolio = usePortfolioFinancials("portfolioId" in scope ? scope.portfolioId : undefined);
  const query = "programmeId" in scope ? programme : portfolio;
  const projectFinancials = useProjectFinancialsList({ ...scope, projectIds });
  return (
    <QueryState query={projectFinancials}>
      {(rows) => (
        <QueryState query={query}>
          {(data) =>
            data ? (
              <div className="space-y-4">
                <Summary
                  data={projectIds ? sumProjects(data, rows) : data}
                  kind={"programmeId" in scope ? "programme" : "portfolio"}
                />
                {breakdown && <Breakdown scope={scope} projectIds={projectIds} />}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No financials yet.</p>
            )
          }
        </QueryState>
      )}
    </QueryState>
  );
}

function sumProjects(parent: Rollup, rows: ProjectFinancials[]): Rollup {
  const sum = (read: (row: ProjectFinancials) => number) =>
    rows.reduce((total, row) => total + read(row), 0);
  const budget = sum((row) => row.budget);
  const eac = sum((row) => row.eac);
  return {
    ...parent,
    projectCount: rows.length,
    baselinedCount: rows.filter((row) => row.hasBaseline).length,
    budget,
    actualToDate: sum((row) => row.actualToDate),
    actualOpenMonths: sum((row) => row.actualOpenMonths),
    forecastRemaining: sum((row) => row.forecastRemaining),
    eac,
    variance: budget - eac,
    variancePercent: budget ? Math.round(((eac - budget) / budget) * 1000) / 10 : null,
    openMonthOverrun: rows.some((row) => row.openMonthOverrun),
  };
}

function Summary({ data, kind }: { data: Rollup; kind: "programme" | "portfolio" }) {
  const format = useFormat();
  const thresholds = format.settings.health;
  const gap = data.allocated - data.budget;
  const tone =
    data.variancePercent === null
      ? undefined
      : data.variancePercent > thresholds.financialOffTrackPercent
        ? "text-health-bad-foreground"
        : data.variancePercent > thresholds.financialAtRiskPercent
          ? "text-health-warn-foreground"
          : "text-health-good-foreground";
  const cards = [
    {
      label: `Allocated to the ${kind}`,
      value: format.currency(data.allocated),
      detail:
        gap === 0
          ? "Matches the project baselines"
          : `${format.currency(Math.abs(gap))} ${gap > 0 ? "not yet baselined by projects" : "more baselined than allocated"}`,
    },
    {
      label: "Baselined by projects",
      value: format.currency(data.budget),
      detail: `${data.baselinedCount} of ${data.projectCount} projects have a baseline`,
    },
    {
      label: "Actual to date",
      value: format.currency(data.actualToDate),
      detail: "Up to the actuals cut-off",
    },
    {
      label: "Estimate at completion",
      value: format.currency(data.eac),
      detail:
        data.variancePercent === null
          ? "No baselines to compare with"
          : `${format.currency(Math.abs(data.variance))} ${data.variance >= 0 ? "under" : "over"} (${data.variancePercent > 0 ? "+" : ""}${data.variancePercent}%)`,
      tone,
    },
  ];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border/70 bg-card p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{card.value}</p>
            <p className={cn("mt-1 text-xs text-muted-foreground", card.tone)}>{card.detail}</p>
          </div>
        ))}
      </div>
      {data.openMonthOverrun && (
        <p className="flex items-center gap-2 rounded-md border border-health-warn/40 bg-health-warn/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          Some projects already have actuals above their forecast for a month after the cut-off; the
          EAC may be understated.
        </p>
      )}
    </>
  );
}

function Breakdown({ scope, projectIds }: { scope: Scope; projectIds?: string[] }) {
  const format = useFormat();
  const list = useProjectFinancialsList({ ...scope, projectIds });
  const projects = useProjects();
  const byId = new Map((projects.data ?? []).map((project) => [project.id, project]));
  return (
    <QueryState query={list}>
      {(rows) => (
        <section className="overflow-x-auto rounded-lg border border-border/70 bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-3 py-2 text-right font-medium">Budget</th>
                <th className="px-3 py-2 text-right font-medium">Actual to date</th>
                <th className="px-3 py-2 text-right font-medium">EAC</th>
                <th className="px-4 py-2 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) =>
                  (byId.get(a.projectId)?.name ?? "").localeCompare(
                    byId.get(b.projectId)?.name ?? "",
                  ),
                )
                .map((row) => {
                  const project = byId.get(row.projectId);
                  return (
                    <tr key={row.projectId} className="border-t border-border/60">
                      <td className="px-4 py-2">
                        {project ? (
                          <Link
                            to="/portfolio/projects/$projectCode"
                            params={{ projectCode: project.code }}
                            className="text-primary hover:underline"
                          >
                            {project.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {row.openMonthOverrun && row.overrunMonth && (
                          <span className="ml-2 text-xs text-health-warn-foreground">
                            {monthLabel(row.overrunMonth)} actuals above forecast
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.hasBaseline ? (
                          format.currency(row.budget)
                        ) : (
                          <span className="text-muted-foreground">No baseline</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {format.currency(row.actualToDate)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {format.currency(row.eac)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right tabular-nums",
                          row.variancePercent !== null &&
                            row.variancePercent > 0 &&
                            "text-health-bad-foreground",
                        )}
                      >
                        {row.variancePercent === null
                          ? "—"
                          : `${row.variancePercent > 0 ? "+" : ""}${row.variancePercent}%`}
                      </td>
                    </tr>
                  );
                })}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No projects.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </QueryState>
  );
}
