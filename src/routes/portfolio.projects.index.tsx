import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ListPlus } from "lucide-react";
import { useMemo } from "react";
import { BoardWorkspace, type SavedView } from "@/components/board-workspace";
import { openIssueTask } from "@/components/issue-task-sheet";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/use-hierarchy";
import { projectColumns } from "@/lib/board-data";
import { useFormat } from "@/lib/format";
import { isStatusReportOverdue, projectSummariesToRows } from "@/lib/project-rows";
import { todayIso } from "@/lib/today";
import type { ProjectSummary } from "@/services/hierarchy";

export const Route = createFileRoute("/portfolio/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Virtual PMO" },
      { name: "description", content: "Manage delivery across every project." },
      { property: "og:title", content: "Projects — Virtual PMO" },
      { property: "og:description", content: "Manage delivery across every project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectsPage,
});

const visible = projectColumns.map((column) => column.key);
const seededViews: SavedView[] = [
  {
    id: "all-active",
    name: "All active",
    type: "table",
    groupBy: "",
    sortKey: "title",
    filter: "",
    filters: [{ key: "state", operator: "equals", value: "Active" }],
    visible,
    isDefault: true,
  },
  {
    id: "by-programme",
    name: "By programme",
    type: "table",
    groupBy: "programme",
    sortKey: "title",
    filter: "",
    filters: [{ key: "state", operator: "equals", value: "Active" }],
    visible,
    isDefault: false,
  },
  {
    id: "by-manager",
    name: "By project manager",
    type: "table",
    groupBy: "manager",
    sortKey: "title",
    filter: "",
    filters: [{ key: "state", operator: "equals", value: "Active" }],
    visible,
    isDefault: false,
  },
  {
    id: "rag-exceptions",
    name: "Red and amber",
    type: "table",
    groupBy: "status",
    sortKey: "programme",
    filter: "",
    filters: [{ key: "status", operator: "oneOf", value: ["At Risk", "Off Track"] }],
    visible,
    isDefault: false,
  },
  {
    id: "closed",
    name: "Closed",
    type: "table",
    groupBy: "programme",
    sortKey: "title",
    filter: "",
    filters: [{ key: "state", operator: "equals", value: "Closed" }],
    visible,
    isDefault: false,
  },
  {
    id: "reports-overdue",
    name: "Status reports overdue",
    type: "table",
    groupBy: "programme",
    sortKey: "lastReport",
    filter: "",
    filters: [{ key: "statusReportOverdue", operator: "truthy" }],
    visible,
    isDefault: false,
  },
];

function ProjectsPage() {
  const projects = useProjects();
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <QueryState query={projects}>{(items) => <ProjectsBody items={items} />}</QueryState>
    </div>
  );
}

function ProjectsBody({ items }: { items: ProjectSummary[] }) {
  const format = useFormat();
  const rows = useMemo(() => projectSummariesToRows(items), [items]);
  const metrics = useMemo(() => {
    const counts = { Proposed: 0, Active: 0, "On Hold": 0, Closed: 0 };
    for (const project of items) counts[project.state] += 1;
    const budget = items.reduce((sum, item) => sum + item.budget, 0);
    const forecast = items.reduce((sum, item) => sum + item.forecast, 0);
    const onTrack = items.filter((item) => item.health.overall === "On Track").length;
    return {
      counts,
      budget,
      forecast,
      percentOnTrack: items.length ? Math.round((onTrack / items.length) * 100) : 0,
      outstanding: items.filter(isStatusReportOverdue).length,
    };
  }, [items]);

  const exportCsv = () => {
    const headings = projectColumns.map((column) => column.label);
    const values = rows.map((row) =>
      projectColumns
        .map((column) => {
          const value = row[column.key];
          const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
          return `"${text.replaceAll('"', '""')}"`;
        })
        .join(","),
    );
    const blob = new Blob([[headings.join(","), ...values].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `virtual-pmo-projects-${todayIso()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="Portfolio delivery"
        title="Projects"
        description="Plan, track and report on every project in one connected workspace."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openIssueTask()}>
              <ListPlus />
              Issue task
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
          </div>
        }
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Projects by state"
          value={`${metrics.counts.Active} active`}
          detail={`${metrics.counts.Proposed} proposed · ${metrics.counts["On Hold"]} on hold · ${metrics.counts.Closed} closed`}
          icon="projects"
        />
        <KpiCard
          label="Budget vs forecast"
          value={format.compact(metrics.budget)}
          detail={`Forecast ${format.compact(metrics.forecast)} · variance ${format.compact(metrics.forecast - metrics.budget)}`}
          icon="budget"
        />
        <KpiCard
          label="On track"
          value={`${metrics.percentOnTrack}%`}
          detail="Based on calculated overall health"
          icon="health"
        />
        <KpiCard
          label="Status reports outstanding"
          value={String(metrics.outstanding)}
          detail="Active projects with no report in 14 days"
          icon="forecast"
        />
      </section>
      <BoardWorkspace
        title="Projects"
        manage={false}
        rows={rows}
        columns={projectColumns}
        seededViews={seededViews}
        groupOptions={["programme", "manager", "state", "status", "stage", "tier", "priority"]}
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
    </>
  );
}
