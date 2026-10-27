import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { area, curveMonotoneX, line } from "d3-shape";
import { useMeasuredWidth } from "@/components/charts/use-measure";
import { clusterMarks } from "@/lib/cluster-marks";
import { cn } from "@/lib/utils";
import {
  PROJECT_TABS,
  SERIES,
  TABS,
  type ChartMarker,
  type ChartRange,
  type ChartTab,
  type ChartTabPreset,
  type ProgressChartData,
  type SeriesKey,
} from "@/services/progress-chart";

const RANGES: Array<{ value: ChartRange; label: string }> = [
  { value: "fy", label: "FY" },
  { value: "12m", label: "12M" },
  { value: "all", label: "All" },
];

const fmt = (key: SeriesKey, value: number | undefined) =>
  value === undefined
    ? "—"
    : SERIES[key].unit === "count"
      ? String(Math.round(value))
      : `${Math.round(value)}%`;

// Monotone in x: a curve never overshoots its data points, so it stays inside 0–100% and
// doesn't invent peaks or loops between months.
const curve = line<[number, number]>().curve(curveMonotoneX);
const dmy = (date: string) => date.split("-").reverse().join("/");
const kindLabel = (kind: ChartMarker["kind"]) =>
  kind === "committee" ? "Committee" : kind === "gate" ? "Gate" : "Key milestone";

/**
 * The overview centrepiece (spec §4 ProgressChart). Every series is % of its own full-year
 * plan on one axis; red risks use a right-hand count axis. Actuals are solid, forecasts
 * dashed in a shaded region after today. Hover or arrow keys move a crosshair.
 */
