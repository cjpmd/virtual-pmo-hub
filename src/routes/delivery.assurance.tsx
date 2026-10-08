import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { ChartCard } from "@/components/charts/chart-card";
import { HowCalculated } from "@/components/evidence-ui";
import { DeclaredEvidencedPills, DivergenceNote } from "@/components/divergence-note";
import { liveRows, divergenceText, type AssuranceRow } from "@/services/assurance";
import { QueryState } from "@/components/query-state";
import { useAssurance } from "@/hooks/use-assurance";
import { useProjectPermissions } from "@/hooks/use-hierarchy";
import { useFormat } from "@/lib/format";
import type { Health } from "@/data/types";

export const Route = createFileRoute("/delivery/assurance")({
  head: () => ({
    meta: [
      { title: "Assurance — Virtual PMO" },
      {
        name: "description",
        content:
          "Declared versus evidenced RAG, forecast slippage and stale evidence across the portfolio.",
      },
      { property: "og:title", content: "Assurance — Virtual PMO" },
      {
        property: "og:description",
        content:
          "Declared versus evidenced RAG, forecast slippage and stale evidence across the portfolio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssurancePage,
});

function AssurancePage() {
  const query = useAssurance();
  return <QueryState query={query}>{(rows) => <Assurance rows={rows} />}</QueryState>;
}

const ragOrder: Health[] = ["Off Track", "At Risk", "On Track", "Not Set"];
const ragCountLabel: Record<Health, string> = {
  "Off Track": "red",
  "At Risk": "amber",
  "On Track": "green",
  "Not Set": "not set",
};
/** "2 red · 5 amber · 9 green": counts only; every RAG is the database's. */
function ragCounts(rows: AssuranceRow[]) {
  return ragOrder
    .map((h) => [h, rows.filter((r) => r.evidenced === h).length] as const)
    .filter(([, n]) => n > 0)
    .map(([h, n]) => `${n} ${ragCountLabel[h]}`)
    .join(" · ");
}

function Assurance({ rows }: { rows: AssuranceRow[] }) {
  const format = useFormat();
  const live = liveRows(rows);
  const alerts = live.filter((r) => r.divergenceAlert);
  const divergent = live.filter((r) => r.divergent);
  const overdue = live.filter((r) => r.reportOverdue);
  const latestFinish = live
    .map((r) => r.forecastFinishDate)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const programmes = Array.from(new Set(live.map((r) => r.programme)));
  const slip = (r: AssuranceRow) =>
    r.finishVsBaselineDays === null
      ? "—"
      : r.finishVsBaselineDays > 0
        ? `+${r.finishVsBaselineDays} days`
        : `${r.finishVsBaselineDays} days`;
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Assurance from evidence"
        title="Portfolio assurance"
        description="What the latest status reports declare, next to what the delivery data shows."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Evidenced RAG"
          value={ragCounts(live) || "No projects"}
          detail={`Across ${live.length} open projects`}
          icon="health"
        />
        <KpiCard
          label="Divergence alerts"
          value={String(alerts.length)}
          detail={`${divergent.length} report${divergent.length === 1 ? "" : "s"} better than the evidence`}
          icon="health"
        />
        <KpiCard
          label="Latest forecast finish"
          value={latestFinish ? format.date(latestFinish) : "—"}
          detail="Latest milestone forecast among open projects"
          icon="forecast"
        />
        <KpiCard
          label="Reports overdue"
          value={String(overdue.length)}
          detail="Past the reporting cadence with no submitted report"
          icon="projects"
        />
      </section>
      {divergent.length > 0 && (
        <section
          className={
            alerts.length
              ? "space-y-3 rounded-lg border border-health-bad/30 bg-health-bad/5 p-5"
              : "space-y-3 rounded-lg border border-border/70 bg-card p-5"
          }
        >
          <h2 className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-health-bad" aria-hidden />
            Reports better than the evidence
          </h2>
          {divergent.map((r) => (
            <DivergentProject key={r.projectId} row={r} />
          ))}
        </section>
      )}
      <ChartCard
        title="Assurance register"
        subtitle="Sorted by assurance risk: divergence, slippage and overdue reports"
        info="Declared is the latest submitted status report. Evidenced is the health the delivery data shows, from the database views."
        csv={{
          name: "assurance",
          columns: [
            "Project",
            "Programme",
            "Declared",
            "Evidenced",
            "Divergence",
            "Finish vs baseline (days)",
            "Last report",
            "Next report due",
            "Risk score",
          ],
          rows: live.map((r) => [
            r.name,
            r.programme,
            r.declared ?? "No report yet",
            r.evidenced,
            r.divergent ? (r.justified ? "Justified" : divergenceText(r)) : "",
            r.finishVsBaselineDays ?? "",
            r.lastReportDate ?? "",
            r.nextReportDue ?? "",
            r.riskScore,
          ]),
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2">Project</th>
                <th>Declared vs evidenced</th>
                <th>Divergence</th>
                <th className="text-right">Finish vs baseline</th>
                <th className="text-right">Last report</th>
                <th className="text-right">
                  Risk{" "}
                  <HowCalculated title="assurance risk">
                    40 for a divergence alert (15 if the report is simply better than the evidence,
                    or justified), up to 30 for forecast slip (a point per 3 days) and 20 for an
                    overdue report.
                  </HowCalculated>
                </th>
              </tr>
            </thead>
            <tbody>
              {live.map((r) => (
                <tr key={r.projectId} className="border-t border-border/50 align-top">
                  <td className="py-2">
                    <Link
                      to="/portfolio/projects/$projectCode"
                      params={{ projectCode: r.code }}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{r.programme}</p>
                  </td>
                  <td className="py-2">
                    <DeclaredEvidencedPills row={r} />
                  </td>
                  <td className="py-2 text-xs">
                    {!r.divergent
                      ? "—"
                      : r.justified
                        ? "Justified"
                        : `${r.divergenceAlert ? "Alert · " : ""}${divergenceText(r)}`}
                  </td>
                  <td className="py-2 text-right">{slip(r)}</td>
                  <td className="py-2 text-right">
                    {r.lastReportDate ? format.date(r.lastReportDate) : "None"}
                    {r.reportOverdue && (
                      <p className="text-xs font-medium text-health-bad-foreground">Overdue</p>
                    )}
                  </td>
                  <td className="py-2 text-right font-semibold">{r.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Evidenced RAG by programme"
          subtitle="Counts of open projects by evidenced health"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-2">Programme</th>
                <th>Evidenced</th>
                <th className="text-right">Reports better than evidence</th>
              </tr>
            </thead>
            <tbody>
              {programmes.map((p) => {
                const sub = live.filter((r) => r.programme === p);
                return (
                  <tr key={p} className="border-t border-border/50">
                    <td className="py-2 font-medium">{p}</td>
                    <td className="text-xs text-muted-foreground">{ragCounts(sub)}</td>
                    <td className="text-right">{sub.filter((r) => r.divergent).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ChartCard>
        <ChartCard
          title="Forecast slip trend"
          subtitle="Average forecast finish vs baseline over time"
          empty={{
            title: "History starts 05/10/2026",
            detail:
              "The trend appears once enough daily forecast snapshots have been taken from that date.",
          }}
        >
          {null}
        </ChartCard>
        <ChartCard
          className="xl:col-span-2"
          title="Forecast accuracy"
          subtitle="How far forecasts were from the actual finish on closed projects"
          empty={{
            title: "No sprint data yet",
            detail:
              "Forecast accuracy compares sprint forecasts with actual finishes, and returns once sprints are recorded in Virtual PMO.",
          }}
        >
          {null}
        </ChartCard>
      </div>
    </div>
  );
}

function DivergentProject({ row }: { row: AssuranceRow }) {
  const permissions = useProjectPermissions(row.projectId);
  return (
    <div className="rounded-md border border-border/70 bg-card p-3 text-sm">
      <Link
        to="/portfolio/projects/$projectCode"
        params={{ projectCode: row.code }}
        className="mr-2 font-medium text-primary hover:underline"
      >
        {row.name}
      </Link>
      <DivergenceNote row={row} canJustify={permissions.canEdit} />
    </div>
  );
}
