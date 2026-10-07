import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import {
  BarChart3,
  CalendarRange,
  Gauge,
  GripVertical,
  LayoutDashboard,
  ListChecks,
  Plus,
  Table2,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/pmo-ui";
import { useMilestones, useProjects } from "@/hooks/use-hierarchy";
import { useResourceData } from "@/hooks/use-resources";
import { formatDate } from "@/lib/format";
import { activeOnly, getRag, openOnly } from "@/services/analytics";
import { resourceDashboard } from "@/services/resources";
import type { ProjectSummary } from "@/services/hierarchy";
import { cn } from "@/lib/utils";
import { useSettings } from "@/services/settings";
export const Route = createFileRoute("/insights/dashboards")({
  head: () => ({
    meta: [
      { title: "Portfolio Dashboard — Virtual PMO" },
      {
        name: "description",
        content: "Custom portfolio dashboard with delivery, risk, finance and workload widgets.",
      },
      { property: "og:title", content: "Portfolio Dashboard — Virtual PMO" },
      {
        property: "og:description",
        content: "Custom portfolio dashboard with delivery, risk, finance and workload widgets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});
type Widget =
  "KPI number" | "RAG donut" | "Bar chart" | "Table" | "Timeline" | "Milestone list" | "Workload";
const all: Widget[] = [
  "KPI number",
  "RAG donut",
  "Bar chart",
  "Table",
  "Timeline",
  "Milestone list",
  "Workload",
];
function DashboardPage() {
  const settings = useSettings();
  const [widgets, setWidgets] = useState<Widget[]>(all),
    [picker, setPicker] = useState(false),
    [dragged, setDragged] = useState<number | null>(null);
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Dashboard"
        title={`${settings.organisation.shortName} portfolio`}
        description="A configurable view of delivery, finance, milestones and portfolio capacity."
        actions={
          <Button onClick={() => setPicker(true)}>
            <Plus />
            Add widget
          </Button>
        }
      />
      <div className="grid auto-rows-[260px] gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {widgets.map((widget, index) => (
          <section
            key={`${widget}-${index}`}
            draggable
            onDragStart={() => setDragged(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragged === null || dragged === index) return;
              const next = [...widgets],
                moved = next.splice(dragged, 1)[0];
              if (moved) next.splice(index, 0, moved);
              setWidgets(next);
              setDragged(null);
            }}
            className={cn(
              "overflow-hidden rounded-lg border border-border/70 bg-card p-5 shadow-sm",
              (widget === "Table" || widget === "Timeline") && "lg:col-span-2",
              dragged === index && "opacity-50",
            )}
          >
            <header className="mb-4 flex items-center gap-2">
              <GripVertical className="size-4 cursor-grab text-muted-foreground" />
              <WidgetIcon type={widget} />
              <h2 className="font-semibold">{widget}</h2>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                onClick={() => setWidgets((current) => current.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
            </header>
            <WidgetBody type={widget} />
          </section>
        ))}
      </div>
      {picker && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4">
          <div
            role="dialog"
            className="w-full max-w-lg rounded-md border bg-background p-6 shadow-xl"
          >
            <div className="flex justify-between">
              <h2 className="text-xl font-semibold">Widget picker</h2>
              <Button size="icon" variant="ghost" onClick={() => setPicker(false)}>
                <X />
              </Button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {all.map((type) => (
                <Button
                  key={type}
                  variant="outline"
                  className="h-20 justify-start"
                  onClick={() => {
                    setWidgets((current) => [...current, type]);
                    setPicker(false);
                  }}
                >
                  <WidgetIcon type={type} />
                  {type}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function WidgetIcon({ type }: { type: Widget }) {
  const Icon =
    type === "KPI number"
      ? Gauge
      : type === "RAG donut"
        ? LayoutDashboard
        : type === "Bar chart"
          ? BarChart3
          : type === "Table"
            ? Table2
            : type === "Timeline"
              ? CalendarRange
              : type === "Milestone list"
                ? ListChecks
                : UsersRound;
  return <Icon className="size-4 text-primary" />;
}
function WidgetBody({ type }: { type: Widget }) {
  const query = useProjects();
  const projects = query.data ?? [];
  if (!query.data)
    return (
      <p className="text-sm text-muted-foreground">
        {query.isError ? "Projects could not be loaded." : "Loading…"}
      </p>
    );
  const active = activeOnly(projects),
    rag = getRag(openOnly(projects)),
    programmes = new Set(active.map((project) => project.programmeId ?? "none")).size;
  if (type === "KPI number")
    return (
      <>
        <p className="text-5xl font-semibold">{active.length}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Active projects across {programmes} programme{programmes === 1 ? "" : "s"}
        </p>
      </>
    );
  if (type === "RAG donut") {
    const data = [
      { name: "On Track", value: rag.green, fill: "var(--viz-good)" },
      { name: "At Risk", value: rag.amber, fill: "var(--viz-warning)" },
      { name: "Off Track", value: rag.red, fill: "var(--viz-critical)" },
    ];
    return (
      <ResponsiveContainer width="100%" height="80%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={48} outerRadius={74}>
            {data.map((item) => (
              <Cell key={item.name} fill={item.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if (type === "Bar chart")
    return (
      <ResponsiveContainer width="100%" height="80%">
        <BarChart
          data={[
            {
              name: "Budget",
              value: projects.reduce((sum, project) => sum + project.budget, 0) / 1e6,
            },
            {
              name: "Forecast",
              value: projects.reduce((sum, project) => sum + project.forecast, 0) / 1e6,
            },
          ]}
        >
          <XAxis dataKey="name" />
          <YAxis />
          <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  if (type === "Table")
    return (
      <div className="divide-y">
        {active.slice(0, 4).map((project) => (
          <div key={project.id} className="flex justify-between py-2 text-sm">
            <span>{project.name}</span>
            <strong>{project.phaseName}</strong>
          </div>
        ))}
      </div>
    );
  if (type === "Timeline") return <TimelineWidget projects={active.slice(0, 5)} />;
  if (type === "Milestone list")
    return <MilestoneWidget projectIds={active.map((project) => project.id)} projects={projects} />;
  return <WorkloadWidget />;
}
function TimelineWidget({ projects }: { projects: ProjectSummary[] }) {
  const dated = projects.filter((project) => project.startDate && project.finishDate);
  if (!dated.length) return <p className="text-sm text-muted-foreground">No dated projects.</p>;
  const time = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
  const min = Math.min(...dated.map((project) => time(project.startDate!))),
    max = Math.max(...dated.map((project) => time(project.finishDate!))),
    span = Math.max(1, max - min);
  return (
    <div className="space-y-4">
      {dated.map((project) => (
        <div key={project.id} className="grid grid-cols-[180px_1fr] items-center text-xs">
          <span
            className="truncate"
            title={`${formatDate(project.startDate!)} – ${formatDate(project.finishDate!)}`}
          >
            {project.name}
          </span>
          <div className="h-3 bg-muted">
            <div
              className="h-full bg-primary"
              style={{
                marginLeft: `${((time(project.startDate!) - min) / span) * 100}%`,
                width: `${Math.max(2, ((time(project.finishDate!) - time(project.startDate!)) / span) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
function MilestoneWidget({
  projectIds,
  projects,
}: {
  projectIds: string[];
  projects: ProjectSummary[];
}) {
  const query = useMilestones(projectIds, "dashboard");
  const name = new Map(projects.map((project) => [project.id, project.name]));
  const next = (query.data ?? [])
    .filter((item) => !item.actualDate)
    .sort((a, b) => a.forecastDate.localeCompare(b.forecastDate))
    .slice(0, 4);
  if (!query.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-3">
      {next.map((item) => (
        <div key={item.id} className="flex gap-2 text-sm">
          <span className="text-primary">◆</span>
          <span className="truncate">
            {item.title}
            <span className="block text-xs text-muted-foreground">{name.get(item.projectId)}</span>
          </span>
          <span className="ml-auto shrink-0 text-muted-foreground">
            {formatDate(item.forecastDate)}
          </span>
        </div>
      ))}
      {!next.length && <p className="text-sm text-muted-foreground">No open milestones.</p>}
    </div>
  );
}
function WorkloadWidget() {
  const query = useResourceData();
  if (!query.data)
    return (
      <p className="text-sm text-muted-foreground">
        {query.isError ? "Resources could not be loaded." : "Loading…"}
      </p>
    );
  const top = [...resourceDashboard(query.data).people]
    .sort((a, b) => b.utilisation - a.utilisation)
    .slice(0, 4);
  return (
    <div className="space-y-3">
      {top.map((item) => (
        <div key={item.person.id}>
          <div className="flex justify-between text-xs">
            <span>{item.person.name}</span>
            <span>
              {item.utilisation}% · {Math.round(item.allocated / 26)}h/week
            </span>
          </div>
          <div className="mt-1 h-2 bg-muted">
            <div
              className={cn("h-full", item.utilisation > 100 ? "bg-health-bad" : "bg-primary")}
              style={{ width: `${Math.min(100, item.utilisation)}%` }}
            />
          </div>
        </div>
      ))}
      {!top.length && <p className="text-sm text-muted-foreground">No bookable people.</p>}
    </div>
  );
}