export function ProgressChart({
  data,
  range = "fy",
  onRangeChange,
  scope = "portfolio",
}: {
  data: ProgressChartData;
  range?: ChartRange;
  onRangeChange?: (range: ChartRange) => void;
  /**
   * project: the project overview's presets (Overlay, Spend, Delivery, Benefits), the
   * project's own window instead of a range switch, and labelled start / gate / finish lines.
   */
  scope?: "portfolio" | "project";
}) {
  const project = scope === "project";
  const tabs: Partial<Record<ChartTab, ChartTabPreset>> = project ? PROJECT_TABS : TABS;
  const [tab, setTab] = useState<ChartTab>("overlay");
  const [on, setOn] = useState<Set<SeriesKey>>(() => new Set(tabs.overlay?.on));
  const [cursor, setCursor] = useState<number | null>(null);
  // The chip or line under the pointer (or focused chip): other series dim.
  const [hovered, setHovered] = useState<SeriesKey | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { ref, width } = useMeasuredWidth(640);

  const labelOf = (key: SeriesKey) =>
    key === "plan" && data.evenPhasing ? "Even phasing (no budget profile)" : SERIES[key].label;
  const chips = (tabs[tab]?.chips ?? []).filter((key) => data.available.has(key));
  const visible = chips.filter((key) => on.has(key));
  const focus = hovered !== null && visible.includes(hovered) ? hovered : null;
  const lead = tabs[tab]?.lead;
  const selectTab = (next: ChartTab) => {
    setTab(next);
    setOn(new Set(tabs[next]?.on));
  };
  const toggle = (key: SeriesKey) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const height = tab === "timeline" ? 340 : project ? 290 : 250;
  const showRisks = visible.includes("risks");
  const pad = { top: project ? 38 : 30, right: showRisks ? 40 : 14, bottom: 24, left: 38 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const n = data.points.length;
  const x = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.top + (1 - Math.min(100, Math.max(0, v)) / 100) * innerH;
  const riskMax = Math.max(4, ...data.points.map((p) => p.values.risks ?? 0));
  const yRisk = (v: number) => pad.top + (1 - v / riskMax) * innerH;
  const todayIndex = data.points.findIndex((p) => p.month === data.currentMonth);

  // Where actual turns into forecast: today's point, else the first forecast month. Each series
  // is one curve clipped either side of this line, so the two halves join exactly and smoothly.
  const firstForecast = data.points.findIndex((p) => p.forecast);
  const splitX = todayIndex >= 0 ? x(todayIndex) : firstForecast >= 0 ? x(firstForecast) : width;

  const paths = useMemo(() => {
    return visible.map((key) => {
      const scale = key === "risks" ? yRisk : y;
      // Months without a value are skipped; the curve bridges them.
      const coords = data.points.flatMap((point, i) => {
        const value = point.values[key];
        return value === undefined ? [] : [[x(i), scale(value)] as [number, number]];
      });
      const fill =
        key === lead ? (area<[number, number]>().curve(curveMonotoneX).y0(y(0))(coords) ?? "") : "";
      return { key, d: curve(coords) ?? "", fill };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scales derive from width/data
  }, [visible.join(), data, width, height, riskMax, lead]);

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      setCursor((prev) => Math.min(n - 1, Math.max(0, (prev ?? Math.max(0, todayIndex)) + step)));
    } else if (event.key === "Escape") setCursor(null);
  };
  const onMove = (clientX: number, rect: DOMRect) => {
    const rel = clientX - rect.left - pad.left;
    setCursor(Math.min(n - 1, Math.max(0, Math.round((rel / innerW) * (n - 1)))));
  };

  const spendNow = data.current.spend,
    milestonesNow = data.current.milestones;
  const summary = [
    `${project ? "Project" : "Portfolio"} progress, ${data.points[0]?.label ?? ""} to ${data.points[n - 1]?.label ?? ""}.`,
    ...visible.map((key) => `${labelOf(key)} ${fmt(key, data.current[key])}`),
    data.gap !== null ? `Spend leads milestones by ${data.gap} points.` : "",
  ]
    .filter(Boolean)
    .join(". ");
  const showGap =
    data.gap !== null &&
    todayIndex >= 0 &&
    visible.includes("spend") &&
    visible.includes("milestones");
  const cursorPoint = cursor === null ? null : data.points[cursor];
  // Month labels: every one up to 14 months (12 beyond), thinned further when they'd collide.
  const labelEvery = Math.max(
    n <= 14 ? 1 : Math.ceil(n / 12),
    Math.ceil(n / Math.max(1, Math.floor(innerW / 44))),
  );
  const markerX = (marker: ProgressChartData["markers"][number]) => {
    const index = data.points.findIndex((p) => p.month === marker.month);
    if (index < 0) return null;
    const day = Number(marker.date.slice(8, 10)) / 31;
    return Math.min(pad.left + innerW, x(index) + (n > 1 ? day * (innerW / (n - 1)) : 0));
  };
  // Markers less than 8px apart merge into one, listing every marker in its tooltip.
  const markClusters = clusterMarks(
    data.markers.flatMap((marker) => {
      const mx = markerX(marker);
      return mx === null ? [] : [{ x: mx, item: marker }];
    }),
  );
  // Project scope: every marker is a labelled dotted line ("Gate 2 +1" when merged); labels take
  // the first of two rows where they don't overlap the previous label (otherwise only the line
  // and its tooltip show).
  const projectMarks = project
    ? (() => {
        const rowEnd = [-Infinity, -Infinity];
        return markClusters.map(({ x: mx, items }) => {
          const label = `${items[0]?.label ?? ""}${items.length > 1 ? ` +${items.length - 1}` : ""}`;
          const w = label.length * 5.6;
          const start = Math.max(pad.left, Math.min(mx - w / 2, pad.left + innerW - w));
          const row = rowEnd.findIndex((end) => start > end + 6);
          if (row >= 0) rowEnd[row] = start + w;
          return { items, label, mx, row, start };
        });
      })()
    : [];

  return (
    <section
      aria-label={project ? "Project progress" : "Portfolio progress"}
      className="flex min-w-0 flex-col gap-2.5 px-4 py-3.5 font-geist sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {project && (
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-pmo-text">Progress against plan</h2>
            <p className="text-[12.5px] text-pmo-muted">
              Every line is a percentage of its own total plan. Solid is actual, dashed is forecast.
            </p>
          </div>
        )}
        <div
          role="tablist"
          aria-label="Chart view"
          className="flex flex-wrap gap-0.5 rounded-lg bg-pmo-panel-2 p-[3px] text-xs"
        >
          {(Object.keys(tabs) as ChartTab[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => selectTab(key)}
              className={cn(
                "min-h-7 rounded-md px-2.5",
                tab === key
                  ? "bg-pmo-accent font-semibold text-primary-foreground"
                  : "text-pmo-muted hover:text-pmo-text",
              )}
            >
              {tabs[key]?.label}
            </button>
          ))}
        </div>
        {!project && onRangeChange && (
          <div role="group" aria-label="Range" className="flex gap-0.5 text-xs">
            {RANGES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={range === item.value}
                onClick={() => onRangeChange(item.value)}
                className={cn(
                  "min-h-7 rounded-md px-2",
                  range === item.value
                    ? "bg-pmo-panel-2 text-pmo-text"
                    : "text-pmo-muted hover:text-pmo-text",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((key) => {
          const meta = SERIES[key];
          const pressed = on.has(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={pressed}
              onClick={() => toggle(key)}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(key)}
              onBlur={() => setHovered(null)}
              className={cn(
                "inline-flex min-h-[30px] items-center gap-[7px] rounded-full border px-2.5 text-xs",
                pressed
                  ? "border-pmo-line bg-pmo-panel-2 text-pmo-text"
                  : "border-dashed border-pmo-line text-pmo-muted",
              )}
            >
              <span
                aria-hidden
                className="w-3.5"
                style={
                  meta.dashed
                    ? { borderTop: `2px dashed ${meta.colour}` }
                    : { height: 2, background: meta.colour }
                }
              />
              {labelOf(key)}
              <span className="font-geist-mono tabular-nums">
                {key === "plan" ? fmt(key, data.current.plan) : fmt(key, data.current[key])}
              </span>
            </button>
          );
        })}
        {!chips.length && <p className="text-xs text-pmo-muted">No data for this view yet.</p>}
      </div>

      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={onKey}
          onMouseMove={(event) =>
            onMove(event.clientX, event.currentTarget.getBoundingClientRect())
          }
          onMouseLeave={() => setCursor(null)}
          onBlur={() => setCursor(null)}
          className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-pmo-accent"
        >
          {/* Forecast region */}
          {todayIndex >= 0 && todayIndex < n - 1 && (
            <rect
              x={x(todayIndex)}
              y={pad.top}
              width={x(n - 1) - x(todayIndex)}
              height={innerH}
              fill="var(--pmo-panel-2)"
              opacity={0.5}
            />
          )}
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              {/* 0% is the axis line, drawn once at full strength; the gridlines are faint. */}
              <line
                x1={pad.left}
                x2={pad.left + innerW}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--pmo-line)"
                opacity={tick === 0 ? 1 : 0.5}
                shapeRendering="crispEdges"
              />
              <text
                x={pad.left - 6}
                y={y(tick) + 3}
                textAnchor="end"
                fontSize={10}
                fill="var(--pmo-muted)"
                className="font-geist-mono tabular-nums"
              >
                {tick}%
              </text>
            </g>
          ))}
          {showRisks &&
            [0, riskMax / 2, riskMax].map((tick) => (
              <text
                key={tick}
                x={pad.left + innerW + 6}
                y={yRisk(tick) + 3}
                fontSize={10}
                fill="var(--pmo-bad)"
                className="font-geist-mono tabular-nums"
              >
                {Math.round(tick)}
              </text>
            ))}
          {data.points.map((point, i) =>
            i % labelEvery === 0 ? (
              <text
                key={point.month}
                x={x(i)}
                y={height - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--pmo-muted)"
              >
                {point.label}
              </text>
            ) : null,
          )}
          {/* Today line */}
          {todayIndex >= 0 && (
            <g>
              <line
                x1={x(todayIndex)}
                x2={x(todayIndex)}
                y1={pad.top}
                y2={pad.top + innerH}
                stroke="var(--pmo-text)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.6}
              />
              <text
                x={x(todayIndex)}
                y={pad.top - 4}
                textAnchor="middle"
                fontSize={10}
                fill="var(--pmo-muted)"
              >
                Today
              </text>
            </g>
          )}
          <defs>
            <clipPath id={`${uid}-actual`}>
              <rect x={0} y={0} width={Math.max(0, splitX)} height={height} />
            </clipPath>
            <clipPath id={`${uid}-forecast`}>
              <rect x={splitX} y={0} width={Math.max(0, width - splitX)} height={height} />
            </clipPath>
            {lead && (
              <linearGradient id={`${uid}-lead`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[lead].colour} stopOpacity="0.28" />
                <stop offset="100%" stopColor={SERIES[lead].colour} stopOpacity="0.02" />
              </linearGradient>
            )}
          </defs>
          {/* The tab's lead series: a soft fill under its actual period, below every line. */}
          {paths
            .filter((p) => p.fill)
            .map((p) => (
              <path
                key={`${p.key}-fill`}
                d={p.fill}
                fill={`url(#${uid}-lead)`}
                clipPath={`url(#${uid}-actual)`}
                opacity={focus && focus !== p.key ? 0.35 : 1}
              />
            ))}
          {paths.map((p) => {
            const meta = SERIES[p.key];
            // Series dashed already (plan, % green) keep their dash in the forecast; the lower
            // opacity and the shaded region set it apart.
            const dash = meta.dashed ? "5 4" : undefined;
            return (
              <g key={p.key} opacity={focus && focus !== p.key ? 0.35 : 1}>
                {p.key === "plan" ? (
                  <path
                    d={p.d}
                    fill="none"
                    stroke={meta.colour}
                    strokeWidth={1.5}
                    strokeDasharray={dash}
                    shapeRendering="geometricPrecision"
                  />
                ) : (
                  <>
                    <path
                      d={p.d}
                      fill="none"
                      stroke={meta.colour}
                      strokeWidth={2.25}
                      strokeDasharray={dash}
                      strokeLinejoin="round"
                      clipPath={`url(#${uid}-actual)`}
                      shapeRendering="geometricPrecision"
                    />
                    <path
                      d={p.d}
                      fill="none"
                      stroke={meta.colour}
                      strokeWidth={1.75}
                      strokeDasharray={dash ?? "6 5"}
                      strokeLinecap="butt"
                      opacity={0.55}
                      clipPath={`url(#${uid}-forecast)`}
                      shapeRendering="geometricPrecision"
                    />
                  </>
                )}
                {/* A wider invisible stroke, so the line is easy to point at. */}
                <path
                  d={p.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={10}
                  pointerEvents="stroke"
                  onMouseEnter={() => setHovered(p.key)}
                  onMouseLeave={() => setHovered(null)}
                />
              </g>
            );
          })}
          {/* Gap callout: spend leads milestones by more than 15 points. */}
          {showGap && spendNow !== undefined && milestonesNow !== undefined && (
            <g aria-hidden>
              <path
                d={`M${x(todayIndex) - 8},${y(spendNow)} h-6 V${y(milestonesNow)} h6`}
                fill="none"
                stroke="var(--pmo-bad)"
                strokeWidth={1.5}
              />
              <text
                x={x(todayIndex) - 18}
                y={(y(spendNow) + y(milestonesNow)) / 2 + 3}
                textAnchor="end"
                fontSize={11}
                fontWeight={600}
                fill="var(--pmo-bad-text)"
                className="font-geist-mono tabular-nums"
              >
                {data.gap} pts gap
              </text>
            </g>
          )}
          {/* Project: labelled lines for start, gates, baseline and forecast finish */}
          {projectMarks.map(({ items, label, mx, row, start }, i) => (
            <g
              key={`${label}-${i}`}
              tabIndex={0}
              aria-label={items.map((marker) => `${marker.label}, ${marker.date}`).join("; ")}
              className="outline-none [&:focus>line]:stroke-pmo-accent [&:focus>line]:[stroke-dasharray:none] [&:focus>line]:[stroke-width:2] [&:focus>text]:fill-pmo-text [&:focus>text]:font-semibold"
            >
              <title>
                {items.map((marker) => `${marker.label} (${dmy(marker.date)})`).join("\n")}
              </title>
              <line
                x1={mx}
                x2={mx}
                y1={pad.top - 6}
                y2={pad.top + innerH}
                stroke="var(--pmo-muted)"
                strokeDasharray="1 3"
              />
              {row >= 0 && (
                <text x={start} y={12 + row * 12} fontSize={10.5} fill="var(--pmo-muted)">
                  {label}
                </text>
              )}
            </g>
          ))}
          {/* Event markers along the top */}
          {(project ? [] : markClusters).map(({ x: mx, items }, i) => {
            const size = tab === "timeline" ? 6 : 5;
            // A merged marker takes the colour of its most significant kind.
            const kind = items.some((m) => m.kind === "committee")
              ? "committee"
              : items.some((m) => m.kind === "gate")
                ? "gate"
                : "milestone";
            return (
              <g
                key={`${items[0]?.label}-${i}`}
                tabIndex={0}
                aria-label={`${items.length > 1 ? `${items.length} markers: ` : ""}${items
                  .map((m) => `${kindLabel(m.kind)}: ${m.label}, ${m.date}`)
                  .join("; ")}`}
                className="outline-none [&:focus>polygon]:stroke-pmo-text"
              >
                <title>
                  {items.map((m) => `${kindLabel(m.kind)}: ${m.label} (${dmy(m.date)})`).join("\n")}
                </title>
                <polygon
                  points={`${mx},${12 - size} ${mx + size},12 ${mx},${12 + size} ${mx - size},12`}
                  fill={
                    kind === "committee"
                      ? "var(--pmo-accent)"
                      : kind === "gate"
                        ? "var(--pmo-warn)"
                        : "var(--series-milestones)"
                  }
                  stroke="var(--pmo-panel)"
                  strokeWidth={1}
                />
                {items.length > 1 && (
                  <text
                    x={mx + size + 2}
                    y={15.5}
                    fontSize={9.5}
                    fill="var(--pmo-muted)"
                    className="font-geist-mono tabular-nums"
                  >
                    {items.length}
                  </text>
                )}
                {tab === "timeline" && (
                  <line
                    x1={mx}
                    x2={mx}
                    y1={18}
                    y2={pad.top + innerH}
                    stroke="var(--pmo-line)"
                    strokeDasharray="2 3"
                  />
                )}
              </g>
            );
          })}
          {/* Crosshair */}
          {cursorPoint && cursor !== null && (
            <line
              x1={x(cursor)}
              x2={x(cursor)}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke="var(--pmo-muted)"
              strokeDasharray="3 3"
            />
          )}
          {cursorPoint &&
            cursor !== null &&
            visible.map((key) => {
              const value = cursorPoint.values[key];
              if (value === undefined) return null;
              return (
                <circle
                  key={key}
                  cx={x(cursor)}
                  cy={key === "risks" ? yRisk(value) : y(value)}
                  r={3.5}
                  fill={SERIES[key].colour}
                  stroke="var(--pmo-panel)"
                  strokeWidth={1.5}
                />
              );
            })}
        </svg>
        {cursorPoint && cursor !== null && (
          <div
            aria-live="polite"
            className="pointer-events-none absolute top-6 z-10 min-w-40 rounded-md border border-pmo-line bg-pmo-panel px-3 py-2 text-xs shadow-lg"
            style={
              x(cursor) > width / 2 ? { right: width - x(cursor) + 10 } : { left: x(cursor) + 10 }
            }
          >
            <p className="mb-1 font-semibold text-pmo-text">
              {cursorPoint.label}
              {cursorPoint.forecast ? " · forecast" : ""}
            </p>
            {visible.map((key) => (
              <p key={key} className="flex items-center justify-between gap-4 text-pmo-muted">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: SERIES[key].colour }}
                  />
                  {labelOf(key)}
                </span>
                <span className="font-geist-mono tabular-nums text-pmo-text">
                  {fmt(key, cursorPoint.values[key])}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      {project && (
        <p className="text-xs text-pmo-muted">
          {data.gap !== null
            ? `Spend is running ${data.gap} points ahead of delivery (milestones delivered). `
            : ""}
          Gates and finish dates are marked along the top.
        </p>
      )}
      {/* A table can't shrink to sr-only's 1px, so the wrapper hides it (no sideways scroll). */}
      <div className="sr-only">
        <table>
          <caption>
            {project
              ? "Project progress by month, as % of each measure's total plan"
              : "Portfolio progress by month, as % of each measure's full-year plan"}
          </caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              {visible.map((key) => (
                <th key={key} scope="col">
                  {labelOf(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.points.map((point) => (
              <tr key={point.month}>
                <th scope="row">
                  {point.label}
                  {point.forecast ? " (forecast)" : ""}
                </th>
                {visible.map((key) => (
                  <td key={key}>{fmt(key, point.values[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
