import { useMemo } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { SmallMultiples } from "@/components/charts/plots";
import { getDimensionScores, scoreColour } from "@/services/analytics";
import type { ProjectSummary } from "@/services/hierarchy";
import type { ProjectSnapshot } from "@/services/trends";
import type { Health } from "@/data/types";
import { useFormat } from "@/lib/format";
import {
  HEALTH_DIMENSIONS,
  type HealthDimension,
  type ProjectHealthMonth,
} from "@/services/project-overview";
import { dimensionSeries } from "@/services/project-schedule";

type Props =
  | {
      scope?: "portfolio";
      active: ProjectSummary[];
      projectHistory: ProjectSnapshot[];
      /** Live % of active projects green, for the Overall caption. */
      percentOnTrack: number;
      className?: string | undefined;
    }
  | {
      scope: "project";
      /** Month-end snapshots from the project's start, with the declared ratings then. */
      months: ProjectHealthMonth[];
      /** Current evidenced health (project_health_current), shown top right. */
      current: Record<HealthDimension, Health>;
      startDate: string | null;
      /** Closed projects with no snapshots say so instead of "History starts". */
      closed?: boolean | undefined;
      className?: string | undefined;
    };

/**
 * Health by dimension, one small plot each (portfolio spec §4). Portfolio: share of active
 * projects green. Project: the evidenced RAG at each month-end.
 */
export function HealthByDimension(props: Props) {
  return props.scope === "project" ? (
    <ProjectHealthByDimension {...props} />
  ) : (
    <PortfolioHealthByDimension
      active={props.active}
      projectHistory={props.projectHistory}
      percentOnTrack={props.percentOnTrack}
      className={props.className}
    />
  );
}

