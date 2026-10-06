import { formatDate } from "@/lib/format";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronDown,
  Flag,
  GripVertical,
  LockKeyhole,
  Maximize2,
  Minimize2,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { DeliveryStatusIcon } from "@/components/board-workspace";
import { cn } from "@/lib/utils";
import type { ResolvedRoadmapItem, RoadmapView } from "@/services/roadmaps";
import { dependencyStrokeDash } from "@/services/dependencies";
import { useDependencies } from "@/hooks/use-dependencies";
import { useRescheduleRoadmapItem } from "@/hooks/use-roadmaps";
import { useCan } from "@/hooks/use-permissions";
import { parseDate, toIsoDate } from "@/lib/format";
import { today, todayIso } from "@/lib/today";
import { useSettings } from "@/services/settings";
import {
  ConnectorFocusBar,
  chainDepths,
  connectorMarkers,
  connectorStyle,
  markerFill,
} from "@/components/dependency-focus";
import {
  buildDependencyGraph,
  focusGraph,
  focusSummary,
  getDelayImpact,
  projectNodeId,
} from "@/services/dependency-graph";
import type { RoadmapGroupBy, RoadmapHealth } from "@/data/types";

type Zoom = "Month" | "Quarter" | "Year";
const DAY = 86400000;
const parse = (value: string) => parseDate(value) ?? today();
/** Dates are ISO (YYYY-MM-DD) as stored; display goes through formatDate. */
const addDays = (value: string, days: number) =>
  toIsoDate(new Date(parse(value).getTime() + days * DAY)) ?? value;
