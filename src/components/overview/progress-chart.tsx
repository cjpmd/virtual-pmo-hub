import { useMemo, useState, type KeyboardEvent } from "react";
import { useMeasuredWidth } from "@/components/charts/use-measure";
import { cn } from "@/lib/utils";
import {
  SERIES,
  TABS,
  type ChartRange,
  type ChartTab,
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

/**
 * The overview centrepiece (spec §4 ProgressChart). Every series is % of its own full-year
 * plan on one axis; red risks use a right-hand count axis. Actuals are solid, forecasts
 * dotted in a shaded region after today. Hover or arrow keys move a crosshair.
 */
export function ProgressChart({
  data,
  range,
  onRangeChange,
}: {
  data: ProgressChartData;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
}) {
  const [tab, setTab] = useState<ChartTab>("overlay");
  const [on, setOn] = useState<Set<SeriesKey>>(() => new Set(TABS.overlay.on));
  const [cursor, setCursor] = useState<number | null>(null);
  const { ref, width } = useMeasuredWidth(640);

  const chips = TABS[tab].chips.filter((key) => data.available.has(key));
  const visible = chips.filter((key) => on.has(key));
  const selectTab = (next: ChartTab) => {
    setTab(next);
    setOn(new Set(TABS[next].on));
  };
  const toggle = (key: SeriesKey) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const height = tab === "timeline" ? 340 : 250;
  const showRisks = visible.includes("risks");
  const pad = { top: 26, right: showRisks ? 40 : 14, bottom: 24, left: 38 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const n = data.points.length;
  const x = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.top + (1 - Math.min(100, Math.max(0, v)) / 100) * innerH;
  const riskMax = Math.max(4, ...data.points.map((p) => p.values.risks ?? 0));
  const yRisk = (v: number) => pad.top + (1 - v / riskMax) * innerH;
  const todayIndex = data.points.findIndex((p) => p.month === data.currentMonth);

  const paths = useMemo(() => {
    return visible.map((key) => {
      const scale = key === "risks" ? yRisk : y;
      const segment = (forecast: boolean) => {
        let d = "";
        data.points.forEach((point, i) => {
          const value = point.values[key];
          // The forecast line starts from today's point so the two halves join.
          const include = forecast ? point.forecast || i === todayIndex : !point.forecast;
          if (value === undefined || !include) return;
          d += `${d ? "L" : "M"}${x(i).toFixed(1)},${scale(value).toFixed(1)}`;
        });
        return d;
      };
      return { key, actual: segment(false), forecast: key === "plan" ? "" : segment(true) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scales derive from width/data
  }, [visible.join(), data, width, height, riskMax]);

  const planPath = (key: SeriesKey) => {
    let d = "";
    data.points.forEach((point, i) => {
      const value = point.values[key];
      if (value !== undefined) d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)}`;
    });
    return d;
  };

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
    `Portfolio progress, ${data.points[0]?.label ?? ""} to ${data.points[n - 1]?.label ?? ""}.`,
    ...visible.map((key) => `${SERIES[key].label} ${fmt(key, data.current[key])}`),
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

  return (
    <section
      aria-label="Portfolio progress"
      className="flex min-w-0 flex-col gap-2.5 px-4 py-3.5 font-geist sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Chart view"
          className="flex flex-wrap gap-0.5 rounded-lg bg-pmo-panel-2 p-[3px] text-xs"
        >
          {(Object.keys(TABS) as ChartTab[]).map((key) => (
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
              {TABS[key].label}
            </button>
          ))}
        </div>
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
              {meta.label}
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
              <line
                x1={pad.left}
                x2={pad.left + innerW}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--pmo-line)"
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
            n <= 14 || i % Math.ceil(n / 12) === 0 ? (
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
                y1={pad.top - 4}
                y2={pad.top + innerH}
                stroke="var(--pmo-text)"
                strokeWidth={1}
                opacity={0.6}
              />
              <text
                x={x(todayIndex) + 4}
                y={pad.top + innerH - 4}
                fontSize={10}
                fill="var(--pmo-muted)"
              >
                Today
              </text>
            </g>
          )}
          {visible.includes("plan") && (
            <path
              d={planPath("plan")}
              fill="none"
              stroke={SERIES.plan.colour}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
          )}
          {paths
            .filter((p) => p.key !== "plan")
            .map((p) => {
              const meta = SERIES[p.key];
              return (
                <g key={p.key}>
                  <path
                    d={p.actual}
                    fill="none"
                    stroke={meta.colour}
                    strokeWidth={2}
                    strokeDasharray={meta.dashed ? "5 4" : undefined}
                    strokeLinejoin="round"
                  />
                  {p.forecast && (
                    <path
                      d={p.forecast}
                      fill="none"
                      stroke={meta.colour}
                      strokeWidth={2}
                      strokeDasharray="2 4"
                      strokeLinecap="round"
                      opacity={0.85}
                    />
                  )}
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
          {/* Event markers along the top */}
          {data.markers.map((marker, i) => {
            const index = data.points.findIndex((p) => p.month === marker.month);
            if (index < 0) return null;
            const day = Number(marker.date.slice(8, 10)) / 31;
            const mx = Math.min(
              pad.left + innerW,
              x(index) + (n > 1 ? day * (innerW / (n - 1)) : 0),
            );
            const size = tab === "timeline" ? 6 : 5;
            const kindLabel =
              marker.kind === "committee"
                ? "Committee"
                : marker.kind === "gate"
                  ? "Gate"
                  : "Key milestone";
            return (
              <g
                key={`${marker.label}-${i}`}
                tabIndex={0}
                aria-label={`${kindLabel}: ${marker.label}, ${marker.date}`}
                className="outline-none [&:focus>polygon]:stroke-pmo-text"
              >
                <title>{`${kindLabel}: ${marker.label} (${marker.date.split("-").reverse().join("/")})`}</title>
                <polygon
                  points={`${mx},${12 - size} ${mx + size},12 ${mx},${12 + size} ${mx - size},12`}
                  fill={
                    marker.kind === "committee"
                      ? "var(--pmo-accent)"
                      : marker.kind === "gate"
                        ? "var(--pmo-warn)"
                        : "var(--series-milestones)"
                  }
                  stroke="var(--pmo-panel)"
                  strokeWidth={1}
                />
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
                  {SERIES[key].label}
                </span>
                <span className="font-geist-mono tabular-nums text-pmo-text">
                  {fmt(key, cursorPoint.values[key])}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>Portfolio progress by month, as % of each measure's full-year plan</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            {visible.map((key) => (
              <th key={key} scope="col">
                {SERIES[key].label}
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
    </section>
  );
}