const LABEL: Record<HealthDimension, string> = {
  schedule: "Schedule",
  financial: "Financial",
  effort: "Effort",
  issue: "Issues and risks",
  benefit: "Benefits",
  overall: "Overall",
};
const WORD: Record<Health, string> = {
  "On Track": "Green",
  "At Risk": "Amber",
  "Off Track": "Red",
  "Not Set": "Not set",
};
const COLOUR: Record<Health, string> = {
  "On Track": "var(--viz-good)",
  "At Risk": "var(--viz-warning)",
  "Off Track": "var(--viz-critical)",
  "Not Set": "var(--viz-ink-muted)",
};
/** Text-safe colours for the status words (the marks keep the chart colours). */
const TEXT: Record<Health, string> = {
  "On Track": "var(--health-good-foreground)",
  "At Risk": "var(--health-warn-foreground)",
  "Off Track": "var(--health-bad-foreground)",
  "Not Set": "var(--muted-foreground)",
};
const LEVEL: Record<Health, number> = {
  "On Track": 0,
  "At Risk": 1,
  "Off Track": 2,
  "Not Set": -1,
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthWord = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1] ?? ""} ${ym.slice(2, 4)}`;

function ProjectHealthByDimension({
  months,
  current,
  startDate,
  closed,
  className,
}: Extract<Props, { scope: "project" }>) {
  const format = useFormat();
  const series = useMemo(() => dimensionSeries(months, HEALTH_DIMENSIONS), [months]);
  const W = 220,
    H = 56,
    pad = 7;
  const n = months.length;
  const x = (i: number) => (n > 1 ? pad + (i * (W - 2 * pad)) / (n - 1) : W / 2);
  const y = (h: Health) => 8 + LEVEL[h] * ((H - 16) / 2);
  const first = months[0];
  const sample = months.some((m) => m.source === "seed");
  const startsLate =
    first && startDate && first.month > startDate.slice(0, 7) ? first.snapshotDate : null;
  const span = first
    ? `${monthWord(first.month)} to ${monthWord(months[n - 1]?.month ?? first.month)}`
    : "";
  return (
    <ChartCard
      className={className}
      title="Health by dimension"
      subtitle={
        n ? `Evidenced health at each month-end, ${span}` : "Evidenced health at each month-end"
      }
      info="Evidenced health at each month-end, from health snapshots. Higher is better: green at the top, red at the bottom. A ring marks a month where the status report current at that month-end declared better than the evidence."
      footer={
        <span className="space-y-1">
          <span className="block">
            Rings mark months where the status report declared better than the evidence. Overall is
            the worst of the five dimensions.
          </span>
          {sample ? (
            <span className="block">Earlier months are sample data (lighter dots).</span>
          ) : null}
          {startsLate ? (
            <span className="block">History starts {format.date(startsLate)}.</span>
          ) : null}
        </span>
      }
      empty={
        n
          ? undefined
          : {
              title: closed
                ? "No health history"
                : startDate
                  ? `History starts ${format.date(startDate)}`
                  : "No health history yet",
              detail: closed
                ? "No month-end snapshots were taken while this project was open."
                : "Month-end health appears here after the first nightly snapshot.",
            }
      }
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-6">
        {series.map((s) => {
          const now = current[s.key];
          const rated = s.points.map((p, i) => ({ ...p, i })).filter((p) => p.health !== "Not Set");
          return (
            <figure key={s.key} className="m-0">
              <figcaption className="mb-1.5 flex items-baseline justify-between text-[13px]">
                <span className={s.key === "overall" ? "font-semibold" : "font-medium"}>
                  {LABEL[s.key]}
                </span>
                <span className="text-xs font-semibold" style={{ color: TEXT[now] }}>
                  {WORD[now]}
                </span>
              </figcaption>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="block h-auto w-full overflow-visible"
                role="img"
                aria-label={`${LABEL[s.key]}: ${s.points
                  .map(
                    (p) =>
                      `${monthWord(p.month)} ${WORD[p.health]}${p.declaredBetter ? " (declared better)" : ""}${p.sample ? " (sample)" : ""}`,
                  )
                  .join(", ")}`}
              >
                {[0, 1, 2].map((level) => (
                  <line
                    key={level}
                    x1={0}
                    x2={W}
                    y1={8 + level * ((H - 16) / 2)}
                    y2={8 + level * ((H - 16) / 2)}
                    stroke="var(--viz-grid)"
                    strokeDasharray={level === 2 ? undefined : "2 3"}
                  />
                ))}
                {rated.slice(1).map((p, j) => {
                  const prev = rated[j] as (typeof rated)[number];
                  return (
                    <line
                      key={p.month}
                      x1={x(prev.i)}
                      y1={y(prev.health)}
                      x2={x(p.i)}
                      y2={y(p.health)}
                      stroke={COLOUR[p.health]}
                      strokeWidth={1.8}
                      opacity={p.sample ? 0.45 : 1}
                    />
                  );
                })}
                {rated.map((p) => (
                  <g key={p.month} opacity={p.sample ? 0.45 : 1}>
                    <title>{`${monthWord(p.month)}: ${WORD[p.health]}${p.declaredBetter ? ", declared better" : ""}${p.sample ? " (sample data)" : ""}`}</title>
                    <circle
                      cx={x(p.i)}
                      cy={y(p.health)}
                      r={p.i === n - 1 ? 3.6 : 2.8}
                      fill={COLOUR[p.health]}
                    />
                    {p.declaredBetter ? (
                      <circle
                        cx={x(p.i)}
                        cy={y(p.health)}
                        r={6.2}
                        fill="none"
                        stroke={COLOUR[p.health]}
                        strokeWidth={1.4}
                      />
                    ) : null}
                  </g>
                ))}
              </svg>
              <small className="mt-1 block text-[11.5px] text-muted-foreground">
                {s.declaredBetter
                  ? `Declared better in ${s.declaredBetter} of ${s.rated} months`
                  : "Report matched evidence"}
              </small>
            </figure>
          );
        })}
      </div>
    </ChartCard>
  );
}

function PortfolioHealthByDimension({
  active,
  projectHistory,
  percentOnTrack,
  className,
}: {
  active: ProjectSummary[];
  projectHistory: ProjectSnapshot[];
  percentOnTrack: number;
  className?: string | undefined;
}) {
  const {
    periods: dimensionPeriods,
    scores: dimensions,
    overall: overallTrend,
  } = useMemo(() => getDimensionScores(active, projectHistory), [active, projectHistory]);
  return (
    <ChartCard
      className={className}
      title="Health by dimension"
      subtitle="Share of active projects reporting green"
      info="Each dimension is scored independently, so a portfolio that is amber overall can still be green on cost. One plot per dimension keeps the scales comparable."
      csv={{
        name: "health-dimensions",
        columns: ["Dimension", ...dimensionPeriods],
        rows: dimensions.map((dimension) => [dimension.label, ...dimension.trend.points]),
      }}
      footer={`Worst-of across these five dimensions sets each project's overall health. ${
        dimensions
          .filter((dimension) => dimension.scored < dimension.total)
          .map(
            (dimension) =>
              `${dimension.label} is scored on ${dimension.scored} of ${dimension.total}`,
          )
          .join("; ") || "Every dimension is scored on all active projects"
      }.`}
    >
      <SmallMultiples
        className="xl:grid-cols-2"
        domain={[0, 100]}
        series={[
          ...dimensions.map((dimension) => ({
            key: dimension.key,
            label: dimension.label,
            caption: `${dimension.percent}%`,
            captionTone: scoreColour(dimension.percent),
            valueLabel: "Projects green",
            format: (value: number) => `${value}%`,
            points: dimension.trend.points.map((value, index) => ({
              label: dimensionPeriods[index] ?? "",
              value,
              colour: scoreColour(value),
            })),
          })),
          {
            key: "overall",
            label: "Overall",
            caption: `${percentOnTrack}%`,
            captionTone: scoreColour(percentOnTrack),
            valueLabel: "Projects green",
            format: (value: number) => `${value}%`,
            points: overallTrend.points.map((value, index) => ({
              label: dimensionPeriods[index] ?? "",
              value,
              colour: scoreColour(value),
            })),
          },
        ]}
      />
    </ChartCard>
  );
}
