import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Diamond, History } from "lucide-react";
import { toast } from "sonner";
import { AutoBreadcrumbs } from "@/components/section-nav";
import {
  BoardWorkspace,
  DeliveryStatusIcon,
  type BoardColumn,
  type SavedView,
} from "@/components/board-workspace";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { QueryError, QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import {
  ConnectorFocusBar,
  chainDepths,
  connectorMarkers,
  connectorStyle,
  markerFill,
} from "@/components/dependency-focus";
import { milestoneInputFromBoard, milestonesToBoardRows } from "@/components/project-milestones";
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { useDependencies } from "@/hooks/use-dependencies";
import {
  useForecastHistory,
  useMilestones,
  usePeople,
  useProgrammes,
  useProjects,
} from "@/hooks/use-hierarchy";
import { useCan } from "@/hooks/use-permissions";
import { useMilestoneMutations } from "@/hooks/use-project-records";
import { formatDate, formatShortDate, parseDate } from "@/lib/format";
import { today, todayIso } from "@/lib/today";
import { getMilestoneMetrics } from "@/services/analytics";
import { dependencyStrokeDash, type ResolvedDependency } from "@/services/dependencies";
import {
  buildDependencyGraph,
  focusGraph,
  focusSummary,
  getDelayImpact,
  milestoneNodeId,
  projectNodeId,
} from "@/services/dependency-graph";
import type { ProgrammeSummary, ProjectSummary } from "@/services/hierarchy";
import type { MilestoneInput, MilestoneItem } from "@/services/project-records";

export const Route = createFileRoute("/delivery/milestones")({
  validateSearch: (search: Record<string, unknown>): { focus?: string } => {
    const focus = typeof search["focus"] === "string" ? search["focus"] : "";
    return /^(project|programme|milestone|external):/.test(focus) ? { focus } : {};
  },
  head: () => ({
    meta: [
      { title: "Portfolio Milestones — Virtual PMO" },
      {
        name: "description",
        content: "Track portfolio milestones, stage gates, slippage and forecast trends.",
      },
      { property: "og:title", content: "Portfolio Milestones — Virtual PMO" },
      {
        property: "og:description",
        content: "Track portfolio milestones, stage gates, slippage and forecast trends.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MilestonesPage,
});

const DAY = 86_400_000;
const time = (value: string) => parseDate(value)?.getTime() ?? 0;
const day = (value: string) => Math.round((time(value) - today().getTime()) / DAY);
const serial = (value: string) => Math.round(time(value) / DAY);
const shortDate = (value: number) => formatShortDate(new Date(value * DAY));
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface PortfolioMilestone extends MilestoneItem {
  projectName: string;
  projectCode: string;
  programmeId: string | null;
  programmeName: string;
  ownerName: string;
}

const columns: BoardColumn[] = [
  { key: "title", label: "Milestone", type: "text", editable: true, summary: "count", width: 280 },
  { key: "project", label: "Project", type: "text", width: 240 },
  { key: "programme", label: "Programme", type: "text", width: 240 },
  {
    key: "type",
    label: "Type",
    type: "status",
    editable: true,
    options: ["Delivery", "Gate", "Key date", "External dependency"],
  },
  { key: "people", label: "Owner", type: "people", editable: true },
  { key: "deliveryStatus", label: "Status", type: "status", summary: "rag" },
  { key: "baseline", label: "Baseline", type: "date", editable: true },
  { key: "finish", label: "Forecast", type: "date", editable: true },
  { key: "actual", label: "Actual", type: "date" },
  { key: "number", label: "Slip", type: "number", unit: " days", summary: "average" },
  { key: "tags", label: "Reporting", type: "tags" },
  { key: "timeline", label: "Timeline", type: "timeline" },
];
const visible = columns.map((column) => column.key);
const views: SavedView[] = [
  {
    id: "committee",
    name: "Committee milestones",
    type: "table",
    groupBy: "programme",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "reportToCommittee", operator: "truthy" }],
    visible,
    isDefault: true,
  },
  {
    id: "gates",
    name: "Gates",
    type: "table",
    groupBy: "programme",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "isGate", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "overdue",
    name: "Overdue",
    type: "table",
    groupBy: "programme",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "overdue", operator: "truthy" }],
    visible,
    isDefault: false,
  },
  {
    id: "quarter",
    name: "This quarter",
    type: "table",
    groupBy: "programme",
    sortKey: "finish",
    filter: "",
    filters: [{ key: "thisQuarter", operator: "truthy" }],
    visible,
    isDefault: false,
  },
];

function MilestonesPage() {
  const projects = useProjects();
  const programmes = useProgrammes();
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Portfolio controls"
        title="Milestones"
        description="Track critical dates, stage gates and movement against baseline across the portfolio."
      />
      <QueryState query={projects}>
        {(items) => (
          <QueryState query={programmes}>
            {(programmeItems) => <Milestones projects={items} programmes={programmeItems} />}
          </QueryState>
        )}
      </QueryState>
    </div>
  );
}