const iso = (date: Date) => toIsoDate(date) ?? todayIso();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fyLabel = (startYear: number, startMonth: number) =>
  startMonth === 1
    ? `FY ${startYear}`
    : `FY ${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
/** Zoom windows around today: this month and the next three, the current financial year by quarter, or last and this financial year. */
function rangesFor(
  fyStartMonth: number,
): Record<Zoom, { start: string; end: string; labels: string[]; snap: number; fy: string }> {
  const now = today(),
    fyYear = now.getMonth() + 1 >= fyStartMonth ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = new Date(fyYear, fyStartMonth - 1, 1),
    fyEnd = new Date(fyYear + 1, fyStartMonth - 1, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const quarter = (index: number) => {
    const first = new Date(fyYear, fyStartMonth - 1 + index * 3, 1),
      last = new Date(fyYear, fyStartMonth - 1 + index * 3 + 2, 1);
    return `${MONTHS[first.getMonth()]}–${MONTHS[last.getMonth()]}`;
  };
  return {
    Month: {
      start: iso(monthStart),
      end: iso(new Date(now.getFullYear(), now.getMonth() + 4, 0)),
      labels: Array.from({ length: 4 }, (_, index) => {
        const month = new Date(now.getFullYear(), now.getMonth() + index, 1);
        return `${MONTHS[month.getMonth()]} ${month.getFullYear()}`;
      }),
      snap: 1,
      fy: fyLabel(fyYear, fyStartMonth),
    },
    Quarter: {
      start: iso(fyStart),
      end: iso(fyEnd),
      labels: [0, 1, 2, 3].map(quarter),
      snap: 7,
      fy: fyLabel(fyYear, fyStartMonth),
    },
    Year: {
      start: iso(new Date(fyYear - 1, fyStartMonth - 1, 1)),
      end: iso(fyEnd),
      labels: [fyLabel(fyYear - 1, fyStartMonth), fyLabel(fyYear, fyStartMonth)],
      snap: 14,
      fy: fyLabel(fyYear, fyStartMonth),
    },
  };
}
const statusClass: Record<RoadmapHealth, string> = {
  "High risk": "bg-health-bad text-destructive-foreground",
  "At risk": "bg-health-warn text-health-warn-foreground",
  "On track": "bg-health-good text-primary-foreground",
  "Not set": "bg-muted-foreground text-primary-foreground",
  Done: "bg-health-good/65 text-primary-foreground",
};
const rowLabel = (item: ResolvedRoadmapItem, groupBy: RoadmapGroupBy) =>
  groupBy === "Programme"
    ? item.programmeName
    : groupBy === "Collection"
      ? (item.collectionNames[0] ?? "No collection")
      : groupBy === "Priority"
        ? (item.priority ?? "Not set")
        : item.projectManager;

export function RoadmapWorkspace({
  roadmap,
  focusId,
  onFocus,
}: {
  roadmap: RoadmapView;
  focusId?: string | undefined;
  onFocus?: (id: string | undefined) => void;
}) {
  const settings = useSettings();
  const ranges = useMemo(
    () => rangesFor(settings.regional.financialYearStartMonth),
    [settings.regional.financialYearStartMonth],
  );
  const canEdit = useCan("pmo", roadmap.workspaceId);
  const reschedule = useRescheduleRoadmapItem();
  const [zoom, setZoom] = useState<Zoom>("Quarter"),
    [depth, setDepth] = useState(1),
    [groupBy, setGroupBy] = useState<RoadmapGroupBy>("Programme"),
    [present, setPresent] = useState(false),
    [edits, setEdits] = useState<Record<string, { start: string; finish: string }>>({}),
    [showLinks, setShowLinks] = useState(true);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<{
    id: string;
    mode: "move" | "start" | "finish";
    x: number;
    start: string;
    finish: string;
  } | null>(null);
  const items = useMemo(
    () => roadmap.items.map((item) => (edits[item.id] ? { ...item, ...edits[item.id] } : item)),
    [roadmap, edits],
  );
  const groups = useMemo(
    () =>
      Object.entries(
        items.reduce<Record<string, ResolvedRoadmapItem[]>>((result, item) => {
          const key = rowLabel(item, groupBy);
          (result[key] ??= []).push(item);
          return result;
        }, {}),
      ),
    [items, groupBy],
  );
  const range = ranges[zoom],
    startMs = parse(range.start).getTime(),
    endMs = parse(range.end).getTime(),
    totalDays = Math.round((endMs - startMs) / DAY) + 1;
  // Start of the current financial year (DD/MM/YYYY, like the roadmap dates).
  const fyStart = (() => {
    const now = today(),
      m = settings.regional.financialYearStartMonth,
      y = now.getMonth() + 1 >= m ? now.getFullYear() : now.getFullYear() - 1;
    return `01/${String(m).padStart(2, "0")}/${y}`;
  })();
  const position = (date: string) =>
    Math.max(0, Math.min(100, ((parse(date).getTime() - startMs) / (endMs - startMs)) * 100));
  // Dependency connectors: work out where each linked project's bar sits so we can draw between them.
  const LANE_TOP = 30,
    LANE_STEP = 38,
    BAR_HEIGHT = 32;
  const barAnchors = useMemo(() => {
    const anchors = new Map<string, { left: number; right: number; y: number }>();
    let laneTop = 0;
    for (const [, groupItems] of groups) {
      groupItems.forEach((item, index) => {
        if (item.projectId)
          anchors.set(item.projectId, {
            left: position(item.start),
            right: position(item.finish),
            y: laneTop + LANE_TOP + index * LANE_STEP + BAR_HEIGHT / 2,
          });
      });
      laneTop += Math.max(96, 46 + groupItems.length * LANE_STEP);
    }
    return { anchors, height: laneTop };
  }, [groups, zoom]);
  const dependencyQuery = useDependencies();
  const dependencies = useMemo(
    () => dependencyQuery.data?.dependencies ?? [],
    [dependencyQuery.data],
  );
  const connectors = useMemo(
    () =>
      dependencies.flatMap((dependency) => {
        const from = dependency.giver.projectId
          ? barAnchors.anchors.get(dependency.giver.projectId)
          : undefined;
        const to = dependency.receiver.projectId
          ? barAnchors.anchors.get(dependency.receiver.projectId)
          : undefined;
        return from && to ? [{ dependency, from, to }] : [];
      }),
    [dependencies, barAnchors],
  );
  // Focus mode: clicking a connector follows the chain it belongs to, the same graph the Dependency Map uses.
  const graph = useMemo(() => buildDependencyGraph(dependencies, "project"), [dependencies]);
  const focus = useMemo(
    () => (focusId ? focusGraph(graph, focusId, depth) : undefined),
    [graph, focusId, depth],
  );
  const focusNode = focusId ? graph.nodes.get(focusId) : undefined;
  const delayImpact =
    focusId && focus && focus.criticalNodes.has(focusId) ? getDelayImpact(graph, focusId) : 0;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && focusId) onFocus?.(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, onFocus]);
  const beginDrag = (
    event: ReactPointerEvent,
    item: ResolvedRoadmapItem,
    mode: "move" | "start" | "finish",
  ) => {
    if (item.kind === "Linked" || !canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    activeRef.current = {
      id: item.id,
      mode,
      x: event.clientX,
      start: item.start,
      finish: item.finish,
    };
    const move = (pointer: PointerEvent) => {
      const active = activeRef.current,
        element = surfaceRef.current;
      if (!active || !element) return;
      const raw =
        Math.round(
          (((pointer.clientX - active.x) / element.getBoundingClientRect().width) * totalDays) /
            range.snap,
        ) * range.snap;
      let nextStart = active.start,
        nextFinish = active.finish;
      if (active.mode === "move") {
        nextStart = addDays(active.start, raw);
        nextFinish = addDays(active.finish, raw);
      } else if (
        active.mode === "start" &&
        parse(addDays(active.start, raw)) < parse(active.finish)
      )
        nextStart = addDays(active.start, raw);
      else if (active.mode === "finish" && parse(addDays(active.finish, raw)) > parse(active.start))
        nextFinish = addDays(active.finish, raw);
      setEdits((current) => ({
        ...current,
        [active.id]: { start: nextStart, finish: nextFinish },
      }));
    };
    const up = () => {
      const active = activeRef.current;
      activeRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!active) return;
      setEdits((current) => {
        const moved = current[active.id];
        if (moved && (moved.start !== active.start || moved.finish !== active.finish))
          reschedule.mutate(
            { id: active.id, start: moved.start, finish: moved.finish, lastSeen: item.updatedAt },
            {
              onSettled: () =>
                setEdits((latest) => {
                  const next = { ...latest };
                  delete next[active.id];
                  return next;
                }),
            },
          );
        return current;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const shell = present
    ? "fixed inset-0 z-[100] overflow-auto bg-background p-5 sm:p-8"
    : "space-y-5";
  return (
    <div className={shell} aria-label={present ? "Roadmap presentation" : "Roadmap workspace"}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" />
            <span className="text-sm">
              Owner: <strong>{roadmap.owner}</strong>
            </span>
          </div>
          {present && <h1 className="mt-2 font-display text-3xl font-semibold">{roadmap.name}</h1>}
        </div>
        <div className="flex rounded-md border bg-muted/40 p-1" aria-label="Timeline zoom">
          {(["Month", "Quarter", "Year"] as Zoom[]).map((option) => (
            <Button
              key={option}
              variant={zoom === option ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setZoom(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        {!present && (
          <label className="relative">
            <span className="sr-only">Group rows by</span>
            <select
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as RoadmapGroupBy)}
              className="h-9 appearance-none rounded-md border bg-background pl-3 pr-8 text-sm"
            >
              <option>Programme</option>
              <option>Collection</option>
              <option>Priority</option>
              <option>Project manager</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-4 text-muted-foreground" />
          </label>
        )}
        <Button
          variant={showLinks ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowLinks((value) => !value)}
          aria-pressed={showLinks}
        >
          {showLinks ? "Hide" : "Show"} dependencies
        </Button>
        <Button
          variant={present ? "default" : "outline"}
          onClick={() => setPresent((value) => !value)}
        >
          {present ? <Minimize2 /> : <Maximize2 />}
          {present ? "Exit present" : "Present"}
        </Button>
      </div>
      {!present && <p className="text-sm text-muted-foreground">{roadmap.description}</p>}
      <div className="flex flex-wrap gap-4 text-xs">
        {(["High risk", "At risk", "On track", "Not set", "Done"] as RoadmapHealth[]).map(
          (status) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", statusClass[status])} />
              {status}
            </span>
          ),
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm border border-dashed" />
          Planned initiative
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/70 bg-card shadow-sm">
        <div className={cn("min-w-[980px]", zoom === "Month" && "min-w-[1500px]")}>
          <div className="grid grid-cols-[240px_1fr] border-b bg-table-head">
            <div className="px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
              Grouped by {groupBy.toLowerCase()}
            </div>
            <div
              className="relative grid"
              style={{ gridTemplateColumns: `repeat(${range.labels.length},minmax(0,1fr))` }}
            >
              {range.labels.map((label, index) => (
                <div key={label} className="border-l px-3 py-3 text-xs font-semibold">
                  <span>{label}</span>
                  {(zoom !== "Month" || index === 0) && (
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                      {zoom === "Year" ? "" : index === 0 ? range.fy : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {focus && focusNode && onFocus ? (
            <div className="mb-3">
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
          <div ref={surfaceRef} className="relative">
            {showLinks && connectors.length > 0 && (
              <svg
                className="absolute inset-y-0 right-0 z-30 pointer-events-none [&>g]:pointer-events-auto"
                style={{ left: 240 }}
                height={barAnchors.height}
                width="100%"
                aria-hidden
              >
                <defs>
                  {connectorMarkers.map((tone) => (
                    <marker
                      key={tone}
                      id={`roadmap-dep-${tone}`}
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
                {connectors.map(({ dependency, from, to }) => {
                  const style = connectorStyle(dependency, focus);
                  return (
                    <g
                      key={dependency.id}
                      style={{
                        opacity: style.opacity,
                        filter: style.grey ? "grayscale(1)" : undefined,
                        transition: "opacity 200ms ease, filter 200ms ease",
                        pointerEvents: onFocus ? "auto" : "none",
                        cursor: onFocus ? "pointer" : "default",
                      }}
                      onClick={() => {
                        if (dependency.giver.projectId)
                          onFocus?.(
                            focusId === projectNodeId(dependency.giver.projectId)
                              ? undefined
                              : projectNodeId(dependency.giver.projectId),
                          );
                      }}
                    >
                      <line
                        x1={`${from.right}%`}
                        y1={from.y}
                        x2={`${to.left}%`}
                        y2={to.y}
                        stroke="transparent"
                        strokeWidth={12}
                      />
                      <line
                        x1={`${from.right}%`}
                        y1={from.y}
                        x2={`${to.left}%`}
                        y2={to.y}
                        stroke={style.stroke}
                        strokeWidth={style.width}
                        strokeDasharray={dependencyStrokeDash(dependency.type)}
                        markerEnd={`url(#roadmap-dep-${style.marker})`}
                      />
                      <title>{`${dependency.reference}: ${dependency.giverLabel} → ${dependency.receiverLabel} (${dependency.type}, ${dependency.health}) — click to focus this chain`}</title>
                    </g>
                  );
                })}
              </svg>
            )}
            {groups.map(([label, groupItems]) => (
              <div key={label} className="grid grid-cols-[240px_1fr] border-b last:border-0">
                <div className="border-r bg-muted/20 px-4 py-4">
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {groupItems.length} item{groupItems.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div
                  className="relative min-h-24 overflow-hidden"
                  style={{
                    backgroundImage: "linear-gradient(to right,var(--border) 1px,transparent 1px)",
                    backgroundSize: `${100 / range.labels.length}% 100%`,
                  }}
                >
                  <span
                    className="absolute inset-y-0 z-20 w-px bg-health-bad"
                    style={{ left: `${position(todayIso())}%` }}
                  >
                    <span className="absolute left-1 top-1 text-[9px] font-semibold text-health-bad-foreground">
                      Today
                    </span>
                  </span>
                  {zoom === "Year" && (
                    <span
                      className="absolute inset-y-0 border-l-2 border-dashed border-primary/50"
                      style={{ left: `${position(fyStart)}%` }}
                    />
                  )}
                  {roadmap.keyDates.map((date) => (
                    <span
                      key={date.id}
                      className="absolute top-1 z-10 text-primary"
                      style={{ left: `${position(date.date)}%` }}
                      title={`${date.title} · ${formatDate(date.date)}`}
                    >
                      <Flag className="size-4 fill-primary/20" />
                    </span>
                  ))}
                  {groupItems.map((item, index) => {
                    const left = position(item.start),
                      right = position(item.finish),
                      width = Math.max(1.5, right - left);
                    const bar = (
                      <div
                        className={cn(
                          "group absolute flex h-8 min-w-6 items-center overflow-hidden rounded-sm border text-xs font-semibold shadow-sm",
                          item.kind === "Standalone" &&
                            "cursor-grab border-dashed border-foreground/50",
                          statusClass[item.health],
                        )}
                        style={{ left: `${left}%`, width: `${width}%`, top: 30 + index * 38 }}
                        onPointerDown={(event) => beginDrag(event, item, "move")}
                        title={`${item.title} · ${formatDate(item.start)}–${formatDate(item.finish)}`}
                      >
                        <span
                          className="absolute inset-y-0 left-0 bg-background/20"
                          style={{ width: `${item.progress}%` }}
                        />
                        {item.kind === "Standalone" && (
                          <span
                            className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize"
                            onPointerDown={(event) => beginDrag(event, item, "start")}
                          />
                        )}
                        <span className="relative z-10 flex min-w-0 items-center gap-1.5 px-2">
                          {item.kind === "Linked" ? (
                            <LockKeyhole className="size-3 shrink-0" />
                          ) : (
                            <GripVertical className="size-3 shrink-0" />
                          )}
                          <span className="truncate">{item.title}</span>
                          <span className="shrink-0 opacity-75">{item.progress}%</span>
                        </span>
                        {item.kind === "Standalone" && (
                          <span
                            className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize"
                            onPointerDown={(event) => beginDrag(event, item, "finish")}
                          />
                        )}
                      </div>
                    );
                    return item.kind === "Linked" && item.projectId ? (
                      <Link
                        key={item.id}
                        to="/portfolio/projects/$projectCode"
                        params={{ projectCode: item.projectCode ?? "" }}
                      >
                        {bar}
                      </Link>
                    ) : (
                      <div key={item.id}>{bar}</div>
                    );
                  })}
                  <div style={{ height: Math.max(96, 46 + groupItems.length * 38) }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <section className={cn("border-t pt-5", present && "mt-8")}>
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Key dates</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roadmap.keyDates.map((date) => (
            <div
              key={date.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-border/70 bg-card p-4"
            >
              <Flag className="size-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">{date.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(date.date)} · {date.owner}
                </p>
              </div>
              <DeliveryStatusIcon status={date.status} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
