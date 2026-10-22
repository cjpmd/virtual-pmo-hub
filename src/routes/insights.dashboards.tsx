import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import {
  BarChart3,
  CalendarRange,
  CopyPlus,
  Gauge,
  GripVertical,
  LayoutDashboard,
  ListChecks,
  Plus,
  Save,
  Settings2,
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
import { useDashboards } from "@/hooks/use-saved-views";
import {
  DASHBOARD_WIDGETS,
  canEditDashboard,
  defaultDashboardId,
  type DashboardWidget,
} from "@/services/dashboards";
import { errorMessage } from "@/services/service-error";
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
type Widget = DashboardWidget;
const all = DASHBOARD_WIDGETS;
/** The built-in dashboard: every widget, read-only. Its id in the picker. */
const SEEDED = "seeded";

function DashboardPage() {
  const settings = useSettings();
  const store = useDashboards();
  const records = store.query.data;
  // null until the list loads; then my default, else the seeded dashboard.
  const [activeId, setActiveId] = useState<string | null>(null),
    // Unsaved changes to the open dashboard (null = none).
    [draft, setDraft] = useState<Widget[] | null>(null),
    [picker, setPicker] = useState(false),
    [dragged, setDragged] = useState<number | null>(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (records && activeId === null) setActiveId(defaultDashboardId(records, store.me) ?? SEEDED);
  }, [records, activeId, store.me]);
  const current = records?.find((record) => record.id === activeId);
  const widgets = draft ?? current?.widgets ?? [...all];
  const editable = current ? canEditDashboard(current, store.me, store.canManageShared) : false;
  const mine = current?.ownerId === store.me;
  const busy = store.create.isPending || store.update.isPending || store.remove.isPending;
  const failed = (error: Error) => setNotice(errorMessage(error));
  const setWidgets = (next: Widget[]) => {
    setDraft(next);
    setNotice("");
  };
  const open = (id: string) => {
    if (draft && !window.confirm("Discard your unsaved changes to this dashboard?")) return;
    setDraft(null);
    setActiveId(id);
    setNotice("");
  };
  const saveAsNew = () => {
    const name = window
      .prompt("Name this dashboard", current ? `${current.name} (copy)` : "My dashboard")
      ?.trim();
    if (!name) return;
    store.create.mutate(
      { name, widgets },
      {
        onSuccess: (written) => {
          setDraft(null);
          setActiveId(written.id);
          setNotice(`${name} saved`);
        },
        onError: failed,
      },
    );
  };
  const update = (patch: Parameters<typeof store.update.mutate>[0]["patch"], done: string) => {
    if (!current) return;
    store.update.mutate(
      { id: current.id, patch, lastSeen: current.updatedAt },
      {
        onSuccess: () => {
          if (patch.widgets) setDraft(null);
          setNotice(done);
        },
        onError: failed,
      },
    );
  };
  const rename = () => {
    if (!current) return;
    const name = window.prompt("Rename the dashboard", current.name)?.trim();
    if (name && name !== current.name) update({ name }, `Renamed to ${name}`);
  };
  const remove = () => {
    if (!current || !window.confirm(`Delete the dashboard "${current.name}"?`)) return;
    store.remove.mutate(current.id, {
      onSuccess: () => {
        setDraft(null);
        setActiveId(SEEDED);
        setNotice(`${current.name} deleted`);
      },
      onError: failed,
    });
  };
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Dashboard"
        title={current?.name ?? `${settings.organisation.shortName} portfolio`}
        description="A configurable view of delivery, finance, milestones and portfolio capacity."
        actions={
          <Button onClick={() => setPicker(true)}>
            <Plus />
            Add widget
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card p-2 shadow-sm">
        <select
          aria-label="Dashboard"
          value={activeId ?? SEEDED}
          onChange={(event) => open(event.target.value)}
          className="h-8 rounded border border-input bg-background px-2 text-xs"
        >
          <option value={SEEDED}>{settings.organisation.shortName} portfolio (built-in)</option>
          {records?.map((record) => (
            <option key={record.id} value={record.id}>
              {record.isDefault && record.ownerId === store.me ? "★ " : ""}
              {record.name}
              {record.isShared ? " · shared" : ""}
            </option>
          ))}
        </select>
        {editable && draft && (
          <Button size="sm" disabled={busy} onClick={() => update({ widgets }, "Dashboard saved")}>
            <Save />
            Save
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy} onClick={saveAsNew}>
          <CopyPlus />
          Save as new
        </Button>
        {current && (
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1 rounded px-2 text-xs hover:bg-accent">
              <Settings2 className="size-4" />
              Dashboard
            </summary>
            <div className="absolute left-0 z-30 mt-1 w-60 rounded-md border bg-popover p-1 shadow-lg">
              {editable && <MenuItem onClick={rename}>Rename</MenuItem>}
              {mine && (
                <MenuItem
                  onClick={() =>
                    update(
                      { isDefault: !current.isDefault },
                      current.isDefault
                        ? "The built-in dashboard opens by default again"
                        : `${current.name} now opens by default`,
                    )
                  }
                >
                  {current.isDefault ? "Stop opening by default" : "Open this by default"}
                </MenuItem>
              )}
              {mine && (
                <MenuItem
                  onClick={() =>
                    update(
                      { isShared: !current.isShared },
                      current.isShared
                        ? `${current.name} is private`
                        : `${current.name} is shared with the organisation`,
                    )
                  }
                >
                  {current.isShared ? "Stop sharing" : "Share with organisation"}
                </MenuItem>
              )}
              {editable && (
                <MenuItem destructive onClick={remove}>
                  Delete dashboard
                </MenuItem>
              )}
              {!editable && (
                <p className="p-2 text-xs text-muted-foreground">
                  Shared by someone else. Save as new keeps your own copy.
                </p>
              )}
            </div>
          </details>
        )}
        <p className="ml-auto text-xs text-muted-foreground" role="status">
          {notice ||
            (draft
              ? editable
                ? "Unsaved changes"
                : "Unsaved changes: save as new to keep them"
              : store.query.isError
                ? `Saved dashboards could not be loaded: ${store.query.error.message}`
                : "")}
        </p>
      </div>
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
                aria-label={`Remove ${widget}`}
                onClick={() => setWidgets(widgets.filter((_, i) => i !== index))}
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
                    setWidgets([...widgets, type]);
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
function MenuItem({
  onClick,
  destructive = false,
  children,
}: {
  onClick: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.currentTarget.closest("details")?.removeAttribute("open");
        onClick();
      }}
      className={cn(
        "block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
        destructive && "text-health-bad-foreground",
      )}
    >
      {children}
    </button>
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