function Milestones({
  projects,
  programmes,
}: {
  projects: ProjectSummary[];
  programmes: ProgrammeSummary[];
}) {
  const { focus } = useSearch({ from: "/delivery/milestones" });
  const navigate = useNavigate();
  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const milestones = useMilestones(projectIds, "portfolio");
  const people = usePeople();
  const names = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person.name])),
    [people.data],
  );
  const byProject = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const items: PortfolioMilestone[] = useMemo(
    () =>
      (milestones.data ?? []).map((item) => {
        const project = byProject.get(item.projectId);
        return {
          ...item,
          projectName: project?.name ?? "",
          projectCode: project?.code ?? "",
          programmeId: project?.programmeId ?? null,
          programmeName: project?.programmeName ?? "No programme",
          ownerName: (item.ownerId && names.get(item.ownerId)) || "Unassigned",
        };
      }),
    [milestones.data, byProject, names],
  );
  const metrics = getMilestoneMetrics(items);
  const [projectId, setProjectId] = useState(
    () => projects.find((project) => project.state === "Active")?.id ?? projects[0]?.id ?? "",
  );
  const recent = items
    .filter((item) => item.actualDate && day(item.actualDate) >= -30 && day(item.actualDate) <= 0)
    .sort((a, b) => day(b.actualDate ?? "") - day(a.actualDate ?? ""));
  const upcoming = items.filter(
    (item) =>
      item.status !== "Completed" && day(item.forecastDate) >= 0 && day(item.forecastDate) <= 30,
  );
  const slipped = items
    .filter((item) => item.slipDays > 0)
    .sort((a, b) => b.slipDays - a.slipDays)
    .slice(0, 12)
    .map((item) => ({
      name: item.title.length > 24 ? `${item.title.slice(0, 22)}…` : item.title,
      days: item.slipDays,
    }));
  const history = useForecastHistory(projectId);
  const trend = useMemo(() => {
    const dates = Array.from(
      new Set((history.data ?? []).map((point) => point.reportingDate)),
    ).sort();
    return dates.map((date) => ({
      date: formatShortDate(date),
      ...Object.fromEntries(
        (history.data ?? [])
          .filter((point) => point.reportingDate === date)
          .map((point) => [point.milestoneId, serial(point.forecastDate)]),
      ),
    }));
  }, [history.data]);
  const trendMilestones = items.filter((item) => item.projectId === projectId);

  return (
    <>
      {milestones.isError && (
        <QueryError error={milestones.error} retry={() => void milestones.refetch()} />
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Completed"
          value={String(metrics.completed)}
          detail="Last 30 days"
          icon="health"
        />
        <KpiCard
          label="Due in 30 days"
          value={String(metrics.upcoming)}
          detail="Not yet complete"
          icon="forecast"
        />
        <KpiCard
          label="Overdue"
          value={String(metrics.overdue)}
          detail="Forecast in the past"
          icon="health"
        />
        <KpiCard
          label="Slipped"
          value={String(metrics.slipped)}
          detail="Forecast later than baseline"
          icon="projects"
        />
        <KpiCard
          label="Hit baseline (90d)"
          value={`${metrics.percentOnTime}%`}
          detail="Completed on or before baseline"
          icon="budget"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <MilestoneList title="Recently completed" items={recent} />
        <MilestoneList title="Due in the next 30 days" items={upcoming} />
      </div>
      <PortfolioTimeline
        items={items}
        programmes={programmes}
        focusId={focus}
        onFocus={(id) =>
          navigate({ to: "/delivery/milestones", search: id ? { focus: id } : {}, replace: true })
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Milestone slippage</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Forecast days beyond baseline, highest slip first
          </p>
          <div className="mt-4 h-80">
            <ResponsiveContainer>
              <BarChart data={slipped} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit="d" />
                <YAxis dataKey="name" type="category" width={145} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="days" fill="var(--viz-warning)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Milestone Trend Analysis</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Forecast date at each reporting point
              </p>
            </div>
            <select
              aria-label="Trend project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-9 max-w-64 rounded-md border bg-background px-3 text-sm"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 h-80">
            {trend.length ? (
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis
                    domain={["dataMin-3", "dataMax+3"]}
                    tickFormatter={shortDate}
                    width={58}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip formatter={(value) => shortDate(Number(value))} />
                  {trendMilestones.map((item, index) => (
                    <Line
                      key={item.id}
                      type="monotone"
                      dataKey={item.id}
                      name={item.title}
                      stroke={`var(--chart-${(index % 5) + 1})`}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">
                No forecast history recorded for this project yet.
              </p>
            )}
          </div>
        </section>
      </div>
      <Register items={items} />
    </>
  );
}

function Register({ items }: { items: PortfolioMilestone[] }) {
  const people = usePeople();
  const canEdit = useCan("contributor");
  const canDelete = useCan("manager");
  const mutations = useMilestoneMutations("portfolio");
  const names = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person.name])),
    [people.data],
  );
  const now = today();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).getTime();
  const quarterEnd = new Date(
    now.getFullYear(),
    Math.floor(now.getMonth() / 3) * 3 + 3,
    0,
  ).getTime();
  const byId = new Map(items.map((item) => [item.id, item]));
  const rows = milestonesToBoardRows(items, names).map((row) => {
    const item = byId.get(row.id);
    return {
      ...row,
      project: item?.projectName ?? "",
      programme: item?.programmeName ?? "",
      code: item?.projectCode ?? "",
      tags: item?.reportToCommittee ? ["Committee"] : [],
      reportToCommittee: item?.reportToCommittee ?? false,
      isGate: item?.type === "Gate",
      overdue: item?.status === "Overdue",
      thisQuarter: Boolean(
        item && time(item.forecastDate) >= quarterStart && time(item.forecastDate) <= quarterEnd,
      ),
      group: item?.programmeName ?? "",
    };
  });
  const onRecordChange = useBoardRecordSync<MilestoneInput>({
    toInput: (patch) => milestoneInputFromBoard(patch, people.data ?? []),
    create: () => toast.error("Add milestones from the project's Milestones tab."),
    update: (id, input, lastSeen) => mutations.update.mutateAsync({ id, input, lastSeen }),
    remove: (ids) => mutations.remove.mutate(ids),
    lastSeen: (id) => byId.get(id)?.updatedAt,
  });
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold">Milestone register</h2>
        <p className="text-xs text-muted-foreground">
          All project milestones with governed dates, ownership and committee reporting. Edits are
          checked against each project's permissions.
        </p>
      </div>
      <BoardWorkspace
        key={String(canEdit)}
        title="Milestones"
        itemLabel="milestone"
        rows={rows}
        columns={canEdit ? columns : columns.map((column) => ({ ...column, editable: false }))}
        manage={canEdit}
        canDelete={canDelete}
        canCreate={false}
        onRecordChange={onRecordChange}
        groupOptions={["programme", "project", "type", "deliveryStatus", "people"]}
        seededViews={views}
        renderTitle={(row) => (
          <Link
            to="/portfolio/projects/$projectCode"
            params={{ projectCode: String(row["code"]) }}
            className="text-primary hover:underline"
          >
            {row.title}
          </Link>
        )}
      />
    </section>
  );
}

