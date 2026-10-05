import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarClock, Download, FileSpreadsheet, FileText, Play } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { formatCompactCurrency, formatDate, formatFinancialYear } from "@/lib/format";
import { getBenefits, getPortfolioMetrics, getPortfolioMilestones, getProjects } from "@/services/pmo";
import { getValueMetrics } from "@/services/benefits-value";
import { useBenefits } from "@/hooks/use-benefits";
import { getDecisionMetrics } from "@/services/decisions";
import { useGovernance } from "@/hooks/use-governance";
import { useDependencies } from "@/hooks/use-dependencies";
import { getDependencyMetrics } from "@/services/dependencies";
import { getLessonMetrics } from "@/services/lessons";
import { useSettings } from "@/services/settings";
import { cn } from "@/lib/utils";

const title = "Reports — Virtual PMO", description = "Standard portfolio reports, ready to run and export.";
export const Route = createFileRoute("/insights/reports")({ head: () => ({ meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: Page });

interface ReportDefinition { id: string; name: string; description: string; cadence: string; owner: string; rows: () => Array<Record<string, string>> }

function Page() {
  const settings = useSettings();
  const [openId, setOpenId] = useState<string | null>(null);
  const metrics = getPortfolioMetrics();
  const benefits = useBenefits();
  const value = getValueMetrics(benefits.data?.benefits ?? []);
  const governance = useGovernance();
  const allDecisions = governance.data?.decisions ?? [];
  const decisions = getDecisionMetrics(allDecisions);
  const dependencyQuery = useDependencies();
  const dependencies = getDependencyMetrics(dependencyQuery.data?.dependencies ?? []);
  const lessons = getLessonMetrics();

  const reports: ReportDefinition[] = [
    {
      id: "portfolio-status", name: "Portfolio status summary", description: "One row per project with health, stage, finance and next milestone.", cadence: "Fortnightly", owner: "PMO",
      rows: () => getProjects().filter(project => project.state === "Active").slice(0, 12).map(project => ({
        Project: project.name, Stage: project.stage, State: project.state,
        Budget: formatCompactCurrency(project.budget), Forecast: formatCompactCurrency(project.forecast), Finish: formatDate(project.finish),
      })),
    },
    {
      id: "milestone-exceptions", name: "Milestone exceptions", description: "Overdue and slipped milestones with baseline against forecast.", cadence: "Weekly", owner: "PMO",
      rows: () => getPortfolioMilestones().filter(item => item.status === "Overdue" || item.status === "Late").slice(0, 12).map(item => ({
        Milestone: item.title, Project: item.projectName, Baseline: formatDate(item.baselineDate), Forecast: formatDate(item.forecastDate), Slip: `${item.slipDays} days`, Status: item.status,
      })),
    },
    {
      id: "benefit-realisation", name: "Benefit realisation", description: "Planned against realised value for every benefit, with confidence.", cadence: "Quarterly", owner: "Benefits lead",
      rows: () => getBenefits().slice(0, 12).map(benefit => ({
        Reference: benefit.reference, Benefit: benefit.title, Owner: benefit.owner || "Unassigned",
        Planned: formatCompactCurrency(benefit.plannedTotalValue), Classification: benefit.classification, Confidence: benefit.confidence,
      })),
    },
    {
      id: "decision-latency", name: "Decision latency", description: "How long decisions take from needed-by to made, by forum.", cadence: "Monthly", owner: "PMO",
      rows: () => allDecisions.filter(item => item.decisionDate).slice(0, 12).map(item => ({
        Reference: item.reference, Decision: item.title, Forum: item.forum, "Needed by": formatDate(item.neededBy), Decided: formatDate(item.decisionDate), Latency: `${item.latencyDays ?? 0} days`,
      })),
    },
  ];
  const open = reports.find(report => report.id === openId);

  const download = (report: ReportDefinition) => {
    const rows = report.rows();
    const headers = Object.keys(rows[0] ?? {});
    const csv = [headers.join(","), ...rows.map(row => headers.map(header => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${report.id}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="space-y-6">
    <AutoBreadcrumbs />
    <PageHeader eyebrow="Insights" title="Reports" description={`Standard reports built from live portfolio data. Values and dates follow the workspace settings, and exports carry the same formatting. Current financial year: ${formatFinancialYear("21/09/2026", settings)}.`} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Active projects" value={String(metrics.activeProjects)} detail={`${metrics.percentOnTrack}% on track`} icon="projects" />
      <KpiCard label="Portfolio value" value={formatCompactCurrency(value.planned)} detail={`${value.percent}% realised`} icon="budget" />
      <KpiCard label="Governance load" value={String(decisions.pending + dependencies.awaiting)} detail={`${decisions.pending} decisions, ${dependencies.awaiting} dependencies awaiting` } icon="health" />
      <KpiCard label="Lessons logged" value={String(lessons.total)} detail={`${lessons.openActions} improvement actions open`} icon="forecast" />
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      {reports.map(report => <div key={report.id} className={cn("rounded-lg border border-border/70 bg-card p-5 shadow-sm", openId === report.id && "border-primary/40")}>
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="font-display text-base font-semibold">{report.name}</h2><p className="mt-1 text-sm text-muted-foreground">{report.description}</p></div>
          <FileText className="size-5 shrink-0 text-primary" />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="size-3.5" />{report.cadence} · owned by {report.owner}</p>
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => setOpenId(openId === report.id ? null : report.id)}><Play />{openId === report.id ? "Hide" : "Run"}</Button>
          <Button size="sm" variant="outline" onClick={() => download(report)}><Download />Export CSV</Button>
        </div>
      </div>)}
    </div>

    {open && <section className="rounded-lg border border-border/70 bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b p-5">
        <FileSpreadsheet className="size-5 text-primary" />
        <div className="mr-auto"><h2 className="font-display text-lg font-semibold">{open.name}</h2><p className="mt-0.5 text-sm text-muted-foreground">Run on {formatDate("21/09/2026", settings)} · showing the first {open.rows().length} rows</p></div>
        <Button size="sm" variant="outline" onClick={() => download(open)}><Download />Export CSV</Button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr>{Object.keys(open.rows()[0] ?? {}).map(header => <th key={header} className="h-11 px-4 font-semibold">{header}</th>)}</tr></thead>
          <tbody>{open.rows().map((row, index) => <tr key={index} className="border-t">{Object.keys(open.rows()[0] ?? {}).map(header => <td key={header} className="px-4 py-2.5">{row[header]}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>}
  </div>;
}