function MilestoneList({ title, items }: { title: string; items: PortfolioMilestone[] }) {
  return (
    <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-4 divide-y">
        {items.slice(0, 6).map((item) => (
          <Link
            key={item.id}
            to="/portfolio/projects/$projectCode"
            params={{ projectCode: item.projectCode }}
            className="flex items-start gap-3 py-3 hover:bg-accent/30"
          >
            <DeliveryStatusIcon status={item.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="truncate text-xs text-muted-foreground">{item.projectName}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDate(item.actualDate ?? item.forecastDate)}
            </span>
          </Link>
        ))}
        {!items.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing in this window.</p>
        )}
      </div>
    </section>
  );
}

const ROW_HEIGHT = 56;
/** Two months back to four months ahead, so today is always on the timeline. */
function timelineWindow() {
  const now = today();
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 4, 0);
  const months = Array.from(
    { length: 6 },
    (_, index) => SHORT_MONTHS[(start.getMonth() + index) % 12] ?? "",
  );
  return { start: start.getTime(), end: end.getTime(), months };
}

function PortfolioTimeline({
  items,
  programmes,
  focusId,
  onFocus,
}: {
  items: PortfolioMilestone[];
  programmes: ProgrammeSummary[];
  focusId?: string | undefined;
  onFocus: (id: string | undefined) => void;
}) {
  const [showLinks, setShowLinks] = useState(true),
    [depth, setDepth] = useState(1);
  const { start, end, months } = timelineWindow();
  const position = (date: string) =>
    Math.max(0, Math.min(100, ((time(date) - start) / (end - start)) * 100));
  const rowIndex = (programmeId?: string) =>
    programmes.findIndex((programme) => programme.id === programmeId);
  const dependencyQuery = useDependencies();
  // Dependency connectors run from the giving milestone to the receiving side's required-by date.
  const dependencies: ResolvedDependency[] = useMemo(
    () => dependencyQuery.data?.dependencies ?? [],
    [dependencyQuery.data],
  );
  const graph = useMemo(() => buildDependencyGraph(dependencies, "milestone"), [dependencies]);
  const focus = useMemo(
    () => (focusId ? focusGraph(graph, focusId, depth) : undefined),
    [graph, focusId, depth],
  );
  const focusNode = focusId ? graph.nodes.get(focusId) : undefined;
  const delayImpact =
    focusId && focus && focus.criticalNodes.has(focusId) ? getDelayImpact(graph, focusId) : 0;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusId) onFocus(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, onFocus]);
  const connectors = dependencies.flatMap((dependency) => {
    const fromRow = rowIndex(dependency.giverProgrammeId),
      toRow = rowIndex(dependency.receiverProgrammeId);
    const fromDate = dependency.giverMilestone?.forecastDate;
    if (fromRow < 0 || toRow < 0 || !fromDate) return [];
    return [
      {
        dependency,
        x1: position(fromDate),
        y1: fromRow * ROW_HEIGHT + ROW_HEIGHT / 2,
        x2: position(dependency.requiredBy),
        y2: toRow * ROW_HEIGHT + ROW_HEIGHT / 2,
      },
    ];
  });
  const todayPosition = position(todayIso());
  return (
    <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Portfolio milestone timeline</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Forecast diamonds, slipped baseline positions and dependency connectors by programme
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>◇ Baseline</span>
          <span className="text-primary">◆ Forecast</span>
          <Button
            size="sm"
            variant={showLinks ? "secondary" : "outline"}
            onClick={() => setShowLinks((value) => !value)}
            aria-pressed={showLinks}
          >
            {showLinks ? "Hide" : "Show"} dependencies
          </Button>
        </div>
      </div>
      {focus && focusNode ? (
        <div className="mt-4">
          <ConnectorFocusBar
            summary={focusSummary(focusNode, focus)}
            label={focusNode.kind}
            sublabel={focusNode.sublabel}
            depth={depth}
            setDepth={setDepth}
            depths={chainDepths}
            impact={
              delayImpact > 0
                ? `Delay here affects ${delayImpact} downstream ${delayImpact === 1 ? "item" : "items"}`
                : undefined
            }
            clear={() => onFocus(undefined)}
          />
        </div>
      ) : null}
      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="ml-64 flex justify-between border-b pb-2 text-[10px] text-muted-foreground">
            {months.map((month) => (
              <span key={month}>{month}</span>
            ))}
          </div>
          <div className="relative">
            {showLinks && connectors.length > 0 && (
              <svg
                className="pointer-events-none absolute inset-y-0 right-0 z-20 [&>g]:pointer-events-auto"
                style={{ left: 250 }}
                width="100%"
                height={programmes.length * ROW_HEIGHT}
                aria-hidden
              >
                <defs>
                  {connectorMarkers.map((tone) => (
                    <marker
                      key={tone}
                      id={`ms-dep-${tone}`}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={markerFill(tone)} />
                    </marker>
                  ))}
                </defs>
                {connectors.map(({ dependency, x1, y1, x2, y2 }) => {
                  const style = connectorStyle(dependency, focus);
                  const target =
                    dependency.giver.milestoneId && dependency.giver.projectId
                      ? milestoneNodeId(dependency.giver.projectId, dependency.giver.milestoneId)
                      : dependency.giver.projectId
                        ? projectNodeId(dependency.giver.projectId)
                        : undefined;
                  return (
                    <g
                      key={dependency.id}
                      style={{
                        opacity: style.opacity,
                        filter: style.grey ? "grayscale(1)" : undefined,
                        transition: "opacity 200ms ease, filter 200ms ease",
                        pointerEvents: "auto",
                        cursor: target ? "pointer" : "default",
                      }}
                      onClick={() => {
                        if (target) onFocus(focusId === target ? undefined : target);
                      }}
                    >
                      <line
                        x1={`${x1}%`}
                        y1={y1}
                        x2={`${x2}%`}
                        y2={y2}
                        stroke="transparent"
                        strokeWidth={12}
                      />
                      <line
                        x1={`${x1}%`}
                        y1={y1}
                        x2={`${x2}%`}
                        y2={y2}
                        stroke={style.stroke}
                        strokeWidth={style.width}
                        strokeDasharray={dependencyStrokeDash(dependency.type)}
                        markerEnd={`url(#ms-dep-${style.marker})`}
                      />
                      <title>{`${dependency.reference}: ${dependency.giverLabel} → ${dependency.receiverLabel} (${dependency.type}, ${dependency.health}) — click to focus this chain`}</title>
                    </g>
                  );
                })}
              </svg>
            )}
            {programmes.map((programme) => (
              <div
                key={programme.id}
                className="grid grid-cols-[250px_1fr] border-b last:border-0"
                style={{ height: ROW_HEIGHT }}
              >
                <p className="truncate self-center pr-4 text-xs font-medium">{programme.name}</p>
                <div
                  className="relative my-2 bg-muted/30"
                  style={{
                    backgroundImage: "linear-gradient(to right,var(--border) 1px,transparent 1px)",
                    backgroundSize: `${100 / 6}% 100%`,
                  }}
                >
                  <span
                    className="absolute inset-y-0 z-10 w-px bg-health-bad"
                    style={{ left: `${todayPosition}%` }}
                    title="Today"
                  />
                  {items
                    .filter((item) => item.programmeId === programme.id)
                    .flatMap((item) => [
                      ...(item.slipDays > 0
                        ? [
                            <Diamond
                              key={`${item.id}-baseline`}
                              className="absolute top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
                              style={{ left: `${position(item.baselineDate)}%` }}
                            />,
                          ]
                        : []),
                      <span
                        key={`${item.id}-forecast`}
                        title={`${item.title} · ${formatDate(item.forecastDate)}`}
                        className="absolute top-1/2 -translate-y-1/2"
                        style={{ left: `${position(item.forecastDate)}%` }}
                      >
                        <Diamond className="size-3.5 fill-primary text-primary" />
                      </span>,
                    ])}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
